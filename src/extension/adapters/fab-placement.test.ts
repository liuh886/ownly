import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SELECTORS } from '../selectors';
import { hasGoogleMapsPlaceDetail } from './google-maps';
import { isXiaohongshuNotePage } from './xiaohongshu';

/**
 * FAB placement precision: buttons appear only where a capture can succeed,
 * and stale buttons from SPA navigation are removable. These pin the gates;
 * the DOM-mutation cleanup itself is exercised by inspection.
 */

const SEL = SELECTORS as unknown as Record<string, string>;

function stubMapsDocument(options: { heading?: string | null; facts?: boolean }) {
  vi.stubGlobal('document', {
    querySelector: (selector: string) => {
      if (
        selector === SEL.placeHeading ||
        selector === 'main h1' ||
        selector === 'h1'
      ) {
        return options.heading == null ? null : { textContent: options.heading };
      }
      if (
        selector === SEL.address ||
        selector === SEL.rating ||
        selector === SEL.category ||
        selector === SEL.phone ||
        selector === SEL.website
      ) {
        return options.facts ? { textContent: 'fact' } : null;
      }
      return null;
    },
    querySelectorAll: () => [],
  });
  vi.stubGlobal('window', {
    location: {
      pathname: '/maps/place/Test',
      hostname: 'www.google.com',
      href: 'https://www.google.com/maps/place/Test',
      search: '',
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

describe('hasGoogleMapsPlaceDetail', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes with a heading and at least one fact', () => {
    stubMapsDocument({ heading: 'Grand Palace', facts: true });
    expect(hasGoogleMapsPlaceDetail()).toBe(true);
  });

  it('fails without facts (directions panes, list views)', () => {
    stubMapsDocument({ heading: 'Directions', facts: false });
    expect(hasGoogleMapsPlaceDetail()).toBe(false);
  });

  it('fails without a heading', () => {
    stubMapsDocument({ heading: null, facts: true });
    expect(hasGoogleMapsPlaceDetail()).toBe(false);
  });
});

describe('isDedicatedGoogleMapsPlacePage', () => {
  it('identifies place pages by feature id, not by full URL (D-step identity)', async () => {
    const { isDedicatedGoogleMapsPlacePage } = await import('./google-maps');
    // Same place, different SPA URL states mid-load — all dedicated.
    expect(
      isDedicatedGoogleMapsPlacePage(
        'https://www.google.com/maps/place/abc/@18.790648,98.9531665,15z/data=!4m14!1m7!3m6!1s0x30da3bb2c4fe6299:0xb0cfed329b0c1809!8m2!3d18.7905113!4d98.9560481!16s%2Fg%2F11p0h57p13?entry=ttu',
      ),
    ).toBe(true);
    expect(
      isDedicatedGoogleMapsPlacePage(
        'https://www.google.com/maps/place/abc/@18.790648,98.9531665,15z/data=!4m7!3m6!1s0x30da3bb2c4fe6299:0xb0cfed329b0c1809!4b1!8m2!3d18.7905113!4d98.9560481!16s%2Fg%2F11p0h57p13?entry=ttu',
      ),
    ).toBe(true);
    expect(isDedicatedGoogleMapsPlacePage('https://www.google.com/maps/search/noodles/@18.79,98.95,14z')).toBe(false);
    expect(isDedicatedGoogleMapsPlacePage('https://www.google.com/maps')).toBe(false);
  });
});

describe('isXiaohongshuNotePage', () => {
  it('accepts note-detail URLs only', () => {
    expect(isXiaohongshuNotePage('https://www.xiaohongshu.com/explore/abc123XYZ')).toBe(true);
    expect(
      isXiaohongshuNotePage('https://www.xiaohongshu.com/discovery/item/def456'),
    ).toBe(true);
    expect(isXiaohongshuNotePage('https://www.xiaohongshu.com/explore')).toBe(false);
    expect(isXiaohongshuNotePage('https://www.xiaohongshu.com/user/profile/xyz')).toBe(false);
    expect(isXiaohongshuNotePage('https://www.xiaohongshu.com/search_result?keyword=拉面')).toBe(
      false,
    );
  });
});
