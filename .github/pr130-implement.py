from pathlib import Path
import json
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'{label}: target not found')
    if text.count(old) != 1:
        raise RuntimeError(f'{label}: expected one target, found {text.count(old)}')
    return text.replace(old, new, 1)


# src/domain/planner.ts -------------------------------------------------------
path = 'src/domain/planner.ts'
text = read(path)
text = replace_once(
    text,
    "export type PlannerTripStatus = 'planning' | 'active' | 'completed';\n",
    "export type PlannerTripStatus = 'planning' | 'active' | 'completed';\n"
    "export type PlannerTravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';\n"
    "export type PlannerTripLegSource = 'manual' | 'openrouteservice';\n",
    'planner travel types',
)
text = replace_once(
    text,
    "  transport_mode?: 'driving' | 'walking' | 'bicycling' | 'transit';\n",
    "  transport_mode?: PlannerTravelMode;\n",
    'trip transport mode type',
)
marker = "export interface CaptureContext {\n"
leg_block = """export interface PlannerTripLeg {
  schema_version: '0.1';
  type: 'trip_leg';
  id: string;
  trip_id: string;
  from_place_id: string;
  to_place_id: string;
  mode: PlannerTravelMode;
  duration_minutes: number;
  distance_meters?: number;
  source: PlannerTripLegSource;
  observed_at?: string;
  created_at: string;
  updated_at?: string;
}

function stablePlannerHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function plannerTripLegId(tripId: string, fromPlaceId: string, toPlaceId: string): string {
  return `leg:${tripId}:${fromPlaceId}:${toPlaceId}`;
}

export function plannerTripLegFileName(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'travel-leg';
  return `leg--${safe}-${stablePlannerHash(id)}.md`;
}

"""
text = replace_once(text, marker, leg_block + marker, 'planner leg model')
write(path, text)


# src/domain/planner-schedule.ts ---------------------------------------------
path = 'src/domain/planner-schedule.ts'
text = read(path)
text = replace_once(
    text,
    "  checkOpeningHoursCollision,\n  listTripDates,\n  type PlannerTrip,\n  type PlannerTripPlace,\n",
    "  checkOpeningHoursCollision,\n  listTripDates,\n  sortPlannerPlaces,\n  type PlannerTrip,\n  type PlannerTripLeg,\n  type PlannerTripPlace,\n",
    'schedule imports',
)
marker = "function isHardConstraint(place: PlannerTripPlace): boolean {\n"
feasibility = """export type PlannerTravelTransitionStatus = 'ok' | 'unknown' | 'conflict';
export type PlannerDayFeasibilityStatus = 'feasible' | 'unknown' | 'conflict';

export interface PlannerTravelTransition {
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  status: PlannerTravelTransitionStatus;
  unknown_reason?: 'travel_time_missing' | 'schedule_time_missing';
  leg?: PlannerTripLeg;
  departure_time?: string;
  earliest_arrival?: string;
  next_start?: string;
  slack_minutes?: number;
  late_by_minutes?: number;
}

export interface PlannerDayFeasibility {
  date: string;
  status: PlannerDayFeasibilityStatus;
  valid: boolean;
  transitions: PlannerTravelTransition[];
}

function transitionKey(fromId: string, toId: string): string {
  return `${fromId}→${toId}`;
}

function formatClockWithinDay(totalMinutes: number): string | undefined {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) return undefined;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function evaluatePlannerDayFeasibility(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  legs: PlannerTripLeg[],
  date: string,
): PlannerDayFeasibility {
  const dayPlaces = sortPlannerPlaces(
    places.filter((place) => place.trip_id === trip.id && place.state === 'scheduled' && place.scheduled_date === date),
  );
  const legByPair = new Map(
    legs
      .filter((leg) => leg.trip_id === trip.id)
      .map((leg) => [transitionKey(leg.from_place_id, leg.to_place_id), leg] as const),
  );
  const transitions: PlannerTravelTransition[] = [];

  for (let index = 0; index < dayPlaces.length - 1; index += 1) {
    const from = dayPlaces[index];
    const to = dayPlaces[index + 1];
    const leg = legByPair.get(transitionKey(from.id, to.id));
    if (!leg) {
      transitions.push({
        from_id: from.id,
        to_id: to.id,
        from_title: from.title,
        to_title: to.title,
        status: 'unknown',
        unknown_reason: 'travel_time_missing',
      });
      continue;
    }

    const departureTime = getScheduledEndTime(from.scheduled_start, from.duration_minutes);
    const departureMinutes = plannerClockToMinutes(departureTime);
    const nextStartMinutes = plannerClockToMinutes(to.scheduled_start);
    if (departureMinutes === null || nextStartMinutes === null) {
      transitions.push({
        from_id: from.id,
        to_id: to.id,
        from_title: from.title,
        to_title: to.title,
        status: 'unknown',
        unknown_reason: 'schedule_time_missing',
        leg,
        departure_time: departureTime ?? undefined,
        next_start: to.scheduled_start,
      });
      continue;
    }

    const arrivalMinutes = departureMinutes + leg.duration_minutes;
    const slack = nextStartMinutes - arrivalMinutes;
    transitions.push({
      from_id: from.id,
      to_id: to.id,
      from_title: from.title,
      to_title: to.title,
      status: slack < 0 ? 'conflict' : 'ok',
      leg,
      departure_time: departureTime ?? undefined,
      earliest_arrival: formatClockWithinDay(arrivalMinutes),
      next_start: to.scheduled_start,
      slack_minutes: slack,
      late_by_minutes: slack < 0 ? Math.abs(slack) : undefined,
    });
  }

  const status: PlannerDayFeasibilityStatus = transitions.some((item) => item.status === 'conflict')
    ? 'conflict'
    : transitions.some((item) => item.status === 'unknown') ? 'unknown' : 'feasible';
  return { date, status, valid: status === 'feasible', transitions };
}

"""
text = replace_once(text, marker, feasibility + marker, 'day feasibility')
write(path, text)


