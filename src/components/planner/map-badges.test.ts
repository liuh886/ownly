import { describe, expect, it } from 'vitest';
import { plannerTripLegId, type PlannerTripLeg } from '@/domain/planner';
import { buildSegmentBadges, type BadgeMarker, type BadgePoint } from './map-badges';

const TRIP = 'trip-1';

function leg(from: string, to: string, overrides: Partial<PlannerTripLeg> = {}): PlannerTripLeg {
  return {
    schema_version: '0.1',
    type: 'trip_leg',
    id: plannerTripLegId(TRIP, from, to),
    trip_id: TRIP,
    from_place_id: from,
    to_place_id: to,
    mode: 'driving',
    duration_minutes: 12,
    distance_meters: 3000,
    source: 'openrouteservice',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function points(): BadgePoint[] {
  return [
    { placeId: 'a', x: 0, y: 0 },
    { placeId: 'b', x: 100, y: 0 },
    { placeId: 'c', x: 100, y: 100 },
  ];
}

function legMap(...legs: PlannerTripLeg[]): Map<string, PlannerTripLeg> {
  return new Map(legs.map((item) => [item.id, item]));
}

const FAR: BadgeMarker[] = [{ x: 1000, y: 1000, radius: 16 }];

describe('buildSegmentBadges', () => {
  it('renders one pill per consecutive pair keyed by leg id', () => {
    const badges = buildSegmentBadges(points(), legMap(leg('a', 'b'), leg('b', 'c')), TRIP, FAR, { zh: true });
    expect(badges.map((b) => b.key)).toEqual([plannerTripLegId(TRIP, 'a', 'b'), plannerTripLegId(TRIP, 'b', 'c')]);
    expect(badges[0]).toMatchObject({ x: 50, y: 0, text: '12 分' });
    expect(badges[1]).toMatchObject({ x: 100, y: 50, text: '12 分' });
  });

  it('marks non-ORS transit legs as estimates', () => {
    const badges = buildSegmentBadges(
      points().slice(0, 2),
      legMap(leg('a', 'b', { source: 'heuristic', mode: 'transit' })),
      TRIP,
      FAR,
      { zh: true },
    );
    expect(badges[0]?.text).toBe('12 分 估');
  });

  it('leaves heuristic driving legs unmarked', () => {
    const badges = buildSegmentBadges(
      points().slice(0, 2),
      legMap(leg('a', 'b', { source: 'heuristic', mode: 'driving' })),
      TRIP,
      FAR,
      { zh: false },
    );
    expect(badges[0]?.text).toBe('12 min');
  });

  it('skips missing legs and non-positive durations instead of fabricating numbers', () => {
    const badges = buildSegmentBadges(
      points(),
      legMap(leg('a', 'b'), leg('b', 'c', { duration_minutes: 0, source: 'manual' })),
      TRIP,
      FAR,
      { zh: true },
    );
    expect(badges.map((b) => b.key)).toEqual([plannerTripLegId(TRIP, 'a', 'b')]);
  });

  it('skips pills overlapping any marker', () => {
    const near: BadgeMarker[] = [{ x: 50, y: 0, radius: 16 }];
    const badges = buildSegmentBadges(points().slice(0, 2), legMap(leg('a', 'b')), TRIP, near, { zh: true });
    expect(badges).toEqual([]);
  });
});
