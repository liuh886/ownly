import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
import { resolveInitialTripId } from './trip-selection';

function trip(id: string, overrides: Partial<PlannerTrip> = {}): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id,
    title: `Trip ${id}`,
    status: 'planning',
    start_date: '2026-10-05',
    end_date: '2026-10-13',
    destinations: ['曼谷'],
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function place(id: string, tripId: string, updatedAt?: string): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: tripId,
    title: `Place ${id}`,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}`,
    kind: 'attraction',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-09-01T00:00:00.000Z',
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  };
}

function visit(id: string, tripId: string, updatedAt?: string): PlannerTripVisit {
  return {
    schema_version: '0.1',
    type: 'trip_visit',
    id,
    trip_id: tripId,
    place_id: `place-${tripId}`,
    date: '2026-10-06',
    sort_order: 0,
    locked: false,
    is_anchor: false,
    created_at: '2026-09-01T00:00:00.000Z',
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  };
}

describe('resolveInitialTripId', () => {
  it('returns empty when there are no trips', () => {
    expect(resolveInitialTripId([], [], [], '')).toBe('');
  });

  it('restores the last-selected trip when it still exists', () => {
    // Regression: Planner always showed the latest-start trip instead of the
    // one being edited.
    const trips = [trip('new-late', { start_date: '2026-12-01' }), trip('old-early', { start_date: '2026-01-01' })];
    expect(resolveInitialTripId(trips, [], [], 'old-early')).toBe('old-early');
  });

  it('ignores a stored id for a deleted trip', () => {
    const trips = [trip('a'), trip('b')];
    expect(resolveInitialTripId(trips, [], [], 'deleted-id')).toBe('a');
  });

  it('falls back to the most recently touched trip via place edits', () => {
    const trips = [trip('a'), trip('b')];
    const places = [place('p1', 'b', '2026-09-07T00:00:00.000Z')];
    expect(resolveInitialTripId(trips, places, [], '')).toBe('b');
  });

  it('falls back to the most recently touched trip via visit edits', () => {
    const trips = [trip('a'), trip('b')];
    const visits = [visit('v1', 'a', '2026-09-07T00:00:00.000Z')];
    expect(resolveInitialTripId(trips, [], visits, '')).toBe('a');
  });

  it('prefers trip updated_at over untouched peers', () => {
    const trips = [
      trip('a', { updated_at: '2026-09-01T00:00:00.000Z' }),
      trip('b', { updated_at: '2026-09-06T00:00:00.000Z' }),
    ];
    expect(resolveInitialTripId(trips, [], [], '')).toBe('b');
  });

  it('keeps list order when nothing distinguishes trips', () => {
    const trips = [trip('first'), trip('second')];
    expect(resolveInitialTripId(trips, [], [], '')).toBe('first');
  });
});
