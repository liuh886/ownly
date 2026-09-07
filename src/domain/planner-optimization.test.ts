import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripLeg } from './planner';
import type { PlannerScheduledPlace } from './planner-visits';
import {
  applyOrsDayTravelMatrix,
  buildHeuristicDayTravelMatrix,
  computeDayOrderOptimization,
  type OrsMatrixFacts,
} from './planner-optimization';

const trip: PlannerTrip = {
  schema_version: '0.1',
  type: 'trip',
  id: 'trip-1',
  title: 'Test Trip',
  status: 'planning',
  start_date: '2026-10-01',
  end_date: '2026-10-03',
  destinations: ['Bangkok'],
  transport_mode: 'driving',
  created_at: '2026-09-01T00:00:00Z',
};

function stop(placeId: string, overrides: Partial<PlannerScheduledPlace> = {}): PlannerScheduledPlace {
  const visitId = `visit:${placeId}`;
  return {
    schema_version: '0.1', type: 'trip_place', id: visitId, visit_id: visitId, place_id: placeId,
    trip_id: 'trip-1', title: placeId.toUpperCase(), source_provider: 'google_maps', source_url: `https://maps.example/${placeId}`,
    kind: 'attraction', tags: [], signals: [], risks: [], reservation_status: 'none', state: 'scheduled',
    scheduled_date: '2026-10-01', sort_order: 0, locked: false, is_anchor: false,
    created_at: '2026-08-30T00:00:00Z',
    coordinates: { lat: 13.74, lng: 100.5 },
    ...overrides,
  };
}

function leg(from: string, to: string, minutes: number, source: PlannerTripLeg['source'] = 'manual'): PlannerTripLeg {
  return {
    schema_version: '0.1', type: 'trip_leg',
    id: `leg:trip-1:${from}:${to}`,
    trip_id: 'trip-1', from_place_id: from, to_place_id: to,
    mode: 'driving', duration_minutes: minutes, distance_meters: minutes * 500,
    source, created_at: '2026-09-01T00:00:00Z',
  };
}

const COORDS: Record<string, { lat: number; lng: number }> = {
  a: { lat: 13.7400, lng: 100.5000 },
  b: { lat: 13.7500, lng: 100.5100 },
  c: { lat: 13.7600, lng: 100.5200 },
  d: { lat: 13.7700, lng: 100.5300 },
};

function coordStop(placeId: string, overrides: Partial<PlannerScheduledPlace> = {}): PlannerScheduledPlace {
  return stop(placeId, { coordinates: COORDS[placeId], ...overrides });
}

describe('buildHeuristicDayTravelMatrix', () => {
  it('fills heuristic durations for every pair and reuses existing manual and openrouteservice legs', () => {
    const stops = [coordStop('a'), coordStop('b'), coordStop('c')];
    const matrix = buildHeuristicDayTravelMatrix(
      trip,
      stops,
      [leg('a', 'b', 25, 'manual'), leg('b', 'c', 17, 'openrouteservice')],
    );

    expect(matrix.minutes['visit:a']?.['visit:b']).toBe(25);
    expect(matrix.sources['visit:a']?.['visit:b']).toBe('manual');
    expect(matrix.minutes['visit:b']?.['visit:c']).toBe(17);
    expect(matrix.sources['visit:b']?.['visit:c']).toBe('openrouteservice');
    expect(matrix.sources['visit:c']?.['visit:a']).toBe('heuristic');
    expect(typeof matrix.minutes['visit:c']?.['visit:a']).toBe('number');
    expect(matrix.minutes['visit:a']?.['visit:a']).toBe(0);
  });

  it('uses fixed fallback durations when coordinates are missing, and null only for transit-hub pairs', () => {
    const stops = [coordStop('a'), stop('no-coords', { coordinates: undefined }), coordStop('c')];
    const matrix = buildHeuristicDayTravelMatrix(trip, stops, []);
    expect(matrix.minutes['visit:a']?.['visit:no-coords']).toBe(15);
    expect(matrix.sources['visit:a']?.['visit:no-coords']).toBe('heuristic');

    const hubA = coordStop('a', { kind: 'transit', title: 'Don Mueang Airport' });
    const hubC = coordStop('c', { kind: 'transit', title: 'Suvarnabhumi Airport' });
    const hubMatrix = buildHeuristicDayTravelMatrix(trip, [hubA, hubC], []);
    expect(hubMatrix.minutes['visit:a']?.['visit:c']).toBeNull();
  });
});

