import { describe, expect, it } from 'vitest';
import {
  buildSnapshotView,
  createTripSnapshot,
  isSnapshotStale,
  OWNLY_TRIP_SNAPSHOT_KIND,
  parseTripSnapshot,
  snapshotAgeHours,
  tripSnapshotFileName,
} from './trip-snapshot';
import { OWNLY_TRIP_BUNDLE_KIND } from './trip-bundle';
import type {
  PlannerTrip,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseItem,
} from './planner';
import type { PlannerTripVisit } from './planner-visits';

function trip(): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: 'Bangkok Week',
    status: 'active',
    start_date: '2026-10-05',
    end_date: '2026-10-13',
    destinations: ['Bangkok'],
    currency: 'CNY',
    members: ['me', 'partner'],
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

function place(id: string, title: string): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title,
    source_provider: 'google_maps',
    source_url: 'https://maps.example/x',
    kind: 'attraction',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-09-01T00:00:00.000Z',
  } as PlannerTripPlace;
}

function visit(id: string, placeId: string, date: string, order: number): PlannerTripVisit {
  return {
    schema_version: '0.1',
    type: 'trip_visit',
    id,
    trip_id: 'trip-1',
    place_id: placeId,
    date,
    sort_order: order,
    locked: false,
    is_anchor: false,
    created_at: '2026-09-01T00:00:00.000Z',
  } as PlannerTripVisit;
}

function expense(): TripExpenseItem {
  return {
    schema_version: '0.1',
    type: 'trip_expense',
    id: 'exp-1',
    trip_id: 'trip-1',
    title: 'Hotel',
    category: 'stay',
    amount: 500,
    currency: 'CNY',
    paid_by: 'me',
    split_members: [],
    created_at: '2026-10-06T00:00:00.000Z',
  } as TripExpenseItem;
}

describe('trip snapshot bundle (WS-3)', () => {
  it('round-trips the five entity types and strips members', () => {
    const created = createTripSnapshot(
      trip(),
      [place('p1', 'Grand Palace'), place('p2', 'Night Market')],
      [visit('v1', 'p1', '2026-10-05', 0)],
      [
        {
          schema_version: '0.1',
          type: 'trip_leg',
          id: 'l1',
          trip_id: 'trip-1',
          from_place_id: 'p1',
          to_place_id: 'p2',
          mode: 'transit',
          duration_minutes: 20,
          source: 'manual',
          created_at: '2026-09-01T00:00:00.000Z',
        } as PlannerTripLeg,
      ],
      [expense()],
      { includeExpenses: true, exportedAt: '2026-10-01T00:00:00.000Z' },
    );
    expect(created.kind).toBe(OWNLY_TRIP_SNAPSHOT_KIND);
    expect(created.privacy.expenses).toBe('included');
    expect(created.trip.members).toBeUndefined();

    const parsed = parseTripSnapshot(JSON.stringify(created));
    expect(parsed.trip.title).toBe('Bangkok Week');
    expect(parsed.places).toHaveLength(2);
    expect(parsed.visits).toHaveLength(1);
    expect(parsed.expenses).toHaveLength(1);
  });

  it('excludes expenses by default (explicit consent required)', () => {
    const created = createTripSnapshot(trip(), [], [], [], [expense()], {});
    expect(created.privacy.expenses).toBe('excluded');
    expect(created.expenses).toEqual([]);
    expect(parseTripSnapshot(JSON.stringify(created)).expenses).toEqual([]);
  });

  it('rejects share bundles with a directing error, not a silent misparse', () => {
    const shareBundle = {
      kind: OWNLY_TRIP_BUNDLE_KIND,
      version: 1,
      exported_at: '2026-09-02T00:00:00.000Z',
      privacy: { expenses: 'excluded', members: 'excluded', calendar_feed: 'excluded' },
      trip: { ...trip(), members: undefined },
      places: [],
      visits: [],
      legs: [],
    };
    expect(() => parseTripSnapshot(JSON.stringify(shareBundle))).toThrow(/分享 Bundle/);
  });

  it('rejects unknown versions and garbage', () => {
    expect(() => parseTripSnapshot(JSON.stringify({ kind: OWNLY_TRIP_SNAPSHOT_KIND, version: 999 }))).toThrow(
      /不支持/,
    );
    expect(() => parseTripSnapshot('not json')).toThrow(/有效的/);
  });

  it('uses a distinct filename so the two bundles never collide on disk', () => {
    expect(tripSnapshotFileName('Bangkok Week')).toBe('Bangkok-Week.ownly-trip-snapshot.json');
  });
});

describe('snapshot staleness (WS-3)', () => {
  const now = new Date('2026-10-10T00:00:00.000Z');
  it('flags snapshots older than 24h', () => {
    expect(isSnapshotStale('2026-10-09T00:00:00.000Z', now)).toBe(false);
    expect(isSnapshotStale('2026-10-08T00:00:00.000Z', now)).toBe(true);
    expect(snapshotAgeHours('2026-10-09T00:00:00.000Z', now)).toBe(24);
    expect(snapshotAgeHours('garbage', now)).toBeNull();
  });
});

describe('buildSnapshotView (WS-3)', () => {
  it('groups stops by date in order and lists unvisited places as the pool', () => {
    const snapshot = createTripSnapshot(
      trip(),
      [place('p1', 'Grand Palace'), place('p2', 'Night Market'), place('p3', 'Hidden Cafe')],
      [visit('v2', 'p2', '2026-10-06', 0), visit('v1', 'p1', '2026-10-05', 0)],
      [],
      [],
      {},
    );
    const view = buildSnapshotView(snapshot);
    expect(view.days.map((day) => day.date)).toEqual(['2026-10-05', '2026-10-06']);
    expect(view.days[0].stops.map((stop) => stop.title)).toEqual(['Grand Palace']);
    expect(view.pool.map((place) => place.title)).toEqual(['Hidden Cafe']);
  });
});
