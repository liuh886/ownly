import {
  type PlannerPlaceKind,
  type PlannerPlaceSourceProvider,
} from '../domain/planner';
import {
  cleanExtractedText,
  findEntityListCategory,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
  normalizePhoneDisplay,
} from './utils';

export interface ParsedPlaceData {
  title: string;
  sourceUrl: string;
  sourceProvider: PlannerPlaceSourceProvider;
  kind: PlannerPlaceKind;
  category?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  detectedCurrency?: string;
  address?: string;
  area?: string;
  summary?: string;
  userNote?: string;
  openStatus?: string;
  openHours?: string;
  website?: string;
  phone?: string;
  plusCode?: string;
  menuUrl?: string;
  reservationUrl?: string;
  reviewTopics?: string[];
  types?: string[];
  tierNote?: string;
  coordinates?: { lat: number; lng: number };
  sourcePlaceId?: string;
}

export interface AppStateSignals {
  placeId?: string;
  intlPhone?: string;
  plusCode?: string;
  types?: string[];
}

export interface SubtitleDecomposition {
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  openStatus?: string;
  area?: string;
}

/**
 * Universal rating number extractor. Handles "4.8", "4,8", "★ 4.5", "4.8 ★", "4.6 / 5".
 */
export function parseRatingNumber(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const text = cleanExtractedText(raw);
  if (!text) return undefined;
  // Disqualify hotel star classification text like "4-star hotel", "5 星级", "4 stars"
  if (/\b\d\s*[-–—]?\s*stars?\b|星级/i.test(text)) return undefined;

  // Avoid treating comma thousands (e.g. "1,234") as decimal ratings ("1.234")
  if (/^\d{1,3},\d{3}/.test(text.trim())) return undefined;

  const match = /^(?:[★☆]|Rating:?)?\s*([0-9]+(?:\.\d+|,\d{1,2})?)(?:\s*\/\s*5)?(?:\s*[★☆])?$/i.exec(text.trim()) ||
    /(?:^|\s)(?:[★☆])?\s*([0-9]+(?:\.\d+|,\d{1,2})?)\s*(?:[★☆])?\s*(?:\([0-9.,kK万mM]+\)|\/\s*5)/i.exec(text);
  if (match?.[1]) {
    const num = parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(num) && num >= 1.0 && num <= 5.0) {
      return Math.round(num * 10) / 10;
    }
  }
  return undefined;
}

/**
 * Universal review count extractor. Handles "(1,234)", "1.2K reviews", "580 条评价", "3,400件".
 */
export function parseReviewCount(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const text = cleanExtractedText(raw).trim();
  if (!text) return undefined;

  // Handle "1.2K" or "1.5万" abbreviations with word boundary on K
  const kMatch = /([\d.,]+)\s*([kK](?=[^a-zA-Z]|$)|千|万|万件)/.exec(text);
  if (kMatch?.[1]) {
    const base = parseFloat(kMatch[1].replace(',', '.'));
    const multiplier = /万/.test(kMatch[2]) ? 10000 : 1000;
    if (Number.isFinite(base) && base > 0) return Math.round(base * multiplier);
  }

  // Handle structured review count text: "1,234 reviews", "580 条评价", "(1,234)"
  const match = /(?:([\d,.\s]+)\s*(?:条评价|条评论|件の口コミ|reviews?|rezensionen|avis|avaliações))|\(([\d,.]+)\)/i.exec(text);
  if (match) {
    const rawNum = match[1] || match[2];
    const cleaned = rawNum.replace(/[^0-9]/g, '');
    if (cleaned) {
      const count = parseInt(cleaned, 10);
      if (Number.isFinite(count) && count > 0) return count;
    }
  }

  // If the entire text is purely a standalone number (e.g. "1234", "1,234")
  if (/^\(?[\d,.\s]+\)?$/.test(text)) {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned) {
      const count = parseInt(cleaned, 10);
      if (Number.isFinite(count) && count > 0) return count;
    }
  }

  return undefined;
}

const OPEN_STATUS_PATTERN = /^(open\b|closed\b|closes\b|opens\b|营业中|已关门|休息中|打烊|24\s*小时|24\s*hours|即将关门|即将营业)/i;
const PRICE_TOKEN_PATTERN = /^(?:人均|per person|每人|每晚|per night|from\s+|约\s*)?(?:[¥￥฿$€£₩₫₹]|S\$|HK\$|NT\$|US\$|[A-Z]{3}\s?)\s*\d+/i;

