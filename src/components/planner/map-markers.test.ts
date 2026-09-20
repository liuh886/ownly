import { describe, expect, it } from 'vitest';
import { clusterMarkersByCoordinates, type ClusterableMarker } from './map-markers';

function marker(overrides: Partial<ClusterableMarker> = {}): ClusterableMarker {
  return {
    lat: 13.75,
    lng: 100.49,
    isScheduled: true,
    canonicalPlaceId: 'place-1',
    ...overrides,
  };
}

describe('clusterMarkersByCoordinates', () => {
  it('collapses the same place scheduled twice into one cluster', () => {
    const clusters = clusterMarkersByCoordinates([
      marker({ isScheduled: true }),
      marker({ isScheduled: true }),
    ]);
    expect(clusters.get(0)).toEqual([0, 1]);
    expect(clusters.get(1)).toEqual([0, 1]);
  });

  it('collapses a hotel reused across days at identical coordinates', () => {
    const clusters = clusterMarkersByCoordinates([
      marker({ isScheduled: true }),
      marker({ isScheduled: true }),
      marker({ isScheduled: true }),
    ]);
    expect(clusters.get(0)).toEqual([0, 1, 2]);
  });

  it('dissolves a scheduled stop + its own candidate twin so the number survives', () => {
    const clusters = clusterMarkersByCoordinates([
      marker({ isScheduled: true, canonicalPlaceId: 'same' }),
      marker({ isScheduled: false, canonicalPlaceId: 'same' }),
    ]);
    expect(clusters.size).toBe(0);
  });

  it('keeps distinct places at different coordinates unclustered', () => {
    const clusters = clusterMarkersByCoordinates([
      marker({ lat: 13.75, lng: 100.49 }),
      marker({ lat: 13.76, lng: 100.5 }),
    ]);
    expect(clusters.size).toBe(0);
  });

  it('still clusters two distinct stacked places at the same coordinates', () => {
    const clusters = clusterMarkersByCoordinates([
      marker({ canonicalPlaceId: 'a' }),
      marker({ canonicalPlaceId: 'b' }),
    ]);
    expect(clusters.get(0)).toEqual([0, 1]);
  });

  it('treats coordinate differences beyond the fifth decimal as separate', () => {
    const clusters = clusterMarkersByCoordinates([
      marker({ lat: 13.75 }),
      marker({ lat: 13.75001 }),
    ]);
    expect(clusters.size).toBe(0);
  });

  it('returns an empty map for a single marker', () => {
    expect(clusterMarkersByCoordinates([marker()]).size).toBe(0);
  });
});
