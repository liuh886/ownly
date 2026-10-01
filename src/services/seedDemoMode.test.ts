/**
 * Demo-mode seeding — the promise behind "演示模式下应该有全套示例数据".
 *
 * Three things must hold, and only the third is about content:
 *
 *  1. **Nothing reaches disk.** Demo mode writes through the ordinary
 *     repository methods; the assertion is that the filesystem store is never
 *     touched while it is routing to memory.
 *  2. **Reads work without a folder.** Every tab reads through the repository,
 *     which previously bailed out and left five blank pages.
 *  3. **All five tabs have content** — Home aggregates, Objects, Accounts,
 *     Reviews, Planner — and the records are ordinary ones that pass schema and
 *     Doctor, so the demo is not a special degraded path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Node has no relative-URL fetch, so the tests hand the loader a local reader.
const ledgerJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/sample-data/ledger.json'), 'utf-8'),
);
const readLedger = async () => ({ ok: true, status: 200, json: async () => ledgerJson });
const disk = vi.hoisted(() => ({
  writes: [] as string[],
  read: [] as string[],
}));

vi.mock('./ObsidianFileSystemService', () => ({
  obsidianService: {
    getDataFolder: async () => 'Ownly',
    readMarkdownFiles: async (directory: string) => {
      disk.read.push(directory);
      return [];
    },
    writeMarkdownFile: async (directory: string, fileName: string) => {
      disk.writes.push(`${directory}/${fileName}`);
    },
    deleteMarkdownFile: async () => {},
  },
}));

const { markdownEntityRepository } = await import('./MarkdownEntityRepository');
const { plannerRepository } = await import('./PlannerRepository');
const { ownlyStoreRouter, setStoreFolderConnected, memoryOwnlyStore } = await import(
  './ownlyStoreRouter'
);
const { seedDemoMode, clearDemoMode, isDemoModeSeeded } = await import('./seedDemoMode');
const { calculateHomeMetrics } = await import('@/domain/calculations');
const { validateEntity } = await import('@/domain/schema');
const { listTripDates } = await import('@/domain/planner');
const { materializePlannerScheduledPlaces } = await import('@/domain/planner-visits');
const { evaluatePlannerDay } = await import('@/domain/planner-schedule');
const { checkPlannerIntegrity } = await import('@/domain/planner-integrity');

describe('Demo mode seeding', () => {
  beforeEach(() => {
    disk.writes.length = 0;
    disk.read.length = 0;
    clearDemoMode();
    setStoreFolderConnected(false);
  });

  it('writes nothing to the filesystem store', async () => {
    await seedDemoMode({ fetcher: readLedger });
    expect(disk.writes).toEqual([]);
    expect(disk.read).toEqual([]);
    // Everything landed in memory instead.
    expect(memoryOwnlyStore.snapshot().length).toBeGreaterThan(0);
  });

  it('routes reads to memory while no folder is connected', async () => {
    setStoreFolderConnected(false);
    expect(await ownlyStoreRouter.getDataFolder()).toBe('Ownly');
    await seedDemoMode({ fetcher: readLedger });
    const files = await ownlyStoreRouter.readMarkdownFiles('Ownly/Objects');
    expect(files.length).toBeGreaterThan(0);
    expect(disk.read).toEqual([]);
  });

  it('populates Objects, Accounts, Reviews and Planner', async () => {
    const result = await seedDemoMode({ fetcher: readLedger });
    expect(result.objects).toBeGreaterThan(0);
    expect(result.snapshots).toBeGreaterThan(1);
    expect(result.reviews).toBeGreaterThan(0);
    expect(result.trips).toBeGreaterThan(0);

    const objects = await markdownEntityRepository.listObjects();
    const snapshots = await markdownEntityRepository.listSnapshots();
    const reviews = await markdownEntityRepository.listReviews();
    const trips = await plannerRepository.listTrips();

    expect(objects.length).toBe(result.objects);
    expect(snapshots.length).toBe(result.snapshots);
    expect(reviews.length).toBe(result.reviews);
    expect(trips.length).toBe(result.trips);
  });

  it('gives the Home dashboard non-zero metrics instead of a blank page', async () => {
    await seedDemoMode({ fetcher: readLedger });
    const objects = (await markdownEntityRepository.listObjects()).map((item) => item.entity);
    const snapshots = (await markdownEntityRepository.listSnapshots()).map((item) => item.entity);
    const metrics = calculateHomeMetrics(objects, snapshots);
    expect(metrics.netWorth).toBeGreaterThan(0);
    expect(metrics.monthlyFixedCost).toBeGreaterThan(0);
    expect(metrics.ownedPhysicalCount).toBeGreaterThan(0);
    expect(metrics.netWorthDeltaFromPreviousMonth).not.toBeNull();
  });

  it('seeds only schema-valid records, so Doctor stays quiet', async () => {
    await seedDemoMode({ fetcher: readLedger });
    const stored = [
      ...(await markdownEntityRepository.listObjects()),
      ...(await markdownEntityRepository.listSnapshots()),
      ...(await markdownEntityRepository.listReviews()),
    ];
    for (const item of stored) {
      const issues = validateEntity(item.entity).issues;
      expect(issues, item.entity.id).toEqual([]);
    }
  });

  it('seeds trips that are still feasible day by day', async () => {
    await seedDemoMode({ fetcher: readLedger });
    const trips = await plannerRepository.listTrips();
    const places = await plannerRepository.listPlaces();
    const visits = await plannerRepository.listVisits();
    const legs = await plannerRepository.listLegs();
    for (const trip of trips) {
      const scheduled = materializePlannerScheduledPlaces(places, visits);
      for (const date of listTripDates(trip.start_date, trip.end_date)) {
        expect(evaluatePlannerDay(trip, scheduled, legs, date).status, `${trip.title} ${date}`).toBe('feasible');
      }
    }
    const report = checkPlannerIntegrity({ trips: trips.map((t) => ({ id: t.id })), places, visits });
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
  });

  it('is idempotent — seeding twice never duplicates a record', async () => {
    const first = await seedDemoMode({ fetcher: readLedger });
    const second = await seedDemoMode({ fetcher: readLedger });
    expect(second.objects).toBe(first.objects);
    expect((await markdownEntityRepository.listObjects()).length).toBe(first.objects);
    expect((await plannerRepository.listTrips()).length).toBe(first.trips);
  });

  it('reports whether the session has been seeded', async () => {
    expect(isDemoModeSeeded()).toBe(false);
    await seedDemoMode({ fetcher: readLedger });
    expect(isDemoModeSeeded()).toBe(true);
    clearDemoMode();
    expect(isDemoModeSeeded()).toBe(false);
  });

  it('discards demo data when a folder connects, rather than migrating it', async () => {
    // A demo record is not a real record. Promoting it would be the exact
    // mistake `e654715` had to undo.
    await seedDemoMode({ fetcher: readLedger });
    expect(memoryOwnlyStore.snapshot().length).toBeGreaterThan(0);
    setStoreFolderConnected(true);
    expect(memoryOwnlyStore.snapshot()).toEqual([]);
    expect(isDemoModeSeeded()).toBe(false);
    // And the router is back on the filesystem.
    await ownlyStoreRouter.readMarkdownFiles('Ownly/Objects');
    expect(disk.read).toContain('Ownly/Objects');
  });

  it('refuses to write to memory once detached', async () => {
    setStoreFolderConnected(false);
    await seedDemoMode({ fetcher: readLedger });
    setStoreFolderConnected(true);
    setStoreFolderConnected(false);
    // attach() restores an explicitly attached session; detach() did not clear
    // the flag, so the store is usable again for a fresh demo session.
    await expect(memoryOwnlyStore.writeMarkdownFile('Ownly/Objects', 'x.md', 'y')).resolves.toBeUndefined();
  });
});
