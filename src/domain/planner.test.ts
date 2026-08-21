import { describe, expect, it } from 'vitest';
import {
  buildGoogleMapsDirectionsSegments,
  inferPlaceKind,
  listTripDates,
  mergeCapturedPlaceResearch,
  normalizeDelimitedText,
  type PlannerTripPlace,
} from './planner';

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title: `Place ${id}`,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}`,
    kind: 'attraction',
    priority: 'want',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('Ownly Planner domain', () => {
  it('builds inclusive date-only trip days without timezone drift', () => {
    expect(listTripDates('2026-10-06', '2026-10-09')).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
  });

  it('splits long Google Maps routes into overlapping mobile-safe segments', () => {
    const places = Array.from({ length: 6 }, (_, index) => place(String(index + 1), {
      state: 'scheduled',
      sort_order: index,
    }));
    const segments = buildGoogleMapsDirectionsSegments(places, 'transit');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain('origin=Place+1');
    expect(segments[0]).toContain('destination=Place+5');
    expect(segments[1]).toContain('origin=Place+5');
    expect(segments[1]).toContain('destination=Place+6');
  });

  it('updates recaptured research without destroying the canonical schedule', () => {
    const existing = place('stable', {
      title: 'Old title',
      state: 'scheduled',
      scheduled_date: '2026-10-07',
      sort_order: 2,
      locked: true,
      reservation_status: 'booked',
      area: 'Old area',
      signals: ['old signal'],
    });
    const captured = place('stable', {
      title: 'Fresh title',
      area: 'Asakusa',
      priority: 'must',
      signals: ['early morning'],
      observed_rating: 4.7,
      state: 'candidate',
      reservation_status: 'none',
      updated_at: '2026-08-21T01:00:00.000Z',
    });

    const merged = mergeCapturedPlaceResearch(existing, captured);
    expect(merged.title).toBe('Fresh title');
    expect(merged.area).toBe('Asakusa');
    expect(merged.priority).toBe('must');
    expect(merged.signals).toEqual(['early morning']);
    expect(merged.observed_rating).toBe(4.7);
    expect(merged.state).toBe('scheduled');
    expect(merged.scheduled_date).toBe('2026-10-07');
    expect(merged.sort_order).toBe(2);
    expect(merged.locked).toBe(true);
    expect(merged.reservation_status).toBe('booked');
  });

  it('infers place kind from Chinese and English categories', () => {
    expect(inferPlaceKind('日本料理店')).toBe('food');
    expect(inferPlaceKind('Coffee Shop')).toBe('cafe');
    expect(inferPlaceKind('Luxury Hotel & Resort')).toBe('stay');
    expect(inferPlaceKind('Outlet Shopping Mall')).toBe('shopping');
    expect(inferPlaceKind('Subway Station')).toBe('transit');
    expect(inferPlaceKind('Historical Temple & Museum')).toBe('attraction');
    expect(inferPlaceKind(undefined)).toBe('attraction');
  });

  it('normalizes tags and delimited values cleanly', () => {
    expect(normalizeDelimitedText('Tokyo 2026, 美食清单， Want to go ; 浅草')).toEqual([
      'Tokyo 2026',
      '美食清单',
      'Want to go',
      '浅草',
    ]);
  });
});
