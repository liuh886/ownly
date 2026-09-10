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
  getIcsWindowCutoffDate,
  createTripCalendarFeed,
  rotateTripCalendarFeed,
  hashFeedToken,
  zonedWallTimeToUtcMs,
  resolveTripTimeZoneForDate,
  buildAccountCalendarIcs,
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

// Pinned reference date keeps every ICS assertion deterministic no matter
// when the suite runs. Window cutoff for this value is 2025-09-01.
const FIXED_NOW = new Date('2026-09-01T00:00:00Z');

describe('RFC 5545 ICS Projection & Calendar Feed', () => {
  it('skips visits older than one year from the ICS window (WS-1 linkage)', () => {
    const finished: PlannerTrip = {
      ...trip,
      status: 'completed',
      start_date: '2020-01-01',
      end_date: '2020-01-03',
      review_id: 'obj_finished',
    };
    const palace = makePlace('grand-palace', { title: 'Grand Palace' });
    const visit = makeVisit('visit-gp', palace.id, '2020-01-02', { start: '09:00' });
    const ics = buildTripCalendarIcs(finished, [palace], [visit], { now: FIXED_NOW });
    expect(ics).not.toContain('Grand Palace');
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('BEGIN:VCALENDAR');
    // An explicit reference date inside the window restores it (override path).
    const revived = buildTripCalendarIcs(finished, [palace], [visit], { now: new Date('2020-06-01T00:00:00Z') });
    expect(revived).toContain('Grand Palace');
    expect(revived).toContain('DTSTART');
  });

  it('computes the one-year ICS cutoff date (boundary inclusive)', () => {
    expect(getIcsWindowCutoffDate(new Date('2026-09-10T00:00:00Z'))).toBe('2025-09-10');
    expect(getIcsWindowCutoffDate('2026-03-01')).toBe('2025-03-01');
  });

  it('keeps the exact cutoff day and drops the day before', () => {
    const place = makePlace('spot', { title: 'Boundary Spot' });
    const kept = makeVisit('v-kept', place.id, '2025-09-10', {});
    const dropped = makeVisit('v-dropped', place.id, '2025-09-09', {});
    const ics = buildTripCalendarIcs(trip, [place], [kept, dropped], { now: new Date('2026-09-10T00:00:00Z') });
    expect(ics).toContain('UID:v-kept@ownly');
    expect(ics).not.toContain('UID:v-dropped@ownly');
  });

  it('buildDayCalendarIcs yields headers but no events for a date outside the window', () => {
    const place = makePlace('old', { title: 'Old Spot' });
    const visit = makeVisit('v-old', place.id, '2020-01-02', {});
    const ics = buildDayCalendarIcs(trip, [place], [visit], '2020-01-02', { now: FIXED_NOW });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

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

    const ics = buildTripCalendarIcs(trip, [palace], [visit1], { now: FIXED_NOW });

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
    const visit = makeVisit('visit:wat-pho-999', watPho.id, '2026-10-05', {
      start: '13:00',
      duration_minutes: 60,
    });

    const ics = buildTripCalendarIcs(trip, [watPho], [visit], { now: FIXED_NOW });
    expect(ics).toContain('UID:visit:wat-pho-999@ownly\r\n');
  });

  it('projects timed events with DTSTART and calculated DTEND', () => {
    const thipsamai = makePlace('thipsamai', { title: 'Thipsamai Padthai', kind: 'food' });
    const visit = makeVisit('visit-padthai', thipsamai.id, '2026-10-05', {
      start: '18:30',
      duration_minutes: 75,
    });

    const ics = buildTripCalendarIcs(trip, [thipsamai], [visit], { now: FIXED_NOW });
    expect(ics).toContain('DTSTART:20261005T183000\r\n');
    expect(ics).toContain('DTEND:20261005T194500\r\n');
  });

  it('seeds a lone untimed visit at 09:00 instead of an all-day task', () => {
    const market = makePlace('chatuchak', { title: 'Chatuchak Weekend Market' });
    const visit = makeVisit('visit-market', market.id, '2026-10-06');

    const ics = buildTripCalendarIcs(trip, [market], [visit], { now: FIXED_NOW });
    expect(ics).toContain('DTSTART:20261006T090000\r\n');
    expect(ics).toContain('STATUS:TENTATIVE\r\n');
    expect(ics).not.toContain('VALUE=DATE');
  });

  it('projects only scheduled Visits into VEVENTs, ignoring floating candidates and dropped places', () => {
    const candidateA = makePlace('ramen', { title: 'Floating Ramen Candidate' });
    const droppedB = makePlace('shelved-spot', { title: 'Shelved Spot', state: 'dropped' });
    const scheduledC = makePlace('hotel', { title: 'Oakwood Hotel', kind: 'stay' });
    const visitHotel = makeVisit('visit-hotel-1', scheduledC.id, '2026-10-05');

    const ics = buildTripCalendarIcs(trip, [candidateA, droppedB, scheduledC], [visitHotel], { now: FIXED_NOW });

    expect(ics).toContain('Oakwood Hotel');
    expect(ics).not.toContain('Floating Ramen Candidate');
    expect(ics).not.toContain('Shelved Spot');
    const veventMatches = ics.match(/BEGIN:VEVENT/g);
    expect(veventMatches?.length).toBe(1);
  });

  it('supports multiple visits for a reusable place across multiple days', () => {
    const hotel = makePlace('hotel-bangkok', { title: 'Bangkok Hotel', kind: 'stay' });
    const visitD1 = makeVisit('visit:h-d1', hotel.id, '2026-10-05', { sort_order: 0 });
    const visitD2 = makeVisit('visit:h-d2', hotel.id, '2026-10-06', { sort_order: 0 });

    const ics = buildTripCalendarIcs(trip, [hotel], [visitD1, visitD2], { now: FIXED_NOW });

    expect(ics).toContain('UID:visit:h-d1@ownly');
    expect(ics).toContain('UID:visit:h-d2@ownly');
    const veventMatches = ics.match(/BEGIN:VEVENT/g);
    expect(veventMatches?.length).toBe(2);
  });

  it('includes VALARM display reminder for must-visit places', () => {
    const mustPlace = makePlace('flight', { title: 'Flight BKK -> CNX', kind: 'transit', priority: 'must' });
    const visit = makeVisit('visit-flight', mustPlace.id, '2026-10-07', { start: '10:00', duration_minutes: 90 });

    const ics = buildTripCalendarIcs(trip, [mustPlace], [visit], { includeAlarms: true, alarmMinutes: 30, now: FIXED_NOW });
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

    const ics = buildDayCalendarIcs(trip, [spot1, spot2], [v1, v2], '2026-10-05', { now: FIXED_NOW });
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
      expect(url).toBe(
        'https://blgwlycfcwvsupmqyqwn.supabase.co/functions/v1/calendar-feed/abc123tokenXYZ.ics',
      );
    });

    it('keeps the legacy /f/ prefix for an explicit short host', () => {
      const url = getCalendarFeedUrl('abc123tokenXYZ', 'https://calendar.ownly.app');
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

    it('computes deterministic SHA-256 token hash for database storage', async () => {
      const token = 'sample_token_1234567890abcdef';
      const hash1 = await hashFeedToken(token);
      const hash2 = await hashFeedToken(token);
      const hashDiff = await hashFeedToken('sample_token_diff');

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDiff);
    });
  });
});

