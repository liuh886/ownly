/**
 * Unified Multi-Signal Currency Detection and Cross-Validation Engine
 * Provides deterministic and weighted cross-validation to accurately identify
 * the currency of prices on any webpage or travel platform.
 */

export interface CurrencySignal {
  currency: string;
  source:
    | 'override'
    | 'site_switcher'
    | 'json_ld'
    | 'meta_tag'
    | 'explicit_token'
    | 'phone_code'
    | 'geo_coord'
    | 'tax_clue'
    | 'domain_tld'
    | 'hint';
  confidence: number;
  detail?: string;
}

export interface CurrencyDetectionResult {
  currency: string;
  confidence: number;
  signals: CurrencySignal[];
  isAmbiguousResolved: boolean;
}

const UNAMBIGUOUS_SYMBOLS: Record<string, string> = {
  '฿': 'THB',
  '铢': 'THB',
  '泰铢': 'THB',
  'บาท': 'THB',
  '€': 'EUR',
  '欧元': 'EUR',
  '£': 'GBP',
  '英镑': 'GBP',
  '₩': 'KRW',
  '원': 'KRW',
  '韩元': 'KRW',
  '₫': 'VND',
  '越盾': 'VND',
  '₹': 'INR',
  '卢比': 'INR',
  'RM': 'MYR',
  '令吉': 'MYR',
  '马币': 'MYR',
  'S$': 'SGD',
  'SGD': 'SGD',
  '新币': 'SGD',
  '新加坡元': 'SGD',
  'HK$': 'HKD',
  'HKD': 'HKD',
  '港币': 'HKD',
  '港元': 'HKD',
  'NT$': 'TWD',
  'TWD': 'TWD',
  '新台币': 'TWD',
  'US$': 'USD',
  'USD': 'USD',
  '美金': 'USD',
  '美元': 'USD',
  'AU$': 'AUD',
  'A$': 'AUD',
  'AUD': 'AUD',
  '澳币': 'AUD',
  '澳元': 'AUD',
  'CA$': 'CAD',
  'C$': 'CAD',
  'CAD': 'CAD',
  '加币': 'CAD',
  '加元': 'CAD',
  'NZ$': 'NZD',
  'NZD': 'NZD',
  '纽币': 'NZD',
  'JPY': 'JPY',
  '円': 'JPY',
  '日元': 'JPY',
  '日币': 'JPY',
  'CNY': 'CNY',
  'RMB': 'CNY',
  '人民币': 'CNY',
  'CHF': 'CHF',
};

const DOLLAR_CURRENCIES = ['SGD', 'HKD', 'AUD', 'CAD', 'NZD', 'USD', 'TWD'];

export function extractExplicitToken(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const specificMatch = /(?:S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$|SGD|HKD|TWD|USD|THB|JPY|EUR|GBP|CNY|RMB|AUD|CAD|NZD|KRW|MYR|VND|CHF|INR|\bRM\b|新台币|人民币|日元|日币|泰铢|韩元|新币|新加坡元|港币|港元|澳币|澳元|加币|加元|纽币|欧元|英镑)/i.exec(raw);
  if (specificMatch) {
    const key = specificMatch[0].toUpperCase();
    if (UNAMBIGUOUS_SYMBOLS[key]) return UNAMBIGUOUS_SYMBOLS[key];
    if (UNAMBIGUOUS_SYMBOLS[specificMatch[0]]) return UNAMBIGUOUS_SYMBOLS[specificMatch[0]];
    return key.replace(/\$$/, '');
  }

  const singleMatch = /(?:[฿€£₩₫₹円铢원])/i.exec(raw);
  if (singleMatch && UNAMBIGUOUS_SYMBOLS[singleMatch[0]]) {
    return UNAMBIGUOUS_SYMBOLS[singleMatch[0]];
  }

  return null;
}

export interface DetectionContext {
  url?: string;
  priceText?: string;
  phoneText?: string;
  pageText?: string;
  documentTitle?: string;
  hintCurrency?: string;
  overrideCurrency?: string;
  doc?: Document;
}

