import type { PlannerTrip, PlannerTripLeg, PlannerTripPlace } from './planner';
import { plannerTripLegId } from './planner';
import type { PlannerTripVisit } from './planner-visits';

export const OWNLY_TRIP_BUNDLE_KIND = 'ownly.trip.bundle' as const;
export const OWNLY_TRIP_BUNDLE_VERSION = 1 as const;

export interface OwnlyTripBundle {
  kind: typeof OWNLY_TRIP_BUNDLE_KIND;
  version: typeof OWNLY_TRIP_BUNDLE_VERSION;
  exported_at: string;
  privacy: {
    expenses: 'excluded';
    members: 'excluded';
    calendar_feed: 'excluded';
  };
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
}

export interface InstantiatedTripBundle {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeSharedTrip(trip: PlannerTrip): PlannerTrip {
  const next = cloneJson(trip);
  delete next.members;
  delete next.calendar_feed;
  delete next.ignored_duplicate_pair_ids;
  return next;
}

/**
 * Build a portable, editable Trip snapshot. Expense/payment records are not part
 * of this schema by design, and personal ledger participants / calendar feed
 * tokens are removed before serialization.
 */
export function createShareableTripBundle(
  trip: PlannerTrip,
  allPlaces: PlannerTripPlace[],
  allVisits: PlannerTripVisit[],
  allLegs: PlannerTripLeg[],
  exportedAt = new Date().toISOString(),
): OwnlyTripBundle {
  const tripId = trip.id;
  return {
    kind: OWNLY_TRIP_BUNDLE_KIND,
    version: OWNLY_TRIP_BUNDLE_VERSION,
    exported_at: exportedAt,
    privacy: {
      expenses: 'excluded',
      members: 'excluded',
      calendar_feed: 'excluded',
    },
    trip: sanitizeSharedTrip(trip),
    places: cloneJson(allPlaces.filter((place) => place.trip_id === tripId)),
    visits: cloneJson(allVisits.filter((visit) => visit.trip_id === tripId)),
    legs: cloneJson(allLegs.filter((leg) => leg.trip_id === tripId)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Trip Bundle 缺少有效字段：${key}`);
  }
  return value;
}

function validateTrip(raw: unknown): PlannerTrip {
  if (!isRecord(raw)) throw new Error('Trip Bundle 中的 trip 无效。');
  if (raw.type !== 'trip') throw new Error('Trip Bundle 中的 trip.type 无效。');
  requireString(raw, 'id');
  requireString(raw, 'title');
  requireString(raw, 'start_date');
  requireString(raw, 'end_date');
  const trip = cloneJson(raw) as unknown as PlannerTrip;
  // Import is privacy-safe even if a hand-crafted bundle tries to include them.
  delete trip.members;
  delete trip.calendar_feed;
  delete trip.ignored_duplicate_pair_ids;
  return trip;
}

function validatePlaces(raw: unknown, tripId: string): PlannerTripPlace[] {
  if (!Array.isArray(raw)) throw new Error('Trip Bundle 中的 places 无效。');
  return raw.map((value) => {
    if (!isRecord(value) || value.type !== 'trip_place') throw new Error('Trip Bundle 包含无效地点。');
    requireString(value, 'id');
    requireString(value, 'title');
    if (value.trip_id !== tripId) throw new Error('Trip Bundle 地点不属于该行程。');
    return cloneJson(value) as unknown as PlannerTripPlace;
  });
}

function validateVisits(raw: unknown, tripId: string, placeIds: Set<string>): PlannerTripVisit[] {
  if (!Array.isArray(raw)) throw new Error('Trip Bundle 中的 visits 无效。');
  return raw.map((value) => {
    if (!isRecord(value) || value.type !== 'trip_visit') throw new Error('Trip Bundle 包含无效日程访问。');
    requireString(value, 'id');
    const placeId = requireString(value, 'place_id');
    if (value.trip_id !== tripId || !placeIds.has(placeId)) throw new Error('Trip Bundle 日程访问引用了无效地点。');
    return cloneJson(value) as unknown as PlannerTripVisit;
  });
}

function validateLegs(raw: unknown, tripId: string, placeIds: Set<string>): PlannerTripLeg[] {
  if (!Array.isArray(raw)) throw new Error('Trip Bundle 中的 legs 无效。');
  return raw.map((value) => {
    if (!isRecord(value) || value.type !== 'trip_leg') throw new Error('Trip Bundle 包含无效路线段。');
    requireString(value, 'id');
    const from = requireString(value, 'from_place_id');
    const to = requireString(value, 'to_place_id');
    if (value.trip_id !== tripId || !placeIds.has(from) || !placeIds.has(to)) {
      throw new Error('Trip Bundle 路线段引用了无效地点。');
    }
    return cloneJson(value) as unknown as PlannerTripLeg;
  });
}

export function parseTripBundle(rawText: string): OwnlyTripBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('这不是有效的 Ownly Trip Bundle JSON。');
  }
  if (!isRecord(parsed)) throw new Error('Trip Bundle 格式无效。');
  if (parsed.kind !== OWNLY_TRIP_BUNDLE_KIND || parsed.version !== OWNLY_TRIP_BUNDLE_VERSION) {
    throw new Error('不支持的 Ownly Trip Bundle 版本。');
  }

  const trip = validateTrip(parsed.trip);
  const places = validatePlaces(parsed.places, trip.id);
  const placeIds = new Set(places.map((place) => place.id));
  const visits = validateVisits(parsed.visits, trip.id, placeIds);
  const legs = validateLegs(parsed.legs, trip.id, placeIds);

  return {
    kind: OWNLY_TRIP_BUNDLE_KIND,
    version: OWNLY_TRIP_BUNDLE_VERSION,
    exported_at: typeof parsed.exported_at === 'string' ? parsed.exported_at : '',
    privacy: { expenses: 'excluded', members: 'excluded', calendar_feed: 'excluded' },
    trip,
    places,
    visits,
    legs,
  };
}

/**
 * Clone a shared Trip into a new local identity graph. Every entity id is
 * regenerated, while Place → Visit and Place → Leg references are remapped.
 */
export function instantiateTripBundle(
  bundle: OwnlyTripBundle,
  idFactory: () => string = () => crypto.randomUUID(),
  now = new Date().toISOString(),
): InstantiatedTripBundle {
  const newTripId = idFactory();
  const placeIdMap = new Map<string, string>();
  bundle.places.forEach((place) => placeIdMap.set(place.id, idFactory()));

  const trip: PlannerTrip = {
    ...cloneJson(bundle.trip),
    id: newTripId,
    status: 'planning',
    members: undefined,
    calendar_feed: undefined,
    ignored_duplicate_pair_ids: undefined,
    created_at: now,
    updated_at: now,
  };

  const places: PlannerTripPlace[] = bundle.places.map((place) => ({
    ...cloneJson(place),
    id: placeIdMap.get(place.id)!,
    trip_id: newTripId,
    created_at: now,
    updated_at: now,
  }));

  const visits: PlannerTripVisit[] = bundle.visits.map((visit) => ({
    ...cloneJson(visit),
    id: `visit:${idFactory()}`,
    trip_id: newTripId,
    place_id: placeIdMap.get(visit.place_id)!,
    created_at: now,
    updated_at: now,
  }));

  const legs: PlannerTripLeg[] = bundle.legs.map((leg) => {
    const fromPlaceId = placeIdMap.get(leg.from_place_id)!;
    const toPlaceId = placeIdMap.get(leg.to_place_id)!;
    return {
      ...cloneJson(leg),
      id: plannerTripLegId(newTripId, fromPlaceId, toPlaceId),
      trip_id: newTripId,
      from_place_id: fromPlaceId,
      to_place_id: toPlaceId,
      created_at: now,
      updated_at: now,
    };
  });

  return { trip, places, visits, legs };
}

export function tripBundleFileName(title: string): string {
  const safe = title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'ownly-trip'}.ownly-trip.json`;
}
