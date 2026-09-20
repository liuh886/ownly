import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectSuspectedDuplicatePlaces,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
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

  it('leaves no stale duplicate-pair references when one place is in several weak pairs', async () => {
    // Three weak (same-title) places form the pairs a--b, a--c, b--c.
    await repo.upsertPlace(place('a', 'Central Festival'));
    await repo.upsertPlace(place('b', 'Central Festival'));
    await repo.upsertPlace(place('c', 'Central Festival'));
    const visit = await repo.addVisit('b', '2026-10-06');
    expect(visit).toBeTruthy();

    const before = detectSuspectedDuplicatePlaces(await repo.listPlaces());
    expect(before.map((pair) => pair.pairId).sort()).toEqual(['a--b', 'a--c', 'b--c']);

    await repo.mergePlaces('a', 'b');

    const after = await repo.listPlaces();
    expect(after.map((item) => item.id).sort()).toEqual(['a', 'c']);
    expect((await repo.listVisits()).find((item) => item.id === visit!.id)?.place_id).toBe('a');

    // Recomputing from repository state must never surface the deleted id.
    const pairs = detectSuspectedDuplicatePlaces(after);
    expect(pairs.map((pair) => pair.pairId)).toEqual(['a--c']);
    expect(pairs.some((pair) => pair.pairId.split('--').includes('b'))).toBe(false);
  });

  it('round-trips Trip / Place / Visit / Leg / Expense Markdown without field loss', async () => {
    await repo.upsertTrip({
      ...trip,
      status: 'active',
      currency: 'THB',
      destinations: ['Bangkok', '清迈'],
      members: ['me', '伴侣'],
      timezone: 'Asia/Bangkok',
      transport_mode: 'transit',
      fx_rates: { USD: 36.5 },
    });

    const richPlace: PlannerTripPlace = {
      ...place('rich', '大皇宫', 'rich-google'),
      kind: 'attraction',
      area: 'Rattanakosin',
      address: 'Na Phra Lan Rd, Bangkok',
      coordinates: { lat: 13.75, lng: 100.491 },
      phone: '+66 2 623 5500',
      observed_rating: 4.7,
      observed_price: '฿500',
      open_hours: '08:30-15:30',
      why: '必去',
      notes: '带水',
      tags: ['must_go'],
      signals: ['crowded'],
      risks: ['queue'],
    };
    await repo.upsertPlace(richPlace);

    await repo.upsertVisit({
      schema_version: '0.1',
      type: 'trip_visit',
      id: 'visit-rich',
      trip_id: trip.id,
      place_id: 'rich',
      date: '2026-10-05',
      start: '09:00',
      duration_minutes: 120,
      sort_order: 0,
      locked: true,
      is_anchor: false,
      created_at: '2026-09-02T00:00:00.000Z',
    } as PlannerTripVisit);

    await repo.upsertLeg({
      schema_version: '0.1',
      type: 'trip_leg',
      id: 'leg-rich',
      trip_id: trip.id,
      from_place_id: 'rich',
      to_place_id: 'rich',
      mode: 'transit',
      duration_minutes: 15,
      distance_meters: 1200,
      source: 'openrouteservice',
      created_at: '2026-09-02T00:00:00.000Z',
    } as PlannerTripLeg);

    await repo.upsertExpense({
      id: 'exp-rich',
      trip_id: trip.id,
      title: '门票',
      category: 'ticket',
      amount: 500,
      currency: 'THB',
      date: '2026-10-05',
      paid_by: 'me',
      split_members: ['me', '伴侣'],
      notes: '现金',
      created_at: '2026-10-05T00:00:00.000Z',
    } as TripExpenseItem);

    const reloadedTrip = (await repo.listTrips()).find((item) => item.id === trip.id)!;
    expect(reloadedTrip.currency).toBe('THB');
    expect(reloadedTrip.destinations).toEqual(['Bangkok', '清迈']);
    expect(reloadedTrip.members).toEqual(['me', '伴侣']);
    expect(reloadedTrip.timezone).toBe('Asia/Bangkok');
    expect(reloadedTrip.transport_mode).toBe('transit');
    expect(reloadedTrip.fx_rates).toEqual({ USD: 36.5 });

    const reloadedPlace = (await repo.listPlaces()).find((item) => item.id === 'rich')!;
    expect(reloadedPlace.title).toBe('大皇宫');
    expect(reloadedPlace.area).toBe('Rattanakosin');
    expect(reloadedPlace.address).toBe('Na Phra Lan Rd, Bangkok');
    expect(reloadedPlace.coordinates).toEqual({ lat: 13.75, lng: 100.491 });
    expect(reloadedPlace.phone).toBe('+66 2 623 5500');
    expect(reloadedPlace.observed_rating).toBe(4.7);
    expect(reloadedPlace.observed_price).toBe('฿500');
    expect(reloadedPlace.open_hours).toBe('08:30-15:30');
    expect(reloadedPlace.why).toBe('必去');
    expect(reloadedPlace.notes).toBe('带水');
    expect(reloadedPlace.signals).toEqual(['crowded']);
    expect(reloadedPlace.risks).toEqual(['queue']);
    expect(reloadedPlace.tags).toContain('must_go');

    const reloadedVisit = (await repo.listVisits()).find((item) => item.id === 'visit-rich')!;
    expect(reloadedVisit.place_id).toBe('rich');
    expect(reloadedVisit.date).toBe('2026-10-05');
    expect(reloadedVisit.start).toBe('09:00');
    expect(reloadedVisit.duration_minutes).toBe(120);
    expect(reloadedVisit.locked).toBe(true);

    const reloadedLeg = (await repo.listLegs()).find((item) => item.id === 'leg-rich')!;
    expect(reloadedLeg.mode).toBe('transit');
    expect(reloadedLeg.duration_minutes).toBe(15);
    expect(reloadedLeg.distance_meters).toBe(1200);
    expect(reloadedLeg.source).toBe('openrouteservice');

    const reloadedExpense = (await repo.listExpenses()).find((item) => item.id === 'exp-rich')!;
    expect(reloadedExpense.title).toBe('门票');
    expect(reloadedExpense.amount).toBe(500);
    expect(reloadedExpense.currency).toBe('THB');
    expect(reloadedExpense.split_members).toEqual(['me', '伴侣']);
    expect(reloadedExpense.notes).toBe('现金');
  });
});
