import { describe, expect, it } from 'vitest';
import type { PlannerTravelMode, PlannerTrip, PlannerTripLeg } from './planner';
import type { PlannerScheduledPlace } from './planner-visits';
import {
  applyOrsDayTravelMatrix,
  buildHeuristicDayTravelMatrix,
  buildOrsSingleLeg,
  computeDayOrderOptimization,
  computeDayTravelRefresh,
  computeDayTravelRefreshByMode,
  materializeStopCoordinates,
  resolvePairEffectiveModes,
  resolveStopCoordinates,
  type OrsMatrixFacts,
  type OrsMatrixInput,
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

function leg(from: string, to: string, minutes: number, source: PlannerTripLeg['source'] = 'manual', mode: PlannerTripLeg['mode'] = 'driving'): PlannerTripLeg {
  return {
    schema_version: '0.1', type: 'trip_leg',
    id: `leg:trip-1:${from}:${to}`,
    trip_id: 'trip-1', from_place_id: from, to_place_id: to,
    mode, duration_minutes: minutes, distance_meters: minutes * 500,
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

const stops3 = () => [coordStop('a'), coordStop('b'), coordStop('c')];
// Full 3x3 matrix over the stop order; adjacent cells drive the refresh.
const matrix3 = (ab: number | null, bc: number | null): OrsMatrixFacts => ({
  durations_minutes: [
    [0, ab, null],
    [null, 0, bc],
    [null, null, 0],
  ],
  distances_meters: [
    [0, 1200, null],
    [null, 0, 1300],
    [null, null, 0],
  ],
});
const orsInput = (ab: number | null, bc: number | null) => ({ order: stops3(), facts: matrix3(ab, bc) });

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

  it('marks same-place visit pairs (morning checkout + evening stay) as unusable', () => {
    const hotelOut = coordStop('hotel-out', { place_id: 'hotel', title: 'Hotel Sunrise', is_anchor: true });
    const hotelStay = coordStop('hotel-stay', { place_id: 'hotel', title: 'Hotel Sunrise', is_anchor: true });
    const matrix = buildHeuristicDayTravelMatrix(trip, [hotelOut, coordStop('a'), hotelStay], []);
    expect(matrix.minutes['visit:hotel-out']?.['visit:hotel-stay']).toBeNull();
    expect(matrix.minutes['visit:hotel-stay']?.['visit:hotel-out']).toBeNull();
    expect(matrix.minutes['visit:hotel-out']?.['visit:a']).not.toBeNull();
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

  it('keeps locked and anchored stops pinned', () => {    const stops = [
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

  it('never orders two visits of the same place back to back, even when ORS reports ~0 minutes', () => {
    // Morning checkout and evening stay are two visits of the same hotel. ORS
    // would return ~0 for the identical coordinates; without the same-place
    // guard the optimizer used to suggest "hotel A → hotel A".
    const hotelOut = coordStop('hotel-out', { place_id: 'hotel', title: 'Hotel Sunrise', is_anchor: true });
    const hotelStay = coordStop('hotel-stay', { place_id: 'hotel', title: 'Hotel Sunrise', is_anchor: true });
    // Current order: hotel → b → a → hotel (65 min); valid optimum: hotel → a → b → hotel (45).
    const stops = [hotelOut, coordStop('b'), coordStop('a'), hotelStay];
    const ors: OrsMatrixFacts = {
      // Index order matches `stops`: hotel-out, b, a, hotel-stay.
      durations_minutes: [
        [0, 20, 20, 0],
        [20, 0, 25, 20],
        [20, 5, 0, 20],
        [0, 20, 20, 0],
      ],
      distances_meters: orsFakeDistances(4),
    };
    const computation = computeDayOrderOptimization(trip, stops, [], ors);
    expect(computation).not.toBeNull();
    const orderedPlaceIds = computation!.orderedPlaces.map((p) => p.place_id);
    expect(orderedPlaceIds).toEqual(['hotel', 'a', 'b', 'hotel']);
    for (let index = 0; index < computation!.orderedPlaces.length - 1; index += 1) {
      expect(computation!.orderedPlaces[index]!.place_id).not.toBe(computation!.orderedPlaces[index + 1]!.place_id);
    }
    for (const written of computation!.legsToWrite) {
      expect(written.from_place_id).not.toBe(written.to_place_id);
    }
    expect(computation!.legsToWrite.map((l) => l.id)).toEqual([
      'leg:trip-1:hotel:a',
      'leg:trip-1:a:b',
      'leg:trip-1:b:hotel',
    ]);
  });
});

describe('resolveStopCoordinates & materializeStopCoordinates', () => {
  it('resolves coordinates from the source URL when the persisted field is missing', () => {
    // Regression: the route optimizer read only the persisted field while the
    // map falls back to the URL, so the same place counted as located on the
    // map but missing for route estimation (e.g. Chiang Mai University).
    const urlOnly = stop('url-only', {
      coordinates: undefined,
      source_url: 'https://www.google.com/maps/place/Chiang+Mai+University/@18.8082241,98.9523053,17z/data=!4m2!3m1!1s0x0:0x0!3d18.8082363!4d98.9546953',
    });
    const resolved = resolveStopCoordinates([urlOnly]);
    // D/M scheme: the !3d/!4d pin beats the @ viewport center (the viewport
    // here is ~200m off the place; the pin matches the curated CMU record).
    expect(resolved[0]?.coords).toEqual({ lat: 18.8082363, lng: 98.9546953 });
  });

  it('prefers the persisted field over the URL and reports null when neither exists', () => {
    const fieldFirst = stop('field', {
      coordinates: { lat: 13.74, lng: 100.5 },
      source_url: 'https://www.google.com/maps/place/Somewhere/@18.8,98.95,17z',
    });
    const nowhere = stop('nowhere', { coordinates: undefined, source_url: 'https://maps.example/nowhere' });
    const resolved = resolveStopCoordinates([fieldFirst, nowhere]);
    expect(resolved[0]?.coords).toEqual({ lat: 13.74, lng: 100.5 });
    expect(resolved[1]?.coords).toBeNull();
  });

  it('materializes resolved coordinates without touching ids or already-located stops', () => {
    const urlOnly = stop('url-only', {
      coordinates: undefined,
      source_url: 'https://www.google.com/maps/place/X/@18.8,98.95,17z',
    });
    const withField = coordStop('a');
    const materialized = materializeStopCoordinates(resolveStopCoordinates([urlOnly, withField]));
    expect(materialized[0]?.coordinates).toEqual({ lat: 18.8, lng: 98.95 });
    expect(materialized[0]?.id).toBe(urlOnly.id);
    expect(materialized[1]).toBe(withField);
  });
});

describe('computeDayTravelRefresh', () => {
  // Full 3x3 matrix over the stop order; adjacent cells drive the refresh.

  it('writes ORS legs for adjacent pairs on the shared leg id scheme', () => {
    const stops = stops3();
    const result = computeDayTravelRefresh(trip, stops, [], orsInput(11, 12), 'driving');
    expect(result.ledger.updated).toBe(2);
    expect(result.legs.map((leg) => leg.id)).toEqual(['leg:trip-1:a:b', 'leg:trip-1:b:c']);
    expect(result.legs.every((leg) => leg.source === 'openrouteservice')).toBe(true);
    expect(result.legs[0]?.distance_meters).toBe(1200);
    expect(result.afterMinutes).toBe(23);
  });

  it('never overwrites manual legs and prefers stored durations for the before delta', () => {
    const stops = stops3();
    const manual = leg('a', 'b', 30, 'manual');
    const result = computeDayTravelRefresh(trip, stops, [manual], orsInput(11, 12), 'driving');
    expect(result.ledger.updated).toBe(1);
    expect(result.ledger.manualSkipped).toBe(1);
    expect(result.legs.map((leg) => leg.id)).toEqual(['leg:trip-1:b:c']);
    // b→c has no stored leg: before falls back to the distance heuristic (>0).
    expect(result.beforeMinutes).toBeGreaterThan(0);
    expect(result.afterMinutes).toBe(12);
  });

  it('counts everything as kept estimates when no ORS data is available', () => {
    const result = computeDayTravelRefresh(trip, stops3(), [], null, 'driving');
    expect(result.legs).toEqual([]);
    expect(result.ledger.keptEstimate).toBe(2);
    expect(result.ledger.updated).toBe(0);
  });

  it('skips pairs without coordinates', () => {
    const stops = [coordStop('a'), stop('no-coords', { coordinates: undefined }), coordStop('c')];
    const result = computeDayTravelRefresh(trip, stops, [], null, 'driving');
    expect(result.ledger.missingCoordsSkipped).toBe(2);
    expect(result.ledger.updated).toBe(0);
  });

  it('skips same-place visit pairs even when the matrix offers a cell', () => {
    const checkout = coordStop('a', { visit_id: 'visit:a-checkout', id: 'visit:a-checkout', place_id: 'a' });
    const checkin = coordStop('a', { visit_id: 'visit:a-checkin', id: 'visit:a-checkin', place_id: 'a' });
    const pair = [checkout, checkin];
    const ors = {
      order: pair,
      facts: { durations_minutes: [[0, 5], [5, 0]], distances_meters: [[0, 100], [100, 0]] },
    };
    const result = computeDayTravelRefresh(trip, pair, [], ors, 'driving');
    expect(result.ledger.samePlaceSkipped).toBe(1);
    expect(result.ledger.updated).toBe(0);
    expect(result.legs).toEqual([]);
  });

  it('skips pairs the matrix cannot route', () => {
    const result = computeDayTravelRefresh(trip, stops3(), [], orsInput(11, null), 'driving');
    expect(result.ledger.updated).toBe(1);
    expect(result.ledger.unroutableSkipped).toBe(1);
  });
});

describe('computeDayTravelRefreshByMode', () => {
  const byMode = (
    stops: PlannerScheduledPlace[],
    existing: PlannerTripLeg[],
    entries: Array<[PlannerTravelMode, OrsMatrixInput]>,
    defaultMode: PlannerTravelMode = 'driving',
  ) => computeDayTravelRefreshByMode(trip, stops, existing, new Map(entries), defaultMode);

  it('refreshes each pair with its own effective mode matrix', () => {
    const stops = stops3();
    const walking = leg('a', 'b', 30, 'heuristic', 'walking');
    const walkingOrs: OrsMatrixInput = { order: stops, facts: matrix3(21, 22) };
    const result = byMode(stops, [walking], [['driving', orsInput(11, 12)], ['walking', walkingOrs]]);
    expect(result.ledger.updated).toBe(2);
    // a→b keeps its stored walking mode instead of being homogenized into driving.
    expect(result.legs[0]).toMatchObject({ mode: 'walking', duration_minutes: 21, source: 'openrouteservice' });
    expect(result.legs[1]).toMatchObject({ mode: 'driving', duration_minutes: 12 });
  });

  it('keeps estimates for pairs whose mode has no fresh matrix', () => {
    const stops = stops3();
    const walking = leg('a', 'b', 30, 'heuristic', 'walking');
    const result = byMode(stops, [walking], [['driving', orsInput(11, 12)]]);
    expect(result.ledger.updated).toBe(1);
    expect(result.ledger.keptEstimate).toBe(1);
    expect(result.legs.map((item) => item.id)).toEqual(['leg:trip-1:b:c']);
  });

  it('keeps transit pairs on estimates even when other modes refresh', () => {
    const stops = stops3();
    const transit = leg('a', 'b', 40, 'heuristic', 'transit');
    const result = byMode(stops, [transit], [['driving', orsInput(11, 12)]]);
    expect(result.ledger.updated).toBe(1);
    expect(result.ledger.keptEstimate).toBe(1);
    expect(result.legs.map((item) => item.id)).toEqual(['leg:trip-1:b:c']);
  });

  it('matches the single-mode wrapper when only the trip mode has data', () => {
    const stops = stops3();
    const now = new Date('2026-09-09T12:00:00Z');
    const viaWrapper = computeDayTravelRefresh(trip, stops, [], orsInput(11, 12), 'driving', now);
    const viaByMode = computeDayTravelRefreshByMode(trip, stops, [], new Map([['driving', orsInput(11, 12)]]), 'driving', now);
    expect(viaByMode).toEqual(viaWrapper);
  });
});

describe('resolvePairEffectiveModes', () => {
  it('prefers stored leg modes and falls back to the trip default', () => {
    const modes = resolvePairEffectiveModes('trip-1', stops3(), [leg('a', 'b', 30, 'heuristic', 'walking')], 'driving');
    expect(modes.get('a→b')).toEqual({ mode: 'walking', manual: false });
    expect(modes.get('b→c')).toEqual({ mode: 'driving', manual: false });
  });

  it('flags manual legs so callers can exclude them from pre-scans', () => {
    const modes = resolvePairEffectiveModes('trip-1', stops3(), [leg('a', 'b', 30, 'manual')], 'driving');
    expect(modes.get('a→b')).toEqual({ mode: 'driving', manual: true });
  });
});

describe('buildOrsSingleLeg', () => {
  it('builds an openrouteservice leg on the same id scheme as the heuristic builder', () => {
    const leg = buildOrsSingleLeg(trip, 'a', 'b', 'driving', { duration_minutes: 23, distance_meters: 8450 });
    expect(leg.id).toBe('leg:trip-1:a:b');
    expect(leg.trip_id).toBe('trip-1');
    expect(leg.mode).toBe('driving');
    expect(leg.duration_minutes).toBe(23);
    expect(leg.distance_meters).toBe(8450);
    expect(leg.source).toBe('openrouteservice');
    expect(leg.created_at).toBe(leg.updated_at);
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