describe('Trip timezone → UTC ICS emission', () => {
  const bangkokTrip: PlannerTrip = { ...trip, timezone: 'Asia/Bangkok' };

  it('emits UTC instants for a zoned trip', () => {
    const place = makePlace('khao-soi', { title: 'Khao Soi' });
    const visit = makeVisit('visit:ks-1', place.id, '2026-10-05', { start: '08:00', duration_minutes: 60 });
    const ics = buildTripCalendarIcs(bangkokTrip, [place], [visit], { now: FIXED_NOW });
    // 08:00 ICT (UTC+7) = 01:00Z
    expect(ics).toContain('DTSTART:20261005T010000Z\r\n');
    expect(ics).toContain('DTEND:20261005T020000Z\r\n');
  });

  it('rolls the end instant past midnight instead of wrapping to 23:59', () => {
    const place = makePlace('night-mkt', { title: 'Night Market' });
    const visit = makeVisit('visit:nm-1', place.id, '2026-10-05', { start: '23:30', duration_minutes: 60 });
    const ics = buildTripCalendarIcs(bangkokTrip, [place], [visit], { now: FIXED_NOW });
    // 23:30 ICT = 16:30Z; end 00:30+1d ICT = 17:30Z same UTC day
    expect(ics).toContain('DTSTART:20261005T163000Z\r\n');
    expect(ics).toContain('DTEND:20261005T173000Z\r\n');
  });

  it('keeps floating local time when no timezone is set', () => {
    const place = makePlace('khao-soi', { title: 'Khao Soi' });
    const visit = makeVisit('visit:ks-1', place.id, '2026-10-05', { start: '08:00', duration_minutes: 60 });
    const ics = buildTripCalendarIcs(trip, [place], [visit], { now: FIXED_NOW });
    expect(ics).toContain('DTSTART:20261005T080000\r\n');
    expect(ics).toContain('DTEND:20261005T090000\r\n');
    expect(ics).not.toContain('080000Z');
  });

  it('falls back to floating time for an invalid zone', () => {
    const badTrip: PlannerTrip = { ...trip, timezone: 'Mars/Olympus_Mons' };
    const place = makePlace('khao-soi', { title: 'Khao Soi' });
    const visit = makeVisit('visit:ks-1', place.id, '2026-10-05', { start: '08:00', duration_minutes: 60 });
    const ics = buildTripCalendarIcs(badTrip, [place], [visit]);
    expect(ics).toContain('DTSTART:20261005T080000\r\n');
  });

  it('honors DST transitions on both sides of the spring-forward gap', () => {
    const nyTrip: PlannerTrip = {
      ...trip,
      timezone: 'America/New_York',
      start_date: '2026-03-08',
      end_date: '2026-03-08',
    };
    const early = makePlace('early', { title: 'Early' });
    const late = makePlace('late', { title: 'Late' });
    const vEarly = makeVisit('visit:e-1', early.id, '2026-03-08', { start: '01:30', duration_minutes: 30 });
    const vLate = makeVisit('visit:l-1', late.id, '2026-03-08', { start: '03:30', duration_minutes: 30 });
    const ics = buildTripCalendarIcs(nyTrip, [early, late], [vEarly, vLate], { now: FIXED_NOW });
    // 01:30 EST (UTC-5) = 06:30Z; 03:30 EDT (UTC-4) = 07:30Z
    expect(ics).toContain('DTSTART:20260308T063000Z\r\n');
    expect(ics).toContain('DTSTART:20260308T073000Z\r\n');
  });

  it('zonedWallTimeToUtcMs rejects malformed input', () => {
    expect(zonedWallTimeToUtcMs('2026-10-05', '08:00', 'Mars/Olympus_Mons')).toBeNull();
    expect(zonedWallTimeToUtcMs('not-a-date', '08:00', 'Asia/Bangkok')).toBeNull();
    expect(zonedWallTimeToUtcMs('2026-10-05', '8am', 'Asia/Bangkok')).toBeNull();
    expect(zonedWallTimeToUtcMs('2026-10-05', '08:00', 'Asia/Bangkok')).toBe(Date.UTC(2026, 9, 5, 1, 0, 0));
  });
});

