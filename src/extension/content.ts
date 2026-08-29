import {
  convertPriceRange,
  DEFAULT_USD_PIVOT,
  inferPlaceKind,
  inferSourceProvider,
  extractPlaceCoordinates,
  type PlannerPlaceKind,
  type PlannerPlaceSourceProvider,
} from '../domain/planner';
import { cleanExtractedText, extractFeatureIdFromUrl, findEntityListCategory, findEntityListPlaceId, isFakePlaceLabel, isJunkNavigationText, isPlausiblePriceText, normalizePhoneDisplay, parseEntityListCoordinates, safeDecodeUri } from './utils';
import { SELECTORS, driftCheck } from './selectors';
import { PLACE_PARSER } from './place-parser';
import { detectPageCurrency } from './currency-detector';
import { extractGoogleMapsResearchFromHtml, googleMapsDetailUrlFromSourceId, type GoogleMapsResearchFacts } from './google-maps-research';

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
  // 1. Direct price attributes or dedicated badges
  const priceEl = document.querySelector<HTMLElement>(SELECTORS.priceBadge);
  if (priceEl) {
    const text = cleanExtractedText(priceEl.getAttribute('aria-label') || priceEl.textContent || '');
    if (text && text.length < 50 && !/^(路线|directions|save|保存)$/i.test(text) && isPlausiblePriceText(text)) return text;
  }

  // 2. Scan per-person budget in header info (e.g. "人均 ฿200–400", "¥1,000–2,000 per person", "￥2,000〜￥3,000")
  const infoSpans = document.querySelectorAll<HTMLElement>(SELECTORS.priceInfoSpans);
  for (const span of Array.from(infoSpans).slice(0, 10)) {
    const text = cleanExtractedText(span.textContent || '');
    if (/(人均|per person|每人|每晚|per night|[¥฿$€£₩]\s*\d+)/i.test(text) && text.length < 60 && isPlausiblePriceText(text)) {
      return text;
    }
  }

  // 3. Check for standalone price level ($$, $$$, ¥¥) in header pills
  const levelSpans = document.querySelectorAll<HTMLElement>(SELECTORS.priceLevels);
  for (const span of Array.from(levelSpans)) {
    const label = cleanExtractedText(span.getAttribute('aria-label') || span.textContent || '');
    if (label && isPlausiblePriceText(label)) return label;
  }

  // 4. Localized hotel-rate modules (e.g. "S$1,024 night", "THB 2,350", "From ¥18,000")
  const rateSpans = document.querySelectorAll<HTMLElement>(
    'div.fontBodyMedium span, div.fontHeadlineSmall span, div.W4Efsd span, div.mgr77e *, div[jsaction*="hotel"] span'
  );
  const RATE_TEXT = /(?:from\s+|约\s*)?(S\$|HK\$|US\$|NT\$|[¥฿$€£₩₫]|(?:USD|SGD|HKD|TWD|THB|JPY|CNY|RMB|EUR|GBP|MYR|KRW|VND|INR)\s?)\s?\d[\d.,]*(?:\s*[-–—〜~]\s*\d[\d.,]*)?(?:\s*[/·]?\s*(?:night|晚|person|人))?/i;
  for (const el of Array.from(rateSpans).slice(0, 60)) {
    const text = cleanExtractedText(el.textContent || '');
    if (!text || text.length > 50) continue;
    const match = RATE_TEXT.exec(text);
    if (match) {
      const candidate = cleanExtractedText(match[0]);
      if (isPlausiblePriceText(candidate)) return candidate;
    }
  }

  // 5. Last resort: any short text with both a currency marker and a digit
  const allSpans = document.querySelectorAll<HTMLElement>('span, div.fontBodyMedium, div.fontHeadlineSmall');
  for (const el of Array.from(allSpans).slice(0, 100)) {
    const text = cleanExtractedText(el.textContent || '');
    if (!text || text.length > 40) continue;
    if (/[\$¥฿€£₩]/.test(text) && /\d/.test(text) && !/[a-zA-Z]{4,}/.test(text.replace(/night|person|per|晚|人|酒店|price/i, ''))) {
      if (isPlausiblePriceText(text)) return text;
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
    const status = cleanExtractedText(openEl.textContent);
    if (status && status.length < 40) return status;
  }
  return undefined;
}

