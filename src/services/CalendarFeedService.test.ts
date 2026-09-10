import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '../domain/planner';
import type { PlannerTripVisit } from '../domain/planner-visits';
import {
  CalendarFeedService,
  MemoryCalendarFeedStore,
} from './CalendarFeedService';
import { SupabaseCalendarFeedStore } from './SupabaseCalendarFeedStore';

const trip: PlannerTrip = {
  schema_version: '0.1',
  type: 'trip',
  id: 'trip-feed-test',
  title: 'Bangkok Explorer 2026',
  status: 'planning',
  start_date: '2026-11-01',
  end_date: '2026-11-05',
  destinations: ['Bangkok'],
  created_at: '2026-08-30T00:00:00Z',
};

const palace: PlannerTripPlace = {
  schema_version: '0.1',
  type: 'trip_place',
  id: 'place-palace',
  trip_id: trip.id,
  title: 'Grand Palace',
  source_provider: 'google_maps',
  source_url: 'https://maps.google.com/?cid=palace',
  kind: 'attraction',
  tags: [],
  signals: [],
  risks: [],
  reservation_status: 'none',
  state: 'candidate',
  created_at: '2026-08-30T00:00:00Z',
};

const visit1: PlannerTripVisit = {
  schema_version: '0.1',
  type: 'trip_visit',
  id: 'visit-palace-morning',
  trip_id: trip.id,
  place_id: palace.id,
  date: '2026-11-01',
  start: '09:00',
  duration_minutes: 120,
  sort_order: 0,
  locked: true,
  is_anchor: false,
  created_at: '2026-08-30T00:00:00Z',
};

