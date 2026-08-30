import { describe, expect, it } from 'vitest';
import type { PlannerTripPlace } from './planner';
import { calculateRouteTravelMinutes, optimizeStopsByTravelTime, type PlannerTravelTimeMatrix } from './planner-route-time';

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: 'trip-1', title: id,
    source_provider: 'google_maps', source_url: `https://maps.example/${id}`, kind: 'attraction',
    tags: [], signals: [], risks: [], reservation_status: 'none', state: 'scheduled',
    scheduled_date: '2026-10-07', created_at: '2026-08-30T00:00:00Z', ...overrides,
  };
}

const matrix: PlannerTravelTimeMatrix = {
  a: { a: 0, b: 40, c: 10, d: 50 },
  b: { a: 40, b: 0, c: 10, d: 10 },
  c: { a: 10, b: 10, c: 0, d: 40 },
  d: { a: 50, b: 10, c: 40, d: 0 },
};

describe('travel-time route optimizer', () => {
  it('minimizes minutes while keeping the first stop fixed', () => {
    const result = optimizeStopsByTravelTime([place('a'), place('b'), place('c'), place('d')], matrix);
    expect(result).not.toBeNull();
    expect(result!.places.map((item) => item.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(result!.originalMinutes).toBe(90);
    expect(result!.optimizedMinutes).toBe(30);
    expect(result!.savedMinutes).toBe(60);
  });

  it('keeps locked and anchored slots fixed', () => {
    const result = optimizeStopsByTravelTime([
      place('a'),
      place('b', { locked: true }),
      place('c'),
      place('d', { is_anchor: true, anchor_type: 'reservation' }),
    ], matrix);
    expect(result).not.toBeNull();
    expect(result!.places[1].id).toBe('b');
    expect(result!.places[3].id).toBe('d');
  });

  it('refuses an incomplete current route instead of inventing travel time', () => {
    expect(calculateRouteTravelMinutes([place('a'), place('b')], { a: { b: null } })).toBeNull();
    expect(optimizeStopsByTravelTime([place('a'), place('b')], { a: { b: null } })).toBeNull();
  });
});