/**
 * Decomposes multi-part subtitle info strings from cards or headers in a single unified pass.
 * e.g. "4.5(1,234) · 4-star hotel · $$ · Open 24 hours · Charoen Nakhon Rd"
 */
export function parseSubtitleInfo(infoText?: string | null): SubtitleDecomposition {
  const result: SubtitleDecomposition = {};
  if (!infoText) return result;

  // Delimiters including Western middle dot, Japanese katakana middle dot (・), bullet (•), pipe (| / ｜)
  const rawSegments = infoText.split(/[·•|│\n・‧｜\u30FB\u2022\u2027]/).map((s) => cleanExtractedText(s)).filter(Boolean);
  const unassigned: string[] = [];

  for (const seg of rawSegments) {
    // Check if this segment is a hotel class category (e.g. "4-star hotel", "5 星级酒店")
    if (/\b\d\s*[-–—]?\s*stars?\s*hotel\b|星级/i.test(seg)) {
      if (!result.category) {
        result.category = seg;
      } else {
        unassigned.push(seg);
      }
      continue;
    }

    // 1. Rating + Review Count composite (e.g. "4.5(1,234)" or "4.8 ★ (890)")
    if (/^[★☆]?\s*[1-5](?:[.,]\d)?\s*(?:[★☆])?\s*(?:\([0-9.,kK万mM]+\)|\d+\s*(?:reviews?|评价))/i.test(seg)) {
      if (!result.rating) result.rating = parseRatingNumber(seg);
      if (!result.reviewCount) result.reviewCount = parseReviewCount(seg);
      continue;
    }

    // 2. Pure rating (including integer ratings like 5 or ★ 4)
    if (/^[★☆]?\s*[1-5](?:[.,]\d)?\s*[★☆]?$/.test(seg)) {
      if (!result.rating) result.rating = parseRatingNumber(seg);
      continue;
    }

    // 3. Pure review count
    if (/^\([0-9.,kK万mM]+\)$/.test(seg) || /^\d[\d,.]*\s*(?:条评价|reviews?|件の口コミ)$/i.test(seg)) {
      if (!result.reviewCount) result.reviewCount = parseReviewCount(seg);
      continue;
    }

    // 4. Open status
    if (OPEN_STATUS_PATTERN.test(seg)) {
      if (!result.openStatus) result.openStatus = seg;
      continue;
    }

    // 5. Price / Budget / Tier (e.g. "$$", "￥3,000〜￥4,000", "人均 ฿150–300")
    if (isPlausiblePriceText(seg) || PRICE_TOKEN_PATTERN.test(seg) || /^[¥￥฿$€£₩]{1,4}$/.test(seg) || /[¥￥฿$€£₩₫₹]\s*\d+/.test(seg)) {
      if (!result.priceLevel) result.priceLevel = seg;
      continue;
    }

    // 6. Non-price, non-status category or area candidate
    if (seg.length <= 40 && !isJunkNavigationText(seg) && !isFakePlaceLabel(seg)) {
      unassigned.push(seg);
    }
  }

  // Assign category vs area from unassigned tokens
  for (const token of unassigned) {
    if (!result.category) {
      result.category = token;
    } else if (!result.area) {
      result.area = token;
    }
  }

  return result;
}

/**
 * Extracts structured metadata from schema.org JSON-LD blocks in HTML.
 */
