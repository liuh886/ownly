import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SELECTORS } from '../selectors';

/**
 * DOM-as-standard provenance: every captured field records which source
 * produced it so merge logic can refuse fallback overwrites. DOM hits tag
 * 'dom'; JSON-LD/app-state fallbacks tag their own source.
 */

const SEL = SELECTORS as unknown as Record<string, string>;

function stubDocument(options: {
  heading?: string | null;
  categoryText?: string | null;
  openStatusText?: string | null;
  jsonLd?: unknown;
  lang?: string;
}) {
  const scripts =
    options.jsonLd === undefined
      ? []
      : [{ textContent: JSON.stringify(options.jsonLd) }];
  vi.stubGlobal('document', {
    querySelector: (selector: string) => {
      if (selector === SEL.placeHeading) {
        return options.heading == null
          ? null
          : { textContent: options.heading, getAttribute: () => null };
      }
      if (selector === SEL.category) {
        return options.categoryText == null
          ? null
          : { textContent: options.categoryText, getAttribute: () => null };
      }
      if (selector === SEL.openStatus) {
        return options.openStatusText == null
          ? null
          : { textContent: options.openStatusText, getAttribute: () => null };
      }
      return null;
    },
    querySelectorAll: (selector: string) =>
      selector === 'script[type="application/ld+json"]' ? scripts : [],
    createElement: () => ({}),
    documentElement: { lang: options.lang ?? 'zh-CN', textContent: '' },
  });
  vi.stubGlobal('window', {
    location: {
      pathname: '/maps/place/TestPlace',
      hostname: 'www.google.com',
      href: 'https://www.google.com/maps/place/TestPlace',
      search: '',
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

describe('extractGoogleMapsPlace field provenance', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('tags DOM-sourced fields as dom', async () => {
    stubDocument({ heading: 'Test Place', categoryText: '餐厅' });
    const { extractGoogleMapsPlace } = await import('./google-maps');
    const place = extractGoogleMapsPlace();
    expect(place?.title).toBe('Test Place');
    expect(place?.category).toBe('餐厅');
    expect(place?.sourceDetail?.title).toBe('dom');
    expect(place?.sourceDetail?.category).toBe('dom');
  });

  it('tags the JSON-LD fallback and localizes its category', async () => {
    stubDocument({
      heading: 'Test Place',
      categoryText: null,
      jsonLd: { '@type': 'Restaurant', name: 'Test Place' },
    });
    const { extractGoogleMapsPlace } = await import('./google-maps');
    const place = extractGoogleMapsPlace();
    expect(place?.category).toBe('餐厅');
    expect(place?.sourceDetail?.category).toBe('jsonld');
  });

  it('decomposes a fused rating+category container instead of storing junk ("4.9(15)Grill" bug)', async () => {
    stubDocument({ heading: 'หม่าล่าสิบสองปันนา สาขา 2', categoryText: '4.9(15)Grill' });
    const { extractGoogleMapsPlace } = await import('./google-maps');
    const place = extractGoogleMapsPlace();
    expect(place?.category).toBe('Grill');
    expect(place?.rating).toBe(4.9);
    expect(place?.reviewCount).toBe(15);
    expect(place?.sourceDetail?.category).toBe('dom');
    expect(place?.sourceDetail?.rating).toBe('dom');
    expect(place?.sourceDetail?.reviewCount).toBe('dom');
  });

  it('rejects bare section headers as open status ("Hours" bug)', async () => {
    stubDocument({ heading: 'Test Place', categoryText: '餐厅', openStatusText: 'Hours' });
    const { extractGoogleMapsPlace } = await import('./google-maps');
    expect(extractGoogleMapsPlace()?.openStatus).toBeUndefined();
  });
});
