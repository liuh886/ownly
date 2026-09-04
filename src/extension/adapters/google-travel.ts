import type { PageAdapter, CurrentResearchPlace } from './types';
import {
  cleanExtractedText,
  cleanTitleForSearch,
  extractCleanPriceText,
  extractFeatureIdFromUrl,
  extractHotelPropertyFacts,
  extractPlaceCoordinates,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
  isValidExtractedPriceCandidate,
} from '../utils';
import { PLACE_PARSER } from '../place-parser';
import { detectCurrencyFromPage } from '../currency-detector';
import {
  extractFeatureIdFromHtml,
  extractGoogleMapsResearchFromHtml,
} from '../google-maps-research';
import { injectInlineCaptureButton } from '../ui/inline-capture-button';
import { logger } from '../logger';

function isGenericNavigationTitle(text: string): boolean {
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
  return false;
}

export function parseGoogleTravelCard(
  cardEl: HTMLElement,
  overrideCurrency?: string,
  hintCurrency?: string,
): CurrentResearchPlace | null {
  const titleEl = cardEl.querySelector<HTMLElement>(
    'h2, h3, [role="heading"], .BgYkof, div.w70Oqd, div.n7qZ7b, div.f5L0be, div.eUe7je'
  );
  const rawTitle = titleEl?.textContent?.trim() || '';
  const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
  if (!title || isFakePlaceLabel(title) || isGenericNavigationTitle(title) || isJunkNavigationText(title)) {
    return null;
  }

  const ratingEl = cardEl.querySelector<HTMLElement>(
    'span.ta4dpb, span.k520od, [aria-label*="星"], [aria-label*="star"], span.uwk8Re'
  );
  let rating: number | undefined;
  if (ratingEl) {
    const rawRating = ratingEl.getAttribute('aria-label') || ratingEl.textContent || '';
    rating = PLACE_PARSER.parseRating(rawRating);
  }

  const reviewsEl = cardEl.querySelector<HTMLElement>(
    'span.FHxG7e, span.spNvl, span.eLHnmb, span.RDAfL'
  );
  const reviewCount = PLACE_PARSER.parseReviewCount(reviewsEl?.textContent);

  let priceLevel: string | undefined;
  const priceEl = cardEl.querySelector<HTMLElement>(
    'span.MW1oeb, span.kixOHc, span.i1uvcf, div.F1afae, span.yY1XW, span.css-117hm55, [data-price]'
  );
  const priceText = priceEl?.getAttribute('data-price') || priceEl?.textContent?.trim();
  if (priceText && isPlausiblePriceText(priceText)) {
    const clean = extractCleanPriceText(priceText);
    if (clean && isValidExtractedPriceCandidate(clean)) {
      priceLevel = clean;
    }
  }

  const entityAnchor = cardEl.querySelector<HTMLAnchorElement>(
    'a[href*="/travel/hotels/entity/"], a[href*="/hotels/entity/"], a[href*="/travel/hotels/s/"], a[data-hotel-id]'
  );
  const entityHref = entityAnchor?.href;
  let sourcePlaceId: string | undefined;
  if (entityHref) {
    const m = /\/hotels\/entity\/([A-Za-z0-9_-]+)/.exec(entityHref);
    if (m?.[1]) sourcePlaceId = m[1];
  }

  const addrEl = cardEl.querySelector<HTMLElement>(
    '.W4r1Ff, .IsqBdf, .y6Fj8b, div.jB4eUe, span.W4r1Ff'
  );
  const address = addrEl?.textContent?.trim();

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
    sourcePlaceId,
    types: ['lodging', 'hotel', 'establishment'],
    hotelFacts,
    summary: '来自 Google Travel',
  };
}

