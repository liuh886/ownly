import { inferSourceProvider } from '../domain/planner';
import {
  cleanExtractedText,
  extractFeatureIdFromUrl,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
  isValidExtractedPriceCandidate,
  isZeroOrPlaceholderPrice,
  normalizePhoneDisplay,
} from './utils';
import { detectPageCurrency, detectCurrencyFromPage } from './currency-detector';
import { extractGoogleMapsSavedListId, matchesSavedListContext } from './saved-list-match';
import {
  extractGoogleMapsPreviewFacts,
  extractGoogleMapsResearchFromHtml,
  googleMapsDetailUrlFromSourceId,
  googleMapsPreviewPlaceUrl,
} from './google-maps-research';
import { logger } from './logger';
import type {
  ExtractionSnapshot,
} from './maps/saved-list-parser';
import { getAdapterForUrl } from './adapters/registry';
import {
  scanAllGoogleMapsPlaces,
  fetchGoogleMapsEntityList,
  resolveGoogleMapsList,
} from './adapters/google-maps';
import type { CurrentResearchPlace, DetectedSavedList, SavedListCardSummary } from './adapters/types';

export type { CurrentResearchPlace, DetectedSavedList, SavedListCardSummary };
export { detectCurrencyFromPage };

let lastExtractionSnapshot: ExtractionSnapshot | null = null;
const EXTRACTION_SNAPSHOT_STORAGE_KEY = 'ownlyExtractionSnapshot';

export function persistSnapshot(snap: ExtractionSnapshot): void {
  lastExtractionSnapshot = snap;
  try {
    void chrome.storage?.local?.set({ [EXTRACTION_SNAPSHOT_STORAGE_KEY]: snap });
  } catch {}
  logger.info('Content', 'Extraction snapshot', snap);
}

const ENRICH_CACHE_TTL_MS = 5 * 60 * 1000;
const ENRICH_CACHE_MAX = 20;
const enrichCache = new Map<string, { at: number; place: CurrentResearchPlace }>();

function applyEnriched(target: CurrentResearchPlace, enriched: CurrentResearchPlace): CurrentResearchPlace {
  return {
    ...target,
    sourcePlaceId: target.sourcePlaceId ?? enriched.sourcePlaceId,
    rating: target.rating ?? enriched.rating,
    reviewCount: target.reviewCount ?? enriched.reviewCount,
    category: target.category ?? enriched.category,
    address: target.address ?? enriched.address,
    website: target.website ?? enriched.website,
    phone: target.phone ?? enriched.phone,
    plusCode: target.plusCode ?? enriched.plusCode,
    types: target.types && target.types.length > 0 ? target.types : enriched.types,
    priceLevel: target.priceLevel ?? enriched.priceLevel,
    detectedCurrency: target.detectedCurrency ?? enriched.detectedCurrency,
  };
}

const TAXONOMY_TYPES = /(restaurant|lodging|hotel|hostel|bed_and_breakfast|guest_house|motel|campground|cafe|coffee_shop|bakery|bar|pub|meal_takeaway|meal_delivery|food_court|tourist_attraction|museum|art_gallery|park|national_park|historical_landmark|historical_place|scenic_viewpoint|spa|massage|gym|fitness_center|amusement_park|water_park|aquarium|zoo|shopping_mall|department_store|supermarket|grocery_or_supermarket|convenience_store|transit_station|subway_station|train_station|bus_station|airport|ferry_terminal|store|night_club)/g;

