import { listPlannerLegs, listPlannerPlaces, listPlannerTrips, listPlannerVisits } from '../cli/planner-storage';
import {
  plannerTripLegId,
  type PlannerTravelMode,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
} from '../../src/domain/planner';
import { materializePlannerScheduledPlaces, sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripVisit } from '../../src/domain/planner-visits';
import { OwnlyMcpError } from './ownly-tools';
import { optimizeStopsByTravelTime, type PlannerTravelTimeMatrix } from '../../src/domain/planner-route-time';

const ORS_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/directions';
const ORS_MATRIX_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/matrix';

export function openRouteServiceProfile(mode: PlannerTravelMode): string | null {
  if (mode === 'driving') return 'driving-car';
  if (mode === 'walking') return 'foot-walking';
  if (mode === 'bicycling') return 'cycling-regular';
  return null;
}

export async function fetchOpenRouteServiceLeg(
  apiKey: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: PlannerTravelMode,
): Promise<{ duration_minutes: number; distance_meters: number }> {
  const profile = openRouteServiceProfile(mode);
  if (!profile) throw new OwnlyMcpError('OpenRouteService does not provide public-transit routing; record this leg manually.', 'INVALID_INPUT');
  if (!apiKey.trim()) throw new OwnlyMcpError('OPENROUTESERVICE_API_KEY is required to refresh travel legs.', 'INVALID_INPUT');

  const response = await fetch(`${ORS_BASE_URL}/${profile}`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
  });
  if (!response.ok) {
    throw new OwnlyMcpError(`OpenRouteService request failed (${response.status}).`, 'IO_ERROR');
  }
  const payload = await response.json() as { routes?: Array<{ summary?: { duration?: number; distance?: number } }> };
  const summary = payload.routes?.[0]?.summary;
  if (!summary || !Number.isFinite(summary.duration) || !Number.isFinite(summary.distance)) {
    throw new OwnlyMcpError('OpenRouteService returned no usable route summary.', 'DATA_INVALID');
  }
  return {
    duration_minutes: Math.max(1, Math.ceil(Number(summary.duration) / 60)),
    distance_meters: Math.max(0, Math.round(Number(summary.distance))),
  };
}

export interface PlannerDayTravelRefresh {
  trip: PlannerTrip;
  date: string;
  legs: PlannerTripLeg[];
  skipped_manual: string[];
  missing_coordinates: string[];
}

export async function buildOpenRouteServiceDayLegs(
  dataLocation: string,
  tripId: string,
  date: string,
  apiKey: string,
  now = new Date(),
): Promise<PlannerDayTravelRefresh> {
  const tripEntry = listPlannerTrips(dataLocation).find((item) => item.frontmatter.id === tripId);
  if (!tripEntry) throw new OwnlyMcpError(`Planner trip was not found: ${tripId}`, 'NOT_FOUND');
  const trip = tripEntry.frontmatter as unknown as PlannerTrip;
  const mode = trip.transport_mode ?? 'transit';
  if (!openRouteServiceProfile(mode)) {
    throw new OwnlyMcpError('This trip uses transit mode. Record transit legs manually; OpenRouteService refresh supports walking, driving and bicycling only.', 'INVALID_INPUT');
  }

  const placeFacts = listPlannerPlaces(dataLocation)
    .map((item) => item.frontmatter as PlannerTripPlace)
    .filter((place) => place.trip_id === tripId && place.state !== 'dropped');
  const visits = listPlannerVisits(dataLocation)
    .map((item) => item.frontmatter as PlannerTripVisit)
    .filter((visit) => visit.trip_id === tripId && visit.date === date);
  const places = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(placeFacts, visits));
  if (places.length < 2) throw new OwnlyMcpError('At least two scheduled visits are required to refresh travel legs.', 'INVALID_INPUT');

  const existing = listPlannerLegs(dataLocation).map((item) => item.frontmatter as PlannerTripLeg);
  const existingByPair = new Map<string, PlannerTripLeg>(existing.filter((leg) => leg.trip_id === tripId).map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));
  const legs: PlannerTripLeg[] = [];
  const skippedManual: string[] = [];
  const missingCoordinates: string[] = [];
  const timestamp = now.toISOString();

  for (let index = 0; index < places.length - 1; index += 1) {
    const from = places[index];
    const to = places[index + 1];
    const pair = `${from.place_id}→${to.place_id}`;
    const current = existingByPair.get(pair);
    if (current?.source === 'manual') {
      skippedManual.push(pair);
      continue;
    }
    if (!from.coordinates || !to.coordinates) {
      missingCoordinates.push(pair);
      continue;
    }
    const route = await fetchOpenRouteServiceLeg(apiKey, from.coordinates, to.coordinates, mode);
    legs.push({
      schema_version: '0.1',
      type: 'trip_leg',
      id: plannerTripLegId(tripId, from.place_id, to.place_id),
      trip_id: tripId,
      from_place_id: from.place_id,
      to_place_id: to.place_id,
      mode,
      duration_minutes: route.duration_minutes,
      distance_meters: route.distance_meters,
      source: 'openrouteservice',
      observed_at: timestamp,
      created_at: current?.created_at ?? timestamp,
      updated_at: timestamp,
    });
  }

  if (legs.length === 0) {
    throw new OwnlyMcpError('No adjacent travel leg can be refreshed: every pair is manual or missing coordinates.', 'INVALID_INPUT');
  }
  return { trip, date, legs, skipped_manual: skippedManual, missing_coordinates: missingCoordinates };
}

