'use client';

/**
 * Load the Sample Data into a **connected** Ownly data folder.
 *
 * This is the second destination for the same dataset Demo mode holds in
 * memory. Unlike Demo mode this does write to disk, so it is:
 *
 *  - never automatic — the user clicks;
 *  - tagged `sample` on every record, so the set is identifiable afterwards;
 *  - removable record by record with the normal archive flow, exactly like any
 *    other object.
 *
 * It exists because Demo mode is read-only, and someone who has already decided
 * to keep their data folder should not have to leave it to see what the app
 * looks like with data in it.
 */
import { seedSampleData, type SeedSampleDataResult } from '@/data/sample-data/seed';
import { fetchSampleData } from '@/data/sample-data/fetchSampleData';
import { loadSampleTripBundle } from '@/data/sample-trips/load';
import { SAMPLE_TRIP_IDS, type SampleTripId } from '@/data/sample-trips/registry';
import { SAMPLE_TRIP_TIMESTAMP } from '@/data/sample-trips/build';
import { importTripBundle, seedTripExpenses } from './importTripBundle';

export const SAMPLE_DATA_LOADED_KEY = 'ownly_sample_data_loaded';

export interface LoadSampleDataResult extends SeedSampleDataResult {
  trips: number;
  expenses: number;
}

export async function loadSampleData(
  tripIds: readonly SampleTripId[] = SAMPLE_TRIP_IDS,
): Promise<LoadSampleDataResult> {
  // Lazy for the same reason as the itineraries: a connected session that never
  // asks for example data must not pay for it. The records arrive over HTTP
  // rather than as a JS chunk, so they cost no route payload at all.
  const [sampleData, { markdownEntityRepository }, { plannerRepository }] = await Promise.all([
    fetchSampleData(),
    import('./MarkdownEntityRepository'),
    import('./PlannerRepository'),
  ]);
  const SAMPLE_DATA = sampleData;

  await markdownEntityRepository.initialize();
  await plannerRepository.initialize();

  const ledger = await seedSampleData(SAMPLE_DATA, {
    saveObject: (object, body) => markdownEntityRepository.saveObject(object, body),
    saveSnapshot: (snapshot, body) => markdownEntityRepository.saveSnapshot(snapshot, body),
    saveReview: (review, body) => markdownEntityRepository.saveReview(review, body),
  });

  let trips = 0;
  let expenses = 0;
  for (const id of tripIds) {
    const { bundle, expenses: tripExpenses, members } = await loadSampleTripBundle(id);
    const result = await importTripBundle(bundle, { members });
    if (result.failedTitles.length > 0) {
      throw new Error(`Sample Trip "${id}" failed to import: ${result.failedTitles.join(', ')}`);
    }
    expenses += await seedTripExpenses(result.trip.id, tripExpenses, SAMPLE_TRIP_TIMESTAMP);
    trips += 1;
  }

  return { ...ledger, trips, expenses };
}