export async function enrichFromPlaceHtml(
  place: CurrentResearchPlace,
  options?: { soft?: boolean },
  overrideCurrency?: string,
  hintCurrency?: string,
): Promise<CurrentResearchPlace> {
  const cacheKey = place.sourcePlaceId || `${place.sourceUrl}#${place.title}`;
  const cached = enrichCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ENRICH_CACHE_TTL_MS) {
    return applyEnriched(place, cached.place);
  }

  const missingCritical = !place.sourcePlaceId || !place.phone;
  if (options?.soft && !missingCritical) return place;

  try {
    const res = await fetch(window.location.href, { credentials: 'include' });
    if (!res.ok) return place;
    const html = (await res.text()).slice(0, 3_000_000);
    const research = extractGoogleMapsResearchFromHtml(html);
    place.rating ??= research.rating;
    place.reviewCount ??= research.reviewCount;
    place.category ??= research.category;
    place.priceLevel ??= research.priceLevel;
    place.detectedCurrency = overrideCurrency || research.priceCurrency || place.detectedCurrency;
    place.address ??= research.address;
    place.website ??= research.website;
    place.phone ??= research.phone;
    if ((!place.types || place.types.length === 0) && research.types?.length) place.types = research.types;

    if (!place.sourcePlaceId) {
      const chij = /"(ChIJ[A-Za-z0-9_-]{8,})"/.exec(html)?.[1];
      if (chij) place.sourcePlaceId = chij;
    }
    if (!place.sourcePlaceId) {
      const fid = extractFeatureIdFromUrl(window.location.href);
      if (fid) place.sourcePlaceId = fid;
    }
    if (!place.phone) {
      const phoneMatch = /"(\+\d[\d ()-]{8,})"/.exec(html)?.[1];
      if (phoneMatch) place.phone = normalizePhoneDisplay(phoneMatch);
    }
    if (!place.plusCode) {
      const plusMatch = /"([A-Z0-9]{4}\+[A-Z0-9]{2,5})[^"]{0,40}"/.exec(html)?.[1];
      if (plusMatch) place.plusCode = plusMatch;
    }
    if (!place.types || place.types.length === 0) {
      const found = new Set<string>();
      for (const m of html.matchAll(TAXONOMY_TYPES)) {
        found.add(m[1]);
        if (found.size >= 12) break;
      }
      if (found.size > 0) place.types = [...found];
    }
    if (!place.priceLevel) {
      const pricePatterns = [
        /"(?:displayPrice|priceString|ratePerNight|startingPrice)":\s*"([^"]{2,30})"/,
        /"(?:priceText|nightlyPrice)":\s*"([^"]{2,30})"/,
      ];
      for (const pattern of pricePatterns) {
        const match = pattern.exec(html)?.[1];
        if (match) {
          const candidate = cleanExtractedText(match);
          if (isPlausiblePriceText(candidate)) { place.priceLevel = candidate; break; }
        }
      }
      if (!place.priceLevel) {
        const ctxIdx = html.search(/(?:"hotelRates"|"ratePlan"|"pricingForStay")/i);
        if (ctxIdx >= 0) {
          const window = html.slice(Math.max(0, ctxIdx - 100), ctxIdx + 500);
          const priceMatch = /((?:S\$|HK\$|US\$|NT\$|[¥฿$€£₩₫])\s?\d[\d,.]*(?:\s*[-–—〜~]\s*\d[\d.,]*)?)/.exec(window);
          if (priceMatch && isPlausiblePriceText(priceMatch[1])) place.priceLevel = cleanExtractedText(priceMatch[1]);
        }
      }
    }
    if (!place.priceLevel && place.sourcePlaceId && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(place.sourcePlaceId)) {
      try {
        const previewUrl = googleMapsPreviewPlaceUrl(place.sourcePlaceId, window.location.origin);
        if (previewUrl) {
          const pRes = await fetch(previewUrl, { credentials: 'include' });
          if (pRes.ok) {
            const raw = await pRes.text();
            const clean = raw.replace(/^\)\]\}'\s*/, '');
            const data = JSON.parse(clean);
            const pf = extractGoogleMapsPreviewFacts(data);
            if (pf.priceLevel && !isZeroOrPlaceholderPrice(pf.priceLevel)) {
              place.priceLevel = pf.priceLevel;
              if (pf.priceCurrency) place.detectedCurrency = pf.priceCurrency;
            }
          }
        }
      } catch {}
    }
    if (place.priceLevel && (!place.detectedCurrency || overrideCurrency)) {
      const cur = detectPageCurrency({
        url: place.sourceUrl,
        priceText: place.priceLevel,
        hintCurrency,
        overrideCurrency,
        doc: typeof document !== 'undefined' ? document : undefined,
      }).currency;
      if (cur) place.detectedCurrency = cur;
    }
  } catch {
    return place;
  }
  enrichCache.set(cacheKey, { at: Date.now(), place });
  if (enrichCache.size > ENRICH_CACHE_MAX) {
    const oldest = enrichCache.keys().next().value;
    if (oldest !== undefined) enrichCache.delete(oldest);
  }
  return place;
}

export async function enrichPlaceFromHtml(
  place: CurrentResearchPlace,
  options?: { soft?: boolean },
  overrideCurrency?: string,
  hintCurrency?: string,
): Promise<CurrentResearchPlace> {
  return enrichFromPlaceHtml(place, options, overrideCurrency, hintCurrency);
}

