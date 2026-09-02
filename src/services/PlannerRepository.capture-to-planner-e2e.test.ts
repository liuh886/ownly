/**
 * Extension JSON → Planner Domain E2E Test
 *
 * Tests the full pipeline from Extension Capture JSON (V3 state)
 * through importCapturedPlaces() into the Planner domain.
 *
 * Run: npx vitest run src/services/PlannerRepository.capture-to-planner-e2e.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';
import { capturePlaceToPlannerPlace, type CapturePlace, type CaptureCollection } from '@/domain/capture';

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
  id: 'e2e-test-trip',
  title: 'E2E Test Trip',
  status: 'planning',
  start_date: '2026-10-05',
  end_date: '2026-10-07',
  destinations: ['Tokyo'],
  currency: 'JPY',
  members: ['Alice'],
  transport_mode: 'transit',
  tags: [],
  created_at: '2026-09-01T00:00:00.000Z',
};

const COLLECTION: CaptureCollection = {
  id: 'e2e-collection',
  title: 'Tokyo Food',
  created_at: '2026-09-01T00:00:00.000Z',
};

function makeCapturePlace(overrides: Partial<CapturePlace> = {}): CapturePlace {
  return {
    id: overrides.id || crypto.randomUUID(),
    collection_id: overrides.collection_id || COLLECTION.id,
    title: overrides.title || 'Test Place',
    source: overrides.source || { provider: 'google_maps', url: 'https://maps.google.com/?cid=12345' },
    inferred_kind: overrides.inferred_kind || 'food',
    captured_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  files.clear();
  await plannerRepository.upsertTrip(TRIP);
});

describe('Extension JSON → Planner Domain E2E', () => {
  it('imports captured places and creates Planner domain records', async () => {
    const capturePlaces: CapturePlace[] = [
      makeCapturePlace({ id: 'cap-1', title: 'Tsukiji Market', source: { provider: 'google_maps', url: 'https://maps.google.com/?cid=tsukiji', place_id: 'ChIJ_tsukiji' }, inferred_kind: 'food', rating: 4.5 }),
      makeCapturePlace({ id: 'cap-2', title: 'Senso-ji Temple', source: { provider: 'google_maps', url: 'https://maps.google.com/?cid=sensoji', place_id: 'ChIJ_sensoji' }, inferred_kind: 'attraction', rating: 4.7 }),
    ];

    const plannerPlaces = capturePlaces.map((cp) => capturePlaceToPlannerPlace(cp, 'e2e-test-trip')) as PlannerTripPlace[];
    const report = await plannerRepository.importCapturedPlaces(plannerPlaces);

    expect(report.received).toBe(2);
    expect(report.created).toHaveLength(2);
    expect(report.failed).toHaveLength(0);

    const allPlaces = await plannerRepository.listPlaces();
    const importedTitles = allPlaces.map((p) => p.title).sort();
    expect(importedTitles).toContain('Senso-ji Temple');
    expect(importedTitles).toContain('Tsukiji Market');
  });

  it('deduplicates by strong identity (Place ID)', async () => {
    const place1: PlannerTripPlace = {
      schema_version: '0.1', type: 'trip_place', id: 'cap-dedup-1', trip_id: 'e2e-test-trip',
      title: 'Tokyo Tower', source_provider: 'google_maps', source_url: 'https://maps.google.com/?cid=tower1',
      source_place_id: 'ChIJ_tokyo_tower', kind: 'attraction', tags: [], signals: [], risks: [],
      reservation_status: 'none', state: 'candidate', created_at: '2026-09-01T00:00:00.000Z',
    };

    const report1 = await plannerRepository.importCapturedPlaces([place1]);
    expect(report1.created).toHaveLength(1);

    const place2: PlannerTripPlace = {
      ...place1, id: 'cap-dedup-2', title: 'Tokyo Tower (duplicate)',
      source_url: 'https://maps.google.com/maps/place/tower2',
    };

    const report2 = await plannerRepository.importCapturedPlaces([place2]);
    expect(report2.updated).toHaveLength(1);
    expect(report2.created).toHaveLength(0);

    const allPlaces = await plannerRepository.listPlaces();
    const tokyoTowerPlaces = allPlaces.filter((p) => p.title === 'Tokyo Tower' || p.title === 'Tokyo Tower (duplicate)');
    expect(tokyoTowerPlaces).toHaveLength(1);
  });

  it('deduplicates by source_place_id match', async () => {
    const place1: PlannerTripPlace = {
      schema_version: '0.1', type: 'trip_place', id: 'cap-sp-1', trip_id: 'e2e-test-trip',
      title: 'Meiji Shrine', source_provider: 'google_maps', source_url: 'https://maps.google.com/?cid=meiji1',
      source_place_id: 'ChIJ_meiji', kind: 'attraction', tags: [], signals: [], risks: [],
      reservation_status: 'none', state: 'candidate', created_at: '2026-09-01T00:00:00.000Z',
    };

    await plannerRepository.importCapturedPlaces([place1]);

    const place2: PlannerTripPlace = {
      ...place1, id: 'cap-sp-2', title: 'Meiji Jingu',
      source_url: 'https://maps.google.com/maps/place/meiji_different_url',
    };

    const report = await plannerRepository.importCapturedPlaces([place2]);
    expect(report.updated).toHaveLength(1);
    expect(report.created).toHaveLength(0);
  });

  it('handles mixed import with failures and dedupes', async () => {
    const places: PlannerTripPlace[] = [
      {
        schema_version: '0.1', type: 'trip_place', id: 'cap-mix-1', trip_id: 'e2e-test-trip',
        title: 'Ueno Park', source_provider: 'google_maps', source_url: 'https://maps.google.com/?cid=ueno',
        source_place_id: 'ChIJ_ueno', kind: 'attraction', tags: [], signals: [], risks: [],
        reservation_status: 'none', state: 'candidate', created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1', type: 'trip_place', id: '', trip_id: 'e2e-test-trip',
        title: 'Missing ID Place', source_provider: 'google_maps', source_url: 'https://maps.google.com/?cid=missing',
        kind: 'food', tags: [], signals: [], risks: [],
        reservation_status: 'none', state: 'candidate', created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1', type: 'trip_place', id: 'cap-mix-3', trip_id: 'nonexistent-trip',
        title: 'Wrong Trip Place', source_provider: 'google_maps', source_url: 'https://maps.google.com/?cid=wrong',
        kind: 'food', tags: [], signals: [], risks: [],
        reservation_status: 'none', state: 'candidate', created_at: '2026-09-01T00:00:00.000Z',
      },
    ];

    const report = await plannerRepository.importCapturedPlaces(places);
    expect(report.received).toBe(3);
    expect(report.created).toHaveLength(1);
    expect(report.failed).toHaveLength(2);
    expect(report.failed.map((f) => f.reason)).toContain('missing_id');
    expect(report.failed.map((f) => f.reason)).toContain('unknown_trip');
  });
});
