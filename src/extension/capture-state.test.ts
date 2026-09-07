import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_STORAGE_KEY,
  MAX_ENRICH_FAILURES,
  capturePlaceNeedsEnrich,
  mergeUserByFreshness,
  mutateCaptureStateV3InWorker,
  nextEnrichFailures,
  normalizeCaptureStateV3,
  readCaptureStateV3,
  rebaseOntoTruth,
  selectEnrichResumeCandidates,
} from './capture-state';
import type { CapturePlace, OwnlyCaptureStateV3 } from '../domain/capture';

const storage = new Map<string, unknown>();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (...keys: string[]) => Object.fromEntries(keys.map((key) => [key, storage.get(key)])),
      set: async (entries: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(entries)) storage.set(key, value);
      },
    },
  },
});

function createTestPlace(id: string, collectionId = 'inbox'): CapturePlace {
  return {
    id,
    collection_id: collectionId,
    title: `Place ${id}`,
    source: {
      provider: 'google_maps',
      url: `https://www.google.com/maps/place/${id}`,
    },
    inferred_kind: 'attraction',
    captured_at: '2026-08-23T00:00:00.000Z',
  };
}

beforeEach(() => storage.clear());

/** Attach unknown (future-schema) fields without tripping excess-property checks. */
function withFuture<T extends object>(obj: T, extra: Record<string, unknown>): T {
  return Object.assign({}, obj, extra);
}

describe('normalizeCaptureStateV3', () => {
  it('initializes default inbox collection when given undefined', () => {
    const state = normalizeCaptureStateV3(undefined);
    expect(state.version).toBe(3);
    expect(state.collections.length).toBeGreaterThanOrEqual(1);
    expect(state.places).toEqual([]);
  });

  it('normalizes valid places and assigns active collection', () => {
    const state = normalizeCaptureStateV3({
      version: 3,
      active_collection_id: 'col-1',
      collections: [{ id: 'col-1', title: 'Tokyo', created_at: '2026-09-01T00:00:00Z' }],
      places: [createTestPlace('p-1', 'col-1')],
    });
    expect(state.version).toBe(3);
    expect(state.active_collection_id).toBe('col-1');
    expect(state.places).toHaveLength(1);
    expect(state.places[0].id).toBe('p-1');
  });

  it('preserves unknown future fields instead of stripping them', () => {
    const state = normalizeCaptureStateV3(withFuture({
      version: 3,
      active_collection_id: 'col-1',
      collections: [withFuture(
        { id: 'col-1', title: 'Tokyo', created_at: '2026-09-01T00:00:00Z' },
        { future_collection_flag: 'keep-col' },
      )],
      places: [withFuture(
        createTestPlace('p-1', 'col-1'),
        {
          future_place_field: 'keep-place',
          source: withFuture(createTestPlace('p-1', 'col-1').source, { future_source_field: 'keep-src' }),
        },
      )],
    }, { future_state_flag: 'keep-state' }));
    const raw = state as unknown as Record<string, unknown>;
    expect(raw.future_state_flag).toBe('keep-state');
    const col = state.collections[0] as unknown as Record<string, unknown>;
    expect(col.future_collection_flag).toBe('keep-col');
    const place = state.places[0] as unknown as Record<string, unknown>;
    expect(place.future_place_field).toBe('keep-place');
    expect((place.source as Record<string, unknown>).future_source_field).toBe('keep-src');
    // Known fields still normalized
    expect(state.version).toBe(3);
    expect(state.places[0].id).toBe('p-1');
  });
});

