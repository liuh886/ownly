import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PlannerRepository, type PlannerFileStore } from '../../src/services/PlannerRepository';
import type { PlannerTrip, PlannerTripLeg, PlannerTripPlace, TripExpenseItem } from '../../src/domain/planner';
import type { PlannerTripVisit } from '../../src/domain/planner-visits';
import {
  listPlannerExpenses,
  listPlannerLegs,
  listPlannerPlaces,
  listPlannerTrips,
  listPlannerVisits,
} from './planner-storage';

/**
 * Cross-runtime contract: entities written by the Web/Obsidian PlannerRepository
 * must read back with identical Place/Visit semantics through the CLI/MCP
 * storage layer. Both sides share `serializeMarkdownEntity`/`parseMarkdownEntity`
 * and the domain types; this test pins that the shared format never drifts.
 */
class FsStore implements PlannerFileStore {
  constructor(private readonly root: string) {}
  async getDataFolder() { return 'Ownly'; }
  async readMarkdownFiles(directory: string) {
    const dir = join(this.root, directory);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => ({ fileName, content: readFileSync(join(dir, fileName), 'utf8') }));
  }
  async writeMarkdownFile(directory: string, fileName: string, content: string) {
    const dir = join(this.root, directory);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), content, 'utf8');
  }
  async deleteMarkdownFile(directory: string, fileName: string) {
    rmSync(join(this.root, directory, fileName), { force: true });
  }
}

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: 'trip-1', title: id,
    source_provider: 'google_maps', source_url: `https://maps.example/${id}`,
    kind: 'attraction', tags: [], signals: [], risks: [], reservation_status: 'none',
    state: 'candidate', created_at: '2026-09-01T00:00:00.000Z', ...overrides,
  };
}

describe('Planner Web <-> CLI/MCP Place/Visit parity', () => {
  it('reads identical Place and Visit semantics from Web-written Markdown', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ownly-parity-'));
    dirs.push(root);
    const repo = new PlannerRepository(new FsStore(root));

    const trip: PlannerTrip = {
      schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Parity Trip', status: 'active',
      start_date: '2026-10-05', end_date: '2026-10-13', destinations: ['Bangkok'],
      currency: 'THB', created_at: '2026-09-01T00:00:00.000Z',
    };
    await repo.upsertTrip(trip);
    await repo.upsertPlace(place('grand-palace', {
      title: '大皇宫', area: 'Rattanakosin', coordinates: { lat: 13.75, lng: 100.491 },
      observed_rating: 4.7, phone: '+66 2 623 5500',
    }));
    await repo.upsertPlace(place('wat-pho', { title: 'Wat Pho', kind: 'attraction' }));
    const visit = await repo.addVisit('grand-palace', '2026-10-06', { start: '09:00', duration_minutes: 120 });
    await repo.upsertLeg({
      schema_version: '0.1', type: 'trip_leg', id: 'leg-1', trip_id: 'trip-1',
      from_place_id: 'grand-palace', to_place_id: 'wat-pho', mode: 'walking',
      duration_minutes: 12, distance_meters: 900, source: 'manual', created_at: '2026-09-01T00:00:00.000Z',
    } as PlannerTripLeg);
    await repo.upsertExpense({
      id: 'exp-1', trip_id: 'trip-1', title: '门票', category: 'ticket', amount: 500,
      currency: 'THB', date: '2026-10-06', paid_by: 'me', split_members: ['me'], created_at: '2026-10-06T00:00:00.000Z',
    } as TripExpenseItem);

    // Read back through the CLI/MCP storage layer against the same data root.
    const dataLocation = join(root, 'Ownly');
    expect(listPlannerTrips(dataLocation).map((entry) => entry.frontmatter.id)).toEqual(['trip-1']);

    const cliPlaces = listPlannerPlaces(dataLocation).map((entry) => entry.frontmatter);
    const webPlaces = await repo.listPlaces();
    expect(cliPlaces.map((item) => item.id).sort()).toEqual(webPlaces.map((item) => item.id).sort());
    const cliPalace = cliPlaces.find((item) => item.id === 'grand-palace')!;
    expect(cliPalace.title).toBe('大皇宫');
    expect(cliPalace.state).toBe('candidate');
    expect(cliPalace.coordinates).toEqual({ lat: 13.75, lng: 100.491 });
    expect(cliPalace.observed_rating).toBe(4.7);

    const cliVisits = listPlannerVisits(dataLocation).map((entry) => entry.frontmatter);
    const cliVisit = cliVisits.find((item) => item.id === visit!.id) as PlannerTripVisit;
    expect(cliVisit.place_id).toBe('grand-palace');
    expect(cliVisit.date).toBe('2026-10-06');
    expect(cliVisit.start).toBe('09:00');
    expect(cliVisit.duration_minutes).toBe(120);

    expect(listPlannerLegs(dataLocation).map((entry) => entry.frontmatter.id)).toEqual(['leg-1']);
    expect(listPlannerExpenses(dataLocation).map((entry) => entry.frontmatter.id)).toEqual(['exp-1']);
  });
});
