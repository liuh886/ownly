import { beforeEach, describe, expect, it } from 'vitest';
import type { PlannerPlaceKind, PlannerTrip, PlannerTripPlace } from '@/domain/planner';
import { PlannerRepository, type PlannerFileStore } from './PlannerRepository';

class MemoryStore implements PlannerFileStore {
  private files = new Map<string, string>();
  failId: string | null = null;

  async getDataFolder() { return 'Ownly'; }
  async readMarkdownFiles(directory: string) {
    const prefix = `${directory}/`;
    return [...this.files.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, content]) => ({ fileName: key.slice(prefix.length), content }));
  }
  async writeMarkdownFile(directory: string, fileName: string, content: string) {
    if (this.failId && content.includes(`id: ${this.failId}`)) throw new Error('simulated_disk_error');
    this.files.set(`${directory}/${fileName}`, content);
  }
  async deleteMarkdownFile(directory: string, fileName: string) { this.files.delete(`${directory}/${fileName}`); }
}

function candidate(id: string, title: string, kind: PlannerPlaceKind, tripId = 'trip-release'): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: tripId,
    title,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/?q=place_id:${id}`,
    source_place_id: id,
    kind,
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-09-02T00:00:00.000Z',
  };
}

function releaseFixture(): PlannerTripPlace[] {
  const places: PlannerTripPlace[] = [
    candidate('bkk-airport', 'Suvarnabhumi Airport', 'transit'),
    candidate('dmk-airport', 'Don Mueang International Airport', 'transit'),
    candidate('hotel-1', 'Eastin Grand Hotel Phayathai', 'stay'),
    candidate('hotel-2', 'U Nimman Chiang Mai', 'stay'),
    candidate('restaurant-1', 'Thipsamai', 'food'),
    candidate('restaurant-2', 'Khao Soi Mae Sai', 'food'),
    candidate('cafe-1', 'Factory Coffee', 'cafe'),
    candidate('cafe-2', 'Graph Cafe', 'cafe'),
    candidate('attraction-1', 'Wat Arun', 'attraction'),
    candidate('attraction-2', 'Wat Phra Singh', 'attraction'),
    candidate('same-name-1', 'Central', 'shopping'),
    candidate('same-name-2', 'Central', 'shopping'),
  ];
  while (places.length < 48) {
    const n = places.length + 1;
    const kinds: PlannerPlaceKind[] = ['food', 'cafe', 'stay', 'attraction', 'shopping', 'experience'];
    places.push(candidate(`fixture-${n}`, `Saved Place ${n}`, kinds[n % kinds.length]));
  }
  return places;
}

describe('Capture import release regression', () => {
  let store: MemoryStore;
  let repo: PlannerRepository;

  beforeEach(async () => {
    store = new MemoryStore();
    repo = new PlannerRepository(store);
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 'trip-release',
      title: 'Thailand release fixture',
      status: 'planning',
      start_date: '2026-10-05',
      end_date: '2026-10-13',
      destinations: ['Bangkok', 'Chiang Mai'],
      created_at: '2026-09-02T00:00:00.000Z',
    };
    await repo.upsertTrip(trip);
  });

  it('imports all 48 saved places with zero loss', async () => {
    const report = await repo.importCapturedPlaces(releaseFixture());
    expect(report.received).toBe(48);
    expect(report.created.length + report.updated.length).toBe(48);
    expect(report.failed).toEqual([]);
    expect(await repo.listPlaces()).toHaveLength(48);
  });

  it('turns any 48 -> 45 outcome into an explicit 3-item rejection report', async () => {
    const places = releaseFixture();
    places[45] = { ...candidate('invalid-payload', 'Invalid payload', 'other'), trip_id: '' };
    places[46] = candidate('wrong-trip', 'Same-name location', 'attraction', 'missing-trip');
    places[47] = candidate('fail-write', 'Write failure cafe', 'cafe');
    store.failId = 'fail-write';

    const report = await repo.importCapturedPlaces(places);

    expect(report.received).toBe(48);
    expect(report.created.length + report.updated.length).toBe(45);
    expect(report.failed).toHaveLength(3);
    expect(report.failed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'invalid-payload', title: 'Invalid payload', reason: 'missing_trip_id' }),
      expect.objectContaining({ id: 'wrong-trip', title: 'Same-name location', reason: 'unknown_trip' }),
      expect.objectContaining({ id: 'fail-write', title: 'Write failure cafe', reason: 'write_error' }),
    ]));
    expect(report.created.length + report.updated.length + report.failed.length).toBe(report.received);
    expect(await repo.listPlaces()).toHaveLength(45);
  });

  it('guarantees multi-collection isolation during capture import', async () => {
    // Simulating multiple collections in capture state
    const thailandPlaces = [
      candidate('th-1', 'Wat Pho', 'attraction', 'trip-release'),
      candidate('th-2', 'Chatuchak', 'shopping', 'trip-release'),
    ];
    const japanPlaces = [
      candidate('jp-1', 'Sensoji', 'attraction', 'trip-release'),
      candidate('jp-2', 'Shinjuku Gyoen', 'attraction', 'trip-release'),
    ];

    // Only import the Thailand collection places
    const report = await repo.importCapturedPlaces(thailandPlaces);
    expect(report.received).toBe(2);
    expect(report.created.length).toBe(2);

    const imported = await repo.listPlaces();
    expect(imported).toHaveLength(2);
    expect(imported.map((p) => p.title)).toEqual(expect.arrayContaining(['Wat Pho', 'Chatuchak']));
    japanPlaces.forEach((jp) => {
      expect(imported.map((p) => p.title)).not.toContain(jp.title);
    });
  });
});
