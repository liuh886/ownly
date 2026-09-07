import {
  calculateDefaultTripLeg,
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
  legsToWrite: PlannerTripLeg[];
}

function pairKey(fromPlaceId: string, toPlaceId: string): string {
  return `${fromPlaceId}→${toPlaceId}`;
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
