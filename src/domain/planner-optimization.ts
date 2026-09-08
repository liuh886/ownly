import {
  calculateDefaultTripLeg,
  extractPlaceCoordinates,
  plannerTripLegId,
  type PlannerTravelMode,
  type PlannerTrip,
  type PlannerTripLeg,
} from './planner';
import type { PlannerScheduledPlace } from './planner-visits';
import { optimizeStopsByTravelTime, type PlannerTravelTimeMatrix } from './planner-route-time';

export type PlannerMatrixCellSource = 'manual' | 'openrouteservice' | 'heuristic';
export type PlannerDayMatrixSource = 'openrouteservice' | 'heuristic';

export interface PlannerDayTravelMatrix {
  minutes: PlannerTravelTimeMatrix;
  distances: Record<string, Record<string, number | undefined> | undefined>;
  sources: Record<string, Record<string, PlannerMatrixCellSource> | undefined>;
}

export interface OrsMatrixFacts {
  durations_minutes: Array<Array<number | null>>;
  distances_meters: Array<Array<number | null>>;
}

export interface PlannerDayOptimizationComputation {
  date: string;
  originalPlaces: PlannerScheduledPlace[];
  orderedPlaces: PlannerScheduledPlace[];
  originalMinutes: number;
  optimizedMinutes: number;
  savedMinutes: number;
  matrixSource: PlannerDayMatrixSource;
  /** Why the matrix fell back to heuristic estimates despite an ORS-capable trip mode. */
  orsFallback?: 'missing_key' | 'request_failed';
  legsToWrite: PlannerTripLeg[];
}

function pairKey(fromPlaceId: string, toPlaceId: string): string {
  return `${fromPlaceId}→${toPlaceId}`;
}

/** Two distinct visits of the same place (morning checkout + evening stay): no travel between them. */
function isSamePlacePair(from: PlannerScheduledPlace, to: PlannerScheduledPlace): boolean {
  return from.id !== to.id && (from.place_id || from.id) === (to.place_id || to.id);
}

export interface OrsSingleLegResult {
  duration_minutes: number;
  distance_meters: number;
}

/**
 * Builds a persisted leg from a single ORS directions result. Same id scheme
 * as the heuristic builder so re-running either path overwrites the same leg.
 */
