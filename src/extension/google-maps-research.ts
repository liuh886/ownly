import { cleanExtractedText, isPlausiblePriceText } from './utils';

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
