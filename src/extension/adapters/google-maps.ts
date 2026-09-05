import type { PageAdapter, CurrentResearchPlace, DetectedSavedList } from './types';
import {
  inferPlaceKind,
  type PlannerPlaceKind,
} from '../../domain/planner';
import {
  cleanExtractedText,
  extractCleanPriceText,
  extractFeatureIdFromUrl,
  extractHotelPropertyFacts,
  extractPlaceCoordinates,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
  isValidExtractedPriceCandidate,
  isZeroOrPlaceholderPrice,
  normalizePhoneDisplay,
  safeDecodeUri,
} from '../utils';
import { SELECTORS, driftCheck } from '../selectors';
import { PLACE_PARSER } from '../place-parser';
import { detectPageCurrency } from '../currency-detector';
import { extractGoogleMapsSavedListId } from '../saved-list-match';
import { injectInlineCaptureButton } from '../ui/inline-capture-button';
import { logger } from '../logger';
import {
  buildFromEntityList,
  interpretDomBatch,
  type SavedListResult,
} from '../maps/saved-list-parser';

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
  const catBtn = document.querySelector<HTMLElement>(SELECTORS.category);
  if (catBtn?.textContent) {
    const cat = cleanExtractedText(catBtn.textContent);
    if (cat && cat.length < 50 && !/^(directions|save|share|nearby|路线|保存|分享|附近)$/i.test(cat)) return cat;
  }

  const hotelClassEl = document.querySelector<HTMLElement>(
    'span[aria-label*="star hotel" i], span[aria-label*="星级酒店"], button[aria-label*="hotel" i], span.mgr77e, div.mgr77e'
  );
  if (hotelClassEl) {
    const text = cleanExtractedText(hotelClassEl.getAttribute('aria-label') || hotelClassEl.textContent || '');
    if (text && text.length < 50 && /(hotel|resort|inn|hostel|lodging|stay|酒店|旅馆|民宿|度假村|星级)/i.test(text)) return text;
  }

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
  } catch (err) {
    logger.debug('GoogleMaps', 'Failed to parse JSON-LD for category', { error: String(err) });
  }

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
  const priceEl = document.querySelector<HTMLElement>(SELECTORS.priceBadge);
  if (priceEl) {
    const text = cleanExtractedText(priceEl.getAttribute('aria-label') || priceEl.textContent || '');
    if (text && text.length < 40 && !/^(路线|directions|save|保存|share|分享|nearby|附近)$/i.test(text)) {
      const cleanPrice = extractCleanPriceText(text);
      if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice)) return cleanPrice;
    }
  }

  const levelSpans = document.querySelectorAll<HTMLElement>(SELECTORS.priceLevels);
  for (const span of Array.from(levelSpans)) {
    const label = cleanExtractedText(span.getAttribute('aria-label') || span.textContent || '');
    if (label && isPlausiblePriceText(label) && !isZeroOrPlaceholderPrice(label)) {
      return extractCleanPriceText(label) || label;
    }
  }

  const infoSpans = document.querySelectorAll<HTMLElement>('span.mgr77e, div.mgr77e span');
  for (const span of Array.from(infoSpans)) {
    const text = cleanExtractedText(span.getAttribute('aria-label') || span.textContent || '');
    if (text && text.length < 40) {
      const cleanPrice = extractCleanPriceText(text);
      if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice)) return cleanPrice;
    }
  }

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

  const allCandidates = document.querySelectorAll<HTMLElement>('span, div, button');
  for (const el of Array.from(allCandidates).slice(0, 400)) {
    const text = cleanExtractedText(el.textContent || '');
    if (!text || text.length > 60 || text.length < 3) continue;
    if (!/[¥฿$€£₩]|JP¥|CN¥|S\$|HK\$/.test(text)) continue;
    const cleanPrice = extractCleanPriceText(text);
    if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice) && isValidExtractedPriceCandidate(cleanPrice) && /\d/.test(cleanPrice)) {
      return cleanPrice;
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

if (typeof window !== 'undefined') {
  window.addEventListener('ownly-app-state' as keyof WindowEventMap, ((event: CustomEvent<AppStateSignals>) => {
    if (event.detail && typeof event.detail === 'object') {
      appStateSignals = event.detail;
    }
  }) as EventListener);
}

function collectAppStateSignals(): AppStateSignals | null {
  injectAppStateBridge();
  return appStateSignals;
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

function cardToRaw(title: string, href: string, card: HTMLElement | null): import('../maps/saved-list-parser').RawDomCard {
  const ratingText =
    card?.querySelector<HTMLElement>(SELECTORS.cardRating)?.textContent?.trim() ||
    (card?.querySelector<HTMLElement>(SELECTORS.ratingAria)?.getAttribute('aria-label') ?? undefined);
  const infoEls = card ? Array.from(card.querySelectorAll<HTMLElement>(SELECTORS.cardInfo)) : [];
  const infoTexts = infoEls.map((e) => e.textContent?.trim() || '').filter(Boolean);
  if (infoTexts.length === 0 && card?.textContent) infoTexts.push(card.textContent);
  const hotelBadge = card?.querySelector<HTMLElement>('span.fontHeadlineSmall, div.fontHeadlineSmall');
  if (hotelBadge?.textContent) infoTexts.push(hotelBadge.textContent);
  const addressRaw = card?.querySelector<HTMLElement>(SELECTORS.address)?.textContent?.trim();
  const noteRaw = card?.querySelector<HTMLElement>(SELECTORS.cardNote)?.textContent?.trim();
  return { rawTitle: title, href: href || '', ratingText, infoTexts, addressRaw, noteRaw };
}

const PLACE_LINK = 'a.hfpxzc, a[href*="/maps/place/"], a[href*="/place/"], a[data-place-id]';

export function scanAllGoogleMapsPlaces(): CurrentResearchPlace[] {
  pruneScavengedCache(window.location.href);
  const rawCards: import('../maps/saved-list-parser').RawDomCard[] = [];

  const linkAnchors = document.querySelectorAll<HTMLAnchorElement>(SELECTORS.feedAnchors);
  for (const anchor of Array.from(linkAnchors)) {
    let title = anchor.getAttribute('aria-label') || '';
    const href = anchor.href || '';
    if (!title && href) title = titleFromUrl(href);
    const card = anchor.closest<HTMLElement>(SELECTORS.cardContainers) || anchor.parentElement;
    rawCards.push(cardToRaw(title, href, card ?? null));
  }

  const cardElements = document.querySelectorAll<HTMLElement>(`${SELECTORS.cardContainers}, div[role="feed"] > div`);
  for (const card of Array.from(cardElements)) {
    const headEl = card.querySelector<HTMLElement>(SELECTORS.cardTitle);
    const title = headEl?.textContent?.trim() || card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[aria-label]')?.getAttribute('aria-label') || '';
    const linkEl = card.querySelector<HTMLAnchorElement>(PLACE_LINK);
    rawCards.push(cardToRaw(title, linkEl?.href || '', card));
  }

  const feedItems = document.querySelectorAll<HTMLElement>('div[role="feed"] > div, div[role="main"] div[jsaction], div.m6QErb > div[jsaction], div.m6QErb > div');
  for (const card of Array.from(feedItems)) {
    const titleEl = card.querySelector<HTMLElement>('h1, h2, h3, .fontHeadlineSmall, .qBF1Pd, .OSrXXb, [role="heading"], div[class*="headline"], span[class*="headline"]');
    const title = titleEl?.textContent?.trim() || card.querySelector('[aria-label]')?.getAttribute('aria-label') || '';
    const linkEl = card.querySelector<HTMLAnchorElement>(PLACE_LINK);
    rawCards.push(cardToRaw(title, linkEl?.href || '', card));
  }

  const batch: SavedListResult = interpretDomBatch(rawCards);
  for (const cand of batch.places) {
    const key = cand.featureId || cand.url || `unresolved:${cand.title.toLowerCase()}`;
    if (scannedListPlaces.has(key)) continue;
    scannedListPlaces.set(key, {
      title: cand.title,
      sourceUrl: cand.url,
      sourceProvider: 'google_maps',
      kind: (cand.kind as PlannerPlaceKind) || inferPlaceKind((cand.category || '') + ' ' + cand.title + ' ' + (cand.address || '')),
      rating: cand.rating,
      reviewCount: cand.reviewCount,
      category: cand.category,
      priceLevel: cand.priceLevel,
      address: cand.address,
      detectedCurrency: cand.detectedCurrency,
      summary: cand.summary,
      userNote: cand.userNote,
      coordinates: cand.coordinates ?? extractPlaceCoordinates(cand.url) ?? undefined,
      sourcePlaceId: cand.sourcePlaceId,
    });
  }

  return Array.from(scannedListPlaces.values());
}

export function extractGoogleMapsPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
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
  const hasVisiblePlaceDetails = Boolean(cleanExtractedText(detailHeading?.textContent || '') && hasVisibleDetailFacts);
  const isDedicatedPlacePage = /\/maps\/place\/[^/?#]+/i.test(window.location.pathname)
    || /data=.*!1s0x/i.test(window.location.href)
    || /cid=\d+/i.test(window.location.search)
    || hasVisiblePlaceDetails;

  if (!isDedicatedPlacePage && !hasVisiblePlaceDetails) {
    const listPlaces = scanAllGoogleMapsPlaces();
    if (listPlaces.length > 1) {
      return null;
    }
  }
  
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
  const detectedCurrency = detectPageCurrency({
    url: sourceUrl,
    priceText: priceLevel,
    hintCurrency,
    overrideCurrency,
    doc: typeof document !== 'undefined' ? document : undefined,
  }).currency;
  const userNote = extractUserNote();
  const summary = extractSummary();
  const openHours = extractOpenHours();
  const openStatus = extractOpenStatus();
  const stateSignals = collectAppStateSignals();
  const reservation = extractReservation();
  const rating = extractRating() || jsonLd.rating;
  const reviewCount = extractReviewCount() || jsonLd.reviewCount;
  const category = extractCategory() || jsonLd.category;
  const kind = category
    ? inferPlaceKind(category)
    : (stateSignals?.types?.length ? inferPlaceKind(stateSignals.types.join(' ')) : inferPlaceKind(title));

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
    hotelFacts: extractHotelPropertyFacts(summary, typeof document !== 'undefined' ? document : null),
  };
}

export function extractGoogleMapsListId(): string | null {
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

export async function fetchGoogleMapsEntityList(listId: string, overrideCurrency?: string): Promise<DetectedSavedList | null> {
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
        const parsed: SavedListResult = buildFromEntityList({
          listName,
          listUrl: window.location.href,
          rawItems,
          origin: window.location.origin,
          overrideCurrency,
        });
        const places: CurrentResearchPlace[] = parsed.places.map((cand) => ({
          title: cand.title,
          sourceUrl: cand.url,
          sourceProvider: 'google_maps',
          kind: (cand.kind as PlannerPlaceKind) || inferPlaceKind((cand.category || '') + ' ' + cand.title + ' ' + (cand.address || '')),
          address: cand.address,
          userNote: cand.userNote,
          summary: cand.summary,
          rating: cand.rating,
          reviewCount: cand.reviewCount,
          category: cand.category,
          priceLevel: cand.priceLevel,
          detectedCurrency: cand.detectedCurrency,
          types: cand.types,
          coordinates: cand.coordinates,
          sourcePlaceId: cand.sourcePlaceId,
        }));
        if (places.length > 0) {
          return {
            listName,
            listUrl: window.location.href,
            detectedCurrency: detectPageCurrency({
              url: window.location.href,
              overrideCurrency,
            }).currency,
            places,
            truncated: rawItems.length >= 500,
          };
        }
      }
    }
  } catch (e) {
    logger.warn('GoogleMaps', 'Entitylist direct fetch failed:', { error: String(e) });
  }
  return null;
}

