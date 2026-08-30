import { describe, expect, it } from 'vitest';
import {
  parseRatingNumber,
  parseReviewCount,
  parseSubtitleInfo,
  extractEntityListResearch,
} from './place-parser';
import { extractGoogleMapsResearchFromHtml, featureIdToCid, googleMapsDetailUrlFromSourceId } from './google-maps-research';

describe('PLACE_PARSER.parseRating', () => {
  it('parses various standard and localized rating formats', () => {
    expect(parseRatingNumber('4.8')).toBe(4.8);
    expect(parseRatingNumber('4,8')).toBe(4.8);
    expect(parseRatingNumber('★ 4.5')).toBe(4.5);
    expect(parseRatingNumber('4.6 / 5')).toBe(4.6);
    expect(parseRatingNumber('Rating: 4.2')).toBe(4.2);
    expect(parseRatingNumber('5.0')).toBe(5.0);
    expect(parseRatingNumber('3')).toBe(3.0);
  });

  it('rejects invalid or out of range ratings', () => {
    expect(parseRatingNumber('0.5')).toBeUndefined();
    expect(parseRatingNumber('6.2')).toBeUndefined();
    expect(parseRatingNumber('abc')).toBeUndefined();
    expect(parseRatingNumber('1,234')).toBeUndefined();
    expect(parseRatingNumber('4-star hotel')).toBeUndefined();
    expect(parseRatingNumber('')).toBeUndefined();
    expect(parseRatingNumber(null)).toBeUndefined();
  });
});

describe('PLACE_PARSER.parseReviewCount', () => {
  it('parses review counts across multiple languages and suffixes', () => {
    expect(parseReviewCount('(1,234)')).toBe(1234);
    expect(parseReviewCount('1,234 reviews')).toBe(1234);
    expect(parseReviewCount('580 条评价')).toBe(580);
    expect(parseReviewCount('3,400件の口コミ')).toBe(3400);
    expect(parseReviewCount('1.2K reviews')).toBe(1200);
    expect(parseReviewCount('1.5万 条评论')).toBe(15000);
  });

  it('rejects invalid review count formats and arbitrary numbers', () => {
    expect(parseReviewCount('no reviews')).toBeUndefined();
    expect(parseReviewCount('Open 24 hours')).toBeUndefined();
    expect(parseReviewCount('123 Sukhumvit Rd')).toBeUndefined();
    expect(parseReviewCount('100 km away')).toBeUndefined();
    expect(parseReviewCount('')).toBeUndefined();
    expect(parseReviewCount(null)).toBeUndefined();
  });
});

describe('PLACE_PARSER.parseSubtitleInfo', () => {
  it('decomposes complex hotel info string accurately in one pass', () => {
    const info = '4.5(1,234) · 4-star hotel · $$ · Open 24 hours · Charoen Nakhon Rd';
    const result = parseSubtitleInfo(info);
    expect(result.rating).toBe(4.5);
    expect(result.reviewCount).toBe(1234);
    expect(result.category).toBe('4-star hotel');
    expect(result.priceLevel).toBe('$$');
    expect(result.openStatus).toBe('Open 24 hours');
    expect(result.area).toBe('Charoen Nakhon Rd');
  });

  it('decomposes Chinese cafe subtitle info', () => {
    const info = '4.8 ★ (890) · 咖啡厅 · 人均 ฿150–300 · 营业中 · 曼谷市中心';
    const result = parseSubtitleInfo(info);
    expect(result.rating).toBe(4.8);
    expect(result.reviewCount).toBe(890);
    expect(result.category).toBe('咖啡厅');
    expect(result.priceLevel).toBe('人均 ฿150–300');
    expect(result.openStatus).toBe('营业中');
    expect(result.area).toBe('曼谷市中心');
  });

  it('decomposes Japanese restaurant subtitle info with Katakana middle dot', () => {
    const info = '4.7(2,100)・日本料理店・￥3,000〜￥4,000・浅草';
    const result = parseSubtitleInfo(info);
    expect(result.rating).toBe(4.7);
    expect(result.reviewCount).toBe(2100);
    expect(result.category).toBe('日本料理店');
    expect(result.priceLevel).toBe('￥3,000〜￥4,000');
    expect(result.area).toBe('浅草');
  });

  it('handles attraction with missing price and review count', () => {
    const info = 'Tourist attraction · Open 24 hours · Bangkok';
    const result = parseSubtitleInfo(info);
    expect(result.category).toBe('Tourist attraction');
    expect(result.openStatus).toBe('Open 24 hours');
    expect(result.area).toBe('Bangkok');
  });

  it('decomposes Thipsamai Padthai Pratoopee multi-line and composite price formats', () => {
    const info1 = '4.2\n(12,567)·฿200–400\nNoodle shop';
    const result1 = parseSubtitleInfo(info1);
    expect(result1.rating).toBe(4.2);
    expect(result1.reviewCount).toBe(12567);
    expect(result1.priceLevel).toBe('฿200–400');
    expect(result1.category).toBe('Noodle shop');

    const info2 = '(12,567)·฿200–400';
    const result2 = parseSubtitleInfo(info2);
    expect(result2.reviewCount).toBe(12567);
    expect(result2.priceLevel).toBe('฿200–400');

    const info3 = '4.2 (12,567) · ฿200–400 · Noodle shop';
    const result3 = parseSubtitleInfo(info3);
    expect(result3.rating).toBe(4.2);
    expect(result3.reviewCount).toBe(12567);
    expect(result3.priceLevel).toBe('฿200–400');
    expect(result3.category).toBe('Noodle shop');
  });

  it('decomposes Raan Jay Fai with plus pricing and seafood category', () => {
    const info = '4.3 (3,800) · ฿1,000+ · Seafood restaurant';
    const result = parseSubtitleInfo(info);
    expect(result.rating).toBe(4.3);
    expect(result.reviewCount).toBe(3800);
    expect(result.priceLevel).toBe('฿1,000+');
    expect(result.category).toBe('Seafood restaurant');
  });

  it('decomposes Oakwood Studios 5-star hotel format correctly without misidentifying price', () => {
    const info = '4.4\n(996)·5-star hotel';
    const result = parseSubtitleInfo(info);
    expect(result.rating).toBe(4.4);
    expect(result.reviewCount).toBe(996);
    expect(result.category).toBe('5-star hotel');
    expect(result.priceLevel).toBeUndefined();
  });
});


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