function isGenericNavigationTitleLocal(text: string): boolean {
  const norm = text.trim().toLowerCase();
  if (/^(google|google maps|google 地图|google travel|google hotels|google flights|directions|路线|保存|已保存|saved|share|分享|搜索|search|返回|back|菜单|menu|overview|概览|reviews|评价|photos|照片|about|关于)$/i.test(norm)) {
    return true;
  }
  if (/^google\s*(travel|hotels?|flights?)(\s*\d+\s*(results?|处(搜索)?结果))?$/i.test(norm)) {
    return true;
  }
  if (/^\d+\s*(results?|处(搜索)?结果)$/i.test(norm)) {
    return true;
  }
  if (/^(search\s*results?|搜索结果|all\s*filters|全部筛选|sort\s*by|排序方式)$/i.test(norm)) {
    return true;
  }
  return false;
}

function scanAllSavedListsOnPage(): SavedListCardSummary[] {
  const listsMap = new Map<string, SavedListCardSummary>();

  const pushList = (listId: string | undefined, rawTitle: string, count: number | undefined, url: string) => {
    const title = cleanExtractedText(rawTitle);
    if (!title || title.length < 2 || title.length > 80) return;
    if (isGenericNavigationTitleLocal(title) || isJunkNavigationText(title) || isFakePlaceLabel(title)) return;
    const key = (listId || title).toLowerCase();
    if (!listsMap.has(key)) {
      listsMap.set(key, { listId, listName: title, count, url });
    }
  };

  const countOf = (scope: HTMLElement | null): number | undefined => {
    const m = /(\d+)\s*(places|个地点|项|items)/i.exec(scope?.textContent || '');
    return m ? parseInt(m[1], 10) : undefined;
  };

  const listAnchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/placelists/list/"], a[href*="!1s"], a[href*="!2s"], a[href*="?list="]');
  for (const anchor of Array.from(listAnchors)) {
    const href = anchor.href || '';
    const listId = extractGoogleMapsSavedListId(href);
    if (!listId) continue;

    const card = anchor.closest<HTMLElement>('div[role="listitem"], div.m6QErb, div.Nv2PK, li') ?? anchor;
    const titleEl = card.querySelector<HTMLElement>('.qBF1Pd, .fontHeadlineSmall, [role="heading"], h2, h3');
    const title = titleEl?.textContent?.trim() || anchor.getAttribute('aria-label')?.trim() || '';
    pushList(listId, title, countOf(card), href || window.location.href);
  }

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-list-id]'))) {
    const dataId = el.getAttribute('data-list-id') || '';
    if (!/^[A-Za-z0-9_-]{8,}$/.test(dataId)) continue;
    const titleEl = el.querySelector<HTMLElement>('.qBF1Pd, .fontHeadlineSmall, [role="heading"], h2, h3');
    const title = titleEl?.textContent?.trim() || el.getAttribute('aria-label')?.trim() || '';
    pushList(dataId, title, countOf(el), window.location.href);
  }

  return Array.from(listsMap.values());
}

const FEED_SCROLL_MAX_ROUNDS = 40;
const FEED_SCROLL_STABLE_LIMIT = 4;

async function autoScrollFeed(): Promise<void> {
  const feed = document.querySelector<HTMLElement>('div[role="feed"], div.m6QErb[aria-label]');
  if (!feed) return;
  let scroller: HTMLElement | null = feed;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
    scroller = scroller.parentElement;
  }
  if (!scroller) return;
  let stable = 0;
  for (let round = 0; round < FEED_SCROLL_MAX_ROUNDS && stable < FEED_SCROLL_STABLE_LIMIT; round += 1) {
    const before = scroller.scrollHeight;
    scroller.scrollTop = scroller.scrollHeight;
    await new Promise((r) => setTimeout(r, 320));
    if (scroller.scrollHeight === before) stable += 1;
    else stable = 0;
  }
}

