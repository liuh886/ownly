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
import {
  attachMemoryStore,
  hasSeededMemoryStore,
  markMemoryStoreSeeded,
  resetMemoryStore,
} from './ownlyStoreRouter';

export interface DemoSeedResult extends SeedSampleDataResult {
  trips: number;
  expenses: number;
}

async function seedSampleDataIntoMemory(
  sampleDataOptions?: Parameters<typeof fetchSampleData>[0],
): Promise<SeedSampleDataResult> {
  const SAMPLE_DATA = await fetchSampleData(sampleDataOptions);

  // The memory store is the active store in Demo mode, so the ordinary
  // repository methods land in it rather than on disk. Every write still goes
  // through the public API, which keeps filenames and Doctor findings identical
  // to a real authored record.
  const { markdownEntityRepository } = await import('./MarkdownEntityRepository');
  const { plannerRepository } = await import('./PlannerRepository');

  await markdownEntityRepository.initialize();
  await plannerRepository.initialize();

  return seedSampleData(SAMPLE_DATA, {
    saveObject: (object, body) => markdownEntityRepository.saveObject(object, body),
    saveSnapshot: (snapshot, body) => markdownEntityRepository.saveSnapshot(snapshot, body),
    saveReview: (review, body) => markdownEntityRepository.saveReview(review, body),
  });
}

async function seedSampleTripsIntoMemory(tripIds: readonly SampleTripId[] = SAMPLE_TRIP_IDS) {
  let trips = 0;
  let expenses = 0;
  for (const id of tripIds) {
    const { bundle, expenses: tripExpenses, members } = await loadSampleTripBundle(id);
    const result = await importTripBundle(bundle, { members });
    if (result.failedTitles.length > 0) {
      throw new Error(`Demo Trip "${id}" failed to import: ${result.failedTitles.join(', ')}`);
    }
    // Expenses are excluded from the bundle schema by design; a demo needs the
    // budget panel and AA settlement lit, so they are written through the same
    // public path a loaded Sample Trip uses.
    expenses += await seedTripExpenses(result.trip.id, tripExpenses, SAMPLE_TRIP_TIMESTAMP);
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
  // Start from empty so seeding twice in a session cannot duplicate records.
  resetMemoryStore();
  attachMemoryStore();

  const ledger = await seedSampleDataIntoMemory(sampleDataOptions);
  const trips = await seedSampleTripsIntoMemory();
  markMemoryStoreSeeded();

  return { ...ledger, ...trips };
}

export function isDemoModeSeeded(): boolean {
  return hasSeededMemoryStore();
}

export function clearDemoMode(): void {
  resetMemoryStore();
}




