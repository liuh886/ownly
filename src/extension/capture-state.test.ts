import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_STORAGE_KEY,
  mutateCaptureStateV3InWorker,
  normalizeCaptureStateV3,
  readCaptureStateV3,
} from './capture-state';
import type { CapturePlace } from '../domain/capture';

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
