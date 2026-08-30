import { beforeEach, describe, expect, it, vi } from 'vitest';
import { plannerTripLegId, type PlannerTrip, type PlannerTripLeg, type PlannerTripPlace } from '@/domain/planner';

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

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title: id,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}/@13.74,100.50,15z`,
    kind: 'attraction',
    priority: 'want',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

async function seed(places: PlannerTripPlace[]): Promise<void> {
  for (const item of places) await plannerRepository.upsertPlace(item);
}

beforeEach(async () => {
  files.clear();
  await seed([place('a'), place('b'), place('pool'), place('hotel', { kind: 'stay' })]);
});

describe('PlannerRepository visit lifecycle', () => {
  it('adds a visit without consuming the reusable place', async () => {
    const visit = await plannerRepository.addVisit('pool', '2026-11-01', { sort_order: 5 });
    expect(visit?.place_id).toBe('pool');
    expect(visit?.date).toBe('2026-11-01');
    expect(visit?.sort_order).toBe(5);
    expect(visit?.locked).toBe(false);

    const storedPlace = (await plannerRepository.listPlaces()).find((item) => item.id === 'pool');
    expect(storedPlace?.state).toBe('candidate');
    expect(files.get('vault/Trip Visits')?.size).toBe(1);
  });

  it('allows the same place multiple times on the same day and across days', async () => {
    const first = await plannerRepository.addVisit('pool', '2026-11-01');
    const second = await plannerRepository.addVisit('pool', '2026-11-01');
    const third = await plannerRepository.addVisit('pool', '2026-11-02');
    expect(first?.id).not.toBe(second?.id);
    expect(second?.id).not.toBe(third?.id);
    expect((await plannerRepository.listVisits()).filter((item) => item.place_id === 'pool')).toHaveLength(3);
    expect((await plannerRepository.listPlaces()).filter((item) => item.id === 'pool')).toHaveLength(1);
  });

  it('auto-assigns the next sort order per date', async () => {
    await plannerRepository.addVisit('a', '2026-11-01');
    await plannerRepository.addVisit('b', '2026-11-01');
    const visit = await plannerRepository.addVisit('pool', '2026-11-01');
    expect(visit?.sort_order).toBe(2);
  });

  it('removes only the selected occurrence and keeps the place plus other visits', async () => {
    const first = await plannerRepository.addVisit('pool', '2026-11-01');
    const second = await plannerRepository.addVisit('pool', '2026-11-02');
    expect(first && await plannerRepository.removeVisit(first.id)).toBe(true);
    const visits = await plannerRepository.listVisits();
    expect(visits.map((item) => item.id)).toEqual([second?.id]);
    expect((await plannerRepository.listPlaces()).find((item) => item.id === 'pool')).toBeDefined();
  });

  it('locks and unlocks one visit independently', async () => {
    const visit = await plannerRepository.addVisit('a', '2026-11-01');
    expect(visit).toBeDefined();
    const locked = await plannerRepository.toggleVisitLock(visit!.id);
    expect(locked?.locked).toBe(true);
    const unlocked = await plannerRepository.toggleVisitLock(visit!.id);
    expect(unlocked?.locked).toBe(false);
  });

  it('reorders occurrences, including repeated places, by visit id', async () => {
    const first = await plannerRepository.addVisit('a', '2026-11-01');
    const repeated = await plannerRepository.addVisit('a', '2026-11-01');
    const third = await plannerRepository.addVisit('b', '2026-11-01');
    await plannerRepository.reorderVisits('2026-11-01', [third!.id, repeated!.id, first!.id]);
    const visits = (await plannerRepository.listVisits())
      .filter((item) => item.date === '2026-11-01')
      .sort((left, right) => left.sort_order - right.sort_order);
    expect(visits.map((item) => item.id)).toEqual([third!.id, repeated!.id, first!.id]);
  });

  it('updates timing on the visit rather than the place default', async () => {
    const visit = await plannerRepository.addVisit('a', '2026-11-01');
    const updated = await plannerRepository.updateVisitTiming(visit!.id, { start: '09:30', duration_minutes: 90 });
    expect(updated?.start).toBe('09:30');
    expect(updated?.duration_minutes).toBe(90);
    const placeAfter = (await plannerRepository.listPlaces()).find((item) => item.id === 'a');
    expect(placeAfter?.duration_minutes).toBeUndefined();
  });

  it('persists travel legs as reusable canonical place-pair facts', async () => {
    const leg: PlannerTripLeg = {
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId('trip-1', 'a', 'b'), trip_id: 'trip-1',
      from_place_id: 'a', to_place_id: 'b', mode: 'walking', duration_minutes: 18, distance_meters: 1200,
      source: 'manual', created_at: '2026-08-29T00:00:00.000Z',
    };
    await plannerRepository.upsertLeg(leg);
    expect(await plannerRepository.listLegs()).toEqual([leg]);
    expect(files.get('vault/Trip Legs')?.size).toBe(1);
  });

  it('sets a hotel span as repeatable locked visits without cloning the hotel place', async () => {
    const created = await plannerRepository.setStaySpan('hotel', ['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(created).toHaveLength(3);
    expect(created.every((item) => item.place_id === 'hotel' && item.locked && item.is_anchor)).toBe(true);
    expect((await plannerRepository.listPlaces()).filter((item) => item.id === 'hotel')).toHaveLength(1);
  });

  it('saveTripICalMarkdown re-reads canonical places and visits before projection', async () => {
    const trip: PlannerTrip = {
      schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Bangkok 2026', status: 'planning',
      start_date: '2026-11-01', end_date: '2026-11-03', destinations: ['Bangkok'], created_at: '2026-08-24T00:00:00.000Z',
    };
    await plannerRepository.upsertTrip(trip);
    const visit = await plannerRepository.addVisit('a', '2026-11-01');
    await plannerRepository.updateVisitTiming(visit!.id, { start: '09:00', duration_minutes: 90 });

    const fileName = await plannerRepository.saveTripICalMarkdown('trip-1');
    expect(fileName).toBe('trip--trip-1.itinerary.md');
    const written = files.get('vault/Trips')?.get('trip--trip-1.itinerary.md');
    expect(written).toContain('09:00-10:30');
  });

  it('rejects invalid and ordinary cross-midnight visit timing', async () => {
    const visit = await plannerRepository.addVisit('a', '2026-11-01');
    await expect(plannerRepository.updateVisitTiming(visit!.id, { start: '24:00', duration_minutes: 60 })).rejects.toThrow();
    await expect(plannerRepository.updateVisitTiming(visit!.id, { start: '09:00', duration_minutes: 1441 })).rejects.toThrow();
    await expect(plannerRepository.updateVisitTiming(visit!.id, { start: '23:30', duration_minutes: 60 })).rejects.toThrow();
  });

  it('returns null/false for missing place or visit ids', async () => {
    expect(await plannerRepository.addVisit('ghost', '2026-11-01')).toBeNull();
    expect(await plannerRepository.updateVisitTiming('visit:ghost', { start: '09:00' })).toBeNull();
    expect(await plannerRepository.toggleVisitLock('visit:ghost')).toBeNull();
    expect(await plannerRepository.removeVisit('visit:ghost')).toBe(false);
  });
});
