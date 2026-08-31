import { cleanExtractedText, extractCleanPriceText, isPlausiblePriceText } from './utils';

export interface GoogleMapsResearchFacts {
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  priceCurrency?: string;
  address?: string;
  phone?: string;
  website?: string;
  types?: string[];
  coordinates?: { lat: number; lng: number };
}

const PLACE_TYPE = /(restaurant|hotel|lodging|hostel|cafe|coffee|bakery|bar|food|tourist|attraction|museum|gallery|park|landmark|spa|shopping|store|market|transit|station|airport|zoo|aquarium|resort|motel|inn)/i;

function numeric(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function addressText(value: unknown): string | undefined {
  if (typeof value === 'string') return cleanExtractedText(value) || undefined;
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const country = typeof obj.addressCountry === 'string'
    ? obj.addressCountry
    : (obj.addressCountry && typeof obj.addressCountry === 'object'
      ? (obj.addressCountry as Record<string, unknown>).name
      : undefined);
  const text = [obj.streetAddress, obj.addressLocality, obj.addressRegion, obj.postalCode, country]
    .filter(Boolean).map(String).join(', ');
  return cleanExtractedText(text) || undefined;
}

export function featureIdToCid(featureId?: string | null): string | undefined {
  const match = /^0x[0-9a-f]+:0x([0-9a-f]+)$/i.exec(featureId?.trim() || '');
  if (!match?.[1]) return undefined;
  try {
    return BigInt(`0x${match[1]}`).toString(10);
  } catch {
    return undefined;
  }
}

export function googleMapsPreviewPlaceUrl(
  sourcePlaceId?: string,
  origin = 'https://www.google.com',
): string | undefined {
  if (!sourcePlaceId) return undefined;
  if (/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(sourcePlaceId.trim())) {
    return `${origin}/maps/preview/place?authuser=0&hl=zh-CN&pb=!1m4!1s${sourcePlaceId.trim()}!2e1!3m1!1e1!4b1`;
  }
  return undefined;
}

export function googleMapsSearchTbmUrl(query: string, origin = 'https://www.google.com'): string {
  return `${origin}/search?tbm=map&q=${encodeURIComponent(query)}&hl=zh-CN`;
}

export function extractFeatureIdFromHtml(html: string): string | undefined {
  const match = /0x[0-9a-f]+:0x[0-9a-f]+/i.exec(html);
  return match?.[0];
}

export function extractGoogleMapsPreviewFacts(data: unknown): GoogleMapsResearchFacts {
  const result: GoogleMapsResearchFacts = {};
  if (!Array.isArray(data)) return result;

  const placeNode = (data as unknown[])[6];
  if (!Array.isArray(placeNode)) return result;

  // Categories / Types from placeNode[13]
  if (Array.isArray(placeNode[13])) {
    const cats = placeNode[13].filter((c): c is string => typeof c === 'string');
    if (cats.length > 0) {
      result.category = cleanExtractedText(cats[0]);
      result.types = cats.map(cleanExtractedText).filter(Boolean);
    }
  }

  // Rating & Review count from placeNode[4]
  const ratingBlock = placeNode[4];
  if (Array.isArray(ratingBlock)) {
    if (typeof ratingBlock[7] === 'number' && ratingBlock[7] >= 1.0 && ratingBlock[7] <= 5.0) {
      result.rating = Math.round(ratingBlock[7] * 10) / 10;
    }
    if (typeof ratingBlock[8] === 'number' && ratingBlock[8] >= 0) {
      result.reviewCount = Math.round(ratingBlock[8]);
    } else if (Array.isArray(ratingBlock[3]) && typeof ratingBlock[3][1] === 'string') {
      const digits = ratingBlock[3][1].replace(/\D/g, '');
      if (digits) result.reviewCount = Number(digits);
    }
  }

  // Address: placeNode[18] (formatted string) or placeNode[2] (lines array)
  if (typeof placeNode[18] === 'string') {
    result.address = cleanExtractedText(placeNode[18]);
  } else if (Array.isArray(placeNode[2])) {
    const lines = placeNode[2].filter((l): l is string => typeof l === 'string');
    if (lines.length > 0) result.address = cleanExtractedText(lines.join(', '));
  }

  // Coordinates from placeNode[9]: [null, null, lat, lng]
  if (Array.isArray(placeNode[9])) {
    const lat = placeNode[9][2];
    const lng = placeNode[9][3];
    if (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      result.coordinates = { lat, lng };
    }
  }

  // Website from placeNode[7]: [url, displayUrl, ...]
  if (Array.isArray(placeNode[7]) && typeof placeNode[7][0] === 'string' && /^https?:\/\//i.test(placeNode[7][0])) {
    result.website = placeNode[7][0];
  }

  // Direct lodging room price from placeNode[88]?.[0]
  if (Array.isArray(placeNode[88]) && typeof placeNode[88][0] === 'string') {
    const rawPrice = placeNode[88][0].replace(/\u00a0/g, ' ').trim();
    if (/(?:SGD|THB|USD|HKD|NT\$|¥|฿|\$)\s*\d+/i.test(rawPrice) && !/^SGD\s*0(?:\.00)?$/i.test(rawPrice)) {
      result.priceLevel = rawPrice;
    }
  }

  // Scan placeNode for phone and priceLevel
  const queue: unknown[] = [placeNode];
  let scanned = 0;
  while (queue.length > 0 && scanned < 1000) {
    const cur = queue.shift();
    scanned += 1;
    if (typeof cur === 'string') {
      const text = cleanExtractedText(cur);
      if (!result.phone && /^\+?[\d\s\-()]{8,20}$/.test(text) && /\d{4}/.test(text)) {
        result.phone = text;
      }
      if (!result.priceLevel) {
        const cleanPrice = extractCleanPriceText(text);
        if (cleanPrice && cleanPrice !== '0' && !/^SGD\s*0(?:\.00)?$/i.test(cleanPrice)) {
          result.priceLevel = cleanPrice;
        }
      }
    } else if (Array.isArray(cur)) {
      for (const child of cur) {
        if (child && typeof child === 'object') queue.push(child);
      }
    }
  }

  return result;
}

export function googleMapsDetailUrlFromSourceId(
  sourcePlaceId?: string,
  title = '',
  origin = 'https://www.google.com',
): string | undefined {
  const cid = featureIdToCid(sourcePlaceId);
  if (cid) return `${origin}/maps?cid=${cid}`;
  if (sourcePlaceId && /^ChIJ[A-Za-z0-9_-]{8,}$/.test(sourcePlaceId)) {
    const query = encodeURIComponent(title || sourcePlaceId);
    return `${origin}/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(sourcePlaceId)}`;
  }
  return undefined;
}

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = (match[1] || '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .trim();
    if (!raw) continue;
    try { blocks.push(JSON.parse(raw)); } catch {}
    if (blocks.length >= 30) break;
  }
  return blocks;
}

