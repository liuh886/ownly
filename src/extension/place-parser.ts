import {
  type PlannerPlaceKind,
  type PlannerPlaceSourceProvider,
} from '../domain/planner';
import {
  cleanExtractedText,
  extractCleanPriceText,
  extractHotelPropertyFacts,
  findEntityListCategory,
  type HotelPropertyFacts,
  isFakePlaceLabel,
  isJunkNavigationText,
  isValidExtractedPriceCandidate,
  isZeroOrPlaceholderPrice,
  normalizePhoneDisplay,
} from './utils';

/**
 * Humanize a machine category token (schema.org @type or a snake_case place
 * type) into the page's display language. Raw tokens like "Restaurant" or
 * "bed_and_breakfast" otherwise leak into the stored category whenever the
 * DOM category selector misses (Google rotates obfuscated classes often).
 */
const SCHEMA_TYPE_ZH: Record<string, string> = {
  restaurant: '餐厅',
  cafeorcoffeeshop: '咖啡馆',
  cafe: '咖啡馆',
  bakery: '面包房',
  barorpub: '酒吧',
  bar: '酒吧',
  fastfoodrestaurant: '快餐',
  foodestablishment: '餐饮',
  hotel: '酒店',
  hostel: '青旅',
  guesthouse: '民宿',
  bedandbreakfast: '民宿',
  motel: '汽车旅馆',
  resort: '度假村',
  lodgingbusiness: '住宿',
  touristattraction: '旅游景点',
  museum: '博物馆',
  artgallery: '美术馆',
  park: '公园',
  amusementpark: '游乐园',
  zoo: '动物园',
  aquarium: '水族馆',
  shoppingcenter: '购物中心',
  shoppingmall: '购物中心',
  departmentstore: '百货',
  grocerystore: '超市',
  supermarket: '超市',
  conveniencestore: '便利店',
  pharmacy: '药店',
  airport: '机场',
  trainstation: '火车站',
  busstation: '汽车站',
  subwaystation: '地铁站',
  spa: '水疗',
  gym: '健身房',
  movietheater: '电影院',
  nightclub: '夜总会',
  placeofworship: '宗教场所',
  buddhisttemple: '寺庙',
  shintoshrine: '神社',
  church: '教堂',
  library: '图书馆',
  hospital: '医院',
  store: '商店',
  landmarksorhistoricalbuildings: '历史建筑',
};

export function normalizeCategoryLabel(raw: string, isZhPage: boolean): string {
  const text = cleanExtractedText(raw);
  if (!text) return text;
  // Already human text (DOM-sourced, may be any language): leave untouched.
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\s]/.test(text) && !/^[A-Za-z_]+$/.test(text)) {
    return text;
  }
  const key = text.toLowerCase().replace(/[\s_-]+/g, '');
  if (isZhPage && SCHEMA_TYPE_ZH[key]) return SCHEMA_TYPE_ZH[key];
  // Prettify snake_case / CamelCase enums when no translation applies.
  const pretty = text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  return pretty || text;
}

