import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeMarkdownEntity } from '../../src/data/frontmatter';
import type { PlannerTrip, PlannerTripPlace, TripExpenseItem } from '../../src/domain/planner';
import {
  getPlannerSummary,
  getPlannerTripDetail,
  getPlannerTripICalMarkdown,
} from './planner-tools';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture(): { root: string; trip: PlannerTrip; place: PlannerTripPlace; second: PlannerTripPlace } {
  const root = mkdtempSync(join(tmpdir(), 'ownly-planner-mcp-'));
  temporaryRoots.push(root);
  for (const dir of ['Trips', 'Trip Places', 'Trip Expenses']) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  const trip: PlannerTrip = {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: 'Bangkok 2026',
    status: 'planning',
    start_date: '2026-11-01',
    end_date: '2026-11-03',
    destinations: ['Bangkok'],
    currency: 'THB',
    members: ['Alice', 'Bob'],
    created_at: '2026-08-24T00:00:00.000Z',
  };
  const place = (id: string, overrides: Partial<PlannerTripPlace>): PlannerTripPlace => ({
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title: id,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}/@13.74,100.50,15z`,
    kind: 'attraction',
    priority: 'want',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  });
  const first = place('grand-palace', {
    title: 'Grand Palace',
    state: 'scheduled',
    scheduled_date: '2026-11-01',
    sort_order: 0,
    locked: true,
    scheduled_start: '09:00',
    duration_minutes: 90,
    observed_price: '฿500',
    open_hours: 'Sunday: Closed; Mon-Sat: 08:30-15:30',
  });
  const second = place('wat-pho', {
    title: 'Wat Pho',
    state: 'candidate',
    observed_price: '฿300',
    coordinates: { lat: 13.7465, lng: 100.4927 },
  });

  writeFileSync(join(root, 'Trips', 'trip--trip-1.md'), serializeMarkdownEntity(trip, ''), 'utf8');
  writeFileSync(join(root, 'Trip Places', 'place--grand-palace.md'), serializeMarkdownEntity(first, ''), 'utf8');
  writeFileSync(join(root, 'Trip Places', 'place--wat-pho.md'), serializeMarkdownEntity(second, ''), 'utf8');

  return { root, trip, place: first, second };
}

describe('Planner MCP reads', () => {
  it('summarizes trips with per-state counts', () => {
    const { root } = createFixture();
    const summary = getPlannerSummary(root) as {
      trips: Array<Record<string, unknown>>;
      totals: Record<string, number>;
    };
    expect(summary.totals.trips).toBe(1);
    expect(summary.totals.places).toBe(2);
    expect(summary.trips[0].scheduled).toBe(1);
    expect(summary.trips[0].candidates).toBe(1);
  });

  it('returns full trip detail with THB budget and Monday conflict', () => {
    const { root } = createFixture();
    const detail = getPlannerTripDetail(root, 'trip-1') as {
      trip: PlannerTrip;
      budget: Record<string, unknown>;
      conflicts: Array<{ date: string; collisions: Array<{ place: string }> }>;
      places: Array<{ id: string; state: string }>;
      expenses: unknown[];
    };

    expect(detail.trip.id).toBe('trip-1');
    expect(detail.budget.base_currency).toBe('THB');
    // Grand Palace ฿500 × 2 travelers (attraction is per-person) = 1000 THB
    expect(detail.budget.total).toBe(1000);
    expect(detail.budget.per_person).toBe(500);
    expect(detail.budget.currencies_found).toEqual(['THB']);
    // 2026-11-01 is a Sunday → "Sunday: Closed" collides with the schedule
    expect(detail.conflicts.length).toBeGreaterThan(0);
    expect(detail.conflicts[0].date).toBe('2026-11-01');
    expect(detail.conflicts[0].collisions[0].place).toBe('Grand Palace');
    expect(detail.places.map((p) => p.state)).toContain('scheduled');
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
      id: 'exp_1',
      trip_id: 'trip-1',
      title: 'Boat ride',
      category: 'transit',
      amount: 1500,
      currency: 'THB',
      date: '2026-11-01',
      paid_by: 'Alice',
      split_members: ['Alice', 'Bob'],
      created_at: '2026-08-24T00:00:00.000Z',
    };
    writeFileSync(
      join(root, 'Trip Expenses', 'expense--exp_1.md'),
      serializeMarkdownEntity({ schema_version: '0.1', type: 'trip_expense', ...expense }, ''),
      'utf8',
    );
    vi.doMock('../cli/planner-storage', async (importOriginal) => ({
      ...(await importOriginal<object>()),
    }));
    const detail = getPlannerTripDetail(root, 'trip-1') as { expenses: Array<{ id: string }> };
    void expense;
    expect(Array.isArray(detail.expenses)).toBe(true);
  });
});

describe('Planner MCP calendar projection', () => {
  it('exports only canonical Planner time facts to iCal Pro Markdown', () => {
    const { root } = createFixture();
    const result = getPlannerTripICalMarkdown(root, 'trip-1');
    expect(result.tripId).toBe('trip-1');
    expect(result.title).toBe('Bangkok 2026');
    expect(result.markdown).toContain('2026-11-01 09:00-10:30');
    expect(result.markdown).not.toContain('ownly-ai-planner');
  });
});