function detectVisibleGoogleMapsListName(places: CurrentResearchPlace[]): string | undefined {
  if (places.length < 2) return undefined;
  const placeTitles = new Set(places.map((place) => cleanExtractedText(place.title).toLocaleLowerCase()).filter(Boolean));
  const candidates: string[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('div[role="main"] h1, h1.fontHeadlineLarge, h1')).slice(0, 8)) {
    candidates.push(el.textContent || el.getAttribute('aria-label') || '');
  }
  candidates.push(document.title.replace(/\s*[-–—]\s*Google Maps.*$/i, ''));
  for (const raw of candidates) {
    const title = cleanExtractedText(raw);
    if (!title || title.length > 80 || isGenericNavigationTitleLocal(title) || isJunkNavigationText(title) || isFakePlaceLabel(title)) continue;
    if (placeTitles.has(title.toLocaleLowerCase())) continue;
    return title;
  }
  return undefined;
}

const SAVED_LIST_DETAIL_CONCURRENCY = 4;
const SAVED_LIST_DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
const savedListDetailCache = new Map<string, { at: number; facts: import('./google-maps-research').GoogleMapsResearchFacts }>();

async function fetchSavedListDetail(place: CurrentResearchPlace): Promise<import('./google-maps-research').GoogleMapsResearchFacts | null> {
  const key = place.sourcePlaceId || extractFeatureIdFromUrl(place.sourceUrl);
  if (!key || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(key.trim())) {
    const candidates: string[] = [];
    if (place.sourceUrl?.includes('/maps/search/')) candidates.push(place.sourceUrl);
    const cleanTitle = place.title?.trim() || '';
    const addrSuffix = place.address ? ' ' + place.address : '';
    if (place.coordinates) {
      candidates.push(`https://www.google.com/maps/place/${encodeURIComponent(cleanTitle)}/@${place.coordinates.lat},${place.coordinates.lng},17z?hl=zh-CN`);
      candidates.push(`https://www.google.com/maps/search/${encodeURIComponent(cleanTitle)}/@${place.coordinates.lat},${place.coordinates.lng},14z?hl=zh-CN`);
    }
    candidates.push(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle + addrSuffix)}&hl=zh-CN`);
    if (!place.coordinates) candidates.push(`https://www.google.com/maps/search/${encodeURIComponent(cleanTitle)}?hl=zh-CN`);
    let lastFacts: import('./google-maps-research').GoogleMapsResearchFacts | null = null;
    for (const searchUrl of candidates) {
      logger.fetch('MapsTabDetail', `Resolving search-query pin for "${place.title}"`, { searchUrl });
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(searchUrl, { credentials: 'include', signal: controller.signal });
        if (res.ok) {
          const finalUrl = res.url || searchUrl;
          const urlPlaceId = extractFeatureIdFromUrl(finalUrl) || (/ChIJ[A-Za-z0-9_-]{8,}/.exec(finalUrl)?.[0]);
          const html = (await res.text()).slice(0, 3_000_000);
          let facts = extractGoogleMapsResearchFromHtml(html);
          if (!facts.sourcePlaceId && urlPlaceId) facts.sourcePlaceId = urlPlaceId;
          const placeId = facts.sourcePlaceId;
          if (placeId && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(placeId.trim())) {
            place.sourcePlaceId = placeId;
            const previewUrl = googleMapsPreviewPlaceUrl(placeId, window.location.origin);
            if (previewUrl) {
              try {
                const prevRes = await fetch(previewUrl, { credentials: 'include' });
                if (prevRes.ok) {
                  const rawPrev = await prevRes.text();
                  const cleanPrev = rawPrev.replace(/^\)\]\}'\s*/, '');
                  const previewFacts = extractGoogleMapsPreviewFacts(JSON.parse(cleanPrev));
                  facts = { ...facts, ...previewFacts, sourcePlaceId: placeId };
                }
              } catch {}
            }
            savedListDetailCache.set(placeId, { at: Date.now(), facts });
          } else if (placeId && /^ChIJ[A-Za-z0-9_-]{8,}/.test(placeId.trim())) {
            place.sourcePlaceId = placeId;
            const detailUrl = googleMapsDetailUrlFromSourceId(placeId, place.title, window.location.origin);
            if (detailUrl) {
              try {
                const dRes = await fetch(detailUrl, { credentials: 'include' });
                if (dRes.ok) {
                  const dHtml = (await dRes.text()).slice(0, 3_000_000);
                  const dFacts = extractGoogleMapsResearchFromHtml(dHtml);
                  facts = { ...dFacts, ...facts, sourcePlaceId: placeId } as typeof facts;
                  if ((dFacts as unknown as { rating?: number }).rating !== undefined) facts.rating = (dFacts as unknown as { rating?: number }).rating;
                }
              } catch {}
            }
            savedListDetailCache.set(placeId, { at: Date.now(), facts });
          }
          if (facts.sourcePlaceId || facts.rating !== undefined || facts.address || facts.coordinates) {
            return facts;
          } else {
            lastFacts = facts;
          }
        }
      } catch (err) {
        logger.warn('MapsTabDetail', `Search query resolution failed for "${place.title}"`, err instanceof Error ? err.message : String(err));
      } finally {
        window.clearTimeout(timer);
      }
    }
    if (lastFacts && (lastFacts.sourcePlaceId || lastFacts.rating !== undefined)) {
      return lastFacts;
    }
    return null;
  }
  if (!place.sourcePlaceId) place.sourcePlaceId = key;
  const cached = savedListDetailCache.get(key);
  if (cached && Date.now() - cached.at < SAVED_LIST_DETAIL_CACHE_TTL_MS) {
    return { ...cached.facts, sourcePlaceId: key };
  }

  const previewUrl = googleMapsPreviewPlaceUrl(key, window.location.origin);
  if (previewUrl) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(previewUrl, { credentials: 'include', signal: controller.signal });
      if (res.ok) {
        const raw = await res.text();
        const clean = raw.replace(/^\)\]\}'\s*/, '');
        const data = JSON.parse(clean);
        const facts = extractGoogleMapsPreviewFacts(data);
        facts.sourcePlaceId = key;
        savedListDetailCache.set(key, { at: Date.now(), facts });
        return facts;
      }
    } catch (err) {
      logger.warn('MapsTabDetail', `Preview fetch failed for "${place.title}"`, err instanceof Error ? err.message : String(err));
    } finally {
      window.clearTimeout(timer);
    }
  }

  const detailUrl = googleMapsDetailUrlFromSourceId(key, place.title, window.location.origin);
  if (!detailUrl) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(detailUrl, { credentials: 'include', signal: controller.signal });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 3_000_000);
    const facts = extractGoogleMapsResearchFromHtml(html);
    facts.sourcePlaceId = key;
    savedListDetailCache.set(key, { at: Date.now(), facts });
    return facts;
  } catch (err) {
    logger.error('MapsTabDetail', `Fetch failed for "${place.title}"`, err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function enrichSavedListDetails(
  list: DetectedSavedList,
  overrideCurrency?: string,
  force = false,
): Promise<{ list: DetectedSavedList; attempted: number; enriched: number; failed: number }> {
  const places = [...list.places];
  let cursor = 0;
  let attempted = 0;
  let enriched = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < places.length) {
      const index = cursor++;
      const place = places[index];
      if (!force && place.sourcePlaceId && place.rating !== undefined && place.reviewCount !== undefined && place.category && place.address && place.coordinates) continue;
      attempted += 1;
      const facts = await fetchSavedListDetail(place);
      if (!facts) {
        failed += 1;
        continue;
      }
      const nextPlaceId = place.sourcePlaceId || facts.sourcePlaceId;
      const nextRating = force ? (facts.rating ?? place.rating) : (place.rating ?? facts.rating);
      const nextReviewCount = force ? (facts.reviewCount ?? place.reviewCount) : (place.reviewCount ?? facts.reviewCount);
      const nextCategory = force ? (facts.category ?? place.category) : (place.category ?? facts.category);
      const nextPrice = (facts.priceLevel && !isZeroOrPlaceholderPrice(facts.priceLevel) && isValidExtractedPriceCandidate(facts.priceLevel))
        ? facts.priceLevel
        : (place.priceLevel && !isZeroOrPlaceholderPrice(place.priceLevel) && isValidExtractedPriceCandidate(place.priceLevel) ? place.priceLevel : undefined);
      const nextAddress = force ? (facts.address ?? place.address) : (place.address ?? facts.address);
      const nextCoords = force ? (facts.coordinates ?? place.coordinates) : (place.coordinates ?? facts.coordinates);
      const nextWebsite = force ? (facts.website ?? place.website) : (place.website ?? facts.website);
      const nextPhone = force ? (facts.phone ?? place.phone) : (place.phone ?? facts.phone);
      const nextOpenHours = force ? (facts.open_hours ?? place.openHours) : (place.openHours ?? facts.open_hours);
      const nextPlusCode = force ? (facts.plus_code ?? place.plusCode) : (place.plusCode ?? facts.plus_code);
      const nextMenuUrl = force ? (facts.menu_url ?? place.menuUrl) : (place.menuUrl ?? facts.menu_url);
      const nextReservationUrl = force ? (facts.reservation_url ?? place.reservationUrl) : (place.reservationUrl ?? facts.reservation_url);
      const nextReviewTopics = force ? (facts.review_topics ?? place.reviewTopics) : (place.reviewTopics ?? facts.review_topics);

      places[index] = {
        ...place,
        sourcePlaceId: nextPlaceId,
        rating: nextRating,
        reviewCount: nextReviewCount,
        category: nextCategory,
        priceLevel: nextPrice,
        detectedCurrency: overrideCurrency
          || facts.priceCurrency
          || detectCurrencyFromPage(
            place.sourceUrl,
            nextPrice,
            place.detectedCurrency ?? list.detectedCurrency,
            undefined,
          ),
        address: nextAddress,
        coordinates: nextCoords,
        website: nextWebsite,
        phone: nextPhone,
        openHours: nextOpenHours,
        plusCode: nextPlusCode,
        menuUrl: nextMenuUrl,
        reservationUrl: nextReservationUrl,
        reviewTopics: nextReviewTopics,
        types: facts.types?.length
          ? [...new Set([...(place.types ?? []), ...facts.types])]
          : place.types,
      };
      if (
        facts.rating !== undefined
        || facts.reviewCount !== undefined
        || facts.category
        || facts.priceLevel
        || facts.address
        || facts.coordinates
        || facts.phone
        || facts.open_hours
        || facts.plus_code
        || facts.types?.length
      ) enriched += 1;
    }
  };

  await Promise.all(Array.from({ length: Math.min(SAVED_LIST_DETAIL_CONCURRENCY, places.length) }, () => worker()));
  return { list: { ...list, places }, attempted, enriched, failed };
}

