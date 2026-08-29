import { listPlannerLegs, listPlannerPlaces, listPlannerTrips } from '../cli/planner-storage';
import {
  plannerTripLegId,
  sortPlannerPlaces,
  type PlannerTravelMode,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
} from '../../src/domain/planner';
import { OwnlyMcpError } from './ownly-tools';

const ORS_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/directions';

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

  const places = sortPlannerPlaces(
    listPlannerPlaces(dataLocation)
      .map((item) => item.frontmatter as PlannerTripPlace)
      .filter((place) => place.trip_id === tripId && place.state === 'scheduled' && place.scheduled_date === date),
  );
  if (places.length < 2) throw new OwnlyMcpError('At least two scheduled places are required to refresh travel legs.', 'INVALID_INPUT');

  const existing = listPlannerLegs(dataLocation).map((item) => item.frontmatter as PlannerTripLeg);
  const existingByPair = new Map<string, PlannerTripLeg>(existing.filter((leg) => leg.trip_id === tripId).map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));
  const legs: PlannerTripLeg[] = [];
  const skippedManual: string[] = [];
  const missingCoordinates: string[] = [];
  const timestamp = now.toISOString();

  for (let index = 0; index < places.length - 1; index += 1) {
    const from = places[index];
    const to = places[index + 1];
    const pair = `${from.id}→${to.id}`;
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
      id: plannerTripLegId(tripId, from.id, to.id),
      trip_id: tripId,
      from_place_id: from.id,
      to_place_id: to.id,
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
