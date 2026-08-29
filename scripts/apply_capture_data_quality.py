from pathlib import Path
import re

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 exact match, got {count}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, repl: str, label: str, flags=0) -> str:
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 regex match, got {count}')
    return out


# ---------------------------------------------------------------------------
# Domain: preserve source facts + normalize observed prices for Planner.
# ---------------------------------------------------------------------------
path = 'src/domain/planner.ts'
text = read(path)
text = replace_once(
    text,
    "export type PlannerPlacePriority = 'must' | 'want' | 'optional';\nexport type PlannerReservationStatus = 'none' | 'needed' | 'booked';",
    "export type PlannerPlacePriority = 'must' | 'want' | 'optional';\nexport type PlannerReservationStatus = 'none' | 'needed' | 'booked';\nexport type PlannerPriceUnit = 'person' | 'night' | 'item' | 'level' | 'unknown';",
    'planner price unit type',
)
text = replace_once(
    text,
    "  observed_rating?: number;\n  observed_price?: string;\n  observed_at?: string;",
    "  /** Raw source facts retained at full fidelity for downstream comparison. */\n  source_category?: string;\n  observed_rating?: number;\n  observed_review_count?: number;\n  observed_price?: string;\n  price_currency?: string;\n  price_min?: number;\n  price_max?: number;\n  price_unit?: PlannerPriceUnit;\n  price_level?: number;\n  observed_at?: string;",
    'planner observed facts fields',
)
text = replace_once(
    text,
    "    observed_rating: (typeof captured.observed_rating === 'number' && Number.isFinite(captured.observed_rating))\n      ? captured.observed_rating\n      : existing.observed_rating,\n    observed_price: hasContent(captured.observed_price) ? captured.observed_price : existing.observed_price,\n    observed_at: hasContent(captured.observed_at) ? captured.observed_at : existing.observed_at,",
    "    source_category: hasContent(captured.source_category) ? captured.source_category : existing.source_category,\n    observed_rating: (typeof captured.observed_rating === 'number' && Number.isFinite(captured.observed_rating))\n      ? captured.observed_rating\n      : existing.observed_rating,\n    observed_review_count: (typeof captured.observed_review_count === 'number' && Number.isFinite(captured.observed_review_count))\n      ? captured.observed_review_count\n      : existing.observed_review_count,\n    observed_price: hasContent(captured.observed_price) ? captured.observed_price : existing.observed_price,\n    price_currency: hasContent(captured.price_currency) ? captured.price_currency : existing.price_currency,\n    price_min: (typeof captured.price_min === 'number' && Number.isFinite(captured.price_min)) ? captured.price_min : existing.price_min,\n    price_max: (typeof captured.price_max === 'number' && Number.isFinite(captured.price_max)) ? captured.price_max : existing.price_max,\n    price_unit: captured.price_unit ?? existing.price_unit,\n    price_level: (typeof captured.price_level === 'number' && Number.isFinite(captured.price_level)) ? captured.price_level : existing.price_level,\n    observed_at: hasContent(captured.observed_at) ? captured.observed_at : existing.observed_at,",
    'planner merge source facts',
)
marker = "export function convertPriceRange(\n"
insert = r'''export interface NormalizedObservedPrice {
  currency?: string;
  min?: number;
  max?: number;
  unit: PlannerPriceUnit;
  level?: number;
}

/**
 * Turns a captured price label into comparable facts while retaining the raw
 * source text separately on PlannerTripPlace.observed_price.
 *
 * Ambiguous bare symbols use the page-currency detector as the authority:
 * "$" can therefore become SGD/HKD/AUD/etc. and "¥" can become JPY/CNY.
 */
export function normalizeObservedPrice(
  raw?: string | null,
  detectedCurrency?: string | null,
): NormalizedObservedPrice | null {
  const text = raw?.trim();
  if (!text) return null;

  const levelMatch = /^([$€£¥￥฿₩])\1{0,3}$/.exec(text);
  if (levelMatch) {
    return { unit: 'level', level: Math.min(4, text.length) };
  }

  const parsed = parseDetailedPrice(text);
  if (!parsed) return null;

  const hint = detectedCurrency?.trim().toUpperCase() || undefined;
  let currency = parsed.currency || hint;

  const hasBareDollar = text.includes('$')
    && !/(?:S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$|MOP\$|R\$)/i.test(text);
  if (hasBareDollar && hint && ['USD', 'SGD', 'HKD', 'AUD', 'CAD', 'NZD', 'TWD'].includes(hint)) {
    currency = hint;
  }

  const hasBareYen = /[¥￥]/.test(text) && !/(?:JPY|CNY|RMB|円|日元|人民币)/i.test(text);
  if (hasBareYen && hint && ['JPY', 'CNY'].includes(hint)) {
    currency = hint;
  }

  let unit: PlannerPriceUnit = 'unknown';
  if (/(?:人均|每人|per\s*person|\/\s*person\b|\bpp\b)/i.test(text)) unit = 'person';
  else if (/(?:每晚|per\s*night|\/\s*night\b|nightly|\bnight\b|晚\/)/i.test(text)) unit = 'night';
  else if (/(?:每件|per\s*item|\/\s*item\b|\beach\b)/i.test(text)) unit = 'item';

  return {
    currency: currency || undefined,
    min: parsed.minAmount,
    max: parsed.maxAmount,
    unit,
  };
}

'''
if marker not in text:
    raise RuntimeError('planner normalize price insertion marker missing')
