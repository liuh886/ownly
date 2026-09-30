/**
 * Sample Trip load path — the promise that a Sample Trip is not special.
 *
 * It must land in the user's own data folder as ordinary Markdown through the
 * public import path, produce the same read model a shared trip produces, and
 * survive being loaded twice without colliding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_TRIP_IDS } from '@/data/sample-trips/registry';
import { calculateTripSettlementWithPayments } from '@/domain/expense-payments';
import { checkPlannerIntegrity } from '@/domain/planner-integrity';
import { materializePlannerScheduledPlaces } from '@/domain/planner-visits';
import { evaluatePlannerDay } from '@/domain/planner-schedule';
import { listTripDates } from '@/domain/planner';

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
const { loadSampleTrip } = await import('./loadSampleTrip');

describe('loadSampleTrip', () => {
  beforeEach(() => {
    files.clear();
  });

  it.each(SAMPLE_TRIP_IDS)('%s lands as a normal trip with a working ledger', async (id) => {
    const { trip, expenseCount, failedTitles } = await loadSampleTrip(id);
    expect(failedTitles).toEqual([]);
    expect(expenseCount).toBeGreaterThan(0);

    const storedTrips = await plannerRepository.listTrips();
    expect(storedTrips).toHaveLength(1);
    expect(storedTrips[0].id).toBe(trip.id);
    // A local id, never the shipped fixture id.
    expect(trip.id).not.toBe(id);
    expect(trip.tags).toContain('sample');

    const places = await plannerRepository.listPlaces();
    const visits = await plannerRepository.listVisits();
    const legs = await plannerRepository.listLegs();
    const expenses = await plannerRepository.listExpenses();
    expect(places.every((place) => place.trip_id === trip.id)).toBe(true);
    expect(visits.every((visit) => visit.trip_id === trip.id)).toBe(true);
    expect(legs.every((leg) => leg.trip_id === trip.id)).toBe(true);
    expect(expenses).toHaveLength(expenseCount);

    // The AA settlement path needs participants, which the bundle schema
    // strips. If the loader forgot to restore them the ledger would be a
    // silent dead panel.
    expect(trip.members?.length ?? 0).toBeGreaterThan(0);
    const settlement = calculateTripSettlementWithPayments(expenses, trip.members ?? []);
    expect(settlement.totalExpense).toBeGreaterThan(0);
    expect(settlement.memberBalances.length).toBeGreaterThanOrEqual(trip.members!.length);
    expect(settlement.transfers.length).toBeGreaterThan(0);
  });

  it.each(SAMPLE_TRIP_IDS)('%s stays feasible after the round trip through disk', async (id) => {
    const { trip } = await loadSampleTrip(id);
    const places = await plannerRepository.listPlaces();
    const visits = await plannerRepository.listVisits();
    const legs = await plannerRepository.listLegs();
    const scheduled = materializePlannerScheduledPlaces(places, visits);
    for (const date of listTripDates(trip.start_date, trip.end_date)) {
      expect(evaluatePlannerDay(trip, scheduled, legs, date).status, date).toBe('feasible');
    }
    const report = checkPlannerIntegrity({ trips: [{ id: trip.id }], places, visits });
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
  });

  it('loading the same Sample Trip twice produces two independent trips', async () => {
    const first = await loadSampleTrip('sample-thailand-6d');
    const second = await loadSampleTrip('sample-thailand-6d');
    expect(first.trip.id).not.toBe(second.trip.id);

    const trips = await plannerRepository.listTrips();
    expect(trips).toHaveLength(2);
    const visits = await plannerRepository.listVisits();
    expect(visits.filter((visit) => visit.trip_id === first.trip.id).length)
      .toBe(visits.filter((visit) => visit.trip_id === second.trip.id).length);

    // Deleting one must not touch the other — the promise behind "delete it any time".
    await plannerRepository.deleteTrip(first.trip.id);
    expect((await plannerRepository.listTrips()).map((trip) => trip.id)).toEqual([second.trip.id]);
    expect((await plannerRepository.listPlaces()).every((place) => place.trip_id === second.trip.id)).toBe(true);
  });

  it('rejects an unknown id before touching the data folder', async () => {
    await expect(loadSampleTrip('not-a-trip' as never)).rejects.toThrow();
    expect(files.size).toBe(0);
  });
});