function extractOpenHours(): string | undefined {
  const hoursTable = document.querySelector<HTMLElement>(SELECTORS.hoursTable);
  if (hoursTable) {
    const rows = Array.from(hoursTable.querySelectorAll(SELECTORS.hoursRows));
    if (rows.length > 0) {
      const text = cleanExtractedText(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean).join('; '));
      if (text && text.length < 300) return text;
    }
  }

  const hoursEl = document.querySelector<HTMLElement>('div[data-item-id*="oh"]');
  if (hoursEl) {
    const aria = hoursEl.getAttribute('aria-label');
    if (aria && aria.length < 300) return cleanExtractedText(aria);
    const text = cleanExtractedText(hoursEl.textContent || '');
    if (text && text.length < 300) return text;
  }

  return undefined;
}

function extractWebsite(): string | undefined {
  const webEl = document.querySelector<HTMLAnchorElement>(SELECTORS.website);
  if (webEl?.href) return webEl.href;
  return undefined;
}

function extractPhone(): string | undefined {
  const el = document.querySelector<HTMLElement>(SELECTORS.phone);
  const aria = el?.getAttribute('aria-label') || '';
  const fromAria = aria.match(/[\+]?[\d][\d\s\-()·]{6,}/);
  if (fromAria) return normalizePhoneDisplay(fromAria[0]);
  const href = (el as HTMLAnchorElement)?.href || document.querySelector<HTMLAnchorElement>('a[href^="tel:"]')?.href;
  if (href?.startsWith('tel:')) return normalizePhoneDisplay(decodeURIComponent(href.slice(4)));
  return normalizePhoneDisplay(el?.textContent || undefined);
}

function extractPlusCode(): string | undefined {
  const el = document.querySelector<HTMLElement>(SELECTORS.plusCode);
  const text = cleanExtractedText(el?.textContent || el?.getAttribute('aria-label') || '');
  // Plus codes look like "2VH5+XX Bangkok" or "7M3C+GP Phuket"
  const match = /\b[A-Z0-9]{4}\+[A-Z0-9]{2,5}(?:\s+[^\n]{0,40})?/.exec(text.toUpperCase());
  return match ? cleanExtractedText(match[0]) : undefined;
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
  const cached = enrichCache.get(place.sourceUrl);
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
  enrichCache.set(place.sourceUrl, { at: Date.now(), place });
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
const scavengedListPlaces = new Map<string, CurrentResearchPlace>();
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
    scavengedListPlaces.clear();
    lastScannedPageUrl = canonical;
    return;
  }
  if (scavengedListPlaces.size <= MAX_SCAVENGED_PLACES) return;
  const dropCount = Math.floor(MAX_SCAVENGED_PLACES / 3);
  for (const key of [...scavengedListPlaces.keys()].slice(0, dropCount)) {
    scavengedListPlaces.delete(key);
  }
}

function isGenericNavigationTitle(text: string): boolean {
  const norm = text.trim().toLowerCase();
  return /^(google|google maps|google 地图|directions|路线|保存|已保存|saved|share|分享|搜索|search|返回|back|菜单|menu|overview|概览|reviews|评价|photos|照片|about|关于)$/i.test(norm);
}