text = text.replace(marker, insert + marker, 1)
write(path, text)

# ---------------------------------------------------------------------------
# Entity-list identity: current payloads commonly expose a decimal uint64 pair,
# not a literal 0x..:0x.. feature id. Convert the pair losslessly.
# ---------------------------------------------------------------------------
path = 'src/extension/utils.ts'
text = read(path)
text = replace_once(
    text,
    "    if (Array.isArray(current)) {\n      for (const child of current.slice(0, 40)) queue.push(child);\n    }",
    "    if (Array.isArray(current)) {\n      if (current.length >= 2) {\n        const first = current[0];\n        const second = current[1];\n        const firstText = typeof first === 'string' || typeof first === 'number' ? String(first) : '';\n        const secondText = typeof second === 'string' || typeof second === 'number' ? String(second) : '';\n        if (/^\\d{15,20}$/.test(firstText) && /^\\d{15,20}$/.test(secondText)) {\n          try {\n            return `0x${BigInt(firstText).toString(16)}:0x${BigInt(secondText).toString(16)}`;\n          } catch {}\n        }\n      }\n      for (const child of current.slice(0, 40)) queue.push(child);\n    }",
    'entitylist decimal feature id',
)
write(path, text)

# ---------------------------------------------------------------------------
# Parser: read any rating/review/price/type signals that do exist in list nodes.
# ---------------------------------------------------------------------------
path = 'src/extension/place-parser.ts'
text = read(path)
text = replace_once(
    text,
    "  cleanExtractedText,\n  isFakePlaceLabel,",
    "  cleanExtractedText,\n  findEntityListCategory,\n  isFakePlaceLabel,",
    'place parser import entity category',
)
insert_before = "export const PLACE_PARSER = {\n"
entity_parser = r'''export interface EntityListResearchFacts {
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

'''
if insert_before not in text:
    raise RuntimeError('place parser insertion marker missing')
text = text.replace(insert_before, entity_parser + insert_before, 1)
text = replace_once(
    text,
    "  parseSubtitleInfo,\n  extractJsonLd: extractStructuredJsonLd,",
    "  parseSubtitleInfo,\n  extractEntityListResearch,\n  extractJsonLd: extractStructuredJsonLd,",
    'PLACE_PARSER entitylist export',
)
write(path, text)

# ---------------------------------------------------------------------------
# New focused module: canonical ?cid= detail page parser used for list enrichment.
# ---------------------------------------------------------------------------
google_research = r'''import { cleanExtractedText, isPlausiblePriceText } from './utils';

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

  if (types.size > 0) result.types = [...types];
  return result;
}
'''
write('src/extension/google-maps-research.ts', google_research)

