import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
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

describe('iCal Pro projection', () => {
  it('projects canonical start + duration into a VEVENT-compatible time range', () => {
    const timed = place('Senso-ji', {
      state: 'scheduled', scheduled_date: '2026-10-20', scheduled_start: '09:15',
      duration_minutes: 90, sort_order: 0, priority: 'must', address: 'Asakusa',
    });
    const markdown = exportTripToICalProMarkdown(trip, [timed]);
    expect(markdown).toContain('- [ ] 2026-10-20 09:15-10:45 🏰 Senso-ji ⏫ ⏰ 15');
    expect(markdown).toContain('📍 地址: Asakusa');
  });

  it('never invents a default start time or duration', () => {
    const dateOnly = place('Skytree', {
      state: 'scheduled', scheduled_date: '2026-10-20', sort_order: 0, priority: 'want',
    });
    const markdown = exportTripToICalProMarkdown(trip, [dateOnly]);
    expect(markdown).toContain('- [ ] 2026-10-20 🏰 Skytree 🔼');
    expect(markdown).not.toContain('09:00');
    expect(markdown).not.toMatch(/2026-10-20 \d{2}:\d{2}-\d{2}:\d{2} 🏰 Skytree/);
  });

  it('keeps unscheduled research candidates as floating VTODO items', () => {
    const candidate = place('Ramen', { kind: 'food', priority: 'optional' });
    const markdown = exportTripToICalProMarkdown(trip, [candidate]);
    expect(markdown).toContain('备选研究灵感池 (VTODO)');
    expect(markdown).toContain('- [ ] 🍜 Ramen 🔽');
  });
});