describe('Travel-time inference → tentative ICS blocks', () => {
  const legAB = {
    schema_version: '0.1' as const,
    type: 'trip_leg' as const,
    id: 'leg:trip:place-a:place-b',
    trip_id: trip.id,
    from_place_id: 'place-a',
    to_place_id: 'place-b',
    mode: 'transit' as const,
    duration_minutes: 30,
    source: 'manual' as const,
    created_at: '2026-08-29T00:00:00Z',
  };

  it('projects a reachable untimed stop as TENTATIVE with inferred times', () => {
    const hotel = makePlace('place-a', { title: 'Hotel' });
    const temple = makePlace('place-b', { title: 'Temple' });
    const vA = makeVisit('visit:a-1', hotel.id, '2026-10-05', { start: '09:00', duration_minutes: 60 });
    const vB = makeVisit('visit:b-1', temple.id, '2026-10-05', { sort_order: 1 });
    const ics = buildTripCalendarIcs(trip, [hotel, temple], [vA, vB], { now: '2026-09-10', legs: [legAB] });
    // 09:00 + 60m stay + 30m leg = 10:30 arrival, default 60m duration.
    expect(ics).toContain('DTSTART:20261005T103000\r\n');
    expect(ics).toContain('DTEND:20261005T113000\r\n');
    expect(ics).toContain('STATUS:TENTATIVE\r\n');
    expect(ics).toContain('STATUS:CONFIRMED\r\n');
  });

  it('withholds alarms on tentative blocks but keeps them on fixed must visits', () => {
    const hotel = makePlace('place-a', { title: 'Hotel', priority: 'must' });
    const temple = makePlace('place-b', { title: 'Temple', priority: 'must' });
    const vA = makeVisit('visit:a-1', hotel.id, '2026-10-05', { start: '09:00', duration_minutes: 60 });
    const vB = makeVisit('visit:b-1', temple.id, '2026-10-05', { sort_order: 1 });
    const ics = buildTripCalendarIcs(trip, [hotel, temple], [vA, vB], { now: '2026-09-10', legs: [legAB] });
    expect(ics.match(/BEGIN:VALARM/g)?.length).toBe(1);
  });

  it('keeps pre-midnight unreachable stops as all-day tasks', () => {
    const bar = makePlace('place-a', { title: 'Bar' });
    const flight = makePlace('place-b', { title: 'Red Eye' });
    const vA = makeVisit('visit:a-1', bar.id, '2026-10-05', { sort_order: 0, duration_minutes: 120 });
    const vB = makeVisit('visit:b-1', flight.id, '2026-10-05', { sort_order: 1, start: '00:30', duration_minutes: 60 });
    const legs = [{
      schema_version: '0.1' as const,
      type: 'trip_leg' as const,
      id: 'leg:a:b',
      trip_id: trip.id,
      from_place_id: bar.id,
      to_place_id: flight.id,
      mode: 'transit' as const,
      duration_minutes: 30,
      source: 'manual' as const,
      created_at: '2026-08-29T00:00:00Z',
    }];
    const ics = buildTripCalendarIcs(trip, [bar, flight], [vA, vB], { now: '2026-09-10', legs });
    // 00:30 − 30m − 120m < 00:00 → no wrap, stays all-day.
    expect(ics).toContain('DTSTART;VALUE=DATE:20261005\r\n');
  });

  it('synthesizes heuristic legs when none are provided', () => {
    const hotel = makePlace('place-a', { title: 'Hotel' });
    const temple = makePlace('place-b', { title: 'Temple' });
    const vA = makeVisit('visit:a-1', hotel.id, '2026-10-05', { start: '09:00', duration_minutes: 60 });
    const vB = makeVisit('visit:b-1', temple.id, '2026-10-05', { sort_order: 1 });
    const ics = buildTripCalendarIcs(trip, [hotel, temple], [vA, vB], { now: '2026-09-10' });
    expect(ics).toContain('STATUS:TENTATIVE\r\n');
  });

  it('leaves no all-day bars on a fully untimed day: seed starts the chain', () => {
    const hotel = makePlace('place-a', { title: 'Hotel' });
    const temple = makePlace('place-b', { title: 'Temple' });
    const vA = makeVisit('visit:a-1', hotel.id, '2026-10-05', { sort_order: 0 });
    const vB = makeVisit('visit:b-1', temple.id, '2026-10-05', { sort_order: 1 });
    const ics = buildTripCalendarIcs(trip, [hotel, temple], [vA, vB], { now: '2026-09-10' });
    expect(ics).toContain('DTSTART:20261005T090000\r\n');
    expect(ics).toContain('STATUS:TENTATIVE\r\n');
    expect(ics).not.toContain('VALUE=DATE');
  });

  it('never chains inference across dates', () => {
    const a = makePlace('place-a', { title: 'Day One Stop' });
    const b = makePlace('place-b', { title: 'Day Two First' });
    const c = makePlace('place-c', { title: 'Day Two Second' });
    const vA = makeVisit('visit:a-1', a.id, '2026-10-05', { start: '09:00', duration_minutes: 60, sort_order: 0 });
    const vB = makeVisit('visit:b-2', b.id, '2026-10-06', { sort_order: 0 });
    const vC = makeVisit('visit:c-2', c.id, '2026-10-06', { sort_order: 1 });
    const legs = [{
      schema_version: '0.1' as const,
      type: 'trip_leg' as const,
      id: 'leg:a:b',
      trip_id: trip.id,
      from_place_id: a.id,
      to_place_id: b.id,
      mode: 'transit' as const,
      duration_minutes: 600,
      source: 'manual' as const,
      created_at: '2026-08-29T00:00:00Z',
    }];
    const ics = buildTripCalendarIcs(trip, [a, b, c], [vA, vB, vC], { now: '2026-09-10', legs });
    // Day two starts from the 09:00 seed, not from day one's evening chain.
    expect(ics).toContain('DTSTART:20261006T090000\r\n');
    expect(ics).not.toContain('VALUE=DATE');
  });

  it('carries floating midnight overflow into the next date', () => {
    const bar = makePlace('place-a', { title: 'Night Bar' });
    const vA = makeVisit('visit:a-1', bar.id, '2026-10-05', { start: '23:30', duration_minutes: 60, sort_order: 0, is_anchor: true });
    const ics = buildTripCalendarIcs(trip, [bar], [vA], { now: '2026-09-10' });
    expect(ics).toContain('DTSTART:20261005T233000\r\n');
    expect(ics).toContain('DTEND:20261006T003000\r\n');
  });

  it('treats a malformed stored start as untimed instead of emitting garbage', () => {
    const odd = makePlace('place-a', { title: 'Odd Stop' });
    const vA = makeVisit('visit:a-1', odd.id, '2026-10-05', { sort_order: 0 });
    (vA as unknown as Record<string, unknown>).start = '8am';
    const ics = buildTripCalendarIcs(trip, [odd], [vA], { now: '2026-09-10' });
    expect(ics).not.toContain('8am');
    // Treated as untimed: day seed projects a tentative block, never raw garbage.
    expect(ics).toContain('DTSTART:20261005T090000\r\n');
    expect(ics).toContain('STATUS:TENTATIVE\r\n');
  });

  it('falls back to the trip zone when a day override is invalid', () => {
    const zonedTrip: PlannerTrip = { ...trip, timezone: 'Asia/Bangkok', day_timezones: { '2026-10-05': 'Bogus/Zone' } };
    const placeA = makePlace('place-a', { title: 'Khao Soi' });
    const vA = makeVisit('visit:a-1', placeA.id, '2026-10-05', { start: '09:00', duration_minutes: 60 });
    const ics = buildTripCalendarIcs(zonedTrip, [placeA], [vA], { now: '2026-09-10' });
    expect(ics).toContain('DTSTART:20261005T020000Z\r\n');
  });

  it('emits no alarm for all-day must tasks', () => {
    const temple = makePlace('place-b', { title: 'Temple', priority: 'must' });
    const vB = makeVisit('visit:b-1', temple.id, '2026-10-05', {});
    const ics = buildTripCalendarIcs(trip, [temple], [vB], { now: '2026-09-10' });
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('includeAllDates bypasses the one-year window for manual downloads', () => {
    const old = makePlace('place-old', { title: 'Old Stop' });
    const vOld = makeVisit('visit:old-1', old.id, '2020-01-02', { start: '09:00', duration_minutes: 60 });
    const windowed = buildTripCalendarIcs(trip, [old], [vOld], { now: '2026-09-10' });
    expect(windowed).not.toContain('Old Stop');
    const full = buildTripCalendarIcs(trip, [old], [vOld], { now: '2026-09-10', includeAllDates: true });
    expect(full).toContain('Old Stop');
  });

  it('per-day override wins over the trip zone, other days fall back', () => {
    const multiTrip: PlannerTrip = {
      ...trip,
      timezone: 'Asia/Bangkok',
      day_timezones: { '2026-10-06': 'Asia/Tokyo' },
    };
    const bkk = makePlace('bkk', { title: 'Bangkok Day' });
    const tyo = makePlace('tyo', { title: 'Tokyo Day' });
    const vBkk = makeVisit('visit:b-1', bkk.id, '2026-10-05', { start: '09:00', duration_minutes: 60 });
    const vTyo = makeVisit('visit:t-1', tyo.id, '2026-10-06', { start: '09:00', duration_minutes: 60 });
    const ics = buildTripCalendarIcs(multiTrip, [bkk, tyo], [vBkk, vTyo], { now: FIXED_NOW });
    // 09:00 ICT (UTC+7) = 02:00Z; 09:00 JST (UTC+9) = 00:00Z
    expect(ics).toContain('DTSTART:20261005T020000Z\r\n');
    expect(ics).toContain('DTSTART:20261006T000000Z\r\n');
  });

  it('resolveTripTimeZoneForDate follows day → trip → undefined', () => {
    const multiTrip: PlannerTrip = {
      ...trip,
      timezone: 'Asia/Bangkok',
      day_timezones: { '2026-10-06': 'Asia/Tokyo', '2026-10-07': '  ' },
    };
    expect(resolveTripTimeZoneForDate(multiTrip, '2026-10-06')).toBe('Asia/Tokyo');
    expect(resolveTripTimeZoneForDate(multiTrip, '2026-10-05')).toBe('Asia/Bangkok');
    expect(resolveTripTimeZoneForDate(multiTrip, '2026-10-07')).toBe('Asia/Bangkok');
    expect(resolveTripTimeZoneForDate(trip, '2026-10-05')).toBeUndefined();
  });
});

describe('Account aggregate ICS (one subscription per account)', () => {
  const tripB: PlannerTrip = {
    ...trip,
    id: 'trip-japan-2027',
    title: 'Japan 2027',
    start_date: '2027-01-01',
    end_date: '2027-01-07',
    timezone: 'Asia/Tokyo',
  };
  const tripEmpty: PlannerTrip = {
    ...trip,
    id: 'trip-empty',
    title: 'Empty Trip',
    start_date: '2026-12-01',
    end_date: '2026-12-02',
  };

  it('aggregates trips in start-date order with title prefixes, skipping empty ones', () => {
    const placeA = makePlace('place-a', { title: 'Grand Palace' });
    const placeB = makePlace('place-b', { title: 'Sensoji', trip_id: tripB.id });
    const vA = makeVisit('visit:a-1', placeA.id, '2026-10-05', { start: '09:00', duration_minutes: 60 });
    const vB = makeVisit('visit:b-1', placeB.id, '2027-01-02', { start: '10:00', duration_minutes: 60, trip_id: tripB.id });
    const { ics, tripCount, eventCount } = buildAccountCalendarIcs(
      [tripB, trip, tripEmpty],
      [placeA, placeB],
      [vA, vB],
      { now: '2026-09-10' },
    );

    expect(tripCount).toBe(2);
    expect(eventCount).toBe(2);
    expect(ics).toContain('X-WR-CALNAME:Ownly');
    // Event titles stay plain (ticket logic): no trip-name prefix.
    expect(ics).not.toContain('【');
    expect(ics).toContain('Grand Palace');
    expect(ics).toContain('Sensoji');
    expect(ics).not.toContain('Empty Trip');
    // Trip order follows start_date regardless of input order.
    expect(ics.indexOf('Grand Palace')).toBeLessThan(ics.indexOf('Sensoji'));
  });

  it('keeps per-trip timezones inside the aggregate', () => {
    const zonedTrip: PlannerTrip = { ...trip, timezone: 'Asia/Bangkok' };
    const placeA = makePlace('place-a', { title: 'Khao Soi' });
    const placeB = makePlace('place-b', { title: 'Sensoji', trip_id: tripB.id });
    const vA = makeVisit('visit:a-1', placeA.id, '2026-10-05', { start: '08:00', duration_minutes: 60 });
    const vB = makeVisit('visit:b-1', placeB.id, '2027-01-02', { start: '09:00', duration_minutes: 60, trip_id: tripB.id });
    const { ics } = buildAccountCalendarIcs(
      [zonedTrip, tripB],
      [placeA, placeB],
      [vA, vB],
      { now: '2026-09-10' },
    );
    // 08:00 ICT = 01:00Z; 09:00 JST = 00:00Z
    expect(ics).toContain('DTSTART:20261005T010000Z\r\n');
    expect(ics).toContain('DTSTART:20270102T000000Z\r\n');
  });
});
