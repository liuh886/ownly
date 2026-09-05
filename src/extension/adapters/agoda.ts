import type { PageAdapter, CurrentResearchPlace, DetectedSavedList } from './types';
import {
  cleanExtractedText,
  cleanTitleForSearch,
  extractCleanPriceText,
  extractHotelPropertyFacts,
  extractPlaceCoordinates,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
  isValidExtractedPriceCandidate,
} from '../utils';
import { PLACE_PARSER } from '../place-parser';
import { detectCurrencyFromPage } from '../currency-detector';
import { extractGoogleMapsResearchFromHtml } from '../google-maps-research';
import { injectInlineCaptureButton } from '../ui/inline-capture-button';
import { logger } from '../logger';

const AGODA_CARD_SELECTORS = [
  'div[data-selenium="saved-hotel-item"]',
  'div[data-selenium="trip-saved-card"]',
  'div[data-selenium="saved-item"]',
  'div[data-selenium="trip-item"]',
  'div[data-selenium="trip-hotel-card"]',
  'div[data-selenium="hotel-item"]',
  'div[data-selenium="hotel-card"]',
  'div[data-selenium="property-card"]',
  'div[data-testid="saved-hotel-card"]',
  'div[data-testid="trip-card"]',
  'div.TripItem',
  'div.SavedItem',
  'div.SavedHotelCard',
  'div.PropertyCard',
  'div.TripDetail__item',
  'div.TripCard',
  'div[class*="TripDetailItem"]',
  'div[class*="TripDetailCard"]',
  'div[class*="TripDetail__item"]',
  'div[class*="SavedHotel"]',
  'div[class*="TripItem"]',
  'div[class*="SavedItem"]',
  'div[class*="TripCard"]',
  'div[class*="property-card"]',
  'div[class*="PropertyCard"]',
  'div[class*="hotel-card"]',
  'div[class*="HotelCard"]',
  'li[data-selenium="hotel-item"]',
  'li[class*="TripItem"]',
  'li[class*="SavedItem"]',
  '[data-element="saved-hotel-card"]',
  '[data-element="hotel-card"]',
  'div[role="listitem"]',
].join(', ');

const AGODA_TITLE_SELECTORS = [
  'h3[data-selenium="hotel-name"]',
  '[data-selenium="hotel-name"]',
  '[data-selenium="hotel-header-name"]',
  '[data-element="hotel-name"]',
  '[data-element="hotel-title"]',
  'h3[data-testid="hotel-name"]',
  '[data-testid="hotel-name"]',
  'div.PropertyCard__HotelName',
  'div[class*="HotelName"]',
  'span[class*="HotelName"]',
  'h3[class*="HotelName"]',
  'h2[class*="HotelName"]',
  'h4[class*="HotelName"]',
  'a[href*="/hotel/"]',
].join(', ');

export function findAgodaHotelUrl(cardEl: HTMLElement): string | null {
  const anchor = cardEl.querySelector<HTMLAnchorElement>(
    'a[href*="/hotel/"], a[data-selenium="hotel-name"], a[data-element="hotel-name"], a[href*="agoda.com/"]'
  );
  if (anchor?.href && !anchor.href.includes('/trips') && !anchor.href.includes('/search')) {
    return anchor.href;
  }
  const hotelId = cardEl.getAttribute('data-hotel-id')
    || cardEl.getAttribute('data-property-id')
    || cardEl.getAttribute('data-hotelid')
    || cardEl.getAttribute('data-id')
    || cardEl.closest('[data-hotel-id]')?.getAttribute('data-hotel-id')
    || cardEl.closest('[data-property-id]')?.getAttribute('data-property-id')
    || cardEl.querySelector('[data-hotel-id]')?.getAttribute('data-hotel-id')
    || cardEl.querySelector('[data-property-id]')?.getAttribute('data-property-id');

  if (hotelId && /^\d+$/.test(hotelId.trim())) {
    return `https://www.agoda.com/hotel/hotel.html?id=${hotelId.trim()}`;
  }
  return anchor?.href || null;
}

