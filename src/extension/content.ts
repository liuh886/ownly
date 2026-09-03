import {
  inferPlaceKind,
  inferSourceProvider,
  extractPlaceCoordinates,
  type PlannerPlaceKind,
  type PlannerPlaceSourceProvider,
} from '../domain/planner';
import {
  cleanExtractedText,
  extractCleanPriceText,
  extractFeatureIdFromUrl,
  findEntityListCategory,
  findEntityListPlaceId,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
  isValidExtractedPriceCandidate,
  isZeroOrPlaceholderPrice,
  normalizePhoneDisplay,
  parseEntityListCoordinates,
  safeDecodeUri,
} from './utils';
import { SELECTORS, driftCheck } from './selectors';
import { PLACE_PARSER, type SubtitleDecomposition } from './place-parser';
import { detectPageCurrency } from './currency-detector';
import { extractGoogleMapsSavedListId, matchesSavedListContext } from './saved-list-match';
import {
  extractGoogleMapsPreviewFacts,
  extractGoogleMapsResearchFromHtml,
  googleMapsDetailUrlFromSourceId,
  googleMapsPreviewPlaceUrl,
  type GoogleMapsResearchFacts,
} from './google-maps-research';
import { logger } from './logger';

export interface CurrentResearchPlace {
  title: string;
  sourceUrl: string;
  sourceProvider: PlannerPlaceSourceProvider;
  kind?: PlannerPlaceKind;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  detectedCurrency?: string;
  address?: string;
  area?: string;
  summary?: string;
  userNote?: string;
  openStatus?: string;
  openHours?: string;
  website?: string;
  coordinates?: { lat: number; lng: number };
  sourcePlaceId?: string;
  tierNote?: string;
  phone?: string;
  plusCode?: string;
  menuUrl?: string;
  reservationUrl?: string;
  reviewTopics?: string[];
  types?: string[];
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const match = /\/maps\/place\/([^/]+)/.exec(parsed.pathname);
    if (!match?.[1]) return '';
    return safeDecodeUri(match[1]);
  } catch {
    return '';
  }
}

function extractRating(): number | undefined {
  const ratingEl = document.querySelector<HTMLElement>(SELECTORS.rating);
  const ariaEl = document.querySelector<HTMLElement>(SELECTORS.ratingAria);
  return PLACE_PARSER.parseRating(ratingEl?.textContent || ariaEl?.getAttribute('aria-label'));
}

function extractReviewCount(): number | undefined {
  const countEl = document.querySelector<HTMLElement>(SELECTORS.reviewCount);
  return PLACE_PARSER.parseReviewCount(countEl?.getAttribute('aria-label') || countEl?.textContent);
}

function extractCategory(): string | undefined {
  // 1. Primary Google Maps category button
  const catBtn = document.querySelector<HTMLElement>(SELECTORS.category);
  if (catBtn?.textContent) {
    const cat = cleanExtractedText(catBtn.textContent);
    if (cat && cat.length < 50 && !/^(directions|save|share|nearby|路线|保存|分享|附近)$/i.test(cat)) return cat;
  }

  // 2. Hotel classification / Star rating badge (e.g. "4-star hotel", "5 星级酒店", "Resort hotel")
  const hotelClassEl = document.querySelector<HTMLElement>(
    'span[aria-label*="star hotel" i], span[aria-label*="星级酒店"], button[aria-label*="hotel" i], span.mgr77e, div.mgr77e'
  );
  if (hotelClassEl) {
    const text = cleanExtractedText(hotelClassEl.getAttribute('aria-label') || hotelClassEl.textContent || '');
    if (text && text.length < 50 && /(hotel|resort|inn|hostel|lodging|stay|酒店|旅馆|民宿|度假村|星级)/i.test(text)) return text;
  }

  // 3. Schema.org JSON-LD structured metadata
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of Array.from(scripts)) {
      if (!s.textContent) continue;
      const data = JSON.parse(s.textContent);
      const item = Array.isArray(data) ? data[0] : (data?.['@graph'] ? data['@graph'][0] : data);
      const type = item?.['@type'] || item?.type;
      if (type && typeof type === 'string' && type !== 'Place' && type !== 'LocalBusiness') {
        return cleanExtractedText(type);
      }
    }
  } catch {}

  // 4. Header subtitle row span scanning
  const subSpans = document.querySelectorAll<HTMLElement>('div.fontBodyMedium button, div.fontBodyMedium span.mgr77e, div.LBgpqf span');
  for (const span of Array.from(subSpans).slice(0, 5)) {
    const text = cleanExtractedText(span.textContent || '');
    if (text && text.length < 40 && !/^(directions|save|share|nearby|路线|保存|分享|附近|\d+)/i.test(text)) {
      return text;
    }
  }

  return undefined;
}

function extractPrice(): string | undefined {
  // 1. Direct dedicated price badge in Google Maps place header
  const priceEl = document.querySelector<HTMLElement>(SELECTORS.priceBadge);
  if (priceEl) {
    const text = cleanExtractedText(priceEl.getAttribute('aria-label') || priceEl.textContent || '');
    if (text && text.length < 40 && !/^(路线|directions|save|保存|share|分享|nearby|附近)$/i.test(text)) {
      const cleanPrice = extractCleanPriceText(text);
      if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice)) return cleanPrice;
    }
  }

  // 2. Structured price level pills ($$, $$$, ¥¥) in header
  const levelSpans = document.querySelectorAll<HTMLElement>(SELECTORS.priceLevels);
  for (const span of Array.from(levelSpans)) {
    const label = cleanExtractedText(span.getAttribute('aria-label') || span.textContent || '');
    if (label && isPlausiblePriceText(label) && !isZeroOrPlaceholderPrice(label)) {
      return extractCleanPriceText(label) || label;
    }
  }

  // 3. Structured header price container (span.mgr77e, div.mgr77e)
  const infoSpans = document.querySelectorAll<HTMLElement>('span.mgr77e, div.mgr77e span');
  for (const span of Array.from(infoSpans)) {
    const text = cleanExtractedText(span.getAttribute('aria-label') || span.textContent || '');
    if (text && text.length < 40) {
      const cleanPrice = extractCleanPriceText(text);
      if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice)) return cleanPrice;
    }
  }

  // 4. Hotel rates and pricing comparison cards / pills in overview
  const hotelRateEls = document.querySelectorAll<HTMLElement>(
    'div[data-provider-name], button[data-tooltip*="价格"], div.F7nice, div[aria-label*="每晚"], span[aria-label*="每晚"], div[aria-label*="起"], span.fontHeadlineLarge, div.fontHeadlineLarge, span.fontTitleLarge, div.fontTitleLarge'
  );
  for (const el of Array.from(hotelRateEls)) {
    const text = cleanExtractedText(el.getAttribute('aria-label') || el.textContent || '');
    if (text && text.length < 50 && !/^(路线|directions|save|保存|share|分享|nearby|附近)$/i.test(text)) {
      const cleanPrice = extractCleanPriceText(text);
      if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice) && isValidExtractedPriceCandidate(cleanPrice)) {
        return cleanPrice;
      }
    }
  }

  return undefined;
}