export function convertToStandardGoogleMapsPlace(
  cardPlace: CurrentResearchPlace,
): CurrentResearchPlace {
  const coords = cardPlace.coordinates;
  const cleanPlaceTitle = cleanTitleForSearch(cardPlace.title);
  const mapsUrl = coords
    ? `https://www.google.com/maps/place/${encodeURIComponent(cleanPlaceTitle)}/@${coords.lat},${coords.lng},17z?hl=zh-CN`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanPlaceTitle + (cardPlace.address ? ' ' + cardPlace.address : ''))}&hl=zh-CN`;

  return {
    ...cardPlace,
    sourceUrl: mapsUrl,
    sourceProvider: 'google_maps',
    kind: 'stay',
    category: cardPlace.category && cardPlace.category !== 'Google Travel 住宿' ? cardPlace.category : 'Hotel',
    types: Array.from(new Set(['lodging', 'hotel', ...(cardPlace.types || [])])),
    summary: cardPlace.summary || '来自 Google Travel',
  };
}

export async function resolveGoogleTravelEntityToMapsPlace(
  entityUrl: string,
  fallbackCardPlace: CurrentResearchPlace,
): Promise<CurrentResearchPlace> {
  try {
    const resp = await fetch(entityUrl, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!resp.ok) {
      return convertToStandardGoogleMapsPlace(fallbackCardPlace);
    }
    const html = await resp.text();
    const facts = extractGoogleMapsResearchFromHtml(html);
    const hotelFacts = extractHotelPropertyFacts(html) || fallbackCardPlace.hotelFacts;

    let title = fallbackCardPlace.title;
    const ogTitle = /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]
      || /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html)?.[1];
    if (ogTitle) {
      const clean = cleanExtractedText(ogTitle.replace(/\s*[-–—|]\s*Google\s*(Travel|Hotels|Flights|旅行|酒店|机票).*$/i, ''));
      if (clean && !isFakePlaceLabel(clean) && !isGenericNavigationTitle(clean) && !isJunkNavigationText(clean)) {
        title = clean;
      }
    }

    let mapsUrl = '';
    const mapsMatch = /https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/place\/[^"'\s<>]+/i.exec(html)
      || /https?:\/\/maps\.google\.[a-z.]+\/[^"'\s<>]+/i.exec(html);
    if (mapsMatch) {
      mapsUrl = mapsMatch[0].replace(/&amp;/g, '&');
    }

    const coords = facts.coordinates || fallbackCardPlace.coordinates;
    const cleanPlaceTitle = cleanTitleForSearch(title);

    if (!mapsUrl) {
      if (coords) {
        mapsUrl = `https://www.google.com/maps/place/${encodeURIComponent(cleanPlaceTitle)}/@${coords.lat},${coords.lng},17z?hl=zh-CN`;
      } else {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanPlaceTitle + (facts.address ? ' ' + facts.address : ''))}&hl=zh-CN`;
      }
    }

    let sourcePlaceId = facts.sourcePlaceId || fallbackCardPlace.sourcePlaceId;
    if (!sourcePlaceId) {
      const fidMatch = extractFeatureIdFromHtml(html);
      if (fidMatch) sourcePlaceId = fidMatch;
    }

    return {
      title,
      sourceUrl: mapsUrl,
      sourceProvider: 'google_maps',
      kind: 'stay',
      category: facts.category && facts.category !== 'Google Travel 住宿' ? facts.category : (fallbackCardPlace.category && fallbackCardPlace.category !== 'Google Travel 住宿' ? fallbackCardPlace.category : 'Hotel'),
      rating: facts.rating ?? fallbackCardPlace.rating,
      reviewCount: facts.reviewCount ?? fallbackCardPlace.reviewCount,
      priceLevel: facts.priceLevel || fallbackCardPlace.priceLevel,
      detectedCurrency: facts.priceCurrency || fallbackCardPlace.detectedCurrency,
      address: facts.address || fallbackCardPlace.address,
      area: fallbackCardPlace.area,
      phone: facts.phone || fallbackCardPlace.phone,
      website: facts.website || fallbackCardPlace.website,
      coordinates: coords,
      sourcePlaceId,
      types: Array.from(new Set(['lodging', 'hotel', ...(facts.types || []), ...(fallbackCardPlace.types || [])])),
      hotelFacts,
      summary: fallbackCardPlace.summary,
    };
  } catch (err) {
    logger.warn('GoogleTravel', 'Failed to resolve entity HTML, using fallback card mapped to Google Maps', { error: String(err) });
    return convertToStandardGoogleMapsPlace(fallbackCardPlace);
  }
}

export class GoogleTravelAdapter implements PageAdapter {
  readonly id = 'google_travel' as const;
  readonly name = 'Google Travel';

  matches(url: string): boolean {
    return /google\.[a-z.]+\/travel/i.test(url);
  }

  extractPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
    const sourceUrl = window.location.href;
    const isSearchPage = /\/travel\/search|\/travel\/hotels(?:\?|$)/i.test(sourceUrl);

    if (isSearchPage) {
      const activeCard = document.querySelector<HTMLElement>(
        'c-wiz[data-hotel-id], [role="listitem"]:has(a[href*="/travel/hotels/entity/"]), div.uaTTDe, div.nId1nc'
      );
      if (activeCard) {
        const parsed = parseGoogleTravelCard(activeCard, overrideCurrency, hintCurrency);
        if (parsed && parsed.title && !isGenericNavigationTitle(parsed.title)) {
          return convertToStandardGoogleMapsPlace(parsed);
        }
      }
    }

    const html = typeof document !== 'undefined' ? document.documentElement.outerHTML : '';
    const facts = extractGoogleMapsResearchFromHtml(html);

    let rawTitle = '';
    const h1 = document.querySelector<HTMLElement>('h1, h2.fn, [data-attrid="title"], div.fn');
    if (h1?.textContent) {
      rawTitle = cleanExtractedText(h1.textContent);
    }
    if (!rawTitle) {
      const ogTitle = /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1];
      if (ogTitle) {
        rawTitle = cleanExtractedText(ogTitle.replace(/\s*[-–—|]\s*Google\s*(Travel|Hotels|Flights|旅行|酒店|机票).*$/i, ''));
      }
    }
    if (!rawTitle && typeof document !== 'undefined') {
      rawTitle = cleanExtractedText(document.title.replace(/\s*[-–—|]\s*Google\s*(Travel|Hotels|Flights|旅行|酒店|机票).*$/i, ''));
    }

    const title = cleanTitleForSearch(rawTitle);
    if (!title || isFakePlaceLabel(title) || isGenericNavigationTitle(title) || isJunkNavigationText(title)) {
      return null;
    }

    const coords = facts.coordinates || extractPlaceCoordinates(sourceUrl) || undefined;
    const cleanPlaceTitle = cleanTitleForSearch(title);
    const mapsUrl = coords
      ? `https://www.google.com/maps/place/${encodeURIComponent(cleanPlaceTitle)}/@${coords.lat},${coords.lng},17z?hl=zh-CN`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanPlaceTitle + (facts.address ? ' ' + facts.address : ''))}&hl=zh-CN`;

    const hotelFacts = extractHotelPropertyFacts(html, typeof document !== 'undefined' ? document : null);

    let sourcePlaceId = facts.sourcePlaceId;
    if (!sourcePlaceId) {
      sourcePlaceId = extractFeatureIdFromUrl(sourceUrl) || extractFeatureIdFromHtml(html) || undefined;
    }

    return {
      title,
      sourceUrl: mapsUrl,
      sourceProvider: 'google_maps',
      kind: 'stay',
      category: facts.category && facts.category !== 'Google Travel 住宿' ? facts.category : 'Hotel',
      rating: facts.rating,
      reviewCount: facts.reviewCount,
      priceLevel: facts.priceLevel,
      detectedCurrency: facts.priceCurrency || detectCurrencyFromPage(sourceUrl, facts.priceLevel, hintCurrency, overrideCurrency),
      address: facts.address,
      coordinates: coords,
      phone: facts.phone,
      website: facts.website,
      sourcePlaceId,
      types: Array.from(new Set(['lodging', 'hotel', ...(facts.types || [])])),
      hotelFacts,
      summary: '来自 Google Travel',
    };
  }

  initInlineButtons(): void {
    if (typeof document === 'undefined' || !document.body) return;

    const entityAnchors = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/travel/hotels/entity/"], a[href*="/hotels/entity/"], a[href*="/travel/hotels/s/"], a[data-hotel-id]'
    );

    for (const anchor of Array.from(entityAnchors)) {
      const card = (anchor.closest<HTMLElement>(
        'c-wiz, [role="listitem"], div.uaTTDe, div.nId1nc, div.BWBWic, div.kDe2bf, div.P2h0Yb'
      ) || anchor.parentElement?.parentElement) as HTMLElement | null;

      if (!card || card.dataset.ownlyCardInjected === 'true') continue;

      const parsedPlace = parseGoogleTravelCard(card);
      if (!parsedPlace || !parsedPlace.title) continue;

      const actionTarget = card.querySelector<HTMLElement>(
        '.BgYkof, [role="heading"], div.w70Oqd, div.n7qZ7b, div.f5L0be, div.eUe7je'
      ) || anchor;

      injectInlineCaptureButton({
        container: card,
        anchor: actionTarget,
        position: 'before',
        loadingText: '解析采集中...',
        getPlace: async () => {
          const currentPlaceFacts = parseGoogleTravelCard(card);
          const rawPlace = currentPlaceFacts || parsedPlace;
          const targetEntityUrl = anchor?.href || window.location.href;
          if (targetEntityUrl && (targetEntityUrl.includes('/travel/hotels/entity/') || targetEntityUrl.includes('/hotels/entity/'))) {
            return await resolveGoogleTravelEntityToMapsPlace(targetEntityUrl, rawPlace);
          }
          return convertToStandardGoogleMapsPlace(rawPlace);
        },
      });
    }
  }
}
