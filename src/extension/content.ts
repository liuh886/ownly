import { inferSourceProvider, extractPlaceCoordinates, type PlannerPlaceSourceProvider } from '../domain/planner';
import { cleanExtractedText, findEntityListPlaceId, isJunkNavigationText, isPlausiblePriceText, parseEntityListCoordinates, safeDecodeUri } from './utils';
import { SELECTORS, driftCheck } from './selectors';

export interface CurrentResearchPlace {
  title: string;
  sourceUrl: string;
  sourceProvider: PlannerPlaceSourceProvider;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  detectedCurrency?: string;
  address?: string;
  summary?: string;
  userNote?: string;
  openStatus?: string;
  openHours?: string;
  website?: string;
  coordinates?: { lat: number; lng: number };
  sourcePlaceId?: string;
  tierNote?: string;
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
  if (ratingEl?.textContent) {
    const val = parseFloat(ratingEl.textContent.replace(',', '.').trim());
    if (Number.isFinite(val) && val >= 1 && val <= 5) return val;
  }
  const ariaEl = document.querySelector<HTMLElement>(SELECTORS.ratingAria);
  if (ariaEl) {
    const aria = ariaEl.getAttribute('aria-label') || '';
    const match = /(\d+(\.\d+)?)/.exec(aria);
    if (match?.[1]) {
      const val = parseFloat(match[1]);
      if (Number.isFinite(val) && val >= 1 && val <= 5) return val;
    }
  }
  return undefined;
}

function extractReviewCount(): number | undefined {
  const countEl = document.querySelector<HTMLElement>(SELECTORS.reviewCount);
  if (countEl) {
    const text = countEl.textContent || countEl.getAttribute('aria-label') || '';
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned) {
      const count = parseInt(cleaned, 10);
      if (Number.isFinite(count) && count > 0) return count;
    }
  }
  return undefined;
}

