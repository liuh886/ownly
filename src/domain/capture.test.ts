import { describe, it, expect } from 'vitest';
import {
  buildCollectionExport,
  isCollectionExport,
  parseCaptureCollectionExport,
  capturePlaceToPlannerPlace,
  findExistingPlace,
  findExistingPlaceByIdentity,
  placesShareStrongIdentity,
  reorderPlaces,
  mergePlaceResearch,
  migrateV2ToV3,
  type CapturePlace,
  type CaptureCollection,
  type OwnlyCaptureStateV3,
  type OwnlyCaptureStateV2,
} from './capture';

function makePlace(overrides: Partial<CapturePlace> = {}): CapturePlace {
  return {
    id: overrides.id || 'pl-1',
    collection_id: overrides.collection_id || 'col-1',
    title: overrides.title || 'Test Place',
    source: overrides.source || { provider: 'google_maps', url: 'https://maps.example.com/place/1' },
    inferred_kind: overrides.inferred_kind || 'food',
    captured_at: '2025-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeCollection(overrides: Partial<CaptureCollection> = {}): CaptureCollection {
  return {
    id: overrides.id || 'col-1',
    title: overrides.title || 'Test Collection',
    created_at: '2025-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildCollectionExport', () => {
  it('produces valid OwnlyCollectionExportV1', () => {
    const collection = makeCollection({ title: 'Bangkok Food' });
    const places = [makePlace({ title: 'Pad Thai Shop' }), makePlace({ id: 'pl-2', title: 'Som Tam Stand' })];
    const exportData = buildCollectionExport(collection, places);

    expect(exportData.schema).toBe('ownly.capture.collection');
    expect(exportData.version).toBe(1);
    expect(exportData.collection.title).toBe('Bangkok Food');
    expect(exportData.collection.place_count).toBe(2);
    expect(exportData.places).toHaveLength(2);
    expect(exportData.exported_at).toBeDefined();
  });
});

describe('isCollectionExport / parseCaptureCollectionExport', () => {
  it('recognises valid export', () => {
    const valid = {
      schema: 'ownly.capture.collection',
      version: 1,
      exported_at: '2025-01-15T10:00:00.000Z',
      collection: { id: 'c1', title: 'Trip', place_count: 1 },
      places: [makePlace()],
    };
    expect(isCollectionExport(valid)).toBe(true);
    expect(parseCaptureCollectionExport(valid)).not.toBeNull();
  });

  it('rejects missing schema', () => {
    expect(isCollectionExport({ version: 1, collection: {}, places: [] })).toBe(false);
  });

  it('rejects missing places array via parse', () => {
    const invalid = { schema: 'ownly.capture.collection', version: 1, collection: {}, places: 'not-array' };
    expect(isCollectionExport(invalid)).toBe(true); // isCollectionExport only checks schema+version
    expect(parseCaptureCollectionExport(invalid)).toBeNull(); // parse rejects invalid places
  });

  it('rejects null', () => {
    expect(isCollectionExport(null)).toBe(false);
  });

  it('parseCaptureCollectionExport returns null for invalid', () => {
    expect(parseCaptureCollectionExport('garbage')).toBeNull();
  });
});

describe('capturePlaceToPlannerPlace', () => {
  it('maps CapturePlace to PlannerTripPlaceLike', () => {
    const capture = makePlace({
      title: 'Khao San Road',
      inferred_kind: 'experience',
      address: 'Khao San Rd, Bangkok',
      rating: 4.2,
      price: { raw: '฿200', currency: 'THB', min: 100, max: 300, unit: 'person', level: 2 },
      user: { priority: 'must', tags: ['nightlife', 'backpacker'], why: 'Famous street' },
    });

    const planner = capturePlaceToPlannerPlace(capture, 'trip-abc');

    expect(planner.schema_version).toBe('0.1');
    expect(planner.type).toBe('trip_place');
    expect(planner.trip_id).toBe('trip-abc');
    expect(planner.title).toBe('Khao San Road');
    expect(planner.kind).toBe('experience');
    expect(planner.address).toBe('Khao San Rd, Bangkok');
    expect(planner.observed_rating).toBe(4.2);
    expect(planner.observed_price).toBe('฿200');
    expect(planner.price_currency).toBe('THB');
    expect(planner.priority).toBe('must');
    expect(planner.tags).toEqual(['nightlife', 'backpacker']);
    expect(planner.why).toBe('Famous street');
    expect(planner.source_provider).toBe('google_maps');
  });

  it('generates a new ID for each conversion', () => {
    const capture = makePlace();
    const p1 = capturePlaceToPlannerPlace(capture, 'trip-1');
    const p2 = capturePlaceToPlannerPlace(capture, 'trip-2');
    expect(p1.id).not.toBe(p2.id);
  });

  it('sets default values for missing fields', () => {
    const capture = makePlace({ user: undefined, price: undefined });
    const planner = capturePlaceToPlannerPlace(capture, 'trip-1');
    expect(planner.kind).toBe('food');
    expect(planner.tags).toEqual([]);
    expect(planner.signals).toEqual([]);
    expect(planner.risks).toEqual([]);
    expect(planner.reservation_status).toBe('none');
    expect(planner.state).toBe('candidate');
  });
});

describe('findExistingPlace', () => {
  const places = [
    makePlace({ id: 'pl-1', source: { provider: 'google_maps', url: 'https://maps.example.com/1', place_id: 'gp-1' }, coordinates: { lat: 13.7, lng: 100.5 } }),
    makePlace({ id: 'pl-2', source: { provider: 'google_maps', url: 'https://maps.example.com/2' } }),
  ];

  it('finds by URL', () => {
    expect(findExistingPlace(places, 'https://maps.example.com/1')?.id).toBe('pl-1');
  });

  it('finds by Place ID', () => {
    expect(findExistingPlace(places, 'https://other.com', 'gp-1')?.id).toBe('pl-1');
  });

  it('finds by coordinates', () => {
    expect(findExistingPlace(places, 'https://other.com', undefined, { lat: 13.7, lng: 100.5 })?.id).toBe('pl-1');
  });

  it('returns undefined when not found', () => {
    expect(findExistingPlace(places, 'https://unknown.com')).toBeUndefined();
  });
});

describe('reorderPlaces', () => {
  const places = [
    makePlace({ id: 'a', collection_id: 'c1' }),
    makePlace({ id: 'b', collection_id: 'c1' }),
    makePlace({ id: 'c', collection_id: 'c1' }),
  ];

  it('reorders visible places', () => {
    const result = reorderPlaces(places, ['c', 'a']);
    expect(result.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('preserves hidden places at the end', () => {
    const result = reorderPlaces(places, ['b']);
    expect(result.map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns original if no collection', () => {
    expect(reorderPlaces([], ['a'])).toEqual([]);
  });
});

describe('mergePlaceResearch', () => {
  it('merges incoming fields into existing place', () => {
    const existing = makePlace({
      title: 'Original',
      rating: 3.5,
      price: { raw: '฿100', currency: 'THB' },
      user: { tags: ['existing-tag'] },
    });

    const incoming: Partial<CapturePlace> = {
      title: 'Updated Title',
      rating: 4.5,
      price: { raw: '฿150', currency: 'THB', min: 100, max: 200 },
      user: { tags: ['new-tag'] },
    };

    const merged = mergePlaceResearch(existing, incoming);
    expect(merged.title).toBe('Updated Title');
    expect(merged.rating).toBe(4.5);
    expect(merged.price?.raw).toBe('฿150');
    expect(merged.user?.tags).toContain('existing-tag');
    expect(merged.user?.tags).toContain('new-tag');
    expect(merged.updated_at).toBeDefined();
  });

  it('preserves existing when incoming is empty', () => {
    const existing = makePlace({ rating: 3.0 });
    const merged = mergePlaceResearch(existing, {});
    expect(merged.rating).toBe(3.0);
  });

  it('upgrades inferred_kind from other to specific', () => {
    const existing = makePlace({ inferred_kind: 'other' });
    const incoming: Partial<CapturePlace> = { inferred_kind: 'food' };
    const merged = mergePlaceResearch(existing, incoming);
    expect(merged.inferred_kind).toBe('food');
  });

  it('does not downgrade specific kind to other', () => {
    const existing = makePlace({ inferred_kind: 'food' });
    const incoming: Partial<CapturePlace> = { inferred_kind: 'other' };
    const merged = mergePlaceResearch(existing, incoming);
    expect(merged.inferred_kind).toBe('food');
  });

  it('merges source.types without duplicates', () => {
    const existing = makePlace({ source: { provider: 'google_maps', url: '', types: ['restaurant', 'thai'] } });
    const incoming: Partial<CapturePlace> = { source: { provider: 'google_maps', url: '', types: ['thai', 'noodle'] } };
    const merged = mergePlaceResearch(existing, incoming);
    expect(merged.source.types).toEqual(expect.arrayContaining(['restaurant', 'thai', 'noodle']));
    expect(merged.source.types).toHaveLength(3);
  });
});

describe('migrateV2ToV3', () => {
  it('converts V2 state with activeContext and pendingPlaces', () => {
    const v2: OwnlyCaptureStateV2 = {
      version: 2,
      activeContext: { tripId: 'trip-1', title: 'Bangkok Trip', currency: 'THB' },
      pendingPlaces: [
        {
          id: 'pl-1',
          trip_id: 'trip-1',
          title: 'Grand Palace',
          source_provider: 'google_maps',
          source_url: 'https://maps.example.com/1',
          kind: 'attraction',
          tags: ['temple'],
          priority: 'must',
          state: 'candidate',
          reservation_status: 'none',
          created_at: '2025-01-15T10:00:00.000Z',
        },
      ],
    };

    const v3 = migrateV2ToV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.collections).toHaveLength(1);
    expect(v3.collections[0].title).toBe('Bangkok Trip');
    expect(v3.collections[0].currency).toBe('THB');
    expect(v3.places).toHaveLength(1);
    expect(v3.places[0].title).toBe('Grand Palace');
    expect(v3.places[0].inferred_kind).toBe('attraction');
    expect(v3.places[0].user?.tags).toEqual(['temple']);
    expect(v3.places[0].user?.priority).toBe('must');
  });

  it('creates empty state when no activeContext', () => {
    const v2: OwnlyCaptureStateV2 = { version: 2 };
    const v3 = migrateV2ToV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.collections).toHaveLength(0);
    expect(v3.places).toHaveLength(0);
  });

  it('handles V2 with places but no activeContext', () => {
    const v2: OwnlyCaptureStateV2 = {
      version: 2,
      pendingPlaces: [
        {
          id: 'pl-1',
          trip_id: 'orphan',
          title: 'Orphan Place',
          source_provider: 'other',
          source_url: '',
          state: 'candidate',
          reservation_status: 'none',
        },
      ],
    };
    const v3 = migrateV2ToV3(v2);
    // Without activeContext, V2 places are not migrated (they belong to no trip)
    expect(v3.places).toHaveLength(0);
    expect(v3.collections).toHaveLength(0);
  });
});

describe('findExistingPlaceByIdentity', () => {
  it('finds by Google Place ID (ChIJ format)', () => {
    const existing = makePlace({
      id: 'existing-1',
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/abc', place_id: 'ChIJ1234567890abcdefghijklmnopqrstuvwxyz' },
    });
    const result = findExistingPlaceByIdentity([existing], {
      source_provider: 'google_maps',
      source_place_id: 'ChIJ1234567890abcdefghijklmnopqrstuvwxyz',
      source_url: 'https://maps.google.com/place/xyz',
    });
    expect(result?.id).toBe('existing-1');
  });

  it('finds by Google CID (numeric)', () => {
    const existing = makePlace({
      id: 'existing-2',
      source: { provider: 'google_maps', url: 'https://maps.google.com/?cid=1234567890', place_id: '0x1234567890:0xabcdef' },
    });
    const result = findExistingPlaceByIdentity([existing], {
      source_provider: 'google_maps',
      source_place_id: '0x1234567890:0xabcdef',
      source_url: 'https://maps.google.com/place/different',
    });
    expect(result?.id).toBe('existing-2');
  });

  it('finds by source_place_id match', () => {
    const existing = makePlace({
      id: 'existing-3',
      source: { provider: 'tabelog', url: 'https://tabelog.com/abc', place_id: 'tabelog-123' },
    });
    const result = findExistingPlaceByIdentity([existing], {
      source_provider: 'tabelog',
      source_place_id: 'tabelog-123',
      source_url: 'https://tabelog.com/different',
    });
    expect(result?.id).toBe('existing-3');
  });

  it('returns undefined when no identity matches', () => {
    const existing = makePlace({
      id: 'existing-4',
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/abc', place_id: 'ChIJAAAA' },
    });
    const result = findExistingPlaceByIdentity([existing], {
      source_provider: 'google_maps',
      source_place_id: 'ChJIBBBBB',
      source_url: 'https://maps.google.com/place/xyz',
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty places array', () => {
    const result = findExistingPlaceByIdentity([], {
      source_provider: 'google_maps',
      source_place_id: 'ChIJ123',
      source_url: 'https://maps.google.com/place/abc',
    });
    expect(result).toBeUndefined();
  });
});

describe('placesShareStrongIdentity', () => {
  it('returns true when places share Google Place ID', () => {
    const a = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/a', place_id: 'ChIJ1234567890abcdefghijklmnopqrstuvwxyz' },
    });
    const b = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/b', place_id: 'ChIJ1234567890abcdefghijklmnopqrstuvwxyz' },
    });
    expect(placesShareStrongIdentity(a, b)).toBe(true);
  });

  it('returns true when places share Google CID', () => {
    const a = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/?cid=1234567890', place_id: '0x1234567890:0xabcdef' },
    });
    const b = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/?cid=1234567890', place_id: '0x1234567890:0x111111' },
    });
    expect(placesShareStrongIdentity(a, b)).toBe(true);
  });

  it('returns false when places have different identities', () => {
    const a = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/a', place_id: 'ChIJAAAA' },
    });
    const b = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/b', place_id: 'ChJIBBBB' },
    });
    expect(placesShareStrongIdentity(a, b)).toBe(false);
  });

  it('returns false when one place has no identity', () => {
    const a = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/a' },
    });
    const b = makePlace({
      source: { provider: 'google_maps', url: 'https://maps.google.com/place/b', place_id: 'ChIJ123' },
    });
    expect(placesShareStrongIdentity(a, b)).toBe(false);
  });
});
