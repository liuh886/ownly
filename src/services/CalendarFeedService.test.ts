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
    });

    expect(result.feed.trip_id).toBe('trip-feed-test');
    expect(result.feed.feed_token).toHaveLength(32);
    expect(result.feed.enabled).toBe(true);
    expect(result.url).toBe(`https://calendar.ownly.app/f/${result.feed.feed_token}.ics`);
    expect(result.ics).toContain('BEGIN:VCALENDAR');
    expect(result.ics).toContain('Grand Palace');

    // Verify subscriber public endpoint resolution
    const publicResponse = await service.handlePublicFeedRequest(result.feed.feed_token);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(publicResponse.headers['Cache-Control']).toContain('public, max-age=1800');
    expect(publicResponse.body).toBe(result.ics);
  });

  it('rotates bearer token, immediately persists new ICS projection, and revokes old URL', async () => {
    const published = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
    });

    const tripWithFeed = { ...trip, calendar_feed: published.feed };

    const rotated = await service.rotateFeed({
      trip: tripWithFeed,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      userId: 'user_123',
    });

    expect(rotated.feed.feed_token).not.toBe(published.feed.feed_token);
    expect(rotated.feed.enabled).toBe(true);
    expect(rotated.ics).toContain('Grand Palace');

    // Old token should now be revoked (404)
    const oldResponse = await service.handlePublicFeedRequest(published.feed.feed_token);
    expect(oldResponse.status).toBe(404);

    // New token immediately serves the ICS projection without extra steps
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
});

describe('SupabaseCalendarFeedStore (Production Adapter)', () => {
  it('upserts feed records to Supabase PostgREST endpoint with correct headers and payload', async () => {
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
      'https://test.supabase.co/rest/v1/calendar_feeds',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'test-anon-key',
          Authorization: 'Bearer test-anon-key',
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        }),
      }),
    );
  });

  it('queries enabled feed by token hash from Supabase', async () => {
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
  });
});