export interface OpenRouteServiceMatrixResult {
  durations_minutes: Array<Array<number | null>>;
  distances_meters: Array<Array<number | null>>;
}

export async function fetchOpenRouteServiceMatrix(
  apiKey: string,
  places: Array<{ coordinates: { lat: number; lng: number } }>,
  mode: PlannerTravelMode,
): Promise<OpenRouteServiceMatrixResult> {
  const profile = openRouteServiceProfile(mode);
  if (!profile) throw new OwnlyMcpError('OpenRouteService does not provide public-transit routing; travel-time optimization requires walking, driving or bicycling.', 'INVALID_INPUT');
  if (!apiKey.trim()) throw new OwnlyMcpError('OPENROUTESERVICE_API_KEY is required for travel-time optimization.', 'INVALID_INPUT');
  const response = await fetch(`${ORS_MATRIX_BASE_URL}/${profile}`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      locations: places.map((place) => [place.coordinates.lng, place.coordinates.lat]),
      metrics: ['duration', 'distance'],
    }),
  });
  if (!response.ok) throw new OwnlyMcpError(`OpenRouteService matrix request failed (${response.status}).`, 'IO_ERROR');
  const payload = await response.json() as {
    durations?: Array<Array<number | null>>;
    distances?: Array<Array<number | null>>;
  };
  if (!Array.isArray(payload.durations) || !Array.isArray(payload.distances)) {
    throw new OwnlyMcpError('OpenRouteService returned no usable travel-time matrix.', 'DATA_INVALID');
  }
  return {
    durations_minutes: payload.durations.map((row) => row.map((value) => value === null ? null : Math.max(0, Math.ceil(value / 60)))),
    distances_meters: payload.distances.map((row) => row.map((value) => value === null ? null : Math.max(0, Math.round(value)))),
  };
}

export interface PlannerDayTravelOptimization {
  trip: PlannerTrip;
  date: string;
  ordered_places: PlannerScheduledPlace[];
  legs_to_write: PlannerTripLeg[];
  original_minutes: number;
  optimized_minutes: number;
  saved_minutes: number;
  used_manual_pairs: string[];
}