export function detectPageCurrency(ctx: DetectionContext): CurrencyDetectionResult {
  const signals: CurrencySignal[] = [];

  // Priority 0: User Manual Override (From Extension Sidepanel)
  const override = ctx.overrideCurrency?.trim().toUpperCase();
  if (override && override !== 'AUTO') {
    signals.push({ currency: override, source: 'override', confidence: 100, detail: 'User manual override' });
    return { currency: override, confidence: 100, signals, isAmbiguousResolved: false };
  }

  const doc = ctx.doc || (typeof document !== 'undefined' ? document : undefined);
  const rawUrl = ctx.url || (typeof window !== 'undefined' ? window.location.href : '');

  // Priority 1: SEO & Structured Data (JSON-LD & Meta Tags)
  if (doc) {
    try {
      // A. Schema.org JSON-LD (Rich Snippets / Merchant / Products)
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of Array.from(scripts)) {
        const text = script.textContent || '';
        if (text.includes('priceCurrency') || text.includes('"currency"')) {
          const match = /"(?:priceCurrency|currency)"\s*:\s*"([A-Z]{3})"/i.exec(text);
          if (match && match[1]) {
            const curr = match[1].toUpperCase();
            if (UNAMBIGUOUS_SYMBOLS[curr]) {
              signals.push({ currency: curr, source: 'json_ld', confidence: 95, detail: 'Schema.org JSON-LD' });
              break;
            }
          }
        }
      }

      // B. HTML Meta tags (OpenGraph, Product, standard meta)
      const metaEls = doc.querySelectorAll<HTMLMetaElement>(
        'meta[property*="currency" i], meta[name*="currency" i], meta[itemprop*="currency" i]'
      );
      for (const meta of Array.from(metaEls)) {
        const code = (meta.content || '').trim().toUpperCase();
        if (code.length === 3 && UNAMBIGUOUS_SYMBOLS[code]) {
          signals.push({ currency: code, source: 'meta_tag', confidence: 95, detail: meta.name || meta.getAttribute('property') || 'meta' });
          break;
        }
      }
    } catch {}
  }

  // Priority 2: Website Built-in Currency Switcher & Active DOM/Storage State
  if (doc) {
    try {
      // A. Root HTML/Body data attributes (e.g. <html data-currency="SGD">)
      const rootCurrency = doc.documentElement.getAttribute('data-currency') ||
        doc.documentElement.getAttribute('data-site-currency') ||
        doc.body?.getAttribute('data-currency');
      if (rootCurrency) {
        const code = rootCurrency.trim().toUpperCase();
        if (UNAMBIGUOUS_SYMBOLS[code]) {
          signals.push({ currency: code, source: 'site_switcher', confidence: 95, detail: 'HTML data-currency attribute' });
        }
      }

      // B. Header/Navigation Currency Picker (Booking, Agoda, Klook, TripAdvisor)
      const pickerEl = doc.querySelector<HTMLElement>(
        '[data-testid*="currency" i], [data-selected-currency], select[name*="currency" i] option:checked, [class*="currency-picker" i] [class*="active" i], [class*="currency-selector" i]'
      );
      if (pickerEl) {
        const pickerText = (pickerEl.getAttribute('data-selected-currency') || pickerEl.getAttribute('data-currency') || pickerEl.textContent || '').trim().toUpperCase();
        const extracted = extractExplicitToken(pickerText) || (pickerText.length === 3 && UNAMBIGUOUS_SYMBOLS[pickerText] ? pickerText : null);
        if (extracted) {
          signals.push({ currency: extracted, source: 'site_switcher', confidence: 92, detail: 'Site Currency Switcher / Picker' });
        }
      }
    } catch {}
  }

  // C. Storage active currency
  if (typeof window !== 'undefined') {
    try {
      const storageKeys = ['currency', 'user_currency', 'selected_currency', 'booking_currency', 'klook_currency'];
      for (const key of storageKeys) {
        const val = (window.localStorage?.getItem(key) || window.sessionStorage?.getItem(key) || '').trim().toUpperCase();
        if (val && val.length === 3 && UNAMBIGUOUS_SYMBOLS[val]) {
          signals.push({ currency: val, source: 'site_switcher', confidence: 90, detail: `Storage: ${key}` });
          break;
        }
      }
    } catch {}
  }

  // Priority 3: Explicit Currency Symbol in Target Price / Selected Text
  const explicit = extractExplicitToken(ctx.priceText);
  if (explicit) {
    signals.push({ currency: explicit, source: 'explicit_token', confidence: 100, detail: `Found explicit token in "${ctx.priceText}"` });
  }

  // Priority 4: Physical Evidence & Local Context (Phone, GPS, Tax, TLD)
  const phoneSource = ctx.phoneText || (doc ? (doc.querySelector('button[data-tooltip*="phone" i], a[href^="tel:"], div[aria-label*="phone" i]')?.textContent || '') : '');
  if (phoneSource) {
    if (/(?:\+65|\b65\s*\d{4})/i.test(phoneSource)) signals.push({ currency: 'SGD', source: 'phone_code', confidence: 90, detail: '+65 Singapore' });
    else if (/(?:\+852|\b852\s*\d{4})/i.test(phoneSource)) signals.push({ currency: 'HKD', source: 'phone_code', confidence: 90, detail: '+852 Hong Kong' });
    else if (/(?:\+886|\b886\s*\d)/i.test(phoneSource)) signals.push({ currency: 'TWD', source: 'phone_code', confidence: 90, detail: '+886 Taiwan' });
    else if (/(?:\+61|\b61\s*\d)/i.test(phoneSource)) signals.push({ currency: 'AUD', source: 'phone_code', confidence: 90, detail: '+61 Australia' });
    else if (/(?:\+81|\b81\s*\d)/i.test(phoneSource)) signals.push({ currency: 'JPY', source: 'phone_code', confidence: 90, detail: '+81 Japan' });
    else if (/(?:\+66|\b66\s*\d)/i.test(phoneSource)) signals.push({ currency: 'THB', source: 'phone_code', confidence: 90, detail: '+66 Thailand' });
    else if (/(?:\+82|\b82\s*\d)/i.test(phoneSource)) signals.push({ currency: 'KRW', source: 'phone_code', confidence: 90, detail: '+82 South Korea' });
    else if (/(?:\+60|\b60\s*\d)/i.test(phoneSource)) signals.push({ currency: 'MYR', source: 'phone_code', confidence: 90, detail: '+60 Malaysia' });
    else if (/(?:\+84|\b84\s*\d)/i.test(phoneSource)) signals.push({ currency: 'VND', source: 'phone_code', confidence: 90, detail: '+84 Vietnam' });
    else if (/(?:\+44|\b44\s*\d)/i.test(phoneSource)) signals.push({ currency: 'GBP', source: 'phone_code', confidence: 90, detail: '+44 UK' });
  }

  const coordMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(rawUrl);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (lat >= 1.15 && lat <= 1.48 && lng >= 103.55 && lng <= 104.08) {
      signals.push({ currency: 'SGD', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Singapore' });
    } else if (lat >= 22.15 && lat <= 22.58 && lng >= 113.80 && lng <= 114.45) {
      signals.push({ currency: 'HKD', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Hong Kong' });
    } else if (lat >= 21.80 && lat <= 25.40 && lng >= 119.80 && lng <= 122.10) {
      signals.push({ currency: 'TWD', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Taiwan' });
    } else if (lat >= 24.00 && lat <= 45.60 && lng >= 122.90 && lng <= 153.98) {
      signals.push({ currency: 'JPY', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Japan' });
    } else if (lat >= 5.60 && lat <= 20.50 && lng >= 97.30 && lng <= 105.70) {
      signals.push({ currency: 'THB', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Thailand' });
    } else if (lat >= 0.80 && lat <= 7.50 && lng >= 99.50 && lng <= 119.50) {
      signals.push({ currency: 'MYR', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Malaysia' });
    } else if (lat >= 33.00 && lat <= 38.60 && lng >= 124.50 && lng <= 131.00) {
      signals.push({ currency: 'KRW', source: 'geo_coord', confidence: 95, detail: 'Coordinates in South Korea' });
    } else if (lat >= 8.50 && lat <= 23.40 && lng >= 102.10 && lng >= 109.50) {
      signals.push({ currency: 'VND', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Vietnam' });
    } else if (lat >= -44.00 && lat <= -10.00 && lng >= 113.00 && lng <= 154.00) {
      signals.push({ currency: 'AUD', source: 'geo_coord', confidence: 95, detail: 'Coordinates in Australia' });
    } else if (lat >= -47.50 && lat <= -34.00 && lng >= 166.00 && lng <= 179.00) {
      signals.push({ currency: 'NZD', source: 'geo_coord', confidence: 95, detail: 'Coordinates in New Zealand' });
    } else if (lat >= 49.80 && lat <= 60.90 && lng >= -8.60 && lng <= 1.80) {
      signals.push({ currency: 'GBP', source: 'geo_coord', confidence: 95, detail: 'Coordinates in United Kingdom' });
    }
  }

  const pageSnippet = (ctx.pageText || (doc?.body?.textContent?.slice(0, 3000) || '')).toLowerCase();
  if (/(?:9%|8%)\s*gst|10%\s*service\s*charge\s*(?:and|&)\s*9%\s*gst/i.test(pageSnippet)) {
    signals.push({ currency: 'SGD', source: 'tax_clue', confidence: 85, detail: 'Singapore 9% GST statutory structure' });
  }
  if (/加一服務費|加一服务费|10%\s*service\s*charge/i.test(pageSnippet) && /hong\s*kong|香港|kowloon|九龙/i.test(pageSnippet)) {
    signals.push({ currency: 'HKD', source: 'tax_clue', confidence: 85, detail: 'Hong Kong 10% Service Charge structure' });
  }
  if (/10%\s*gst|incl\.\s*gst|plus\s*gst/i.test(pageSnippet) && /australia|sydney|melbourne|brisbane/i.test(pageSnippet)) {
    signals.push({ currency: 'AUD', source: 'tax_clue', confidence: 85, detail: 'Australia 10% GST structure' });
  }
  if (/税込|税抜|消費税/i.test(pageSnippet)) {
    signals.push({ currency: 'JPY', source: 'tax_clue', confidence: 85, detail: 'Japan Consumption Tax structure' });
  }
  if (/7%\s*vat|10%\s*service\s*charge\s*(?:and|&)\s*7%\s*vat/i.test(pageSnippet)) {
    signals.push({ currency: 'THB', source: 'tax_clue', confidence: 85, detail: 'Thailand 7% VAT structure' });
  }

  try {
    const urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const host = urlObj.hostname.toLowerCase();
    if (/\.com\.sg$|\.sg$/i.test(host)) signals.push({ currency: 'SGD', source: 'domain_tld', confidence: 75, detail: '.sg Singapore' });
    else if (/\.com\.hk$|\.hk$/i.test(host)) signals.push({ currency: 'HKD', source: 'domain_tld', confidence: 75, detail: '.hk Hong Kong' });
    else if (/\.com\.tw$|\.tw$/i.test(host)) signals.push({ currency: 'TWD', source: 'domain_tld', confidence: 75, detail: '.tw Taiwan' });
    else if (/\.co\.jp$|\.jp$/i.test(host)) signals.push({ currency: 'JPY', source: 'domain_tld', confidence: 75, detail: '.jp Japan' });
    else if (/\.co\.th$|\.th$/i.test(host)) signals.push({ currency: 'THB', source: 'domain_tld', confidence: 75, detail: '.th Thailand' });
    else if (/\.com\.au$|\.au$/i.test(host)) signals.push({ currency: 'AUD', source: 'domain_tld', confidence: 75, detail: '.au Australia' });
    else if (/\.ca$/i.test(host)) signals.push({ currency: 'CAD', source: 'domain_tld', confidence: 75, detail: '.ca Canada' });
    else if (/\.co\.uk$|\.uk$/i.test(host)) signals.push({ currency: 'GBP', source: 'domain_tld', confidence: 75, detail: '.uk UK' });
    else if (/\.fr$|\.de$|\.it$|\.es$|\.nl$/i.test(host)) signals.push({ currency: 'EUR', source: 'domain_tld', confidence: 75, detail: 'Eurozone TLD' });
    else if (/\.kr$/i.test(host)) signals.push({ currency: 'KRW', source: 'domain_tld', confidence: 75, detail: '.kr South Korea' });
    else if (/\.vn$/i.test(host)) signals.push({ currency: 'VND', source: 'domain_tld', confidence: 75, detail: '.vn Vietnam' });
    else if (/\.my$/i.test(host)) signals.push({ currency: 'MYR', source: 'domain_tld', confidence: 75, detail: '.my Malaysia' });
  } catch {}

  // Low confidence fallback: Trip currency
  if (ctx.hintCurrency) {
    signals.push({ currency: ctx.hintCurrency.trim().toUpperCase(), source: 'hint', confidence: 30, detail: 'Active trip hint fallback' });
  }

  // Decision Matrix
  const priceRaw = ctx.priceText || '';
  const isBareDollar = priceRaw.includes('$') && !/S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$/i.test(priceRaw);
  const isYenOrYuan = priceRaw.includes('¥') || priceRaw.includes('￥');

  const scores: Record<string, number> = {};
  for (const s of signals) {
    scores[s.currency] = (scores[s.currency] || 0) + s.confidence;
  }

  // 1. Bare "$" disambiguation
  if (isBareDollar) {
    let bestCurr = 'USD';
    let maxScore = -1;
    for (const curr of DOLLAR_CURRENCIES) {
      const score = scores[curr] || 0;
      if (score > maxScore && score >= 70) {
        maxScore = score;
        bestCurr = curr;
      }
    }
    return {
      currency: bestCurr,
      confidence: maxScore > 0 ? maxScore : 50,
      signals,
      isAmbiguousResolved: true,
    };
  }

  // 2. "¥" disambiguation
  if (isYenOrYuan) {
    const jpyScore = scores['JPY'] || 0;
    const cnyScore = scores['CNY'] || 0;
    const resolved = jpyScore > cnyScore || jpyScore >= 70 ? 'JPY' : 'CNY';
    return {
      currency: resolved,
      confidence: Math.max(jpyScore, cnyScore, 60),
      signals,
      isAmbiguousResolved: true,
    };
  }

  // 3. Explicit Token
  if (explicit) {
    return {
      currency: explicit,
      confidence: 100,
      signals,
      isAmbiguousResolved: false,
    };
  }

  // 4. Highest Score General
  let winningCurrency = 'USD';
  let highestScore = 0;
  for (const [curr, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      winningCurrency = curr;
    }
  }

  return {
    currency: highestScore > 0 ? winningCurrency : (ctx.hintCurrency?.toUpperCase() || 'USD'),
    confidence: highestScore,
    signals,
    isAmbiguousResolved: false,
  };
}