export function parseAgodaCard(
  cardEl: HTMLElement,
  overrideCurrency?: string,
  hintCurrency?: string,
): CurrentResearchPlace | null {
  const titleEl = cardEl.querySelector<HTMLElement>(AGODA_TITLE_SELECTORS)
    || cardEl.querySelector<HTMLElement>('h1, h2, h3, h4');
  const rawTitle = titleEl?.textContent?.trim() || '';
  const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
  if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

  const ratingEl = cardEl.querySelector<HTMLElement>(
    'div[data-selenium="review-score"], [data-selenium="hotel-rating-score"], [data-selenium="rating-score"], [data-selenium="review-score-box"], div.ReviewScore-Number, div[class*="ReviewScore"], span[class*="ReviewScore"], div[class*="score-number"], [aria-label*="分"], [aria-label*="score"], [aria-label*="rating"]'
  );
  const ratingText = ratingEl?.textContent?.trim() || ratingEl?.getAttribute('aria-label') || '';
  const rawScore = ratingText ? parseFloat(ratingText.replace(/[^0-9.]/g, '')) : undefined;
  let rating: number | undefined;
  if (Number.isFinite(rawScore) && rawScore) {
    if (rawScore > 5) {
      rating = Math.min(5, Math.round((rawScore / 2) * 10) / 10);
    } else if (rawScore >= 1) {
      rating = Math.round(rawScore * 10) / 10;
    }
  }

  const reviewEl = cardEl.querySelector<HTMLElement>(
    'span[data-selenium="review-count"], span.ReviewScore-Count, span[data-selenium="hotel-review-count"], span[data-selenium="review-count-text"], span[class*="ReviewCount"], span[class*="review-count"]'
  );
  const reviewCount = PLACE_PARSER.parseReviewCount(reviewEl?.textContent);

  const addrEl = cardEl.querySelector<HTMLElement>(
    'span[data-selenium="area-city-name"], span[data-selenium="hotel-address"], [data-selenium="hotel-item-address"], [data-selenium="hotel-area"], div.PropertyCard__Address, div[class*="Address"], span[class*="Address"], div[class*="AreaCity"], span[class*="AreaCity"], [data-selenium="location"], [data-selenium="hotel-location"]'
  );
  const address = addrEl?.textContent?.trim();

  let priceLevel: string | undefined;
  const priceEl = cardEl.querySelector<HTMLElement>(
    'span[data-selenium="display-price"], span[data-selenium="final-price"], span.PropertyCardPrice__Value, [data-element="price-display"], span.price-box__price, span[data-selenium="hotel-price"], div[class*="Price__Value"], span[class*="Price__Value"], div[class*="PriceBox"], span[class*="PriceBox"], div[class*="Price"], span[class*="Price"], [data-selenium*="price"]'
  );
  const priceText = priceEl?.textContent?.trim();
  if (priceText && isPlausiblePriceText(priceText)) {
    const clean = extractCleanPriceText(priceText);
    if (clean && isValidExtractedPriceCandidate(clean)) {
      priceLevel = clean;
    }
  }

  const detectedCurrency = detectCurrencyFromPage(window.location.href, priceLevel, hintCurrency, overrideCurrency);
  const hotelFacts = extractHotelPropertyFacts(cardEl.textContent, cardEl);

  const hotelId = cardEl.getAttribute('data-hotel-id')
    || cardEl.getAttribute('data-property-id')
    || cardEl.getAttribute('data-id')
    || undefined;

  const hotelUrl = findAgodaHotelUrl(cardEl);
  const cleanPlaceTitle = cleanTitleForSearch(title);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanPlaceTitle + (address ? ' ' + address : ''))}&hl=zh-CN`;

  return {
    title,
    sourceUrl: hotelUrl || mapsUrl,
    sourceProvider: 'agoda',
    kind: 'stay',
    category: 'Hotel',
    rating,
    reviewCount,
    priceLevel,
    detectedCurrency,
    address,
    sourcePlaceId: hotelId,
    types: ['lodging', 'hotel', 'establishment'],
    hotelFacts,
    summary: '来自 Agoda',
  };
}

export async function resolveAgodaHotelToMapsPlace(
  hotelUrl: string,
  fallbackCardPlace: CurrentResearchPlace,
): Promise<CurrentResearchPlace> {
  try {
    const resp = await fetch(hotelUrl, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (!resp.ok) {
      return fallbackCardPlace;
    }
    const html = await resp.text();
    const facts = extractGoogleMapsResearchFromHtml(html);
    const hotelFacts = extractHotelPropertyFacts(html) || fallbackCardPlace.hotelFacts;

    let title = fallbackCardPlace.title;
    const ogTitle = /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]
      || /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html)?.[1];
    if (ogTitle) {
      const clean = cleanExtractedText(ogTitle.replace(/\s*[-–—|]\s*Agoda.*$/i, '').replace(/\s*\(.*\)\s*$/i, ''));
      if (clean && !isFakePlaceLabel(clean) && !isJunkNavigationText(clean)) {
        title = clean;
      }
    }

    const coords = facts.coordinates || fallbackCardPlace.coordinates;
    const address = facts.address || fallbackCardPlace.address;
    const cleanPlaceTitle = cleanTitleForSearch(title);

    let mapsUrl = '';
    if (coords) {
      mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(cleanPlaceTitle)}/@${coords.lat},${coords.lng},17z?hl=zh-CN`;
    } else {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanPlaceTitle + (address ? ' ' + address : ''))}&hl=zh-CN`;
    }

    return {
      title,
      sourceUrl: hotelUrl || mapsUrl,
      sourceProvider: 'agoda',
      kind: 'stay',
      category: facts.category && facts.category !== 'Agoda 住宿' ? facts.category : (fallbackCardPlace.category || 'Hotel'),
      rating: facts.rating ?? fallbackCardPlace.rating,
      reviewCount: facts.reviewCount ?? fallbackCardPlace.reviewCount,
      priceLevel: facts.priceLevel || fallbackCardPlace.priceLevel,
      detectedCurrency: facts.priceCurrency || fallbackCardPlace.detectedCurrency,
      address,
      phone: facts.phone || fallbackCardPlace.phone,
      website: facts.website || fallbackCardPlace.website,
      coordinates: coords,
      sourcePlaceId: fallbackCardPlace.sourcePlaceId,
      types: Array.from(new Set(['lodging', 'hotel', ...(facts.types || []), ...(fallbackCardPlace.types || [])])),
      hotelFacts,
      summary: fallbackCardPlace.summary || '来自 Agoda',
    };
  } catch (err) {
    logger.warn('Agoda', 'Failed to resolve hotel detail HTML, using card fallback', { error: String(err) });
    return fallbackCardPlace;
  }
}

export function detectAgodaSavedList(overrideCurrency?: string): DetectedSavedList | null {
  const isAgoda = /agoda\.com/i.test(window.location.href);
  if (!isAgoda) return null;

  const tripNameEl = document.querySelector<HTMLElement>(
    '[data-selenium="trip-name"], h1.TripDetailHeader__Title, h1.TripName, [data-element="trip-name"], [data-selenium="page-title"], h1, [class*="TripTitle"], [class*="trip-title"], [class*="Header__Title"]'
  );
  let rawTripName = tripNameEl?.textContent?.trim() || '';
  if (!rawTripName || rawTripName.length < 2 || /agoda/i.test(rawTripName)) {
    rawTripName = document.title.replace(/ \| Agoda.*$/i, '').replace(/ - Agoda.*$/i, '').trim();
  }
  const cleanListName = rawTripName ? `🏨 Agoda · ${rawTripName}` : '🏨 Agoda 收藏夹';

  const cards = document.querySelectorAll<HTMLElement>(AGODA_CARD_SELECTORS);
  const found = new Map<string, CurrentResearchPlace>();

  for (const card of Array.from(cards)) {
    if (card.querySelector(AGODA_CARD_SELECTORS)) continue;
    const place = parseAgodaCard(card, overrideCurrency);
    if (!place || !place.title) continue;
    const key = place.title.toLowerCase();
    if (!found.has(key)) {
      found.set(key, place);
    }
  }

  // Also scan title elements directly if cards were missed
  if (found.size === 0) {
    const titleElements = document.querySelectorAll<HTMLElement>(AGODA_TITLE_SELECTORS);
    for (const titleEl of Array.from(titleElements)) {
      const card = titleEl.closest<HTMLElement>(AGODA_CARD_SELECTORS) || titleEl.parentElement;
      if (!card) continue;
      const place = parseAgodaCard(card, overrideCurrency);
      if (!place || !place.title) continue;
      const key = place.title.toLowerCase();
      if (!found.has(key)) {
        found.set(key, place);
      }
    }
  }

  if (found.size === 0) return null;

  return {
    listName: cleanListName,
    listUrl: window.location.href,
    detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, undefined, overrideCurrency),
    places: [...found.values()],
  };
}

export class AgodaAdapter implements PageAdapter {
  readonly id = 'agoda' as const;
  readonly name = 'Agoda';

  matches(url: string): boolean {
    return /agoda\.com/i.test(url);
  }

  extractPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
    const sourceUrl = window.location.href;
    const isListPage = /\/trips|\/search|tab=saved/i.test(sourceUrl) || Boolean(document.querySelector(AGODA_CARD_SELECTORS));
    if (isListPage) {
      return null;
    }

    const html = typeof document !== 'undefined' ? document.documentElement.outerHTML : '';
    const facts = extractGoogleMapsResearchFromHtml(html);

    const titleEl = document.querySelector<HTMLElement>('h1[data-selenium="hotel-header-name"], h1.HeaderCerebrum__Name, h1, [data-element="hotel-name"]');
    const rawTitle = titleEl?.textContent?.trim() || '';
    const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
    if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

    const ratingEl = document.querySelector<HTMLElement>('div[data-selenium="review-score"], div.ReviewScore-Number, div.HeaderCerebrum__Score');
    const ratingText = ratingEl?.textContent?.trim();
    const rawScore = ratingText ? parseFloat(ratingText.replace(/[^0-9.]/g, '')) : undefined;
    let rating: number | undefined;
    if (Number.isFinite(rawScore) && rawScore) {
      if (rawScore > 5) {
        rating = Math.min(5, Math.round((rawScore / 2) * 10) / 10);
      } else if (rawScore >= 1) {
        rating = Math.round(rawScore * 10) / 10;
      }
    }
    if (facts.rating !== undefined) rating = facts.rating;

    const reviewEl = document.querySelector<HTMLElement>('span[data-selenium="review-count"], span.ReviewScore-Count, span.HeaderCerebrum__ReviewCount');
    const reviewCount = facts.reviewCount ?? PLACE_PARSER.parseReviewCount(reviewEl?.textContent);

    const addrEl = document.querySelector<HTMLElement>('span[data-selenium="hotel-address-map"], span.HeaderCerebrum__Address, div.AddressBar, [data-element="hotel-address"]');
    const address = facts.address || addrEl?.textContent?.trim();

    let priceLevel: string | undefined = facts.priceLevel;
    if (!priceLevel) {
      const priceEl = document.querySelector<HTMLElement>('span[data-selenium="display-price"], span.PriceBox__Price, span.f-16.fw-700, [data-element="price-display"]');
      const priceText = priceEl?.textContent?.trim();
      if (priceText && isPlausiblePriceText(priceText)) {
        const clean = extractCleanPriceText(priceText);
        if (clean && isValidExtractedPriceCandidate(clean)) {
          priceLevel = clean;
        }
      }
    }

    const detectedCurrency = facts.priceCurrency || detectCurrencyFromPage(sourceUrl, priceLevel, hintCurrency, overrideCurrency);
    const hotelFacts = extractHotelPropertyFacts(html, typeof document !== 'undefined' ? document : null);

    const coords = facts.coordinates || extractPlaceCoordinates(sourceUrl) || undefined;
    const cleanPlaceTitle = cleanTitleForSearch(title);
    const mapsUrl = coords
      ? `https://www.google.com/maps/place/${encodeURIComponent(cleanPlaceTitle)}/@${coords.lat},${coords.lng},17z?hl=zh-CN`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanPlaceTitle + (address ? ' ' + address : ''))}&hl=zh-CN`;

    return {
      title,
      sourceUrl: mapsUrl,
      sourceProvider: 'google_maps',
      kind: 'stay',
      category: 'Hotel',
      rating,
      reviewCount,
      priceLevel,
      detectedCurrency,
      address,
      coordinates: coords,
      phone: facts.phone,
      website: facts.website,
      types: ['lodging', 'hotel', 'establishment'],
      hotelFacts,
      summary: '来自 Agoda',
    };
  }

  detectSavedList(overrideCurrency?: string): DetectedSavedList | null {
    return detectAgodaSavedList(overrideCurrency);
  }

  initInlineButtons(): void {
    if (typeof document === 'undefined' || !document.body) return;

    // 1. Single Hotel Detail Page: inject next to main hotel title
    const detailTitleEl = document.querySelector<HTMLElement>(
      'h1[data-selenium="hotel-header-name"], h1.HeaderCerebrum__Name, [data-element="hotel-name"]'
    );
    if (detailTitleEl) {
      const container = (detailTitleEl.parentElement || detailTitleEl) as HTMLElement;
      if (container.dataset.ownlyCardInjected !== 'true' && !container.querySelector('.ownly-inline-fab-root')) {
        const place = this.extractPlace();
        if (place && place.title) {
          injectInlineCaptureButton({
            container,
            anchor: detailTitleEl,
            position: 'before',
            customStyle: 'margin-right: 10px; margin-bottom: 4px;',
            getPlace: () => this.extractPlace() || place,
          });
        }
      }
    }

    // 2. Bidirectional Matching: Card Containers & Title Elements
    const candidateTitles = document.querySelectorAll<HTMLElement>(AGODA_TITLE_SELECTORS);

    for (const titleEl of Array.from(candidateTitles)) {
      if (titleEl.dataset.ownlyCardInjected === 'true' || titleEl.parentElement?.querySelector('.ownly-inline-fab-root')) {
        continue;
      }

      const card = (titleEl.closest<HTMLElement>(AGODA_CARD_SELECTORS)
        || titleEl.closest<HTMLElement>('div[role="listitem"], li, article, div[class*="Card"], div[class*="Item"]')
        || titleEl.parentElement) as HTMLElement;

      if (!card || card.dataset.ownlyCardInjected === 'true' || card.querySelector('.ownly-inline-fab-root')) {
        continue;
      }

      const parsedPlace = parseAgodaCard(card);
      if (!parsedPlace || !parsedPlace.title) continue;

      injectInlineCaptureButton({
        container: card,
        anchor: titleEl,
        position: 'before',
        loadingText: '解析采集中...',
        getPlace: async () => {
          const currentPlaceFacts = parseAgodaCard(card);
          const rawPlace = currentPlaceFacts || parsedPlace;
          const targetHotelUrl = findAgodaHotelUrl(card);
          if (targetHotelUrl && targetHotelUrl.includes('/hotel/')) {
            return await resolveAgodaHotelToMapsPlace(targetHotelUrl, rawPlace);
          }
          return rawPlace;
        },
      });
    }
  }
}