export function extractGoogleMapsResearchFromHtml(html: string): GoogleMapsResearchFacts {
  const result: GoogleMapsResearchFacts = {};
  const types = new Set<string>();
  const queue: unknown[] = jsonLdBlocks(html);
  let scanned = 0;

  while (queue.length > 0 && scanned < 1500) {
    const current = queue.shift();
    scanned += 1;
    if (Array.isArray(current)) {
      queue.push(...current.slice(0, 100));
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    const obj = current as Record<string, unknown>;

    const rawType = obj['@type'] ?? obj.type;
    const typeValues = Array.isArray(rawType) ? rawType : [rawType];
    for (const typeValue of typeValues) {
      if (typeof typeValue !== 'string') continue;
      const type = cleanExtractedText(typeValue);
      if (!type) continue;
      types.add(type.toLowerCase().replace(/\s+/g, '_'));
      if (!result.category && PLACE_TYPE.test(type)) result.category = type;
    }

    const aggregate = obj.aggregateRating;
    if (aggregate && typeof aggregate === 'object') {
      const ratingObj = aggregate as Record<string, unknown>;
      const rating = numeric(ratingObj.ratingValue);
      if (rating !== undefined && rating >= 1 && rating <= 5 && result.rating === undefined) result.rating = Math.round(rating * 10) / 10;
      const reviews = numeric(ratingObj.reviewCount ?? ratingObj.ratingCount);
      if (reviews !== undefined && reviews >= 0 && result.reviewCount === undefined) result.reviewCount = Math.round(reviews);
    }

    if (!result.priceLevel && typeof obj.priceRange === 'string' && isPlausiblePriceText(obj.priceRange)) {
      result.priceLevel = cleanExtractedText(obj.priceRange);
    }
    if (!result.priceCurrency && typeof obj.priceCurrency === 'string') {
      result.priceCurrency = obj.priceCurrency.trim().toUpperCase();
    }
    if (!result.priceCurrency && typeof obj.currency === 'string' && /^[A-Z]{3}$/i.test(obj.currency)) {
      result.priceCurrency = obj.currency.trim().toUpperCase();
    }

    const low = numeric(obj.lowPrice);
    const high = numeric(obj.highPrice);
    const price = numeric(obj.price);
    const curr = typeof obj.priceCurrency === 'string' ? obj.priceCurrency.trim().toUpperCase() : result.priceCurrency;
    if (!result.priceLevel && curr && low !== undefined && high !== undefined) result.priceLevel = `${curr} ${low}–${high}`;
    else if (!result.priceLevel && curr && price !== undefined) result.priceLevel = `${curr} ${price}`;

    if (!result.address && obj.address) result.address = addressText(obj.address);
    if (!result.phone && typeof obj.telephone === 'string') result.phone = cleanExtractedText(obj.telephone) || undefined;
    if (!result.website && typeof obj.url === 'string' && /^https?:\/\//i.test(obj.url)) result.website = obj.url;

    if (!result.coordinates && obj.geo && typeof obj.geo === 'object') {
      const geo = obj.geo as Record<string, unknown>;
      const lat = numeric(geo.latitude);
      const lng = numeric(geo.longitude);
      if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
        result.coordinates = { lat, lng };
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  // Fallbacks for og:description, meta[itemprop], and JSON strings embedded in HTML
  const ogDescMatch = /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i.exec(html)
    || /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i.exec(html);
  if (ogDescMatch?.[1]) {
    const descText = cleanExtractedText(ogDescMatch[1]);
    if (result.rating === undefined) {
      const r = /([1-5]\.\d)\s*(?:[★☆]|\/\s*5|\()/i.exec(descText);
      if (r?.[1]) result.rating = Number(r[1]);
    }
    if (result.reviewCount === undefined) {
      const rev = /\(([\d,]+)\)/.exec(descText) || /([\d,]+)\s*(?:条评价|条评论|reviews?)/i.exec(descText);
      if (rev?.[1]) result.reviewCount = Number(rev[1].replace(/,/g, ''));
    }
    if (!result.priceLevel) {
      const pr = extractCleanPriceText(descText);
      if (pr && pr !== '0' && !/^SGD\s*0$/i.test(pr)) result.priceLevel = pr;
    }
  }

  const ogTitleMatch = /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)
    || /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html);
  if (ogTitleMatch?.[1] && !result.address) {
    const parts = cleanExtractedText(ogTitleMatch[1]).split('·');
    if (parts.length >= 2) {
      const addrPart = parts.slice(1).join('·').trim();
      if (addrPart.length > 5 && /\d/.test(addrPart)) result.address = addrPart;
    }
  }

  // Meta itemprop tags
  if (result.rating === undefined) {
    const m = /<meta[^>]*itemprop=["']ratingValue["'][^>]*content=["']([1-5](?:\.\d+)?)["']/i.exec(html);
    if (m?.[1]) result.rating = Number(m[1]);
  }
  if (result.reviewCount === undefined) {
    const m = /<meta[^>]*itemprop=["']reviewCount["'][^>]*content=["']([\d,]+)["']/i.exec(html);
    if (m?.[1]) result.reviewCount = Number(m[1].replace(/,/g, ''));
  }
  if (!result.priceLevel) {
    const m = /<meta[^>]*itemprop=["']priceRange["'][^>]*content=["']([^"']+)["']/i.exec(html);
    if (m?.[1] && isPlausiblePriceText(m[1])) result.priceLevel = cleanExtractedText(m[1]);
  }
  if (!result.address) {
    const m = /<meta[^>]*itemprop=["']address["'][^>]*content=["']([^"']+)["']/i.exec(html);
    if (m?.[1]) result.address = cleanExtractedText(m[1]);
  }
  if (!result.phone) {
    const m = /<meta[^>]*itemprop=["']telephone["'][^>]*content=["']([^"']+)["']/i.exec(html);
    if (m?.[1]) result.phone = cleanExtractedText(m[1]);
  }

  // Lightweight fallback for JSON-LD variants embedded as escaped fields.
  if (result.rating === undefined) {
    const m = /"ratingValue"\s*:\s*"?([1-5](?:\.\d+)?)"?/i.exec(html);
    if (m?.[1]) result.rating = Number(m[1]);
  }
  if (result.reviewCount === undefined) {
    const m = /"(?:reviewCount|ratingCount)"\s*:\s*"?([\d,]+)"?/i.exec(html);
    if (m?.[1]) result.reviewCount = Number(m[1].replace(/,/g, ''));
  }
  if (!result.priceCurrency) {
    const m = /"priceCurrency"\s*:\s*"([A-Z]{3})"/i.exec(html);
    if (m?.[1]) result.priceCurrency = m[1].toUpperCase();
  }
  if (!result.priceLevel) {
    const m = /"priceRange"\s*:\s*"([^"\\]{1,60})"/i.exec(html);
    if (m?.[1] && isPlausiblePriceText(m[1])) result.priceLevel = cleanExtractedText(m[1]);
  }
  if (!result.coordinates) {
    const coordMatch = /@([-0-9.]+),([-0-9.]+)/.exec(html);
    if (coordMatch) {
      const lat = Number(coordMatch[1]);
      const lng = Number(coordMatch[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
        result.coordinates = { lat, lng };
      }
    }
  }

  if (types.size > 0) result.types = [...types];
  return result;
}