describe('CalendarFeedService (PRO)', () => {
  let store: MemoryCalendarFeedStore;
  let service: CalendarFeedService;

  beforeEach(() => {
    store = new MemoryCalendarFeedStore();
    service = new CalendarFeedService(store);
  });

  it('rejects Free membership attempts to publish live Calendar Feeds', async () => {
    await expect(
      service.publishFeed({
        trip,
        places: [palace],
        visits: [visit1],
        membership: { isPro: false },
        userId: 'user_123',
      }),
    ).rejects.toThrow(/PRO membership is required/i);
  });

  it('rejects calls when userId is empty', async () => {
    await expect(
      service.publishFeed({
        trip,
        places: [palace],
        visits: [visit1],
        membership: { isPro: true },
        userId: '',
      }),
    ).rejects.toThrow(/User ID is required/i);
  });

  it('allows PRO membership to publish feed, stores hashed token, and generates immutable subscription URL', async () => {
    const result = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
      options: { now: new Date('2026-09-01T00:00:00Z') },
    });

    expect(result.feed.trip_id).toBe('trip-feed-test');
    expect(result.feed.feed_token).toHaveLength(32);
    expect(result.feed.enabled).toBe(true);
    expect(result.url).toBe(
      `https://blgwlycfcwvsupmqyqwn.supabase.co/functions/v1/calendar-feed/${result.feed.feed_token}.ics`,
    );
    expect(result.ics).toContain('BEGIN:VCALENDAR');
    expect(result.ics).toContain('Grand Palace');

    const publicResponse = await service.handlePublicFeedRequest(result.feed.feed_token);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(publicResponse.headers['Cache-Control']).toContain('public, max-age=1800');
    expect(publicResponse.body).toBe(result.ics);
  });

  it('keeps the same token and URL across re-publishes (stable subscription address)', async () => {
    const first = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
    });
    const second = await service.publishFeed({
      trip: { ...trip, calendar_feed: first.feed },
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
    });
    expect(second.feed.feed_token).toBe(first.feed.feed_token);
    expect(second.url).toBe(first.url);
    expect(second.feed.created_at).toBe(first.feed.created_at);
  });

  it('skips visits older than one year in the published ICS', async () => {
    const oldVisit: PlannerTripVisit = {
      ...visit1,
      id: 'visit-palace-old',
      date: '2020-01-02',
    };
    const result = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1, oldVisit],
      membership: { isPro: true },
      userId: 'user_123',
      options: { now: new Date('2026-09-01T00:00:00Z') },
    });
    expect(result.ics).toContain('UID:visit-palace-morning@ownly');
    expect(result.ics).not.toContain('UID:visit-palace-old@ownly');
  });
  it('rotates bearer token, immediately persists new ICS projection, and revokes old URL', async () => {
    const published = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
      options: { now: new Date('2026-09-01T00:00:00Z') },
    });

    const tripWithFeed = { ...trip, calendar_feed: published.feed };

    const rotated = await service.rotateFeed({
      trip: tripWithFeed,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
      options: { now: new Date('2026-09-01T00:00:00Z') },
    });

    expect(rotated.feed.feed_token).not.toBe(published.feed.feed_token);
    expect(rotated.feed.enabled).toBe(true);
    expect(rotated.ics).toContain('Grand Palace');

    const oldResponse = await service.handlePublicFeedRequest(published.feed.feed_token);
    expect(oldResponse.status).toBe(404);

    const newResponse = await service.handlePublicFeedRequest(rotated.feed.feed_token);
    expect(newResponse.status).toBe(200);
    expect(newResponse.body).toContain('Grand Palace');
  });

  it('disables calendar feed and returns 404 for subsequent subscriber requests', async () => {
    const published = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
    });

    const tripWithFeed = { ...trip, calendar_feed: published.feed };

    const disabledFeed = await service.disableFeed({
      trip: tripWithFeed,
      membership: { isPro: true },
      userId: 'user_123',
    });

    expect(disabledFeed.enabled).toBe(false);

    const res = await service.handlePublicFeedRequest(published.feed.feed_token);
    expect(res.status).toBe(404);
  });

  it('revokes across account-id changes: capability, not user_id, authorizes disable', async () => {
    const published = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'ownly_user',
      options: { now: '2026-09-10' },
    });

    const tripWithFeed = { ...trip, calendar_feed: published.feed };

    // Upgraded identity disables with the same bearer token: must 404.
    await service.disableFeed({
      trip: tripWithFeed,
      membership: { isPro: true },
      userId: 'user_pro_AB12',
    });
    const res = await service.handlePublicFeedRequest(published.feed.feed_token);
    expect(res.status).toBe(404);
  });
  it('publishes one account feed aggregating all trips under trip_id "*"', async () => {
    const trip2: PlannerTrip = {
      ...trip,
      id: 'trip-feed-test-2',
      title: 'Chiang Mai Escape',
      start_date: '2026-12-01',
      end_date: '2026-12-03',
    };
    const doiSuthep: PlannerTripPlace = {
      ...palace,
      id: 'place-doi',
      trip_id: trip2.id,
      title: 'Doi Suthep',
    };
    const visit2: PlannerTripVisit = {
      ...visit1,
      id: 'visit-doi-morning',
      trip_id: trip2.id,
      place_id: doiSuthep.id,
      date: '2026-12-01',
    };
    const result = await service.publishAccountFeed({
      trips: [trip, trip2],
      places: [palace, doiSuthep],
      visits: [visit1, visit2],
      membership: { isPro: true },
      userId: 'user_123',
      options: { now: '2026-09-10' },
    });

    expect(result.feed.trip_id).toBe('*');
    expect(result.tripCount).toBe(2);
    expect(result.eventCount).toBe(2);
    expect(result.ics).toContain('X-WR-CALNAME:Ownly');
    expect(result.ics).not.toContain('【');
    expect(result.url).toContain('/functions/v1/calendar-feed/');

    // Same token refresh keeps the URL stable and serves the aggregate.
    const refresh = await service.publishAccountFeed({
      trips: [trip, trip2],
      places: [palace, doiSuthep],
      visits: [visit1, visit2],
      membership: { isPro: true },
      userId: 'user_123',
      feedToken: result.feed.feed_token,
      options: { now: '2026-09-10' },
    });
    expect(refresh.url).toBe(result.url);
    const served = await service.handlePublicFeedRequest(result.feed.feed_token);
    expect(served.status).toBe(200);
    expect(served.body).toContain('Grand Palace');
    expect(served.body).toContain('Doi Suthep');
  });

  it('projects travel-time inference as TENTATIVE when legs are provided', async () => {
    const annex: PlannerTripPlace = {
      ...palace,
      id: 'place-annex',
      title: 'Annex Hall',
    };
    const visitAnnex: PlannerTripVisit = {
      ...visit1,
      id: 'visit-annex',
      place_id: annex.id,
      sort_order: 1,
      start: undefined,
      duration_minutes: undefined,
    };
    const result = await service.publishFeed({
      trip,
      places: [palace, annex],
      visits: [visit1, visitAnnex],
      membership: { isPro: true },
      userId: 'user_123',
      options: { now: '2026-09-10' },
      legs: [
        {
          schema_version: '0.1',
          type: 'trip_leg',
          id: 'leg:trip:palace:annex',
          trip_id: trip.id,
          from_place_id: palace.id,
          to_place_id: annex.id,
          mode: 'transit',
          duration_minutes: 30,
          source: 'manual',
          created_at: '2026-08-30T00:00:00Z',
        },
      ],
    });
    // 09:00 + 120m + 30m leg = 11:30 inferred arrival.
    expect(result.ics).toContain('DTSTART:20261101T113000\r\n');
    expect(result.ics).toContain('STATUS:TENTATIVE\r\n');
  });

  it('rotates and disables the account feed by token', async () => {
    const first = await service.publishAccountFeed({
      trips: [trip],
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
      options: { now: '2026-09-10' },
    });
    const rotated = await service.rotateAccountFeed({
      trips: [trip],
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
      currentFeedToken: first.feed.feed_token,
      options: { now: '2026-09-10' },
    });
    expect(rotated.feed.feed_token).not.toBe(first.feed.feed_token);
    expect(rotated.feed.trip_id).toBe('*');
    expect((await service.handlePublicFeedRequest(first.feed.feed_token)).status).toBe(404);

    await service.disableAccountFeed({
      membership: { isPro: true },
      userId: 'user_123',
      feedToken: rotated.feed.feed_token,
    });
    expect((await service.handlePublicFeedRequest(rotated.feed.feed_token)).status).toBe(404);
  });

});

