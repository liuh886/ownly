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
});
