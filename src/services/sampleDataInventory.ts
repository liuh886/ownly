'use client';

/**
 * Inventory and removal of Sample Data inside a **connected** data folder.
 *
 * Demo mode needs none of this — it holds the same dataset in an in-memory store
 * that dies with the tab, and connecting a folder discards it rather than
 * migrating it (see `ownlyStoreRouter`). What this module covers is the opt-in
 * connected path: a user who clicked "load a full set of example data" and now
 * wants their folder back.
 *
 * Every bundled record is identifiable by the `sample` tag, on both halves of
 * the dataset:
 *
 *  - `public/sample-data/ledger.json` — objects, snapshots, reviews
 *  - `src/data/sample-trips/build.ts` — trips default to `['sample', '示例']`,
 *    and `instantiateTripBundle` clones the trip verbatim, so the tag survives
 *    the id regeneration that import performs
 *
 * Removal follows the two mechanisms each half already has, rather than reaching
 * for a raw file delete:
 *
 *  - ledger records go through `archiveObject` / `archiveSnapshot` /
 *    `archiveReview`, so they land in `Archive/` and stay restorable from the
 *    normal Archive panel. This matches what a user deleting one record by hand
 *    would get.
 *  - sample trips go through `deleteTrip`, which cascades to places, visits,
 *    legs and expenses. There is no trip archive, so this one is permanent —
 *    `SampleDataInventory.tripsPermanent` exists so the UI can say so before
 *    asking, rather than after.
 *
 * Object logs are deliberately left alone. Using a sample object writes a log
 * that is a real record of something the user did, and deleting it would
 * destroy their own history to tidy up a demo.
 */
import { markdownEntityRepository } from './MarkdownEntityRepository';
import { plannerRepository } from './PlannerRepository';

export const SAMPLE_TAG = 'sample';

export function isSampleEntity(entity: { tags?: string[] } | null | undefined): boolean {
  return Array.isArray(entity?.tags) && entity.tags.includes(SAMPLE_TAG);
}

export interface SampleDataInventory {
  objects: number;
  snapshots: number;
  reviews: number;
  trips: number;
  /** Ledger + trips combined; what the UI shows as "N records". */
  total: number;
  /** Sample trips are deleted outright; the rest are archived and restorable. */
  tripsPermanent: boolean;
}

export const EMPTY_SAMPLE_DATA_INVENTORY: SampleDataInventory = {
  objects: 0,
  snapshots: 0,
  reviews: 0,
  trips: 0,
  total: 0,
  tripsPermanent: true,
};

function totalOf(counts: { objects: number; snapshots: number; reviews: number; trips: number }): number {
  return counts.objects + counts.snapshots + counts.reviews + counts.trips;
}

export interface ClearedSampleData {
  objects: number;
  snapshots: number;
  reviews: number;
  trips: number;
  /** Ledger + trips combined; `0` means there was nothing left to remove. */
  total: number;
}

/** Count what is currently tagged `sample`, without changing anything. */
export async function findSampleData(): Promise<SampleDataInventory> {
  await markdownEntityRepository.initialize();
  await plannerRepository.initialize();

  const [objects, snapshots, reviews, trips] = await Promise.all([
    markdownEntityRepository.listObjects(),
    markdownEntityRepository.listSnapshots(),
    markdownEntityRepository.listReviews(),
    plannerRepository.listTrips({ strict: true }),
  ]);

  const counts = {
    objects: objects.filter((entry) => isSampleEntity(entry.entity)).length,
    snapshots: snapshots.filter((entry) => isSampleEntity(entry.entity)).length,
    reviews: reviews.filter((entry) => isSampleEntity(entry.entity)).length,
    trips: trips.filter(isSampleEntity).length,
  };

  return { ...counts, total: totalOf(counts), tripsPermanent: true };
}

/**
 * Archive every `sample`-tagged ledger record and delete every `sample`-tagged
 * trip. Partial progress is reported rather than thrown, so one unreadable file
 * cannot strand the rest of the set.
 */
export async function clearSampleData(): Promise<ClearedSampleData> {
  await markdownEntityRepository.initialize();
  await plannerRepository.initialize();

  const cleared: ClearedSampleData = { objects: 0, snapshots: 0, reviews: 0, trips: 0, total: 0 };

  const [objects, snapshots, reviews, trips] = await Promise.all([
    markdownEntityRepository.listObjects(),
    markdownEntityRepository.listSnapshots(),
    markdownEntityRepository.listReviews(),
    plannerRepository.listTrips({ strict: true }),
  ]);

  for (const entry of objects) {
    if (!isSampleEntity(entry.entity)) continue;
    try {
      await markdownEntityRepository.archiveObject(entry.fileName);
      cleared.objects += 1;
    } catch (error) {
      console.warn(`Could not archive sample object ${entry.fileName}:`, error);
    }
  }

  for (const entry of snapshots) {
    if (!isSampleEntity(entry.entity)) continue;
    try {
      await markdownEntityRepository.archiveSnapshot(entry.fileName);
      cleared.snapshots += 1;
    } catch (error) {
      console.warn(`Could not archive sample snapshot ${entry.fileName}:`, error);
    }
  }

  for (const entry of reviews) {
    if (!isSampleEntity(entry.entity)) continue;
    try {
      await markdownEntityRepository.archiveReview(entry.fileName);
      cleared.reviews += 1;
    } catch (error) {
      console.warn(`Could not archive sample review ${entry.fileName}:`, error);
    }
  }

  for (const trip of trips) {
    if (!isSampleEntity(trip)) continue;
    try {
      if (await plannerRepository.deleteTrip(trip.id)) cleared.trips += 1;
    } catch (error) {
      console.warn(`Could not delete sample trip ${trip.id}:`, error);
    }
  }

  cleared.total = totalOf(cleared);
  return cleared;
}
