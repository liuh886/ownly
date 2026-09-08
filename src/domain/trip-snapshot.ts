import type {
  PlannerTrip,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseItem,
} from './planner';
import type { PlannerTripVisit } from './planner-visits';
import { OWNLY_TRIP_BUNDLE_KIND } from './trip-bundle';

/**
 * WS-3 — trip snapshot for the mobile read-only view.
 *
 * A deliberately separate language from the share bundle
 * (`ownly.trip.bundle`): snapshots may carry expenses (opt-in, explicit
 * consent) and are never importable — the phone renders them from memory
 * and cannot write back. The parser rejects share bundles outright so the
 * two file kinds can never be confused.
 */

export const OWNLY_TRIP_SNAPSHOT_KIND = 'ownly.trip.snapshot' as const;
export const OWNLY_TRIP_SNAPSHOT_VERSION = 1 as const;

/** Stale heuristic for the "possibly outdated" badge (spec: 24h). */
export const TRIP_SNAPSHOT_STALE_MS = 24 * 3_600_000;

export interface OwnlyTripSnapshot {
  kind: typeof OWNLY_TRIP_SNAPSHOT_KIND;
  version: typeof OWNLY_TRIP_SNAPSHOT_VERSION;
  exported_at: string;
  privacy: {
    expenses: 'included' | 'excluded';
    members: 'excluded';
    calendar_feed: 'excluded';
  };
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
  expenses: TripExpenseItem[];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeSnapshotTrip(trip: PlannerTrip): PlannerTrip {
  const next = cloneJson(trip);
  delete next.members;
  delete next.calendar_feed;
  delete next.ignored_duplicate_pair_ids;
  return next;
}

export function createTripSnapshot(
  trip: PlannerTrip,
  allPlaces: PlannerTripPlace[],
  allVisits: PlannerTripVisit[],
  allLegs: PlannerTripLeg[],
  allExpenses: TripExpenseItem[],
  options?: { includeExpenses?: boolean; exportedAt?: string },
): OwnlyTripSnapshot {
  const tripId = trip.id;
  const includeExpenses = options?.includeExpenses === true;
  return {
    kind: OWNLY_TRIP_SNAPSHOT_KIND,
    version: OWNLY_TRIP_SNAPSHOT_VERSION,
    exported_at: options?.exportedAt ?? new Date().toISOString(),
    privacy: {
      expenses: includeExpenses ? 'included' : 'excluded',
      members: 'excluded',
      calendar_feed: 'excluded',
    },
    trip: sanitizeSnapshotTrip(trip),
    places: cloneJson(allPlaces.filter((place) => place.trip_id === tripId)),
    visits: cloneJson(allVisits.filter((visit) => visit.trip_id === tripId)),
    legs: cloneJson(allLegs.filter((leg) => leg.trip_id === tripId)),
    expenses: includeExpenses
      ? cloneJson(allExpenses.filter((expense) => expense.trip_id === tripId))
      : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, what: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Trip Snapshot ${what}缺少有效字段：${key}`);
  }
  return value;
}

function validateSnapshotTrip(raw: unknown): PlannerTrip {
  if (!isRecord(raw)) throw new Error('Trip Snapshot 中的 trip 无效。');
  if (raw.type !== 'trip') throw new Error('Trip Snapshot 中的 trip.type 无效。');
  requireString(raw, 'id', 'trip');
  requireString(raw, 'title', 'trip');
  requireString(raw, 'start_date', 'trip');
  requireString(raw, 'end_date', 'trip');
  const trip = cloneJson(raw) as unknown as PlannerTrip;
  delete trip.members;
  delete trip.calendar_feed;
  delete trip.ignored_duplicate_pair_ids;
  return trip;
}

function validateSnapshotPlaces(raw: unknown, tripId: string): PlannerTripPlace[] {
  if (!Array.isArray(raw)) throw new Error('Trip Snapshot 中的 places 无效。');
  return raw.map((value) => {
    if (!isRecord(value) || value.type !== 'trip_place') {
      throw new Error('Trip Snapshot 包含无效地点。');
    }
    requireString(value, 'id', '地点');
    requireString(value, 'title', '地点');
    if (value.trip_id !== tripId) throw new Error('Trip Snapshot 地点不属于该行程。');
    return cloneJson(value) as unknown as PlannerTripPlace;
  });
}

function validateSnapshotVisits(
  raw: unknown,
  tripId: string,
  placeIds: Set<string>,
): PlannerTripVisit[] {
  if (!Array.isArray(raw)) throw new Error('Trip Snapshot 中的 visits 无效。');
  return raw.map((value) => {
    if (!isRecord(value) || value.type !== 'trip_visit') {
      throw new Error('Trip Snapshot 包含无效日程访问。');
    }
    requireString(value, 'id', '日程访问');
    const placeId = requireString(value, 'place_id', '日程访问');
    if (value.trip_id !== tripId || !placeIds.has(placeId)) {
      throw new Error('Trip Snapshot 日程访问引用了无效地点。');
    }
    return cloneJson(value) as unknown as PlannerTripVisit;
  });
}

function validateSnapshotLegs(
  raw: unknown,
  tripId: string,
  placeIds: Set<string>,
): PlannerTripLeg[] {
  if (!Array.isArray(raw)) throw new Error('Trip Snapshot 中的 legs 无效。');
  return raw.map((value) => {
    if (!isRecord(value) || value.type !== 'trip_leg') {
      throw new Error('Trip Snapshot 包含无效路线段。');
    }
    requireString(value, 'id', '路线段');
    const from = requireString(value, 'from_place_id', '路线段');
    const to = requireString(value, 'to_place_id', '路线段');
    if (value.trip_id !== tripId || !placeIds.has(from) || !placeIds.has(to)) {
      throw new Error('Trip Snapshot 路线段引用了无效地点。');
    }
    return cloneJson(value) as unknown as PlannerTripLeg;
  });
}

function validateSnapshotExpenses(raw: unknown, tripId: string): TripExpenseItem[] {
  if (!Array.isArray(raw)) throw new Error('Trip Snapshot 中的 expenses 无效。');
  return raw.map((value) => {
    if (!isRecord(value) || value.type !== 'trip_expense') {
      throw new Error('Trip Snapshot 包含无效费用。');
    }
    requireString(value, 'id', '费用');
    requireString(value, 'title', '费用');
    if (typeof value.amount !== 'number' || !Number.isFinite(value.amount)) {
      throw new Error('Trip Snapshot 费用金额无效。');
    }
    if (value.trip_id !== tripId) throw new Error('Trip Snapshot 费用不属于该行程。');
    return cloneJson(value) as unknown as TripExpenseItem;
  });
}

export function parseTripSnapshot(rawText: string): OwnlyTripSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('这不是有效的 Ownly Trip Snapshot JSON。');
  }
  if (!isRecord(parsed)) throw new Error('Trip Snapshot 格式无效。');
  if ((parsed as { kind?: unknown }).kind === OWNLY_TRIP_BUNDLE_KIND) {
    throw new Error(
      '这是分享 Bundle（ownly.trip.bundle），不是手机快照。请用「分享」入口导入，或请对方重新导出「手机快照」。',
    );
  }
  if (
    parsed.kind !== OWNLY_TRIP_SNAPSHOT_KIND ||
    parsed.version !== OWNLY_TRIP_SNAPSHOT_VERSION
  ) {
    throw new Error('不支持的 Ownly Trip Snapshot 版本。');
  }

  const trip = validateSnapshotTrip(parsed.trip);
  const places = validateSnapshotPlaces(parsed.places, trip.id);
  const placeIds = new Set(places.map((place) => place.id));
  const visits = validateSnapshotVisits(parsed.visits, trip.id, placeIds);
  const legs = validateSnapshotLegs(parsed.legs, trip.id, placeIds);
  const expenses = validateSnapshotExpenses(parsed.expenses ?? [], trip.id);
  const expensesFlag =
    isRecord(parsed.privacy) && parsed.privacy.expenses === 'included'
      ? 'included'
      : 'excluded';

  return {
    kind: OWNLY_TRIP_SNAPSHOT_KIND,
    version: OWNLY_TRIP_SNAPSHOT_VERSION,
    exported_at: typeof parsed.exported_at === 'string' ? parsed.exported_at : '',
    privacy: { expenses: expensesFlag, members: 'excluded', calendar_feed: 'excluded' },
    trip,
    places,
    visits,
    legs,
    expenses,
  };
}

export function tripSnapshotFileName(title: string): string {
  const safe = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'ownly-trip'}.ownly-trip-snapshot.json`;
}

export function snapshotAgeHours(exportedAt: string, now = new Date()): number | null {
  const time = new Date(exportedAt).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (now.getTime() - time) / 3_600_000);
}

export function isSnapshotStale(exportedAt: string, now = new Date()): boolean {
  const age = snapshotAgeHours(exportedAt, now);
  return age !== null && age * 3_600_000 > TRIP_SNAPSHOT_STALE_MS;
}

export interface SnapshotDayStop {
  time: string | null;
  title: string;
  kind: string;
  area?: string;
}

export interface SnapshotDayView {
  date: string;
  stops: SnapshotDayStop[];
}

export interface SnapshotView {
  days: SnapshotDayView[];
  /** Places with no visits — the candidate pool. */
  pool: PlannerTripPlace[];
}

/** Pure derivation for the read-only viewer: days + unvisited pool. */
export function buildSnapshotView(snapshot: OwnlyTripSnapshot): SnapshotView {
  const placeById = new Map(snapshot.places.map((place) => [place.id, place]));
  const visitedIds = new Set<string>();
  const stopsByDate = new Map<string, { order: number; stop: SnapshotDayStop }[]>();

  const sortedVisits = [...snapshot.visits].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  for (const visit of sortedVisits) {
    const place = placeById.get(visit.place_id);
    if (!place) continue;
    visitedIds.add(place.id);
    const list = stopsByDate.get(visit.date) ?? [];
    list.push({
      order: visit.sort_order ?? 0,
      stop: {
        time: (visit as { start?: string }).start ?? null,
        title: place.title,
        kind: place.kind,
        area: place.area,
      },
    });
    stopsByDate.set(visit.date, list);
  }

  const days: SnapshotDayView[] = [...stopsByDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, entries]) => ({
      date,
      stops: entries
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.stop),
    }));

  return {
    days,
    pool: snapshot.places.filter(
      (place) => !visitedIds.has(place.id) && place.state !== 'dropped',
    ),
  };
}