# schedule tests --------------------------------------------------------------
path = 'src/domain/planner-schedule.test.ts'
text = read(path)
text = replace_once(
    text,
    "import type { PlannerTrip, PlannerTripPlace } from './planner';\n",
    "import { plannerTripLegId, type PlannerTrip, type PlannerTripLeg, type PlannerTripPlace } from './planner';\n",
    'schedule test type import',
)
text = replace_once(
    text,
    "  evaluatePlannerScheduleProposal,\n",
    "  evaluatePlannerDayFeasibility,\n  evaluatePlannerScheduleProposal,\n",
    'schedule test function import',
)
insert = """
  it('evaluates adjacent travel legs without inventing missing travel time', () => {
    const places = [
      place('a', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '09:00', duration_minutes: 90, sort_order: 0 }),
      place('b', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '11:00', duration_minutes: 60, sort_order: 1 }),
      place('c', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '12:00', duration_minutes: 60, sort_order: 2 }),
    ];
    const leg: PlannerTripLeg = {
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(trip.id, 'a', 'b'), trip_id: trip.id,
      from_place_id: 'a', to_place_id: 'b', mode: 'walking', duration_minutes: 20,
      source: 'manual', created_at: '2026-08-29T00:00:00Z',
    };
    const result = evaluatePlannerDayFeasibility(trip, places, [leg], '2026-10-05');
    expect(result.status).toBe('unknown');
    expect(result.transitions[0]).toMatchObject({ status: 'ok', earliest_arrival: '10:50', slack_minutes: 10 });
    expect(result.transitions[1]).toMatchObject({ status: 'unknown', unknown_reason: 'travel_time_missing' });
  });

  it('flags a deterministic late arrival from persisted travel time', () => {
    const places = [
      place('a', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '09:00', duration_minutes: 90, sort_order: 0 }),
      place('b', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '10:45', duration_minutes: 60, sort_order: 1 }),
    ];
    const leg: PlannerTripLeg = {
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(trip.id, 'a', 'b'), trip_id: trip.id,
      from_place_id: 'a', to_place_id: 'b', mode: 'driving', duration_minutes: 30,
      source: 'manual', created_at: '2026-08-29T00:00:00Z',
    };
    const result = evaluatePlannerDayFeasibility(trip, places, [leg], '2026-10-05');
    expect(result.status).toBe('conflict');
    expect(result.valid).toBe(false);
    expect(result.transitions[0]).toMatchObject({ status: 'conflict', earliest_arrival: '11:00', late_by_minutes: 15 });
  });
"""
text = replace_once(text, "\n  it('derives end time instead of persisting a second authority', () => {", insert + "\n  it('derives end time instead of persisting a second authority', () => {", 'schedule feasibility tests')
write(path, text)


