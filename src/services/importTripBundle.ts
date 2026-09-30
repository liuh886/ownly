/**
 * One import path for "bring a trip in from outside".
 *
 * A trip can enter Ownly three ways — a shared link, a pasted/exported
 * `ownly.trip.bundle` file, or a bundled Sample Trip — and all three must land
 * identically: fresh local ids and a transactional write. Keeping that in one
 * place is what makes a Sample Trip trustworthy: it is not a special code path,
 * it is the same import a friend shares with you.
 *
 * The ledger is the one deliberate exception, and it goes the other way. A
 * shared trip must never carry the sharer's ledger, so `ownly.trip.bundle`
 * excludes expenses and `instantiateTripBundle` clears `members`. A Sample Trip
 * is ours, so the loader supplies both — see `loadSampleTrip`.
 */
import type { ImportReport, PlannerTrip, TripExpenseItem } from '@/domain/planner';
import type { OwnlyTripBundle } from '@/domain/trip-bundle';
import { instantiateTripBundle } from '@/domain/trip-bundle';
import { plannerRepository } from './PlannerRepository';

export interface ImportedTripResult {
  trip: PlannerTrip;
  report: ImportReport;
  /** Trip ids that failed schema validation during import. */
  failedTitles: string[];
}

export interface ImportTripBundleOptions {
  /**
   * AA ledger participants, applied *after* id regeneration.
   *
   * `instantiateTripBundle` always clears `members`, because a trip shared by
   * another person must not carry that person's ledger participants into the
   * recipient's data folder. A caller that owns its own source data — a
   * bundled Sample Trip — can pass them back here; a shared trip must not.
   */
  members?: string[];
}

export async function importTripBundle(
  bundle: OwnlyTripBundle,
  options: ImportTripBundleOptions = {},
): Promise<ImportedTripResult> {
  // Every id is regenerated, so importing the same bundle twice produces two
  // independent trips rather than merging into one.
  const copy = instantiateTripBundle(bundle);
  if (options.members) copy.trip.members = [...options.members];
  const report = await plannerRepository.importBundle(copy);
  return {
    trip: copy.trip,
    report,
    failedTitles: report.failed.map((failure) => failure.title),
  };
}

/**
 * Write a ledger onto an already-imported trip.
 *
 * `ownly.trip.bundle` deliberately excludes expenses, so a trip shared by
 * someone else always arrives with an empty ledger. A Sample Trip is ours, so
 * the loader supplies one — but it goes through this same public method rather
 * than reaching past the repository.
 */
export async function seedTripExpenses(
  tripId: string,
  expenses: Array<{
    id: string;
    placeId?: string;
    title: string;
    category: TripExpenseItem['category'];
    amount: number;
    currency: string;
    date?: string;
    paidBy: string;
    splitMembers: string[];
    notes?: string;
  }>,
  createdAt: string,
): Promise<number> {
  for (const expense of expenses) {
    await plannerRepository.upsertExpense({
      id: `${tripId}-${expense.id}`,
      trip_id: tripId,
      place_id: expense.placeId,
      title: expense.title,
      category: expense.category,
      amount: expense.amount,
      currency: expense.currency,
      date: expense.date,
      paid_by: expense.paidBy,
      split_members: expense.splitMembers,
      notes: expense.notes,
      created_at: createdAt,
    });
  }
  return expenses.length;
}
