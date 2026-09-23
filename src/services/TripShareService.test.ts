import { describe, expect, it } from 'vitest';
import {
  buildPublicShareResponse,
  MemoryTripShareStore,
  TripShareService,
} from './TripShareService';
import { hashFeedToken } from '../domain/calendar-feed';
import type { PlannerTrip, PlannerTripPlace } from '../domain/planner';
import type { PlannerTripVisit } from '../domain/planner-visits';

function trip(overrides: Partial<PlannerTrip> = {}): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: '清迈 5 日',
    status: 'active',
    start_date: '2026-10-05',
    end_date: '2026-10-07',
    destinations: ['Thailand'],
    currency: 'THB',
    transport_mode: 'driving',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
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

const PLACES = [place('p1', 'Grand Palace')];
const VISITS = [visit('v1', 'p1', '2026-10-05')];

describe('TripShareService', () => {
  it('requires a PRO membership', async () => {
    const service = new TripShareService(new MemoryTripShareStore());
    await expect(
      service.publishShare({
        trip: trip(),
        places: PLACES,
        visits: VISITS,
        membership: { isPro: false },
        userId: 'ownly_user',
        alias: '清迈 5 日',
      }),
    ).rejects.toThrow(/PRO/);
  });

  it('requires a user id and a valid name', async () => {
    const service = new TripShareService(new MemoryTripShareStore());
    await expect(
      service.publishShare({
        trip: trip(),
        places: PLACES,
        visits: VISITS,
        membership: { isPro: true },
        userId: '',
        alias: '清迈 5 日',
      }),
    ).rejects.toThrow(/User ID/);
    await expect(
      service.publishShare({
        trip: trip(),
        places: PLACES,
        visits: VISITS,
        membership: { isPro: true },
        userId: 'ownly_user',
        alias: 'a/b',
      }),
    ).rejects.toThrow(/行程名/);
  });

  it('publishes self-contained HTML under the trip name, always excluding expenses', async () => {
    const store = new MemoryTripShareStore();
    const service = new TripShareService(store);
    const response = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
      language: 'zh',
      now: '2026-10-01T00:00:00.000Z',
    });

    expect(response.share.alias).toBe('清迈 5 日');
    expect(decodeURIComponent(response.url.split('/').pop() ?? '')).toBe('清迈 5 日');
    expect(response.html).toContain('Grand Palace');
    expect(response.html).toContain('该快照未包含费用');
    expect(response.html).not.toContain('<script');
    expect(response.write_token).toHaveLength(32);

    const record = store.getShareByAlias('清迈 5 日');
    expect(record?.enabled).toBe(true);
    expect(record?.html_content).toBe(response.html);
  });

  it('reuses an owner write token to update the same row in place', async () => {
    const store = new MemoryTripShareStore();
    const service = new TripShareService(store);
    const first = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
    });
    const second = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
      writeToken: first.write_token,
      now: '2026-10-02T00:00:00.000Z',
    });
    expect(second.write_token).toBe(first.write_token);
    expect(store.getShareByAlias('清迈 5 日')?.write_token_hash).toBe(await hashFeedToken(first.write_token));
    expect(store.getShareByAlias('清迈 5 日')?.updated_at).toBe('2026-10-02T00:00:00.000Z');
  });

  it('auto-suffixes when the trip name is already taken by another share', async () => {
    const store = new MemoryTripShareStore();
    const service = new TripShareService(store);
    const first = await service.publishShare({
      trip: trip({ id: 'trip-1' }),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
    });
    const second = await service.publishShare({
      trip: trip({ id: 'trip-2' }),
      places: [],
      visits: [],
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
    });
    expect(first.share.alias).toBe('清迈 5 日');
    expect(second.share.alias).toBe('清迈 5 日-2');
  });

  it('disables only with the matching write capability', async () => {
    const store = new MemoryTripShareStore();
    const service = new TripShareService(store);
    const response = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
    });

    await service.disableShare({
      tripId: 'trip-1',
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
      writeToken: 'wrong-token',
    });
    expect(store.getShareByAlias('清迈 5 日')?.enabled).toBe(true);

    const disabled = await service.disableShare({
      tripId: 'trip-1',
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: '清迈 5 日',
      writeToken: response.write_token,
    });
    expect(disabled.enabled).toBe(false);
    expect(store.getShareByAlias('清迈 5 日')?.enabled).toBe(false);
  });
});

describe('buildPublicShareResponse', () => {
  it('404s for missing or disabled shares', () => {
    expect(buildPublicShareResponse(null).status).toBe(404);
    expect(
      buildPublicShareResponse({
        user_id: 'u',
        trip_id: 't',
        alias: '清迈 5 日',
        write_token_hash: 'x',
        html_content: '<html></html>',
        enabled: false,
      }).status,
    ).toBe(404);
  });

  it('serves the HTML with a strict, noindex header set', () => {
    const response = buildPublicShareResponse({
      user_id: 'u',
      trip_id: 't',
      alias: '清迈 5 日',
      write_token_hash: 'x',
      html_content: '<html></html>',
      enabled: true,
    });
    expect(response.status).toBe(200);
    expect(response.body).toBe('<html></html>');
    expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(response.headers['X-Robots-Tag']).toContain('noindex');
    expect(response.headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(response.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });
});
