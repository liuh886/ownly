// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildTripItineraryHtml } from './trip-itinerary-html';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import type { PlannerTripVisit } from './planner-visits';

/**
 * The single-file itinerary must render as a real document with JavaScript
 * never running: every day is present in the parsed DOM, and there are no
 * script/link/style-injection elements a phone would have to execute or fetch.
 * This complements the string-level self-containment assertions.
 */

function trip(): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: 'Bangkok Week',
    status: 'active',
    start_date: '2026-10-05',
    end_date: '2026-10-06',
    destinations: ['Bangkok'],
    currency: 'THB',
    transport_mode: 'driving',
    created_at: '2026-09-01T00:00:00.000Z',
  } as PlannerTrip;
}

function place(id: string, title: string): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title,
    source_provider: 'google_maps',
    source_url: 'https://maps.example/x',
    kind: 'attraction',
    area: 'Old Town',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    coordinates: { lat: 13.75, lng: 100.49 },
    created_at: '2026-09-01T00:00:00.000Z',
  } as PlannerTripPlace;
}

function visit(id: string, placeId: string, date: string): PlannerTripVisit {
  return {
    schema_version: '0.1',
    type: 'trip_visit',
    id,
    trip_id: 'trip-1',
    place_id: placeId,
    date,
    sort_order: 0,
    locked: false,
    is_anchor: false,
    created_at: '2026-09-01T00:00:00.000Z',
  } as PlannerTripVisit;
}

describe('trip itinerary HTML document (jsdom)', () => {
  it('parses to a document with all days and no executable/external elements', () => {
    const html = buildTripItineraryHtml({
      trip: trip(),
      places: [place('p1', 'Grand Palace'), place('p2', 'Hidden Cafe')],
      visits: [visit('v1', 'p1', '2026-10-05')],
      expenses: [],
      language: 'en',
      includeExpenses: false,
    });

    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect(dom.querySelector('title')?.textContent).toContain('Bangkok Week');
    expect(dom.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain('width=device-width');
    expect(dom.querySelector('meta[name="theme-color"]')).not.toBeNull();
    expect(dom.querySelectorAll('nav.jump a').length).toBe(2);
    expect(dom.querySelector('#day-1')).not.toBeNull();
    expect(dom.querySelectorAll('details').length).toBe(2);
    expect(dom.querySelectorAll('details[open]').length).toBe(2);
    expect(dom.body.textContent).toContain('Grand Palace');
    expect(dom.body.textContent).toContain('Candidate pool');
    expect(dom.querySelectorAll('script').length).toBe(0);
    expect(dom.querySelectorAll('link').length).toBe(0);
    expect(dom.querySelectorAll('img').length).toBe(0);
  });
});
