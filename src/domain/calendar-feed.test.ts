import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import type { PlannerTripVisit } from './planner-visits';
import {
  buildTripCalendarIcs,
  buildDayCalendarIcs,
  escapeIcsText,
  foldIcsLine,
  generateCalendarFeedToken,
  getCalendarFeedUrl,
  createTripCalendarFeed,
  rotateTripCalendarFeed,
} from './calendar-feed';

const trip: PlannerTrip = {
  schema_version: '0.1',
  type: 'trip',
  id: 'trip-thailand-2026',
  title: 'Thailand 2026 Adventure',
  status: 'planning',
  start_date: '2026-10-05',
  end_date: '2026-10-09',
  destinations: ['Bangkok', 'Chiang Mai'],
  created_at: '2026-08-29T00:00:00Z',
};

function makePlace(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: trip.id,
    title: id,
    source_provider: 'google_maps',
    source_url: `https://maps.google.com/?cid=${id}`,
    kind: 'attraction',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-29T00:00:00Z',
    ...overrides,
  };
}

function makeVisit(id: string, placeId: string, date: string, overrides: Partial<PlannerTripVisit> = {}): PlannerTripVisit {
  return {
    schema_version: '0.1',
    type: 'trip_visit',
    id,
    trip_id: trip.id,
    place_id: placeId,
    date,
    sort_order: 0,
    locked: false,
    is_anchor: false,
    created_at: '2026-08-29T00:00:00Z',
    ...overrides,
  };
}