function readCardFields(card: HTMLElement | null) {
  const ratingText = card?.querySelector<HTMLElement>(SELECTORS.cardRating)?.textContent?.trim() ||
    card?.querySelector<HTMLElement>(SELECTORS.ratingAria)?.getAttribute('aria-label');
  const rating = PLACE_PARSER.parseRating(ratingText);

  const infoText = card?.querySelector<HTMLElement>(SELECTORS.cardInfo)?.textContent?.trim();
  const subInfo = PLACE_PARSER.parseSubtitleInfo(infoText);

  const rawAddr = card?.querySelector<HTMLElement>(SELECTORS.address)?.textContent?.trim();
  const address = rawAddr ? cleanExtractedText(rawAddr) : (subInfo.area || undefined);
  const rawNote = card?.querySelector<HTMLElement>(SELECTORS.cardNote)?.textContent?.trim();
  const userNote = (rawNote && !isJunkNavigationText(rawNote)) ? cleanExtractedText(rawNote) : undefined;

  return {
    rating: rating ?? subInfo.rating,
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

  const titleKey = cleanTitle.toLowerCase();
  if (scavengedListPlaces.has(titleKey)) return;

  const fields = readCardFields(card);
  const url = sourceUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`;
  const kind = inferPlaceKind((fields.category || '') + ' ' + cleanTitle + ' ' + (fields.address || ''));

  scavengedListPlaces.set(titleKey, {
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

  return Array.from(scavengedListPlaces.values());
}

function extractGoogleMapsPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const listPlaces = scanAllGoogleMapsPlaces();
  const isDedicatedPlacePage = /\/maps\/place\/[^/?#]+/.test(window.location.pathname) || /data=.*!1s0x/.test(window.location.href);

  // If there are multiple places in a list, don't falsely recognize the list header as a single place
  if (listPlaces.length > 1 && !isDedicatedPlacePage) {
    return null;
  }
  
  // Exclude explicitly known list URL patterns even if places are 0
  if (!isDedicatedPlacePage && (sourceUrl.includes('!2s') || sourceUrl.includes('/placelists/'))) {
    return null;
  }

  const jsonLd = PLACE_PARSER.extractJsonLd(document);
  const heading = document.querySelector<HTMLElement>(SELECTORS.placeHeading)
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || jsonLd.title || titleFromUrl(sourceUrl);
  if (!title && isDedicatedPlacePage) {
    driftCheck('placeHeading', null);
  }
  if (!title || (!/\/maps\/(place|search|dir|saved|@)\//.test(window.location.pathname) && !window.location.pathname.includes('/maps/'))) return null;

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
  // Check URL pathname and search parameters for list ID pattern !2s<ID>
  const urlMatch = /!2s([A-Za-z0-9_-]{20,})/.exec(window.location.href);
  if (urlMatch?.[1]) return urlMatch[1];

  const placeListMatch = /\/placelists\/list\/([A-Za-z0-9_-]{20,})/.exec(window.location.href);
  if (placeListMatch?.[1]) return placeListMatch[1];

  // Check preload/fetch links and all anchors in document
  const links = document.querySelectorAll<HTMLLinkElement | HTMLAnchorElement>(
    'link[href*="getlist"], link[href*="entitylist"], a[href*="!2s"], a[href*="/placelists/list/"]'
  );
  for (const l of Array.from(links)) {
    const href = l.href || '';
    const m = /!1s([A-Za-z0-9_-]{20,})|!2s([A-Za-z0-9_-]{20,})|\/placelists\/list\/([A-Za-z0-9_-]{20,})/.exec(href);
    if (m?.[1] || m?.[2] || m?.[3]) {
      return m[1] || m[2] || m[3];
    }
  }

  // Check document head / scripts
  if (document.head) {
    const headHtml = document.head.innerHTML;
    const m = /entitylist\/getlist[^\"]*pb=[^\"]*!1s([A-Za-z0-9_-]{20,})/.exec(headHtml);
    if (m?.[1]) return m[1];
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
          const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;

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
            sourcePlaceId: findEntityListPlaceId(item),
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
  const key = place.sourcePlaceId;
  if (!key) return null;
  const cached = savedListDetailCache.get(key);
  if (cached && Date.now() - cached.at < SAVED_LIST_DETAIL_CACHE_TTL_MS) return cached.facts;

  const detailUrl = googleMapsDetailUrlFromSourceId(key, place.title, window.location.origin);
  if (!detailUrl) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(detailUrl, { credentials: 'include', signal: controller.signal });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 3_000_000);
    const facts = extractGoogleMapsResearchFromHtml(html);
    savedListDetailCache.set(key, { at: Date.now(), facts });
    return facts;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function enrichSavedListDetails(
  list: DetectedSavedList,
  overrideCurrency?: string,
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
      if (!place.sourcePlaceId) continue;
      if (place.rating !== undefined && place.reviewCount !== undefined && place.category && place.priceLevel) continue;
      attempted += 1;
      const facts = await fetchSavedListDetail(place);
      if (!facts) {
        failed += 1;
        continue;
      }
      const nextPrice = place.priceLevel ?? facts.priceLevel;
      places[index] = {
        ...place,
        rating: place.rating ?? facts.rating,
        reviewCount: place.reviewCount ?? facts.reviewCount,
        category: place.category ?? facts.category,
        priceLevel: nextPrice,
        detectedCurrency: detectCurrencyFromPage(
          place.sourceUrl,
          nextPrice,
          facts.priceCurrency ?? place.detectedCurrency ?? list.detectedCurrency,
          overrideCurrency,
        ),
        address: place.address ?? facts.address,
        website: place.website ?? facts.website,
        phone: place.phone ?? facts.phone,
        types: place.types?.length ? place.types : facts.types,
      };
      if (facts.rating !== undefined || facts.reviewCount !== undefined || facts.category || facts.priceLevel) enriched += 1;
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
  return extractGoogleMapsPlace();
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
  const listAnchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/placelists/list/"], a[href*="!2s"]');
  for (const anchor of Array.from(listAnchors)) {
    const href = anchor.href || '';
    const listIdMatch = href.match(/!2s([A-Za-z0-9_-]{15,})|\/placelists\/list\/([A-Za-z0-9_-]{15,})/);
    const listId = listIdMatch?.[1] || listIdMatch?.[2];
    if (!listId) continue;

    const card = anchor.closest<HTMLElement>('div[role="listitem"], div.m6QErb, div.Nv2PK, li') ?? anchor;
    const titleEl = card.querySelector<HTMLElement>('.qBF1Pd, .fontHeadlineSmall, [role="heading"], h2, h3');
    const title = titleEl?.textContent?.trim() || anchor.getAttribute('aria-label')?.trim() || '';
    pushList(listId, title, countOf(card), href || window.location.href);
  }

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-list-id]'))) {
    const dataId = el.getAttribute('data-list-id') || '';
    if (dataId.length < 15) continue;
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
          const matched = allLists.find((l) => {
            const name = l.listName.toLowerCase();
            return targetTags.some((t) => t && (name === t || name.includes(t) || t.includes(name)));
          });
          if (matched?.listId) {
            savedList = await fetchGoogleMapsEntityList(matched.listId, overrideCurrency);
          }
        }

        const place = currentPlace();
        sendResponse({ place, savedList, allLists, detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, targetCurrency, overrideCurrency) });
      } catch (e) {
        console.warn('OWNLY_GET_CURRENT_PLACE failed:', e);
        sendResponse({ place: null, savedList: null, allLists: [] });
      }
    })();
    return true;
  }
  if (msgType === 'OWNLY_ENRICH_SAVED_LIST') {
    void (async () => {
      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string }).savedList;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      if (!incoming?.places?.length) {
        sendResponse({ savedList: incoming ?? null, attempted: 0, enriched: 0, failed: 0 });
        return;
      }
      const result = await enrichSavedListDetails(incoming, overrideCurrency);
      sendResponse({ savedList: result.list, attempted: result.attempted, enriched: result.enriched, failed: result.failed });
    })();
    return true;
  }
  if (msgType === 'OWNLY_FETCH_LIST_BY_ID') {
    void (async () => {
      let listId = (message as { listId?: string }).listId;
      const listUrl = (message as { listUrl?: string }).listUrl;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      if (!listId && listUrl) {
        const m = /!2s([A-Za-z0-9_-]{20,})|\/placelists\/list\/([A-Za-z0-9_-]{20,})/.exec(listUrl);
        listId = m?.[1] || m?.[2];
      }
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
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      await autoScrollFeed();
      const savedList = await resolveGoogleMapsList(overrideCurrency);
      const listPlaces = savedList?.places ?? detectGoogleMapsListPlaces();
      sendResponse({ listPlaces, truncated: savedList?.truncated ?? false });
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
  if (msgType === 'OWNLY_CURRENCY_OVERRIDE_CHANGED') {
    const override = (message as { overrideCurrency?: string }).overrideCurrency;
    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;
    sendResponse({ ok: true, override: fxOverrideCurrency });
    return true;
  }
  if (msgType === 'OWNLY_REDETECT_PAGE_CURRENCY') {
    const target = (message as { targetCurrency?: string }).targetCurrency;
    const detected = detectCurrencyFromPage(window.location.href, undefined, target);
    sendResponse({ detectedCurrency: detected });
    return true;
  }
  if (msgType === 'OWNLY_FX_TOOLTIP_STATUS_CHANGED') {
    const enabled = (message as { enabled?: boolean }).enabled !== false;
    fxTooltipEnabled = enabled;
    if (!enabled && tooltipHideFn) tooltipHideFn();
    sendResponse({ ok: true });
    return true;
  }
  if (msgType === 'OWNLY_FX_CONFIG_UPDATED') {
    const target = (message as { targetCurrency?: string }).targetCurrency;
    const rates = (message as { rates?: Record<string, number> }).rates;
    const enabled = (message as { enabled?: boolean }).enabled;
    if (target) fxTargetCurrency = target;
    if (rates) fxPivotRates = rates;
    if (typeof enabled === 'boolean') fxTooltipEnabled = enabled;
    sendResponse({ ok: true });
    return true;
  }
});

// ==========================================
// Currency Hover Conversion Tooltip Engine
// ==========================================

let fxTargetCurrency = 'CNY';
let fxPivotRates: Record<string, number> = DEFAULT_USD_PIVOT;
let fxTooltipEnabled = true;
let fxOverrideCurrency: string | undefined = undefined;
let tooltipHideFn: (() => void) | null = null;

function initFxTooltipEngine() {
  if (typeof document === 'undefined') return;

  function applyOverride(override?: string) {
    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;
  }

  try {
    // Query background for FX rates & target currency
    void chrome.runtime.sendMessage({ type: 'OWNLY_GET_FX_CONFIG' })
      .then((val: unknown) => {
        const res = val as {
          ok?: boolean;
          targetCurrency?: string;
          rates?: Record<string, number>;
          enabled?: boolean;
          overrideCurrency?: string;
        } | undefined;
        if (res?.ok) {
          if (res.targetCurrency) fxTargetCurrency = res.targetCurrency;
          if (res.rates) fxPivotRates = res.rates;
          if (typeof res.enabled === 'boolean') fxTooltipEnabled = res.enabled;
          applyOverride(res.overrideCurrency);
        }
      })
      .catch(() => {});
  } catch {}

  const style = document.createElement('style');
  style.id = 'ownly-fx-styles';
  style.textContent = `
    #ownly-fx-tooltip {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px) scale(0.98);
      transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      max-width: 320px;
      user-select: none;
    }
    #ownly-fx-tooltip.ownly-fx-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .ownly-fx-card {
      background: rgba(24, 24, 27, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      padding: 8px 12px;
      box-shadow: 0 10px 28px -4px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06);
      color: #f4f4f5;
    }
    .ownly-fx-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 2px;
      font-size: 10.5px;
      color: #a1a1aa;
      font-weight: 500;
    }
    .ownly-fx-title {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #a1a1aa;
    }
    .ownly-fx-converted-val {
      font-size: 16px;
      font-weight: 700;
      color: #34d399;
      letter-spacing: -0.01em;
      line-height: 1.25;
      margin-bottom: 3px;
    }
    .ownly-fx-sub-info {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 10px;
      color: #71717a;
    }
    .ownly-fx-rate {
      color: #a1a1aa;
      font-variant-numeric: tabular-nums;
    }
    .ownly-fx-badge {
      background: rgba(255, 255, 255, 0.1);
      padding: 1px 4px;
      border-radius: 4px;
      color: #d4d4d8;
      font-size: 9px;
    }
    .ownly-fx-close {
      background: transparent;
      border: none;
      color: #71717a;
      cursor: pointer;
      font-size: 11px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .ownly-fx-close:hover {
      color: #f4f4f5;
      background: rgba(255, 255, 255, 0.12);
    }
  `;
  if (!document.getElementById('ownly-fx-styles')) {
    document.head.appendChild(style);
  }

  let tooltipNode = document.getElementById('ownly-fx-tooltip') as HTMLDivElement | null;
  if (!tooltipNode) {
    tooltipNode = document.createElement('div');
    tooltipNode.id = 'ownly-fx-tooltip';
    tooltipNode.innerHTML = `
      <div class="ownly-fx-card">
        <div class="ownly-fx-header">
          <span class="ownly-fx-title"><span>💱</span> <span>汇率换算</span></span>
          <button class="ownly-fx-close" type="button" title="关闭浮窗">✕</button>
        </div>
        <div class="ownly-fx-converted-val" id="ownly-fx-converted-val">--</div>
        <div class="ownly-fx-sub-info">
          <span class="ownly-fx-rate" id="ownly-fx-rate">--</span>
          <span class="ownly-fx-badge" id="ownly-fx-badge">行程货币</span>
        </div>
      </div>
    `;
    document.body.appendChild(tooltipNode);

    const closeBtn = tooltipNode.querySelector('.ownly-fx-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTooltip();
    });
  }

  const convertedValEl = document.getElementById('ownly-fx-converted-val');
  const rateEl = document.getElementById('ownly-fx-rate');
  const badgeEl = document.getElementById('ownly-fx-badge');

  function showTooltip(rect: DOMRect, result: import('../domain/planner').ConvertedPriceResult) {
    if (!tooltipNode || !convertedValEl || !rateEl || !badgeEl) return;

    convertedValEl.textContent = `≈ ${result.formattedTarget}`;
    rateEl.textContent = result.rateDescription;
    badgeEl.textContent = `${result.targetCurrency}`;

    const tooltipWidth = 230;
    const tooltipHeight = 65;

    let top = rect.top - tooltipHeight - 8;
    if (top < 10) {
      top = rect.bottom + 8;
    }
    let left = rect.left + (rect.width - tooltipWidth) / 2;
    left = Math.max(10, Math.min(window.innerWidth - tooltipWidth - 10, left));

    tooltipNode.style.top = `${Math.round(top)}px`;
    tooltipNode.style.left = `${Math.round(left)}px`;
    tooltipNode.classList.add('ownly-fx-visible');
  }

  function hideTooltip() {
    if (!tooltipNode) return;
    tooltipNode.classList.remove('ownly-fx-visible');
  }
  tooltipHideFn = hideTooltip;

  function handleTextSelection() {
    if (!fxTooltipEnabled) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideTooltip();
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length > 80) {
      hideTooltip();
      return;
    }

    const pageCurrency = fxOverrideCurrency || detectCurrencyFromPage(window.location.href, selectedText, fxTargetCurrency, fxOverrideCurrency);
    const converted = convertPriceRange(selectedText, fxTargetCurrency, fxPivotRates, pageCurrency);
    if (converted && converted.sourceCurrency !== converted.targetCurrency) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        showTooltip(rect, converted);
      }
    } else {
      hideTooltip();
    }
  }

  document.addEventListener('mouseup', (event) => {
    const target = event.target as HTMLElement | null;
    if (tooltipNode?.contains(target)) return;
    setTimeout(handleTextSelection, 15);
  });

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) {
      setTimeout(handleTextSelection, 15);
    }
  });

  document.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement | null;
    if (tooltipNode && !tooltipNode.contains(target)) {
      hideTooltip();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTooltip();
  });
}

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
  initFxTooltipEngine();
}
