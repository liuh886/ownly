import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import type { PlannerTripVisit } from './planner-visits';
import { exportTripToICalProMarkdown } from './ical-pro';

const trip: PlannerTrip = {
  schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Tokyo', status: 'planning',
  start_date: '2026-10-20', end_date: '2026-10-21', destinations: ['Tokyo'], created_at: '2026-08-29T00:00:00Z',
};

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: trip.id, title: id,
    source_provider: 'google_maps', source_url: `https://maps.google.com/${id}`, kind: 'attraction',
    tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate',
    created_at: '2026-08-29T00:00:00Z', ...overrides,
  };
}

function visit(id: string, placeId: string, date: string, overrides: Partial<PlannerTripVisit> = {}): PlannerTripVisit {
  return {
    schema_version: '0.1', type: 'trip_visit', id, trip_id: trip.id, place_id: placeId,
    date, sort_order: 0, locked: false, is_anchor: false, created_at: '2026-08-29T00:00:00Z',
    ...overrides,
  };
}

describe('iCal Pro projection', () => {
  it('projects visit start + duration into a timed block while the place remains research data', () => {
    const senso = place('Senso-ji', { priority: 'must', address: 'Asakusa' });
    const markdown = exportTripToICalProMarkdown(trip, [senso], [
      visit('visit-1', senso.id, '2026-10-20', { start: '09:15', duration_minutes: 90 }),
    ]);
    expect(markdown).toContain('- [ ] 2026-10-20 09:15-10:45 🏰 Senso-ji ⏫ ⏰ 15');
    expect(markdown).toContain('📍 地址: Asakusa');
    expect(markdown).toContain('已安排 1 次');
  });

  it('never invents a default start time or duration', () => {
    const skytree = place('Skytree', { priority: 'want' });
    const markdown = exportTripToICalProMarkdown(trip, [skytree], [
      visit('visit-2', skytree.id, '2026-10-20'),
    ]);
    expect(markdown).toContain('- [ ] 2026-10-20 🏰 Skytree 🔼');
    expect(markdown).not.toContain('09:00');
    expect(markdown).not.toMatch(/2026-10-20 \d{2}:\d{2}-\d{2}:\d{2} 🏰 Skytree/);
  });

  it('projects the same reusable place repeatedly across days', () => {
    const hotel = place('Hotel', { kind: 'stay', priority: 'must' });
    const markdown = exportTripToICalProMarkdown(trip, [hotel], [
      visit('visit-h1', hotel.id, '2026-10-20', { sort_order: 0 }),
      visit('visit-h2', hotel.id, '2026-10-21', { sort_order: 0 }),
    ]);
    expect(markdown.match(/🏨 Hotel/g)?.length).toBeGreaterThanOrEqual(3); // two visits + research pool
    expect(markdown).toContain('已安排 2 次');
  });

  it('keeps every reusable research place as a floating VTODO item', () => {
    const candidate = place('Ramen', { kind: 'food', priority: 'optional' });
    const markdown = exportTripToICalProMarkdown(trip, [candidate], []);
    expect(markdown).toContain('研究地点池 (VTODO)');
    expect(markdown).toContain('- [ ] 🍜 Ramen 🔽');
  });
});
