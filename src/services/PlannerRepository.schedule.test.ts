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
  await plannerRepository.upsertTrip({
    schema_version: '0.1',
    type: 'trip',
    id: 'trip-1',
    title: 'Thailand 2026',
    status: 'planning',
    start_date: '2026-11-01',
    end_date: '2026-11-10',
    destinations: ['Bangkok'],
    created_at: '2026-08-24T00:00:00.000Z',
  });
  await seed([place('a'), place('b'), place('pool'), place('hotel', { kind: 'stay' })]);
});

describe('PlannerRepository visit lifecycle', () => {
  it('adds a visit without consuming the reusable place', async () => {
    const visit = await plannerRepository.addVisit('pool', '2026-11-01', { sort_order: 0 });
    expect(visit?.place_id).toBe('pool');
    expect(visit?.date).toBe('2026-11-01');
    expect(visit?.sort_order).toBe(0);
    expect(visit?.locked).toBe(false);

    const storedPlace = (await plannerRepository.listPlaces()).find((item) => item.id === 'pool');
    expect(storedPlace?.state).toBe('candidate');
    expect(files.get('vault/Trip Visits')?.size).toBe(1);
  });

  it('shifts sort_orders on insertion and re-indexes contiguous 0..N-1 on removal', async () => {
    const v1 = await plannerRepository.addVisit('a', '2026-11-01'); // sort_order: 0
    await plannerRepository.addVisit('b', '2026-11-01'); // sort_order: 1
    const v3 = await plannerRepository.addVisit('pool', '2026-11-01', { sort_order: 0 }); // inserted at 0, shifts v1->1, v2->2

    expect(v3?.sort_order).toBe(0);
    const visitsAfterInsert = (await plannerRepository.listVisits())
      .filter((v) => v.date === '2026-11-01')
      .sort((a, b) => a.sort_order - b.sort_order);
    expect(visitsAfterInsert.map((v) => ({ id: v.place_id, order: v.sort_order }))).toEqual([
      { id: 'pool', order: 0 },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ]);

    // Now remove middle item 'a'
    await plannerRepository.removeVisit(v1!.id);
    const visitsAfterRemove = (await plannerRepository.listVisits())
      .filter((v) => v.date === '2026-11-01')
      .sort((a, b) => a.sort_order - b.sort_order);
    expect(visitsAfterRemove.map((v) => ({ id: v.place_id, order: v.sort_order }))).toEqual([
      { id: 'pool', order: 0 },
      { id: 'b', order: 1 },
    ]);
  });

  it('rejects adding a visit or setting a stay span outside trip date range or for missing trip', async () => {
    await expect(plannerRepository.addVisit('pool', '2026-12-25')).rejects.toThrow(
      /outside trip range/,
    );

    await expect(plannerRepository.setStaySpan('hotel', ['2026-11-01', '2026-11-20'])).rejects.toThrow(
      /outside trip range/,
    );
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
      .filter((item) => item.trip_id === 'trip-1' && item.date === '2026-11-01')
      .sort((left, right) => left.sort_order - right.sort_order);
    expect(visits.map((item) => item.id)).toEqual([third!.id, repeated!.id, first!.id]);
  });

  it('rejects cross-trip and partial day reorder payloads', async () => {
    await plannerRepository.upsertTrip({
      schema_version: '0.1',
      type: 'trip',
      id: 'trip-2',
      title: 'Trip 2',
      status: 'planning',
      start_date: '2026-11-01',
      end_date: '2026-11-10',
      destinations: ['Chiang Mai'],
      created_at: '2026-08-24T00:00:00.000Z',
    });
    await seed([place('other', { trip_id: 'trip-2' })]);
    const first = await plannerRepository.addVisit('a', '2026-11-01');
    const second = await plannerRepository.addVisit('b', '2026-11-01');
    const other = await plannerRepository.addVisit('other', '2026-11-01');
    await expect(plannerRepository.reorderVisits('2026-11-01', [first!.id, other!.id])).rejects.toThrow(/one trip/i);
    await expect(plannerRepository.reorderVisits('2026-11-01', [first!.id])).rejects.toThrow(/every visit/i);
    expect((await plannerRepository.listVisits()).find((item) => item.id === second!.id)?.sort_order).toBe(1);
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

  it('replaces a hotel span without leaving stale dates and is idempotent', async () => {
    const first = await plannerRepository.setStaySpan('hotel', ['2026-11-01', '2026-11-02', '2026-11-03']);
    const firstByDate = new Map(first.map((visit) => [visit.date, visit.id] as const));
    const shifted = await plannerRepository.setStaySpan('hotel', ['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(shifted.map((item) => item.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(shifted.find((item) => item.date === '2026-11-02')?.id).toBe(firstByDate.get('2026-11-02'));
    expect(shifted.find((item) => item.date === '2026-11-03')?.id).toBe(firstByDate.get('2026-11-03'));
    expect((await plannerRepository.listVisits()).filter((item) => item.place_id === 'hotel').map((item) => item.date).sort())
      .toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    const repeated = await plannerRepository.setStaySpan('hotel', ['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(repeated.map((item) => item.id)).toEqual(shifted.map((item) => item.id));
    expect((await plannerRepository.listPlaces()).filter((item) => item.id === 'hotel')).toHaveLength(1);
  });

  it('blocks dropping a Place while a Visit still references it', async () => {
    const visit = await plannerRepository.addVisit('a', '2026-11-01');
    await expect(plannerRepository.dropPlace('a')).rejects.toThrow(/remove 1 scheduled visit/i);
    await plannerRepository.removeVisit(visit!.id);
    expect(await plannerRepository.dropPlace('a')).toBe(true);
  });

  it('supports shelving (dropPlace) and restoring (restorePlace) without deleting facts', async () => {
    const placeBefore = (await plannerRepository.listPlaces()).find((p) => p.id === 'a');
    expect(placeBefore?.state).toBe('candidate');
    expect(await plannerRepository.dropPlace('a')).toBe(true);
    const placeDropped = (await plannerRepository.listPlaces()).find((p) => p.id === 'a');
    expect(placeDropped?.state).toBe('dropped');
    expect(placeDropped?.title).toBe(placeBefore?.title);

    expect(await plannerRepository.restorePlace('a')).toBe(true);
    const placeRestored = (await plannerRepository.listPlaces()).find((p) => p.id === 'a');
    expect(placeRestored?.state).toBe('candidate');
    expect(placeRestored?.title).toBe(placeBefore?.title);
  });

  it('exportTripIcs produces deterministic RFC 5545 projection with stable UID and timing', async () => {
    const trip: PlannerTrip = {
      schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Bangkok 2026', status: 'planning',
      start_date: '2026-11-01', end_date: '2026-11-03', destinations: ['Bangkok'], created_at: '2026-08-24T00:00:00.000Z',
    };
    await plannerRepository.upsertTrip(trip);
    const visit = await plannerRepository.addVisit('a', '2026-11-01');
    await plannerRepository.updateVisitTiming(visit!.id, { start: '09:00', duration_minutes: 90 });

    const ics = await plannerRepository.exportTripIcs('trip-1');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain(`UID:visit:${visit!.id}@ownly`);
    expect(ics).toContain('DTSTART:20261101T090000');
    expect(ics).toContain('DTEND:20261101T103000');
    expect(ics).toContain('END:VCALENDAR');

    // Test Calendar Feed management (PRO)
    const feed = await plannerRepository.createOrUpdateCalendarFeed('trip-1');
    expect(feed.trip_id).toBe('trip-1');
    expect(feed.feed_token).toHaveLength(32);
    expect(feed.enabled).toBe(true);

    const rotated = await plannerRepository.rotateCalendarFeed('trip-1');
    expect(rotated.feed_token).not.toBe(feed.feed_token);
    expect(rotated.enabled).toBe(true);

    await plannerRepository.disableCalendarFeed('trip-1');
    const reloaded = (await plannerRepository.listTrips()).find((t) => t.id === 'trip-1');
    expect(reloaded?.calendar_feed?.enabled).toBe(false);
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

  it('persists ignored suspected-duplicate pair decisions on the trip', async () => {
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 'trip-ignore',
      title: 'Review decisions',
      start_date: '2026-11-01',
      end_date: '2026-11-02',
      transport_mode: 'transit',
      destinations: ['Bangkok'],
      status: 'planning',
      ignored_duplicate_pair_ids: ['a--b'],
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
    };
    await plannerRepository.upsertTrip(trip);
    const stored = (await plannerRepository.listTrips()).find((item) => item.id === trip.id);
    expect(stored?.ignored_duplicate_pair_ids).toEqual(['a--b']);
  });

  it('does not auto-merge title-only matches without a strong identity', async () => {
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 'trip-1',
      title: 'Thailand 2026',
      start_date: '2026-11-01',
      end_date: '2026-11-10',
      transport_mode: 'transit',
      destinations: ['Bangkok'],
      status: 'planning',
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
    };
    await plannerRepository.upsertTrip(trip);

    // Initial place in vault with emoji and no Place ID
    const initialPlace = place('p-thip-1', {
      title: '🍜 Thipsamai Padthai Pratoopee',
      source_url: 'https://www.google.com/maps/place/Thipsamai/@13.75279,100.50482',
      source_place_id: undefined,
      notes: 'Initial note',
    });
    await plannerRepository.upsertPlace(initialPlace);

    // Incoming place from capture with Hex Place ID and no emoji
    const incomingPlace = place('p-thip-new', {
      title: 'Thipsamai Padthai Pratoopee',
      source_url: 'https://www.google.com/maps?cid=7605461113463140286',
      source_place_id: '0x30e2991678584ec5:0x698c069655046fbe',
      observed_rating: 4.2,
      observed_review_count: 12569,
    });

    const imported = await plannerRepository.importCapturedPlaces([incomingPlace]);
    expect(imported.created).toContain('p-thip-new');
    expect(imported.failed).toEqual([]);

    const placesAfter = (await plannerRepository.listPlaces()).filter((p) => p.trip_id === 'trip-1');
    // Same display title is weak evidence only; both entities survive until review or a strong ID match.
    const thipPlaces = placesAfter.filter((p) => p.title.includes('Thipsamai'));
    expect(thipPlaces).toHaveLength(2);
    expect(thipPlaces.find((p) => p.id === 'p-thip-1')?.notes).toBe('Initial note');
    expect(thipPlaces.find((p) => p.id === 'p-thip-new')?.source_place_id).toBe('0x30e2991678584ec5:0x698c069655046fbe');
    expect(thipPlaces.find((p) => p.id === 'p-thip-new')?.observed_rating).toBe(4.2);
  });

  it('swaps scheduled day itineraries between two dates atomically preserving order, time and locks', async () => {
    await seed([
      place('p1', { title: 'Grand Palace' }),
      place('p2', { title: 'Wat Pho' }),
      place('p3', { title: 'ICONSIAM' }),
    ]);

    // Schedule p1 and p2 on Day 1 (2026-11-01)
    const v1 = await plannerRepository.addVisit('p1', '2026-11-01');
    await plannerRepository.addVisit('p2', '2026-11-01');
    await plannerRepository.updateVisitTiming(v1!.id, { start: '09:00', duration_minutes: 120 });
    await plannerRepository.toggleVisitLock(v1!.id);

    // Schedule p3 on Day 2 (2026-11-02)
    const v3 = await plannerRepository.addVisit('p3', '2026-11-02');
    await plannerRepository.updateVisitTiming(v3!.id, { start: '14:00', duration_minutes: 180 });

    // Execute swap between 2026-11-01 and 2026-11-02
    const result = await plannerRepository.swapTripDays('trip-1', '2026-11-01', '2026-11-02');
    expect(result.swappedCount).toBe(3);

    const visits = await plannerRepository.listVisits();
    const day1Visits = visits.filter((v) => v.date === '2026-11-01');
    const day2Visits = visits.filter((v) => v.date === '2026-11-02');

    // Day 1 now has p3 with preserved time & duration
    expect(day1Visits).toHaveLength(1);
    expect(day1Visits[0].place_id).toBe('p3');
    expect(day1Visits[0].start).toBe('14:00');
    expect(day1Visits[0].duration_minutes).toBe(180);

    // Day 2 now has p1 and p2 with preserved order, time, duration, and locked status
    expect(day2Visits).toHaveLength(2);
    expect(day2Visits[0].place_id).toBe('p1');
    expect(day2Visits[0].start).toBe('09:00');
    expect(day2Visits[0].duration_minutes).toBe(120);
    expect(day2Visits[0].locked).toBe(true);

    expect(day2Visits[1].place_id).toBe('p2');
    expect(day2Visits[1].sort_order).toBe(1);
  });

  it('handles swapping with an empty day gracefully', async () => {
    await seed([place('p1', { title: 'Grand Palace' })]);
    await plannerRepository.addVisit('p1', '2026-11-01');

    // Swap Day 1 with empty Day 3 (2026-11-03)
    const result = await plannerRepository.swapTripDays('trip-1', '2026-11-01', '2026-11-03');
    expect(result.swappedCount).toBe(1);

    const visits = await plannerRepository.listVisits();
    expect(visits.filter((v) => v.date === '2026-11-01')).toHaveLength(0);
    expect(visits.filter((v) => v.date === '2026-11-03')).toHaveLength(1);
    expect(visits.find((v) => v.date === '2026-11-03')?.place_id).toBe('p1');
  });

  it('rejects swapping dates outside trip range', async () => {
    await expect(
      plannerRepository.swapTripDays('trip-1', '2026-11-01', '2026-12-01'),
    ).rejects.toThrow();
  });
});
