import { describe, expect, it } from 'vitest';
import { createCollectionShareLink, getCollectionShareTokenFromUrl, parseCollectionShareToken } from './collection-share';
import type { OwnlyCollectionExportV1 } from './capture';

function fakeExport(): OwnlyCollectionExportV1 {
  return {
    schema: 'ownly.capture.collection',
    version: 1,
    exported_at: '2026-01-01T00:00:00.000Z',
    collection: { id: 'col-1', title: 'Bangkok', place_count: 1 },
    places: [{
      id: 'place-1',
      collection_id: 'col-1',
      title: 'BKK Airport',
      source: { provider: 'google_maps', url: 'https://maps.example.com/1', place_id: 'ChIJ123' },
      captured_at: '2026-01-01T00:00:00.000Z',
    }],
  };
}

describe('collection-share', () => {
  it('round-trips export via token', () => {
    const exp = fakeExport();
    const { token, url, truncated } = createCollectionShareLink(exp, 'https://ownly.app');
    expect(truncated).toBe(false);
    expect(url).toContain('/#/c/');
    expect(getCollectionShareTokenFromUrl(url)).toBe(token);
    const parsed = parseCollectionShareToken(token);
    expect(parsed?.collection.title).toBe('Bangkok');
    expect(parsed?.places[0].title).toBe('BKK Airport');
  });

  it('parses token from /c/ path', () => {
    const { token } = createCollectionShareLink(fakeExport(), 'https://ownly.app');
    const url = `https://ownly.app/c/${token}`;
    expect(getCollectionShareTokenFromUrl(url)).toBe(token);
  });

  it('returns null for invalid token', () => {
    expect(parseCollectionShareToken('not-base64!!!')).toBeNull();
    expect(parseCollectionShareToken('YWJj')).toBeNull(); // valid base64 but not collection JSON
  });
});