// Global Chrome Message Router
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const msgType = (message as { type?: string }).type;

  if (msgType === 'OWNLY_GET_CURRENT_PLACE') {
    const start = Date.now();
    const currentUrl = window.location.href;
    const adapter = getAdapterForUrl(currentUrl);
    const provider = adapter?.id || inferSourceProvider(currentUrl);
    const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
    const targetCurrency = (message as { targetCurrency?: string }).targetCurrency;
    const targetTags = ((message as { targetTags?: string[] }).targetTags || []).map((t) => t.trim().toLowerCase());

    void (async () => {
      try {
        let savedList: DetectedSavedList | null = null;
        if (adapter?.detectSavedList) {
          savedList = await adapter.detectSavedList(overrideCurrency);
        }

        const allLists = scanAllSavedListsOnPage();

        if ((!savedList || savedList.places.length === 0) && targetTags.length > 0 && allLists.length > 0) {
          const matched = allLists.find((list) => matchesSavedListContext(list.listName, { tags: targetTags }));
          if (matched?.listId) {
            logger.info('Content', `Fetching matched list by tag: ${matched.listName}`, { listId: matched.listId });
            savedList = await fetchGoogleMapsEntityList(matched.listId, overrideCurrency);
          }
        }

        const rawPlace = adapter?.extractPlace(overrideCurrency, targetCurrency) ?? null;
        const place = provider === 'google_maps' && rawPlace
          ? await enrichFromPlaceHtml(rawPlace, undefined, overrideCurrency, targetCurrency)
          : rawPlace;

        logger.info('Content', 'OWNLY_GET_CURRENT_PLACE done', {
          provider,
          hasPlace: Boolean(place),
          title: place?.title?.slice(0, 30),
          hasSavedList: Boolean(savedList),
          savedCount: savedList?.places.length ?? 0,
          allLists: allLists.length,
          ms: Date.now() - start,
        });

        sendResponse({
          place,
          savedList,
          allLists,
          detectedCurrency: detectCurrencyFromPage(currentUrl, undefined, targetCurrency, overrideCurrency),
        });
      } catch (e) {
        logger.error('Content', 'OWNLY_GET_CURRENT_PLACE failed', e instanceof Error ? e.stack || e.message : String(e));
        sendResponse({ place: null, savedList: null, allLists: [] });
      }
    })();
    return true;
  }

  if (msgType === 'OWNLY_ENRICH_SAVED_LIST') {
    void (async () => {
      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string; force?: boolean }).savedList;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      const force = Boolean((message as { force?: boolean }).force);
      if (!incoming?.places?.length) {
        sendResponse({ savedList: incoming ?? null, attempted: 0, enriched: 0, failed: 0 });
        return;
      }
      try {
        const result = await enrichSavedListDetails(incoming, overrideCurrency, force);
        sendResponse({ savedList: result.list, attempted: result.attempted, enriched: result.enriched, failed: result.failed });
      } catch (e) {
        logger.error('Content', 'OWNLY_ENRICH_SAVED_LIST error', String(e));
        sendResponse({ savedList: incoming, attempted: 0, enriched: 0, failed: 0 });
      }
    })();
    return true;
  }

  if (msgType === 'OWNLY_FETCH_LIST_BY_ID') {
    void (async () => {
      let listId = (message as { listId?: string }).listId;
      const listUrl = (message as { listUrl?: string }).listUrl;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      if (!listId && listUrl) listId = extractGoogleMapsSavedListId(listUrl);
      if (!listId) {
        sendResponse({ savedList: null });
        return;
      }
      const listData = await fetchGoogleMapsEntityList(listId, overrideCurrency);
      sendResponse({ savedList: listData });
    })();
    return true;
  }

  if (msgType === 'OWNLY_GET_VISIBLE_LIST_PLACES') {
    void (async () => {
      const start = Date.now();
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      const adapter = getAdapterForUrl(window.location.href);

      let savedList: DetectedSavedList | null = null;
      if (adapter?.detectSavedList) {
        savedList = await adapter.detectSavedList(overrideCurrency);
      }

      if (savedList && savedList.places.length > 0) {
        sendResponse({ listPlaces: savedList.places, listName: savedList.listName, truncated: savedList.truncated ?? false });
        return;
      }

      if (adapter?.id === 'google_maps') {
        await autoScrollFeed();
        const resolved = await resolveGoogleMapsList(overrideCurrency);
        const listPlaces = resolved?.places ?? scanAllGoogleMapsPlaces();
        const listName = resolved?.listName ?? detectVisibleGoogleMapsListName(listPlaces);
        logger.info('Content', 'OWNLY_GET_VISIBLE_LIST_PLACES done', { listName, count: listPlaces.length, ms: Date.now() - start });
        sendResponse({ listPlaces, listName, truncated: resolved?.truncated ?? false });
        return;
      }

      sendResponse({ listPlaces: [], listName: undefined, truncated: false });
    })();
    return true;
  }

  if (msgType === 'OWNLY_GET_SAVED_LIST') {
    void (async () => {
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      const adapter = getAdapterForUrl(window.location.href);
      let savedList: DetectedSavedList | null = null;
      if (adapter?.detectSavedList) {
        savedList = await adapter.detectSavedList(overrideCurrency);
      }
      if (!savedList && adapter?.id === 'google_maps') {
        savedList = await resolveGoogleMapsList(overrideCurrency);
      }
      sendResponse({ savedList });
    })();
    return true;
  }

  if (msgType === 'OWNLY_REDETECT_PAGE_CURRENCY') {
    const target = (message as { targetCurrency?: string }).targetCurrency;
    const detected = detectCurrencyFromPage(window.location.href, undefined, target);
    sendResponse({ detectedCurrency: detected });
    return true;
  }

  if (msgType === 'OWNLY_GET_EXTRACTION_SNAPSHOT') {
    sendResponse({ snapshot: lastExtractionSnapshot });
    return true;
  }
});

// Unified DOM & Page Observer for Inline Buttons & List Scanning
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const DEBOUNCE_MS = 350;
  let scanTimer: number | undefined;

  const triggerAdapterScan = () => {
    const adapter = getAdapterForUrl(window.location.href);
    if (!adapter) return;

    if (adapter.id === 'google_maps') {
      scanAllGoogleMapsPlaces();
    }
    if (adapter.initInlineButtons) {
      adapter.initInlineButtons();
    }
  };

  const scheduleScan = () => {
    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = undefined;
      triggerAdapterScan();
    }, DEBOUNCE_MS);
  };

  window.addEventListener('scroll', scheduleScan, { passive: true });

  try {
    const observer = new MutationObserver(scheduleScan);
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  } catch {}

  if (document.readyState !== 'loading') {
    triggerAdapterScan();
  } else {
    document.addEventListener('DOMContentLoaded', triggerAdapterScan, { once: true });
  }

  window.addEventListener('popstate', () => {
    setTimeout(triggerAdapterScan, 400);
  });
}