function extractHotelTier(): string | undefined {
  const tierEl = document.querySelector<HTMLElement>(
    'span[class*="price"], div.mgr77e, span.mgr77e span, div.fontBodyMedium span'
  );
  const candidates: string[] = [];
  if (tierEl) candidates.push(tierEl.textContent || tierEl.getAttribute('aria-label') || '');
  for (const span of Array.from(document.querySelectorAll<HTMLElement>('div.fontBodyMedium span, div.W4Efsd span')).slice(0, 10)) {
    candidates.push(span.textContent || '');
  }
  for (const raw of candidates) {
    const text = cleanExtractedText(raw);
    if (!text || text.length > 40) continue;
    if (/\b\d\s*[-–—]?\s*(?:star|stars?)\b|星级/i.test(text) && !isJunkNavigationText(text) && !isPlausiblePriceText(text)) {
      return text;
    }
  }
  return undefined;
}

function extractAddress(): string | undefined {
  const addrEl = document.querySelector<HTMLElement>(SELECTORS.address);
  if (addrEl?.textContent) {
    const addr = cleanExtractedText(addrEl.textContent);
    if (addr && addr.length < 150) return addr;
  }
  return undefined;
}

function extractSummary(): string | undefined {
  const summaryEl = document.querySelector<HTMLElement>(SELECTORS.summary);
  if (summaryEl?.textContent) {
    const sum = cleanExtractedText(summaryEl.textContent);
    if (sum && sum.length < 300 && !isJunkNavigationText(sum)) return sum;
  }
  return undefined;
}

function extractUserNote(): string | undefined {
  const noteEl = document.querySelector<HTMLElement>(SELECTORS.note);
  if (noteEl) {
    const text = cleanExtractedText(noteEl.textContent || (noteEl as HTMLTextAreaElement).value || '');
    if (text && text.length < 500 && !isJunkNavigationText(text)) return text;
  }
  return undefined;
}

function extractOpenStatus(): string | undefined {
  const openEl = document.querySelector<HTMLElement>(SELECTORS.openStatus);
  if (openEl?.textContent) {
    const text = cleanExtractedText(openEl.textContent);
    if (text && text.length < 60) return text;
  }
  return undefined;
}

function extractOpenHours(): string | undefined {
  const hoursTable = document.querySelector<HTMLElement>(SELECTORS.hoursTable);
  if (!hoursTable) {
    const directHours = document.querySelector<HTMLElement>(SELECTORS.openStatus);
    if (directHours) {
      const text = cleanExtractedText(directHours.getAttribute('aria-label') || directHours.textContent || '');
      if (text && text.length < 100 && /\d/.test(text)) return text;
    }
    return undefined;
  }
  const rows = hoursTable.querySelectorAll<HTMLElement>(SELECTORS.hoursRows);
  const result: string[] = [];
  for (const row of Array.from(rows)) {
    const day = cleanExtractedText(row.querySelector('td:first-child, div:first-child')?.textContent || '');
    const hours = cleanExtractedText(row.querySelector('td:last-child, div:last-child')?.textContent || '');
    if (day && hours) result.push(`${day} ${hours}`);
  }
  return result.length > 0 ? result.join(' | ') : undefined;
}

function extractWebsite(): string | undefined {
  const anchor = document.querySelector<HTMLAnchorElement>(SELECTORS.website);
  if (anchor?.href && /^https?:\/\//i.test(anchor.href)) {
    return anchor.href;
  }
  return undefined;
}

function extractPhone(): string | undefined {
  const el = document.querySelector<HTMLElement>(SELECTORS.phone);
  const href = el?.getAttribute('href') || el?.querySelector('a')?.getAttribute('href');
  if (href?.startsWith('tel:')) return normalizePhoneDisplay(decodeURIComponent(href.slice(4)));
  return normalizePhoneDisplay(el?.textContent || undefined);
}

function extractPlusCode(): string | undefined {
  const el = document.querySelector<HTMLElement>(SELECTORS.plusCode);
  const text = cleanExtractedText(el?.textContent || el?.getAttribute('aria-label') || '');
  if (text) {
    const match = /\b[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,5}\b/i.exec(text);
    if (match) return match[0].toUpperCase();
  }

  // Fallback 1: Query any button/span with plus code aria-label or data-item-id
  const candidates = document.querySelectorAll<HTMLElement>('button[data-item-id*="oloc"], button[aria-label*="code" i], button[aria-label*="代码"], span[class*="plusCode"]');
  for (const c of Array.from(candidates)) {
    const candText = cleanExtractedText(c.getAttribute('aria-label') || c.textContent || '');
    const match = /\b[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,5}\b/i.exec(candText);
    if (match) return match[0].toUpperCase();
  }

  // Fallback 2: Check address element
  const addrEl = document.querySelector<HTMLElement>(SELECTORS.address);
  if (addrEl?.textContent) {
    const addrMatch = /\b[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,5}\b/i.exec(addrEl.textContent);
    if (addrMatch) return addrMatch[0].toUpperCase();
  }

  return undefined;
}

function extractMenuLink(): string | undefined {
  const anchor = document.querySelector<HTMLAnchorElement>(SELECTORS.menuLink);
  return anchor?.href || undefined;
}

const RESERVE_URL_HINT = /(reserve|booking|tablecheck|sevenrooms|opentable|quandoo|eatigo|tabelog.*reserve)/i;

function extractReservation(): { url?: string; available: boolean } {
  const nodes = document.querySelectorAll<HTMLElement>(SELECTORS.reserveAction);
  for (const node of Array.from(nodes).slice(0, 10)) {
    const anchor = node instanceof HTMLAnchorElement ? node : node.querySelector<HTMLAnchorElement>('a[href]');
    if (anchor?.href && RESERVE_URL_HINT.test(anchor.href)) {
      return { url: anchor.href, available: true };
    }
  }
  const visibleReserve = [...document.querySelectorAll<HTMLElement>('[aria-label]')]
    .filter((el) => /reserve|book a table|预订|订座/i.test(el.getAttribute('aria-label') || ''))
    .slice(0, 5);
  if (visibleReserve.length > 0) return { available: true };
  return { available: false };
}