function extractCategory(): string | undefined {
  const catBtn = document.querySelector<HTMLElement>(SELECTORS.category);
  if (catBtn?.textContent) {
    const cat = cleanExtractedText(catBtn.textContent);
    if (cat && cat.length < 50 && !/^(directions|save|share|nearby|路线|保存|分享|附近)$/i.test(cat)) return cat;
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

export function detectCurrencyFromPage(sourceUrl: string, priceText?: string): string | undefined {
  const currentUrl = sourceUrl || window.location.href;
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
  if (/s\$|\bsgd\b/i.test(combinedPrices)) return 'SGD';
  if (/hk\$|\bhkd\b/i.test(combinedPrices)) return 'HKD';
  if (/nt\$|\btwd\b|\bntd\b|新台币/i.test(combinedPrices)) return 'TWD';
  if (/au\$|a\$|\baud\b/i.test(combinedPrices)) return 'AUD';
  if (/ca\$|c\$|\bcad\b/i.test(combinedPrices)) return 'CAD';
  if (/nz\$|\bnzd\b/i.test(combinedPrices)) return 'NZD';
  if (/us\$|\busd\b/i.test(combinedPrices)) return 'USD';
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

  // 2. Geographic & Domain Context (TLD, URL keywords, Coordinates, Address context)
  const fullContext = (currentUrl + ' ' + document.title + ' ' + (document.body?.innerText?.slice(0, 1500) || '')).toLowerCase();

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

  // Keywords & TLDs
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

  // 3. Ambiguous symbols fallback
  if (combinedPrices.includes('¥')) {
    if (/円|japan|tokyo|osaka/i.test(fullContext) || document.documentElement.lang.startsWith('ja')) return 'JPY';
    return 'CNY';
  }
  if (combinedPrices.includes('$')) {
    if (/singapore|新加坡/i.test(fullContext)) return 'SGD';
    if (/hong kong|香港/i.test(fullContext)) return 'HKD';
    if (/australia|sydney|melbourne/i.test(fullContext)) return 'AUD';
    if (/canada|toronto|vancouver/i.test(fullContext)) return 'CAD';
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

function pruneScavengedCache(pageUrl: string): void {
  if (pageUrl !== lastScannedPageUrl) {
    scavengedListPlaces.clear();
    lastScannedPageUrl = pageUrl;
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

    const ratingText = card?.querySelector<HTMLElement>(SELECTORS.cardRating)?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

    const infoText = card?.querySelector<HTMLElement>(SELECTORS.cardInfo)?.textContent?.trim();
    const category = infoText ? cleanExtractedText(infoText.split(/·|•/)[0]?.trim()) : undefined;
    const rawAddr = card?.querySelector<HTMLElement>(SELECTORS.address)?.textContent?.trim();
    const address = rawAddr ? cleanExtractedText(rawAddr) : undefined;
    const rawNote = card?.querySelector<HTMLElement>(SELECTORS.cardNote)?.textContent?.trim();
    const userNote = (rawNote && !isJunkNavigationText(rawNote)) ? cleanExtractedText(rawNote) : undefined;

    const cleanTitle = cleanExtractedText(title);
    if (!cleanTitle || cleanTitle.length < 2 || isGenericNavigationTitle(cleanTitle) || isJunkNavigationText(cleanTitle)) continue;
    const titleKey = cleanTitle.toLowerCase();
    if (!scavengedListPlaces.has(titleKey)) {
      scavengedListPlaces.set(titleKey, {
        title: cleanTitle,
        sourceUrl: href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`,
        sourceProvider: 'google_maps',
        rating: Number.isFinite(rating) && rating && rating >= 1 && rating <= 5 ? rating : undefined,
        category,
        address,
        detectedCurrency: detectCurrencyFromPage(href, undefined),
        summary: userNote,
        userNote,
        coordinates: extractPlaceCoordinates(href || '') ?? undefined,
      });
    }
  }

  // Strategy 2: Scan all distinct item card containers inside lists
  const cardElements = document.querySelectorAll<HTMLElement>(
    `${SELECTORS.cardContainers}, div[role="feed"] > div`
  );
  for (const card of Array.from(cardElements)) {
    const headEl = card.querySelector<HTMLElement>(SELECTORS.cardTitle);
    const title = headEl?.textContent?.trim() || card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[aria-label]')?.getAttribute('aria-label') || '';
    const cleanTitle = cleanExtractedText(title);
    if (!cleanTitle || cleanTitle.length < 2 || cleanTitle.length > 80 || isGenericNavigationTitle(cleanTitle) || isJunkNavigationText(cleanTitle)) continue;

    const linkEl = card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[href*="/maps/place/"], a[href*="/place/"], a[data-place-id]');
    const sourceUrl = linkEl?.href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`;

    const ratingText = card.querySelector<HTMLElement>(SELECTORS.cardRating)?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

    const infoText = card.querySelector<HTMLElement>(SELECTORS.cardInfo)?.textContent?.trim();
    const category = infoText ? cleanExtractedText(infoText.split(/·|•/)[0]?.trim()) : undefined;
    const rawAddr = card.querySelector<HTMLElement>(SELECTORS.address)?.textContent?.trim();
    const address = rawAddr ? cleanExtractedText(rawAddr) : undefined;
    const rawNote = card.querySelector<HTMLElement>(SELECTORS.cardNote)?.textContent?.trim();
    const userNote = (rawNote && !isJunkNavigationText(rawNote)) ? cleanExtractedText(rawNote) : undefined;

    const titleKey = cleanTitle.toLowerCase();
    if (!scavengedListPlaces.has(titleKey)) {
      scavengedListPlaces.set(titleKey, {
        title: cleanTitle,
        sourceUrl,
        sourceProvider: 'google_maps',
        rating: Number.isFinite(rating) && rating && rating >= 1 && rating <= 5 ? rating : undefined,
        category,
        address,
        detectedCurrency: detectCurrencyFromPage(sourceUrl, undefined),
        summary: userNote,
        userNote,
        coordinates: extractPlaceCoordinates(sourceUrl) ?? undefined,
      });
    }
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
    const cleanTitle = cleanExtractedText(title);
    if (!cleanTitle || cleanTitle.length < 2 || cleanTitle.length > 80 || isGenericNavigationTitle(cleanTitle) || isJunkNavigationText(cleanTitle)) continue;

    const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="/maps/place/"], a[href*="/place/"], a.hfpxzc, a');
    const sourceUrl = linkEl?.href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`;

    const ratingText = card.querySelector<HTMLElement>(SELECTORS.cardRating)?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

    const infoText = card.querySelector<HTMLElement>(SELECTORS.cardInfo)?.textContent?.trim();
    const category = infoText ? cleanExtractedText(infoText.split(/·|•/)[0]?.trim()) : undefined;
    const rawAddr = card.querySelector<HTMLElement>(SELECTORS.address)?.textContent?.trim();
    const address = rawAddr ? cleanExtractedText(rawAddr) : undefined;
    const rawNote = card.querySelector<HTMLElement>(SELECTORS.cardNote)?.textContent?.trim();
    const userNote = (rawNote && !isJunkNavigationText(rawNote)) ? cleanExtractedText(rawNote) : undefined;

    const titleKey = cleanTitle.toLowerCase();
    if (!scavengedListPlaces.has(titleKey)) {
      scavengedListPlaces.set(titleKey, {
        title: cleanTitle,
        sourceUrl,
        sourceProvider: 'google_maps',
        rating: Number.isFinite(rating) && rating && rating >= 1 && rating <= 5 ? rating : undefined,
        category,
        address,
        detectedCurrency: detectCurrencyFromPage(sourceUrl, undefined),
        summary: userNote,
        userNote,
        coordinates: extractPlaceCoordinates(sourceUrl) ?? undefined,
      });
    }
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

  const heading = document.querySelector<HTMLElement>(SELECTORS.placeHeading)
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || titleFromUrl(sourceUrl);
  if (!title && isDedicatedPlacePage) {
    driftCheck('placeHeading', null);
  }
  if (!title || (!/\/maps\/(place|search|dir|saved|@)\//.test(window.location.pathname) && !window.location.pathname.includes('/maps/'))) return null;

  const priceLevel = extractPrice();
  const address = extractAddress();
  const detectedCurrency = detectCurrencyFromPage(sourceUrl, priceLevel);
  const userNote = extractUserNote();
  const summary = extractSummary();
  const openHours = extractOpenHours();
  const openStatus = extractOpenStatus();

  return {
    title,
    sourceUrl,
    sourceProvider: 'google_maps',
    rating: extractRating(),
    reviewCount: extractReviewCount(),
    category: extractCategory(),
    priceLevel,
    detectedCurrency,
    address,
    summary,
    userNote,
    openStatus,
    openHours,
    website: extractWebsite(),
    coordinates: extractPlaceCoordinates(sourceUrl) ?? undefined,
    tierNote: extractHotelTier(),
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

async function fetchGoogleMapsEntityList(listId: string): Promise<DetectedSavedList | null> {
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

          places.push({
            title,
            sourceUrl,
            sourceProvider: 'google_maps',
            address,
            userNote,
            summary: userNote,
            category: (address && address.includes(',')) ? address.split(',').slice(-2, -1)[0]?.trim() : 'Google Maps 收藏地点',
            detectedCurrency: detectCurrencyFromPage(window.location.href, undefined),
            coordinates,
            sourcePlaceId: findEntityListPlaceId(item),
          });
        }

        if (places.length > 0) {
          return {
            listName,
            listUrl: window.location.href,
            detectedCurrency: detectCurrencyFromPage(window.location.href, undefined),
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

async function resolveGoogleMapsList(): Promise<DetectedSavedList | null> {
  const listId = extractGoogleMapsListId();
  if (listId && listId === lastScannedListId && cachedEntityList) {
    return cachedEntityList;
  }

  if (listId) {
    const entityList = await fetchGoogleMapsEntityList(listId);
    if (entityList) {
      cachedEntityList = entityList;
      lastScannedListId = listId;
      return cachedEntityList;
    }
  }

  // Fallback to DOM scan
  const domList = detectGoogleMapsSavedList();
  if (domList) {
    cachedEntityList = domList;
    return domList;
  }
  return null;
}

function detectGoogleMapsSavedList(): DetectedSavedList | null {
  // Extract list name from Google Maps Saved / Lists page
  let listName = '';
  const heading = document.querySelector<HTMLElement>(SELECTORS.savedListHeading);
  if (heading?.textContent?.trim()) {
    listName = heading.textContent.trim();
  } else {
    const docTitle = document.title || '';
    const match = /^(.*?)\s*[-–—·]\s*Google/i.exec(docTitle);
    if (match?.[1]) {
      listName = match[1].trim();
    }
  }

  const places = scanAllGoogleMapsPlaces();
  if (!listName && places.length === 0) return null;

  const listCurrency = detectCurrencyFromPage(window.location.href, undefined);

  return {
    listName: listName || 'Google Maps 收藏列表',
    listUrl: window.location.href,
    detectedCurrency: listCurrency,
    places,
  };
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

  // Look for any elements that represent a saved list
  const listElements = document.querySelectorAll<HTMLElement>(
    'a[href*="/placelists/list/"], a[href*="!2s"], div[data-list-id], div.THL29e, div.jANrlb, div.Nv2PK, div[role="listitem"], div.m6QErb > div, div[role="article"], div[jsaction*="list"]'
  );

  for (const el of Array.from(listElements)) {
    const anchor = el instanceof HTMLAnchorElement ? el : el.querySelector<HTMLAnchorElement>('a[href*="/placelists/list/"], a[href*="!2s"], a');
    const href = anchor?.href || '';
    const listIdMatch = href.match(/!2s([A-Za-z0-9_-]{15,})|\/placelists\/list\/([A-Za-z0-9_-]{15,})/);
    let listId = listIdMatch?.[1] || listIdMatch?.[2];

    if (!listId) {
      const dataId = el.getAttribute('data-list-id') || el.dataset?.id || el.getAttribute('data-id');
      if (dataId && dataId.length > 15) listId = dataId;
    }

    if (!listId) {
      const jsaction = el.getAttribute('jsaction') || '';
      const jsMatch = /list[:;]([A-Za-z0-9_-]{15,})/.exec(jsaction);
      if (jsMatch) listId = jsMatch[1];
    }

    const titleEl = el.querySelector<HTMLElement>('.qBF1Pd, .fontHeadlineSmall, .OSrXXb, [role="heading"], h2, h3, div.fontBodyLarge, div.fontHeadlineMedium, div[class*="title"], span[class*="title"]');
    const title = titleEl?.textContent?.trim() || anchor?.getAttribute('aria-label')?.trim() || el.getAttribute('aria-label')?.trim() || '';
    if (!title || title.length < 2 || isGenericNavigationTitle(title)) continue;

    // Check count (e.g. "19 places" or "19 个地点")
    const countText = el.textContent || '';
    const countMatch = /(\d+)\s*(places|个地点|项|items)/i.exec(countText);
    const count = countMatch ? parseInt(countMatch[1], 10) : undefined;

    const key = (listId || title).toLowerCase();
    if (!listsMap.has(key)) {
      listsMap.set(key, {
        listId,
        listName: title,
        count,
        url: href || window.location.href,
      });
    }
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
        let savedList = provider === 'xiaohongshu' ? detectXiaohongshuNoteList() : null;
        if (!savedList || savedList.places.length === 0) {
          await autoScrollFeed();
          savedList = await resolveGoogleMapsList();
        }
        const allLists = scanAllSavedListsOnPage();
        const targetTags = ((message as { targetTags?: string[] }).targetTags || []).map((t) => t.trim().toLowerCase());

        // If page has multiple lists and no single list is currently open, auto-fetch the list matching the target trip tag
        if ((!savedList || savedList.places.length === 0) && targetTags.length > 0 && allLists.length > 0) {
          const matched = allLists.find((l) => {
            const name = l.listName.toLowerCase();
            return targetTags.some((t) => t && (name === t || name.includes(t) || t.includes(name)));
          });
          if (matched?.listId) {
            savedList = await fetchGoogleMapsEntityList(matched.listId);
          }
        }

        const place = currentPlace();
        sendResponse({ place, savedList, allLists });
      } catch (e) {
        console.warn('OWNLY_GET_CURRENT_PLACE failed:', e);
        sendResponse({ place: null, savedList: null, allLists: [] });
      }
    })();
    return true;
  }
  if (msgType === 'OWNLY_FETCH_LIST_BY_ID') {
    const listId = (message as { listId?: string }).listId;
    if (listId) {
      void (async () => {
        const listData = await fetchGoogleMapsEntityList(listId);
        sendResponse({ savedList: listData });
      })();
      return true;
    }
  }
  if (msgType === 'OWNLY_GET_VISIBLE_LIST_PLACES') {
    void (async () => {
      await autoScrollFeed();
      const savedList = await resolveGoogleMapsList();
      const listPlaces = savedList?.places ?? detectGoogleMapsListPlaces();
      sendResponse({ listPlaces, truncated: savedList?.truncated ?? false });
    })();
    return true;
  }
  if (msgType === 'OWNLY_GET_SAVED_LIST') {
    void (async () => {
      const savedList = await resolveGoogleMapsList();
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