# PlannerRepository -----------------------------------------------------------
path = 'src/services/PlannerRepository.ts'
text = read(path)
text = replace_once(
    text,
    "  normalizePlaceIdentity,\n  type PlannerTrip,\n  type PlannerTripPlace,\n",
    "  normalizePlaceIdentity,\n  plannerTripLegFileName,\n  type PlannerTrip,\n  type PlannerTripLeg,\n  type PlannerTripPlace,\n",
    'repository imports',
)
text = replace_once(
    text,
    "  places: 'Trip Places',\n  expenses: 'Trip Expenses',\n",
    "  places: 'Trip Places',\n  legs: 'Trip Legs',\n  expenses: 'Trip Expenses',\n",
    'repository leg directory',
)
text = replace_once(
    text,
    "type PlannerEntity = PlannerTrip | PlannerTripPlace\n",
    "type PlannerEntity = PlannerTrip | PlannerTripPlace | PlannerTripLeg;\n",
    'repository entity union',
)
text = replace_once(
    text,
    "function entityFileName(entity: PlannerEntity): string {\n  const prefix = entity.type === 'trip' ? 'trip' : 'place';\n  return `${prefix}--${safeEntityId(entity.id)}.md`;\n}\n",
    "function entityFileName(entity: PlannerEntity): string {\n  if (entity.type === 'trip_leg') return plannerTripLegFileName(entity.id);\n  const prefix = entity.type === 'trip' ? 'trip' : 'place';\n  return `${prefix}--${safeEntityId(entity.id)}.md`;\n}\n",
    'repository entity filename',
)
text = replace_once(
    text,
    "  async listPlaces(): Promise<PlannerTripPlace[]> {\n    const places = await this.list<PlannerTripPlace>(PLANNER_DIRECTORIES.places, 'trip_place');\n    return places.map((p) => ({\n      ...p,\n      tags: ensurePlaceKindTag(p.tags, p.kind),\n    }));\n  }\n\n",
    "  async listPlaces(): Promise<PlannerTripPlace[]> {\n    const places = await this.list<PlannerTripPlace>(PLANNER_DIRECTORIES.places, 'trip_place');\n    return places.map((p) => ({\n      ...p,\n      tags: ensurePlaceKindTag(p.tags, p.kind),\n    }));\n  }\n\n  async listLegs(): Promise<PlannerTripLeg[]> {\n    return this.list<PlannerTripLeg>(PLANNER_DIRECTORIES.legs, 'trip_leg');\n  }\n\n",
    'repository list legs',
)
text = replace_once(
    text,
    "    const directory = entity.type === 'trip' ? PLANNER_DIRECTORIES.trips : PLANNER_DIRECTORIES.places;\n",
    "    const directory = entity.type === 'trip'\n      ? PLANNER_DIRECTORIES.trips\n      : entity.type === 'trip_leg' ? PLANNER_DIRECTORIES.legs : PLANNER_DIRECTORIES.places;\n",
    'repository upsert directory',
)
text = replace_once(
    text,
    "  async upsertPlace(place: PlannerTripPlace): Promise<void> {\n    await this.upsert({\n      ...place,\n      tags: ensurePlaceKindTag(place.tags, place.kind),\n    });\n  }\n\n",
    "  async upsertPlace(place: PlannerTripPlace): Promise<void> {\n    await this.upsert({\n      ...place,\n      tags: ensurePlaceKindTag(place.tags, place.kind),\n    });\n  }\n\n  async upsertLeg(leg: PlannerTripLeg): Promise<void> {\n    await this.upsert(leg);\n  }\n\n",
    'repository upsert leg',
)
write(path, text)


# repository tests ------------------------------------------------------------
path = 'src/services/PlannerRepository.schedule.test.ts'
text = read(path)
text = replace_once(
    text,
    "import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';\n",
    "import { plannerTripLegId, type PlannerTrip, type PlannerTripLeg, type PlannerTripPlace } from '@/domain/planner';\n",
    'repository test imports',
)
insert = """
  it('persists travel legs in their own canonical directory', async () => {
    const leg: PlannerTripLeg = {
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId('trip-1', 'a', 'b'), trip_id: 'trip-1',
      from_place_id: 'a', to_place_id: 'b', mode: 'walking', duration_minutes: 18, distance_meters: 1200,
      source: 'manual', created_at: '2026-08-29T00:00:00.000Z',
    };
    await plannerRepository.upsertLeg(leg);
    expect(await plannerRepository.listLegs()).toEqual([leg]);
    expect(files.get('vault/Trip Legs')?.size).toBe(1);
  });
"""
text = replace_once(text, "\n  it('saveTripICalMarkdown re-reads canonical Planner state before projection', async () => {", insert + "\n  it('saveTripICalMarkdown re-reads canonical Planner state before projection', async () => {", 'repository leg test')
write(path, text)


