import { describe, expect, it } from 'vitest';
import type { PlannerScheduledPlace } from './planner-visits';
import { calculateRouteTravelMinutes, optimizeStopsByTravelTime, type PlannerTravelTimeMatrix } from './planner-route-time';

function stop(placeId: string, overrides: Partial<PlannerScheduledPlace> = {}): PlannerScheduledPlace {
  const visitId = `visit:${placeId}`;
  return {
    schema_version: '0.1', type: 'trip_place', id: visitId, visit_id: visitId, place_id: placeId,
    trip_id: 'trip-1', title: placeId, source_provider: 'google_maps', source_url: `https://maps.example/${placeId}`,
    kind: 'attraction', tags: [], signals: [], risks: [], reservation_status: 'none', state: 'scheduled',
    scheduled_date: '2026-10-07', sort_order: 0, locked: false, is_anchor: false,
    created_at: '2026-08-30T00:00:00Z', ...overrides,
  };
}

const matrix: PlannerTravelTimeMatrix = {
  'visit:a': { 'visit:a': 0, 'visit:b': 40, 'visit:c': 10, 'visit:d': 50 },
  'visit:b': { 'visit:a': 40, 'visit:b': 0, 'visit:c': 10, 'visit:d': 10 },
  'visit:c': { 'visit:a': 10, 'visit:b': 10, 'visit:c': 0, 'visit:d': 40 },
  'visit:d': { 'visit:a': 50, 'visit:b': 10, 'visit:c': 40, 'visit:d': 0 },
};

describe('travel-time route optimizer', () => {
  it('minimizes minutes while keeping the first visit fixed', () => {
    const result = optimizeStopsByTravelTime([stop('a'), stop('b'), stop('c'), stop('d')], matrix);
    expect(result).not.toBeNull();
    expect(result!.places.map((item) => item.place_id)).toEqual(['a', 'c', 'b', 'd']);
    expect(result!.originalMinutes).toBe(90);
    expect(result!.optimizedMinutes).toBe(30);
    expect(result!.savedMinutes).toBe(60);
  });

  it('keeps locked and anchored visit slots fixed', () => {
    const result = optimizeStopsByTravelTime([
      stop('a', { sort_order: 0 }),
      stop('b', { sort_order: 1, locked: true }),
      stop('c', { sort_order: 2 }),
      stop('d', { sort_order: 3, is_anchor: true, anchor_type: 'reservation' }),
    ], matrix);
    expect(result).not.toBeNull();
    expect(result!.places[1].place_id).toBe('b');
    expect(result!.places[3].place_id).toBe('d');
  });

  it('refuses an incomplete current route instead of inventing travel time', () => {
    const a = stop('a');
    const b = stop('b');
    const missing = { [a.id]: { [b.id]: null } };
    expect(calculateRouteTravelMinutes([a, b], missing)).toBeNull();
    expect(optimizeStopsByTravelTime([a, b], missing)).toBeNull();
  });
});
