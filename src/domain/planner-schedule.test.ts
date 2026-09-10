import { describe, expect, it } from 'vitest';
import { plannerTripLegId, type PlannerTrip, type PlannerTripLeg, type PlannerTripPlace } from './planner';
import { materializePlannerScheduledPlaces, type PlannerTripVisit } from './planner-visits';
import {
  buildPlannerDayExecutionTimeline,
  calculateDayLoad,
  calculateEffectiveDayTiming,
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

  it('grandfathers an unchanged locked visit without re-validating its timing', () => {
    const late = place('late-stop');
    const locked = visit('visit:late', late.id, {
      start: '23:30', duration_minutes: 60, sort_order: 0, locked: true,
    });
    const result = evaluatePlannerScheduleProposal(trip, [late], [locked], [{
      visit_id: locked.id, place_id: late.id, date: '2026-10-05', start: '23:30', sort_order: 0, duration_minutes: 60,
    }]);
    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'CROSSES_MIDNIGHT')).toBe(false);
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

  it('marks corrupt leg durations unknown instead of a bogus ok', () => {
    const places = [place('a'), place('b')];
    const visits = [
      visit('visit:a', 'a', { start: '09:00', duration_minutes: 90, sort_order: 0 }),
      visit('visit:b', 'b', { start: '11:00', duration_minutes: 60, sort_order: 1 }),
    ];
    const badLeg = { ...travelLeg('a', 'b', 20), duration_minutes: Number.NaN };
    const result = evaluatePlannerDayFeasibility(trip, scheduled(places, visits), [badLeg], '2026-10-05');
    expect(result.transitions[0]).toMatchObject({ status: 'unknown', unknown_reason: 'travel_time_missing' });
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

  it('skips road travel calculation on timeline between two transit hubs (intercity ticketed)', () => {
    const bkkAirport = place('bkk-airport', { title: 'Suvarnabhumi Airport (BKK)', kind: 'transit', duration_minutes: 120 });
    const cnxAirport = place('cnx-airport', { title: 'Chiang Mai International Airport (CNX)', kind: 'transit', duration_minutes: 60 });
    const places = [bkkAirport, cnxAirport];
    const visits = [
      visit('v:bkk', 'bkk-airport', { start: '08:00', duration_minutes: 120, sort_order: 0 }),
      visit('v:cnx', 'cnx-airport', { start: '12:00', duration_minutes: 60, sort_order: 1 }),
    ];

    const timeline = buildPlannerDayExecutionTimeline(trip, scheduled(places, visits), [], '2026-10-05');
    // Only two stop items, no road travel items or travel_time_missing unknown items
    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0].type).toBe('stop');
    expect(timeline.items[1].type).toBe('stop');

    const assessment = evaluatePlannerDay(trip, scheduled(places, visits), [], '2026-10-05');
    expect(assessment.missing_facts.some((f) => f.reason === 'travel_time_missing')).toBe(false);
  });

  it('supports cleared commute estimate (duration_minutes: 0) without flagging travel_time_missing', () => {
    const places = [place('cafe-a', { duration_minutes: 45 }), place('cafe-b', { duration_minutes: 60 })];
    const visits = [
      visit('v:ca', 'cafe-a', { start: '10:00', duration_minutes: 45, sort_order: 0 }),
      visit('v:cb', 'cafe-b', { start: '11:00', duration_minutes: 60, sort_order: 1 }),
    ];
    // Cleared leg with 0 duration minutes
    const clearedLeg = travelLeg('cafe-a', 'cafe-b', 0);
    const assessment = evaluatePlannerDay(trip, scheduled(places, visits), [clearedLeg], '2026-10-05');
    expect(assessment.status).toBe('feasible');
    expect(assessment.missing_facts).toHaveLength(0);

    const timeline = buildPlannerDayExecutionTimeline(trip, scheduled(places, visits), [clearedLeg], '2026-10-05');
    const travelItem = timeline.items.find((item) => item.type === 'travel');
    expect(travelItem).toBeDefined();
    expect(travelItem?.duration_minutes).toBe(0);
  });

  it('chains inferred default times across successive stops and allows manual overrides', () => {
    const places = [
      place('wat-arun', { duration_minutes: 60 }),
      place('wat-pho', { duration_minutes: 90 }),
      place('grand-palace', { duration_minutes: 60 }),
      place('dinner', { duration_minutes: 90 }),
    ];
    // Wat Arun has manual start 09:00 -> ends at 10:00
    // Wat Pho has no start -> inferred 10:00 + 15m leg = 10:15 -> ends at 11:45
    // Grand Palace has no start -> inferred 11:45 + 15m leg = 12:00 -> ends at 13:00
    // Dinner has explicit manual start 18:00 (manual override!) -> ends at 19:30
    const visits = [
      visit('v:arun', 'wat-arun', { start: '09:00', duration_minutes: 60, sort_order: 0 }),
      visit('v:pho', 'wat-pho', { duration_minutes: 90, sort_order: 1 }),
      visit('v:palace', 'grand-palace', { duration_minutes: 60, sort_order: 2 }),
      visit('v:dinner', 'dinner', { start: '18:00', duration_minutes: 90, sort_order: 3 }),
    ];
    const legs = [
      travelLeg('wat-arun', 'wat-pho', 15),
      travelLeg('wat-pho', 'grand-palace', 15),
      travelLeg('grand-palace', 'dinner', 30),
    ];

    const scheduledPlaces = scheduled(places, visits);
    const timingMap = calculateEffectiveDayTiming(scheduledPlaces, legs, trip.id);

    const arunTiming = timingMap.get(scheduledPlaces[0].id);
    expect(arunTiming?.start).toBe('09:00');
    expect(arunTiming?.end).toBe('10:00');
    expect(arunTiming?.is_inferred_start).toBe(false);

    const phoTiming = timingMap.get(scheduledPlaces[1].id);
    expect(phoTiming?.start).toBe('10:15');
    expect(phoTiming?.end).toBe('11:45');
    expect(phoTiming?.is_inferred_start).toBe(true);

    const palaceTiming = timingMap.get(scheduledPlaces[2].id);
    expect(palaceTiming?.start).toBe('12:00');
    expect(palaceTiming?.end).toBe('13:00');
    expect(palaceTiming?.is_inferred_start).toBe(true);

    const dinnerTiming = timingMap.get(scheduledPlaces[3].id);
    expect(dinnerTiming?.start).toBe('18:00');
    expect(dinnerTiming?.end).toBe('19:30');
    expect(dinnerTiming?.is_inferred_start).toBe(false);
    expect(dinnerTiming?.inferred_start).toBe('13:30'); // Palace end 13:00 + 30m leg = 13:30

    // Build timeline and verify stop items
    const timeline = buildPlannerDayExecutionTimeline(trip, scheduledPlaces, legs, '2026-10-05');
    expect(timeline.status).toBe('feasible');

    const stops = timeline.items.filter((item): item is PlannerTimelineStopItem => item.type === 'stop');
    expect(stops).toHaveLength(4);
    expect(stops[0]).toMatchObject({ visit_id: 'v:arun', start: '09:00', end: '10:00', is_inferred_start: false });
    expect(stops[1]).toMatchObject({ visit_id: 'v:pho', start: '10:15', end: '11:45', is_inferred_start: true });
    expect(stops[2]).toMatchObject({ visit_id: 'v:palace', start: '12:00', end: '13:00', is_inferred_start: true });
    expect(stops[3]).toMatchObject({ visit_id: 'v:dinner', start: '18:00', end: '19:30', is_inferred_start: false, inferred_start: '13:30' });

    // Verify afternoon gap exists between Grand Palace (13:00 + 30m = 13:30) and Dinner (18:00)
    const gap = timeline.items.find((item) => item.type === 'gap');
    expect(gap).toBeDefined();
    expect(gap).toMatchObject({ start: '13:30', end: '18:00', duration_minutes: 270 });
  });
});

