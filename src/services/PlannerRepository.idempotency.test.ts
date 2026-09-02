/**
 * Capture Re-import Idempotency Test
 *
 * Proves that importing the same captured places twice (after ACK failure)
 * does not create duplicates. Identity-based dedup ensures幂等.
 *
 * Run: npx vitest run src/services/PlannerRepository.idempotency.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';

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

const TRIP: PlannerTrip = {
  schema_version: '0.1',
  type: 'trip',
  id: 'idem-test-trip',
  title: 'Idempotency Test Trip',
  status: 'planning',
  start_date: '2026-10-05',
  end_date: '2026-10-07',
  destinations: ['Bangkok'],
  currency: 'THB',
  members: ['Alice'],
  transport_mode: 'transit',
  tags: [],
  created_at: '2026-09-01T00:00:00.000Z',
};

const CAPTURED_PLACES: PlannerTripPlace[] = [
  {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'cap-place-1',
    trip_id: 'idem-test-trip',
    title: 'Grand Palace',
    source_provider: 'google_maps',
    source_url: 'https://maps.google.com/?cid=grand_palace',
    source_place_id: 'ChIJ_grand_palace',
    kind: 'attraction',
    priority: 'must',
    coordinates: { lat: 13.75, lng: 100.49 },
    tags: ['attraction'],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-09-01T00:00:00.000Z',
  },
  {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'cap-place-2',
    trip_id: 'idem-test-trip',
    title: 'Wat Pho',
    source_provider: 'google_maps',
    source_url: 'https://maps.google.com/?cid=wat_pho',
    source_place_id: 'ChIJ_wat_pho',
    kind: 'attraction',
    priority: 'must',
    coordinates: { lat: 13.746, lng: 100.493 },
    tags: ['attraction'],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-09-01T00:00:00.000Z',
  },
  {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'cap-place-3',
    trip_id: 'idem-test-trip',
    title: 'Thipsamai',
    source_provider: 'google_maps',
    source_url: 'https://maps.google.com/?cid=thipsamai',
    source_place_id: 'ChIJ_thipsamai',
    kind: 'food',
    priority: 'want',
    coordinates: { lat: 13.752, lng: 100.505 },
    tags: ['food'],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-09-01T00:00:00.000Z',
  },
];

describe('Capture Re-import Idempotency', () => {
  beforeEach(() => {
    files.clear();
  });

  it('importing same places twice produces no duplicates', async () => {
    await plannerRepository.upsertTrip(TRIP);

    // First import (simulates initial Capture sync)
    const report1 = await plannerRepository.importCapturedPlaces(CAPTURED_PLACES);
    expect(report1.received).toBe(3);
    expect(report1.created.length + report1.updated.length).toBe(3);
    expect(report1.failed).toEqual([]);

    const placesAfterFirst = await plannerRepository.listPlaces();
    expect(placesAfterFirst).toHaveLength(3);

    // Second import (simulates re-sync after ACK failure)
    const report2 = await plannerRepository.importCapturedPlaces(CAPTURED_PLACES);
    expect(report2.received).toBe(3);
    expect(report2.created.length + report2.updated.length).toBe(3); // still 3 total (merged, not new)
    expect(report2.failed).toEqual([]);

    const placesAfterSecond = await plannerRepository.listPlaces();
    expect(placesAfterSecond).toHaveLength(3); // still 3, not 6

    // Verify titles unchanged (no corruption from merge)
    const titles = placesAfterSecond.map((p) => p.title).sort();
    expect(titles).toEqual(['Grand Palace', 'Thipsamai', 'Wat Pho']);
  });

  it('importing with mixed new and existing places produces correct count', async () => {
    await plannerRepository.upsertTrip(TRIP);

    // First import: 3 places
    await plannerRepository.importCapturedPlaces(CAPTURED_PLACES);
    expect(await plannerRepository.listPlaces()).toHaveLength(3);

    // Second import: 2 existing + 1 new
    const mixedImport: PlannerTripPlace[] = [
      CAPTURED_PLACES[0], // existing
      CAPTURED_PLACES[1], // existing
      {
        schema_version: '0.1',
        type: 'trip_place',
        id: 'cap-place-4',
        trip_id: 'idem-test-trip',
        title: 'Jim Thompson House',
        source_provider: 'google_maps',
        source_url: 'https://maps.google.com/?cid=jim_thompson',
        source_place_id: 'ChIJ_jim_thompson',
        kind: 'attraction',
        priority: 'want',
        coordinates: { lat: 13.725, lng: 100.528 },
        tags: ['attraction'],
        signals: [],
        risks: [],
        reservation_status: 'none',
        state: 'candidate',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ];

    const report = await plannerRepository.importCapturedPlaces(mixedImport);
    expect(report.received).toBe(3);
    expect(report.created.length + report.updated.length).toBe(3);
    expect(report.failed).toEqual([]);

    const places = await plannerRepository.listPlaces();
    expect(places).toHaveLength(4); // 3 original + 1 new
  });

  it('importing after ACK failure does not lose existing data', async () => {
    await plannerRepository.upsertTrip(TRIP);

    // First import
    await plannerRepository.importCapturedPlaces(CAPTURED_PLACES);

    // Modify a place locally (simulates user editing)
    const localPlaces = await plannerRepository.listPlaces();
    const grandPalace = localPlaces.find((p) => p.id === 'cap-place-1')!;
    grandPalace.observed_rating = 4.9;
    grandPalace.notes = 'User added this note';
    await plannerRepository.upsertPlace(grandPalace);

    // Re-import (ACK failure re-sync) — should merge, not overwrite
    await plannerRepository.importCapturedPlaces(CAPTURED_PLACES);

    const places = await plannerRepository.listPlaces();
    expect(places).toHaveLength(3);

    // The local edits should be preserved (mergeCapturedPlaceResearch preserves existing facts)
    const merged = places.find((p) => p.id === 'cap-place-1')!;
    expect(merged.observed_rating).toBe(4.9);
    expect(merged.notes).toBe('User added this note');
  });
});
