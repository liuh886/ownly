import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripCalendarFeed } from '@/domain/planner';
import { PlannerRepository, type PlannerFileStore } from './PlannerRepository';

function makeStore() {
  const folders = new Map<string, Map<string, string>>();
  let current = 'first';
  const bound = (root: string): PlannerFileStore => ({
    getDataFolder: async () => root,
    readMarkdownFiles: async (directory) => [...(folders.get(directory) ?? new Map()).entries()]
      .map(([fileName, content]) => ({ fileName, content })),
    writeMarkdownFile: async (directory, fileName, content) => {
      const files = folders.get(directory) ?? new Map<string, string>();
      files.set(fileName, content);
      folders.set(directory, files);
    },
    deleteMarkdownFile: async (directory, fileName) => { folders.get(directory)?.delete(fileName); },
  });
  const store: PlannerFileStore = {
    ...bound(current),
    getDataFolder: async () => current,
    captureSession: async () => bound(current),
  };
  return { store, folders, switchTo: (root: string) => { current = root; } };
}

const trip: PlannerTrip = {
  schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'First title', status: 'planning',
  start_date: '2026-11-01', end_date: '2026-11-02', destinations: ['Bangkok'],
  created_at: '2026-10-01T00:00:00.000Z',
};
const feed: PlannerTripCalendarFeed = {
  feed_token: 'new-token', trip_id: trip.id, created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z', enabled: true,
};

describe('PlannerRepository narrow trip patches', () => {
  it('preserves unrelated fields and rejects stale feed responses', async () => {
    const { store } = makeStore();
    const repository = new PlannerRepository(store);
    await repository.upsertTrip(trip);
    expect(await repository.patchTripCalendarFeed(trip.id, feed)).toBe(true);
    await repository.upsertTrip({ ...(await repository.listTrips())[0], title: 'New title' });
    expect(await repository.patchTripCalendarFeed(trip.id, { ...feed, updated_at: 'later' }, 'old-token')).toBe(false);
    await repository.patchTripReviewId(trip.id, 'review-1');
    await repository.patchTripReviewId(trip.id, 'review-1');
    const saved = (await repository.listTrips())[0];
    expect(saved.title).toBe('New title');
    expect(saved.calendar_feed?.feed_token).toBe('new-token');
    expect(saved.review_id).toBe('review-1');
    await expect(repository.patchTripReviewId(trip.id, 'review-2')).rejects.toThrow('different review');
  });

  it('keeps a queued transaction in the workspace captured at its start', async () => {
    const { store, folders, switchTo } = makeStore();
    const repository = new PlannerRepository(store);
    const pending = repository.upsertTrip(trip);
    switchTo('second');
    await pending;
    expect(folders.get('first/Trips')?.size).toBe(1);
    expect(folders.get('second/Trips')?.size ?? 0).toBe(0);
  });

  it('holds one Planner write lock through a grouped session and its nested transactions', async () => {
    const { store, folders, switchTo } = makeStore();
    const repository = new PlannerRepository(store);
    let release!: () => void;
    let reached!: () => void;
    const pause = new Promise<void>((resolve) => { release = resolve; });
    const atPause = new Promise<void>((resolve) => { reached = resolve; });
    const grouped = repository.withWriteSession(async (bound) => {
      await bound.upsertTrip(trip);
      reached();
      await pause;
      await bound.patchTripReviewId(trip.id, 'review-1');
    });
    await atPause;
    const outside = repository.upsertTrip({ ...trip, id: 'outside' });
    switchTo('second');
    release();
    await Promise.all([grouped, outside]);
    expect(folders.get('first/Trips')?.size).toBe(2);
    expect(folders.get('second/Trips')?.size ?? 0).toBe(0);
    switchTo('first');
    expect((await repository.listTrips()).find((item) => item.id === trip.id)?.review_id).toBe('review-1');
  });
});
