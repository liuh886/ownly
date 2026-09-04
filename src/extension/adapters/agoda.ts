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

export function parseAgodaCard(
  cardEl: HTMLElement,
  overrideCurrency?: string,
  hintCurrency?: string,
): CurrentResearchPlace | null {
  const titleEl = cardEl.querySelector<HTMLElement>(
    'h3[data-selenium="hotel-name"], [data-selenium="hotel-name"], h3, h2, [data-element="hotel-name"], div.PropertyCard__HotelName, a[href*="/hotel/"], span[data-selenium="hotel-name"]'
  );
  const rawTitle = titleEl?.textContent?.trim() || '';
  const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
  if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

  const ratingEl = cardEl.querySelector<HTMLElement>(
    'div[data-selenium="review-score"], [data-selenium="hotel-rating-score"], div.ReviewScore-Number, span[data-selenium="rating-score"]'
  );
  const ratingText = ratingEl?.textContent?.trim();
  const rawScore = ratingText ? parseFloat(ratingText) : undefined;
  const rating = Number.isFinite(rawScore) && rawScore ? Math.min(5, Math.round((rawScore / 2) * 10) / 10) : undefined;

  const reviewEl = cardEl.querySelector<HTMLElement>(
    'span[data-selenium="review-count"], span.ReviewScore-Count, span[data-selenium="hotel-review-count"]'
  );
  const reviewCount = PLACE_PARSER.parseReviewCount(reviewEl?.textContent);

  const addrEl = cardEl.querySelector<HTMLElement>(
    'span[data-selenium="area-city-name"], span[data-selenium="hotel-address"], [data-selenium="hotel-item-address"], div.PropertyCard__Address, span[data-selenium="hotel-area"]'
  );
  const address = addrEl?.textContent?.trim();

  let priceLevel: string | undefined;
  const priceEl = cardEl.querySelector<HTMLElement>(
    'span[data-selenium="display-price"], span.PropertyCardPrice__Value, [data-element="price-display"], span.price-box__price, span[data-selenium="hotel-price"]'
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

  const cleanPlaceTitle = cleanTitleForSearch(title);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanPlaceTitle + (address ? ' ' + address : ''))}&hl=zh-CN`;

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
    types: ['lodging', 'hotel', 'establishment'],
    hotelFacts,
    summary: '来自 Agoda',
  };
}

export function detectAgodaSavedList(overrideCurrency?: string): DetectedSavedList | null {
  const isAgoda = /agoda\.com/i.test(window.location.href);
  if (!isAgoda) return null;

  const tripNameEl = document.querySelector<HTMLElement>(
    '[data-selenium="trip-name"], h1.TripDetailHeader__Title, h1.TripName, [data-element="trip-name"], h1, [data-selenium="page-title"]'
  );
  let rawTripName = tripNameEl?.textContent?.trim() || '';
  if (!rawTripName || rawTripName.length < 2 || /agoda/i.test(rawTripName)) {
    rawTripName = document.title.replace(/ \| Agoda.*$/i, '').replace(/ - Agoda.*$/i, '').trim();
  }
  const cleanListName = rawTripName ? `🏨 Agoda · ${rawTripName}` : '🏨 Agoda 收藏夹';

  const cards = document.querySelectorAll<HTMLElement>(
    'div[data-selenium="saved-hotel-item"], div[data-selenium="hotel-item"], li[data-selenium="hotel-item"], div.TripItem, div.SavedItem, div.SavedHotelCard, [data-selenium="trip-saved-card"], [data-selenium="saved-item"], div.PropertyCard, [data-element="hotel-card"], div[data-testid="saved-hotel-card"], div[role="listitem"]'
  );

  const found = new Map<string, CurrentResearchPlace>();
  for (const card of Array.from(cards)) {
    const place = parseAgodaCard(card, overrideCurrency);
    if (!place || !place.title) continue;
    const key = place.title.toLowerCase();
    if (!found.has(key)) {
      found.set(key, place);
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
    const isListPage = /\/trips|\/search|tab=saved/i.test(sourceUrl) || Boolean(document.querySelector('div[data-selenium="saved-hotel-item"]'));
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
    const rawScore = ratingText ? parseFloat(ratingText) : undefined;
    const rating = facts.rating ?? (Number.isFinite(rawScore) && rawScore ? Math.min(5, Math.round((rawScore / 2) * 10) / 10) : undefined);

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

    // 2. Saved List & Search Result Cards
    const cards = document.querySelectorAll<HTMLElement>(
      'div[data-selenium="saved-hotel-item"], div[data-selenium="hotel-item"], li[data-selenium="hotel-item"], div.TripItem, div.SavedItem, div.SavedHotelCard, [data-selenium="trip-saved-card"], [data-selenium="saved-item"], div.PropertyCard, [data-element="hotel-card"], div[data-testid="saved-hotel-card"]'
    );

    for (const card of Array.from(cards)) {
      if (card.dataset.ownlyCardInjected === 'true' || card.querySelector('.ownly-inline-fab-root')) continue;

      const parsedPlace = parseAgodaCard(card);
      if (!parsedPlace || !parsedPlace.title) continue;

      const actionTarget = card.querySelector<HTMLElement>(
        'h3[data-selenium="hotel-name"], [data-selenium="hotel-name"], h3, h2, div.PropertyCard__HotelName, a[href*="/hotel/"], span[data-selenium="hotel-name"]'
      );

      if (!actionTarget) continue;

      injectInlineCaptureButton({
        container: card,
        anchor: actionTarget,
        position: 'before',
        getPlace: () => parseAgodaCard(card) || parsedPlace,
      });
    }
  }
}

