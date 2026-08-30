export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Decodes HTML entities, strips zero-width & control artifacts, normalizes Unicode (NFC),
 * fixing garbled text for minor languages (Thai, Japanese, Vietnamese, Arabic, Cyrillic, etc.).
 */
export function cleanExtractedText(raw?: string | null): string {
  if (!raw) return '';
  let str = String(raw);

  // 1. Decode HTML entities
  str = str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    });

  // 2. Unicode Normalization Form C (NFC) ensures composed characters (Thai vowels, Japanese kana diacritics, Vietnamese tones) are unified
  try {
    str = str.normalize('NFC');
  } catch {}

  // 3. Remove zero-width & non-printable control characters that cause rendering glitched boxes/gibberish
  str = str
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u200E\u200F]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\u00A0\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return str;
}

/**
 * Safely decodes multi-layer or partial URL-encoded strings without crashing on malformed sequences,
 * and restores non-Latin characters (Thai, CJK, etc.) cleanly.
 */
export function safeDecodeUri(urlOrSegment?: string | null): string {
  if (!urlOrSegment) return '';
  let str = String(urlOrSegment).replace(/\+/g, ' ');
  // Try decoding up to 2 times to handle double percent-encoding
  for (let i = 0; i < 2; i++) {
    if (str.includes('%')) {
      try {
        const decoded = decodeURIComponent(str);
        if (decoded === str) break;
        str = decoded;
      } catch {
        try {
          str = decodeURI(str);
        } catch {
          break;
        }
      }
    } else {
      break;
    }
  }
  return cleanExtractedText(str);
}

