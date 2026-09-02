import { beforeEach, describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';
import { PlannerRepository, type PlannerFileStore } from './PlannerRepository';

class MemoryStore implements PlannerFileStore {
  files = new Map<string, string>();
  failDeleteContaining: string | null = null;
  async getDataFolder() { return 'Ownly'; }
  async readMarkdownFiles(directory: string) {
    const prefix = `${directory}/`;
    return [...this.files.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, content]) => ({ fileName: key.slice(prefix.length), content }));
  }
  async writeMarkdownFile(directory: string, fileName: string, content: string) { this.files.set(`${directory}/${fileName}`, content); }
  async deleteMarkdownFile(directory: string, fileName: string) {
    if (this.failDeleteContaining && fileName.includes(this.failDeleteContaining)) throw new Error('simulated_delete_failure');
    this.files.delete(`${directory}/${fileName}`);
  }
}

const trip: PlannerTrip = {
  schema_version: '0.1', type: 'trip', id: 'trip-closeout', title: 'Release closeout', status: 'planning',
  start_date: '2026-10-05', end_date: '2026-10-13', destinations: ['Bangkok'], created_at: '2026-09-02T00:00:00.000Z',
};

function place(id: string, title = id, sourcePlaceId = id): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: trip.id, title,
    source_provider: 'google_maps', source_url: `https://www.google.com/maps/place/?q=place_id:${sourcePlaceId}`,
    source_place_id: sourcePlaceId, kind: 'attraction', tags: [], signals: [], risks: [], reservation_status: 'none',
    state: 'candidate', created_at: '2026-09-02T00:00:00.000Z',
  };
}

describe('Planner release closeout invariants', () => {
  let store: MemoryStore;
  let repo: PlannerRepository;
  beforeEach(async () => {
    store = new MemoryStore();
    repo = new PlannerRepository(store);
    await repo.upsertTrip(trip);
  });

  it('rolls back a merge when the secondary file cannot be deleted', async () => {
    await repo.upsertPlace(place('primary', 'Primary'));
    await repo.upsertPlace(place('secondary', 'Secondary'));
    const visit = await repo.addVisit('secondary', '2026-10-06');
    expect(visit).toBeTruthy();
    store.failDeleteContaining = 'secondary';

    await expect(repo.mergePlaces('primary', 'secondary')).rejects.toThrow('rolled back');

    const places = await repo.listPlaces();
    expect(places.map((item) => item.id).sort()).toEqual(['primary', 'secondary']);
    expect((await repo.listVisits()).find((item) => item.id === visit!.id)?.place_id).toBe('secondary');
  });

  it('propagates automatic strong-ID dedup failure without leaving a half merge', async () => {
    await repo.upsertPlace(place('primary', 'Primary', 'same-google-id'));
    await repo.upsertPlace(place('secondary', 'Secondary', 'same-google-id'));
    const visit = await repo.addVisit('secondary', '2026-10-06');
    // Scheduled places are preferred as dedup primaries, so the unscheduled primary fixture becomes the deletion target.
    store.failDeleteContaining = 'place--primary.md';

    await expect(repo.deduplicateTripPlaces(trip.id)).rejects.toThrow('rolled back');
    expect((await repo.listPlaces()).map((item) => item.id).sort()).toEqual(['primary', 'secondary']);
    expect((await repo.listVisits()).find((item) => item.id === visit!.id)?.place_id).toBe('secondary');
  });

  it('supports repeated visits while preventing shelve/delete from orphaning them', async () => {
    await repo.upsertPlace(place('repeat', 'Repeat place'));
    const first = await repo.addVisit('repeat', '2026-10-06');
    const second = await repo.addVisit('repeat', '2026-10-06');
    const third = await repo.addVisit('repeat', '2026-10-07');
    expect([first, second, third].filter(Boolean)).toHaveLength(3);
    expect((await repo.listPlaces()).filter((item) => item.id === 'repeat')).toHaveLength(1);
    await expect(repo.dropPlace('repeat')).rejects.toThrow('scheduled visit');
    await expect(repo.deletePlace('repeat')).rejects.toThrow('scheduled visit');
    expect((await repo.listVisits()).filter((item) => item.place_id === 'repeat')).toHaveLength(3);
  });
});