# data layout -----------------------------------------------------------------
path = 'src/services/ownly-data-layout.ts'
text = read(path)
text = replace_once(text, "  'Trip Places',\n", "  'Trip Places',\n  'Trip Legs',\n", 'data layout leg dir')
write(path, text)

path = 'src/services/ownly-data-layout.test.ts'
text = read(path)
text = replace_once(text, "    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trip Places');\n", "    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trip Places');\n    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trip Legs');\n", 'data layout leg test')
write(path, text)


# CLI planner storage ---------------------------------------------------------
path = 'scripts/cli/planner-storage.ts'
text = read(path)
text = replace_once(
    text,
    "  calculateTotalRouteDistanceKm,\n  type PlannerTripPlace,\n",
    "  calculateTotalRouteDistanceKm,\n  type PlannerTripLeg,\n  type PlannerTripPlace,\n",
    'cli planner leg import',
)
text = replace_once(text, "  places: 'Trip Places',\n  expenses: 'Trip Expenses',\n", "  places: 'Trip Places',\n  legs: 'Trip Legs',\n  expenses: 'Trip Expenses',\n", 'cli planner leg dir')
text = replace_once(
    text,
    "export function listPlannerPlaces(dataLocation: string) {\n  return readPlannerDir<PlannerTripPlace>(dataLocation, PLANNER_DIRECTORIES.places, 'trip_place');\n}\n",
    "export function listPlannerPlaces(dataLocation: string) {\n  return readPlannerDir<PlannerTripPlace>(dataLocation, PLANNER_DIRECTORIES.places, 'trip_place');\n}\nexport function listPlannerLegs(dataLocation: string) {\n  return readPlannerDir<PlannerTripLeg>(dataLocation, PLANNER_DIRECTORIES.legs, 'trip_leg');\n}\n",
    'cli list legs',
)
write(path, text)


# openrouteservice adapter ----------------------------------------------------
write('scripts/mcp/openrouteservice.ts', """import { listPlannerLegs, listPlannerPlaces, listPlannerTrips } from '../cli/planner-storage';
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
  const existingByPair = new Map(existing.filter((leg) => leg.trip_id === tripId).map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));
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
""")

write('scripts/mcp/openrouteservice.test.ts', """import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenRouteServiceLeg, openRouteServiceProfile } from './openrouteservice';

afterEach(() => vi.unstubAllGlobals());

describe('OpenRouteService travel-leg adapter', () => {
  it('maps only the supported Ownly modes', () => {
    expect(openRouteServiceProfile('driving')).toBe('driving-car');
    expect(openRouteServiceProfile('walking')).toBe('foot-walking');
    expect(openRouteServiceProfile('bicycling')).toBe('cycling-regular');
    expect(openRouteServiceProfile('transit')).toBeNull();
  });

  it('converts route seconds/meters into bounded leg facts', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      routes: [{ summary: { duration: 901, distance: 1234.4 } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchOpenRouteServiceLeg('test-key', { lat: 13.74, lng: 100.50 }, { lat: 13.75, lng: 100.51 }, 'walking');
    expect(result).toEqual({ duration_minutes: 16, distance_meters: 1234 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.heigit.org/openrouteservice/v2/directions/foot-walking',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refuses to fabricate transit routing', async () => {
    await expect(fetchOpenRouteServiceLeg('test-key', { lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'transit')).rejects.toThrow(/public-transit/);
  });
});
""")