describe('mutateCaptureStateV3InWorker', () => {
  it('persists places across a fresh read', async () => {
    await mutateCaptureStateV3InWorker((current) => ({
      state: {
        ...current,
        places: [createTestPlace('p-new', current.active_collection_id || 'inbox')],
      },
      result: undefined,
    }));

    const restored = await readCaptureStateV3();
    expect(restored.places).toHaveLength(1);
    expect(restored.places[0].id).toBe('p-new');
  });

  it('serializes concurrent background mutations', async () => {
    await Promise.all([
      mutateCaptureStateV3InWorker((current) => ({
        state: { ...current, places: [...current.places, createTestPlace('a', current.active_collection_id || 'inbox')] },
        result: 'a',
      })),
      mutateCaptureStateV3InWorker((current) => ({
        state: { ...current, places: [...current.places, createTestPlace('b', current.active_collection_id || 'inbox')] },
        result: 'b',
      })),
    ]);
    const final = await readCaptureStateV3();
    expect(final.places.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(storage.get(CAPTURE_STORAGE_KEY)).toMatchObject({ version: 3 });
  });

  it('carries unknown future fields across a mutate round-trip', async () => {
    storage.set(CAPTURE_STORAGE_KEY, withFuture({
      version: 3,
      active_collection_id: 'inbox',
      collections: [{ id: 'inbox', title: 'Inbox', created_at: '2026-09-01T00:00:00Z' }],
      places: [withFuture(createTestPlace('p-keep'), { future_place_field: 'keep-me' })],
    }, { future_state_flag: 'keep-state' }));

    await mutateCaptureStateV3InWorker((current) => ({
      state: {
        ...current,
        places: [...current.places, createTestPlace('p-new', current.active_collection_id || 'inbox')],
      },
      result: undefined,
    }));

    const stored = storage.get(CAPTURE_STORAGE_KEY) as unknown as Record<string, unknown>;
    expect(stored.future_state_flag).toBe('keep-state');
    const places = stored.places as Record<string, unknown>[];
    expect(places).toHaveLength(2);
    expect(places.find((p) => p.id === 'p-keep')?.future_place_field).toBe('keep-me');
  });

  it('refuses to mutate storage holding a newer unsupported version', async () => {
    const v4 = withFuture({
      version: 4,
      active_collection_id: 'inbox',
      collections: [{ id: 'inbox', title: 'Inbox', created_at: '2026-09-01T00:00:00Z' }],
      places: [withFuture(createTestPlace('p-v4'), { future_v4_field: 'do-not-touch' })],
    }, {});
    storage.set(CAPTURE_STORAGE_KEY, v4);

    await expect(mutateCaptureStateV3InWorker((current) => ({
      state: { ...current, places: [] },
      result: undefined,
    }))).rejects.toThrow(/unsupported capture state version/);

    // Storage must be byte-identical: no stripping, no version rewrite.
    expect(storage.get(CAPTURE_STORAGE_KEY)).toBe(v4);
  });

  it('still mutates legacy storage without a version field', async () => {
    storage.set(CAPTURE_STORAGE_KEY, {
      active_collection_id: 'inbox',
      collections: [{ id: 'inbox', title: 'Inbox', created_at: '2026-09-01T00:00:00Z' }],
      places: [],
    });

    await mutateCaptureStateV3InWorker((current) => ({
      state: {
        ...current,
        places: [createTestPlace('p-legacy', current.active_collection_id || 'inbox')],
      },
      result: undefined,
    }));

    const restored = await readCaptureStateV3();
    expect(restored.places.map((p) => p.id)).toEqual(['p-legacy']);
  });
});

function stateWith(places: CapturePlace[], extra?: Partial<OwnlyCaptureStateV3>): OwnlyCaptureStateV3 {
  return {
    version: 3,
    active_collection_id: 'inbox',
    collections: [{ id: 'inbox', title: 'Inbox', created_at: '2026-09-01T00:00:00Z' }],
    places,
    ...extra,
  };
}

function placeWith(id: string, updatedAt: string, userWhy?: string): CapturePlace {
  return {
    ...createTestPlace(id),
    updated_at: updatedAt,
    user: { priority: 'want', tags: [], why: userWhy },
  };
}

describe('rebaseOntoTruth', () => {
  it('keeps in-flight local edits over the stale worker truth', () => {
    const truth = stateWith([
      placeWith('edited', '2026-09-01T10:00:00Z', 'old why'),
      placeWith('enriched', '2026-09-01T10:05:00Z', 'same'),
    ]);
    const memory = stateWith([
      // User edited during flight: newer updated_at wins.
      placeWith('edited', '2026-09-01T10:06:00Z', 'user-typed why'),
      placeWith('enriched', '2026-09-01T10:00:00Z', 'same'),
      // Added during flight: kept.
      placeWith('added', '2026-09-01T10:06:00Z', 'new'),
    ]);

    const rebased = rebaseOntoTruth(truth, memory);
    const byId = new Map(rebased.places.map((p) => [p.id, p]));
    expect(byId.get('edited')?.user?.why).toBe('user-typed why');
    expect(byId.get('enriched')?.updated_at).toBe('2026-09-01T10:05:00Z');
    expect(byId.get('added')?.id).toBe('added');
  });

  it('drops tombstoned places and prefers truth on timestamp ties', () => {
    const truth = stateWith([
      placeWith('gone', '2026-09-01T10:00:00Z'),
      placeWith('tie', '2026-09-01T10:00:00Z', 'truth why'),
    ]);
    const memory = stateWith([
      placeWith('tie', '2026-09-01T10:00:00Z', 'memory why'),
    ]);

    const rebased = rebaseOntoTruth(truth, memory, { placeIds: new Set(['gone']) });
    const byId = new Map(rebased.places.map((p) => [p.id, p]));
    expect(byId.has('gone')).toBe(false);
    expect(byId.get('tie')?.user?.why).toBe('truth why');
  });

  it('keeps memory active collection when valid, truth planner_target', () => {
    const truth = stateWith([], {
      active_collection_id: 'inbox',
      planner_target: { trip_id: 'trip-bg', title: 'Background' },
    });
    const memory = stateWith([], {
      active_collection_id: 'inbox',
      planner_target: { trip_id: 'trip-stale', title: 'Stale' },
    });

    const rebased = rebaseOntoTruth(truth, memory);
    expect(rebased.active_collection_id).toBe('inbox');
    expect(rebased.planner_target?.trip_id).toBe('trip-bg');
  });
});

describe('mergeUserByFreshness', () => {
  it('lets the fresher side win instead of always incoming', () => {
    const staleIncoming = placeWith('p', '2026-09-01T10:00:00Z', 'stale why');
    const freshExisting = placeWith('p', '2026-09-01T10:05:00Z', 'fresh why');
    expect(mergeUserByFreshness(freshExisting, staleIncoming)?.why).toBe('fresh why');

    const freshIncoming = placeWith('p', '2026-09-01T10:06:00Z', 'user edit');
    expect(mergeUserByFreshness(freshExisting, freshIncoming)?.why).toBe('user edit');
  });

  it('falls back when one side has no user object', () => {
    const noUser = createTestPlace('p');
    const withUser = placeWith('p', '2026-09-01T10:00:00Z', 'why');
    expect(mergeUserByFreshness(noUser, withUser)?.why).toBe('why');
    expect(mergeUserByFreshness(withUser, noUser)?.why).toBe('why');
  });
});

describe('capturePlaceNeedsEnrich', () => {
  it('flags search-query pins and missing identity/coords/rating', () => {
    const searchPin = {
      ...createTestPlace('p-search'),
      source: { provider: 'google_maps' as const, url: 'https://www.google.com/maps/search/?api=1&query ramen' },
    };
    expect(capturePlaceNeedsEnrich(searchPin)).toBe(true);

    const missingRating = {
      ...createTestPlace('p-norating'),
      source: { provider: 'google_maps' as const, url: 'https://www.google.com/maps/place/Foo', place_id: '0x1234:0x5678' },
      coordinates: { lat: 35.6, lng: 139.7 },
    };
    expect(capturePlaceNeedsEnrich(missingRating)).toBe(true);

    const complete = {
      ...missingRating,
      rating: 4.5,
    };
    expect(capturePlaceNeedsEnrich(complete)).toBe(false);
  });
});

describe('selectEnrichResumeCandidates', () => {
  it('skips exhausted places, sorts oldest first, and caps the batch', () => {
    const needy = (id: string, capturedAt: string, failures?: number): CapturePlace => ({
      ...createTestPlace(id),
      source: { provider: 'google_maps', url: 'https://www.google.com/maps/search/?api=1&query=' + id },
      captured_at: capturedAt,
      enrich_failures: failures,
    });
    const places = [
      needy('new', '2026-09-03T00:00:00Z'),
      needy('old', '2026-09-01T00:00:00Z'),
      needy('dead', '2026-08-01T00:00:00Z', MAX_ENRICH_FAILURES),
      { ...createTestPlace('complete'), source: { provider: 'google_maps' as const, url: 'https://www.google.com/maps/place/X', place_id: '0x1:0x2' }, coordinates: { lat: 1, lng: 1 }, rating: 5 },
    ];

    const picked = selectEnrichResumeCandidates(places, 1);
    expect(picked.map((p) => p.id)).toEqual(['old']);

    const all = selectEnrichResumeCandidates(places, 10);
    expect(all.map((p) => p.id)).toEqual(['old', 'new']);
  });

  it('re-arms an exhausted place after a newer user edit', () => {
    const exhaustedEdited: CapturePlace = {
      ...createTestPlace('rearmed'),
      source: { provider: 'google_maps', url: 'https://www.google.com/maps/search/?api=1&query=x' },
      captured_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
      enrich_failures: MAX_ENRICH_FAILURES,
      enrich_last_failed_at: '2026-09-01T12:00:00Z',
    };
    const exhaustedQuiet: CapturePlace = {
      ...exhaustedEdited,
      id: 'quiet',
      updated_at: '2026-09-01T10:00:00Z',
    };
    const picked = selectEnrichResumeCandidates([exhaustedQuiet, exhaustedEdited], 10);
    expect(picked.map((p) => p.id)).toEqual(['rearmed']);
  });
});

describe('nextEnrichFailures', () => {
  it('counts failures and clears on success', () => {
    expect(nextEnrichFailures(undefined, false)).toBe(1);
    expect(nextEnrichFailures(2, false)).toBe(3);
    expect(nextEnrichFailures(2, true)).toBeUndefined();
  });
});
