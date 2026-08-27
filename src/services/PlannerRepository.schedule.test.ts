import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerTripPlace } from '@/domain/planner';

const files = vi.hoisted(() => new Map<string, Map<string, string>>());

vi.mock('./ObsidianFileSystemService', () => ({
  obsidianService: {
    getDataFolder: async () => 'vault',
    readMarkdownFiles: async (directory: string) =>
      [...(files.get(directory)?.entries() ?? [])].map(([fileName, content]) => ({ fileName, content })),
    writeMarkdownFile: async (directory: string, fileName: string, content: string) => {
      const bucket = files.get(directory) ?? new Map<string, string>();
      files.set(directory, bucket);
      bucket.set(fileName, content);
    },
    deleteMarkdownFile: async (directory: string, fileName: string) => {
      files.get(directory)?.delete(fileName);
    },
  },
}));

const { plannerRepository } = await import('./PlannerRepository');

function place(id: string, overrides: Partial<PlannerTripPlace>): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title: id,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}/@13.74,100.50,15z`,
    kind: 'attraction',
    priority: 'want',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

async function seed(places: PlannerTripPlace[]): Promise<void> {
  for (const p of places) {
    await plannerRepository.upsertPlace({ ...p, locked: undefined });
  }
}

beforeEach(async () => {
  files.clear();
  await seed([
    place('a', { state: 'scheduled', scheduled_date: '2026-11-01', sort_order: 0 }),
    place('b', { state: 'scheduled', scheduled_date: '2026-11-01', sort_order: 1 }),
    place('pool', { state: 'candidate' }),
  ]);
});

describe('PlannerRepository scheduling lifecycle', () => {
  it('schedulePlace locks and persists the schedule with explicit order', async () => {
    const seededSnapshot = await plannerRepository.listPlaces();
    writeFileSync(join(tmpdir(), 'ownly-sched-seed.json'), JSON.stringify(seededSnapshot));
    const probeList = await plannerRepository.listPlaces();
    const probeFound = probeList.find((p) => p.id === 'pool') ?? null;
    writeFileSync(join(tmpdir(), 'ownly-probe.json'), JSON.stringify(probeFound));
    const next = await plannerRepository.schedulePlace('pool', '2026-11-01', 5);
    writeFileSync(join(tmpdir(), 'ownly-next.json'), JSON.stringify(next ?? null));
    expect(next?.state).toBe('scheduled');
    expect(next?.scheduled_date).toBe('2026-11-01');
    expect(next?.sort_order).toBe(5);
    expect(next?.locked).toBe(false);

    const all = await plannerRepository.listPlaces();
    writeFileSync(join(tmpdir(), 'ownly-sched-after.json'), JSON.stringify(all));
    const stored = all.find((p) => p.id === 'pool');
    expect(stored?.state).toBe('scheduled');
    expect(stored?.locked).toBe(false);
  });

  it('auto-assigns the next sort_order per date when omitted', async () => {
    const next = await plannerRepository.schedulePlace('pool', '2026-11-01');
    expect(next?.sort_order).toBe(2);
  });

  it('unschedulePlace returns a place to the pool as unlocked candidate', async () => {
    const back = await plannerRepository.unschedulePlace('a');
    expect(back?.state).toBe('candidate');
    expect(back?.scheduled_date).toBeUndefined();
    expect(back?.locked).toBe(false);
  });

  it('toggleLockPlace flips the lock state', async () => {
    const locked = await plannerRepository.toggleLockPlace('a');
    expect(locked?.locked).toBe(true);
    const unlocked = await plannerRepository.toggleLockPlace('a');
    expect(unlocked?.locked).toBe(false);
  });

  it('reorderScheduled rewrites sort_order sequentially for the day', async () => {
    const written = await plannerRepository.reorderScheduled('2026-11-01', ['b', 'a']);
    expect(written).toBeGreaterThanOrEqual(0);
    const all = (await plannerRepository.listPlaces())
      .filter((p) => p.scheduled_date === '2026-11-01')
      .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
    expect(all.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('returns false when the place id does not exist', async () => {
    expect(await plannerRepository.schedulePlace('ghost', '2026-11-01')).toBeNull();
    expect(await plannerRepository.unschedulePlace('ghost')).toBeNull();
    expect(await plannerRepository.toggleLockPlace('ghost')).toBeNull();
  });
});