describe('Day seed and backward inference', () => {
  it('seeds a fully untimed day at 09:00 and chains forward', () => {
    const places = [
      place('hotel', { duration_minutes: 30 }),
      place('temple', { duration_minutes: 60 }),
    ];
    const visits = [
      visit('v:hotel', 'hotel', { sort_order: 0 }),
      visit('v:temple', 'temple', { sort_order: 1 }),
    ];
    const legs = [travelLeg('hotel', 'temple', 20)];
    const list = scheduled(places, visits);
    const timingMap = calculateEffectiveDayTiming(list, legs, trip.id);

    const first = timingMap.get(list[0].id);
    expect(first?.start).toBe('09:00');
    expect(first?.end).toBe('09:30');
    expect(first?.is_inferred_start).toBe(true);

    const second = timingMap.get(list[1].id);
    expect(second?.start).toBe('09:50');
    expect(second?.is_inferred_start).toBe(true);
  });

  it('pulls earlier untimed stops backward from a fixed dinner', () => {
    const places = [
      place('market', { duration_minutes: 60 }),
      place('massage', { duration_minutes: 90 }),
      place('dinner', { duration_minutes: 60 }),
    ];
    const visits = [
      visit('v:market', 'market', { sort_order: 0 }),
      visit('v:massage', 'massage', { sort_order: 1 }),
      visit('v:dinner', 'dinner', { start: '18:00', duration_minutes: 60, sort_order: 2 }),
    ];
    const legs = [
      travelLeg('market', 'massage', 15),
      travelLeg('massage', 'dinner', 20),
    ];
    const list = scheduled(places, visits);
    const timingMap = calculateEffectiveDayTiming(list, legs, trip.id);

    // massage: 18:00 − 20m leg − 90m = 16:10; market: 16:10 − 15m − 60m = 14:55.
    const massage = timingMap.get(list[1].id);
    expect(massage?.start).toBe('16:10');
    expect(massage?.end).toBe('17:40');
    expect(massage?.is_inferred_start).toBe(true);

    const market = timingMap.get(list[0].id);
    expect(market?.start).toBe('14:55');
    expect(market?.is_inferred_start).toBe(true);
  });

  it('leaves pre-midnight stops unknown instead of wrapping', () => {
    const places = [
      place('bar', { duration_minutes: 120 }),
      place('red-eye', { duration_minutes: 60 }),
    ];
    const visits = [
      visit('v:bar', 'bar', { sort_order: 0 }),
      visit('v:redeye', 'red-eye', { start: '00:30', duration_minutes: 60, sort_order: 1 }),
    ];
    const legs = [travelLeg('bar', 'red-eye', 30)];
    const list = scheduled(places, visits);
    const timingMap = calculateEffectiveDayTiming(list, legs, trip.id);

    // 00:30 − 30m − 120m < 00:00 → stays unknown, no wrap.
    expect(timingMap.get(list[0].id)?.start).toBeUndefined();
  });

  it('never overrides a manual start from either direction', () => {
    const places = [
      place('a', { duration_minutes: 60 }),
      place('b', { duration_minutes: 60 }),
    ];
    const visits = [
      visit('v:a', 'a', { start: '10:00', duration_minutes: 60, sort_order: 0 }),
      visit('v:b', 'b', { start: '15:00', duration_minutes: 60, sort_order: 1 }),
    ];
    const legs = [travelLeg('a', 'b', 15)];
    const list = scheduled(places, visits);
    const timingMap = calculateEffectiveDayTiming(list, legs, trip.id);

    expect(timingMap.get(list[0].id)).toMatchObject({ start: '10:00', is_inferred_start: false });
    expect(timingMap.get(list[1].id)).toMatchObject({ start: '15:00', is_inferred_start: false });
  });
});