export function extractStructuredJsonLd(doc: Document | HTMLElement): Partial<ParsedPlaceData> {
  const result: Partial<ParsedPlaceData> = {};
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of Array.from(scripts)) {
      if (!script.textContent) continue;
      try {
        const parsed = JSON.parse(script.textContent);
        const items = Array.isArray(parsed) ? parsed : (parsed?.['@graph'] || [parsed]);

        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const rawType = item['@type'] || item.type;
          const type = Array.isArray(rawType) ? rawType[0] : rawType;
          if (type && typeof type === 'string' && type !== 'Place' && type !== 'LocalBusiness') {
            if (!result.category) result.category = cleanExtractedText(type);
          }

          if (item.name && typeof item.name === 'string' && !result.title) {
            result.title = cleanExtractedText(item.name);
          }

          if (item.aggregateRating && typeof item.aggregateRating === 'object') {
            const r = item.aggregateRating;
            if (r.ratingValue && !result.rating) result.rating = parseRatingNumber(String(r.ratingValue));
            if (r.reviewCount && !result.reviewCount) result.reviewCount = parseReviewCount(String(r.reviewCount));
            if (r.ratingCount && !result.reviewCount) result.reviewCount = parseReviewCount(String(r.ratingCount));
          }

          if (item.priceRange && typeof item.priceRange === 'string' && !result.priceLevel) {
            result.priceLevel = cleanExtractedText(item.priceRange);
          }

          if (item.telephone && typeof item.telephone === 'string' && !result.phone) {
            result.phone = normalizePhoneDisplay(item.telephone);
          }

          if (item.url && typeof item.url === 'string' && !result.website) {
            result.website = item.url;
          }

          if (item.address) {
            if (typeof item.address === 'string' && !result.address) {
              result.address = cleanExtractedText(item.address);
            } else if (typeof item.address === 'object') {
              const addrObj = item.address as Record<string, unknown>;
              const country = typeof addrObj.addressCountry === 'string'
                ? addrObj.addressCountry
                : (addrObj.addressCountry && typeof addrObj.addressCountry === 'object' ? (addrObj.addressCountry as Record<string, string>).name : '');
              const fullAddr = [
                addrObj.streetAddress,
                addrObj.addressLocality,
                addrObj.addressRegion,
                addrObj.postalCode,
                country,
              ].filter(Boolean).map(String).join(', ');
              if (fullAddr && !result.address) result.address = cleanExtractedText(fullAddr);
              if (addrObj.addressLocality && typeof addrObj.addressLocality === 'string' && !result.area) {
                result.area = cleanExtractedText(addrObj.addressLocality);
              }
            }
          }
        }
      } catch {
        // Skip individually malformed script tags without terminating search
      }
    }
  } catch {}
  return result;
}

export interface EntityListResearchFacts {
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  types?: string[];
}

const ENTITY_LIST_TYPES = new Set([
  'restaurant', 'lodging', 'hotel', 'hostel', 'bed_and_breakfast', 'guest_house', 'motel',
  'cafe', 'coffee_shop', 'bakery', 'bar', 'pub', 'meal_takeaway', 'meal_delivery', 'food_court',
  'tourist_attraction', 'museum', 'art_gallery', 'park', 'national_park', 'historical_landmark',
  'historical_place', 'scenic_viewpoint', 'spa', 'massage', 'gym', 'fitness_center',
  'amusement_park', 'water_park', 'aquarium', 'zoo', 'shopping_mall', 'department_store',
  'supermarket', 'grocery_or_supermarket', 'convenience_store', 'transit_station', 'subway_station',
  'train_station', 'bus_station', 'airport', 'ferry_terminal', 'store', 'night_club',
]);

/** Best-effort facts that are actually present inside an entitylist node. */
export function extractEntityListResearch(item: unknown, knownTitle?: string): EntityListResearchFacts {
  const result: EntityListResearchFacts = {};
  const types = new Set<string>();
  const queue: unknown[] = [item];
  let scanned = 0;

  while (queue.length > 0 && scanned < 800) {
    const current = queue.shift();
    scanned += 1;
    if (typeof current === 'string') {
      const text = cleanExtractedText(current);
      if (!text || text.length > 160) continue;
      const lower = text.toLowerCase();
      if (ENTITY_LIST_TYPES.has(lower)) types.add(lower);

      if (!result.priceLevel && isPlausiblePriceText(text)) result.priceLevel = text;
      if (!result.rating && (/[★☆]|\/\s*5|^[1-5][.,]\d$/.test(text))) {
        result.rating = parseRatingNumber(text);
      }
      if (!result.reviewCount && /(reviews?|评价|评论|口コミ|rezensionen|avis|avaliações|\([\d.,kK万mM]+\))/i.test(text)) {
        result.reviewCount = parseReviewCount(text);
      }
      if (/[·•|│\n・‧｜]/.test(text)) {
        const subtitle = parseSubtitleInfo(text);
        result.rating ??= subtitle.rating;
        result.reviewCount ??= subtitle.reviewCount;
        result.priceLevel ??= subtitle.priceLevel;
      }
      continue;
    }
    if (Array.isArray(current)) {
      for (const child of current.slice(0, 80)) queue.push(child);
    }
  }

  result.category = findEntityListCategory(item, knownTitle);
  if (types.size > 0) result.types = [...types];
  return result;
}

export const PLACE_PARSER = {
  parseRating: parseRatingNumber,
  parseReviewCount,
  parseSubtitleInfo,
  extractEntityListResearch,
  extractJsonLd: extractStructuredJsonLd,
};