# ---------------------------------------------------------------------------
# Content script: enrich current place and explicit saved-list import from cid.
# ---------------------------------------------------------------------------
path = 'src/extension/content.ts'
text = read(path)
text = replace_once(
    text,
    "import { detectPageCurrency } from './currency-detector';",
    "import { detectPageCurrency } from './currency-detector';\nimport { extractGoogleMapsResearchFromHtml, googleMapsDetailUrlFromSourceId, type GoogleMapsResearchFacts } from './google-maps-research';",
    'content google research import',
)
text = replace_once(
    text,
    "    sourcePlaceId: target.sourcePlaceId ?? enriched.sourcePlaceId,\n    phone: target.phone ?? enriched.phone,\n    plusCode: target.plusCode ?? enriched.plusCode,\n    types: target.types && target.types.length > 0 ? target.types : enriched.types,\n    priceLevel: target.priceLevel ?? enriched.priceLevel,",
    "    sourcePlaceId: target.sourcePlaceId ?? enriched.sourcePlaceId,\n    rating: target.rating ?? enriched.rating,\n    reviewCount: target.reviewCount ?? enriched.reviewCount,\n    category: target.category ?? enriched.category,\n    address: target.address ?? enriched.address,\n    website: target.website ?? enriched.website,\n    phone: target.phone ?? enriched.phone,\n    plusCode: target.plusCode ?? enriched.plusCode,\n    types: target.types && target.types.length > 0 ? target.types : enriched.types,\n    priceLevel: target.priceLevel ?? enriched.priceLevel,\n    detectedCurrency: target.detectedCurrency ?? enriched.detectedCurrency,",
    'content apply enriched facts',
)
text = replace_once(
    text,
    "    const html = (await res.text()).slice(0, 3_000_000);\n\n    if (!place.sourcePlaceId) {",
    "    const html = (await res.text()).slice(0, 3_000_000);\n    const research = extractGoogleMapsResearchFromHtml(html);\n    place.rating ??= research.rating;\n    place.reviewCount ??= research.reviewCount;\n    place.category ??= research.category;\n    place.priceLevel ??= research.priceLevel;\n    place.detectedCurrency ??= research.priceCurrency;\n    place.address ??= research.address;\n    place.website ??= research.website;\n    place.phone ??= research.phone;\n    if ((!place.types || place.types.length === 0) && research.types?.length) place.types = research.types;\n\n    if (!place.sourcePlaceId) {",
    'content current place jsonld enrichment',
)
text = replace_once(
    text,
    "          const category = findEntityListCategory(item) || ((address && address.includes(',')) ? address.split(',').slice(-2, -1)[0]?.trim() : undefined);\n\n          places.push({",
    "          const research = PLACE_PARSER.extractEntityListResearch(item, title);\n          const category = research.category || findEntityListCategory(item, title);\n          const priceLevel = research.priceLevel;\n          const detectedCurrency = detectCurrencyFromPage(window.location.href, priceLevel, undefined, overrideCurrency);\n\n          places.push({",
    'content entitylist facts',
)
text = replace_once(
    text,
    "            userNote,\n            summary: userNote,\n            category,\n            detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, undefined, overrideCurrency),\n            coordinates,\n            sourcePlaceId: findEntityListPlaceId(item),",
    "            userNote,\n            summary: userNote,\n            rating: research.rating,\n            reviewCount: research.reviewCount,\n            category,\n            priceLevel,\n            detectedCurrency,\n            types: research.types,\n            coordinates,\n            sourcePlaceId: findEntityListPlaceId(item),",
    'content entitylist place output',
)
# Insert detail enrichment helpers before resolveGoogleMapsList.
marker = "async function resolveGoogleMapsList(overrideCurrency?: string): Promise<DetectedSavedList | null> {\n"
helper = r'''const SAVED_LIST_DETAIL_CONCURRENCY = 4;
const SAVED_LIST_DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
const savedListDetailCache = new Map<string, { at: number; facts: GoogleMapsResearchFacts }>();

async function fetchSavedListDetail(place: CurrentResearchPlace): Promise<GoogleMapsResearchFacts | null> {
  const key = place.sourcePlaceId;
  if (!key) return null;
  const cached = savedListDetailCache.get(key);
  if (cached && Date.now() - cached.at < SAVED_LIST_DETAIL_CACHE_TTL_MS) return cached.facts;

  const detailUrl = googleMapsDetailUrlFromSourceId(key, place.title, window.location.origin);
  if (!detailUrl) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(detailUrl, { credentials: 'include', signal: controller.signal });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 3_000_000);
    const facts = extractGoogleMapsResearchFromHtml(html);
    savedListDetailCache.set(key, { at: Date.now(), facts });
    return facts;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function enrichSavedListDetails(
  list: DetectedSavedList,
  overrideCurrency?: string,
): Promise<{ list: DetectedSavedList; attempted: number; enriched: number; failed: number }> {
  const places = [...list.places];
  let cursor = 0;
  let attempted = 0;
  let enriched = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < places.length) {
      const index = cursor++;
      const place = places[index];
      if (!place.sourcePlaceId) continue;
      if (place.rating !== undefined && place.reviewCount !== undefined && place.category && place.priceLevel) continue;
      attempted += 1;
      const facts = await fetchSavedListDetail(place);
      if (!facts) {
        failed += 1;
        continue;
      }
      const nextPrice = place.priceLevel ?? facts.priceLevel;
      places[index] = {
        ...place,
        rating: place.rating ?? facts.rating,
        reviewCount: place.reviewCount ?? facts.reviewCount,
        category: place.category ?? facts.category,
        priceLevel: nextPrice,
        detectedCurrency: detectCurrencyFromPage(
          place.sourceUrl,
          nextPrice,
          facts.priceCurrency ?? place.detectedCurrency ?? list.detectedCurrency,
          overrideCurrency,
        ),
        address: place.address ?? facts.address,
        website: place.website ?? facts.website,
        phone: place.phone ?? facts.phone,
        types: place.types?.length ? place.types : facts.types,
      };
      if (facts.rating !== undefined || facts.reviewCount !== undefined || facts.category || facts.priceLevel) enriched += 1;
    }
  };

  await Promise.all(Array.from({ length: Math.min(SAVED_LIST_DETAIL_CONCURRENCY, places.length) }, () => worker()));
  return { list: { ...list, places }, attempted, enriched, failed };
}

'''
if marker not in text:
    raise RuntimeError('content saved list helper marker missing')
