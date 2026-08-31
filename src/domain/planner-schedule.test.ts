import { describe, expect, it } from 'vitest';
import { plannerTripLegId, type PlannerTrip, type PlannerTripLeg, type PlannerTripPlace } from './planner';
import { materializePlannerScheduledPlaces, type PlannerTripVisit } from './planner-visits';
import {
  buildPlannerDayExecutionTimeline,
  evaluatePlannerDay,
  evaluatePlannerDayFeasibility,
  evaluatePlannerScheduleProposal,
  findPlannerTimeOverlaps,
  getScheduledEndTime,
  validatePlannerTiming,
  type PlannerTimelineStopItem,
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
      { visit_id: 'visit:hotel:pm', place_id: hotel.id, date: '2026-10-05', start: '22:00', sort_order: 1, duration_minutes: 15 },
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

  it('enforces contiguous 0..N-1 daily sort_order sequence', () => {
    const a = place('a');
    const b = place('b');
    const resultGap = evaluatePlannerScheduleProposal(trip, [a, b], [], [
      { visit_id: 'v:a', place_id: 'a', date: '2026-10-05', sort_order: 0 },
      { visit_id: 'v:b', place_id: 'b', date: '2026-10-05', sort_order: 2 },
    ]);
    expect(resultGap.valid).toBe(false);
    expect(resultGap.issues.some((issue) => issue.code === 'DISCONTINUOUS_SORT_ORDER')).toBe(true);

    const resultDup = evaluatePlannerScheduleProposal(trip, [a, b], [], [
      { visit_id: 'v:a', place_id: 'a', date: '2026-10-05', sort_order: 0 },
      { visit_id: 'v:b', place_id: 'b', date: '2026-10-05', sort_order: 0 },
    ]);
    expect(resultDup.valid).toBe(false);
    expect(resultDup.issues.some((issue) => issue.code === 'DISCONTINUOUS_SORT_ORDER')).toBe(true);

    const resultValid = evaluatePlannerScheduleProposal(trip, [a, b], [], [
      { visit_id: 'v:a', place_id: 'a', date: '2026-10-05', sort_order: 0 },
      { visit_id: 'v:b', place_id: 'b', date: '2026-10-05', sort_order: 1 },
    ]);
    expect(resultValid.valid).toBe(true);
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

  it('correctly correlates repeated visits of the same place to distinct timeline stops', () => {
    const cafe = place('cafe-1');
    const visits = [
      visit('visit:morning', 'cafe-1', { start: '08:30', duration_minutes: 30, sort_order: 0 }),
      visit('visit:afternoon', 'cafe-1', { start: '15:00', duration_minutes: 45, sort_order: 1 }),
    ];
    const scheduledPlaces = scheduled([cafe], visits);
    const timeline = buildPlannerDayExecutionTimeline(trip, scheduledPlaces, [], '2026-10-05');

    const morningStop = timeline.items.find(
      (item): item is PlannerTimelineStopItem => item.type === 'stop' && item.visit_id === scheduledPlaces[0].visit_id,
    );
    const afternoonStop = timeline.items.find(
      (item): item is PlannerTimelineStopItem => item.type === 'stop' && item.visit_id === scheduledPlaces[1].visit_id,
    );

    expect(morningStop?.start).toBe('08:30');
    expect(morningStop?.end).toBe('09:00');
    expect(afternoonStop?.start).toBe('15:00');
    expect(afternoonStop?.end).toBe('15:45');
  });
});

describe('evaluatePlannerDay canonical assessment', () => {
  it('returns feasible when stops, travel legs, and hours are clean', () => {
    const places = [
      place('wat-arun', { open_hours: '08:00 - 18:00', duration_minutes: 60 }),
      place('wat-pho', { open_hours: '08:00 - 18:30', duration_minutes: 90 }),
    ];
    const visits = [
      visit('v:arun', 'wat-arun', { start: '09:00', duration_minutes: 60, sort_order: 0 }),
      visit('v:pho', 'wat-pho', { start: '10:30', duration_minutes: 90, sort_order: 1 }),
    ];
    const legs = [travelLeg('wat-arun', 'wat-pho', 15)];
    const assessment = evaluatePlannerDay(trip, scheduled(places, visits), legs, '2026-10-05');

    expect(assessment.status).toBe('feasible');
    expect(assessment.time_overlaps).toHaveLength(0);
    expect(assessment.travel_conflicts).toHaveLength(0);
    expect(assessment.opening_hours_warnings).toHaveLength(0);
    expect(assessment.missing_facts).toHaveLength(0);
    expect(assessment.is_overloaded).toBe(false);
    expect(assessment.total_activity_minutes).toBe(150);
  });

  it('detects time overlaps and marks day as conflict', () => {
    const places = [place('a', { duration_minutes: 90 }), place('b', { duration_minutes: 60 })];
    const visits = [
      visit('v:a', 'a', { start: '09:00', duration_minutes: 90, sort_order: 0 }),
      visit('v:b', 'b', { start: '09:30', duration_minutes: 60, sort_order: 1 }),
    ];
    const assessment = evaluatePlannerDay(trip, scheduled(places, visits), [], '2026-10-05');

    expect(assessment.status).toBe('conflict');
    expect(assessment.time_overlaps.length).toBeGreaterThan(0);
  });

  it('detects travel arrival late conflicts and marks day as conflict', () => {
    const places = [place('a', { duration_minutes: 60 }), place('b', { duration_minutes: 60 })];
    const visits = [
      visit('v:a', 'a', { start: '09:00', duration_minutes: 60, sort_order: 0 }),
      visit('v:b', 'b', { start: '10:10', duration_minutes: 60, sort_order: 1 }),
    ];
    // Leg is 30 mins, departure is 10:00, arrival is 10:30 -> late by 20 mins for 10:10
    const legs = [travelLeg('a', 'b', 30)];
    const assessment = evaluatePlannerDay(trip, scheduled(places, visits), legs, '2026-10-05');

    expect(assessment.status).toBe('conflict');
    expect(assessment.travel_conflicts).toHaveLength(1);
    expect(assessment.travel_conflicts[0].late_by_minutes).toBe(20);
  });

  it('marks day as warning when opening hours have collision or day is overloaded', () => {
    // 2026-10-05 is a Monday
    const places = [
      place('museum', { open_hours: 'Monday: Closed; Tue-Sun 09:00-17:00', duration_minutes: 120 }),
    ];
    const visits = [
      visit('v:museum', 'museum', { start: '10:00', duration_minutes: 120, sort_order: 0 }),
    ];
    const assessment = evaluatePlannerDay(trip, scheduled(places, visits), [], '2026-10-05');

    expect(assessment.status).toBe('warning');
    expect(assessment.opening_hours_warnings).toHaveLength(1);
    expect(assessment.opening_hours_warnings[0].reason).toContain('Closed');
  });

  it('marks day as unknown when transit leg is missing', () => {
    const places = [place('a', { duration_minutes: 60 }), place('b', { duration_minutes: 60 })];
    const visits = [
      visit('v:a', 'a', { start: '09:00', duration_minutes: 60, sort_order: 0 }),
      visit('v:b', 'b', { start: '11:00', duration_minutes: 60, sort_order: 1 }),
    ];
    const assessment = evaluatePlannerDay(trip, scheduled(places, visits), [], '2026-10-05');

    expect(assessment.status).toBe('unknown');
    expect(assessment.missing_facts.some((f) => f.reason === 'travel_time_missing')).toBe(true);
  });
});
