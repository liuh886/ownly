import { describe, expect, it } from 'vitest';
import {
  cleanExtractedText,
  cleanTitleForSearch,
  deriveHotelSignals,
  extractCleanPriceText,
  extractFeatureIdFromUrl,
  extractHotelPropertyFacts,
  findEntityListCategory,
  findEntityListPlaceId,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
  isZeroOrPlaceholderPrice,
  normalizePhoneDisplay,
  parseEntityListCoordinates,
  safeDecodeUri,
} from './utils';
import {
  findAgodaHotelUrl,
  parseAgodaCard,
  detectAgodaSavedList,
  AgodaAdapter,
} from './adapters/agoda';

// Lightweight Mock DOM for Node environment tests
class MockElement {
  tagName: string;
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  _textContent: string = '';
  href: string = '';
  dataset: Record<string, string> = {};

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    if (this.children.length === 0) return this._textContent;
    return extractMockText(this);
  }

  set textContent(val: string) {
    this._textContent = val;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name.toLowerCase(), value);
    if (name.toLowerCase() === 'href') {
      this.href = value;
    }
    if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[prop] = value;
    }
  }

  getAttribute(name: string): string | null {
    if (name.toLowerCase() === 'href') return this.href || this.attributes.get('href') || null;
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
  }

  set innerHTML(html: string) {
    this.children = parseHtmlToMockElements(html, this);
    this.textContent = extractMockText(this);
  }

  get innerHTML(): string {
    return this.children.map((c) => c.outerHTML).join('');
  }

  get outerHTML(): string {
    return `<${this.tagName.toLowerCase()}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
  }

  querySelector<T = MockElement>(selector: string): T | null {
    const list = this.querySelectorAll<T>(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll<T = MockElement>(selector: string): T[] {
    const selectors = selector.split(',').map((s) => s.trim());
    const matches: MockElement[] = [];
    const walk = (node: MockElement) => {
      for (const sel of selectors) {
        if (mockMatchesSelector(node, sel)) {
          matches.push(node);
          break;
        }
      }
      for (const child of node.children) {
        walk(child);
      }
    };
    for (const child of this.children) {
      walk(child);
    }
    return matches as unknown as T[];
  }

  closest<T = MockElement>(selector: string): T | null {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curr: MockElement | null = this;
    const selectors = selector.split(',').map((s) => s.trim());
    while (curr) {
      for (const sel of selectors) {
        if (mockMatchesSelector(curr, sel)) {
          return curr as unknown as T;
        }
      }
      curr = curr.parentElement;
    }
    return null;
  }
}

function mockMatchesSelector(node: MockElement, selector: string): boolean {
  if (!selector) return false;
  let sel = selector.trim();
  if (sel === '*') return true;

  const tagMatch = /^([a-zA-Z0-9]+)/.exec(sel);
  if (tagMatch) {
    if (node.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
    sel = sel.slice(tagMatch[0].length);
  }

  while (sel.length > 0) {
    if (sel.startsWith('.')) {
      const clsMatch = /^\.([a-zA-Z0-9_-]+)/.exec(sel);
      if (!clsMatch) break;
      const cls = clsMatch[1];
      const classAttr = node.getAttribute('class') || '';
      if (!classAttr.split(/\s+/).includes(cls) && !classAttr.includes(cls)) return false;
      sel = sel.slice(clsMatch[0].length);
    } else if (sel.startsWith('[')) {
      const attrMatch = /^\[([a-zA-Z0-9_-]+)([*^$]?=)?(["']?)([^"'\]]*)\3\]/.exec(sel);
      if (!attrMatch) break;
      const [, attrName, op, , attrVal] = attrMatch;
      const actualVal = node.getAttribute(attrName);
      if (actualVal === null) return false;
      if (op === '=') {
        if (actualVal !== attrVal) return false;
      } else if (op === '*=') {
        if (!actualVal.includes(attrVal)) return false;
      } else if (op === '^=') {
        if (!actualVal.startsWith(attrVal)) return false;
      } else if (op === '$=') {
        if (!actualVal.endsWith(attrVal)) return false;
      }
      sel = sel.slice(attrMatch[0].length);
    } else {
      break;
    }
  }

  return true;
}

function parseHtmlToMockElements(html: string, parent: MockElement): MockElement[] {
  const root = new MockElement('root');
  const stack: MockElement[] = [root];
  const tagTokenRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9_-]+)((?:\s+[a-zA-Z0-9_-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/)?>|([^<]+)/g;

  let match: RegExpExecArray | null;
  while ((match = tagTokenRegex.exec(html)) !== null) {
    const [full, isClosing, tagName, attrsStr, isSelfClosing, text] = match;
    if (full.startsWith('<!--')) continue;
    if (text) {
      const trimmed = text.trim();
      if (trimmed && stack.length > 0) {
        const top = stack[stack.length - 1];
        top.textContent = (top.textContent ? top.textContent + ' ' : '') + trimmed;
      }
      continue;
    }

    if (isClosing) {
      if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tagName.toLowerCase()) {
        stack.pop();
      }
    } else if (tagName) {
      const el = new MockElement(tagName);
      if (attrsStr) {
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
          const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
          el.setAttribute(attrMatch[1], val);
        }
      }
      const currentParent = stack[stack.length - 1];
      currentParent.appendChild(el);

      const isVoid = Boolean(isSelfClosing) || /^(img|br|hr|input|meta|link)$/i.test(tagName);
      if (!isVoid) {
        stack.push(el);
      }
    }
  }

  for (const child of root.children) {
    child.parentElement = parent;
  }
  return root.children;
}

function extractMockText(el: MockElement): string {
  if (el.children.length === 0) return el.textContent;
  return el.children.map((c) => extractMockText(c)).filter(Boolean).join(' ').trim();
}

if (typeof globalThis.document === 'undefined') {
  const body = new MockElement('body');
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => new MockElement(tag),
    querySelector: (sel: string) => body.querySelector(sel),
    querySelectorAll: (sel: string) => body.querySelectorAll(sel),
    body,
    title: '芭提雅度假精选 2026 | Agoda',
  };
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    location: {
      href: 'https://www.agoda.com/trips/detail?navBack=true&id=78652960&tab=saved',
    },
    document: (globalThis as unknown as { document: unknown }).document,
  };
}

describe('cleanExtractedText & safeDecodeUri', () => {
  it('decodes HTML entities properly', () => {
    expect(cleanExtractedText('McDonald&#39;s &amp; Cafe &quot;Delight&quot;')).toBe('McDonald\'s & Cafe "Delight"');
    expect(cleanExtractedText('Tom&#x27;s Bistro')).toBe("Tom's Bistro");
  });

  it('normalizes minor languages (Thai, Japanese, Vietnamese, Arabic)', () => {
    // Thai place name
    const thaiName = 'ร้านอาหารไทย &amp; คาเฟ่';
    expect(cleanExtractedText(thaiName)).toBe('ร้านอาหารไทย & คาเฟ่');

    // Japanese with combining characters
    const japaneseName = 'ラーメン 炙りチャーシュー';
    expect(cleanExtractedText(japaneseName)).toBe('ラーメン 炙りチャーシュー');

    // Vietnamese with diacritics
    const vietnamese = 'Phở Bò Gia Truyền';
    expect(cleanExtractedText(vietnamese)).toBe('Phở Bò Gia Truyền');
  });

  it('removes zero-width and invisible control artifacts', () => {
    const dirty = 'Bangkok\u200B \uFEFFPalace\u00AD \u200EHotel\u00A0';
    expect(cleanExtractedText(dirty)).toBe('Bangkok Palace Hotel');
  });

  it('safely decodes complex and multi-layer percent-encoded URLs', () => {
    // Percent-encoded Thai
    expect(safeDecodeUri('%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%99')).toBe('ร้าน');

    // URL with plus signs
    expect(safeDecodeUri('Grand+Hyatt+Tokyo')).toBe('Grand Hyatt Tokyo');
  });
});

describe('isJunkNavigationText', () => {
  it('detects and rejects Google Maps sidebar navigation junk', () => {
    const junk1 = 'SavedRecentsTH26Lampang4Chiang Mai17Bangkok2Hong KongView moreGet app';
    expect(isJunkNavigationText(junk1)).toBe(true);

    const junk2 = 'SavedRecentsExplore';
    expect(isJunkNavigationText(junk2)).toBe(true);

    const junk3 = 'View moreGet app';
    expect(isJunkNavigationText(junk3)).toBe(true);
  });

  it('detects placeholder buttons', () => {
    expect(isJunkNavigationText('添加备注')).toBe(true);
    expect(isJunkNavigationText('add a note')).toBe(true);
    expect(isJunkNavigationText('Edit note')).toBe(true);
  });

  it('accepts legitimate user notes', () => {
    expect(isJunkNavigationText('这家芒果糯米饭特别好吃，必须提前排队')).toBe(false);
    expect(isJunkNavigationText('Great sunset view on the rooftop, reservation required')).toBe(false);
    expect(isJunkNavigationText('曼谷必吃泰北咖喱面')).toBe(false);
    expect(isJunkNavigationText('อร่อยมาก แนะนำสั่งต้มยำกุ้ง')).toBe(false);
  });
});

describe('extractCleanPriceText', () => {
  it('extracts clean price tokens from composite strings', () => {
    expect(extractCleanPriceText('(12,567)·฿200–400')).toBe('฿200–400');
    expect(extractCleanPriceText('4.2 (12,567) · ฿200–400 · Noodle shop')).toBe('฿200–400');
    expect(extractCleanPriceText('Noodle shop · ฿200-400')).toBe('฿200-400');
    expect(extractCleanPriceText('฿200–400')).toBe('฿200–400');
    expect(extractCleanPriceText('人均 ฿200–400')).toBe('人均 ฿200–400');
    expect(extractCleanPriceText('299 บาท')).toBe('299 บาท');
    expect(extractCleanPriceText('บุฟเฟ่ต์ 299.-')).toBe('299.-');
    expect(extractCleanPriceText('คนละ 199 บาท')).toBe('คนละ 199 บาท');
    expect(extractCleanPriceText('人均 200-400 泰铢')).toBe('人均 200-400 泰铢');
    expect(extractCleanPriceText('¥1,000–2,000 per person')).toBe('¥1,000–2,000 per person');
    expect(extractCleanPriceText('$$$')).toBe('$$$');
    expect(extractCleanPriceText('S$1,024 night')).toBe('S$1,024 night');
  });

  it('returns undefined for non-price, hotel star text, and spurious tokens', () => {
    expect(extractCleanPriceText('5-star hotel')).toBeUndefined();
    expect(extractCleanPriceText('4.4 (996)·5-star hotel')).toBeUndefined();
    expect(extractCleanPriceText('4.2 (12,567)')).toBeUndefined();
    expect(extractCleanPriceText('Noodle shop')).toBeUndefined();
    expect(extractCleanPriceText('2b-')).toBeUndefined();
    expect(extractCleanPriceText('3x-')).toBeUndefined();
    expect(extractCleanPriceText('4a')).toBeUndefined();
    expect(extractCleanPriceText('ส้มหมูกะทะ&ซีฟู๊ด บุฟเฟ่ต์ 401 Ratchada Niwet Road')).toBeUndefined();
  });
});

describe('isPlausiblePriceText', () => {
  it('accepts real prices and price levels', () => {
    expect(isPlausiblePriceText('$$$')).toBe(true);
    expect(isPlausiblePriceText('¥¥')).toBe(true);
    expect(isPlausiblePriceText('¥1,000–2,000')).toBe(true);
    expect(isPlausiblePriceText('$89 / night')).toBe(true);
    expect(isPlausiblePriceText('人均 ฿200–400')).toBe(true);
    expect(isPlausiblePriceText('每晚 per night 120')).toBe(true);
    expect(isPlausiblePriceText('TWD1,200')).toBe(true);
    expect(isPlausiblePriceText('S$1,024 night')).toBe(true);
    expect(isPlausiblePriceText('SGD 1,024')).toBe(true);
    expect(isPlausiblePriceText('THB 2,350')).toBe(true);
    expect(isPlausiblePriceText('(12,567)·฿200–400')).toBe(true);
  });

  it('rejects hotel tiers and non-price text', () => {
    expect(isPlausiblePriceText('5-star hotel')).toBe(false);
    expect(isPlausiblePriceText('4 stars')).toBe(false);
    expect(isPlausiblePriceText('五星级饭店')).toBe(false);
    expect(isPlausiblePriceText('Luxury Hotel & Resort')).toBe(false);
    expect(isPlausiblePriceText('TWD')).toBe(false);
    expect(isPlausiblePriceText('2b-')).toBe(false);
    expect(isPlausiblePriceText('3x-')).toBe(false);
    expect(isPlausiblePriceText('')).toBe(false);
    expect(isPlausiblePriceText(null)).toBe(false);
  });
});

describe('isZeroOrPlaceholderPrice', () => {
  it('correctly identifies empty, zero, and placeholder price tokens', () => {
    expect(isZeroOrPlaceholderPrice('')).toBe(true);
    expect(isZeroOrPlaceholderPrice(null)).toBe(true);
    expect(isZeroOrPlaceholderPrice(undefined)).toBe(true);
    expect(isZeroOrPlaceholderPrice('0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('$0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('¥0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('฿0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('0.00')).toBe(true);
    expect(isZeroOrPlaceholderPrice('0.-')).toBe(true);
    expect(isZeroOrPlaceholderPrice('0 บาท')).toBe(true);
    expect(isZeroOrPlaceholderPrice('SGD 0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('SGD0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('S$0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('S$ 0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('SGD 0.00')).toBe(true);
    expect(isZeroOrPlaceholderPrice('THB 0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('USD 0.00')).toBe(true);
    expect(isZeroOrPlaceholderPrice('人均 0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('人均 $0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('人均 ฿0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('人均 SGD 0')).toBe(true);
    expect(isZeroOrPlaceholderPrice('SGD 0 / 晚')).toBe(true);
    expect(isZeroOrPlaceholderPrice('2b-')).toBe(true);
    expect(isZeroOrPlaceholderPrice('3x-')).toBe(true);
  });

  it('preserves valid prices', () => {
    expect(isZeroOrPlaceholderPrice('฿200–400')).toBe(false);
    expect(isZeroOrPlaceholderPrice('299 บาท')).toBe(false);
    expect(isZeroOrPlaceholderPrice('บุฟเฟ่ต์ 299.-')).toBe(false);
    expect(isZeroOrPlaceholderPrice('S$1,024 night')).toBe(false);
    expect(isZeroOrPlaceholderPrice('THB 2,350')).toBe(false);
    expect(isZeroOrPlaceholderPrice('$$$')).toBe(false);
  });
});

describe('parseEntityListCoordinates', () => {
  it('parses valid coordinates from the entitylist place info shape', () => {
    expect(parseEntityListCoordinates([, , , , , [null, null, 35.7147, 139.7966]])).toEqual({ lat: 35.7147, lng: 139.7966 });
  });

  it('rejects malformed, zero and out-of-range payloads', () => {
    expect(parseEntityListCoordinates(undefined)).toBeUndefined();
    expect(parseEntityListCoordinates([, , , , , 'not-array'])).toBeUndefined();
    expect(parseEntityListCoordinates([, , , , , []])).toBeUndefined();
    expect(parseEntityListCoordinates([, , , , , [0, 0, 'x', 'y']])).toBeUndefined();
    expect(parseEntityListCoordinates([, , , , , [0, 0, 0, 0]])).toBeUndefined();
    expect(parseEntityListCoordinates([, , , , , [0, 0, 999, 0]])).toBeUndefined();
  });
});

describe('findEntityListPlaceId & findEntityListCategory', () => {
  it('extracts a Google internal feature id from item payload', () => {
    const item = ['meta', [null, '0x3ba58a39c41ff829:0x715f5a08d2ca8f6f'], 'Sensoji', 'note'];
    expect(findEntityListPlaceId(item)).toBe('0x3ba58a39c41ff829:0x715f5a08d2ca8f6f');
  });

  it('reconstructs feature id from the decimal uint64 pair used by current entitylist payloads', () => {
    const item = [null, [null, null, null, null, null, [null, null, 1.2893, 103.8631], ['3592211867340460493', '9202232323147137646']]];
    const expected = `0x${BigInt('3592211867340460493').toString(16)}:0x${BigInt('9202232323147137646').toString(16)}`;
    expect(findEntityListPlaceId(item)).toBe(expected);
  });

  it('reconstructs feature id when second integer is a negative signed 64-bit integer', () => {
    const item = [null, [null, null, 'Tawaen Beach', null, 'Address', [null, null, 12.925, 100.778], ['3531552460148579037', '-6449251292864702433'], '/g/11b6t7jjvq'], 'Tawaen Beach'];
    expect(findEntityListPlaceId(item)).toBe('0x3102984064d01add:0xa67fa81e6592181f');
  });

  it('returns undefined when no feature id exists or input is invalid', () => {
    expect(findEntityListPlaceId(undefined)).toBeUndefined();
    expect(findEntityListPlaceId(['plain', ['nested', 'values']])).toBeUndefined();
    expect(findEntityListPlaceId(['0x123'])).toBeUndefined();
  });

  it('extracts hotel/dining/attraction category from entitylist payload', () => {
    const hotelItem = ['meta', [null, '0x1:0x2', null, null, 'Address', null, null, null, null, null, null, null, null, 'Hotel & Resort']];
    expect(findEntityListCategory(hotelItem)).toBe('Hotel & Resort');

    const thaiHotelItem = ['meta', [null, '0x1:0x2', null, null, 'Bangkok', null, null, null, null, null, null, null, null, '4 星级酒店']];
    expect(findEntityListCategory(thaiHotelItem)).toBe('4 星级酒店');

    const restaurantItem = ['meta', [null, '0x1:0x2', null, null, 'Tokyo', null, null, null, null, null, null, null, null, '日本料理店']];
    expect(findEntityListCategory(restaurantItem)).toBe('日本料理店');
  });
});

describe('extractFeatureIdFromUrl & normalizePhoneDisplay', () => {
  it('extracts the canonical feature id from place URLs', () => {
    expect(extractFeatureIdFromUrl('https://www.google.com/maps/place/X/!1s0x47e66e2964e34e2d:0xb9756db3a9643894!8m2')).toBe(
      '0x47e66e2964e34e2d:0xb9756db3a9643894',
    );
    expect(extractFeatureIdFromUrl('https://maps.google.com/?q=hotel')).toBeUndefined();
    expect(extractFeatureIdFromUrl(null)).toBeUndefined();
  });

  it('normalizes phone numbers to a displayable intl form', () => {
    expect(normalizePhoneDisplay('+66 2-123-4567')).toBe('+6621234567');
    expect(normalizePhoneDisplay('02-123-4567')).toBe('021234567');
    expect(normalizePhoneDisplay('tel:+66812345678')).toBe('+66812345678');
    expect(normalizePhoneDisplay('abc')).toBeUndefined();
    expect(normalizePhoneDisplay(null)).toBeUndefined();
  });

  it('rejects Google Travel generic search query headers in isFakePlaceLabel', () => {
    expect(isFakePlaceLabel('Google Travel 9 results')).toBe(true);
    expect(isFakePlaceLabel('Google Travel 9 处搜索结果')).toBe(true);
    expect(isFakePlaceLabel('Google Travel')).toBe(true);
    expect(isFakePlaceLabel('Google Hotels')).toBe(true);
    expect(isFakePlaceLabel('9 results')).toBe(true);
    expect(isFakePlaceLabel('9 处搜索结果')).toBe(true);
    expect(isFakePlaceLabel('Search results')).toBe(true);
    expect(isFakePlaceLabel('View prices')).toBe(true);
    expect(isFakePlaceLabel('Mayana Beach Resort')).toBe(false);
    expect(isFakePlaceLabel('Cross Pattaya Pratamnak')).toBe(false);
  });
});

describe('extractHotelPropertyFacts & deriveHotelSignals', () => {
  it('extracts hotel opening year and renovation year from Chinese description snippets', () => {
    const text1 = 'Cross Pattaya Pratamnak. 2024 年全新开业奢华度假酒店，2025 年重新装修，共 120 间客房。入住时间：15:00，退房时间：12:00';
    const facts1 = extractHotelPropertyFacts(text1);
    expect(facts1).toEqual({
      opened_year: '2024',
      renovated_year: '2025',
      room_count: 120,
      check_in: '15:00',
      check_out: '12:00',
    });

    const signals1 = deriveHotelSignals(facts1);
    expect(signals1).toContain('🆕 2024年开业 (新开业)');
    expect(signals1).toContain('✨ 2025年新装修');
  });

  it('extracts hotel opening year from English Booking.com / Google formats', () => {
    const text2 = 'Welcoming Booking.com guests since Dec 2019. Built in 2019. 85 rooms. Check-in from 14:00, check-out until 11:00.';
    const facts2 = extractHotelPropertyFacts(text2);
    expect(facts2).toEqual({
      opened_year: '2019',
      renovated_year: undefined,
      room_count: 85,
      check_in: '14:00',
      check_out: '11:00',
    });

    const signals2 = deriveHotelSignals(facts2);
    expect(signals2).toContain('📅 2019年开业');
  });

  it('extracts established / est date and renovation facts accurately', () => {
    const text3 = 'Historic luxury hotel. Established in 1998, fully renovated in 2023.';
    const facts3 = extractHotelPropertyFacts(text3);
    expect(facts3?.opened_year).toBe('1998');
    expect(facts3?.renovated_year).toBe('2023');

    const signals3 = deriveHotelSignals(facts3);
    expect(signals3).toContain('📅 1998年开业');
    expect(signals3).toContain('✨ 2023年新装修');
  });

  it('returns undefined when no property facts are present', () => {
    expect(extractHotelPropertyFacts('Great restaurant with authentic Pad Thai')).toBeUndefined();
    expect(extractHotelPropertyFacts('')).toBeUndefined();
    expect(extractHotelPropertyFacts(null)).toBeUndefined();
  });
});

describe('cleanTitleForSearch', () => {
  it('strips leading and trailing emojis and symbols cleanly', () => {
    expect(cleanTitleForSearch('🏨 Mayana Beach Resort')).toBe('Mayana Beach Resort');
    expect(cleanTitleForSearch('🍜 合成發 • 潮州魚蛋粉')).toBe('合成發 • 潮州魚蛋粉');
    expect(cleanTitleForSearch('📍 Cross Pattaya Pratamnak ⭐')).toBe('Cross Pattaya Pratamnak');
    expect(cleanTitleForSearch('  Oakwood Studios Bangkok  ')).toBe('Oakwood Studios Bangkok');
  });
});

describe('Agoda Adapter & Card Parser', () => {
  it('parses Agoda saved trip list card and normalizes to standard Google Maps format', () => {
    const cardEl = document.createElement('div');
    cardEl.setAttribute('data-selenium', 'saved-hotel-item');
    cardEl.setAttribute('data-hotel-id', '786529');
    cardEl.innerHTML = `
      <div class="TripItem__Header">
        <h3 data-selenium="hotel-name">
          <a href="https://www.agoda.com/zh-cn/cross-pattaya-pratamnak/hotel/pattaya-th.html?id=786529">
            Cross Pattaya Pratamnak
          </a>
        </h3>
      </div>
      <div class="TripItem__Details">
        <div data-selenium="review-score">8.8</div>
        <span data-selenium="review-count">1,240 篇评价</span>
        <span data-selenium="area-city-name">帕塔亚普拉塔纳克山, 芭堤雅</span>
        <span data-selenium="display-price">HK$ 680</span>
      </div>
    `;

    const place = parseAgodaCard(cardEl);
    expect(place).not.toBeNull();
    expect(place?.title).toBe('Cross Pattaya Pratamnak');
    expect(place?.sourceProvider).toBe('google_maps');
    expect(place?.kind).toBe('stay');
    expect(place?.category).toBe('Hotel');
    expect(place?.rating).toBe(4.4); // 8.8 / 2 = 4.4
    expect(place?.reviewCount).toBe(1240);
    expect(place?.address).toBe('帕塔亚普拉塔纳克山, 芭堤雅');
    expect(place?.priceLevel).toBe('HK$ 680');
    expect(place?.sourcePlaceId).toBe('786529');
    expect(place?.sourceUrl).toContain('Cross%20Pattaya%20Pratamnak');
  });

  it('extracts hotel URL from card with data-hotel-id or anchor link', () => {
    const cardWithLink = document.createElement('div');
    cardWithLink.innerHTML = `
      <a href="/zh-cn/arawana-regency-north-pattaya/hotel/pattaya-th.html?id=123456" data-selenium="hotel-name">
        Arawana Regency North Pattaya
      </a>
    `;
    expect(findAgodaHotelUrl(cardWithLink)).toBe('/zh-cn/arawana-regency-north-pattaya/hotel/pattaya-th.html?id=123456');

    const cardWithId = document.createElement('div');
    cardWithId.setAttribute('data-hotel-id', '998877');
    expect(findAgodaHotelUrl(cardWithId)).toBe('https://www.agoda.com/hotel/hotel.html?id=998877');
  });

  it('detects Agoda saved collection / trips page and extracts batch list', () => {
    const savedListHtml = `
      <div class="TripDetailHeader">
        <h1 data-selenium="trip-name">芭提雅度假精选 2026</h1>
      </div>
      <div class="TripDetailList">
        <div data-selenium="saved-hotel-item" data-hotel-id="101">
          <h3 data-selenium="hotel-name">Cross Pattaya Pratamnak</h3>
          <div data-selenium="review-score">9.0</div>
          <span data-selenium="review-count">2,300 篇评价</span>
          <span data-selenium="area-city-name">芭堤雅</span>
          <span data-selenium="display-price">THB 3,200</span>
        </div>
        <div data-selenium="trip-saved-card" data-hotel-id="102">
          <h3 data-selenium="hotel-name">Arawana Regency North Pattaya</h3>
          <div data-selenium="review-score">8.4</div>
          <span data-selenium="review-count">850 篇评价</span>
          <span data-selenium="area-city-name">北芭堤雅</span>
          <span data-selenium="display-price">THB 1,800</span>
        </div>
      </div>
    `;

    document.body.innerHTML = savedListHtml;

    Object.defineProperty(window, 'location', {
      value: new URL('https://www.agoda.com/trips/detail?navBack=true&id=78652960&tab=saved'),
      writable: true,
    });

    const savedList = detectAgodaSavedList();
    expect(savedList).not.toBeNull();
    expect(savedList?.listName).toContain('芭提雅度假精选 2026');
    expect(savedList?.places.length).toBe(2);
    expect(savedList?.places[0].title).toBe('Cross Pattaya Pratamnak');
    expect(savedList?.places[0].rating).toBe(4.5); // 9.0 / 2 = 4.5
    expect(savedList?.places[0].priceLevel).toBe('THB 3,200');
    expect(savedList?.places[1].title).toBe('Arawana Regency North Pattaya');
    expect(savedList?.places[1].rating).toBe(4.2); // 8.4 / 2 = 4.2
  });

  it('matches Agoda domain correctly in adapter', () => {
    const adapter = new AgodaAdapter();
    expect(adapter.matches('https://www.agoda.com/trips/detail?navBack=true&id=78652960&tab=saved')).toBe(true);
    expect(adapter.matches('https://www.agoda.com/zh-cn/hotel/pattaya-th.html')).toBe(true);
    expect(adapter.matches('https://www.google.com/travel/')).toBe(false);
  });
});