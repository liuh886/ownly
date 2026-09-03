import { describe, expect, it } from 'vitest';
import {
  hashCoordinates,
  normalizePlaceTitle,
  normalizeSourceUrl,
  getWeakPlaceIdentityEvidence,
  PlaceIdentityService,
} from './place-identity';

describe('P1 PlaceIdentityService', () => {
  it('canonical URL strips tracking params and sorts query', () => {
    const a = normalizeSourceUrl('https://www.Google.com/maps/place/abc?utm_source=share&cid=123&gclid=xyz');
    const b = normalizeSourceUrl('https://www.google.com/maps/place/abc?cid=123');
    expect(a).toBe(b);
    expect(a).toContain('cid=123');
    expect(a).not.toContain('utm_source');
    expect(a).not.toContain('gclid');
  });

  it('coordinate hash rounds to 5 decimals', () => {
    expect(hashCoordinates({ lat: 13.756330, lng: 100.501764 })).toBe('coord:13.75633,100.50176');
    expect(hashCoordinates({ lat: 13.756331, lng: 100.501765 })).toBe('coord:13.75633,100.50177');
    expect(hashCoordinates(null)).toBeNull();
    expect(hashCoordinates({ lat: 999, lng: 0 })).toBeNull();
  });

  it('normalized title collapses whitespace and strips punctuation', () => {
    expect(normalizePlaceTitle('  Suvarnabhumi Airport!! ')).toBe('suvarnabhumi airport');
    expect(normalizePlaceTitle('BKK Airport')).toBe('bkk airport');
    expect(normalizePlaceTitle('a')).toBeNull();
  });

  it('weak evidence includes canonical_url / coord_hash / normalized_name', () => {
    const ev = getWeakPlaceIdentityEvidence({
      source_url: 'https://www.google.com/maps/place/x?cid=1',
      coordinates: { lat: 13.7, lng: 100.5 },
      title: 'BKK Airport',
    });
    const kinds = ev.map((e) => e.kind);
    expect(kinds).toContain('canonical_url');
    expect(kinds).toContain('coord_hash');
    expect(kinds).toContain('normalized_name');
  });

  it('PlaceIdentityService.getAllKeys merges strong + weak', () => {
    const keys = PlaceIdentityService.getAllKeys({
      source_provider: 'google_maps',
      source_place_id: 'ChIJA11111111111',
      title: 'Test',
    });
    expect(keys.some((k) => k.includes('source_place_id'))).toBe(true);
    expect(keys.some((k) => k.includes('weak:'))).toBe(true);
  });

  it('isAutoMergeCandidate only on strong identity', () => {
    const a = { source_provider: 'google_maps', source_place_id: 'ChIJA111', title: 'Same Name', coordinates: { lat: 13.7, lng: 100.5 } };
    const b = { source_provider: 'google_maps', source_place_id: 'ChIJB222', title: 'Same Name', coordinates: { lat: 13.7, lng: 100.5 } };
    expect(PlaceIdentityService.isAutoMergeCandidate(a, b)).toBe(false); // different strong IDs
    const c = { source_provider: 'google_maps', source_place_id: 'ChIJA111' };
    expect(PlaceIdentityService.isAutoMergeCandidate(a, c)).toBe(true);
  });
});