text = text.replace(marker, helper + marker, 1)
# Add message handler before OWNLY_FETCH_LIST_BY_ID.
marker = "  if (msgType === 'OWNLY_FETCH_LIST_BY_ID') {\n"
handler = r'''  if (msgType === 'OWNLY_ENRICH_SAVED_LIST') {
    void (async () => {
      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string }).savedList;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      if (!incoming?.places?.length) {
        sendResponse({ savedList: incoming ?? null, attempted: 0, enriched: 0, failed: 0 });
        return;
      }
      const result = await enrichSavedListDetails(incoming, overrideCurrency);
      sendResponse({ savedList: result.list, attempted: result.attempted, enriched: result.enriched, failed: result.failed });
    })();
    return true;
  }
'''
if marker not in text:
    raise RuntimeError('content message insertion marker missing')
text = text.replace(marker, handler + marker, 1)
write(path, text)

# ---------------------------------------------------------------------------
# Side panel: all capture paths use the same normalized source-fact mapping.
# ---------------------------------------------------------------------------
path = 'src/extension/sidepanel/handlers.ts'
text = read(path)
text = replace_once(
    text,
    "  normalizeDelimitedText,\n  reorderPendingPlaces,",
    "  normalizeDelimitedText,\n  normalizeObservedPrice,\n  reorderPendingPlaces,",
    'handlers normalize price import',
)
# Replace buildPlaceFromDetected as a whole.
pattern = r"function buildPlaceFromDetected\([\s\S]*?\n}\n\n/\*\*\n \* Bulk-paste list resolution"
replacement = r'''function buildPlaceFromDetected(
  item: CurrentResearchPlace,
  tripId: string,
  tripTags: string[],
  now: string,
): PlannerTripPlace {
  const cleanTitle = cleanExtractedText(item.title);
  const cleanAddress = item.address ? cleanExtractedText(item.address) : undefined;
  const inferredKind = inferPlaceKind([cleanTitle, item.category, cleanAddress, ...(item.types || [])].filter(Boolean).join(' '));
  const normalizedPrice = normalizeObservedPrice(item.priceLevel, item.detectedCurrency || store.pageDetectedCurrency);
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id: crypto.randomUUID(),
    trip_id: tripId,
    title: cleanTitle,
    source_provider: item.sourceProvider || 'google_maps',
    source_url: item.sourceUrl,
    source_place_id: item.sourcePlaceId,
    source_category: item.category ? cleanExtractedText(item.category) : undefined,
    kind: inferredKind,
    area: cleanAddress?.split(/[,，·]/)[0]?.trim() || undefined,
    priority: 'want',
    tags: ensurePlaceKindTag(tripTags, inferredKind, store.lang),
    why: item.userNote || item.summary || undefined,
    signals: [],
    risks: [],
    notes: item.userNote || undefined,
    open_hours: item.openHours ? cleanExtractedText(item.openHours) : undefined,
    address: cleanAddress,
    observed_rating: item.rating,
    observed_review_count: item.reviewCount,
    observed_price: item.priceLevel,
    price_currency: normalizedPrice?.currency,
    price_min: normalizedPrice?.min,
    price_max: normalizedPrice?.max,
    price_unit: normalizedPrice?.unit,
    price_level: normalizedPrice?.level,
    observed_at: today(),
    coordinates: item.coordinates,
    phone: item.phone,
    plus_code: item.plusCode,
    menu_url: item.menuUrl,
    reservation_url: item.reservationUrl,
    review_topics: item.reviewTopics,
    types: item.types,
    reservation_status: 'none',
    state: 'candidate',
    created_at: now,
    updated_at: now,
  };
}

/**
 * Bulk-paste list resolution'''
