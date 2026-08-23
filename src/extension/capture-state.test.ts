import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_STORAGE_KEY, normalizeCaptureState, updateCaptureState, writeCaptureState, readCaptureState } from './capture-state';
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
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title: `Place ${id}`,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}`,
    kind: 'attraction',
    priority: 'want',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-23T00:00:00.000Z',
  };
}

beforeEach(() => {
  storage.clear();
});

describe('normalizeCaptureState', () => {
  it('repairs malformed payloads into a valid empty-ish state', () => {
    expect(normalizeCaptureState(undefined)).toEqual({
      version: 1,
      trips: [],
      activeTripId: null,
      pendingPlaces: [],
      knownPlaceIds: {},
    });
    const repaired = normalizeCaptureState({ trips: 'nope', pendingPlaces: [place('a')], knownPlaceIds: [], extra: 1 });
    expect(repaired.trips).toEqual([]);
    expect(repaired.pendingPlaces).toHaveLength(1);
    expect(repaired.knownPlaceIds).toEqual({});
  });
});

describe('updateCaptureState', () => {
  it('serializes concurrent mutations so neither loses the other', async () => {
    await writeCaptureState(normalizeCaptureState(undefined));

    const first = updateCaptureState((current) => ({
      state: { ...current, pendingPlaces: [...current.pendingPlaces, place('a')] },
      result: 'a',
    }));
    const second = updateCaptureState((current) => ({
      state: { ...current, pendingPlaces: [...current.pendingPlaces, place('b')] },
      result: 'b',
    }));

    await Promise.all([first, second]);
    const final = await readCaptureState();
    expect(final.pendingPlaces.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('propagates mutator results and persists the returned state under the canonical key', async () => {
    const result = await updateCaptureState((current) => ({
      state: { ...current, activeTripId: 'trip-9' },
      result: current.activeTripId,
    }));
    expect(result).toBeNull();
    expect(storage.get(CAPTURE_STORAGE_KEY)).toMatchObject({ activeTripId: 'trip-9' });
  });
});