# MCP planner tools -----------------------------------------------------------
path = 'scripts/mcp/planner-tools.ts'
text = read(path)
text = replace_once(text, "  listPlannerExpenses,\n  listPlannerPlaces,\n", "  listPlannerExpenses,\n  listPlannerLegs,\n  listPlannerPlaces,\n", 'planner tools list legs import')
text = replace_once(
    text,
    "  type PlannerTrip,\n  type PlannerTripPlace,\n",
    "  type PlannerTrip,\n  type PlannerTripLeg,\n  type PlannerTripPlace,\n",
    'planner tools leg type',
)
text = replace_once(
    text,
    "import { findPlannerTimeOverlaps } from '../../src/domain/planner-schedule';\n",
    "import { evaluatePlannerDayFeasibility, findPlannerTimeOverlaps } from '../../src/domain/planner-schedule';\n",
    'planner tools feasibility import',
)
text = replace_once(
    text,
    "  const bookings = listPlannerBookings(dataLocation)\n",
    "  const legs = listPlannerLegs(dataLocation)\n    .map((item) => item.frontmatter as unknown as PlannerTripLeg)\n    .filter((leg) => leg.trip_id === tripId);\n  const bookings = listPlannerBookings(dataLocation)\n",
    'planner tools load legs',
)
text = replace_once(
    text,
    "  return {\n    trip,\n    budget: {\n",
    "  const feasibility = listTripDates(trip.start_date, trip.end_date)\n    .map((date) => evaluatePlannerDayFeasibility(trip, places, legs, date));\n\n  return {\n    trip,\n    budget: {\n",
    'planner tools feasibility calculation',
)
text = replace_once(
    text,
    "    conflicts,\n    places: places.map((place) => ({\n",
    "    conflicts,\n    travel_legs: legs,\n    feasibility,\n    places: places.map((place) => ({\n",
    'planner tools feasibility output',
)
write(path, text)


# write service ---------------------------------------------------------------
path = 'scripts/shared/ownly-write-service.ts'
text = read(path)
text = replace_once(
    text,
    "  listPlannerPlaces,\n  listPlannerTrips,\n",
    "  listPlannerLegs,\n  listPlannerPlaces,\n  listPlannerTrips,\n",
    'write service list legs import',
)
text = text.replace("} from '../cli/planner-storage';import {", "} from '../cli/planner-storage';\nimport {")
text = replace_once(
    text,
    "  optimizeStopsSequence,\n  type FxSettings,\n  type PlannerTrip,\n  type PlannerTripPlace,\n",
    "  optimizeStopsSequence,\n  plannerTripLegFileName,\n  type FxSettings,\n  type PlannerTrip,\n  type PlannerTripLeg,\n  type PlannerTripPlace,\n",
    'write service leg imports',
)
marker = "  preparePlannerApplyScheduleProposal(\n"
method = """  preparePlannerUpsertTravelLegs(
    inputLegs: PlannerTripLeg[],
    action = 'planner_set_travel_legs',
  ): PreparedOwnlyOperation {
    if (inputLegs.length === 0) throw new OwnlyMutationError('At least one travel leg is required.', 'INVALID_INPUT');
    const tripId = inputLegs[0].trip_id;
    if (inputLegs.some((leg) => leg.trip_id !== tripId)) {
      throw new OwnlyMutationError('All travel legs in one operation must belong to the same trip.', 'INVALID_INPUT');
    }
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'INVALID_INPUT');
    const placeIds = new Set(
      listPlannerPlaces(this.dataLocation)
        .map((entry) => entry.frontmatter)
        .filter((place) => place.trip_id === tripId)
        .map((place) => place.id),
    );
    const existingById = new Map(
      listPlannerLegs(this.dataLocation)
        .map((entry) => [entry.frontmatter.id, entry.frontmatter] as const),
    );
    const now = this.now().toISOString();
    const normalized = inputLegs.map((leg) => {
      if (!placeIds.has(leg.from_place_id) || !placeIds.has(leg.to_place_id) || leg.from_place_id === leg.to_place_id) {
        throw new OwnlyMutationError(`Invalid travel leg endpoints: ${leg.from_place_id} → ${leg.to_place_id}`, 'INVALID_INPUT');
      }
      if (!Number.isInteger(leg.duration_minutes) || leg.duration_minutes <= 0 || leg.duration_minutes > 1440) {
        throw new OwnlyMutationError('Travel duration must be an integer between 1 and 1440 minutes.', 'INVALID_INPUT');
      }
      if (leg.distance_meters !== undefined && (!Number.isInteger(leg.distance_meters) || leg.distance_meters < 0)) {
        throw new OwnlyMutationError('Travel distance must be a non-negative integer number of meters.', 'INVALID_INPUT');
      }
      const existing = existingById.get(leg.id);
      return {
        ...leg,
        created_at: existing?.created_at ?? leg.created_at ?? now,
        updated_at: now,
      };
    });
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.legs);
    const targets = normalized.map((leg) => {
      const filePath = join(directory, plannerTripLegFileName(leg.id));
      return { leg, filePath, expected: fingerprint(filePath) };
    });
    return this.prepare(action, { trip_id: tripId, legs: normalized }, () => {
      mkdirSync(directory, { recursive: true });
      for (const target of targets) {
        assertUnchanged(target.filePath, target.expected);
        writeFileSync(target.filePath, serializeMarkdownEntity(target.leg, ''), 'utf8');
        writeAgentLog(this.dataLocation, action, target.leg.id, existingById.get(target.leg.id) ?? null, target.leg);
      }
      return { trip_id: tripId, written: normalized.length, legs: normalized };
    });
  }

"""
text = replace_once(text, marker, method + marker, 'write service travel leg method')
write(path, text)