function extractReviewTopics(): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const chip of Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.reviewTopicChips)).slice(0, 60)) {
    const label = cleanExtractedText(chip.getAttribute('aria-label') || chip.textContent || '');
    const m = /^(.{1,24}?)\s*[-–]\s*(\d{1,5})$|^(.{1,24}?)\s+(\d{1,5})\s*(?:条评论|reviews?)$/i.exec(label);
    const topic = m ? (m[1] || m[3]) : '';
    if (!topic || topic.length < 2) continue;
    const key = topic.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      topics.push(topic);
    }
    if (topics.length >= 5) break;
  }
  return topics;
}

interface AppStateSignals {
  placeId?: string;
  intlPhone?: string;
  plusCode?: string;
  types?: string[];
}

let appStateSignals: AppStateSignals | null = null;
let lastBridgeUrl = '';

/** Reads Google's APP_INITIALIZATION_STATE in the page world via a bridge. */
function injectAppStateBridge(): void {
  const currentUrl = window.location.href;
  if (currentUrl !== lastBridgeUrl) {
    appStateSignals = null;
    lastBridgeUrl = currentUrl;
  }
  try {
    const script = document.createElement('script');
    script.textContent = `(() => {
      const out = {};
      try {
        let nodes = [window.APP_INITIALIZATION_STATE];
        let scanned = 0;
        while (nodes.length && scanned < 6000) {
          const cur = nodes.shift(); scanned++;
          if (typeof cur === 'string') {
            if (/^ChIJ[A-Za-z0-9_-]{8,}$/.test(cur) && !out.placeId) out.placeId = cur;
            else if (/^\\+[0-9][0-9 ()-]{7,}$/.test(cur) && !out.intlPhone) out.intlPhone = cur;
            else if (/^[A-Z0-9]{4}\\+[A-Z0-9]{2,5}/.test(cur) && !out.plusCode) out.plusCode = cur.split(/[,; ]/)[0];
            continue;
          }
          if (Array.isArray(cur)) {
            for (const child of cur) { if (nodes.length < 4000) nodes.push(child); }
          }
        }
        const typesBlob = JSON.stringify(window.APP_INITIALIZATION_STATE || '').match(/"(restaurant|lodging|hotel|hostel|bed_and_breakfast|guest_house|motel|campground|cafe|coffee_shop|bakery|bar|pub|meal_takeaway|meal_delivery|food_court|tourist_attraction|museum|art_gallery|park|national_park|historical_landmark|historical_place|scenic_viewpoint|spa|massage|gym|fitness_center|amusement_park|water_park|aquarium|zoo|shopping_mall|department_store|supermarket|grocery_or_supermarket|convenience_store|transit_station|subway_station|train_station|bus_station|airport|ferry_terminal|store|night_club)"/g);
        if (typesBlob) out.types = [...new Set(typesBlob.map(t => t.replace(/"/g, '')))].slice(0, 12);
      } catch {}
      window.dispatchEvent(new CustomEvent('ownly-app-state', { detail: out }));
    })();`;
    document.documentElement.appendChild(script);
    script.remove();
  } catch {}
}

window.addEventListener('ownly-app-state' as keyof WindowEventMap, ((event: CustomEvent<AppStateSignals>) => {
  if (event.detail && typeof event.detail === 'object') {
    appStateSignals = event.detail;
  }
}) as EventListener);

/** Public wrapper so the side panel can enrich the place it already holds. */
export async function enrichPlaceFromHtml(
  place: CurrentResearchPlace,
  options?: { soft?: boolean },
): Promise<CurrentResearchPlace> {
  return enrichFromPlaceHtml(place, options);
}

const ENRICH_CACHE_TTL_MS = 5 * 60 * 1000;
const ENRICH_CACHE_MAX = 20;
const enrichCache = new Map<string, { at: number; place: CurrentResearchPlace }>();

/** Fills only the fields a cache hit can provide without re-fetching the page. */
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

function collectAppStateSignals(): AppStateSignals | null {
  injectAppStateBridge();
  return appStateSignals;
}

const TAXONOMY_TYPES = /(restaurant|lodging|hotel|hostel|bed_and_breakfast|guest_house|motel|campground|cafe|coffee_shop|bakery|bar|pub|meal_takeaway|meal_delivery|food_court|tourist_attraction|museum|art_gallery|park|national_park|historical_landmark|historical_place|scenic_viewpoint|spa|massage|gym|fitness_center|amusement_park|water_park|aquarium|zoo|shopping_mall|department_store|supermarket|grocery_or_supermarket|convenience_store|transit_station|subway_station|train_station|bus_station|airport|ferry_terminal|store|night_club)/g;

/**
 * Same-origin fetch of the place page HTML: the server-rendered blob embeds a
 * complete APP_INITIALIZATION_STATE (ChIJ id, phone, plus code, taxonomy) that
 * is far more robust than CSS classes. Fills only missing fields.
 */
async function enrichFromPlaceHtml(
  place: CurrentResearchPlace,
  options?: { soft?: boolean },
): Promise<CurrentResearchPlace> {
  const cacheKey = place.sourcePlaceId || `${place.sourceUrl}#${place.title}`;
  const cached = enrichCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ENRICH_CACHE_TTL_MS) {
    return applyEnriched(place, cached.place);
  }
  // Soft refreshes (price retries, tab refocus) skip the multi-MB re-fetch
  // unless a critical identity field is still missing.
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
    place.detectedCurrency ??= research.priceCurrency;
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
      // Google Hotels embeds price strings near known keys in the state blob
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
      // Fallback: scan for currency+amount near "hotel" or "rate" context
      if (!place.priceLevel) {
        const ctxIdx = html.search(/(?:"hotelRates"|"ratePlan"|"pricingForStay")/i);
        if (ctxIdx >= 0) {
          const window = html.slice(Math.max(0, ctxIdx - 100), ctxIdx + 500);
          const priceMatch = /((?:S\$|HK\$|US\$|NT\$|[¥฿$€£₩₫])\s?\d[\d,.]*(?:\s*[-–—〜~]\s*\d[\d.,]*)?)/.exec(window);
          if (priceMatch && isPlausiblePriceText(priceMatch[1])) place.priceLevel = cleanExtractedText(priceMatch[1]);
        }
      }
    }
  } catch {
    // enrichment is best-effort; DOM extraction already provided the basics
    return place;
  }
  enrichCache.set(cacheKey, { at: Date.now(), place });
  if (enrichCache.size > ENRICH_CACHE_MAX) {
    const oldest = enrichCache.keys().next().value;
    if (oldest !== undefined) enrichCache.delete(oldest);
  }
  return place;
}