text = regex_once(text, pattern, replacement, 'handlers buildPlaceFromDetected', flags=re.M)
# Edit mapping back to CurrentResearchPlace.
text = replace_once(
    text,
    "            category: editing.kind,\n            address: editing.address,\n            coordinates: editing.coordinates,\n            rating: editing.observed_rating,\n            priceLevel: editing.observed_price,",
    "            category: editing.source_category ?? editing.kind,\n            address: editing.address,\n            coordinates: editing.coordinates,\n            rating: editing.observed_rating,\n            reviewCount: editing.observed_review_count,\n            priceLevel: editing.observed_price,\n            detectedCurrency: editing.price_currency,",
    'handlers edit current place facts',
)
# Inline manual price edit: keep structured facts in sync.
text = replace_once(
    text,
    "          if (p.id !== placeId) return p;\n          return {\n            ...p,\n            kind: newKind,\n            priority: newPriority,\n            observed_price: newPrice,",
    "          if (p.id !== placeId) return p;\n          const normalizedPrice = normalizeObservedPrice(newPrice, p.price_currency || store.pageDetectedCurrency);\n          return {\n            ...p,\n            kind: newKind,\n            priority: newPriority,\n            observed_price: newPrice,\n            price_currency: normalizedPrice?.currency,\n            price_min: normalizedPrice?.min,\n            price_max: normalizedPrice?.max,\n            price_unit: normalizedPrice?.unit,\n            price_level: normalizedPrice?.level,",
    'handlers inline price normalization',
)
# Smart sync: enrich the saved list before building canonical inbox records.
text = replace_once(
    text,
    "      const savedList = store.detectedSavedList;\n      if (!context) {",
    "      let savedList = store.detectedSavedList;\n      if (!context) {",
    'handlers smart list mutable',
)
text = replace_once(
    text,
    "      if (!savedList || savedList.places.length === 0) return;\n      const now = new Date().toISOString();",
    "      if (!savedList || savedList.places.length === 0) return;\n      try {\n        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n        if (tab?.id) {\n          setStatus(store.lang === 'zh' ? '正在补全评分、评论量、分类与价格…' : 'Enriching ratings, reviews, categories and prices…');\n          const enriched = await chrome.tabs.sendMessage(tab.id, {\n            type: 'OWNLY_ENRICH_SAVED_LIST',\n            savedList,\n            overrideCurrency: store.mapCurrencyOverride,\n          }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;\n          if (enriched?.savedList?.places?.length) {\n            savedList = enriched.savedList;\n            store.detectedSavedList = savedList;\n          }\n        }\n      } catch (error) {\n        console.warn('[Ownly Capture] Saved-list detail enrichment failed', error);\n      }\n      const now = new Date().toISOString();",
    'handlers smart list enrichment',
)
# Smart sync per-item normalized facts.
text = replace_once(
    text,
    "        const kind = inferPlaceKind([title, item.category, address, ...(item.types || [])].filter(Boolean).join(' '));\n        const captured: PlannerTripPlace = {",
    "        const kind = inferPlaceKind([title, item.category, address, ...(item.types || [])].filter(Boolean).join(' '));\n        const normalizedPrice = normalizeObservedPrice(item.priceLevel, item.detectedCurrency || savedList.detectedCurrency || store.pageDetectedCurrency);\n        const captured: PlannerTripPlace = {",
    'handlers smart list normalized price',
)
text = replace_once(
    text,
    "          source_place_id: item.sourcePlaceId ?? existing?.source_place_id,\n          kind: existing?.kind ?? kind,",
    "          source_place_id: item.sourcePlaceId ?? existing?.source_place_id,\n          source_category: item.category ? cleanExtractedText(item.category) : existing?.source_category,\n          kind: existing?.kind ?? kind,",
    'handlers smart list category',
)
text = replace_once(
    text,
    "          observed_rating: item.rating ?? existing?.observed_rating,\n          observed_price: item.priceLevel ?? existing?.observed_price,\n          observed_at: today(),",
    "          observed_rating: item.rating ?? existing?.observed_rating,\n          observed_review_count: item.reviewCount ?? existing?.observed_review_count,\n          observed_price: item.priceLevel ?? existing?.observed_price,\n          price_currency: normalizedPrice?.currency ?? existing?.price_currency,\n          price_min: normalizedPrice?.min ?? existing?.price_min,\n          price_max: normalizedPrice?.max ?? existing?.price_max,\n          price_unit: normalizedPrice?.unit ?? existing?.price_unit,\n          price_level: normalizedPrice?.level ?? existing?.price_level,\n          observed_at: today(),",
    'handlers smart list facts',
)
# Quality coverage in success status.
text = replace_once(
    text,
    "      renderSmartListCard();\n      setStatus(dict.savedListSynced(importedCount, savedList.listName), 'success');",
    "      renderSmartListCard();\n      const total = savedList.places.length;\n      const withRating = savedList.places.filter((p) => p.rating !== undefined).length;\n      const withReviews = savedList.places.filter((p) => p.reviewCount !== undefined).length;\n      const withPrice = savedList.places.filter((p) => Boolean(p.priceLevel)).length;\n      const withCategory = savedList.places.filter((p) => Boolean(p.category)).length;\n      const coverage = store.lang === 'zh'\n        ? ` · 评分 ${withRating}/${total} · 评论量 ${withReviews}/${total} · 价格 ${withPrice}/${total} · 分类 ${withCategory}/${total}`\n        : ` · rating ${withRating}/${total} · reviews ${withReviews}/${total} · price ${withPrice}/${total} · category ${withCategory}/${total}`;\n      setStatus(`${dict.savedListSynced(importedCount, savedList.listName)}${coverage}`, 'success');",
    'handlers smart list coverage status',
)
# Main capture form: normalize edited/source price and preserve source facts.
text = replace_once(
    text,
    "    const kind = (el.kind.value as PlannerPlaceKind) || 'other';\n    const tags = ensurePlaceKindTag(normalizeDelimitedText(el.tags.value), kind, store.lang);",
    "    const kind = (el.kind.value as PlannerPlaceKind) || 'other';\n    const tags = ensurePlaceKindTag(normalizeDelimitedText(el.tags.value), kind, store.lang);\n    const rawPrice = el.price.value.trim() || undefined;\n    const normalizedPrice = normalizeObservedPrice(rawPrice, store.currentPlace.detectedCurrency || existing?.price_currency || store.pageDetectedCurrency);",
    'handlers capture form normalized price',
)
text = replace_once(
    text,
    "      source_place_id: store.currentPlace.sourcePlaceId ?? existing?.source_place_id,\n      kind,",
    "      source_place_id: store.currentPlace.sourcePlaceId ?? existing?.source_place_id,\n      source_category: store.currentPlace.category ? cleanExtractedText(store.currentPlace.category) : existing?.source_category,\n      kind,",
    'handlers capture form category',
)
text = replace_once(
    text,
    "      observed_rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,\n      observed_price: el.price.value.trim() || undefined,\n      observed_at: today(),",
    "      observed_rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,\n      observed_review_count: store.currentPlace.reviewCount ?? existing?.observed_review_count,\n      observed_price: rawPrice,\n      price_currency: normalizedPrice?.currency,\n      price_min: normalizedPrice?.min,\n      price_max: normalizedPrice?.max,\n      price_unit: normalizedPrice?.unit,\n      price_level: normalizedPrice?.level,\n      observed_at: today(),",
    'handlers capture form source facts',
)
write(path, text)

