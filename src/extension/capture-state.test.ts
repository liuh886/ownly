import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_STORAGE_KEY,
  mutateCaptureStateInWorker,
  normalizeCaptureState,
  readCaptureState,
} from './capture-state';
import type { PlannerTripPlace } from '../domain/planner';

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

function place(id: string): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: 'trip-1', title: `Place ${id}`,
    source_provider: 'google_maps', source_url: `https://www.google.com/maps/place/${id}`,
    kind: 'attraction', priority: 'want', tags: [], signals: [], risks: [], reservation_status: 'none',
    state: 'candidate', created_at: '2026-08-23T00:00:00.000Z',
  };
}

beforeEach(() => storage.clear());

describe('normalizeCaptureState', () => {
  it('does not migrate V1 and only accepts the V2 inbox contract', () => {
    expect(normalizeCaptureState(undefined)).toEqual({ version: 2, activeContext: null, pendingPlaces: [] });
    expect(normalizeCaptureState({ version: 1, trips: [], pendingPlaces: [place('legacy')] })).toEqual({
      version: 2, activeContext: null, pendingPlaces: [],
    });
    const state = normalizeCaptureState({
      version: 2,
      activeContext: { tripId: 'trip-1', title: 'Tokyo', currency: 'jpy', tags: ['food'] },
      pendingPlaces: [{ ...place('a'), state: 'scheduled', scheduled_date: '2026-10-01', locked: true }],
    });
    expect(state.activeContext).toMatchObject({ tripId: 'trip-1', currency: 'JPY' });
    expect(state.pendingPlaces[0]).toMatchObject({ state: 'candidate' });
    for (const key of ['scheduled_date', 'scheduled_start', 'sort_order', 'locked', 'is_anchor', 'anchor_type']) {
      expect(state.pendingPlaces[0]).not.toHaveProperty(key);
    }
  });
});

describe('mutateCaptureStateInWorker', () => {
  it('serializes concurrent background mutations', async () => {
    await Promise.all([
      mutateCaptureStateInWorker((current) => ({ state: { ...current, pendingPlaces: [...current.pendingPlaces, place('a')] }, result: 'a' })),
      mutateCaptureStateInWorker((current) => ({ state: { ...current, pendingPlaces: [...current.pendingPlaces, place('b')] }, result: 'b' })),
    ]);
    const final = await readCaptureState();
    expect(final.pendingPlaces.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(storage.get(CAPTURE_STORAGE_KEY)).toMatchObject({ version: 2 });
  });
});