export function detectCurrencyFromPage(
  sourceUrl: string,
  priceText?: string,
  hintCurrency?: string,
  overrideCurrency?: string,
): string | undefined {
  const result = detectPageCurrency({
    url: sourceUrl,
    priceText,
    hintCurrency,
    overrideCurrency,
    doc: typeof document !== 'undefined' ? document : undefined,
  });
  return result.currency;
}

export interface DetectedSavedList {
  listName: string;
  listUrl: string;
  detectedCurrency?: string;
  places: CurrentResearchPlace[];
  truncated?: boolean;
}

const FEED_SCROLL_MAX_ROUNDS = 40;
const FEED_SCROLL_STABLE_LIMIT = 4;

async function autoScrollFeed(): Promise<void> {
  const feed = document.querySelector<HTMLElement>(SELECTORS.feed);
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

const MAX_SCAVENGED_PLACES = 600;
const scannedListPlaces = new Map<string, CurrentResearchPlace>();
let lastScannedPageUrl = '';

function getCanonicalPageKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/@[-0-9.,]+z\/?/, '');
    return `${u.origin}${path}${u.search}`;
  } catch {
    return url;
  }
}

function pruneScavengedCache(pageUrl: string): void {
  const canonical = getCanonicalPageKey(pageUrl);
  if (canonical !== lastScannedPageUrl) {
    scannedListPlaces.clear();
    lastScannedPageUrl = canonical;
    return;
  }
  if (scannedListPlaces.size <= MAX_SCAVENGED_PLACES) return;
  const dropCount = Math.floor(MAX_SCAVENGED_PLACES / 3);
  for (const key of [...scannedListPlaces.keys()].slice(0, dropCount)) {
    scannedListPlaces.delete(key);
  }
}

function isGenericNavigationTitle(text: string): boolean {
  const norm = text.trim().toLowerCase();
  return /^(google|google maps|google 地图|directions|路线|保存|已保存|saved|share|分享|搜索|search|返回|back|菜单|menu|overview|概览|reviews|评价|photos|照片|about|关于)$/i.test(norm);
}

function readCardFields(card: HTMLElement | null) {
  if (!card) return {};
  const ratingText = card.querySelector<HTMLElement>(SELECTORS.cardRating)?.textContent?.trim() ||
    card.querySelector<HTMLElement>(SELECTORS.ratingAria)?.getAttribute('aria-label');
  const directRating = PLACE_PARSER.parseRating(ratingText);

  // Scan ALL info lines in the card (e.g. multiple div.W4Efsd, div.fontBodyMedium)
  const infoElements = Array.from(card.querySelectorAll<HTMLElement>(SELECTORS.cardInfo));
  let subInfo: SubtitleDecomposition = {};

  if (infoElements.length === 0) {
    subInfo = PLACE_PARSER.parseSubtitleInfo(card.textContent);
  } else {
    for (const el of infoElements) {
      const text = el.textContent?.trim();
      if (!text) continue;
      const parsed = PLACE_PARSER.parseSubtitleInfo(text);
      subInfo = {
        rating: subInfo.rating ?? parsed.rating,
        reviewCount: subInfo.reviewCount ?? parsed.reviewCount,
        category: subInfo.category ?? parsed.category,
        priceLevel: subInfo.priceLevel ?? parsed.priceLevel,
        openStatus: subInfo.openStatus ?? parsed.openStatus,
        area: subInfo.area ?? parsed.area,
      };
    }
  }

  // Check dedicated hotel rate badge on card (e.g. span.fontHeadlineSmall) if present
  if (!subInfo.priceLevel) {
    const hotelBadge = card.querySelector<HTMLElement>('span.fontHeadlineSmall, div.fontHeadlineSmall');
    if (hotelBadge) {
      const badgeText = cleanExtractedText(hotelBadge.textContent || '');
      const cleanPrice = extractCleanPriceText(badgeText);
      if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice)) {
        subInfo.priceLevel = cleanPrice;
      }
    }
  }

  const rawAddr = card.querySelector<HTMLElement>(SELECTORS.address)?.textContent?.trim();
  const address = rawAddr ? cleanExtractedText(rawAddr) : (subInfo.area || undefined);
  const rawNote = card.querySelector<HTMLElement>(SELECTORS.cardNote)?.textContent?.trim();
  const userNote = (rawNote && !isJunkNavigationText(rawNote)) ? cleanExtractedText(rawNote) : undefined;

  return {
    rating: directRating ?? subInfo.rating,
    reviewCount: subInfo.reviewCount,
    category: subInfo.category,
    priceLevel: subInfo.priceLevel,
    openStatus: subInfo.openStatus,
    address,
    userNote,
  };
}