# ---------------------------------------------------------------------------
# Side-panel auto-price retry writes normalized facts as one atomic observation.
# ---------------------------------------------------------------------------
path = 'src/extension/sidepanel/capture.ts'
text = read(path)
text = replace_once(
    text,
    "import { findExistingTripPlace } from '../../domain/planner';",
    "import { findExistingTripPlace, normalizeObservedPrice } from '../../domain/planner';",
    'capture normalize price import',
)
text = replace_once(
    text,
    "      const price = store.currentPlace.priceLevel;\n      store.state = {",
    "      const price = store.currentPlace.priceLevel;\n      const normalizedPrice = normalizeObservedPrice(price, store.currentPlace.detectedCurrency || store.pageDetectedCurrency);\n      store.state = {",
    'capture auto price normalization',
)
text = replace_once(
    text,
    "          place.id === match.id ? { ...place, observed_price: price, updated_at: new Date().toISOString() } : place,",
    "          place.id === match.id ? {\n            ...place,\n            observed_price: price,\n            price_currency: normalizedPrice?.currency,\n            price_min: normalizedPrice?.min,\n            price_max: normalizedPrice?.max,\n            price_unit: normalizedPrice?.unit,\n            price_level: normalizedPrice?.level,\n            updated_at: new Date().toISOString(),\n          } : place,",
    'capture auto price facts',
)
write(path, text)

