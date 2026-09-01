import { beforeEach, describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '../domain/planner';
import type { PlannerTripVisit } from '../domain/planner-visits';
import {
  CalendarFeedService,
  MemoryCalendarFeedStore,
} from './CalendarFeedService';

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
      }),
    ).rejects.toThrow(/PRO membership is required/i);
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

  it('rotates bearer token, invalidates previous URL with 404, and enables new URL', async () => {
    const published = await service.publishFeed({
      trip,
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
    });

    const tripWithFeed = { ...trip, calendar_feed: published.feed };

    const rotated = await service.rotateFeed({
      trip: tripWithFeed,
      membership: { isPro: true },
    });

    expect(rotated.feed.feed_token).not.toBe(published.feed.feed_token);
    expect(rotated.feed.enabled).toBe(true);

    // Old token should now be revoked (404)
    const oldResponse = await service.handlePublicFeedRequest(published.feed.feed_token);
    expect(oldResponse.status).toBe(404);

    // Re-publish under new token
    await service.publishFeed({
      trip: { ...trip, calendar_feed: rotated.feed },
      places: [palace],
      visits: [visit1],
      membership: { isPro: true },
      feedToken: rotated.feed.feed_token,
    });

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
    });

    const tripWithFeed = { ...trip, calendar_feed: published.feed };

    const disabledFeed = await service.disableFeed({
      trip: tripWithFeed,
      membership: { isPro: true },
    });

    expect(disabledFeed.enabled).toBe(false);

    const res = await service.handlePublicFeedRequest(published.feed.feed_token);
    expect(res.status).toBe(404);
  });
});
