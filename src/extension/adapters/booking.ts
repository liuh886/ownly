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

export function parseBookingCard(
  cardEl: HTMLElement,
  overrideCurrency?: string,
  hintCurrency?: string,
): CurrentResearchPlace | null {
  const titleEl = cardEl.querySelector<HTMLElement>(
    '[data-testid="title"], div.f6431b4464, h3, a.e1309889e2, [data-testid="header-title"]'
  );
  const rawTitle = titleEl?.textContent?.trim() || '';
  const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
  if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

  const ratingEl = cardEl.querySelector<HTMLElement>(
    '[data-testid="review-score"] div, div.a3b8729ab1, div.d10a0e9803'
  );
  const ratingText = ratingEl?.textContent?.trim();
  const rawScore = ratingText ? parseFloat(ratingText) : undefined;
  const rating = Number.isFinite(rawScore) && rawScore ? Math.min(5, Math.round((rawScore / 2) * 10) / 10) : undefined;

  const reviewEl = cardEl.querySelector<HTMLElement>(
    '[data-testid="review-score-count"], div.ab740c2a32, span.a3b8729ab1'
  );
  const reviewCount = PLACE_PARSER.parseReviewCount(reviewEl?.textContent);

  const addrEl = cardEl.querySelector<HTMLElement>(
    '[data-testid="address"], span.aee5343fdb, span.hp_address_subtitle'
  );
  const address = addrEl?.textContent?.trim();

  let priceLevel: string | undefined;
  const priceEl = cardEl.querySelector<HTMLElement>(
    '[data-testid="price-and-discounted-price"], span.f6431b4464, span.prco-valign-middle-helper'
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
    summary: '来自 Booking.com',
  };
}

export function detectBookingSavedList(overrideCurrency?: string): DetectedSavedList | null {
  const isBooking = /booking\.com/i.test(window.location.href);
  if (!isBooking) return null;

  const titleEl = document.querySelector<HTMLElement>(
    'h1[data-testid="header-title"], h1, [data-testid="wishlist-title"]'
  );
  let rawListName = titleEl?.textContent?.trim() || '';
  if (!rawListName || rawListName.length < 2 || /booking/i.test(rawListName)) {
    rawListName = document.title.replace(/ \| Booking\.com.*$/i, '').replace(/ - Booking\.com.*$/i, '').trim();
  }
  const cleanListName = rawListName ? `🏨 Booking · ${rawListName}` : '🏨 Booking 收藏列表';

  const cards = document.querySelectorAll<HTMLElement>(
    'div[data-testid="property-card"], div.sr_item, div[role="listitem"], div[data-testid="wishlist-item"]'
  );

  const found = new Map<string, CurrentResearchPlace>();
  for (const card of Array.from(cards)) {
    const place = parseBookingCard(card, overrideCurrency);
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

export class BookingAdapter implements PageAdapter {
  readonly id = 'booking' as const;
  readonly name = 'Booking.com';

  matches(url: string): boolean {
    return /booking\.com/i.test(url);
  }

  extractPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
    const sourceUrl = window.location.href;
    const isListPage = /searchresults|wishlist/i.test(sourceUrl) || Boolean(document.querySelector('div[data-testid="property-card"]'));
    if (isListPage) {
      return null;
    }

    const html = typeof document !== 'undefined' ? document.documentElement.outerHTML : '';
    const facts = extractGoogleMapsResearchFromHtml(html);

    const titleEl = document.querySelector<HTMLElement>(
      'h2.d2fee87e0b, h2.pp-header__title, h1, [data-testid="header-title"]'
    );
    const rawTitle = titleEl?.textContent?.trim() || '';
    const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
    if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

    const ratingEl = document.querySelector<HTMLElement>(
      'div.a3b8729ab1, div.d10a0e9803, div[data-testid="review-score-right-component"] div'
    );
    const ratingText = ratingEl?.textContent?.trim();
    const rawScore = ratingText ? parseFloat(ratingText) : undefined;
    const rating = facts.rating ?? (Number.isFinite(rawScore) && rawScore ? Math.min(5, Math.round((rawScore / 2) * 10) / 10) : undefined);

    const reviewEl = document.querySelector<HTMLElement>(
      'div.ab740c2a32, span.a3b8729ab1, [data-testid="review-score-count"]'
    );
    const reviewCount = facts.reviewCount ?? PLACE_PARSER.parseReviewCount(reviewEl?.textContent);

    const addrEl = document.querySelector<HTMLElement>(
      'span.hp_address_subtitle, [data-testid="address"], span.hp-address-street'
    );
    const address = facts.address || addrEl?.textContent?.trim();

    let priceLevel: string | undefined = facts.priceLevel;
    if (!priceLevel) {
      const priceEl = document.querySelector<HTMLElement>(
        'span.prco-valign-middle-helper, span.bui-price-display__value, span[data-testid="price-and-discounted-price"]'
      );
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
      summary: '来自 Booking.com',
    };
  }

  detectSavedList(overrideCurrency?: string): DetectedSavedList | null {
    return detectBookingSavedList(overrideCurrency);
  }

  initInlineButtons(): void {
    if (typeof document === 'undefined' || !document.body) return;

    // 1. Single Hotel Detail Page: inject next to main title
    const detailTitleEl = document.querySelector<HTMLElement>(
      'h2.d2fee87e0b, h2.pp-header__title, h1, [data-testid="header-title"]'
    );
    if (detailTitleEl && !document.querySelector('div[data-testid="property-card"]')) {
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

    // 2. Search Result Cards
    const cards = document.querySelectorAll<HTMLElement>(
      'div[data-testid="property-card"], div.sr_item'
    );

    for (const card of Array.from(cards)) {
      if (card.dataset.ownlyCardInjected === 'true' || card.querySelector('.ownly-inline-fab-root')) continue;

      const parsedPlace = parseBookingCard(card);
      if (!parsedPlace || !parsedPlace.title) continue;

      const actionTarget = card.querySelector<HTMLElement>(
        '[data-testid="title"], div.f6431b4464, h3, h2, a[data-testid="title-link"]'
      );

      if (!actionTarget) continue;

      injectInlineCaptureButton({
        container: card,
        anchor: actionTarget,
        position: 'before',
        getPlace: () => parseBookingCard(card) || parsedPlace,
      });
    }
  }
}