# ---------------------------------------------------------------------------
# Direct list URL resolver: retain any facts present in entitylist nodes.
# ---------------------------------------------------------------------------
path = 'src/extension/api.ts'
text = read(path)
text = replace_once(
    text,
    "import { ensurePlaceKindTag, inferPlaceKind, type CaptureContext, type PlannerTripPlace } from '../domain/planner';",
    "import { ensurePlaceKindTag, inferPlaceKind, normalizeObservedPrice, type CaptureContext, type PlannerTripPlace } from '../domain/planner';",
    'api normalize price import',
)
text = replace_once(
    text,
    "import { cleanExtractedText, findEntityListPlaceId, isJunkNavigationText, parseEntityListCoordinates, today } from './utils';",
    "import { cleanExtractedText, findEntityListCategory, findEntityListPlaceId, isJunkNavigationText, parseEntityListCoordinates, today } from './utils';\nimport { PLACE_PARSER } from './place-parser';",
    'api parser imports',
)
text = replace_once(
    text,
    "        const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeTitle)}`;",
    "        const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeTitle)}`;\n        const research = PLACE_PARSER.extractEntityListResearch(item, placeTitle);\n        const sourceCategory = research.category || findEntityListCategory(item, placeTitle);\n        const normalizedPrice = normalizeObservedPrice(research.priceLevel);",
    'api entitylist research',
)
text = replace_once(
    text,
    "        const inferredKind = inferPlaceKind(placeTitle + ' ' + (address || ''));",
    "        const inferredKind = inferPlaceKind([placeTitle, sourceCategory, address, ...(research.types || [])].filter(Boolean).join(' '));",
    'api inferred kind richer',
)
text = replace_once(
    text,
    "          source_url: sourceUrl,\n          kind: inferredKind,",
    "          source_url: sourceUrl,\n          source_category: sourceCategory,\n          kind: inferredKind,",
    'api source category',
)
text = replace_once(
    text,
    "          notes: userNote,\n          address,",
    "          notes: userNote,\n          observed_rating: research.rating,\n          observed_review_count: research.reviewCount,\n          observed_price: research.priceLevel,\n          price_currency: normalizedPrice?.currency,\n          price_min: normalizedPrice?.min,\n          price_max: normalizedPrice?.max,\n          price_unit: normalizedPrice?.unit,\n          price_level: normalizedPrice?.level,\n          types: research.types,\n          address,",
    'api structured facts',
)
write(path, text)

# ---------------------------------------------------------------------------
# Tests: identity, price normalization, source-fact merge, HTML detail parser.
# ---------------------------------------------------------------------------
path = 'src/domain/planner.test.ts'
text = read(path)
text = replace_once(
    text,
    "  normalizePlaceIdentity,\n  optimizeStopsSequence,",
    "  normalizePlaceIdentity,\n  normalizeObservedPrice,\n  optimizeStopsSequence,",
    'planner test import normalize price',
)
insert_marker = "  it('converts prefixed-dollar prices into the trip base currency in budget estimates (B1)', () => {\n"
tests = r'''  it('normalizes captured price text into comparable source facts', () => {
    expect(normalizeObservedPrice('人均 ฿400–600', 'THB')).toEqual({
      currency: 'THB', min: 400, max: 600, unit: 'person',
    });
    expect(normalizeObservedPrice('S$1,024 night', 'SGD')).toEqual({
      currency: 'SGD', min: 1024, max: 1024, unit: 'night',
    });
    expect(normalizeObservedPrice('$$$')).toEqual({ unit: 'level', level: 3 });
    expect(normalizeObservedPrice('$50–100', 'SGD')).toEqual({
      currency: 'SGD', min: 50, max: 100, unit: 'unknown',
    });
    expect(normalizeObservedPrice('¥3,500', 'JPY')).toEqual({
      currency: 'JPY', min: 3500, max: 3500, unit: 'unknown',
    });
  });

  it('refreshes raw category, review volume and structured price without touching Planner decisions', () => {
    const existing = place('facts', { kind: 'food', priority: 'must', source_category: 'Restaurant' });
    const captured = place('facts', {
      kind: 'cafe',
      priority: 'optional',
      source_category: 'Thai restaurant',
      observed_review_count: 12480,
      observed_price: '人均 ฿400–600',
      price_currency: 'THB',
      price_min: 400,
      price_max: 600,
      price_unit: 'person',
    });
    const merged = mergeCapturedPlaceResearch(existing, captured);
    expect(merged.kind).toBe('food');
    expect(merged.priority).toBe('must');
    expect(merged.source_category).toBe('Thai restaurant');
    expect(merged.observed_review_count).toBe(12480);
    expect(merged.price_currency).toBe('THB');
    expect(merged.price_min).toBe(400);
    expect(merged.price_max).toBe(600);
    expect(merged.price_unit).toBe('person');
  });

'''
if insert_marker not in text:
    raise RuntimeError('planner tests marker missing')