export async function resolveGoogleMapsList(overrideCurrency?: string): Promise<DetectedSavedList | null> {
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
  return null;
}

export class GoogleMapsAdapter implements PageAdapter {
  readonly id = 'google_maps' as const;
  readonly name = 'Google Maps';

  matches(url: string): boolean {
    return /google\.[a-z.]+\/maps|maps\.google\.[a-z.]+/i.test(url);
  }

  extractPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
    return extractGoogleMapsPlace(overrideCurrency, hintCurrency);
  }

  async detectSavedList(overrideCurrency?: string): Promise<DetectedSavedList | null> {
    return await resolveGoogleMapsList(overrideCurrency);
  }

  initInlineButtons(): void {
    if (typeof document === 'undefined' || !document.body) return;

    // 1. Single POI Detail Pane: inject "📌 放入案板" button next to main place title
    const detailTitleEl = document.querySelector<HTMLElement>(
      'h1.DUwDvf, h1.fontHeadlineLarge, div.lMbq3e h1, div.TIH9bg h1, div[role="main"] h1'
    );
    if (detailTitleEl) {
      const paneContainer = (detailTitleEl.closest<HTMLElement>('div[role="main"], div.m6QErb, div.lMbq3e') || detailTitleEl.parentElement) as HTMLElement;
      if (paneContainer && paneContainer.dataset.ownlyCardInjected !== 'true' && !paneContainer.querySelector('.ownly-inline-fab-root')) {
        injectInlineCaptureButton({
          container: paneContainer,
          anchor: detailTitleEl,
          position: 'before',
          customStyle: 'margin-right: 10px; margin-bottom: 4px;',
          getPlace: () => extractGoogleMapsPlace(),
        });
      }
    }

    // 2. Search Result List items: inject next to each search result item title
    const searchCards = document.querySelectorAll<HTMLElement>(
      'div.Nv2PK, div.THOPZb, div[role="feed"] div[role="article"]'
    );
    for (const card of Array.from(searchCards)) {
      if (card.dataset.ownlyCardInjected === 'true' || card.querySelector('.ownly-inline-fab-root')) continue;
      const titleEl = card.querySelector<HTMLElement>('div.qBF1Pd, div.fontHeadlineSmall, [role="heading"]');
      if (!titleEl || !titleEl.textContent?.trim()) continue;

      const rawTitle = cleanExtractedText(titleEl.textContent);
      if (!rawTitle || isFakePlaceLabel(rawTitle) || isJunkNavigationText(rawTitle)) continue;

      const anchorEl = card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[href*="/maps/place/"], a[data-item-id]');
      const href = anchorEl?.href || window.location.href;

      injectInlineCaptureButton({
        container: card,
        anchor: titleEl,
        position: 'before',
        getPlace: () => {
          const ratingEl = card.querySelector<HTMLElement>('span.MW4etd, span[aria-label*="星"]');
          const rawRating = ratingEl?.getAttribute('aria-label') || ratingEl?.textContent;
          const rating = PLACE_PARSER.parseRating(rawRating);

          const reviewEl = card.querySelector<HTMLElement>('span.UY7F9');
          const reviewCount = PLACE_PARSER.parseReviewCount(reviewEl?.textContent);

          const subtitleEl = card.querySelector<HTMLElement>('div.W4Efsd:last-child, div.W4Efsd');
          const subtitleText = subtitleEl?.textContent || '';

          const priceEl = card.querySelector<HTMLElement>('span[aria-label*="$"], span[aria-label*="¥"], span[aria-label*="฿"]');
          const priceLevel = priceEl ? extractCleanPriceText(priceEl.textContent || '') : undefined;

          let category: string | undefined;
          const catEl = card.querySelector<HTMLElement>('span.mgr77e, span[class*="category"], button.DkEaL');
          if (catEl?.textContent) {
            const text = cleanExtractedText(catEl.textContent);
            if (text && text.length < 40 && !/^(\d|★|·|路线|保存|分享|附近)/.test(text)) {
              category = text.replace(/^[·•\s]+/, '').trim();
            }
          }
          if (!category) {
            const allSpans = card.querySelectorAll<HTMLElement>('div.W4Efsd span');
            for (const span of Array.from(allSpans)) {
              const text = cleanExtractedText(span.textContent || '').replace(/^[·•\s]+/, '').trim();
              if (!text || text.length > 30 || text.length < 2) continue;
              if (/^(\d|★|\$|¥|฿|€|£|₩|路线|保存|分享|附近|http|营业|关门|距离|已打卡|去过)/i.test(text)) continue;
              if (/(hotel|resort|inn|hostel|restaurant|cafe|coffee|bar|food|shop|store|station|spa|massage|museum|park|temple|lodge|stay|度假村|度假酒店|宾馆|酒店|旅馆|民宿|客栈|青旅|餐厅|餐馆|饭店|面馆|海鲜馆|小吃|美食|料理|咖啡|甜品|茶|奶茶|景点|公园|寺|神社|博物馆|商场|超市|市场|车站|地铁|机场|码头|按摩|水疗|体验|便民)/i.test(text)) {
                category = text;
                break;
              }
            }
          }

          const kind = category
            ? inferPlaceKind(category)
            : inferPlaceKind(rawTitle + ' ' + subtitleText);

          return {
            title: rawTitle,
            sourceUrl: href,
            sourceProvider: 'google_maps',
            kind,
            rating,
            reviewCount,
            category,
            priceLevel,
            address: subtitleText || undefined,
            types: category ? [category, 'point_of_interest', 'establishment'] : ['point_of_interest', 'establishment'],
            summary: '来自 Google Maps 搜索列表',
          };
        },
      });
    }
  }
}