# MCP package index -----------------------------------------------------------
path = 'packages/mcp/src/index.mjs'
text = read(path)
text = replace_once(
    text,
    "import { OwnlyWriteService } from '../../../scripts/shared/ownly-write-service.ts';\n",
    "import { OwnlyWriteService } from '../../../scripts/shared/ownly-write-service.ts';\nimport { plannerTripLegId } from '../../../src/domain/planner.ts';\nimport { buildOpenRouteServiceDayLegs } from '../../../scripts/mcp/openrouteservice.ts';\n",
    'mcp travel imports',
)
text = text.replace("const SERVER_VERSION = '0.3.1';", "const SERVER_VERSION = '0.4.0';")
text = replace_once(
    text,
    "  OWNLY_MCP_ALLOW_WRITE=1\\n\\nThe data folder defaults",
    "  OWNLY_MCP_ALLOW_WRITE=1\\n  OPENROUTESERVICE_API_KEY=<optional key for walking/driving/bicycling leg refresh>\\n\\nThe data folder defaults",
    'mcp help ORS env',
)
marker = "  server.registerTool(\n    'ownly_planner_prepare_schedule_place',\n"
tools = """  server.registerTool(
    'ownly_planner_prepare_set_travel_leg',
    {
      title: 'Preview Setting a Travel Leg',
      description: 'Preview one explicit adjacent-place travel-time fact. Use this for public transit or any user-verified route duration.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        from_place_id: z.string().min(1),
        to_place_id: z.string().min(1),
        mode: z.enum(['driving', 'walking', 'bicycling', 'transit']),
        duration_minutes: z.number().int().positive().max(1440),
        distance_meters: z.number().int().nonnegative().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler((input) => {
      const now = new Date().toISOString();
      return writeService.preparePlannerUpsertTravelLegs([{
        schema_version: '0.1',
        type: 'trip_leg',
        id: plannerTripLegId(input.trip_id, input.from_place_id, input.to_place_id),
        trip_id: input.trip_id,
        from_place_id: input.from_place_id,
        to_place_id: input.to_place_id,
        mode: input.mode,
        duration_minutes: input.duration_minutes,
        distance_meters: input.distance_meters,
        source: 'manual',
        observed_at: now,
        created_at: now,
      }], 'planner_set_travel_leg');
    }),
  );

  server.registerTool(
    'ownly_planner_prepare_refresh_day_travel',
    {
      title: 'Preview Refreshing Day Travel Legs',
      description: 'Query OpenRouteService only for adjacent scheduled pairs on one day, preserving manual legs. Supports walking, driving and bicycling; transit remains manual.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(async ({ trip_id, date }) => {
      const refresh = await buildOpenRouteServiceDayLegs(
        dataLocation,
        trip_id,
        date,
        String(process.env.OPENROUTESERVICE_API_KEY ?? ''),
      );
      const prepared = writeService.preparePlannerUpsertTravelLegs(refresh.legs, 'planner_refresh_day_travel');
      return {
        ...prepared,
        refresh: {
          date,
          skipped_manual: refresh.skipped_manual,
          missing_coordinates: refresh.missing_coordinates,
        },
      };
    }),
  );

"""
text = replace_once(text, marker, tools + marker, 'mcp travel tools')
write(path, text)


