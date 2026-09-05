import {
  inferPlaceKind,
  isZeroOrPlaceholderPrice,
  isValidExtractedPriceCandidate,
  mergeCapturedPlaceResearch,
  normalizeObservedPrice,
  type PlannerTripPlace,
} from '../domain/planner';
import type { CurrentResearchPlace } from './content';
import { cleanTitleForSearch, extractFeatureIdFromUrl } from './utils';
export { cleanTitleForSearch };
import { logger } from './logger';
import {
  extractGoogleMapsPreviewFacts,
  extractGoogleMapsResearchFromHtml,
  featureIdToCid,
  googleMapsDetailUrlFromSourceId,
  googleMapsPreviewPlaceUrl,
  googleMapsSearchTbmUrl,
  type GoogleMapsResearchFacts,
} from './google-maps-research';

export interface EnrichmentResult {
  place: PlannerTripPlace;
  enriched: boolean;
  error?: string;
}

const failedResolveCache = new Map<string, number>();
const FAILED_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Determines whether a candidate place is missing essential objective facts.
 */
export function isCandidateMissingData(place: PlannerTripPlace): boolean {
  const hasCorruptedPrice = Boolean(place.observed_price && (!isValidExtractedPriceCandidate(place.observed_price) || isZeroOrPlaceholderPrice(place.observed_price)));
  return (
    !place.source_place_id ||
    place.observed_rating === undefined ||
    place.observed_review_count === undefined ||
    hasCorruptedPrice ||
    !place.source_category ||
    !place.address ||
    !place.coordinates
  );
}

/**
 * Enriches a single place by fetching research metadata (Google Maps JSON-LD / HTML).
 * Respects state authority: ONLY writes objective facts (source_category, types, observed_*, address, coords, hours, phone, plus_code, menu_url, reservation_url).
 * NEVER mutates Planner-owned decisions (kind, priority, signals, risks, tags, notes).
 */
