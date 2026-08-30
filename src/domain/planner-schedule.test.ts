import { describe, expect, it } from 'vitest';
import { plannerTripLegId, type PlannerTrip, type PlannerTripLeg, type PlannerTripPlace } from './planner';
import { materializePlannerScheduledPlaces, type PlannerTripVisit } from './planner-visits';
import {
  buildPlannerDayExecutionTimeline,
  evaluatePlannerDayFeasibility,
  evaluatePlannerScheduleProposal,
  findPlannerTimeOverlaps,
  getScheduledEndTime,
  validatePlannerTiming,
} from './planner-schedule';

const trip: PlannerTrip = {
  schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Bangkok', status: 'planning',
  start_date: '2026-10-05', end_date: '2026-10-07', destinations: ['Bangkok'], created_at: '2026-08-29T00:00:00Z',
};

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: trip.id, title: id,
    source_provider: 'google_maps', source_url: `https://maps.google.com/${id}`, kind: 'attraction',
    tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate',
    created_at: '2026-08-29T00:00:00Z', ...overrides,
  };
}

function visit(id: string, placeId: string, overrides: Partial<PlannerTripVisit> = {}): PlannerTripVisit {
  return {
    schema_version: '0.1', type: 'trip_visit', id, trip_id: trip.id, place_id: placeId,
    date: '2026-10-05', sort_order: 0, locked: false, is_anchor: false,
    created_at: '2026-08-29T00:00:00Z', ...overrides,
  };
}

function scheduled(places: PlannerTripPlace[], visits: PlannerTripVisit[]) {
  return materializePlannerScheduledPlaces(places, visits);
}

function travelLeg(from: string, to: string, minutes: number): PlannerTripLeg {
  return {
    schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(trip.id, from, to), trip_id: trip.id,
    from_place_id: from, to_place_id: to, mode: 'walking', duration_minutes: minutes,
    distance_meters: 1200, source: 'manual', created_at: '2026-08-29T00:00:00Z',
  };
}