# PlannerHome -----------------------------------------------------------------
path = 'src/components/planner/PlannerHome.tsx'
text = read(path)
text = replace_once(
    text,
    "import type { PlannerPlaceKind, PlannerTrip, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';\n",
    "import type { PlannerPlaceKind, PlannerTrip, PlannerTripLeg, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';\n",
    'planner home leg type',
)
text = replace_once(
    text,
    "import { findPlannerTimeOverlaps, getScheduledEndTime } from '@/domain/planner-schedule';\n",
    "import { evaluatePlannerDayFeasibility, findPlannerTimeOverlaps, getScheduledEndTime } from '@/domain/planner-schedule';\n",
    'planner home feasibility import',
)
text = replace_once(
    text,
    "  const [places, setPlaces] = useState<PlannerTripPlace[]>([]);\n",
    "  const [places, setPlaces] = useState<PlannerTripPlace[]>([]);\n  const [legs, setLegs] = useState<PlannerTripLeg[]>([]);\n",
    'planner home leg state',
)
text = replace_once(
    text,
    "    const [nextTrips, nextPlaces] = await Promise.all([\n      plannerRepository.listTrips(),\n      plannerRepository.listPlaces(),\n    ]);\n",
    "    const [nextTrips, nextPlaces, nextLegs] = await Promise.all([\n      plannerRepository.listTrips(),\n      plannerRepository.listPlaces(),\n      plannerRepository.listLegs(),\n    ]);\n",
    'planner home load legs',
)
text = replace_once(text, "    setPlaces(nextPlaces);\n    setSelectedTripId", "    setPlaces(nextPlaces);\n    setLegs(nextLegs);\n    setSelectedTripId", 'planner home set legs load')
text = replace_once(
    text,
    "      const [nextTrips, nextPlaces, state] = await Promise.all([\n        plannerRepository.listTrips(),\n        plannerRepository.listPlaces(),\n        pullCaptureState(),\n      ]);\n",
    "      const [nextTrips, nextPlaces, nextLegs, state] = await Promise.all([\n        plannerRepository.listTrips(),\n        plannerRepository.listPlaces(),\n        plannerRepository.listLegs(),\n        pullCaptureState(),\n      ]);\n",
    'planner home init legs',
)
# second occurrence in init after the first replacement above
needle = "      setPlaces(nextPlaces);\n      setSelectedTripId"
if needle not in text:
    raise RuntimeError('planner home set legs init: target not found')
text = text.replace(needle, "      setPlaces(nextPlaces);\n      setLegs(nextLegs);\n      setSelectedTripId", 1)
text = replace_once(
    text,
    "  const scheduled = useMemo(\n    () => sortPlannerPlaces(tripPlaces.filter((place) => place.scheduled_date === activeDate && place.state === 'scheduled')),\n    [activeDate, tripPlaces],\n  );\n",
    "  const scheduled = useMemo(\n    () => sortPlannerPlaces(tripPlaces.filter((place) => place.scheduled_date === activeDate && place.state === 'scheduled')),\n    [activeDate, tripPlaces],\n  );\n\n  const tripLegs = useMemo(\n    () => legs.filter((leg) => leg.trip_id === selectedTripId),\n    [legs, selectedTripId],\n  );\n\n  const dayFeasibility = useMemo(\n    () => selectedTrip\n      ? evaluatePlannerDayFeasibility(selectedTrip, tripPlaces, tripLegs, activeDate)\n      : { date: activeDate, status: 'unknown' as const, valid: false, transitions: [] },\n    [activeDate, selectedTrip, tripLegs, tripPlaces],\n  );\n",
    'planner home feasibility state',
)
text = replace_once(
    text,
    "                  const scheduledEnd = getScheduledEndTime(place.scheduled_start, place.duration_minutes);\n",
    "                  const scheduledEnd = getScheduledEndTime(place.scheduled_start, place.duration_minutes);\n                  const transition = dayFeasibility.transitions[index];\n",
    'planner home transition binding',
)
pattern = re.compile(r"\{index < scheduled\.length - 1 \? \(\n\s*<div className=\\\"flex items-center justify-center py-0\.5\\\">.*?\n\s*</div>\n\s*\) : null\}", re.S)
match = pattern.search(text)
if not match:
    raise RuntimeError('planner home travel connector block not found')
