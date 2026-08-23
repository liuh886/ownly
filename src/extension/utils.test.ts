import { describe, expect, it } from 'vitest';
import { cleanExtractedText, findEntityListPlaceId, isJunkNavigationText, parseEntityListCoordinates, safeDecodeUri } from './utils';

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

describe('findEntityListPlaceId', () => {
  it('extracts a Google internal feature id from item payload', () => {
    const item = ['meta', [null, '0x3ba58a39c41ff829:0x715f5a08d2ca8f6f'], 'Sensoji', 'note'];
    expect(findEntityListPlaceId(item)).toBe('0x3ba58a39c41ff829:0x715f5a08d2ca8f6f');
  });

  it('returns undefined when no feature id exists or input is invalid', () => {
    expect(findEntityListPlaceId(undefined)).toBeUndefined();
    expect(findEntityListPlaceId(['plain', ['nested', 'values']])).toBeUndefined();
    expect(findEntityListPlaceId(['0x123'])).toBeUndefined();
  });
});