describe('Planner schedule proposal', () => {
  it('creates an explicit visit without consuming or locking the reusable place', () => {
    const p = place('wat-pho', { duration_minutes: 90 });
    const result = evaluatePlannerScheduleProposal(trip, [p], [], [{
      visit_id: 'visit:wat-pho:1', place_id: p.id, date: '2026-10-05', start: '09:30', sort_order: 0,
    }]);
    expect(result.valid).toBe(true);
    expect(result.visits[0]).toMatchObject({ place_id: p.id, date: '2026-10-05', start: '09:30', duration_minutes: 90, locked: false });
    expect(p.state).toBe('candidate');
  });

  it('allows the same reusable place to appear multiple times', () => {
    const hotel = place('hotel', { kind: 'stay' });
    const result = evaluatePlannerScheduleProposal(trip, [hotel], [], [
      { visit_id: 'visit:hotel:am', place_id: hotel.id, date: '2026-10-05', start: '08:00', sort_order: 0, duration_minutes: 15 },
      { visit_id: 'visit:hotel:pm', place_id: hotel.id, date: '2026-10-05', start: '22:00', sort_order: 3, duration_minutes: 15 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.visits.map((item) => item.place_id)).toEqual(['hotel', 'hotel']);
  });

  it('rejects moving a locked or anchored visit', () => {
    const concert = place('concert');
    const locked = visit('visit:concert', concert.id, {
      start: '19:30', duration_minutes: 150, sort_order: 3, locked: true, is_anchor: true, anchor_type: 'reservation',
    });
    const result = evaluatePlannerScheduleProposal(trip, [concert], [locked], [{
      visit_id: locked.id, place_id: concert.id, date: '2026-10-06', start: '20:00', sort_order: 0, duration_minutes: 150,
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'HARD_CONSTRAINT_CHANGED')).toBe(true);
  });

  it('rejects deterministic overlap between visit occurrences', () => {
    const a = place('a');
    const b = place('b');
    const existing = visit('visit:a', a.id, { start: '09:00', duration_minutes: 120 });
    const result = evaluatePlannerScheduleProposal(trip, [a, b], [existing], [{
      visit_id: 'visit:b', place_id: b.id, date: '2026-10-05', start: '10:00', sort_order: 1, duration_minutes: 60,
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'TIME_OVERLAP')).toBe(true);
  });

  it('validates a proposed start against the place default duration', () => {
    const late = place('late-stop', { duration_minutes: 90 });
    const result = evaluatePlannerScheduleProposal(trip, [late], [], [{
      visit_id: 'visit:late', place_id: late.id, date: '2026-10-05', start: '23:00', sort_order: 0,
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'CROSSES_MIDNIGHT')).toBe(true);
  });

  it('detects nested overlaps by visit id', () => {
    const places = [place('a'), place('b'), place('c')];
    const visits = [
      visit('visit:a', 'a', { start: '09:00', duration_minutes: 180, sort_order: 0 }),
      visit('visit:b', 'b', { start: '10:00', duration_minutes: 30, sort_order: 1 }),
      visit('visit:c', 'c', { start: '11:00', duration_minutes: 30, sort_order: 2 }),
    ];
    const overlaps = findPlannerTimeOverlaps(scheduled(places, visits), '2026-10-05');
    expect(overlaps.map((item) => [item.fromId, item.toId])).toEqual([
      ['visit:a', 'visit:b'],
      ['visit:a', 'visit:c'],
    ]);
  });

  it('uses one validation contract for manual and MCP time facts', () => {
    expect(validatePlannerTiming('24:00', 60).some((issue) => issue.code === 'INVALID_START_TIME')).toBe(true);
    expect(validatePlannerTiming('09:00', 1441).some((issue) => issue.code === 'INVALID_DURATION')).toBe(true);
    expect(validatePlannerTiming('23:30', 60).some((issue) => issue.code === 'CROSSES_MIDNIGHT')).toBe(true);
    expect(validatePlannerTiming('23:30', 60, { allowCrossMidnight: true })).toEqual([]);
  });

  it('evaluates travel legs by canonical place pair while visits keep occurrence identity', () => {
    const places = [place('a'), place('b'), place('c')];
    const visits = [
      visit('visit:a', 'a', { start: '09:00', duration_minutes: 90, sort_order: 0 }),
      visit('visit:b', 'b', { start: '11:00', duration_minutes: 60, sort_order: 1 }),
      visit('visit:c', 'c', { start: '12:00', duration_minutes: 60, sort_order: 2 }),
    ];
    const result = evaluatePlannerDayFeasibility(trip, scheduled(places, visits), [travelLeg('a', 'b', 20)], '2026-10-05');
    expect(result.status).toBe('unknown');
    expect(result.transitions[0]).toMatchObject({ from_id: 'visit:a', to_id: 'visit:b', status: 'ok', earliest_arrival: '10:50', slack_minutes: 10 });
    expect(result.transitions[1]).toMatchObject({ status: 'unknown', unknown_reason: 'travel_time_missing' });
  });

  it('derives end time instead of persisting a second authority', () => {
    expect(getScheduledEndTime('23:00', 60)).toBe('00:00');
    expect(getScheduledEndTime(undefined, 60)).toBeNull();
    expect(getScheduledEndTime('09:00', undefined)).toBeNull();
  });
});

describe('Planner execution timeline', () => {
  it('projects stop, travel and slack from Visit occurrences', () => {
    const places = [place('a'), place('b')];
    const visits = [
      visit('visit:a', 'a', { start: '09:00', duration_minutes: 90, sort_order: 0 }),
      visit('visit:b', 'b', { start: '11:00', duration_minutes: 60, sort_order: 1 }),
    ];
    const result = buildPlannerDayExecutionTimeline(trip, scheduled(places, visits), [travelLeg('a', 'b', 18)], '2026-10-05');
    expect(result.status).toBe('feasible');
    expect(result.items.map((item) => item.type)).toEqual(['stop', 'travel', 'gap', 'stop']);
    expect(result.items[0]).toMatchObject({ type: 'stop', visit_id: 'visit:a', place_id: 'a', start: '09:00', end: '10:30' });
    expect(result.items[1]).toMatchObject({ type: 'travel', from_id: 'visit:a', to_id: 'visit:b', start: '10:30', end: '10:48' });
  });

  it('keeps a missing travel fact explicitly unknown', () => {
    const places = [place('a'), place('b')];
    const visits = [
      visit('visit:a', 'a', { start: '09:00', duration_minutes: 90, sort_order: 0 }),
      visit('visit:b', 'b', { start: '11:00', duration_minutes: 60, sort_order: 1 }),
    ];
    const result = buildPlannerDayExecutionTimeline(trip, scheduled(places, visits), [], '2026-10-05');
    expect(result.status).toBe('unknown');
    expect(result.items.map((item) => item.type)).toEqual(['stop', 'unknown', 'stop']);
  });
});