replacement = """{index < scheduled.length - 1 ? (
                        <div className=\"flex items-center justify-center py-0.5\">
                          <div className={`flex min-h-7 flex-wrap items-center justify-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold ${
                            transition?.status === 'conflict'
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : transition?.status === 'ok'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-stone-200 bg-stone-50 text-stone-500'
                          }`}>
                            <span>
                              {transition?.leg
                                ? `${transition.leg.mode === 'walking' ? '🚶' : transition.leg.mode === 'driving' ? '🚗' : transition.leg.mode === 'bicycling' ? '🚲' : '🚇'} ${transition.leg.duration_minutes} min${transition.leg.distance_meters !== undefined ? ` · ${transition.leg.distance_meters < 1000 ? `${transition.leg.distance_meters} m` : `${(transition.leg.distance_meters / 1000).toFixed(1)} km`}` : ''}`
                                : (zh ? '❔ 交通时间未确认' : '❔ Travel time unknown')}
                            </span>
                            {transition?.status === 'ok' && transition.earliest_arrival ? (
                              <span>{zh ? `预计 ${transition.earliest_arrival} 到达 · 余量 ${transition.slack_minutes} min` : `Arrive ${transition.earliest_arrival} · ${transition.slack_minutes} min slack`}</span>
                            ) : null}
                            {transition?.status === 'conflict' ? (
                              <span>{zh ? `最早 ${transition.earliest_arrival ?? '次日'} 到达 · 晚 ${transition.late_by_minutes} min` : `Earliest ${transition.earliest_arrival ?? 'next day'} · ${transition.late_by_minutes} min late`}</span>
                            ) : null}
                            {transition?.unknown_reason === 'schedule_time_missing' ? (
                              <span>{zh ? '补齐两站时间后可判断衔接' : 'Set both stop times to evaluate feasibility'}</span>
                            ) : null}
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(scheduled[index + 1].address || scheduled[index + 1].title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                              target=\"_blank\"
                              rel=\"noreferrer\"
                              className=\"underline underline-offset-2 hover:text-stone-900\"
                            >
                              Google Maps ↗
                            </a>
                          </div>
                        </div>
                      ) : null}"""
text = text[:match.start()] + replacement + text[match.end():]
write(path, text)


# package/test/release metadata ----------------------------------------------
path = 'package.json'
data = json.loads(read(path))
data['scripts']['test:mcp'] = 'vitest run scripts/mcp/ownly-tools.test.ts scripts/mcp/openrouteservice.test.ts scripts/shared/ownly-write-service.test.ts'
write(path, json.dumps(data, ensure_ascii=False, indent=2) + '\n')

for path in ['packages/mcp/package.json']:
    data = json.loads(read(path))
    data['version'] = '0.4.0'
    write(path, json.dumps(data, ensure_ascii=False, indent=2) + '\n')

path = 'server.json'
data = json.loads(read(path))
data['version'] = '0.4.0'
for package in data.get('packages', []):
    if package.get('identifier') == '@ownly-app/mcp':
        package['version'] = '0.4.0'
write(path, json.dumps(data, ensure_ascii=False, indent=2) + '\n')


# docs ------------------------------------------------------------------------
path = 'docs/PLANNER.md'
text = read(path)
text = replace_once(
    text,
    "  Trip Places/\n  Trip Expenses/\n",
    "  Trip Places/\n  Trip Legs/\n  Trip Expenses/\n",
    'planner docs tree',
)
text += """

## Travel legs and day feasibility

`Trip Legs/` stores one canonical travel fact for an ordered place pair. A leg records the chosen mode, duration, optional distance, source and observation time; it is never embedded into a place because reordering must not change place semantics.

The deterministic schedule engine combines stop end time + adjacent travel duration + next stop start time. Each transition is `ok`, `unknown`, or `conflict`. Missing route facts remain unknown; Ownly never inserts a default transfer duration.

MCP offers two explicit prepare/commit paths:

- `ownly_planner_prepare_set_travel_leg`: save a user-verified leg, including public-transit time.
- `ownly_planner_prepare_refresh_day_travel`: refresh only adjacent walking/driving/bicycling pairs through OpenRouteService using `OPENROUTESERVICE_API_KEY`; manual legs are preserved.

The browser remains a consumer of canonical `Trip Legs/` facts. API keys are not shipped in the static Web/PWA bundle. Google Maps remains the live-navigation handoff.
"""
write(path, text)

print('PR #130 implementation applied successfully')