export async function enrichPlaceMetadata(
  place: PlannerTripPlace,
  options?: { signal?: AbortSignal; force?: boolean }
): Promise<EnrichmentResult> {
  if (!options?.force && !isCandidateMissingData(place)) {
    return { place, enriched: false };
  }

  const next: PlannerTripPlace = { ...place };
  let mutated = false;

  // 1. Resolve identity only from already captured provider evidence; never search by title
  let resolvedFeatureId = next.source_place_id;
  if (!resolvedFeatureId || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(resolvedFeatureId.trim())) {
    if (next.source_url) {
      const fromUrl = extractFeatureIdFromUrl(next.source_url);
      if (fromUrl) resolvedFeatureId = fromUrl;
    }
  }

  // 1.5 If feature ID is still missing (e.g. search/?query=... pin), resolve it via Google Maps search HTML/JSON
  // Two-hop: search page -> extract ChIJ/0x -> preview. Prevent empty {} infinite loop + slow multi-round.
  if (!resolvedFeatureId || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(resolvedFeatureId.trim())) {
    const cacheKey = `${next.source_place_id || next.source_url || next.title}`;
    const lastFail = failedResolveCache.get(cacheKey);
    if (lastFail && Date.now() - lastFail < FAILED_COOLDOWN_MS) {
      logger.debug('BackgroundEnrich', `Skip recently failed query pin: ${next.title}`);
      return { place: next, enriched: false, error: 'Recently failed, cooldown' };
    }
    const cleanSearchQuery = cleanTitleForSearch(next.title) + (next.address ? ' ' + next.address : '');
    const candidates: string[] = [];
    // 0. Google Search tbm=map API (fast, returns structured entities with Place IDs & facts directly)
    candidates.push(googleMapsSearchTbmUrl(cleanSearchQuery));
    if (next.source_url?.includes('/maps/search/')) candidates.push(next.source_url);
    // 1. Lat/Lng targeted place link (direct 302s to single entity page)
    if (next.coordinates) {
      candidates.push(`https://www.google.com/maps/place/${encodeURIComponent(cleanTitleForSearch(next.title))}/@${next.coordinates.lat},${next.coordinates.lng},17z?hl=zh-CN`);
      candidates.push(`https://www.google.com/maps/search/${encodeURIComponent(cleanTitleForSearch(next.title))}/@${next.coordinates.lat},${next.coordinates.lng},14z?hl=zh-CN`);
    }
    // 2. Desktop query search (renders APP_INITIALIZATION_STATE with entities)
    candidates.push(`https://www.google.com/maps/search/${encodeURIComponent(cleanSearchQuery)}?hl=zh-CN`);
    // 3. Fallback: query API search
    candidates.push(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanSearchQuery)}&hl=zh-CN`);
    if (!next.coordinates) {
      candidates.push(`https://www.google.com/maps/search/${encodeURIComponent(cleanTitleForSearch(next.title))}?hl=zh-CN`);
    }

    let resolvedFromSearch = false;
    for (const searchUrl of candidates) {
      try {
        logger.fetch('BackgroundEnrich', `Step 1: Resolving query pin for ${next.title}`, { searchUrl });
        const res = await fetch(searchUrl, { credentials: 'include', signal: options?.signal });
        if (!res.ok) continue;
        // B→A: finalUrl often already contains 0x/ChIJ after redirect — prefer it over HTML scan
        const finalUrl = res.url || searchUrl;
        const urlId = extractFeatureIdFromUrl(finalUrl) || /ChIJ[A-Za-z0-9_-]{15,}/.exec(finalUrl)?.[0] || null;
        if (urlId) logger.debug('BackgroundEnrich', `Search res.url has id for ${next.title}`, { finalUrl: finalUrl.slice(0, 180), urlId });
        if (finalUrl.includes('/maps/place/') || finalUrl.includes('?cid=')) {
          next.source_url = finalUrl;
          mutated = true;
        }
        const rawText = (await res.text()).slice(0, 3_000_000);
        let facts: GoogleMapsResearchFacts = {};
        if (rawText.startsWith(")]}'")) {
          try {
            const clean = rawText.replace(/^\)\]\}'\s*/, '');
            const parsed = JSON.parse(clean);
            facts = extractGoogleMapsPreviewFacts(parsed);
          } catch {}
        }
        if (!facts.sourcePlaceId && !facts.coordinates && !facts.category) {
          const htmlFacts = extractGoogleMapsResearchFromHtml(rawText);
          facts = { ...htmlFacts, ...facts };
        }

        // Direct ChIJ / 0x extraction before HTML parser (skeleton pages have them in APP_INITIALIZATION_STATE)
        const chijMatch = /"(ChIJ[A-Za-z0-9_-]{15,})"/.exec(rawText)?.[1];
        const featureMatch = /0x[0-9a-f]+:0x[0-9a-f]+/i.exec(rawText)?.[0];
        const candidateId = urlId || facts.sourcePlaceId || chijMatch || featureMatch;
        if (candidateId) {
          // Prefer 0x for preview; keep ChIJ as source_place_id if only ChIJ found (preview supports ChIJ via query_place_id)
          if (/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(candidateId)) resolvedFeatureId = candidateId;
          else if (/^ChIJ/.test(candidateId)) resolvedFeatureId = candidateId;
          if (resolvedFeatureId) {
            next.source_place_id = resolvedFeatureId;
            mutated = true;
            resolvedFromSearch = true;
          }
        }
        // Merge any facts even if ID still missing (at least give address/coords to avoid re-queue)
        if (facts.rating !== undefined) { next.observed_rating = facts.rating; mutated = true; }
        if (facts.reviewCount !== undefined) { next.observed_review_count = facts.reviewCount; mutated = true; }
        if (facts.category) { next.source_category = facts.category; mutated = true; }
        if (facts.address) { next.address = facts.address; mutated = true; }
        if (facts.phone) { next.phone = facts.phone; mutated = true; }
        if (facts.coordinates) { next.coordinates = facts.coordinates; mutated = true; }
        if (facts.plus_code) { next.plus_code = facts.plus_code; mutated = true; }
        if (facts.open_hours) { next.open_hours = facts.open_hours; mutated = true; }
        if (facts.priceLevel && !isZeroOrPlaceholderPrice(facts.priceLevel)) {
          next.observed_price = facts.priceLevel;
          const normalized = normalizeObservedPrice(facts.priceLevel, facts.priceCurrency);
          if (normalized?.min !== undefined) next.price_min = normalized.min;
          if (normalized?.max !== undefined) next.price_max = normalized.max;
          if (normalized?.currency) next.price_currency = normalized.currency;
          if (normalized?.level !== undefined) next.price_level = normalized.level;
          if (normalized?.unit) next.price_unit = normalized.unit;
          mutated = true;
        }
        if (resolvedFromSearch) break;
        // If we got coordinates/category, stop trying further search URLs
        if (facts.coordinates || facts.category) break;
      } catch (err) {
        logger.warn('BackgroundEnrich', `Query resolution failed for ${next.title}`, err instanceof Error ? err.message : String(err));
      }
    }
    // If still no ID and no facts, do not loop forever: mark as non-retryable this run + cooldown
    if (!resolvedFromSearch && !mutated) {
      failedResolveCache.set(cacheKey, Date.now());
      logger.warn('BackgroundEnrich', `Query pin unresolved (cooldown 15m): ${next.title}`);
    } else if (resolvedFromSearch || mutated) {
      failedResolveCache.delete(cacheKey);
    }
  }

  // 2. With a verified Google feature id, fetch structured preview facts
  if (resolvedFeatureId && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(resolvedFeatureId.trim())) {
    const previewUrl = googleMapsPreviewPlaceUrl(resolvedFeatureId);
    if (previewUrl) {
      logger.fetch('BackgroundEnrich', `Step 2: Fetching facts for ${next.title}`, { previewUrl, sourcePlaceId: resolvedFeatureId });
      try {
        const res = await fetch(previewUrl, {
          credentials: 'include',
          signal: options?.signal,
        });
        if (res.ok) {
          const raw = await res.text();
          const clean = raw.replace(/^\)\]\}'\s*/, '');
          const data = JSON.parse(clean);
          const facts = extractGoogleMapsPreviewFacts(data);
          logger.parser('BackgroundEnrich', `Step 2 Parsed facts for ${next.title}`, facts);

          if (!next.source_place_id || next.source_place_id !== resolvedFeatureId) {
            next.source_place_id = resolvedFeatureId;
            mutated = true;
          }
          // Canonicalize source_url to native CID link if it was a plain search query
          const cid = featureIdToCid(resolvedFeatureId);
          if (cid && (!next.source_url || next.source_url.includes('/maps/search/'))) {
            next.source_url = `https://www.google.com/maps?cid=${cid}`;
            mutated = true;
          }

          if (facts.rating !== undefined) {
            next.observed_rating = facts.rating;
            mutated = true;
          }
          if (facts.reviewCount !== undefined) {
            next.observed_review_count = facts.reviewCount;
            mutated = true;
          }
          if (facts.category) {
            next.source_category = facts.category;
            mutated = true;
          }
          if (facts.address) {
            next.address = facts.address;
            mutated = true;
          }
          if (facts.phone) {
            next.phone = facts.phone;
            mutated = true;
          }
          if (facts.coordinates) {
            next.coordinates = facts.coordinates;
            mutated = true;
          }
          if (facts.types && facts.types.length > 0) {
            const existingTypes = next.types ?? [];
            const mergedTypes = [...new Set([...existingTypes, ...facts.types])];
            if (mergedTypes.length !== existingTypes.length) {
              next.types = mergedTypes;
              mutated = true;
            }
          }
          if (facts.category || (facts.types && facts.types.length > 0)) {
            const freshKind = facts.category
              ? inferPlaceKind(facts.category)
              : inferPlaceKind([next.title, ...(facts.types || [])].filter(Boolean).join(' '));
            if (freshKind && freshKind !== 'other' && (next.kind === 'other' || freshKind !== next.kind)) {
              next.kind = freshKind;
              mutated = true;
            }
          }
          const COUNTRY_TO_DEFAULT_CURRENCY: Record<string, string> = {
            TH: 'THB',
            JP: 'JPY',
            CN: 'CNY',
            TW: 'TWD',
            HK: 'HKD',
            MO: 'MOP',
            SG: 'SGD',
            MY: 'MYR',
            KR: 'KRW',
            VN: 'VND',
            ID: 'IDR',
            PH: 'PHP',
            GB: 'GBP',
            UK: 'GBP',
            US: 'USD',
            AU: 'AUD',
            CA: 'CAD',
            NZ: 'NZD',
            FR: 'EUR',
            DE: 'EUR',
            IT: 'EUR',
            ES: 'EUR',
            NL: 'EUR',
            AT: 'EUR',
            BE: 'EUR',
            GR: 'EUR',
            PT: 'EUR',
            FI: 'EUR',
            IE: 'EUR',
            CH: 'CHF',
            AE: 'AED',
          };
          const localCountryCurrency = facts.countryCode ? COUNTRY_TO_DEFAULT_CURRENCY[facts.countryCode] : undefined;
          const effectiveCurrency = facts.priceCurrency || localCountryCurrency;

          if (facts.priceLevel && !isZeroOrPlaceholderPrice(facts.priceLevel)) {
            next.observed_price = facts.priceLevel;
            const normalized = normalizeObservedPrice(facts.priceLevel, effectiveCurrency);
            if (normalized?.min !== undefined) next.price_min = normalized.min;
            if (normalized?.max !== undefined) next.price_max = normalized.max;
            if (normalized?.currency) next.price_currency = normalized.currency;
            if (normalized?.level !== undefined) next.price_level = normalized.level;
            if (normalized?.unit) next.price_unit = normalized.unit;
            mutated = true;
          } else if (isZeroOrPlaceholderPrice(next.observed_price)) {
            next.observed_price = undefined;
            next.price_min = undefined;
            next.price_max = undefined;
            next.price_currency = undefined;
            next.price_level = undefined;
            next.price_unit = undefined;
            mutated = true;
          }
          if (facts.open_hours) {
            next.open_hours = facts.open_hours;
            mutated = true;
          }
          if (facts.plus_code) {
            next.plus_code = facts.plus_code;
            mutated = true;
          }
          if (facts.menu_url) {
            next.menu_url = facts.menu_url;
            mutated = true;
          }
          if (facts.reservation_url) {
            next.reservation_url = facts.reservation_url;
            mutated = true;
          }
          if (facts.review_topics && facts.review_topics.length > 0) {
            next.review_topics = facts.review_topics;
            mutated = true;
          }

          if (mutated) {
            next.updated_at = new Date().toISOString();
            return { place: next, enriched: true };
          }
        }
      } catch (err) {
        logger.warn('BackgroundEnrich', `Preview fetch failed for ${next.title}`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // 3. Fallback: detail HTML is allowed only when it can be constructed from verified identity.
  const targetUrl = googleMapsDetailUrlFromSourceId(next.source_place_id || resolvedFeatureId, cleanTitleForSearch(next.title));
  if (!targetUrl) {
    if (mutated) {
      next.updated_at = new Date().toISOString();
      return { place: next, enriched: true };
    }
    return { place: next, enriched: false, error: 'Missing strong Google Maps identity' };
  }

  logger.fetch('BackgroundEnrich', `Fetching HTML for ${next.title}`, { targetUrl, sourcePlaceId: next.source_place_id });

  try {
    const res = await fetch(targetUrl, {
      credentials: 'include',
      signal: options?.signal,
    });
    if (!res.ok) {
      logger.warn('BackgroundEnrich', `HTTP error for ${next.title}`, { status: res.status, url: targetUrl });
      if (mutated) {
        next.updated_at = new Date().toISOString();
        return { place: next, enriched: true };
      }
      return { place: next, enriched: false, error: `HTTP ${res.status}` };
    }
    const html = (await res.text()).slice(0, 2_500_000);

    const facts = extractGoogleMapsResearchFromHtml(html);
    logger.parser('BackgroundEnrich', `Parsed HTML facts for ${next.title}`, { htmlLength: html.length, facts });

    if (facts.rating !== undefined) {
      next.observed_rating = facts.rating;
      mutated = true;
    }
    if (facts.reviewCount !== undefined) {
      next.observed_review_count = facts.reviewCount;
      mutated = true;
    }
    if (facts.category) {
      next.source_category = facts.category;
      mutated = true;
    }
    if (facts.address) {
      next.address = facts.address;
      mutated = true;
    }
    if (facts.phone) {
      next.phone = facts.phone;
      mutated = true;
    }
    if (facts.types && facts.types.length > 0) {
      const existingTypes = next.types ?? [];
      const mergedTypes = [...new Set([...existingTypes, ...facts.types])];
      if (mergedTypes.length !== existingTypes.length) {
        next.types = mergedTypes;
        mutated = true;
      }
    }

    // Coordinates fallback
    if (!next.coordinates && facts.coordinates) {
      next.coordinates = facts.coordinates;
      mutated = true;
    } else if (!next.coordinates) {
      const finalUrl = res.url || targetUrl;
      const coordMatch = /@([-0-9.]+),([-0-9.]+)/.exec(finalUrl) || /@([-0-9.]+),([-0-9.]+)/.exec(html);
      if (coordMatch) {
        const lat = Number(coordMatch[1]);
        const lng = Number(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
          next.coordinates = { lat, lng };
          mutated = true;
        }
      }
    }

    // Price extraction & normalization from structured facts
    const extractedPrice = facts.priceLevel;
    if (extractedPrice && (!next.observed_price || next.observed_price.length < 2)) {
      next.observed_price = extractedPrice;
      const normalized = normalizeObservedPrice(extractedPrice, facts.priceCurrency);
      if (normalized?.min !== undefined) next.price_min = normalized.min;
      if (normalized?.max !== undefined) next.price_max = normalized.max;
      if (normalized?.currency) next.price_currency = normalized.currency;
      if (normalized?.level !== undefined) next.price_level = normalized.level;
      if (normalized?.unit) next.price_unit = normalized.unit;
      mutated = true;
    }

    if (mutated) {
      next.updated_at = new Date().toISOString();
    }

    return { place: next, enriched: mutated };
  } catch (error) {
    return { place, enriched: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function researchIdentity(place: CurrentResearchPlace): string {
  return place.sourcePlaceId ? `id:${place.sourcePlaceId}` : `url:${place.sourceUrl}`;
}

function plannerIdentity(place: PlannerTripPlace): string {
  return place.source_place_id ? `id:${place.source_place_id}` : `url:${place.source_url}`;
}

/**
 * Merges Google Maps content-script research into the latest Planner candidates.
 * mergeCapturedPlaceResearch keeps Planner-owned decisions authoritative.
 */
export function mergeDetectedResearchIntoPlannerPlaces(
  currentPlaces: PlannerTripPlace[],
  researchPlaces: CurrentResearchPlace[],
  fallbackCurrency?: string,
): PlannerTripPlace[] {
  const researchByIdentity = new Map(researchPlaces.map((place) => [researchIdentity(place), place] as const));
  return currentPlaces.map((existing) => {
    const research = researchByIdentity.get(plannerIdentity(existing));
    if (!research) return existing;

    const validResearchPrice = (research.priceLevel && !isZeroOrPlaceholderPrice(research.priceLevel) && isValidExtractedPriceCandidate(research.priceLevel))
      ? research.priceLevel
      : (existing.observed_price && !isZeroOrPlaceholderPrice(existing.observed_price) && isValidExtractedPriceCandidate(existing.observed_price) ? existing.observed_price : undefined);

    const normalizedPrice = validResearchPrice
      ? normalizeObservedPrice(
          validResearchPrice,
          research.detectedCurrency || fallbackCurrency || existing.price_currency,
        )
      : null;
    const now = new Date().toISOString();
    return mergeCapturedPlaceResearch(existing, {
      ...existing,
      title: research.title || existing.title,
      source_provider: research.sourceProvider || existing.source_provider,
      source_url: research.sourceUrl || existing.source_url,
      source_place_id: research.sourcePlaceId ?? existing.source_place_id,
      source_category: research.category,
      observed_rating: research.rating,
      observed_review_count: research.reviewCount,
      observed_price: validResearchPrice,
      price_currency: normalizedPrice?.currency,
      price_min: normalizedPrice?.min,
      price_max: normalizedPrice?.max,
      price_unit: normalizedPrice?.unit,
      price_level: normalizedPrice?.level,
      observed_at: now.slice(0, 10),
      open_hours: research.openHours,
      address: research.address,
      coordinates: research.coordinates,
      phone: research.phone,
      plus_code: research.plusCode,
      menu_url: research.menuUrl,
      reservation_url: research.reservationUrl,
      review_topics: research.reviewTopics,
      types: research.types,
      updated_at: now,
    });
  });
}

/**
 * Priority queue for detail fetch — hasChIJ/high to avoid throttling and head-of-line blocking.
 * Sorts candidates so 0x/ChIJ (A) go first, query pins (B) later, and limits to 3 workers.
 */
function priorityOf(place: PlannerTripPlace): number {
  const id = place.source_place_id?.trim() || '';
  if (/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(id)) return 0; // featureId highest
  if (/^ChIJ[A-Za-z0-9_-]{8,}$/.test(id)) return 1;
  if (/^\d{8,}$/.test(id)) return 2; // cid
  if (place.source_url && /0x[0-9a-f]+:0x[0-9a-f]+/i.test(place.source_url)) return 0;
  if (place.source_url && /ChIJ/.test(place.source_url)) return 1;
  return 3; // query pin lowest
}

export async function enrichCandidatePlacesBatch(
  places: PlannerTripPlace[],
  onProgress?: (processed: number, total: number, currentPlace: PlannerTripPlace) => void,
  options?: { concurrency?: number; signal?: AbortSignal }
): Promise<{ enrichedPlaces: PlannerTripPlace[]; totalEnriched: number }> {
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 5));
  // Priority queue: A (0x/ChIJ) before B (query), stable for same priority
  const sorted = [...places].sort((a, b) => priorityOf(a) - priorityOf(b));
  // Use sorted order for processing but keep results in original order
  const results = [...places];
  let totalEnriched = 0;
  let processed = 0;
  // Worker pool of size concurrency
  let cursor = 0;
  async function worker() {
    while (cursor < sorted.length) {
      if (options?.signal?.aborted) break;
      const idx = cursor++;
      const place = sorted[idx];
      const originalIndex = places.indexOf(place);
      const res = await enrichPlaceMetadata(place, { signal: options?.signal, force: true });
      if (res.enriched) {
        results[originalIndex] = res.place;
        totalEnriched += 1;
      }
      processed += 1;
      onProgress?.(processed, results.length, res.place);
      // Polite delay + jitter to avoid burst throttling (Google 429)
      await new Promise((r) => setTimeout(r, 120 + Math.random() * 80));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { enrichedPlaces: results, totalEnriched };
}