export function isZhDocument(doc?: Document | HTMLElement | null): boolean {
  try {
    const root = doc && 'documentElement' in doc ? doc.documentElement : typeof document !== 'undefined' ? document.documentElement : null;
    return (root?.lang || '').toLowerCase().startsWith('zh');
  } catch {
    return false;
  }
}

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
  hotelFacts?: HotelPropertyFacts;
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

  // Handle "1.2K", "1.5万", "2.1M", "200万" abbreviations with word boundary on K/M
  const kMatch = /([\d.,]+)\s*([kKmM](?=[^a-zA-Z]|$)|千|万|万件|百万)/.exec(text);
  if (kMatch?.[1]) {
    const base = parseFloat(kMatch[1].replace(',', '.'));
    const multUnit = kMatch[2];
    const multiplier = /[mM]|百万/.test(multUnit) ? 1000000 : /万/.test(multUnit) ? 10000 : 1000;
    if (Number.isFinite(base) && base > 0) return Math.round(base * multiplier);
  }

  // Handle structured review count text: "1,240 篇评价", "1,234 reviews", "580 条评价", "(1,234)"
  const match = /(?:([\d,.\s]+)\s*(?:[条篇则个]\s*(?:评价|评论|点评)|件の口コミ|건의\s*(?:이용)?후기|reviews?|rezensionen|avis|avaliações))|\(([\d,.]+)\)/i.exec(text);
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
    const segPrice = extractCleanPriceText(seg);
    if (segPrice) {
      if (!result.priceLevel) result.priceLevel = segPrice;
      const nonPricePart = seg.replace(segPrice, '').trim();
      if (nonPricePart && nonPricePart.length >= 2 && !isJunkNavigationText(nonPricePart) && !isFakePlaceLabel(nonPricePart)) {
        unassigned.push(nonPricePart);
      }
      continue;
    }

    // 6. Non-price, non-status category or area candidate
    if (seg.length <= 40 && !isJunkNavigationText(seg) && !isFakePlaceLabel(seg)) {
      unassigned.push(seg);
    }
  }

  // Fallbacks if rating/review count were not matched per-segment
  if (!result.rating) result.rating = parseRatingNumber(infoText);
  if (!result.reviewCount) result.reviewCount = parseReviewCount(infoText);

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
            if (!result.category) {
              result.category = normalizeCategoryLabel(type, isZhDocument(doc));
            }
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
    const hotelFacts = extractHotelPropertyFacts(undefined, doc);
    if (hotelFacts) {
      result.hotelFacts = hotelFacts;
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

/**
 * Canonical Google-Places-style taxonomy tokens. Machine `types` fields must
 * only ever carry these — obfuscated class names ("ejmgat_…") or JS-blob
 * substrings ("zoo" inside "zoom", "bar" inside "navbar") are rejected by
 * `isKnownPlaceTypeToken`. Human display text (`category`) is NOT gated.
 */
export const ENTITY_LIST_TYPES = new Set([
  'restaurant', 'lodging', 'hotel', 'hostel', 'bed_and_breakfast', 'guest_house', 'motel',
  'cafe', 'coffee_shop', 'bakery', 'bar', 'pub', 'meal_takeaway', 'meal_delivery', 'food_court',
  'tourist_attraction', 'museum', 'art_gallery', 'park', 'national_park', 'historical_landmark',
  'historical_place', 'scenic_viewpoint', 'spa', 'massage', 'gym', 'fitness_center',
  'amusement_park', 'water_park', 'aquarium', 'zoo', 'shopping_mall', 'department_store',
  'supermarket', 'grocery_or_supermarket', 'convenience_store', 'transit_station', 'subway_station',
  'train_station', 'bus_station', 'airport', 'ferry_terminal', 'store', 'night_club',
  // schema.org concatenations seen in real JSON-LD (normalized lowercase).
  'lodgingbusiness', 'foodestablishment', 'cafeorcoffeeshop', 'barorpub',
  'fastfoodrestaurant', 'bedandbreakfast', 'guesthouse', 'touristattraction',
  'artgallery', 'amusementpark', 'shoppingcenter', 'shoppingmall', 'departmentstore',
  'grocerystore', 'conveniencestore', 'pharmacy', 'trainstation', 'busstation',
  'subwaystation', 'movietheater', 'nightclub', 'placeofworship', 'buddhisttemple',
  'shintoshrine', 'church', 'mosque', 'library', 'hospital',
  'landmarksorhistoricalbuildings', 'resort', 'campground',
]);

/** Best-effort facts that are actually present inside an entitylist node. */
export function isKnownPlaceTypeToken(token?: string | null): boolean {
  if (!token) return false;
  return ENTITY_LIST_TYPES.has(token.toLowerCase().replace(/\s+/g, '_'));
}

/**
 * Service/amenity option vocabulary (Maps "amenities" chips). Matched
 * case-insensitively against chip text; the canonical English label is kept
 * so later AI passes see one language. These chips also leak into editorial
 * summaries ("…by the water. · Dine-in · Takeaway"), hence the shared strip.
 */
const SERVICE_OPTION_CANONICAL: Array<[RegExp, string]> = [
  [/\bdine[ -]?in\b/i, 'Dine-in'],
  [/\btake[ -]?away\b/i, 'Takeaway'],
  [/\bdelivery\b/i, 'Delivery'],
  [/\bdrive[ -]?thr?u\b/i, 'Drive-through'],
  [/\bcurbside\b/i, 'Curbside pickup'],
  [/\boutdoor\s*seating\b/i, 'Outdoor seating'],
  [/\bwheelchair\b/i, 'Wheelchair accessible'],
  [/\baccessible\b/i, 'Accessible'],
  [/\bpet[ -]?friendly\b/i, 'Pet friendly'],
  [/\bfamily[ -]?friendly\b/i, 'Family friendly'],
  [/\bfree\s*wi[ -]?fi\b/i, 'Free Wi-Fi'],
  [/\bparking\b/i, 'Parking'],
  [/\brestroom\b/i, 'Restroom'],
  [/\bbar\s*onsite\b|\bonsite\s*bar\b/i, 'Bar onsite'],
  [/堂食|内用/, '堂食'],
  [/外卖|外帶|外带/, '外卖'],
  [/自取|打包|带走/, '自取'],
  [/户外座位|露天座/, '户外座位'],
  [/无障碍|轮椅/, '无障碍'],
  [/停车/, '停车'],
  [/卫生间|洗手间/, '卫生间'],
  [/宠物友好|可带宠物/, '宠物友好'],
  [/儿童友好/, '儿童友好'],
];

export function matchServiceOption(text?: string | null): string | undefined {
  const clean = cleanExtractedText(text);
  if (!clean || clean.length > 40) return undefined;
  for (const [pattern, canonical] of SERVICE_OPTION_CANONICAL) {
    if (pattern.test(clean)) return canonical;
  }
  return undefined;
}

/**
 * Splits an editorial summary from its trailing service-chip tail:
 * "…by the water. · Dine-in · Takeaway" → "…by the water.".
 * Only trailing chip-vocabulary segments are dropped; a summary made
 * entirely of chips yields undefined (the chips live in serviceOptions).
 */
export function stripServiceChipsFromSummary(summary?: string | null): string | undefined {
  const clean = cleanExtractedText(summary);
  if (!clean) return undefined;
  const segments = clean.split(/[·•]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) return clean || undefined;
  let end = segments.length;
  while (end > 0 && matchServiceOption(segments[end - 1])) end -= 1;
  if (end === 0) return undefined;
  return segments.slice(0, end).join(' · ') || undefined;
}
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

      if (!result.priceLevel) {
        const cleanPrice = extractCleanPriceText(text);
        if (cleanPrice && !isZeroOrPlaceholderPrice(cleanPrice) && isValidExtractedPriceCandidate(cleanPrice)) {
          result.priceLevel = cleanPrice;
        }
      }
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
        if (subtitle.priceLevel && !isZeroOrPlaceholderPrice(subtitle.priceLevel) && isValidExtractedPriceCandidate(subtitle.priceLevel)) {
          result.priceLevel ??= subtitle.priceLevel;
        }
      }
      continue;
    }
    if (typeof current === 'number') {
      // Direct numeric rating in protobuf array: must be a genuine float rating with decimal (e.g. 4.7, 4.2, 3.8), NEVER integer 1
      if (!result.rating && current >= 2.0 && current <= 5.0 && Number.isFinite(current) && current % 1 !== 0) {
        result.rating = Math.round(current * 10) / 10;
      }
      continue;
    }
    if (Array.isArray(current)) {
      // Check for adjacent rating and reviewCount pair: [..., 4.7, 128450, ...]
      for (let i = 0; i < current.length - 1; i++) {
        const a = current[i];
        const b = current[i + 1];
        if (!result.rating && typeof a === 'number' && a >= 2.0 && a <= 5.0 && a % 1 !== 0 && typeof b === 'number' && b >= 5 && Number.isInteger(b)) {
          result.rating = Math.round(a * 10) / 10;
          result.reviewCount = Math.round(b);
        }
      }
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
