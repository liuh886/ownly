import {
  normalizeObservedPrice,
  type PlannerTripPlace,
} from '../domain/planner';
import { extractCleanPriceText } from './utils';
import {
  extractGoogleMapsResearchFromHtml,
  googleMapsDetailUrlFromSourceId,
} from './google-maps-research';

export interface EnrichmentResult {
  place: PlannerTripPlace;
  enriched: boolean;
  error?: string;
}

/**
 * Enriches a single place by fetching research metadata (Google Maps JSON-LD / HTML).
 */
export async function enrichPlaceMetadata(
  place: PlannerTripPlace,
  options?: { signal?: AbortSignal }
): Promise<EnrichmentResult> {
  const isCandidateMissingData =
    !place.observed_rating ||
    !place.observed_review_count ||
    !place.observed_price ||
    !place.source_category ||
    !place.address ||
    !place.coordinates;

  if (!isCandidateMissingData) {
    return { place, enriched: false };
  }

  let targetUrl = place.source_url;
  // If it's a search query or cid or feature id, generate canonical detail URL
  if (!targetUrl || targetUrl.includes('/search/?api=1') || targetUrl.includes('/maps/search/')) {
    const detailUrl = googleMapsDetailUrlFromSourceId(place.source_place_id, place.title);
    if (detailUrl) targetUrl = detailUrl;
    else if (!targetUrl) targetUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.title)}`;
  }

  try {
    const res = await fetch(targetUrl, {
      credentials: 'include',
      signal: options?.signal,
    });
    if (!res.ok) return { place, enriched: false, error: `HTTP ${res.status}` };
    const html = (await res.text()).slice(0, 2_500_000);

    const facts = extractGoogleMapsResearchFromHtml(html);

    let mutated = false;
    const next: PlannerTripPlace = { ...place };

    if (!next.observed_rating && facts.rating !== undefined) {
      next.observed_rating = facts.rating;
      mutated = true;
    }
    if (!next.observed_review_count && facts.reviewCount !== undefined) {
      next.observed_review_count = facts.reviewCount;
      mutated = true;
    }
    if (facts.category && (!next.source_category || next.source_category === 'other')) {
      next.source_category = facts.category;
      mutated = true;
    }
    if (facts.address && !next.address) {
      next.address = facts.address;
      mutated = true;
    }
    if (facts.phone && !next.phone) {
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

    // Price extraction & normalization
    const extractedPrice = facts.priceLevel || extractCleanPriceText(html.slice(0, 50000));
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

/**
 * Enriches a list of candidate places concurrently with rate limiting and progress reporting.
 */
export async function enrichCandidatePlacesBatch(
  places: PlannerTripPlace[],
  onProgress?: (processed: number, total: number, currentPlace: PlannerTripPlace) => void,
  options?: { concurrency?: number; signal?: AbortSignal }
): Promise<{ enrichedPlaces: PlannerTripPlace[]; totalEnriched: number }> {
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 5));
  const results = [...places];
  let totalEnriched = 0;
  let processed = 0;

  for (let i = 0; i < results.length; i += concurrency) {
    if (options?.signal?.aborted) break;
    const batch = results.slice(i, i + concurrency);
    const batchPromises = batch.map(async (p, idx) => {
      const res = await enrichPlaceMetadata(p, { signal: options?.signal });
      if (res.enriched) {
        results[i + idx] = res.place;
        totalEnriched += 1;
      }
      processed += 1;
      onProgress?.(processed, results.length, res.place);
      // Polite inter-request delay
      await new Promise((r) => setTimeout(r, 100));
      return res.place;
    });

    await Promise.all(batchPromises);
  }

  return { enrichedPlaces: results, totalEnriched };
}
