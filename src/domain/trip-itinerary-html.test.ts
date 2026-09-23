import { describe, expect, it } from 'vitest';
import {
  buildTripItineraryHtml,
  tripItineraryHtmlFileName,
} from './trip-itinerary-html';
import type { PlannerTrip, PlannerTripPlace, TripExpenseItem } from './planner';
import type { PlannerTripVisit } from './planner-visits';

function trip(overrides: Partial<PlannerTrip> = {}): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: 'Bangkok Week',
    status: 'active',
    start_date: '2026-10-05',
    end_date: '2026-10-07',
    destinations: ['Bangkok'],
    currency: 'THB',
    transport_mode: 'driving',
    members: ['me', 'partner'],
    calendar_feed: {
      feed_token: 'secret-token',
      trip_id: 'trip-1',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      enabled: true,
    },
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as PlannerTrip;
}

function place(
  id: string,
  title: string,
  overrides: Partial<PlannerTripPlace> = {},
): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title,
    source_provider: 'google_maps',
    source_url: 'https://maps.example/x',
    kind: 'attraction',
    area: 'Rattanakosin',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    coordinates: { lat: 13.75, lng: 100.49 },
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as PlannerTripPlace;
}

function visit(
  id: string,
  placeId: string,
  date: string,
  order: number,
  start?: string,
): PlannerTripVisit {
  return {
    schema_version: '0.1',
    type: 'trip_visit',
    id,
    trip_id: 'trip-1',
    place_id: placeId,
    date,
    start,
    sort_order: order,
    locked: false,
    is_anchor: false,
    created_at: '2026-09-01T00:00:00.000Z',
  } as PlannerTripVisit;
}

function expense(): TripExpenseItem {
  return {
    id: 'exp-1',
    trip_id: 'trip-1',
    title: 'Hotel',
    category: 'stay',
    amount: 500,
    currency: 'THB',
    paid_by: 'me',
    split_members: [],
    created_at: '2026-10-06T00:00:00.000Z',
  } as TripExpenseItem;
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    trip: trip(),
    places: [place('p1', 'Grand Palace'), place('p2', 'Night Market')],
    visits: [
      visit('v1', 'p1', '2026-10-05', 0, '09:00'),
      visit('v2', 'p2', '2026-10-06', 0),
    ],
    expenses: [expense()],
    language: 'zh' as const,
    generatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildTripItineraryHtml', () => {
  it('is tuned for mobile: viewport, theme-color, sticky headers, day jump nav', () => {
    const html = buildTripItineraryHtml(baseInput());
    expect(html).toContain('name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('position:sticky');
    expect(html).toContain('class="jump"');
    expect(html).toContain('href="#day-1"');
    expect(html).toContain('id="day-1"');
    expect(html).toContain('min-height:32px');
  });

  it('omits the day jump nav for a single-day trip', () => {
    const html = buildTripItineraryHtml(
      baseInput({
        trip: trip({ start_date: '2026-10-05', end_date: '2026-10-05' }),
        visits: [visit('v1', 'p1', '2026-10-05', 0)],
      }),
    );
    expect(html).not.toContain('class="jump"');
  });

  it('renders the header, every trip day, and stops in order', () => {
    const html = buildTripItineraryHtml(baseInput());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Bangkok Week');
    expect(html).toContain('2026-10-05 → 2026-10-07');
    expect(html).toContain('Grand Palace');
    expect(html).toContain('Night Market');
    expect(html).toContain('09:00');
    // Days 1-3 all render, including the empty final day.
    expect(html).toContain('第1天');
    expect(html).toContain('第2天');
    expect(html).toContain('第3天');
    expect(html).toContain('当天无安排');
  });

  it('is fully self-contained: no scripts, stylesheets, or external assets', () => {
    const html = buildTripItineraryHtml(baseInput());
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link ');
    expect(html).not.toContain('@import');
    expect(html).not.toContain('url(http');
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(html).toContain('<style>');
  });

  it('escapes user-controlled text so injected markup stays inert', () => {
    const html = buildTripItineraryHtml(
      baseInput({
        trip: trip({ title: '<script>alert(1)</script>' }),
        places: [
          place('p1', 'A & B', {
            why: '<img src=x onerror=alert(1)>',
            notes: '</div>"quoted"',
          }),
        ],
        visits: [visit('v1', 'p1', '2026-10-05', 0)],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('drops unsafe link schemes instead of emitting them', () => {
    const html = buildTripItineraryHtml(
      baseInput({
        places: [place('p1', 'Sketchy', { source_url: 'javascript:alert(1)' })],
        visits: [visit('v1', 'p1', '2026-10-05', 0)],
      }),
    );
    expect(html).not.toContain('javascript:');
  });

  it('links each stop to a map deep link and each multi-stop day to a route', () => {
    const html = buildTripItineraryHtml(
      baseInput({
        visits: [
          visit('v1', 'p1', '2026-10-05', 0),
          visit('v2', 'p2', '2026-10-05', 1),
        ],
      }),
    );
    expect(html).toContain('https://www.google.com/maps/search/?api=1&amp;query=13.75,100.49');
    expect(html).toContain('https://www.google.com/maps/dir/');
  });

  it('excludes expenses unless explicitly included', () => {
    const excluded = buildTripItineraryHtml(baseInput({ includeExpenses: false }));
    expect(excluded).toContain('该快照未包含费用');
    expect(excluded).not.toContain('Hotel');

    const included = buildTripItineraryHtml(baseInput({ includeExpenses: true }));
    expect(included).toContain('Hotel');
    expect(included).toContain('THB 500');
  });

  it('lists unscheduled places in the candidate pool', () => {
    const html = buildTripItineraryHtml(
      baseInput({
        places: [
          place('p1', 'Grand Palace'),
          place('p2', 'Night Market'),
          place('p3', 'Hidden Cafe'),
        ],
      }),
    );
    expect(html).toContain('待选灵感池');
    expect(html).toContain('Hidden Cafe');
  });

  it('strips private trip fields (members, calendar feed, review backlink)', () => {
    const html = buildTripItineraryHtml(
      baseInput({
        trip: trip({ review_id: 'review-1', ignored_duplicate_pair_ids: ['pair-1'] }),
      }),
    );
    expect(html).not.toContain('secret-token');
    expect(html).not.toContain('partner');
    expect(html).not.toContain('review-1');
    expect(html).not.toContain('pair-1');
  });

  it('renders English copy when asked', () => {
    const html = buildTripItineraryHtml(
      baseInput({
        language: 'en',
        places: [place('p1', 'Grand Palace'), place('p3', 'Hidden Cafe')],
      }),
    );
    expect(html).toContain('Read-only snapshot');
    expect(html).toContain('Day 1');
    expect(html).toContain('Candidate pool');
  });

  it('produces a safe, distinct filename', () => {
    expect(tripItineraryHtmlFileName('Bangkok Week')).toBe('Bangkok-Week.html');
    expect(tripItineraryHtmlFileName('a/b:c')).toBe('a-b-c.html');
    expect(tripItineraryHtmlFileName('   ')).toBe('ownly-trip.html');
  });
});
