import {
  inferPlaceKind,
  inferSourceProvider,
  extractPlaceCoordinates,
  type PlannerPlaceKind,
  type PlannerPlaceSourceProvider,
} from '../domain/planner';
import { cleanExtractedText, extractFeatureIdFromUrl, findEntityListCategory, findEntityListPlaceId, isFakePlaceLabel, isJunkNavigationText, isPlausiblePriceText, normalizePhoneDisplay, parseEntityListCoordinates, safeDecodeUri } from './utils';
import { SELECTORS, driftCheck } from './selectors';
import { PLACE_PARSER } from './place-parser';

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
    phone: target.phone ?? enriched.phone,
    plusCode: target.plusCode ?? enriched.plusCode,
    types: target.types && target.types.length > 0 ? target.types : enriched.types,
    priceLevel: target.priceLevel ?? enriched.priceLevel,
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
  // 0. Explicit user override from the side-panel selector always wins:
  //    the selector IS the map currency used to read prices on this page.
  const forced = overrideCurrency?.trim().toUpperCase();
  if (forced && forced !== 'AUTO') return forced;

  const currentUrl = sourceUrl || window.location.href;
  const hint = hintCurrency?.trim().toUpperCase() || undefined;
  const pageContentToScan: string[] = [];
  if (priceText) pageContentToScan.push(priceText);

  // Scan visible price elements on the page (place card, hotels, menu, reviews, footer)
  const priceElements = document.querySelectorAll<HTMLElement>(
    'span[aria-label*="价格"], span[aria-label*="Price"], span.fontBodyMedium, div.fontHeadlineSmall, span[class*="price"], div[aria-label*="per night"], div[aria-label*="每晚"]'
  );
  for (const el of Array.from(priceElements).slice(0, 15)) {
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (text && text.length < 50 && /[\$¥฿€£₩₫₹]|\b(sgd|hkd|twd|thb|usd|jpy|cny|eur|gbp|aud|cad|krw|vnd|myr|chf|inr)\b/i.test(text)) {
      pageContentToScan.push(text);
    }
  }

  const combinedPrices = pageContentToScan.join(' ');

  // 1. High-precision explicit currency symbol matching from screen
  if (/(?<![a-zA-Z])(?:s\$|\bsgd\b)/i.test(combinedPrices)) return 'SGD';
  if (/(?<![a-zA-Z])(?:hk\$|\bhkd\b)/i.test(combinedPrices)) return 'HKD';
  if (/(?<![a-zA-Z])(?:nt\$|\btwd\b|\bntd\b|新台币)/i.test(combinedPrices)) return 'TWD';
  if (/(?<![a-zA-Z])(?:au\$|a\$|\baud\b)/i.test(combinedPrices)) return 'AUD';
  if (/(?<![a-zA-Z])(?:ca\$|c\$|\bcad\b)/i.test(combinedPrices)) return 'CAD';
  if (/(?<![a-zA-Z])(?:nz\$|\bnzd\b)/i.test(combinedPrices)) return 'NZD';
  if (/(?<![a-zA-Z])(?:us\$|\busd\b)/i.test(combinedPrices)) return 'USD';
  if (/฿|\bthb\b|บาท/i.test(combinedPrices)) return 'THB';
  if (/₩|\bkrw\b|원/i.test(combinedPrices)) return 'KRW';
  if (/\brm\b|\bmyr\b/i.test(combinedPrices)) return 'MYR';
  if (/₫|\bvnd\b|đ/i.test(combinedPrices)) return 'VND';
  if (/€|\beur\b/i.test(combinedPrices)) return 'EUR';
  if (/£|\bgbp\b/i.test(combinedPrices)) return 'GBP';
  if (/₹|\binr\b/i.test(combinedPrices)) return 'INR';
  if (/\bchf\b/i.test(combinedPrices)) return 'CHF';
  if (/cn¥|\brmb\b|\bcny\b|人民币/i.test(combinedPrices)) return 'CNY';
  if (/jp¥|\bjpy\b|円/i.test(combinedPrices)) return 'JPY';

  // 2. Place-location coordinates are the strongest passive signal (immune to VPN/locale)
  const fullContext = (currentUrl + ' ' + document.title + ' ' + (document.body?.textContent?.slice(0, 1500) || '')).toLowerCase();

  // Coordinates extraction e.g. @1.3521,103.8198
  const coordMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(currentUrl);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (lat >= 1.15 && lat <= 1.48 && lng >= 103.55 && lng <= 104.08) return 'SGD'; // Singapore
    if (lat >= 22.15 && lat <= 22.58 && lng >= 113.80 && lng <= 114.45) return 'HKD'; // Hong Kong
    if (lat >= 21.80 && lat <= 25.40 && lng >= 119.80 && lng <= 122.10) return 'TWD'; // Taiwan
    if (lat >= 24.00 && lat <= 45.60 && lng >= 122.90 && lng <= 153.98) return 'JPY'; // Japan
    if (lat >= 5.60 && lat <= 20.50 && lng >= 97.30 && lng <= 105.70) return 'THB'; // Thailand
    if (lat >= 0.80 && lat <= 7.50 && lng >= 99.50 && lng <= 119.50) return 'MYR'; // Malaysia
  }

  // 3. Trip-currency prior beats page-localization context (VPN region, TLD):
  //    if we reach this point no explicit price symbol matched, so the user's
  //    declared travel currency is more meaningful than where Google served us.
  if (hint) return hint;

  // 4. Keywords & TLDs (page locale only — weakest signal)
  if (/\.com\.sg|\.sg\b|singapore|新加坡|changi|sentosa|marina bay/i.test(fullContext)) return 'SGD';
  if (/\.com\.hk|\.hk\b|hong kong|hongkong|香港|kowloon|九龙/i.test(fullContext)) return 'HKD';
  if (/\.com\.tw|\.tw\b|taiwan|taipei|台湾|台北|高雄/i.test(fullContext)) return 'TWD';
  if (/\.co\.th|\.th\b|thailand|bangkok|chiang mai|phuket|泰国|曼谷|清迈|普吉/i.test(fullContext)) return 'THB';
  if (/\.co\.jp|\.jp\b|japan|tokyo|osaka|kyoto|hokkaido|日本|东京|大阪|京都|北海道/i.test(fullContext)) return 'JPY';
  if (/\.com\.my|\.my\b|malaysia|kuala lumpur|penang|马来西亚|吉隆坡|槟城/i.test(fullContext)) return 'MYR';
  if (/\.com\.au|\.au\b|australia|sydney|melbourne|brisbane|澳大利亚|悉尼|墨尔本/i.test(fullContext)) return 'AUD';
  if (/\.ca\b|canada|toronto|vancouver|montreal|加拿大|多伦多|温哥华/i.test(fullContext)) return 'CAD';
  if (/\.co\.uk|\.uk\b|london|united kingdom|英国|伦敦/i.test(fullContext)) return 'GBP';
  if (/\.fr|\.de|\.it|\.es|\.nl|france|germany|italy|spain|paris|rome|berlin|欧洲|法国|德国|意大利/i.test(fullContext)) return 'EUR';

  // 5. Ambiguous symbols fallback
  if (combinedPrices.includes('¥')) {
    if (/円|japan|tokyo|osaka/i.test(fullContext) || document.documentElement.lang.startsWith('ja')) return 'JPY';
    return 'CNY';
  }
  if (combinedPrices.includes('$')) {
    if (/singapore|新加坡/i.test(fullContext)) return 'SGD';
    if (/hong kong|香港/i.test(fullContext)) return 'HKD';
    if (/australia|sydney|melbourne/i.test(fullContext)) return 'AUD';
    if (/canada|toronto|vancouver/i.test(fullContext)) return 'CAD';
    // Ambiguous bare "$": prefer the trip's declared currency before falling back to USD.
    if (hint) return hint;
    return 'USD';
  }

  return undefined;
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

          const category = findEntityListCategory(item) || ((address && address.includes(',')) ? address.split(',').slice(-2, -1)[0]?.trim() : undefined);

          places.push({
            title,
            sourceUrl,
            sourceProvider: 'google_maps',
            address,
            userNote,
            summary: userNote,
            category,
            detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, undefined, overrideCurrency),
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
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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
