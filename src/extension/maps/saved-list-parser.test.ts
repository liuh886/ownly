import { describe, expect, it } from 'vitest';
import {
  buildFromEntityList,
  createSnapshot,
  interpretDomBatch,
  interpretRawDomCard,
  type RawDomCard,
} from './saved-list-parser';

function card(overrides: Partial<RawDomCard> = {}): RawDomCard {
  return { rawTitle: '大皇宫', href: 'https://www.google.com/maps/place/Grand+Palace/@13.7500,100.4913,17z', infoTexts: [], ...overrides };
}

describe('interpretRawDomCard', () => {
  it('builds a Google Maps candidate with coordinates', () => {
    const { candidate, failedReason } = interpretRawDomCard(card({ ratingText: '4.7', infoTexts: ['4.7', '景点'] }));
    expect(failedReason).toBeUndefined();
    expect(candidate?.title).toBe('大皇宫');
    expect(candidate?.sourceProvider).toBe('google_maps');
    expect(candidate?.coordinates).toEqual({ lat: 13.75, lng: 100.4913 });
  });

  it('rejects navigation junk, fake labels, and empty titles', () => {
    expect(interpretRawDomCard(card({ rawTitle: 'Directions' })).failedReason).toBeTruthy();
    expect(interpretRawDomCard(card({ rawTitle: 'A' })).failedReason).toBe('fake label');
    expect(interpretRawDomCard(card({ rawTitle: '   ' })).failedReason).toBe('no title');
  });
});

describe('interpretDomBatch', () => {
  it('dedupes identical cards and reports coverage', () => {
    const result = interpretDomBatch([
      card(),
      card({ rawTitle: '大皇宫 duplicate' }),
      card({ rawTitle: 'Directions', href: 'https://www.google.com/maps' }),
    ]);
    expect(result.rawCount).toBe(3);
    expect(result.places).toHaveLength(1);
    expect(result.coverage.url).toBe(1);
    expect(result.failed.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildFromEntityList', () => {
  const input = (rawItems: unknown[]) => ({
    listName: 'Bangkok',
    listUrl: 'https://www.google.com/maps/@13.75,100.49,12z',
    rawItems,
    origin: 'https://www.google.com',
  });

  it('extracts a valid entity item', () => {
    const item = [null, [null, null, '大皇宫'], '大皇宫', '值得一去'];
    const result = buildFromEntityList(input([item]));
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('大皇宫');
    expect(result.places[0].userNote).toBe('值得一去');
    expect(result.coverage.title).toBe(1);
  });

  it('records failures for invalid shapes and missing titles', () => {
    const result = buildFromEntityList(input(['not-an-array', [null, null, ''], [null, null, 'Directions']]));
    expect(result.places).toHaveLength(0);
    const reasons = result.failed.map((entry) => entry.reason);
    expect(reasons).toContain('invalid item shape');
    expect(reasons).toContain('no title');
    expect(reasons).toContain('junk/fake');
  });
});

describe('createSnapshot', () => {
  it('summarizes a parse result', () => {
    const snapshot = createSnapshot({
      url: 'https://www.google.com/maps',
      parser: 'entitylist',
      durationMs: 42,
      result: {
        places: [{ title: 'A', url: 'u' }, { title: 'B', url: 'u2' }],
        coverage: { title: 2, url: 2, id: 0 },
        rawCount: 5,
        failed: [{ reason: 'no title' }],
      },
    });
    expect(snapshot).toMatchObject({
      parser: 'entitylist',
      found: 5,
      success: 2,
      coverage: { title: 2, url: 2, id: 0 },
      durationMs: 42,
    });
    expect(snapshot.failed).toEqual([{ reason: 'no title' }]);
  });
});
