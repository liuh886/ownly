'use client';

/**
 * Load a bundled Sample Trip into the user's own data folder.
 *
 * The whole flow runs through the public import path, so a Sample Trip is
 * indistinguishable from a trip someone shared with you — same transactional
 * write, same fresh ids, same plain Markdown on disk.
 *
 * Two things the bundle schema cannot carry are re-applied here: the AA ledger
 * participants (`instantiateTripBundle` strips `members` for privacy) and the
 * sample expenses (`ownly.trip.bundle` excludes `expenses` by design).
 */
import { loadSampleTripBundle } from '@/data/sample-trips/load';
import type { SampleTripId } from '@/data/sample-trips/registry';
import type { PlannerTrip } from '@/domain/planner';
import { SAMPLE_TRIP_TIMESTAMP } from '@/data/sample-trips/build';
import { importTripBundle, seedTripExpenses } from './importTripBundle';

export interface LoadSampleTripResult {
  trip: PlannerTrip;
  expenseCount: number;
  failedTitles: string[];
}

export async function loadSampleTrip(id: SampleTripId): Promise<LoadSampleTripResult> {
  const { bundle, expenses, members } = await loadSampleTripBundle(id);

  // `instantiateTripBundle` clears `members` so a sharer's ledger never leaks
  // into the recipient's trip. A Sample Trip has no sharer, so restore them —
  // without them the budget ledger renders with no participants to settle.
  const result = await importTripBundle(bundle, { members });

  const expenseCount = await seedTripExpenses(result.trip.id, expenses, SAMPLE_TRIP_TIMESTAMP);

  return {
    trip: result.trip,
    expenseCount,
    failedTitles: result.failedTitles,
  };
}