text = text.replace(insert_marker, tests + insert_marker, 1)
write(path, text)

path = 'src/extension/utils.test.ts'
text = read(path)
insert_marker = "  it('returns undefined when no feature id exists or input is invalid', () => {\n"
test = r'''  it('reconstructs feature id from the decimal uint64 pair used by current entitylist payloads', () => {
    const item = [null, [null, null, null, null, null, [null, null, 1.2893, 103.8631], ['3592211867340460493', '9202232323147137646']]];
    const expected = `0x${BigInt('3592211867340460493').toString(16)}:0x${BigInt('9202232323147137646').toString(16)}`;
    expect(findEntityListPlaceId(item)).toBe(expected);
  });

'''
if insert_marker not in text:
    raise RuntimeError('utils test marker missing')
text = text.replace(insert_marker, test + insert_marker, 1)
write(path, text)

path = 'src/extension/place-parser.test.ts'
text = read(path)
text = replace_once(
    text,
    "  parseSubtitleInfo,\n} from './place-parser';",
    "  parseSubtitleInfo,\n  extractEntityListResearch,\n} from './place-parser';\nimport { extractGoogleMapsResearchFromHtml, featureIdToCid, googleMapsDetailUrlFromSourceId } from './google-maps-research';",
    'place parser test imports',
)
text += r'''

describe('Google Maps saved-list enrichment', () => {
  it('extracts any research facts already embedded in an entitylist node', () => {
    const item = ['meta', ['Thai restaurant', '4.7 ★ (2,134)', '人均 ฿400–600', 'restaurant']];
    expect(extractEntityListResearch(item, 'Example Place')).toEqual({
      rating: 4.7,
      reviewCount: 2134,
      category: 'Thai restaurant',
      priceLevel: '人均 ฿400–600',
      types: ['restaurant'],
    });
  });

  it('converts feature ids to canonical cid detail URLs losslessly', () => {
    expect(featureIdToCid('0x1:0x2a')).toBe('42');
    expect(googleMapsDetailUrlFromSourceId('0x1:0x2a', 'Place')).toBe('https://www.google.com/maps?cid=42');
  });

  it('parses rating, reviews, category, price and contact facts from place JSON-LD', () => {
    const html = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Example Thai',
      aggregateRating: { ratingValue: '4.7', reviewCount: '2134' },
      priceRange: '฿400–600',
      priceCurrency: 'THB',
      telephone: '+66 2 123 4567',
      url: 'https://example.test',
      address: { streetAddress: '1 Sukhumvit Rd', addressLocality: 'Bangkok', addressCountry: 'TH' },
    })}</script></head></html>`;
    const facts = extractGoogleMapsResearchFromHtml(html);
    expect(facts.rating).toBe(4.7);
    expect(facts.reviewCount).toBe(2134);
    expect(facts.category).toBe('Restaurant');
    expect(facts.priceLevel).toBe('฿400–600');
    expect(facts.priceCurrency).toBe('THB');
    expect(facts.phone).toBe('+66 2 123 4567');
    expect(facts.address).toContain('Bangkok');
  });
});
'''
write(path, text)

# ---------------------------------------------------------------------------
# Docs + extension version.
# ---------------------------------------------------------------------------
path = 'docs/CAPTURE_SYNC_BOUNDARY.md'
text = read(path)
text += """

## Research fact contract

Capture keeps raw source evidence and normalized comparable facts together. The canonical place may store:

- `source_category`: the provider's high-resolution category label
- `observed_rating` + `observed_review_count`
- `observed_price`: untouched source text
- `price_currency`, `price_min`, `price_max`, `price_unit`, `price_level`
- `types`, hours, address, coordinates and contact/source links

Google Maps saved lists are intentionally treated as thin identity payloads. When a list is imported, Capture uses each stable Google feature id to fetch the canonical `?cid=` detail page with bounded concurrency, enriches from structured page metadata, then reports field coverage. It does not fabricate category from an address and it does not persist converted prices; FX conversion remains a view-time operation against the trip currency.
"""
write(path, text)

path = 'extension/manifest.json'
text = read(path)
text = replace_once(text, '"version": "0.5.0"', '"version": "0.5.1"', 'manifest version')
write(path, text)

print('capture data quality patch applied')
