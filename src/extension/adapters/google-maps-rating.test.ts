import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SELECTORS } from '../selectors';

/**
 * Rating must prefer the atomic aria-label over textContent: when Google
 * rotates obfuscated classes, the text selector can match a container whose
 * text mixes the rating with review counts and neighboring fields.
 */

const SEL = SELECTORS as unknown as Record<string, string>;

function stubDocument(ratingText: string | null, ratingAria: string | null) {
  vi.stubGlobal('document', {
    querySelector: (selector: string) => {
      if (selector === SEL.rating) {
        return ratingText === null
          ? null
          : { textContent: ratingText, getAttribute: () => null };
      }
      if (selector === SEL.ratingAria) {
        return ratingAria === null
          ? null
          : { textContent: null, getAttribute: () => ratingAria };
      }
      if (selector === SEL.placeHeading) return { textContent: 'Test Place' };
      return null;
    },
    querySelectorAll: () => [],
    createElement: () => ({}) ,
    documentElement: { lang: 'zh-CN', textContent: '' },
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

describe('extractGoogleMapsPlace rating source priority', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the atomic aria-label over polluted container text', async () => {
    stubDocument('4.3 (1,234) · 観光客向けの人気スポット', '4.8');
    const { extractGoogleMapsPlace } = await import('./google-maps');
    expect(extractGoogleMapsPlace()?.rating).toBe(4.8);
  });

  it('falls back to textContent when no aria rating exists', async () => {
    stubDocument('4.3', null);
    const { extractGoogleMapsPlace } = await import('./google-maps');
    expect(extractGoogleMapsPlace()?.rating).toBe(4.3);
  });
});
