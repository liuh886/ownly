/**
 * Sample Data inventory + removal.
 *
 * The contract these tests defend is the one the whole two-destination sample
 * design rests on: removal is scoped by the `sample` tag and nothing else. A
 * user who loaded the example set and then typed their own records must be able
 * to press the button without losing anything they wrote — so every case below
 * mixes tagged and untagged records and asserts only the tagged ones move.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SAMPLE_TRIP_IDS } from '@/data/sample-trips/registry';

// Node has no relative-URL fetch, so the ledger is read from disk directly —
// the same seam `seedDemoMode.test.ts` uses.
const ledgerJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/sample-data/ledger.json'), 'utf-8'),
);
const readLedger = async () => ({ ok: true, status: 200, json: async () => ledgerJson });

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

const { markdownEntityRepository } = await import('./MarkdownEntityRepository');
const { plannerRepository } = await import('./PlannerRepository');
const { fetchSampleData } = await import('@/data/sample-data/fetchSampleData');
const { seedSampleData } = await import('@/data/sample-data/seed');
const { loadSampleTrip } = await import('./loadSampleTrip');
const { SAMPLE_TAG, isSampleEntity, findSampleData, clearSampleData } = await import('./sampleDataInventory');

/** The connected-path half of seeding: the same calls `loadSampleData` makes. */
async function seedLedger() {
  const sampleData = await fetchSampleData({ fetcher: readLedger });
  await markdownEntityRepository.initialize();
  const ledger = await seedSampleData(sampleData, {
    saveObject: (object, body) => markdownEntityRepository.saveObject(object, body),
    saveSnapshot: (snapshot, body) => markdownEntityRepository.saveSnapshot(snapshot, body),
    saveReview: (review, body) => markdownEntityRepository.saveReview(review, body),
  });
  for (const id of SAMPLE_TRIP_IDS) {
    await loadSampleTrip(id);
  }
  return { ...ledger, trips: SAMPLE_TRIP_IDS.length };
}

function writeEntity(directory: string, fileName: string, frontmatter: Record<string, unknown>) {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  const content = ['---', ...lines, '---', '', 'body', ''].join('\n');
  const bucket = files.get(directory) ?? new Map<string, string>();
  files.set(directory, bucket);
  bucket.set(fileName, content);
}

const baseObject = {
  schema_version: '0.1',
  type: 'object',
  object_type: 'physical',
  status: 'using',
  created_at: '2026-01-01',
};

describe('sample data removal', () => {
  beforeEach(() => {
    files.clear();
  });

  it('recognises the tag and ignores records without it', () => {
    expect(isSampleEntity({ tags: ['ownly', SAMPLE_TAG] })).toBe(true);
    expect(isSampleEntity({ tags: ['ownly'] })).toBe(false);
    expect(isSampleEntity({})).toBe(false);
    expect(isSampleEntity(null)).toBe(false);
  });

  it('reports nothing for a folder that never loaded the example set', async () => {
    const inventory = await findSampleData();
    expect(inventory.total).toBe(0);
  });

  it('counts a loaded set across objects, snapshots, reviews and trips', async () => {
    const result = await seedLedger();

    const inventory = await findSampleData();
    expect(inventory.objects).toBe(result.objects);
    expect(inventory.snapshots).toBe(result.snapshots);
    expect(inventory.reviews).toBe(result.reviews);
    expect(inventory.trips).toBe(result.trips);
    expect(inventory.total).toBe(result.objects + result.snapshots + result.reviews + result.trips);
  });

  it('archives tagged records and leaves the user\'s own records untouched', async () => {
    await seedLedger();
    writeEntity('vault/Objects', 'mine.md', { ...baseObject, id: 'mine', title: '我的相机' });

    const before = await markdownEntityRepository.listObjects();
    expect(before.some((entry) => entry.entity.title === '我的相机')).toBe(true);

    const cleared = await clearSampleData();

    const remaining = await markdownEntityRepository.listObjects();
    expect(remaining.map((entry) => entry.entity.title)).toEqual(['我的相机']);

    const archived = await markdownEntityRepository.listArchivedEntities();
    expect(archived.filter((entry) => entry.archiveType === 'object')).toHaveLength(cleared.objects);
    expect(cleared.objects).toBeGreaterThan(0);
  });

  it('deletes tagged trips and their cascaded children', async () => {
    const { trip } = await loadSampleTrip('sample-thailand-6d');

    expect(await plannerRepository.listTrips()).toHaveLength(1);
    expect((await plannerRepository.listPlaces()).length).toBeGreaterThan(0);

    const cleared = await clearSampleData();

    expect(cleared.trips).toBe(1);
    expect(await plannerRepository.listTrips()).toHaveLength(0);
    expect(await plannerRepository.listPlaces()).toHaveLength(0);
    expect(await plannerRepository.listVisits()).toHaveLength(0);
    expect(await plannerRepository.listLegs()).toHaveLength(0);
    expect(await plannerRepository.listExpenses()).toHaveLength(0);
    expect(trip.id).toBeTruthy();
  });

  it('keeps a user-created trip when clearing the example set', async () => {
    await seedLedger();

    await plannerRepository.upsertTrip({
      schema_version: '0.1',
      type: 'trip',
      id: 'user-trip',
      title: '我的行程',
      status: 'planning',
      start_date: '2026-05-01',
      end_date: '2026-05-03',
      destinations: ['东京'],
      created_at: '2026-04-01T00:00:00.000Z',
    });

    await clearSampleData();

    const trips = await plannerRepository.listTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].title).toBe('我的行程');
  });

  it('is a no-op the second time, so a double click cannot over-delete', async () => {
    await seedLedger();

    const first = await clearSampleData();
    expect(first.total).toBeGreaterThan(0);

    const second = await clearSampleData();
    expect(second.total).toBe(0);
  });

  it('is idempotent against the whole sample trip set', async () => {
    for (const id of SAMPLE_TRIP_IDS) {
      await loadSampleTrip(id);
    }
    expect((await findSampleData()).trips).toBe(SAMPLE_TRIP_IDS.length);

    const cleared = await clearSampleData();
    expect(cleared.trips).toBe(SAMPLE_TRIP_IDS.length);
    expect(await plannerRepository.listTrips()).toHaveLength(0);
  });
});