export function buildOrsSingleLeg(
  trip: PlannerTrip,
  fromPlaceId: string,
  toPlaceId: string,
  mode: PlannerTravelMode,
  result: OrsSingleLegResult,
  now = new Date(),
): PlannerTripLeg {
  const timestamp = now.toISOString();
  return {
    schema_version: '0.1',
    type: 'trip_leg',
    id: plannerTripLegId(trip.id, fromPlaceId, toPlaceId),
    trip_id: trip.id,
    from_place_id: fromPlaceId,
    to_place_id: toPlaceId,
    mode,
    duration_minutes: result.duration_minutes,
    distance_meters: result.distance_meters,
    source: 'openrouteservice',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export interface ResolvedOptimizationStop {
  place: PlannerScheduledPlace;
  coords: { lat: number; lng: number } | null;
}

/** ORS matrix facts plus the stop order its rows/columns follow. */
export interface OrsMatrixInput {
  order: PlannerScheduledPlace[];
  facts: OrsMatrixFacts;
}

export interface DayTravelRefreshLedger {
  updated: number;
  manualSkipped: number;
  keptEstimate: number;
  missingCoordsSkipped: number;
  samePlaceSkipped: number;
  unroutableSkipped: number;
}

export interface DayTravelRefreshResult {
  legs: PlannerTripLeg[];
  ledger: DayTravelRefreshLedger;
  beforeMinutes: number;
  afterMinutes: number;
}

function emptyTravelRefreshLedger(): DayTravelRefreshLedger {
  return {
    updated: 0,
    manualSkipped: 0,
    keptEstimate: 0,
    missingCoordsSkipped: 0,
    samePlaceSkipped: 0,
    unroutableSkipped: 0,
  };
}

function hasFiniteCoords(place: PlannerScheduledPlace): boolean {
  const coords = place.coordinates;
  return !!coords
    && typeof coords.lat === 'number' && typeof coords.lng === 'number'
    && Number.isFinite(coords.lat) && Number.isFinite(coords.lng);
}

/**
 * Decides per adjacent pair what a travel-time refresh would do, without any
 * I/O. `ors: null` means no fresh road-network data for this day (transit
 * mode, missing key, failed request — the caller owns that distinction);
 * refreshable pairs are then counted as kept estimates.
 * Same-place pairs and manual legs are never touched, mirroring the matrix
 * builders' invariants.
 */
export function computeDayTravelRefresh(
  trip: PlannerTrip,
  stops: PlannerScheduledPlace[],
  existingLegs: PlannerTripLeg[],
  ors: OrsMatrixInput | null,
  mode: PlannerTravelMode,
  now = new Date(),
): DayTravelRefreshResult {
  const ledger = emptyTravelRefreshLedger();
  const legs: PlannerTripLeg[] = [];
  let beforeMinutes = 0;
  let afterMinutes = 0;
  const existingByPair = new Map(
    existingLegs
      .filter((leg) => leg.trip_id === trip.id)
      .map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const),
  );
  const orderIndex = new Map((ors?.order ?? []).map((place, index) => [place.id, index]));
  for (let index = 0; index + 1 < stops.length; index += 1) {
    const from = stops[index];
    const to = stops[index + 1];
    const fromPlaceId = from.place_id || from.id;
    const toPlaceId = to.place_id || to.id;
    if (!fromPlaceId || !toPlaceId) continue;
    if (isSamePlacePair(from, to)) {
      ledger.samePlaceSkipped += 1;
      continue;
    }
    const existing = existingByPair.get(`${fromPlaceId}→${toPlaceId}`);
    if (existing?.source === 'manual') {
      ledger.manualSkipped += 1;
      continue;
    }
    if (!hasFiniteCoords(from) || !hasFiniteCoords(to)) {
      ledger.missingCoordsSkipped += 1;
      continue;
    }
    if (!ors) {
      ledger.keptEstimate += 1;
      continue;
    }
    const row = orderIndex.get(from.id);
    const col = orderIndex.get(to.id);
    const cell = row !== undefined && col !== undefined
      ? ors.facts.durations_minutes[row]?.[col]
      : null;
    if (typeof cell !== 'number') {
      ledger.unroutableSkipped += 1;
      continue;
    }
    const distance = ors.facts.distances_meters[row!]?.[col!] ?? 0;
    const before = existing && existing.duration_minutes > 0
      ? existing.duration_minutes
      : (calculateDefaultTripLeg(trip, from, to, mode, now)?.duration_minutes ?? 0);
    legs.push(buildOrsSingleLeg(trip, fromPlaceId, toPlaceId, mode, {
      duration_minutes: cell,
      distance_meters: distance,
    }, now));
    ledger.updated += 1;
    beforeMinutes += before;
    afterMinutes += cell;
  }
  return { legs, ledger, beforeMinutes, afterMinutes };
}

/**
 * Resolves each stop's coordinates with the same field-first, URL-fallback
 * rule the map uses. Callers gate on `coords === null` and materialize
 * `coordinates` for the matrix builders, which only read the persisted field.
 */
export function resolveStopCoordinates(places: PlannerScheduledPlace[]): ResolvedOptimizationStop[] {
  return places.map((place) => ({ place, coords: extractPlaceCoordinates(place) }));
}

/**
 * Copies stops with resolved coordinates materialized into the persisted
 * field so heuristic/ORS matrix code sees them. Ids are untouched, so the
 * resulting computation still maps back to the original visits.
 */
export function materializeStopCoordinates(resolved: ResolvedOptimizationStop[]): PlannerScheduledPlace[] {
  return resolved.map(({ place, coords }) => (coords && !place.coordinates ? { ...place, coordinates: coords } : place));
}

export function buildHeuristicDayTravelMatrix(
  trip: PlannerTrip,
  places: PlannerScheduledPlace[],
  existingLegs: PlannerTripLeg[],
  now = new Date(),
): PlannerDayTravelMatrix {
  const mode: PlannerTravelMode = trip.transport_mode ?? 'transit';
  const existingByPair = new Map(
    existingLegs
      .filter((leg) => leg.trip_id === trip.id && (leg.source === 'manual' || leg.source === 'openrouteservice'))
      .map((leg) => [pairKey(leg.from_place_id, leg.to_place_id), leg] as const),
  );
  const minutes: PlannerTravelTimeMatrix = {};
  const distances: PlannerDayTravelMatrix['distances'] = {};
  const sources: PlannerDayTravelMatrix['sources'] = {};
  for (const from of places) {
    minutes[from.id] = {};
    distances[from.id] = {};
    sources[from.id] = {};
    for (const to of places) {
      if (from.id === to.id) {
        minutes[from.id]![to.id] = 0;
        distances[from.id]![to.id] = 0;
        sources[from.id]![to.id] = 'heuristic';
        continue;
      }
      if (isSamePlacePair(from, to)) {
        // Null, not 0: a 0-cost cell would lure the optimizer into ordering
        // the two visits back to back ("hotel A → hotel A"), which is not a
        // real transit. Null makes any such ordering score Infinity.
        minutes[from.id]![to.id] = null;
        distances[from.id]![to.id] = undefined;
        sources[from.id]![to.id] = 'heuristic';
        continue;
      }
      const existing = existingByPair.get(pairKey(from.place_id || from.id, to.place_id || to.id));
      if (existing) {
        minutes[from.id]![to.id] = existing.duration_minutes;
        distances[from.id]![to.id] = existing.distance_meters;
        sources[from.id]![to.id] = existing.source === 'manual' ? 'manual' : 'openrouteservice';
        continue;
      }
      const leg = calculateDefaultTripLeg(trip, from, to, mode, now);
      if (leg) {
        minutes[from.id]![to.id] = leg.duration_minutes;
        distances[from.id]![to.id] = leg.distance_meters;
      } else {
        minutes[from.id]![to.id] = null;
        distances[from.id]![to.id] = undefined;
      }
      sources[from.id]![to.id] = 'heuristic';
    }
  }
  return { minutes, distances, sources };
}

export function applyOrsDayTravelMatrix(
  base: PlannerDayTravelMatrix,
  ors: OrsMatrixFacts,
  places: PlannerScheduledPlace[],
): PlannerDayTravelMatrix {
  const minutes: PlannerTravelTimeMatrix = {};
  const distances: PlannerDayTravelMatrix['distances'] = {};
  const sources: PlannerDayTravelMatrix['sources'] = {};
  places.forEach((from, fromIndex) => {
    minutes[from.id] = {};
    distances[from.id] = {};
    sources[from.id] = {};
    places.forEach((to, toIndex) => {
      if (isSamePlacePair(from, to)) {
        // Same-place pairs stay null: neither manual legs nor ORS (which would
        // return ~0 for identical coordinates) may turn them into valid moves.
        minutes[from.id]![to.id] = null;
        distances[from.id]![to.id] = undefined;
        sources[from.id]![to.id] = 'heuristic';
        return;
      }
      const baseSource = base.sources[from.id]?.[to.id] ?? 'heuristic';
      if (baseSource === 'manual') {
        minutes[from.id]![to.id] = base.minutes[from.id]?.[to.id] ?? null;
        distances[from.id]![to.id] = base.distances[from.id]?.[to.id];
        sources[from.id]![to.id] = 'manual';
        return;
      }
      const orsMinutes = ors.durations_minutes[fromIndex]?.[toIndex];
      if (typeof orsMinutes === 'number') {
        minutes[from.id]![to.id] = orsMinutes;
        const orsDistance = ors.distances_meters[fromIndex]?.[toIndex];
        distances[from.id]![to.id] = orsDistance === null ? undefined : orsDistance;
        sources[from.id]![to.id] = 'openrouteservice';
      } else {
        minutes[from.id]![to.id] = base.minutes[from.id]?.[to.id] ?? null;
        distances[from.id]![to.id] = base.distances[from.id]?.[to.id];
        sources[from.id]![to.id] = baseSource;
      }
    });
  });
  return { minutes, distances, sources };
}

export function computeDayOrderOptimization(
  trip: PlannerTrip,
  places: PlannerScheduledPlace[],
  existingLegs: PlannerTripLeg[],
  ors: OrsMatrixFacts | null,
  now = new Date(),
): PlannerDayOptimizationComputation | null {
  if (places.length < 3) return null;
  let matrix = buildHeuristicDayTravelMatrix(trip, places, existingLegs, now);
  let matrixSource: PlannerDayMatrixSource = 'heuristic';
  if (ors) {
    matrix = applyOrsDayTravelMatrix(matrix, ors, places);
    matrixSource = 'openrouteservice';
  }
  const result = optimizeStopsByTravelTime(places, matrix.minutes, { fixStart: true, respectLocked: true });
  if (!result || !result.improved) return null;

  const existingByPair = new Map(
    existingLegs
      .filter((leg) => leg.trip_id === trip.id)
      .map((leg) => [pairKey(leg.from_place_id, leg.to_place_id), leg] as const),
  );
  const timestamp = now.toISOString();
  const mode: PlannerTravelMode = trip.transport_mode ?? 'transit';
  const legsToWrite: PlannerTripLeg[] = [];
  for (let index = 0; index < result.places.length - 1; index += 1) {
    const from = result.places[index];
    const to = result.places[index + 1];
    const fromPlaceId = from.place_id || from.id;
    const toPlaceId = to.place_id || to.id;
    if (fromPlaceId === toPlaceId) continue;
    const existing = existingByPair.get(pairKey(fromPlaceId, toPlaceId));
    if (existing?.source === 'manual') continue;
    const duration = matrix.minutes[from.id]?.[to.id];
    if (typeof duration !== 'number') continue;
    const source = matrix.sources[from.id]?.[to.id] === 'openrouteservice' ? 'openrouteservice' : 'heuristic';
    legsToWrite.push({
      schema_version: '0.1',
      type: 'trip_leg',
      id: plannerTripLegId(trip.id, fromPlaceId, toPlaceId),
      trip_id: trip.id,
      from_place_id: fromPlaceId,
      to_place_id: toPlaceId,
      mode: existing?.mode ?? mode,
      duration_minutes: duration,
      distance_meters: matrix.distances[from.id]?.[to.id],
      source,
      observed_at: timestamp,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    });
  }
  return {
    date: places[0]?.scheduled_date ?? '',
    originalPlaces: places,
    orderedPlaces: result.places,
    originalMinutes: result.originalMinutes,
    optimizedMinutes: result.optimizedMinutes,
    savedMinutes: result.savedMinutes,
    matrixSource,
    legsToWrite,
  };
}
