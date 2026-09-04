import { describe, expect, it } from 'vitest';
import {
  buildCollectionShareUrl,
  decodeCollectionSharePayload,
  encodeCollectionSharePayload,
  extractCollectionSharePayload,
  parseCollectionShareHash,
} from './collection-share-link';
import type { OwnlyCollectionExportV1 } from './capture';

function makeExport(overrides: Partial<OwnlyCollectionExportV1['collection']> = {}): OwnlyCollectionExportV1 {
  return {
    schema: 'ownly.capture.collection',
    version: 1,
    exported_at: '2026-09-01T00:00:00.000Z',
    collection: { id: 'col-1', title: 'Tokyo Food', place_count: 1, ...overrides },
    places: [{
      id: 'pl-1', collection_id: 'col-1', title: 'Tsukiji',
      source: { provider: 'google_maps', url: 'https://maps.google.com/?cid=tsukiji', place_id: 'ChIJ_tsukiji' },
      inferred_kind: 'food', captured_at: '2026-09-01T00:00:00.000Z',
    }],
  };
}

describe('Collection share link encoding/decoding', () => {
  it('round-trips a collection export through encode/decode', async () => {
    const bundle = makeExport();
    const encoded = await encodeCollectionSharePayload(bundle);
    const decoded = await decodeCollectionSharePayload(encoded);
    expect(decoded.schema).toBe('ownly.capture.collection');
    expect(decoded.collection.title).toBe('Tokyo Food');
    expect(decoded.places).toHaveLength(1);
    expect(decoded.places[0].title).toBe('Tsukiji');
  });

  it('works with compression disabled', async () => {
    const bundle = makeExport();
    const encoded = await encodeCollectionSharePayload(bundle, { compress: false });
    expect(encoded.startsWith('r.')).toBe(true);
    const decoded = await decodeCollectionSharePayload(encoded);
    expect(decoded.collection.title).toBe('Tokyo Food');
  });

  it('rejects empty payload', async () => {
    await expect(decodeCollectionSharePayload('')).rejects.toThrow('缺少数据');
  });

  it('rejects unknown prefix', async () => {
    await expect(decodeCollectionSharePayload('z.abc')).rejects.toThrow('不支持');
  });
});

describe('Collection share URL', () => {
  it('builds a URL with the share hash', async () => {
    const bundle = makeExport();
    const url = await buildCollectionShareUrl(bundle, 'https://example.com/ownly/app/#section=planner');
    expect(url).toContain('#ownly-collection=');
    expect(url).not.toContain('section=planner');
  });

  it('extracts payload from hash', () => {
    const hash = '#ownly-collection=r.test123';
    expect(extractCollectionSharePayload(hash)).toBe('r.test123');
  });

  it('returns null for non-collection hash', () => {
    expect(extractCollectionSharePayload('#section=planner')).toBeNull();
  });

  it('parses a valid share hash', async () => {
    const bundle = makeExport();
    const url = await buildCollectionShareUrl(bundle, 'https://example.com/app');
    const hash = url.split('#')[1];
    const parsed = await parseCollectionShareHash(`#${hash}`);
    expect(parsed).not.toBeNull();
    expect(parsed?.collection.title).toBe('Tokyo Food');
  });
});
