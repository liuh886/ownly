/**
 * Seed the Sample Data into either the in-memory store (Demo mode) or a
 * connected Ownly data folder (explicit opt-in).
 *
 * Both paths go through the same public repository methods a real user action
 * uses — `saveObject` / `saveSnapshot` / `saveReview` — so seeded records are
 * indistinguishable from authored ones, filenames and Doctor findings
 * included.
 */
import { serializeMarkdownEntity } from '@/data/frontmatter';
import type { SampleDataSet } from './ledger-types';

export interface SeedSampleDataResult {
  objects: number;
  snapshots: number;
  reviews: number;
}

export interface SampleDataTargets {
  saveObject: (object: SampleDataSet['objects'][number], body?: string) => Promise<string>;
  saveSnapshot: (snapshot: SampleDataSet['snapshots'][number], body?: string) => Promise<string>;
  saveReview: (review: SampleDataSet['reviews'][number], body?: string) => Promise<string>;
}

export function serializeSampleEntity(entity: object): string {
  return serializeMarkdownEntity(entity as Record<string, unknown>, '');
}

export async function seedSampleData(
  data: SampleDataSet,
  targets: SampleDataTargets,
): Promise<SeedSampleDataResult> {
  for (const object of data.objects) {
    await targets.saveObject(object, data.bodies[object.id] ?? '');
  }
  for (const snapshot of data.snapshots) {
    await targets.saveSnapshot(snapshot, data.bodies[snapshot.id] ?? '');
  }
  for (const review of data.reviews) {
    await targets.saveReview(review, data.bodies[review.id] ?? '');
  }
  return {
    objects: data.objects.length,
    snapshots: data.snapshots.length,
    reviews: data.reviews.length,
  };
}