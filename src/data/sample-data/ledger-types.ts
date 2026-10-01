/**
 * Types for the Sample Data set.
 *
 * Kept separate from the data itself so `fetchSampleData` (which runs in every
 * runtime) carries no dependency on the authored records.
 */
import type {
  AccountSnapshot,
  OneTimeExperienceObject,
  PhysicalObject,
  RecurringCostObject,
  ReviewEntry,
} from '@/domain/types';

export interface SampleDataSet {
  objects: Array<PhysicalObject | RecurringCostObject | OneTimeExperienceObject>;
  snapshots: AccountSnapshot[];
  reviews: ReviewEntry[];
  /** Markdown body per entity id, matching what the repositories persist. */
  bodies: Record<string, string>;
}