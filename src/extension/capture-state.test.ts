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
});