describe('SupabaseCalendarFeedStore (Production Adapter)', () => {
  it('upserts feed records using token_hash as the explicit conflict target and RLS capability', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'feed-1' }],
    });

    const store = new SupabaseCalendarFeedStore({
      supabaseUrl: 'https://test.supabase.co',
      supabasePublishableKey: 'test-anon-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await store.upsertFeed({
      user_id: 'user_abc',
      trip_id: 'trip_123',
      token_hash: 'hash_xyz',
      ics_content: 'BEGIN:VCALENDAR...',
      enabled: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/rest/v1/ownly_calendar_feeds?on_conflict=token_hash',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'test-anon-key',
          Authorization: 'Bearer test-anon-key',
          'x-ownly-feed-hash': 'hash_xyz',
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        }),
      }),
    );
  });

  it('queries enabled feed by token hash with the same capability header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'feed-1',
          user_id: 'user_abc',
          trip_id: 'trip_123',
          token_hash: 'hash_xyz',
          ics_content: 'BEGIN:VCALENDAR...',
          enabled: true,
        },
      ],
    });

    const store = new SupabaseCalendarFeedStore({
      supabaseUrl: 'https://test.supabase.co',
      supabasePublishableKey: 'test-anon-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const record = await store.getFeedByTokenHash('hash_xyz');
    expect(record?.trip_id).toBe('trip_123');
    expect(record?.token_hash).toBe('hash_xyz');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/ownly_calendar_feeds?'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-ownly-feed-hash': 'hash_xyz' }),
      }),
    );
  });

});
