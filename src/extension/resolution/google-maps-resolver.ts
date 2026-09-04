import {
  cleanExtractedText,
  cleanTitleForSearch,
  extractFeatureIdFromUrl,
  extractPlaceCoordinates,
  isFakePlaceLabel,
  isJunkNavigationText,
  normalizePhoneDisplay,
} from '../utils';
import {
  extractFeatureIdFromHtml,
  extractGoogleMapsPreviewFacts,
  extractGoogleMapsResearchFromHtml,
  googleMapsPreviewPlaceUrl,
  type GoogleMapsResearchFacts,
} from '../google-maps-research';
import { detectPageCurrency } from '../currency-detector';
import { logger } from '../logger';

export interface ResolvedMapsEntity {
  sourcePlaceId?: string;
  canonicalUrl: string;
  title: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  detectedCurrency?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  phone?: string;
  website?: string;
  openHours?: string;
  plusCode?: string;
  types?: string[];
  facts?: GoogleMapsResearchFacts;
}

/**
 * Authoritative Google Maps Entity Resolver:
 * Takes any place title + optional address/coordinates/hint, queries Google Maps desktop
 * search with 302 redirect tracking, and resolves the canonical Google Maps place URL & facts.
 */
export async function resolveGoogleMapsEntity(
  title: string,
  options?: {
    address?: string;
    coordinates?: { lat: number; lng: number };
    sourcePlaceId?: string;
    overrideCurrency?: string;
    hintCurrency?: string;
  }
): Promise<ResolvedMapsEntity | null> {
  const cleanTitle = cleanTitleForSearch(cleanExtractedText(title));
  if (!cleanTitle || isFakePlaceLabel(cleanTitle) || isJunkNavigationText(cleanTitle)) {
    return null;
  }

  const addrSuffix = options?.address ? ' ' + options.address.trim() : '';
  const searchCandidates: string[] = [];

  // 1. If coordinates exist, try place/@lat,lng coordinate pin first
  if (options?.coordinates) {
    searchCandidates.push(
      `https://www.google.com/maps/place/${encodeURIComponent(cleanTitle)}/@${options.coordinates.lat},${options.coordinates.lng},17z?hl=zh-CN`
    );
    searchCandidates.push(
      `https://www.google.com/maps/search/${encodeURIComponent(cleanTitle)}/@${options.coordinates.lat},${options.coordinates.lng},14z?hl=zh-CN`
    );
  }

  // 2. Query pin search with title + address
  searchCandidates.push(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle + addrSuffix)}&hl=zh-CN`
  );
  searchCandidates.push(
    `https://www.google.com/maps/search/${encodeURIComponent(cleanTitle + addrSuffix)}?hl=zh-CN`
  );

  for (const candidateUrl of searchCandidates) {
    logger.debug('MapsResolver', `Resolving Google Maps entity for "${cleanTitle}"`, { candidateUrl });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(candidateUrl, {
        method: 'GET',
        credentials: 'omit',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });

      if (!res.ok) continue;

      const finalUrl = res.url || candidateUrl;
      const html = (await res.text()).slice(0, 3_000_000);

      // Extract research facts from HTML
      const facts = extractGoogleMapsResearchFromHtml(html);

      // Check for 0x or ChIJ in final redirected URL
      let sourcePlaceId = facts.sourcePlaceId || options?.sourcePlaceId;
      if (!sourcePlaceId) {
        sourcePlaceId = extractFeatureIdFromUrl(finalUrl) || extractFeatureIdFromHtml(html) || undefined;
      }

      // If we have a 0x...:0x... ID, fetch preview facts for highest precision
      if (sourcePlaceId && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(sourcePlaceId.trim())) {
        try {
          const previewUrl = googleMapsPreviewPlaceUrl(sourcePlaceId, 'https://www.google.com');
          if (previewUrl) {
            const pRes = await fetch(previewUrl, { credentials: 'omit' });
            if (pRes.ok) {
              const rawPrev = await pRes.text();
              const cleanPrev = rawPrev.replace(/^\)\]\}'\s*/, '');
              const previewFacts = extractGoogleMapsPreviewFacts(JSON.parse(cleanPrev));
              Object.assign(facts, previewFacts);
              facts.sourcePlaceId = sourcePlaceId;
            }
          }
        } catch {}
      }

      const coords = facts.coordinates || options?.coordinates || extractPlaceCoordinates(finalUrl) || undefined;

      // Canonical URL formulation
      let canonicalUrl = '';
      if (finalUrl && (finalUrl.includes('/maps/place/') || finalUrl.includes('cid='))) {
        canonicalUrl = finalUrl;
      } else if (coords) {
        canonicalUrl = `https://www.google.com/maps/place/${encodeURIComponent(cleanTitle)}/@${coords.lat},${coords.lng},17z?hl=zh-CN`;
      } else {
        canonicalUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle + (facts.address || addrSuffix))}&hl=zh-CN`;
      }

      const detectedCurrency = options?.overrideCurrency
        || facts.priceCurrency
        || detectPageCurrency({
          url: canonicalUrl,
          priceText: facts.priceLevel,
          hintCurrency: options?.hintCurrency,
          overrideCurrency: options?.overrideCurrency,
        }).currency;

      if (sourcePlaceId || facts.rating !== undefined || facts.address || coords) {
        return {
          sourcePlaceId,
          canonicalUrl,
          title: cleanTitle,
          rating: facts.rating,
          reviewCount: facts.reviewCount,
          category: facts.category,
          priceLevel: facts.priceLevel,
          detectedCurrency,
          address: facts.address || options?.address,
          coordinates: coords,
          phone: facts.phone ? normalizePhoneDisplay(facts.phone) : undefined,
          website: facts.website,
          openHours: facts.open_hours,
          plusCode: facts.plus_code,
          types: facts.types,
          facts,
        };
      }
    } catch (err) {
      logger.warn('MapsResolver', `Failed query for "${cleanTitle}" on ${candidateUrl}`, { error: String(err) });
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
