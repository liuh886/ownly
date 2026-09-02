import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripLeg, PlannerTripPlace } from './planner';
import type { PlannerTripVisit } from './planner-visits';
import { createShareableTripBundle, instantiateTripBundle, parseTripBundle } from './trip-bundle';

const trip: PlannerTrip = {
  schema_version: '0.1',
  type: 'trip',
  id: 'trip-original',
  title: 'Thailand 2026',
  status: 'active',
  start_date: '2026-10-04',
  end_date: '2026-10-14',
  destinations: ['Bangkok', 'Chiang Mai'],
  currency: 'THB',
  members: ['Alice', 'Bob'],
  calendar_feed: {
    feed_token: 'secret-token',
    trip_id: 'trip-original',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    enabled: true,
  },
  ignored_duplicate_pair_ids: ['private-pair'],
  created_at: '2026-09-01T00:00:00.000Z',
};

const place: PlannerTripPlace = {
  schema_version: '0.1',
  type: 'trip_place',
  id: 'place-a',
  trip_id: trip.id,
  title: 'Wat Arun',
  source_provider: 'google_maps',
  source_url: 'https://maps.google.com/example',
  kind: 'attraction',
  tags: ['景点'],
  signals: [],
  risks: [],
  reservation_status: 'none',
  state: 'candidate',
  created_at: '2026-09-01T00:00:00.000Z',
};

const visit: PlannerTripVisit = {
  schema_version: '0.1',
  type: 'trip_visit',
  id: 'visit:a',
  trip_id: trip.id,
  place_id: place.id,
  date: '2026-10-05',
  sort_order: 0,
  locked: false,
  is_anchor: false,
  created_at: '2026-09-01T00:00:00.000Z',
};

const secondPlace: PlannerTripPlace = { ...place, id: 'place-b', title: 'Grand Palace' };
const leg: PlannerTripLeg = {
  schema_version: '0.1',
  type: 'trip_leg',
  id: 'leg-old',
  trip_id: trip.id,
  from_place_id: place.id,
  to_place_id: secondPlace.id,
  mode: 'walking',
  duration_minutes: 12,
  source: 'manual',
  created_at: '2026-09-01T00:00:00.000Z',
};

describe('Ownly Trip Bundle', () => {
  it('removes ledger participants and calendar secrets from the share payload', () => {
    const bundle = createShareableTripBundle(trip, [place, secondPlace], [visit], [leg], '2026-09-02T00:00:00.000Z');
    expect(bundle.trip.members).toBeUndefined();
    expect(bundle.trip.calendar_feed).toBeUndefined();
    expect(bundle.trip.ignored_duplicate_pair_ids).toBeUndefined();
    expect(bundle.privacy.expenses).toBe('excluded');
    expect(JSON.stringify(bundle)).not.toContain('secret-token');
    expect(JSON.stringify(bundle)).not.toContain('Alice');
  });

  it('round-trips a valid JSON bundle while ignoring injected private trip fields', () => {
    const bundle = createShareableTripBundle(trip, [place, secondPlace], [visit], [leg]);
    const injected = JSON.parse(JSON.stringify(bundle));
    injected.trip.members = ['Injected Person'];
    injected.trip.calendar_feed = trip.calendar_feed;
    injected.expenses = [{ title: 'must never import' }];
    const parsed = parseTripBundle(JSON.stringify(injected));
    expect(parsed.trip.members).toBeUndefined();
    expect(parsed.trip.calendar_feed).toBeUndefined();
    expect((parsed as unknown as { expenses?: unknown }).expenses).toBeUndefined();
  });

  it('creates a fully independent editable copy with remapped references', () => {
    const bundle = createShareableTripBundle(trip, [place, secondPlace], [visit], [leg]);
    const ids = ['trip-new', 'place-new-a', 'place-new-b', 'visit-new'];
    const copy = instantiateTripBundle(bundle, () => ids.shift()!, '2026-09-02T01:00:00.000Z');

    expect(copy.trip.id).toBe('trip-new');
    expect(copy.trip.status).toBe('planning');
    expect(copy.trip.members).toBeUndefined();
    expect(copy.places.map((item) => item.id)).toEqual(['place-new-a', 'place-new-b']);
    expect(copy.places.every((item) => item.trip_id === 'trip-new')).toBe(true);
    expect(copy.visits[0].id).toBe('visit:visit-new');
    expect(copy.visits[0].place_id).toBe('place-new-a');
    expect(copy.legs[0].from_place_id).toBe('place-new-a');
    expect(copy.legs[0].to_place_id).toBe('place-new-b');
    expect(copy.legs[0].trip_id).toBe('trip-new');
  });

  it('rejects broken references before any import can be attempted', () => {
    const bundle = createShareableTripBundle(trip, [place], [visit], []);
    bundle.visits[0].place_id = 'missing-place';
    expect(() => parseTripBundle(JSON.stringify(bundle))).toThrow(/无效地点/);
  });
});