export async function buildOpenRouteServiceDayOptimization(
  dataLocation: string,
  tripId: string,
  date: string,
  apiKey: string,
  now = new Date(),
): Promise<PlannerDayTravelOptimization> {
  const tripEntry = listPlannerTrips(dataLocation).find((item) => item.frontmatter.id === tripId);
  if (!tripEntry) throw new OwnlyMcpError(`Planner trip was not found: ${tripId}`, 'NOT_FOUND');
  const trip = tripEntry.frontmatter as unknown as PlannerTrip;
  const mode = trip.transport_mode ?? 'transit';
  if (!openRouteServiceProfile(mode)) {
    throw new OwnlyMcpError('Travel-time optimization currently supports walking, driving and bicycling. Transit legs remain user-verified facts.', 'INVALID_INPUT');
  }
  const placeFacts = listPlannerPlaces(dataLocation)
    .map((item) => item.frontmatter as PlannerTripPlace)
    .filter((place) => place.trip_id === tripId && place.state !== 'dropped');
  const visits = listPlannerVisits(dataLocation)
    .map((item) => item.frontmatter as PlannerTripVisit)
    .filter((visit) => visit.trip_id === tripId && visit.date === date);
  const places = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(placeFacts, visits));
  if (places.length < 3) throw new OwnlyMcpError('At least three scheduled visits are required for travel-time optimization.', 'INVALID_INPUT');
  const missingCoordinates = places.filter((place) => !place.coordinates).map((place) => place.title);
  if (missingCoordinates.length > 0) {
    throw new OwnlyMcpError(`Travel-time optimization requires coordinates for every scheduled stop. Missing: ${missingCoordinates.join(', ')}`, 'INVALID_INPUT');
  }

  const matrixResult = await fetchOpenRouteServiceMatrix(
    apiKey,
    places as Array<PlannerScheduledPlace & { coordinates: { lat: number; lng: number } }>,
    mode,
  );
  const matrix: PlannerTravelTimeMatrix = {};
  places.forEach((from, fromIndex) => {
    matrix[from.id] = {};
    places.forEach((to, toIndex) => {
      matrix[from.id]![to.id] = matrixResult.durations_minutes[fromIndex]?.[toIndex] ?? null;
    });
  });

  const existingLegs = listPlannerLegs(dataLocation)
    .map((item) => item.frontmatter as PlannerTripLeg)
    .filter((leg) => leg.trip_id === tripId);
  const usedManualPairs: string[] = [];
  for (const leg of existingLegs) {
    if (leg.source !== 'manual') continue;
    for (const from of places) {
      if (from.place_id !== leg.from_place_id) continue;
      for (const to of places) {
        if (to.place_id !== leg.to_place_id) continue;
        matrix[from.id]![to.id] = leg.duration_minutes;
      }
    }
  }

  const result = optimizeStopsByTravelTime(places, matrix, { fixStart: true, respectLocked: true });
  if (!result) throw new OwnlyMcpError('Travel-time matrix is incomplete for the current scheduled order; no route is invented.', 'DATA_INVALID');
  if (!result.improved) throw new OwnlyMcpError('Current order is already optimal by known travel minutes; nothing to commit.', 'INVALID_INPUT');

  const originalIndex = new Map(places.map((place, index) => [place.id, index] as const));
  const existingByPair = new Map<string, PlannerTripLeg>(existingLegs.map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));
  const timestamp = now.toISOString();
  const legsToWrite: PlannerTripLeg[] = [];
  for (let index = 0; index < result.places.length - 1; index += 1) {
    const from: PlannerScheduledPlace = result.places[index];
    const to: PlannerScheduledPlace = result.places[index + 1];
    const pair = `${from.place_id}→${to.place_id}`;
    const existing = existingByPair.get(pair);
    if (existing?.source === 'manual') {
      usedManualPairs.push(pair);
      continue;
    }
    const fromIndex = originalIndex.get(from.id)!;
    const toIndex = originalIndex.get(to.id)!;
    const duration = matrixResult.durations_minutes[fromIndex]?.[toIndex];
    const distance = matrixResult.distances_meters[fromIndex]?.[toIndex];
    if (duration === null || duration === undefined) {
      throw new OwnlyMcpError(`OpenRouteService has no route for optimized pair ${from.title} → ${to.title}.`, 'DATA_INVALID');
    }
    legsToWrite.push({
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(tripId, from.place_id, to.place_id), trip_id: tripId,
      from_place_id: from.place_id, to_place_id: to.place_id, mode, duration_minutes: duration,
      distance_meters: distance ?? undefined, source: 'openrouteservice', observed_at: timestamp,
      created_at: existing?.created_at ?? timestamp, updated_at: timestamp,
    });
  }
  return {
    trip, date, ordered_places: result.places, legs_to_write: legsToWrite,
    original_minutes: result.originalMinutes, optimized_minutes: result.optimizedMinutes,
    saved_minutes: result.savedMinutes, used_manual_pairs: usedManualPairs,
  };
}