function rememberScavengedPlace(rawTitle: string, sourceUrl: string, card: HTMLElement | null): void {
  const cleanTitle = cleanExtractedText(rawTitle);
  if (!cleanTitle || cleanTitle.length < 2 || cleanTitle.length > 80 || isGenericNavigationTitle(cleanTitle) || isJunkNavigationText(cleanTitle) || isFakePlaceLabel(cleanTitle)) return;

  const identityKey = extractFeatureIdFromUrl(sourceUrl) || sourceUrl || `unresolved:${cleanTitle.toLowerCase()}`;
  if (scannedListPlaces.has(identityKey)) return;

  const fields = readCardFields(card);
  const url = sourceUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`;
  const kind = inferPlaceKind((fields.category || '') + ' ' + cleanTitle + ' ' + (fields.address || ''));

  scannedListPlaces.set(identityKey, {
    title: cleanTitle,
    sourceUrl: url,
    sourceProvider: 'google_maps',
    kind,
    rating: fields.rating,
    reviewCount: fields.reviewCount,
    category: fields.category,
    priceLevel: fields.priceLevel,
    openStatus: fields.openStatus,
    address: fields.address,
    detectedCurrency: detectCurrencyFromPage(url, fields.priceLevel),
    summary: fields.userNote,
    userNote: fields.userNote,
    coordinates: extractPlaceCoordinates(url) ?? undefined,
  });
}

const PLACE_LINK = 'a.hfpxzc, a[href*="/maps/place/"], a[href*="/place/"], a[data-place-id]';

function scanAllGoogleMapsPlaces(): CurrentResearchPlace[] {
  pruneScavengedCache(window.location.href);

  // Strategy 1: Scan all place link anchors directly
  const linkAnchors = document.querySelectorAll<HTMLAnchorElement>(SELECTORS.feedAnchors);
  for (const anchor of Array.from(linkAnchors)) {
    let title = anchor.getAttribute('aria-label') || '';
    const href = anchor.href || '';
    if (!title && href) {
      title = titleFromUrl(href);
    }
    if (!title || title.length < 2 || isGenericNavigationTitle(title)) continue;

    const card = anchor.closest<HTMLElement>(SELECTORS.cardContainers) || anchor.parentElement;
    rememberScavengedPlace(title, href, card ?? null);
  }

  // Strategy 2: Scan all distinct item card containers inside lists
  const cardElements = document.querySelectorAll<HTMLElement>(
    `${SELECTORS.cardContainers}, div[role="feed"] > div`
  );
  for (const card of Array.from(cardElements)) {
    const headEl = card.querySelector<HTMLElement>(SELECTORS.cardTitle);
    const title = headEl?.textContent?.trim() || card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[aria-label]')?.getAttribute('aria-label') || '';
    const linkEl = card.querySelector<HTMLAnchorElement>(PLACE_LINK);
    rememberScavengedPlace(title, linkEl?.href || '', card);
  }

  // Strategy 3: Scan all list item cards and rows inside feed/pane
  const feedItems = document.querySelectorAll<HTMLElement>(
    'div[role="feed"] > div, div[role="main"] div[jsaction], div.m6QErb > div[jsaction], div.m6QErb > div'
  );
  for (const card of Array.from(feedItems)) {
    const titleEl = card.querySelector<HTMLElement>(
      'h1, h2, h3, .fontHeadlineSmall, .qBF1Pd, .OSrXXb, [role="heading"], div[class*="headline"], span[class*="headline"]'
    );
    const title = titleEl?.textContent?.trim() || card.querySelector('[aria-label]')?.getAttribute('aria-label') || '';
    const linkEl = card.querySelector<HTMLAnchorElement>(PLACE_LINK);
    rememberScavengedPlace(title, linkEl?.href || '', card);
  }

  return Array.from(scannedListPlaces.values());
}

function extractGoogleMapsPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const detailHeading = document.querySelector<HTMLElement>(SELECTORS.placeHeading)
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const hasVisibleDetailFacts = Boolean(
    document.querySelector(SELECTORS.address)
    || document.querySelector(SELECTORS.rating)
    || document.querySelector(SELECTORS.category)
    || document.querySelector(SELECTORS.phone)
    || document.querySelector(SELECTORS.website),
  );
  // Google Maps is a SPA: a real place details pane can be open while the URL
  // remains on /maps/@... or a search route. DOM detail facts are therefore
  // authoritative; URL shape is only another positive signal.
  const hasVisiblePlaceDetails = Boolean(cleanExtractedText(detailHeading?.textContent || '') && hasVisibleDetailFacts);
  const isDedicatedPlacePage = /\/maps\/place\/[^/?#]+/i.test(window.location.pathname)
    || /data=.*!1s0x/i.test(window.location.href)
    || /cid=\d+/i.test(window.location.search)
    || hasVisiblePlaceDetails;

  // If there are multiple places in a list and no place details pane is open, don't falsely recognize list header
  if (!isDedicatedPlacePage && !hasVisiblePlaceDetails) {
    const listPlaces = scanAllGoogleMapsPlaces();
    if (listPlaces.length > 1) {
      return null;
    }
  }
  
  // A saved-list carrier is not a place by itself. A visible details pane above overrides this.
  if (!isDedicatedPlacePage && extractGoogleMapsSavedListId(sourceUrl)) {
    return null;
  }

  const jsonLd = PLACE_PARSER.extractJsonLd(document);
  const heading = detailHeading;
  const title = heading?.textContent?.trim() || jsonLd.title || titleFromUrl(sourceUrl);
  if (!title && isDedicatedPlacePage) {
    driftCheck('placeHeading', null);
  }
  if (!title || (!/\/maps/i.test(window.location.pathname) && !window.location.hostname.includes('maps.google') && !window.location.href.includes('/maps'))) return null;

  const priceLevel = extractPrice() || jsonLd.priceLevel;
  const address = extractAddress() || jsonLd.address;
  const detectedCurrency = detectCurrencyFromPage(sourceUrl, priceLevel);
  const userNote = extractUserNote();
  const summary = extractSummary();
  const openHours = extractOpenHours();
  const openStatus = extractOpenStatus();
  const stateSignals = collectAppStateSignals();
  const reservation = extractReservation();
  const rating = extractRating() || jsonLd.rating;
  const reviewCount = extractReviewCount() || jsonLd.reviewCount;
  const category = extractCategory() || jsonLd.category;
  const kind = inferPlaceKind((category || '') + ' ' + title + ' ' + (address || '') + ' ' + ((stateSignals?.types || []).join(' ')));

  return {
    title,
    sourceUrl,
    sourceProvider: 'google_maps',
    sourcePlaceId: extractFeatureIdFromUrl(sourceUrl) ?? stateSignals?.placeId,
    kind,
    rating,
    reviewCount,
    category,
    priceLevel,
    detectedCurrency,
    address,
    summary,
    userNote,
    openStatus,
    openHours,
    website: extractWebsite() || jsonLd.website,
    coordinates: extractPlaceCoordinates(sourceUrl) ?? undefined,
    tierNote: extractHotelTier(),
    phone: extractPhone() ?? jsonLd.phone ?? stateSignals?.intlPhone,
    plusCode: extractPlusCode() ?? stateSignals?.plusCode,
    menuUrl: extractMenuLink(),
    reservationUrl: reservation.url,
    reviewTopics: (() => {
      const topics = extractReviewTopics();
      return topics.length > 0 ? topics : undefined;
    })(),
    types: stateSignals?.types,
  };
}

function extractGoogleMapsListId(): string | null {
  const fromUrl = extractGoogleMapsSavedListId(window.location.href);
  if (fromUrl) return fromUrl;

  const links = document.querySelectorAll<HTMLLinkElement | HTMLAnchorElement>(
    'link[href*="getlist"], link[href*="entitylist"], a[href*="!1s"], a[href*="!2s"], a[href*="/placelists/list/"], a[href*="?list="]'
  );
  for (const link of Array.from(links)) {
    const id = extractGoogleMapsSavedListId(link.href || '');
    if (id) return id;
  }

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-list-id]'))) {
    const id = (el.getAttribute('data-list-id') || '').trim();
    if (/^[A-Za-z0-9_-]{8,}$/.test(id)) return id;
  }
  return null;
}

let cachedEntityList: DetectedSavedList | null = null;
let lastScannedListId: string | null = null;

async function fetchGoogleMapsEntityList(listId: string, overrideCurrency?: string): Promise<DetectedSavedList | null> {
  try {
    const authuserMatch = window.location.href.match(/authuser=(\d+)/);
    const authuser = authuserMatch ? authuserMatch[1] : '0';
    const fetchUrl = `/maps/preview/entitylist/getlist?authuser=${authuser}&hl=zh-CN&pb=!1m4!1s${listId}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
    const res = await fetch(fetchUrl);
    if (res.ok) {
      const raw = await res.text();
      const cleanJson = raw.replace(/^\)\]\}'\s*/, '');
      const data = JSON.parse(cleanJson);
      const rawListName = data[0]?.[4] || 'Google Maps 收藏列表';
      const listName = cleanExtractedText(rawListName);
      const rawItems = data[0]?.[8];
      if (Array.isArray(rawItems)) {
        const places: CurrentResearchPlace[] = [];
        for (const item of rawItems) {
          const placeInfo = item[1];
          const rawTitle = item[2] || (placeInfo && placeInfo[2]);
          if (!rawTitle) continue;
          const title = cleanExtractedText(rawTitle);
          if (!title || isJunkNavigationText(title)) continue;

          const rawAddress = placeInfo ? placeInfo[4] : undefined;
          const address = rawAddress ? cleanExtractedText(rawAddress) : undefined;
          const rawNote = item[3] || undefined;
          const userNote = (rawNote && !isJunkNavigationText(rawNote)) ? cleanExtractedText(rawNote) : undefined;
          const coordinates = parseEntityListCoordinates(placeInfo);
          const sourcePlaceId = findEntityListPlaceId(item);
          const sourceUrl = googleMapsDetailUrlFromSourceId(sourcePlaceId, title, window.location.origin)
            || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;

          const research = PLACE_PARSER.extractEntityListResearch(item, title);
          const category = research.category || findEntityListCategory(item, title);
          const priceLevel = research.priceLevel;
          const detectedCurrency = detectCurrencyFromPage(window.location.href, priceLevel, undefined, overrideCurrency);

          places.push({
            title,
            sourceUrl,
            sourceProvider: 'google_maps',
            address,
            userNote,
            summary: userNote,
            rating: research.rating,
            reviewCount: research.reviewCount,
            category,
            priceLevel,
            detectedCurrency,
            types: research.types,
            coordinates,
            sourcePlaceId,
          });
        }

        if (places.length > 0) {
          return {
            listName,
            listUrl: window.location.href,
            detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, undefined, overrideCurrency),
            places,
            truncated: rawItems.length >= 500,
          };
        }
      }
    }
  } catch (e) {
    console.warn('Entitylist direct fetch failed:', e);
  }
  return null;
}

