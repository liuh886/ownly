import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeMarkdownEntity } from '../../src/data/frontmatter';
import type { PlannerTrip, PlannerTripPlace, TripExpenseItem } from '../../src/domain/planner';
import type { PlannerTripVisit } from '../../src/domain/planner-visits';
import {
  getPlannerSummary,
  getPlannerTripDetail,
  getPlannerTripCalendarIcs,
} from './planner-tools';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture(): { root: string; trip: PlannerTrip; place: PlannerTripPlace; second: PlannerTripPlace; visit: PlannerTripVisit } {
  const root = mkdtempSync(join(tmpdir(), 'ownly-planner-mcp-'));
  temporaryRoots.push(root);
  for (const dir of ['Trips', 'Trip Places', 'Trip Visits', 'Trip Expenses']) mkdirSync(join(root, dir), { recursive: true });

  const trip: PlannerTrip = {
    schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Bangkok 2026', status: 'planning',
    start_date: '2026-11-01', end_date: '2026-11-03', destinations: ['Bangkok'], currency: 'THB',
    members: ['Alice', 'Bob'], created_at: '2026-08-24T00:00:00.000Z',
  };
  const makePlace = (id: string, overrides: Partial<PlannerTripPlace>): PlannerTripPlace => ({
    schema_version: '0.1', type: 'trip_place', id, trip_id: trip.id, title: id,
    source_provider: 'google_maps', source_url: `https://www.google.com/maps/place/${id}/@13.74,100.50,15z`,
    kind: 'attraction', priority: 'want', tags: [], signals: [], risks: [], reservation_status: 'none',
    state: 'candidate', created_at: '2026-08-24T00:00:00.000Z', ...overrides,
  });
  const first = makePlace('grand-palace', {
    title: 'Grand Palace', duration_minutes: 90, observed_price: '฿500',
    open_hours: 'Sunday: Closed; Mon-Sat: 08:30-15:30',
  });
  const second = makePlace('wat-pho', {
    title: 'Wat Pho', observed_price: '฿300', coordinates: { lat: 13.7465, lng: 100.4927 },
  });
  const visit: PlannerTripVisit = {
    schema_version: '0.1', type: 'trip_visit', id: 'visit:grand-palace:morning', trip_id: trip.id,
    place_id: first.id, date: '2026-11-01', start: '09:00', duration_minutes: 90, sort_order: 0,
    locked: true, is_anchor: false, created_at: '2026-08-24T00:00:00.000Z',
  };

  writeFileSync(join(root, 'Trips', 'trip--trip-1.md'), serializeMarkdownEntity(trip, ''), 'utf8');
  writeFileSync(join(root, 'Trip Places', 'place--grand-palace.md'), serializeMarkdownEntity(first, ''), 'utf8');
  writeFileSync(join(root, 'Trip Places', 'place--wat-pho.md'), serializeMarkdownEntity(second, ''), 'utf8');
  writeFileSync(join(root, 'Trip Visits', 'visit--grand-palace.md'), serializeMarkdownEntity(visit, ''), 'utf8');
  return { root, trip, place: first, second, visit };
}

describe('Planner MCP reads', () => {
  it('summarizes reusable places and Visit occurrences separately', () => {
    const { root } = createFixture();
    const summary = getPlannerSummary(root) as { trips: Array<Record<string, unknown>>; totals: Record<string, number> };
    expect(summary.totals.trips).toBe(1);
    expect(summary.totals.places).toBe(2);
    expect(summary.totals.visits).toBe(1);
    expect(summary.trips[0].places_total).toBe(2);
    expect(summary.trips[0].visits).toBe(1);
  });

  it('returns full trip detail with Visit-derived budget and Sunday conflict', () => {
    const { root } = createFixture();
    const detail = getPlannerTripDetail(root, 'trip-1') as {
      trip: PlannerTrip;
      budget: Record<string, unknown>;
      conflicts: Array<{ date: string; collisions: Array<{ place: string; visit_id: string }> }>;
      places: Array<{ id: string; state: string }>;
      visits: Array<{ id: string; place_id: string; date: string }>;
      expenses: unknown[];
    };
    expect(detail.trip.id).toBe('trip-1');
    expect(detail.budget.base_currency).toBe('THB');
    expect(detail.budget.total).toBe(1000);
    expect(detail.budget.per_person).toBe(500);
    expect(detail.budget.currencies_found).toEqual(['THB']);
    expect(detail.conflicts[0].date).toBe('2026-11-01');
    expect(detail.conflicts[0].collisions[0]).toMatchObject({ place: 'Grand Palace', visit_id: 'visit:grand-palace:morning' });
    expect(detail.places.every((p) => p.state === 'candidate')).toBe(true);
    expect(detail.visits).toEqual([expect.objectContaining({ place_id: 'grand-palace', date: '2026-11-01' })]);
    expect(detail.expenses).toEqual([]);
  });

  it('throws NOT_FOUND for an unknown trip', () => {
    const { root } = createFixture();
    expect(() => getPlannerTripDetail(root, 'nope')).toThrowError(/not found/i);
  });
});

describe('Planner ledger via vault (smoke through repository contract)', () => {
  it('reads expenses written in the canonical format', () => {
    const { root } = createFixture();
    const expense: TripExpenseItem = {
      id: 'exp_1', trip_id: 'trip-1', title: 'Boat ride', category: 'transit', amount: 1500,
      currency: 'THB', date: '2026-11-01', paid_by: 'Alice', split_members: ['Alice', 'Bob'],
      created_at: '2026-08-24T00:00:00.000Z',
    };
    writeFileSync(join(root, 'Trip Expenses', 'expense--exp_1.md'), serializeMarkdownEntity({ schema_version: '0.1', type: 'trip_expense', ...expense }, ''), 'utf8');
    vi.doMock('../cli/planner-storage', async (importOriginal) => ({ ...(await importOriginal<object>()) }));
    const detail = getPlannerTripDetail(root, 'trip-1') as { expenses: Array<{ id: string }> };
    expect(detail.expenses).toEqual([expect.objectContaining({ id: 'exp_1' })]);
  });
});

describe('Planner MCP calendar projection', () => {
  it('exports only canonical Visit timing facts to deterministic RFC 5545 ICS', () => {
    const { root } = createFixture();
    const result = getPlannerTripCalendarIcs(root, 'trip-1');
    expect(result.tripId).toBe('trip-1');
    expect(result.title).toBe('Bangkok 2026');
    expect(result.ics).toContain('BEGIN:VCALENDAR');
    expect(result.ics).toContain('DTSTART:20261101T090000');
    expect(result.ics).toContain('DTEND:20261101T103000');
    expect(result.ics).toContain('Grand Palace');
    expect(result.ics).toContain('END:VCALENDAR');
  });
});