describe('applyOrsDayTravelMatrix', () => {
  const ors: OrsMatrixFacts = {
    durations_minutes: [
      [0, 11, null],
      [10, 0, 12],
      [null, 13, 0],
    ],
    distances_meters: [
      [0, 1200, null],
      [1100, 0, 1300],
      [null, 1400, 0],
    ],
  };

  it('overrides non-manual cells with ORS values and preserves manual legs, keeping base on ORS nulls', () => {
    const stops = [coordStop('a'), coordStop('b'), coordStop('c')];
    const base = buildHeuristicDayTravelMatrix(trip, stops, [leg('a', 'b', 25, 'manual')]);
    const baseAC = base.minutes['visit:a']?.['visit:c'];
    expect(typeof baseAC).toBe('number');
    const merged = applyOrsDayTravelMatrix(base, ors, stops);

    expect(merged.minutes['visit:a']?.['visit:b']).toBe(25);
    expect(merged.sources['visit:a']?.['visit:b']).toBe('manual');
    expect(merged.minutes['visit:a']?.['visit:c']).toBe(baseAC);
    expect(merged.sources['visit:a']?.['visit:c']).toBe('heuristic');
    expect(merged.minutes['visit:b']?.['visit:c']).toBe(12);
    expect(merged.distances['visit:b']?.['visit:c']).toBe(1300);
    expect(merged.sources['visit:b']?.['visit:c']).toBe('openrouteservice');
    expect(merged.minutes['visit:c']?.['visit:a']).toBe(base.minutes['visit:c']?.['visit:a']);
  });
});

describe('computeDayOrderOptimization', () => {
  it('reorders stops by ORS minutes, writes ORS legs, and skips manual adjacent legs', () => {
    const stops = [coordStop('a'), coordStop('b'), coordStop('c'), coordStop('d')];
    const ors: OrsMatrixFacts = {
      durations_minutes: [
        [0, 40, 10, 50],
        [40, 0, 10, 10],
        [10, 10, 0, 40],
        [50, 10, 40, 0],
      ],
      distances_meters: orsFakeDistances(4),
    };
    const computation = computeDayOrderOptimization(trip, stops, [leg('c', 'b', 5, 'manual')], ors);
    expect(computation).not.toBeNull();
    expect(computation!.matrixSource).toBe('openrouteservice');
    expect(computation!.orderedPlaces.map((p) => p.place_id)).toEqual(['a', 'c', 'b', 'd']);
    expect(computation!.savedMinutes).toBe(65);
    expect(computation!.legsToWrite.map((l) => l.id)).toEqual([
      'leg:trip-1:a:c',
      'leg:trip-1:b:d',
    ]);
    expect(computation!.legsToWrite[0]!.source).toBe('openrouteservice');
  });

  it('falls back to heuristic source when no ORS facts are provided', () => {
    const heuristicStops: Record<string, { lat: number; lng: number }> = {
      a: { lat: 13.7400, lng: 100.5000 },
      b: { lat: 13.8000, lng: 100.6000 },
      c: { lat: 13.7450, lng: 100.5050 },
      d: { lat: 13.8050, lng: 100.6050 },
    };
    const stops = ['a', 'b', 'c', 'd'].map((id) => stop(id, { coordinates: heuristicStops[id] }));
    const computation = computeDayOrderOptimization(trip, stops, [], null);
    expect(computation).not.toBeNull();
    expect(computation!.matrixSource).toBe('heuristic');
    expect(computation!.orderedPlaces.map((p) => p.place_id)).toEqual(['a', 'c', 'b', 'd']);
    for (const written of computation!.legsToWrite) {
      expect(written.source).toBe('heuristic');
    }
  });

  it('returns null when the route is already optimal or the matrix is incomplete', () => {
    const stops = [coordStop('a'), coordStop('b'), coordStop('c'), coordStop('d')];
    const ors: OrsMatrixFacts = {
      durations_minutes: [
        [0, 10, 40, 50],
        [10, 0, 10, 40],
        [40, 10, 0, 10],
        [50, 40, 10, 0],
      ],
      distances_meters: orsFakeDistances(4),
    };
    expect(computeDayOrderOptimization(trip, stops, [], ors)).toBeNull();

    const withMissingCoords = [coordStop('a'), stop('no-coords'), coordStop('c'), coordStop('d')];
    expect(computeDayOrderOptimization(trip, withMissingCoords, [], null)).toBeNull();

    expect(computeDayOrderOptimization(trip, stops.slice(0, 2), [], null)).toBeNull();
  });

  it('keeps locked and anchored stops pinned', () => {
    const stops = [
      coordStop('a'),
      coordStop('b', { locked: true }),
      coordStop('c'),
      coordStop('e'),
      coordStop('d', { is_anchor: true, anchor_type: 'reservation' }),
    ];
    const ors: OrsMatrixFacts = {
      durations_minutes: [
        [0, 10, 40, 30, 50],
        [10, 0, 30, 10, 40],
        [40, 30, 0, 30, 10],
        [50, 10, 10, 0, 10],
        [50, 40, 10, 10, 0],
      ],
      distances_meters: orsFakeDistances(5),
    };
    const computation = computeDayOrderOptimization(trip, stops, [], ors);
    expect(computation).not.toBeNull();
    expect(computation!.orderedPlaces.map((p) => p.place_id)).toEqual(['a', 'b', 'e', 'c', 'd']);
  });
});

function orsFakeDistances(size: number): Array<Array<number | null>> {
  const rows: Array<Array<number | null>> = [];
  for (let i = 0; i < size; i += 1) {
    const row: Array<number | null> = [];
    for (let j = 0; j < size; j += 1) row.push(i === j ? 0 : 500 + i * 10 + j);
    rows.push(row);
  }
  return rows;
}
