import { describe, expect, it } from 'vitest';
import {
  buildPublicShareResponse,
  MemoryTripShareStore,
  TripShareService,
} from './TripShareService';
import { hashFeedToken } from '../domain/calendar-feed';
import type { PlannerTrip, PlannerTripPlace } from '../domain/planner';
import type { PlannerTripVisit } from '../domain/planner-visits';

function trip(): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: 'Bangkok Week',
    status: 'active',
    start_date: '2026-10-05',
    end_date: '2026-10-07',
    destinations: ['Thailand'],
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
        alias: 'TH26',
      }),
    ).rejects.toThrow(/PRO/);
  });

  it('requires a user id and a valid alias', async () => {
    const service = new TripShareService(new MemoryTripShareStore());
    await expect(
      service.publishShare({
        trip: trip(),
        places: PLACES,
        visits: VISITS,
        membership: { isPro: true },
        userId: '',
        alias: 'TH26',
      }),
    ).rejects.toThrow(/User ID/);
    await expect(
      service.publishShare({
        trip: trip(),
        places: PLACES,
        visits: VISITS,
        membership: { isPro: true },
        userId: 'ownly_user',
        alias: 'not valid!',
      }),
    ).rejects.toThrow(/别名/);
  });

  it('publishes self-contained HTML that always excludes expenses', async () => {
    const store = new MemoryTripShareStore();
    const service = new TripShareService(store);
    const response = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: 'th26',
      language: 'zh',
      now: '2026-10-01T00:00:00.000Z',
    });

    expect(response.share.alias).toBe('TH26');
    expect(response.url).toContain('/functions/v1/trip-share/TH26');
    expect(response.html).toContain('Grand Palace');
    expect(response.html).toContain('该快照未包含费用');
    expect(response.html).not.toContain('<script');
    expect(response.write_token).toHaveLength(32);

    const record = store.getShareByAlias('TH26');
    expect(record?.enabled).toBe(true);
    expect(record?.html_content).toBe(response.html);
  });

  it('reuses an owner write token to update the same alias row in place', async () => {
    const store = new MemoryTripShareStore();
    const service = new TripShareService(store);
    const first = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: 'TH26',
    });
    const second = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: 'TH26',
      writeToken: first.write_token,
      now: '2026-10-02T00:00:00.000Z',
    });
    expect(second.write_token).toBe(first.write_token);
    expect(store.getShareByAlias('TH26')?.write_token_hash).toBe(await hashFeedToken(first.write_token));
    expect(store.getShareByAlias('TH26')?.updated_at).toBe('2026-10-02T00:00:00.000Z');
  });

  it('rotates by revoking the old alias and publishing the new one', async () => {
    const store = new MemoryTripShareStore();
    const service = new TripShareService(store);
    const first = await service.publishShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: 'TH26',
    });
    await service.rotateShare({
      trip: trip(),
      places: PLACES,
      visits: VISITS,
      membership: { isPro: true },
      userId: 'ownly_user',
      currentAlias: 'TH26',
      currentWriteToken: first.write_token,
      newAlias: 'TH27',
    });
    expect(store.getShareByAlias('TH26')?.enabled).toBe(false);
    expect(store.getShareByAlias('TH27')?.enabled).toBe(true);
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
      alias: 'TH26',
    });

    await service.disableShare({
      tripId: 'trip-1',
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: 'TH26',
      writeToken: 'wrong-token',
    });
    expect(store.getShareByAlias('TH26')?.enabled).toBe(true);

    const disabled = await service.disableShare({
      tripId: 'trip-1',
      membership: { isPro: true },
      userId: 'ownly_user',
      alias: 'TH26',
      writeToken: response.write_token,
    });
    expect(disabled.enabled).toBe(false);
    expect(store.getShareByAlias('TH26')?.enabled).toBe(false);
  });
});

describe('buildPublicShareResponse', () => {
  it('404s for missing or disabled shares', () => {
    expect(buildPublicShareResponse(null).status).toBe(404);
    expect(
      buildPublicShareResponse({
        user_id: 'u',
        trip_id: 't',
        alias: 'TH26',
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
      alias: 'TH26',
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
