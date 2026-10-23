'use client';

/**
 * Demo-mode seeding.
 *
 * Demo mode has no Ownly data folder, so there is nowhere to write. This places
 * the bundled Sample Data **and** the bundled Sample Trips into the in-memory
 * store, which every repository already reads through when no folder is
 * connected. Nothing touches disk, and the session ends with the tab.
 *
 * This replaces the demo system that `e654715` had to remove. That one shipped
 * equivalent content but wrote it into the user's real folder, which Product
 * Governance forbids. The content was never the problem; the destination was.
 *
 * Connecting a folder discards this instead of migrating it — a demo record is
 * not a real record.
 */
import { seedSampleData, type SeedSampleDataResult } from '@/data/sample-data/seed';
import { fetchSampleData } from '@/data/sample-data/fetchSampleData';
import { SAMPLE_TRIP_TIMESTAMP } from '@/data/sample-trips/build';
import { loadSampleTripBundle } from '@/data/sample-trips/load';
import { SAMPLE_TRIP_IDS, type SampleTripId } from '@/data/sample-trips/registry';
import { importTripBundle, seedTripExpenses } from './importTripBundle';
import { MarkdownEntityRepository } from './MarkdownEntityRepository';
import { PlannerRepository } from './PlannerRepository';
import {
  attachMemoryStore,
  hasSeededMemoryStore,
  markMemoryStoreSeeded,
  resetMemoryStore,
  memoryOwnlyStore,
  isStoreFolderConnected,
} from './ownlyStoreRouter';

// Bind the seed to memory for its entire lifetime. The global router can switch
// to a real folder while an asynchronous fetch/import is still pending.
const demoEntityRepository = new MarkdownEntityRepository(memoryOwnlyStore);
const demoPlannerRepository = new PlannerRepository(memoryOwnlyStore);

export interface DemoSeedResult extends SeedSampleDataResult {
  trips: number;
  expenses: number;
}

async function seedSampleDataIntoMemory(
  sampleDataOptions?: Parameters<typeof fetchSampleData>[0],
): Promise<SeedSampleDataResult> {
  const SAMPLE_DATA = await fetchSampleData(sampleDataOptions);

  await demoEntityRepository.initialize();
  await demoPlannerRepository.initialize();

  return seedSampleData(SAMPLE_DATA, {
    saveObject: (object, body) => demoEntityRepository.saveObject(object, body),
    saveSnapshot: (snapshot, body) => demoEntityRepository.saveSnapshot(snapshot, body),
    saveReview: (review, body) => demoEntityRepository.saveReview(review, body),
  });
}

async function seedSampleTripsIntoMemory(tripIds: readonly SampleTripId[] = SAMPLE_TRIP_IDS) {
  let trips = 0;
  let expenses = 0;
  for (const id of tripIds) {
    const { bundle, expenses: tripExpenses, members } = await loadSampleTripBundle(id);
    const result = await importTripBundle(bundle, { members, repository: demoPlannerRepository });
    if (result.failedTitles.length > 0) {
      throw new Error(`Demo Trip "${id}" failed to import: ${result.failedTitles.join(', ')}`);
    }
    // Expenses are excluded from the bundle schema by design; a demo needs the
    // budget panel and AA settlement lit, so they are written through the same
    // public path a loaded Sample Trip uses.
    expenses += await seedTripExpenses(result.trip.id, tripExpenses, SAMPLE_TRIP_TIMESTAMP, demoPlannerRepository);
    trips += 1;
  }
  return { trips, expenses };
}

/**
 * Populate Demo mode. Idempotent per session — the store is detached and
 * re-seeded whenever a folder connects, so this always starts from empty.
 */
export async function seedDemoMode(
  sampleDataOptions?: Parameters<typeof fetchSampleData>[0],
): Promise<DemoSeedResult> {
  if (isStoreFolderConnected()) throw new Error('Cannot seed demo while a folder is connected');
  // Start from empty so seeding twice in a session cannot duplicate records.
  resetMemoryStore();
  attachMemoryStore();

  const ledger = await seedSampleDataIntoMemory(sampleDataOptions);
  const trips = await seedSampleTripsIntoMemory();
  if (isStoreFolderConnected()) throw new Error('Demo session was replaced by a connected folder');
  markMemoryStoreSeeded();

  return { ...ledger, ...trips };
}

export function isDemoModeSeeded(): boolean {
  return hasSeededMemoryStore();
}

export function clearDemoMode(): void {
  resetMemoryStore();
}