export function parseEntityListCoordinates(placeInfo?: unknown): { lat: number; lng: number } | undefined {
  if (!Array.isArray(placeInfo)) return undefined;
  const raw = placeInfo[5] as unknown;
  if (!Array.isArray(raw)) return undefined;
  const lat = Number(raw[2]);
  const lng = Number(raw[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

const GOOGLE_FEATURE_ID_PATTERN = /0x[0-9a-f]{8,}:0x[0-9a-f]{6,}/i;
const ENTITY_CATEGORY_HINTS = /(hotel|resort|hostel|inn\b|lodging|accommodation|stay|quarter|restaurant|food|diner|cafe|coffee|bakery|dessert|bar\b|pub\b|bistro|ramen|sushi|izakaya|spa\b|massage|onsen|attraction|museum|park\b|temple|shrine|castle|landmark|shopping|mall|market|supermarket|outlet|store|station|subway|bus|airport|terminal|ferry|transit|酒店|旅馆|民宿|度假村|客栈|餐厅|美食|料理|咖啡|甜品|景点|公园|寺|神社|博物馆|商场|超市|车站|地铁|机场|码头|按摩|水疗|体验)/i;

export function findEntityListPlaceId(item?: unknown): string | undefined {
  if (!Array.isArray(item)) return undefined;
  let scanned = 0;
  const queue: unknown[] = [item];
  while (queue.length > 0 && scanned < 200) {
    const current = queue.shift();
    scanned += 1;
    if (typeof current === 'string') {
      const match = GOOGLE_FEATURE_ID_PATTERN.exec(current);
      if (match?.[0]) return match[0];
      continue;
    }
    if (Array.isArray(current)) {
      if (current.length >= 2) {
        const first = current[0];
        const second = current[1];
        const firstText = typeof first === 'string' || typeof first === 'number' ? String(first) : '';
        const secondText = typeof second === 'string' || typeof second === 'number' ? String(second) : '';
        if (/^\d{15,20}$/.test(firstText) && /^\d{15,20}$/.test(secondText)) {
          try {
            return `0x${BigInt(firstText).toString(16)}:0x${BigInt(secondText).toString(16)}`;
          } catch {}
        }
      }
      for (const child of current.slice(0, 40)) queue.push(child);
    }
  }
  return undefined;
}

export function findEntityListCategory(item?: unknown, knownTitle?: string): string | undefined {
  if (!Array.isArray(item)) return undefined;
  const cleanTitle = knownTitle ? cleanExtractedText(knownTitle).toLowerCase() : '';
  let scanned = 0;
  const queue: unknown[] = [item];
  while (queue.length > 0 && scanned < 300) {
    const current = queue.shift();
    scanned += 1;
    if (typeof current === 'string') {
      const text = cleanExtractedText(current);
      if (
        text &&
        text.length >= 2 &&
        text.length <= 40 &&
        (!cleanTitle || text.toLowerCase() !== cleanTitle) &&
        !GOOGLE_FEATURE_ID_PATTERN.test(text) &&
        !/^https?:\/\//i.test(text) &&
        !/^\+?\d[\d\s-]{6,}$/.test(text)
      ) {
        if (ENTITY_CATEGORY_HINTS.test(text) && !isJunkNavigationText(text) && !isFakePlaceLabel(text)) {
          return text;
        }
      }
      continue;
    }
    if (Array.isArray(current)) {
      for (const child of current.slice(0, 40)) queue.push(child);
    }
  }
  return undefined;
}

const CURRENCY_CODE = /(?<![A-Za-z])(SGD|HKD|TWD|NTD|JPY|CNY|RMB|THB|KRW|MYR|VND|INR|EUR|GBP|USD|AUD|CAD|CHF|NZD)(?![A-Za-z])/i;
const PRICE_LEVEL_ONLY = /^[¥฿$€£₩]{1,4}$/;

function hasCurrencyMarker(text: string): boolean {
  return /[¥￥฿$€£₩₫₹]/.test(text) || /R\$/.test(text) || CURRENCY_CODE.test(text);
}

/** Compacts a phone string without inventing country codes. */
export function normalizePhoneDisplay(raw: string | null | undefined): string | undefined {
  const text = cleanExtractedText(raw);
  if (!text) return undefined;
  const compact = text.replace(/[^\d+]/g, '');
  // Never fabricate a leading '+' — keep the source form, just compacted.
  if (compact.replace(/\D/g, '').length < 7) return undefined;
  return compact || undefined;
}

/**
 * Extracts Google's canonical feature id ("0x…:0x…") from a maps URL.
 * This is the stable identifier shared by search/details/reviews endpoints.
 */
export function extractFeatureIdFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const match = /!1s(0x[0-9a-fA-F]{8,}:0x[0-9a-fA-F]{8,})/.exec(url);
  return match?.[1];
}

const PRICE_TOKEN_REGEX = /(?:(?:人均|per person|每人|每晚|per night|from|约)\s*[:：]?\s*)?(?:S\$|HK\$|US\$|NT\$|AU\$|A\$|CA\$|C\$|NZ\$|R\$|[¥￥฿$€£₩₫₹]|(?:USD|SGD|HKD|TWD|THB|JPY|CNY|RMB|EUR|GBP|MYR|KRW|VND|INR|AED|CHF)\s?)\s?\d[\d.,]*\+?(?:\s*[-–—〜~至到]\s*(?:S\$|HK\$|US\$|NT\$|[¥￥฿$€£₩₫₹]|(?:USD|SGD|HKD|TWD|THB|JPY|CNY|RMB|EUR|GBP|MYR|KRW|VND|INR)\s?)?\s?\d[\d.,]*\+?)?(?:\s*(?:[/·]|per|\/)?\s*(?:night|晚|person|人|pp|per night|per person|nightly|day))?/i;
const NO_CURR_PRICE_REGEX = /(?:(?:人均|per person|每人|每晚|per night|from|约)\s*)+[:：]?\s*\d[\d.,]*(?:\s*[-–—〜~至到]\s*\d[\d.,]*)?(?:\s*(?:[/·]|per|\/)?\s*(?:night|晚|person|人|pp|per night|per person|nightly|day))?/i;

/**
 * Extracts a normalized, clean price string from freeform text or card subtitles.
 * e.g. "(12,567)·฿200–400" -> "฿200–400", "Noodle shop · ฿200-400" -> "฿200-400"
 */
export function extractCleanPriceText(raw?: string | null): string | undefined {
  const text = cleanExtractedText(raw);
  if (!text) return undefined;

  // Standalone price levels: "$", "$$", "$$$", "$$$$", "¥¥", "฿฿"
  if (PRICE_LEVEL_ONLY.test(text.trim())) {
    return text.trim();
  }

  // Disqualify hotel star ratings without genuine currency markers
  if (/\b\d\s*[-–—]?\s*(?:star|stars?)\b|星级/i.test(text) && !hasCurrencyMarker(text)) {
    return undefined;
  }

  const match = PRICE_TOKEN_REGEX.exec(text);
  if (match) {
    const candidate = match[0].trim();
    if (/\d/.test(candidate) && !/^(directions|save|share|nearby|路线|保存|分享|附近)$/i.test(candidate)) {
      return candidate;
    }
  }

  // Fallback for "人均 200-400" / "每晚 per night 120" (no currency symbol)
  const matchNoCurr = NO_CURR_PRICE_REGEX.exec(text);
  if (matchNoCurr) {
    const candidate = matchNoCurr[0].trim();
    if (/\d/.test(candidate) && !/^(directions|save|share|nearby|路线|保存|分享|附近)$/i.test(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Validates that an extracted string is actually a price/budget observation,
 * not a hotel class ("5-star hotel"), rating, or other nearby badge text.
 */
export function isPlausiblePriceText(raw?: string | null): boolean {
  const text = cleanExtractedText(raw);
  if (!text) return false;
  if (PRICE_LEVEL_ONLY.test(text)) return true;
  if (/\b\d\s*[-–—]?\s*(?:star|stars?)\b|星级/i.test(text) && !hasCurrencyMarker(text)) return false;
  return Boolean(extractCleanPriceText(text));
}

/**
 * Detects Google Maps UI action labels that are NOT real place names.
 * These appear near listings as buttons/chips but get picked up by text scanning.
 */
const FAKE_PLACE_PATTERNS: RegExp[] = [
  /compare\s*price/i, /show\s*place\s*list/i, /^saved\s+in\b/i,
  /^nearby$/i, /^near\s+me$/i, /^directions$/i, /^route$/i,
  /^see\s+photos?$/i, /^overview\s+of\b/i, /^\$\d+/i,
  /^open\s+now$/i, /^highly\s+rated$/i, /^hotels?\s+near/i,
  /^restaurants?\s+near/i, /^things?\s+to\s+do/i, /^attractions?$/i,
  /^filters?$/i, /^sort\s+by/i, /^clear\s+(all|filters)/i,
  /^(get|view)\s+(more|all|results)/i, /^show\s+(all|more)/i,
  /^see\s+(all|more|outside)/i, /^results?$/i, /^list(s)?$/i,
  /^photos?$/i, /^videos?$/i, /^about$/i, /^overview$/i,
  /^menu$/i, /^order\s+online$/i, /^book\s+a\s+(table|room)$/i,
  /^hours$/i, /^website$/i, /^call$/i, /^street\s*view/i,
  /^360°?\s*view/i, /^ad$|^ads$|^sponsored$/i,
  /^price(s)?$/i, /^deals?$/i, /^offers?$/i, /^amenities$/i,
  /^reviews?$/i, /^questions?$/i, /^hotel\s+details$/i,
  /^check\s*[-–]?in$/i, /^check\s*[-–]?out$/i,
  /^\d+\s*(stars?|★)$/i, /^\$\{?[\d,]+\}?$/,
];

export function isFakePlaceLabel(text?: string | null): boolean {
  const clean = (text ?? '').trim();
  if (!clean || clean.length < 2) return true;
  return FAKE_PLACE_PATTERNS.some((p) => p.test(clean));
}

/**
 * Determines if an extracted note/text is Google Maps sidebar navigation junk
 * (e.g. "SavedRecentsTH26Lampang4Chiang Mai17Bangkok2Hong KongView moreGet app")
 */
export function isJunkNavigationText(text?: string | null): boolean {
  if (!text) return true;
  const clean = text.trim();
  if (clean.length === 0) return true;

  // Exact matches for placeholder or navigation actions
  if (/^(添加备注|add a note|edit note|编辑备注|saved|recents|view more|get app|directions|overview|photos|reviews|about)$/i.test(clean)) {
    return true;
  }

  // Clustered Google Maps sidebar header string: "SavedRecents...", "View moreGet app", etc.
  if (/SavedRecents|View more|Get app/i.test(clean)) {
    return true;
  }

  // Heuristic: string starting with "Saved" followed immediately by "Recents" or containing numbers fused with city names
  if (/(Saved|已保存)(Recents|最近)/i.test(clean) || /(Recents|最近).*(View more|查看更多)/i.test(clean)) {
    return true;
  }

  return false;
}