describe('calculateDayLoad', () => {
  it('scores a light morning as easy without meal warnings', () => {
    const places = [
      place('a', { duration_minutes: 60 }),
      place('b', { duration_minutes: 90 }),
    ];
    const visits = [
      visit('v:a', 'a', { start: '09:00', duration_minutes: 60, sort_order: 0 }),
      visit('v:b', 'b', { start: '10:30', duration_minutes: 90, sort_order: 1 }),
    ];
    const legs = [travelLeg('a', 'b', 15)];
    const list = scheduled(places, visits);
    const timeline = buildPlannerDayExecutionTimeline(trip, list, legs, '2026-10-05');
    const load = calculateDayLoad(list, legs, trip.id, timeline);

    expect(load.level).toBe('easy');
    expect(load.score).toBeLessThan(35);
    expect(load.activity_minutes).toBe(150);
    expect(load.transit_minutes).toBe(15);
    expect(load.stop_count).toBe(2);
    expect(load.lunch_ok).toBe(true);
    expect(load.dinner_ok).toBe(true);
    expect(load.suggestion).toBeNull();
  });

  it('flags a packed full day as heavy with a top contributor', () => {
    const ids = ['s1', 's2', 's3', 's4', 's5'];
    const starts = ['08:00', '10:30', '13:00', '15:30', '18:00'];
    const places = ids.map((id) => place(id, { duration_minutes: 120 }));
    const visits = ids.map((id, index) => visit(`v:${id}`, id, { start: starts[index], duration_minutes: 120, sort_order: index }));
    const legs = ids.slice(0, -1).map((id, index) => travelLeg(id, ids[index + 1], 30));
    const list = scheduled(places, visits);
    const assessment = evaluatePlannerDay(trip, list, legs, '2026-10-05');

    expect(assessment.load.level).toBe('heavy');
    expect(assessment.load.score).toBeGreaterThanOrEqual(80);
    expect(assessment.is_overloaded).toBe(true);
    expect(assessment.status).toBe('warning');
    expect(assessment.load.top_contributor).not.toBeNull();
    expect(assessment.load.suggestion).toContain('s1');
    expect(assessment.overload_reason).toContain('负荷');
  });

  it('detects missing meal breaks on a day spanning meal windows', () => {
    const places = [
      place('m1', { duration_minutes: 120 }),
      place('m2', { duration_minutes: 120 }),
      place('m3', { duration_minutes: 120 }),
      place('m4', { duration_minutes: 180 }),
    ];
    const visits = [
      visit('v:m1', 'm1', { start: '09:00', duration_minutes: 120, sort_order: 0 }),
      visit('v:m2', 'm2', { start: '11:30', duration_minutes: 120, sort_order: 1 }),
      visit('v:m3', 'm3', { start: '14:00', duration_minutes: 120, sort_order: 2 }),
      visit('v:m4', 'm4', { start: '16:30', duration_minutes: 180, sort_order: 3 }),
    ];
    const legs = [travelLeg('m1', 'm2', 15), travelLeg('m2', 'm3', 15), travelLeg('m3', 'm4', 15)];
    const list = scheduled(places, visits);
    const timeline = buildPlannerDayExecutionTimeline(trip, list, legs, '2026-10-05');
    const load = calculateDayLoad(list, legs, trip.id, timeline);

    expect(load.lunch_ok).toBe(false);
    expect(load.dinner_ok).toBe(false);
    expect(load.suggestion).toContain('午餐');
    expect(load.suggestion).toContain('晚餐');
    expect(load.longest_stretch_minutes).toBeGreaterThan(0);
    expect(load.span_minutes).toBe(630);
  });

  it('seeds a fully untimed day at 09:00 so load reflects the inferred chain', () => {    const places = [place('u1', { duration_minutes: 60 }), place('u2', { duration_minutes: 60 })];
    const visits = [
      visit('v:u1', 'u1', { sort_order: 0 }),
      visit('v:u2', 'u2', { sort_order: 1 }),
    ];
    const list = scheduled(places, visits);
    const timeline = buildPlannerDayExecutionTimeline(trip, list, [], '2026-10-05');
    const load = calculateDayLoad(list, [], trip.id, timeline);

    // Day seed gives u1 09:00–10:00; u2 has no leg to chain from, stays unknown.
    expect(load.span_minutes).toBe(60);
    expect(load.lunch_ok).toBe(true);
    expect(load.dinner_ok).toBe(true);
    expect(load.level).toBe('easy');
  });

  it('excludes stay rest time from browsing activity minutes', () => {
    const spots = [
      place('temple', { duration_minutes: 120 }),
      place('hotel-nap', { kind: 'stay', duration_minutes: 120 }),
    ];
    const visits = [
      visit('v:temple', 'temple', { start: '09:00', duration_minutes: 120, sort_order: 0 }),
      visit('v:nap', 'hotel-nap', { start: '13:00', duration_minutes: 120, sort_order: 1 }),
    ];
    const legs = [travelLeg('temple', 'hotel-nap', 15)];
    const list = scheduled(spots, visits);
    const timeline = buildPlannerDayExecutionTimeline(trip, list, legs, '2026-10-05');
    const load = calculateDayLoad(list, legs, trip.id, timeline);
    const assessment = evaluatePlannerDay(trip, list, legs, '2026-10-05');

    expect(load.activity_minutes).toBe(120);
    expect(assessment.total_activity_minutes).toBe(120);
    // 酒店休息再长也不应成为“最耗时游览点”.
    expect(load.top_contributor).toMatchObject({ kind: 'stop', title: 'temple', minutes: 120 });
  });

  it('counts restaurant dwell time toward the lunch 45-minute requirement', () => {
    const spots = [
      place('morning-spot', { duration_minutes: 150 }),
      place('lunch-spot', { kind: 'food', duration_minutes: 60 }),
      place('afternoon-spot', { duration_minutes: 120 }),
    ];
    const visits = [
      visit('v:morning', 'morning-spot', { start: '09:00', duration_minutes: 150, sort_order: 0 }),
      visit('v:lunch', 'lunch-spot', { start: '12:00', duration_minutes: 60, sort_order: 1 }),
      visit('v:afternoon', 'afternoon-spot', { start: '13:00', duration_minutes: 120, sort_order: 2 }),
    ];
    const legs = [travelLeg('morning-spot', 'lunch-spot', 15), travelLeg('lunch-spot', 'afternoon-spot', 15)];
    const list = scheduled(spots, visits);
    const timeline = buildPlannerDayExecutionTimeline(trip, list, legs, '2026-10-05');
    const load = calculateDayLoad(list, legs, trip.id, timeline);

    // 午餐窗口内空闲只有 11:30–12:00 共 30 分钟，不够 45；
    // 但 12:00–13:00 坐在餐厅里，合并后满足.
    expect(load.lunch_ok).toBe(true);
    expect(load.suggestion ?? '').not.toContain('午餐');
  });
});