const SAVED_LIST_DETAIL_CONCURRENCY = 4;
const SAVED_LIST_DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
const savedListDetailCache = new Map<string, { at: number; facts: GoogleMapsResearchFacts }>();

async function fetchSavedListDetail(place: CurrentResearchPlace): Promise<GoogleMapsResearchFacts | null> {
  const key = place.sourcePlaceId || extractFeatureIdFromUrl(place.sourceUrl);
  if (!key || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(key.trim())) {
    const searchUrl = place.sourceUrl?.includes('/maps/search/')
      ? place.sourceUrl
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.title + (place.address ? ' ' + place.address : ''))}&hl=zh-CN`;
    logger.fetch('MapsTabDetail', `Resolving search-query pin for "${place.title}"`, { searchUrl });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(searchUrl, { credentials: 'include', signal: controller.signal });
      if (res.ok) {
        const html = (await res.text()).slice(0, 3_000_000);
        let facts = extractGoogleMapsResearchFromHtml(html);
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
        }
        logger.parser('MapsTabDetail', `Resolved facts for query pin "${place.title}"`, facts);
        return facts;
      }
    } catch (err) {
      logger.warn('MapsTabDetail', `Search query resolution failed for "${place.title}"`, err instanceof Error ? err.message : String(err));
    } finally {
      window.clearTimeout(timer);
    }
    return null;
  }
  if (!place.sourcePlaceId) place.sourcePlaceId = key;
  const cached = savedListDetailCache.get(key);
  if (cached && Date.now() - cached.at < SAVED_LIST_DETAIL_CACHE_TTL_MS) {
    return { ...cached.facts, sourcePlaceId: key };
  }

  // 1. Primary: Use fast structured /maps/preview/place endpoint for 0x... feature IDs
  const previewUrl = googleMapsPreviewPlaceUrl(key, window.location.origin);
  if (previewUrl) {
    logger.fetch('MapsTabDetail', `Fetching preview for "${place.title}"`, { previewUrl, key });
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
        logger.parser('MapsTabDetail', `Preview facts for "${place.title}"`, facts);
        savedListDetailCache.set(key, { at: Date.now(), facts });
        return facts;
      }
    } catch (err) {
      logger.warn('MapsTabDetail', `Preview fetch failed for "${place.title}"`, err instanceof Error ? err.message : String(err));
    } finally {
      window.clearTimeout(timer);
    }
  }

  // 2. Fallback: Detail URL HTML scraping
  const detailUrl = googleMapsDetailUrlFromSourceId(key, place.title, window.location.origin);
  if (!detailUrl) {
    logger.warn('MapsTabDetail', `Could not generate detail URL for "${place.title}" (key: ${key})`);
    return null;
  }
  logger.fetch('MapsTabDetail', `Fetching HTML for "${place.title}"`, { detailUrl, key });
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(detailUrl, { credentials: 'include', signal: controller.signal });
    if (!res.ok) {
      logger.warn('MapsTabDetail', `HTTP ${res.status} fetching "${place.title}"`, { url: detailUrl });
      return null;
    }
    const html = (await res.text()).slice(0, 3_000_000);
    const facts = extractGoogleMapsResearchFromHtml(html);
    facts.sourcePlaceId = key;
    logger.parser('MapsTabDetail', `Extracted facts for "${place.title}"`, {
      htmlLength: html.length,
      rating: facts.rating,
      reviewCount: facts.reviewCount,
      category: facts.category,
      priceLevel: facts.priceLevel,
      address: facts.address,
      coordinates: facts.coordinates,
    });
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

async function resolveGoogleMapsList(overrideCurrency?: string): Promise<DetectedSavedList | null> {
  const listId = extractGoogleMapsListId();
  if (listId && listId === lastScannedListId && cachedEntityList) {
    return cachedEntityList;
  }

  if (listId) {
    const entityList = await fetchGoogleMapsEntityList(listId, overrideCurrency);
    if (entityList) {
      cachedEntityList = entityList;
      lastScannedListId = listId;
      return cachedEntityList;
    }
  }

  // DOM-scan list detection removed: entitylist API is the only reliable source.
  // DOM scanning picks up UI chrome ("Compare prices", "Nearby", etc.) as fake places.
  return null;
}

function detectGoogleMapsListPlaces(): CurrentResearchPlace[] {
  return scanAllGoogleMapsPlaces();
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
    if (!title || title.length > 80 || isGenericNavigationTitle(title) || isJunkNavigationText(title) || isFakePlaceLabel(title)) continue;
    if (placeTitles.has(title.toLocaleLowerCase())) continue;
    return title;
  }
  return undefined;
}

function extractTabelogPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const titleEl = document.querySelector<HTMLElement>('h2.display-name span, h1.rstinfo-table__name, h1');
  const title = titleEl?.textContent?.trim();
  if (!title) return null;

  const ratingEl = document.querySelector<HTMLElement>('span.c-rating__val, b.c-rating__val');
  const rating = ratingEl?.textContent ? parseFloat(ratingEl.textContent.trim()) : undefined;

  const catEl = document.querySelector<HTMLElement>('span.rstinfo-table__badge, span.rstinfo-table__subject-text, div.rdhead-subinfo dl dd');
  const category = catEl?.textContent?.trim();

  const priceEl = document.querySelector<HTMLElement>('p.c-rating-v3__time span, span.c-rating-v3__val');
  const rawPrice = priceEl?.textContent?.trim();
  const priceLevel = rawPrice && isPlausiblePriceText(rawPrice) ? rawPrice : undefined;

  const addrEl = document.querySelector<HTMLElement>('p.rstinfo-table__address, p.rdhead-subinfo__address');
  const address = addrEl?.textContent?.trim();

  return {
    title,
    sourceUrl,
    sourceProvider: 'tabelog',
    rating: Number.isFinite(rating) && rating ? rating : undefined,
    category: category ? `Tabelog: ${category}` : 'Tabelog 美食',
    priceLevel,
    address,
  };
}

function extractXiaohongshuPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const titleEl = document.querySelector<HTMLElement>('#detail-title, .title, meta[property="og:title"]');
  const title = titleEl instanceof HTMLMetaElement ? titleEl.content : titleEl?.textContent?.trim();
  if (!title) return null;

  const descEl = document.querySelector<HTMLElement>('#detail-desc, .desc, .content');
  const summary = descEl?.textContent?.trim().slice(0, 200);

  const locEl = document.querySelector<HTMLElement>('.location-item, .geo, a[href*="/search_result?keyword="]');
  const address = locEl?.textContent?.trim();

  return {
    title: title.slice(0, 50),
    sourceUrl,
    sourceProvider: 'xiaohongshu',
    category: '小红书灵感',
    summary,
    address,
  };
}

function extractBookingPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const titleEl = document.querySelector<HTMLElement>('h2.d2fee87e0b, h2.pp-header__title, h1');
  const title = titleEl?.textContent?.trim();
  if (!title) return null;

  const ratingEl = document.querySelector<HTMLElement>('div.a3b8729ab1, div.d10a0e9803');
  const rating = ratingEl?.textContent ? parseFloat(ratingEl.textContent.trim()) : undefined;

  const addrEl = document.querySelector<HTMLElement>('span.hp_address_subtitle');
  const address = addrEl?.textContent?.trim();

  return {
    title,
    sourceUrl,
    sourceProvider: 'booking',
    rating: Number.isFinite(rating) && rating ? Math.min(5, Math.round((rating / 2) * 10) / 10) : undefined,
    category: 'Booking 住宿',
    address,
  };
}

function currentPlace(): CurrentResearchPlace | null {
  const provider = inferSourceProvider(window.location.href);
  if (provider === 'google_maps') return extractGoogleMapsPlace();
  if (provider === 'tabelog') return extractTabelogPlace();
  if (provider === 'xiaohongshu') return extractXiaohongshuPlace();
  if (provider === 'booking') return extractBookingPlace();
  return null;
}

export interface SavedListCardSummary {
  listId?: string;
  listName: string;
  count?: number;
  url?: string;
}

function scanAllSavedListsOnPage(): SavedListCardSummary[] {
  const listsMap = new Map<string, SavedListCardSummary>();

  const pushList = (listId: string | undefined, rawTitle: string, count: number | undefined, url: string) => {
    const title = cleanExtractedText(rawTitle);
    if (!title || title.length < 2 || title.length > 80) return;
    if (isGenericNavigationTitle(title) || isJunkNavigationText(title) || isFakePlaceLabel(title)) return;
    const key = (listId || title).toLowerCase();
    if (!listsMap.has(key)) {
      listsMap.set(key, { listId, listName: title, count, url });
    }
  };

  const countOf = (scope: HTMLElement | null): number | undefined => {
    const m = /(\d+)\s*(places|个地点|项|items)/i.exec(scope?.textContent || '');
    return m ? parseInt(m[1], 10) : undefined;
  };

  // Only real saved-list carriers qualify: an anchor that links to a placelist
  // (its href carries the list id needed for the entitylist fetch), or a card
  // that explicitly exposes data-list-id. Generic feed containers, role=listitem
  // blocks and bare anchors are Google UI chrome ("Compare prices", "Guests",
  // "All reviews", …) — matching them produced dozens of phantom "lists".
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

function detectXiaohongshuNoteList(): DetectedSavedList | null {
  const noteTitle = extractXiaohongshuPlace()?.title || document.title.replace(/ - 小红书$/, '');
  const found = new Map<string, CurrentResearchPlace>();

  const pushPlace = (rawTitle: string, url?: string) => {
    const title = cleanExtractedText(rawTitle).slice(0, 60);
    if (!title || title.length < 2 || isJunkNavigationText(title)) return;
    const key = title.toLowerCase();
    if (found.has(key)) return;
    found.set(key, {
      title,
      sourceUrl: url || `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(title)}`,
      sourceProvider: 'xiaohongshu',
      category: '小红书笔记地点',
      summary: `来自笔记「${noteTitle}」`,
    });
  };

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.location-item, .geo, a[href*="/search_result?keyword="], a[href*="/explore/"] .tag, #detail-desc a'))) {
    pushPlace(el.textContent?.trim() || '', (el as HTMLAnchorElement).href);
  }

  const descText = document.querySelector<HTMLElement>('#detail-desc, .desc, .content')?.textContent || '';
  for (const m of descText.matchAll(/📍\s*([^\n📍#]{2,30})/g)) pushPlace(m[1]);
  for (const m of descText.matchAll(/#([^#\s]{2,20})/g)) {
    if (/店|餐|cafe|咖啡|景点|hotel|bar/i.test(m[1])) pushPlace(m[1]);
  }

  if (found.size === 0) return null;
  return {
    listName: `📕 ${noteTitle}`,
    listUrl: window.location.href,
    detectedCurrency: undefined,
    places: [...found.values()],
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const msgType = (message as { type?: string }).type;
  if (msgType === 'OWNLY_GET_CURRENT_PLACE') {
    const start = Date.now();
    logger.debug('Content', 'OWNLY_GET_CURRENT_PLACE received', { url: window.location.href.slice(0, 80), overrideCurrency: (message as { overrideCurrency?: string }).overrideCurrency });
    void (async () => {
      try {
        const provider = inferSourceProvider(window.location.href);
        const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
        let savedList = provider === 'xiaohongshu' ? detectXiaohongshuNoteList() : null;
        if (!savedList || savedList.places.length === 0) {
          savedList = await resolveGoogleMapsList(overrideCurrency);
        }
        const allLists = scanAllSavedListsOnPage();
        const targetTags = ((message as { targetTags?: string[] }).targetTags || []).map((t) => t.trim().toLowerCase());
        const targetCurrency = (message as { targetCurrency?: string }).targetCurrency;

        // If page has multiple lists and no single list is currently open, auto-fetch the list matching the target trip tag
        if ((!savedList || savedList.places.length === 0) && targetTags.length > 0 && allLists.length > 0) {
          const matched = allLists.find((list) => matchesSavedListContext(list.listName, { tags: targetTags }));
          if (matched?.listId) {
            logger.info('Content', `Fetching matched list by tag: ${matched.listName}`, { listId: matched.listId });
            savedList = await fetchGoogleMapsEntityList(matched.listId, overrideCurrency);
          }
        }

        const detectedPlace = currentPlace();
        const place = provider === 'google_maps' && detectedPlace
          ? await enrichFromPlaceHtml(detectedPlace)
          : detectedPlace;
        logger.info('Content', 'OWNLY_GET_CURRENT_PLACE done', {
          provider, hasPlace: Boolean(place), title: place?.title?.slice(0, 30), hasSavedList: Boolean(savedList), savedCount: savedList?.places.length ?? 0, allLists: allLists.length, ms: Date.now() - start,
        });
        sendResponse({ place, savedList, allLists, detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, targetCurrency, overrideCurrency) });
      } catch (e) {
        logger.error('Content', 'OWNLY_GET_CURRENT_PLACE failed', e instanceof Error ? e.stack || e.message : String(e));
        console.warn('OWNLY_GET_CURRENT_PLACE failed:', e);
        sendResponse({ place: null, savedList: null, allLists: [] });
      }
    })();
    return true;
  }
  if (msgType === 'OWNLY_ENRICH_SAVED_LIST') {
    logger.debug('Content', 'OWNLY_ENRICH_SAVED_LIST received', { places: (message as { savedList?: DetectedSavedList }).savedList?.places.length, force: (message as { force?: boolean }).force });
    void (async () => {
      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string; force?: boolean }).savedList;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      const force = Boolean((message as { force?: boolean }).force);
      if (!incoming?.places?.length) {
        logger.warn('Content', 'OWNLY_ENRICH_SAVED_LIST empty incoming');
        sendResponse({ savedList: incoming ?? null, attempted: 0, enriched: 0, failed: 0 });
        return;
      }
      const start = Date.now();
      try {
        const result = await enrichSavedListDetails(incoming, overrideCurrency, force);
        logger.info('Content', 'OWNLY_ENRICH_SAVED_LIST done', { listName: incoming.listName, attempted: result.attempted, enriched: result.enriched, failed: result.failed, ms: Date.now() - start });
        sendResponse({ savedList: result.list, attempted: result.attempted, enriched: result.enriched, failed: result.failed });
      } catch (e) {
        logger.error('Content', 'OWNLY_ENRICH_SAVED_LIST error', String(e));
        sendResponse({ savedList: incoming, attempted: 0, enriched: 0, failed: 0 });
      }
    })();
    return true;
  }
  if (msgType === 'OWNLY_FETCH_LIST_BY_ID') {
    const lid = (message as { listId?: string }).listId || (message as { listUrl?: string }).listUrl?.slice(0, 60);
    logger.debug('Content', 'OWNLY_FETCH_LIST_BY_ID received', { lid });
    void (async () => {
      let listId = (message as { listId?: string }).listId;
      const listUrl = (message as { listUrl?: string }).listUrl;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      if (!listId && listUrl) listId = extractGoogleMapsSavedListId(listUrl);
      if (!listId) {
        logger.warn('Content', 'OWNLY_FETCH_LIST_BY_ID no id', { listUrl });
        sendResponse({ savedList: null });
        return;
      }
      const start = Date.now();
      const listData = await fetchGoogleMapsEntityList(listId, overrideCurrency);
      logger.info('Content', 'OWNLY_FETCH_LIST_BY_ID done', { listId, hasList: Boolean(listData), count: listData?.places.length ?? 0, ms: Date.now() - start });
      sendResponse({ savedList: listData });
    })();
    return true;
  }
  if (msgType === 'OWNLY_GET_VISIBLE_LIST_PLACES') {
    logger.debug('Content', 'OWNLY_GET_VISIBLE_LIST_PLACES received');
    void (async () => {
      const start = Date.now();
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      await autoScrollFeed();
      const savedList = await resolveGoogleMapsList(overrideCurrency);
      const listPlaces = savedList?.places ?? detectGoogleMapsListPlaces();
      const listName = savedList?.listName ?? detectVisibleGoogleMapsListName(listPlaces);
      logger.info('Content', 'OWNLY_GET_VISIBLE_LIST_PLACES done', { listName, count: listPlaces.length, truncated: savedList?.truncated, ms: Date.now() - start });
      sendResponse({ listPlaces, listName, truncated: savedList?.truncated ?? false });
    })();
    return true;
  }
  if (msgType === 'OWNLY_GET_SAVED_LIST') {
    void (async () => {
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      const savedList = await resolveGoogleMapsList(overrideCurrency);
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
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const isGoogleMaps = /google\.[a-z.]+\/maps|maps\.google\.[a-z.]+/i.test(window.location.href);
  if (isGoogleMaps) {
    const SCAN_DEBOUNCE_MS = 400;
    let scanTimer: number | undefined;
    const scheduleScan = () => {
      if (scanTimer !== undefined) window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(() => {
        scanTimer = undefined;
        scanAllGoogleMapsPlaces();
      }, SCAN_DEBOUNCE_MS);
    };
    window.addEventListener('scroll', scheduleScan, { passive: true });
    try {
      const observer = new MutationObserver(scheduleScan);
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } catch {}
  }
}
