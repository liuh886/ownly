import { describe, expect, it, vi } from 'vitest';
import { SELECTORS } from '../selectors';

/**
 * Pinned-structure regression lock for the Google Maps detail extractor.
 * The stub document maps each core selector to a canned element, so this test
 * fails loudly if a SELECTORS string or an extractor is edited inconsistently.
 * It cannot detect real Google markup drift (nothing in CI can) — that is the
 * job of the runtime trackSelector cross-checks.
 */

type Attrs = Record<string, string | null>;

function el(text: string | null, attrs: Attrs = {}) {
  return {
    textContent: text,
    getAttribute: (key: string) => attrs[key] ?? null,
  };
}

function anyEl(): unknown {
  const target: Record<string, unknown> = { style: {}, dataset: {} };
  return new Proxy(target, {
    get: (t, p) => {
      if (p in t) return t[p as string];
      if (p === Symbol.toPrimitive) return () => '';
      return () => anyEl();
    },
    set: (t, p, v) => {
      t[p as string] = v;
      return true;
    },
  });
}

const SEL = SELECTORS as unknown as Record<string, string>;

const PLACE_URL = 'https://www.google.com/maps/place/%E9%BA%BA%E5%B1%8B%E3%81%AF%E3%81%AA%E3%81%B3+%E6%96%B0%E5%AE%BF%E5%BA%97';

const fixtures: Record<string, unknown> = {
  [SEL.placeHeading]: el('麺屋はなび 新宿店'),
  [SEL.rating]: el('4.3'),
  [SEL.reviewCount]: el(null, { 'aria-label': '1,234 reviews' }),
  [SEL.address]: el('東京都新宿区西新宿1-1-1'),
  [SEL.category]: el('ラーメン屋'),
  [SEL.priceBadge]: el('￥1000'),
};

const sendMessage = vi.fn().mockResolvedValue({});

vi.stubGlobal('document', {
  querySelector: (selector: string) => fixtures[selector] ?? null,
  querySelectorAll: () => [],
  createElement: () => anyEl(),
  head: anyEl(),
  body: { textContent: '' },
  title: '',
  documentElement: { textContent: '' },
});
vi.stubGlobal('window', {
  location: { pathname: '/maps/place/x', hostname: 'www.google.com', href: PLACE_URL, search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
});
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
});

describe('extractGoogleMapsPlace pinned structure', () => {
  it('extracts title, rating, reviews, address, category and price from known markup', async () => {
    const { extractGoogleMapsPlace } = await import('./google-maps');
    const place = extractGoogleMapsPlace(undefined, 'JPY');

    expect(place).not.toBeNull();
    expect(place?.title).toBe('麺屋はなび 新宿店');
    expect(place?.rating).toBe(4.3);
    expect(place?.reviewCount).toBe(1234);
    expect(place?.address).toBe('東京都新宿区西新宿1-1-1');
    expect(place?.category).toBe('ラーメン屋');
    expect(place?.priceLevel).toContain('1000');
    expect(place?.sourceProvider).toBe('google_maps');
  });

  it('reports no selector drift when every core query hits', async () => {
    sendMessage.mockClear();
    const { extractGoogleMapsPlace } = await import('./google-maps');
    extractGoogleMapsPlace(undefined, 'JPY');
    const driftCalls = sendMessage.mock.calls.filter(
      (args) => (args[0] as { type?: string })?.type === 'OWNLY_SELECTOR_DRIFT',
    );
    expect(driftCalls).toHaveLength(0);
  });
});
