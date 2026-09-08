import { describe, expect, it } from 'vitest';
import {
  buildTripReviewDraft,
  buildTripReviewStats,
  isTripReviewable,
} from './trip-review';
import type {
  PlannerTrip,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseItem,
} from './planner';
import type { PlannerTripVisit } from './planner-visits';

function trip(overrides: Partial<PlannerTrip> = {}): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: 'Bangkok Week',
    status: 'completed',
    start_date: '2026-10-05',
    end_date: '2026-10-13',
    destinations: ['Bangkok', 'Chiang Mai'],
    currency: 'CNY',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function place(overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'place-1',
    trip_id: 'trip-1',
    title: 'Grand Palace',
    source_provider: 'google_maps',
    source_url: 'https://maps.example/1',
    kind: 'attraction',
    tags: [],
    signals: [],
    risks: [],
    state: 'candidate',
    ...overrides,
  } as PlannerTripPlace;
}

function expense(overrides: Partial<TripExpenseItem> = {}): TripExpenseItem {
  return {
    id: 'exp-1',
    trip_id: 'trip-1',
    title: 'Hotel',
    category: 'stay',
    amount: 100,
    currency: 'CNY',
    paid_by: 'me',
    split_members: [],
    created_at: '2026-10-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildTripReviewStats (WS-1)', () => {
  it('aggregates visits, mode mix, converted totals, top spend, and top rating', () => {
    const stats = buildTripReviewStats(
      trip({ fx_rates: { THB: 0.2 } }),
      [
        place({ id: 'p1', observed_rating: 4.5 }),
        place({ id: 'p2', title: 'Night Market', observed_rating: 4.9 }),
      ],
      [{ id: 'v1', trip_id: 'trip-1' } as PlannerTripVisit],
      [
        { id: 'l1', trip_id: 'trip-1', mode: 'transit' } as PlannerTripLeg,
        { id: 'l2', trip_id: 'trip-1', mode: 'transit' } as PlannerTripLeg,
        { id: 'l3', trip_id: 'trip-1', mode: 'walking' } as PlannerTripLeg,
      ],
      [
        expense({ id: 'e1', title: 'Hotel', amount: 500, currency: 'CNY' }),
        expense({ id: 'e2', title: 'Pad Thai', amount: 300, currency: 'THB' }),
        expense({ id: 'e3', title: 'Taxi', amount: 100, currency: 'THB' }),
      ],
    );
    expect(stats.placeCount).toBe(2);
    expect(stats.visitCount).toBe(1);
    expect(stats.modeMix).toEqual([
      { mode: 'transit', count: 2 },
      { mode: 'walking', count: 1 },
    ]);
    // 500 CNY + (300 + 100) THB @ 0.2 = 580 CNY.
    expect(stats.expenseTotal).toBe(580);
    expect(stats.expenseCurrency).toBe('CNY');
    expect(stats.topExpenses[0]).toMatchObject({ title: 'Hotel', converted: 500 });
    expect(stats.topRatedPlace).toEqual({ title: 'Night Market', rating: 4.9 });
    expect(stats.unconvertible).toEqual([]);
  });

  it('isolates unconvertible currencies instead of fabricating a total', () => {
    const stats = buildTripReviewStats(
      trip(),
      [place()],
      [],
      [],
      [expense({ currency: 'XYZ', amount: 42 })],
    );
    expect(stats.expenseTotal).toBeNull();
    expect(stats.unconvertible).toEqual([{ currency: 'XYZ', amount: 42 }]);
  });

  it('ignores dropped places and foreign-trip entities', () => {
    const stats = buildTripReviewStats(
      trip(),
      [
        place({ id: 'p1' }),
        place({ id: 'p2', state: 'dropped' } as Partial<PlannerTripPlace>),
        place({ id: 'p3', trip_id: 'trip-2' }),
      ],
      [],
      [],
      [],
    );
    expect(stats.placeCount).toBe(1);
    expect(stats.expenseTotal).toBeNull();
  });
});

describe('buildTripReviewDraft (WS-1)', () => {
  it('builds a travel_worldview object that travel stats consume', () => {
    const t = trip();
    const stats = buildTripReviewStats(t, [place()], [], [], [
      expense({ amount: 200, currency: 'CNY' }),
    ]);
    const { object, body } = buildTripReviewDraft(t, stats, {
      language: 'zh',
      now: new Date('2026-10-20T00:00:00.000Z'),
      idFactory: () => 'obj_fixed',
    });
    expect(object.object_type).toBe('one_time_experience');
    expect(object.status).toBe('completed');
    expect(object.experience_subtype).toBe('travel_worldview');
    expect(object.started_at).toBe('2026-10-05');
    expect(object.ended_at).toBe('2026-10-13');
    expect(object.actual_total).toBe(200);
    expect(object.budget_total).toBeUndefined();
    expect(object.location).toEqual({ city: 'Bangkok' });
    expect(object.locations).toEqual([{ city: 'Bangkok' }, { city: 'Chiang Mai' }]);
    expect(object.review_ref).toBeUndefined();
    expect(body).toContain('到访地点 1 个');
    expect(body).toContain('实际总花费 CNY 200');
  });

  it('leaves actual_total empty and says so when nothing was recorded', () => {
    const t = trip();
    const stats = buildTripReviewStats(t, [], [], [], []);
    const { object, body } = buildTripReviewDraft(t, stats, { language: 'en' });
    expect(object.actual_total).toBeUndefined();
    expect(body).toContain('No expenses recorded');
  });
});

describe('isTripReviewable (WS-1)', () => {
  it('opens for ended or manually completed trips only', () => {
    expect(isTripReviewable(trip({ status: 'active', end_date: '2026-01-01' }), '2026-09-08')).toBe(true);
    expect(isTripReviewable(trip({ status: 'completed', end_date: '2026-12-31' }), '2026-09-08')).toBe(true);
    expect(isTripReviewable(trip({ status: 'active', end_date: '2026-12-31' }), '2026-09-08')).toBe(false);
    expect(isTripReviewable(trip({ status: 'planning', end_date: '2026-12-31' }), '2026-09-08')).toBe(false);
  });
});
