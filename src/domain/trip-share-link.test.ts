import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import { createShareableTripBundle } from './trip-bundle';
import {
  buildTripShareUrl,
  decodeTripSharePayload,
  encodeTripSharePayload,
  extractTripSharePayload,
  parseTripShareHash,
} from './trip-share-link';

function fixtureBundle() {
  const trip: PlannerTrip = {
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-source',
    title: 'Thailand 2026',
    status: 'planning',
    start_date: '2026-10-04',
    end_date: '2026-10-14',
    destinations: ['Bangkok', 'Chiang Mai'],
    currency: 'THB',
    members: ['Alice', 'Bob'],
    calendar_feed: {
      feed_token: 'secret-token',
      trip_id: 'trip-source',
      created_at: '2026-09-02T00:00:00.000Z',
      updated_at: '2026-09-02T00:00:00.000Z',
      enabled: true,
    },
    created_at: '2026-09-02T00:00:00.000Z',
  };
  const place: PlannerTripPlace = {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'place-1',
    trip_id: trip.id,
    title: 'Wat Arun',
    source_provider: 'google_maps',
    source_url: 'https://maps.google.com/?cid=1',
    kind: 'attraction',
    tags: ['Bangkok'],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-09-02T00:00:00.000Z',
  };
  return createShareableTripBundle(trip, [place], [], [], '2026-09-02T00:00:00.000Z');
}

describe('Trip social share links', () => {
  it('round-trips a portable bundle through a raw URL-safe payload', async () => {
    const bundle = fixtureBundle();
    const payload = await encodeTripSharePayload(bundle, { compress: false });
    expect(payload.startsWith('r.')).toBe(true);
    expect(payload).not.toContain('+');
    expect(payload).not.toContain('/');

    const decoded = await decodeTripSharePayload(payload);
    expect(decoded.trip.title).toBe('Thailand 2026');
    expect(decoded.places).toHaveLength(1);
    expect(decoded.trip.members).toBeUndefined();
    expect(decoded.trip.calendar_feed).toBeUndefined();
  });

  it('builds and parses a share hash without sending the bundle in the query string', async () => {
    const bundle = fixtureBundle();
    const url = await buildTripShareUrl(bundle, 'https://example.com/ownly/app/?utm_source=test#old');
    expect(url).toContain('/app/?utm_source=test#ownly-trip=');
    expect(url).not.toContain('?ownly-trip=');

    const hash = `#ownly-trip=${extractTripSharePayload(url.split('#')[1])}`;
    const parsed = await parseTripShareHash(hash);
    expect(parsed?.trip.title).toBe(bundle.trip.title);
  });

  it('returns null for ordinary app hashes', async () => {
    expect(await parseTripShareHash('#section=planner')).toBeNull();
  });

  it('throws friendly truncation error when payload is cut short', async () => {
    const bundle = fixtureBundle();
    const payload = await encodeTripSharePayload(bundle);
    const truncated = payload.slice(0, Math.floor(payload.length / 2));
    await expect(decodeTripSharePayload(truncated)).rejects.toThrow('截断');
  });
});