describe('RFC 5545 ICS Projection & Calendar Feed', () => {
  it('generates valid RFC 5545 format with CRLF and standard calendar headers', () => {
    const palace = makePlace('grand-palace', {
      title: 'Grand Palace',
      kind: 'attraction',
      priority: 'must',
      address: 'Na Phra Lan Rd, Bangkok',
    });
    const visit1 = makeVisit('visit-gp', palace.id, '2026-10-05', {
      start: '09:00',
      duration_minutes: 120,
    });

    const ics = buildTripCalendarIcs(trip, [palace], [visit1]);

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('PRODID:-//Ownly//Planner Calendar Feed//EN\r\n');
    expect(ics).toContain('X-WR-CALNAME:Thailand 2026 Adventure\r\n');
    expect(ics).toContain('X-PUBLISHED-TTL:PT60M\r\n');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT60M\r\n');
  });

  it('uses stable Visit ID as UID for calendar synchronization persistence', () => {
    const watPho = makePlace('wat-pho', { title: 'Wat Pho' });
    const visit = makeVisit('visit-wat-pho-999', watPho.id, '2026-10-05', {
      start: '13:00',
      duration_minutes: 60,
    });

    const ics = buildTripCalendarIcs(trip, [watPho], [visit]);
    expect(ics).toContain('UID:visit:visit-wat-pho-999@ownly\r\n');
  });

  it('projects timed events with DTSTART and calculated DTEND', () => {
    const thipsamai = makePlace('thipsamai', { title: 'Thipsamai Padthai', kind: 'food' });
    const visit = makeVisit('visit-padthai', thipsamai.id, '2026-10-05', {
      start: '18:30',
      duration_minutes: 75,
    });

    const ics = buildTripCalendarIcs(trip, [thipsamai], [visit]);
    expect(ics).toContain('DTSTART:20261005T183000\r\n');
    expect(ics).toContain('DTEND:20261005T194500\r\n');
  });

  it('projects untimed visits as all-day events using VALUE=DATE', () => {
    const market = makePlace('chatuchak', { title: 'Chatuchak Weekend Market' });
    const visit = makeVisit('visit-market', market.id, '2026-10-06');

    const ics = buildTripCalendarIcs(trip, [market], [visit]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261006\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261007\r\n');
  });

  it('projects only scheduled Visits into VEVENTs, ignoring floating candidates and dropped places', () => {
    const candidateA = makePlace('ramen', { title: 'Floating Ramen Candidate' });
    const droppedB = makePlace('shelved-spot', { title: 'Shelved Spot', state: 'dropped' });
    const scheduledC = makePlace('hotel', { title: 'Oakwood Hotel', kind: 'stay' });
    const visitHotel = makeVisit('visit-hotel-1', scheduledC.id, '2026-10-05');

    const ics = buildTripCalendarIcs(trip, [candidateA, droppedB, scheduledC], [visitHotel]);

    expect(ics).toContain('Oakwood Hotel');
    expect(ics).not.toContain('Floating Ramen Candidate');
    expect(ics).not.toContain('Shelved Spot');
    const veventMatches = ics.match(/BEGIN:VEVENT/g);
    expect(veventMatches?.length).toBe(1);
  });

  it('supports multiple visits for a reusable place across multiple days', () => {
    const hotel = makePlace('hotel-bangkok', { title: 'Bangkok Hotel', kind: 'stay' });
    const visitD1 = makeVisit('visit-h-d1', hotel.id, '2026-10-05', { sort_order: 0 });
    const visitD2 = makeVisit('visit-h-d2', hotel.id, '2026-10-06', { sort_order: 0 });

    const ics = buildTripCalendarIcs(trip, [hotel], [visitD1, visitD2]);

    expect(ics).toContain('UID:visit:visit-h-d1@ownly');
    expect(ics).toContain('UID:visit:visit-h-d2@ownly');
    const veventMatches = ics.match(/BEGIN:VEVENT/g);
    expect(veventMatches?.length).toBe(2);
  });

  it('includes VALARM display reminder for must-visit places', () => {
    const mustPlace = makePlace('flight', { title: 'Flight BKK -> CNX', kind: 'transit', priority: 'must' });
    const visit = makeVisit('visit-flight', mustPlace.id, '2026-10-07', { start: '10:00', duration_minutes: 90 });

    const ics = buildTripCalendarIcs(trip, [mustPlace], [visit], { includeAlarms: true, alarmMinutes: 30 });
    expect(ics).toContain('BEGIN:VALARM\r\n');
    expect(ics).toContain('TRIGGER:-PT30M\r\n');
    expect(ics).toContain('ACTION:DISPLAY\r\n');
    expect(ics).toContain('PRIORITY:1\r\n');
  });

  it('buildDayCalendarIcs filters events strictly for the requested date', () => {
    const spot1 = makePlace('spot1', { title: 'Day 1 Spot' });
    const spot2 = makePlace('spot2', { title: 'Day 2 Spot' });
    const v1 = makeVisit('v1', spot1.id, '2026-10-05');
    const v2 = makeVisit('v2', spot2.id, '2026-10-06');

    const ics = buildDayCalendarIcs(trip, [spot1, spot2], [v1, v2], '2026-10-05');
    expect(ics).toContain('Day 1 Spot');
    expect(ics).not.toContain('Day 2 Spot');
  });

  it('escapes special characters per RFC 5545', () => {
    expect(escapeIcsText('Hello, World; Welcome \\ back\nLine 2')).toBe('Hello\\, World\\; Welcome \\\\ back\\nLine 2');
  });

  it('folds lines exceeding 75 octets without cutting multi-byte UTF-8 code points', () => {
    const longLine = 'DESCRIPTION:' + '🏨 这是一个非常非常非常非常长的曼谷豪华度假酒店中文详细描述包含各种注意事项和预订信息'.repeat(3);
    const folded = foldIcsLine(longLine);

    expect(folded).toContain('\r\n ');
    const lines = folded.split('\r\n ');
    const encoder = new TextEncoder();
    expect(encoder.encode(lines[0]).length).toBeLessThanOrEqual(75);
  });

  describe('Calendar Feed (PRO) utilities', () => {
    it('generates high-entropy 32-character bearer token', () => {
      const token1 = generateCalendarFeedToken();
      const token2 = generateCalendarFeedToken();
      expect(token1).toHaveLength(32);
      expect(token2).toHaveLength(32);
      expect(token1).not.toBe(token2);
    });

    it('builds subscription URL from feed token', () => {
      const url = getCalendarFeedUrl('abc123tokenXYZ');
      expect(url).toBe('https://calendar.ownly.app/f/abc123tokenXYZ.ics');
    });

    it('creates initial calendar feed metadata and supports token rotation', () => {
      const feed = createTripCalendarFeed('trip-1');
      expect(feed.trip_id).toBe('trip-1');
      expect(feed.feed_token).toHaveLength(32);
      expect(feed.enabled).toBe(true);

      const rotated = rotateTripCalendarFeed(feed);
      expect(rotated.trip_id).toBe('trip-1');
      expect(rotated.feed_token).toHaveLength(32);
      expect(rotated.feed_token).not.toBe(feed.feed_token);
      expect(rotated.enabled).toBe(true);
    });
  });
});
