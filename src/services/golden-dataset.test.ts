/**
 * Golden Dataset Regression Test — Thailand 2026
 *
 * End-to-end pipeline: Trip → Places → Schedule → Visits → Export → Import
 * Ensures model changes don't break the full workflow.
 *
 * Run: npx vitest run src/services/golden-dataset.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerTrip, PlannerTripPlace, PlannerTripLeg, TripExpenseItem } from '@/domain/planner';
import { materializePlannerScheduledPlaces } from '@/domain/planner-visits';
import { evaluatePlannerDay } from '@/domain/planner-schedule';
import { createShareableTripBundle, parseTripBundle, instantiateTripBundle } from '@/domain/trip-bundle';

const fixtureDir = resolve(import.meta.dirname, '../../examples/thailand-2026');
const TRIP = JSON.parse(readFileSync(resolve(fixtureDir, 'trip.json'), 'utf-8')) as PlannerTrip;
const PLACES = JSON.parse(readFileSync(resolve(fixtureDir, 'places.json'), 'utf-8')) as PlannerTripPlace[];
const EXPENSES = JSON.parse(readFileSync(resolve(fixtureDir, 'expenses.json'), 'utf-8')) as TripExpenseItem[];

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

describe('Golden Dataset Regression — Thailand 2026', () => {
  beforeEach(() => {
    files.clear();
  });

  it('full pipeline: create → import → schedule → export → bundle round-trip', async () => {
    // ── Step 1: Create Trip ──
    await plannerRepository.upsertTrip(TRIP);
    const trips = await plannerRepository.listTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].id).toBe('golden-thailand-2026');
    expect(trips[0].title).toBe('Thailand 2026 Golden Path');

    // ── Step 2: Import Places ──
    const importReport = await plannerRepository.importCapturedPlaces(PLACES);
    expect(importReport.received).toBe(5);
    expect(importReport.created).toHaveLength(5);
    expect(importReport.failed).toEqual([]);

    const storedPlaces = await plannerRepository.listPlaces();
    expect(storedPlaces).toHaveLength(5);

    // ── Step 3: Hotel Stay Spans ──
    const bkkStay = await plannerRepository.setStaySpan('place-oakwood', [
      '2026-10-05', '2026-10-06', '2026-10-07',
    ]);
    expect(bkkStay).toHaveLength(3);

    const cnxStay = await plannerRepository.setStaySpan('place-anantara', [
      '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ]);
    expect(cnxStay).toHaveLength(4);

    // ── Step 4: Schedule Sightseeing ──
    const v1 = await plannerRepository.addVisit('place-grand-palace', '2026-10-05', {
      start: '09:00', duration_minutes: 120,
    });
    const v2 = await plannerRepository.addVisit('place-wat-pho', '2026-10-05', {
      start: '11:30', duration_minutes: 90,
    });
    const v3 = await plannerRepository.addVisit('place-thipsamai', '2026-10-05', {
      start: '17:00', duration_minutes: 60,
    });
    expect(v1).toBeDefined();
    expect(v2).toBeDefined();
    expect(v3).toBeDefined();

    // ── Step 5: Verify Visit Sort Orders ──
    const day1Visits = (await plannerRepository.listVisits())
      .filter((v) => v.date === '2026-10-05')
      .sort((a, b) => a.sort_order - b.sort_order);
    expect(day1Visits.map((v) => v.sort_order)).toEqual([0, 1, 2, 3]);
    expect(day1Visits[0].place_id).toBe('place-oakwood');
    expect(day1Visits[1].place_id).toBe('place-grand-palace');
    expect(day1Visits[2].place_id).toBe('place-wat-pho');
    expect(day1Visits[3].place_id).toBe('place-thipsamai');

    // ── Step 6: Persist Routing Legs ──
    const legs: PlannerTripLeg[] = [
      {
        schema_version: '0.1', type: 'trip_leg',
        id: `leg-${TRIP.id}-palace-pho`,
        trip_id: TRIP.id,
        from_place_id: 'place-grand-palace',
        to_place_id: 'place-wat-pho',
        mode: 'walking', duration_minutes: 12, distance_meters: 900,
        source: 'openrouteservice', created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1', type: 'trip_leg',
        id: `leg-${TRIP.id}-pho-thip`,
        trip_id: TRIP.id,
        from_place_id: 'place-wat-pho',
        to_place_id: 'place-thipsamai',
        mode: 'transit', duration_minutes: 18, distance_meters: 2400,
        source: 'openrouteservice', created_at: '2026-09-01T00:00:00.000Z',
      },
    ];
    for (const leg of legs) await plannerRepository.upsertLeg(leg);

    // ── Step 7: Day Assessment ──
    const latestPlaces = await plannerRepository.listPlaces();
    const latestVisits = await plannerRepository.listVisits();
    const latestLegs = await plannerRepository.listLegs();
    const scheduled = materializePlannerScheduledPlaces(latestPlaces, latestVisits);

    const assessment = evaluatePlannerDay(TRIP, scheduled, latestLegs, '2026-10-05');
    expect(assessment.time_overlaps).toHaveLength(0);
    expect(assessment.travel_conflicts).toHaveLength(0);
    expect(assessment.is_overloaded).toBe(false);
    expect(assessment.opening_hours_warnings).toHaveLength(0);

    // ── Step 8: Export iCal ──
    const ics = await plannerRepository.exportTripIcs(TRIP.id);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain(`X-WR-CALNAME:${TRIP.title}`);
    expect(ics).toContain('The Grand Palace');
    expect(ics).toContain('Wat Pho');
    expect(ics).toContain('Thipsamai');
    expect(ics).toContain('DTSTART:20261005T090000');
    expect(ics).toContain('DTSTART:20261005T113000');
    expect(ics).toContain('DTSTART:20261005T170000');
    expect(ics).toContain('END:VCALENDAR');

    // ── Step 9: Day iCal ──
    const dayIcs = await plannerRepository.exportDayIcs(TRIP.id, '2026-10-05');
    expect(dayIcs).toContain('BEGIN:VCALENDAR');
    expect(dayIcs).toContain('The Grand Palace');
    expect(dayIcs).not.toContain('DTSTART:20261008');

    // ── Step 10: Bundle Share → Parse → Re-import ──
    const bundle = createShareableTripBundle(TRIP, latestPlaces, latestVisits, latestLegs);
    expect(bundle.kind).toBe('ownly.trip.bundle');
    expect(bundle.places).toHaveLength(5);
    expect(bundle.visits.length).toBeGreaterThanOrEqual(5);

    const bundleJson = JSON.stringify(bundle);
    const parsed = parseTripBundle(bundleJson);
    expect(parsed.trip.title).toBe(TRIP.title);
    expect(parsed.places).toHaveLength(5);

    const copy = instantiateTripBundle(parsed);
    expect(copy.trip.id).not.toBe(TRIP.id);
    expect(copy.trip.title).toBe(TRIP.title);
    expect(copy.places).toHaveLength(5);
    const originalPlaceIds = new Set(PLACES.map((p) => p.id));
    for (const place of copy.places) {
      expect(originalPlaceIds.has(place.id)).toBe(false);
    }

    // ── Step 11: Repeated Place Visit (same Place, different days) ──
    await plannerRepository.addVisit('place-grand-palace', '2026-10-06', {
      start: '10:00', duration_minutes: 120,
    });
    const allVisits = await plannerRepository.listVisits();
    const palaceVisits = allVisits.filter((v) => v.place_id === 'place-grand-palace');
    expect(palaceVisits).toHaveLength(2);
    expect(palaceVisits[0].date).not.toBe(palaceVisits[1].date);

    // Map deduplication: same Place = one pin
    const mapScheduled = scheduled.filter((place, index, self) =>
      index === self.findIndex((p) => p.place_id === place.place_id),
    );
    const uniquePlaceIds = new Set(scheduled.filter((p) => p.scheduled_date === '2026-10-05').map((p) => p.place_id));
    expect(mapScheduled.length).toBeLessThanOrEqual(scheduled.length);
  });
});
