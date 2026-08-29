import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import { evaluatePlannerScheduleProposal, getScheduledEndTime } from './planner-schedule';

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

describe('Planner schedule proposal', () => {
  it('persists explicit time facts without auto-locking AI decisions', () => {
    const candidate = place('wat-pho');
    const result = evaluatePlannerScheduleProposal(trip, [candidate], [{
      id: candidate.id, scheduled_date: '2026-10-05', scheduled_start: '09:30', sort_order: 0, duration_minutes: 90,
    }]);
    expect(result.valid).toBe(true);
    expect(result.places[0].scheduled_start).toBe('09:30');
    expect(result.places[0].duration_minutes).toBe(90);
    expect(result.places[0].locked).not.toBe(true);
  });

  it('rejects moving a locked or anchored hard constraint', () => {
    const anchor = place('concert', {
      state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '19:30', sort_order: 3,
      duration_minutes: 150, locked: true, is_anchor: true, anchor_type: 'reservation',
    });
    const result = evaluatePlannerScheduleProposal(trip, [anchor], [{
      id: anchor.id, scheduled_date: '2026-10-06', scheduled_start: '20:00', sort_order: 0, duration_minutes: 150,
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'HARD_CONSTRAINT_CHANGED')).toBe(true);
  });

  it('rejects deterministic time overlap', () => {
    const first = place('a', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '09:00', sort_order: 0, duration_minutes: 120 });
    const second = place('b');
    const result = evaluatePlannerScheduleProposal(trip, [first, second], [{
      id: second.id, scheduled_date: '2026-10-05', scheduled_start: '10:00', sort_order: 1, duration_minutes: 60,
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'TIME_OVERLAP')).toBe(true);
  });

  it('derives end time instead of persisting a second authority', () => {
    expect(getScheduledEndTime('23:00', 60)).toBe('00:00');
    expect(getScheduledEndTime(undefined, 60)).toBeNull();
    expect(getScheduledEndTime('09:00', undefined)).toBeNull();
  });
});
