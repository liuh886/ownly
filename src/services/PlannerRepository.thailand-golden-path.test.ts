import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectHotelTransferDays,
  estimateTripBudget,
  listTripDates,
  plannerTripLegId,
  type FxSettings,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
} from '@/domain/planner';
import { materializePlannerScheduledPlaces } from '@/domain/planner-visits';
import { evaluatePlannerDay } from '@/domain/planner-schedule';

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

describe('Thailand 2026 Golden Path E2E Journey', () => {
  beforeEach(() => {
    files.clear();
  });

  it('runs complete multi-city itinerary lifecycle with zero errors', async () => {
    // 1. Create Trip
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 'thailand-2026',
      title: 'Thailand 2026: Bangkok & Chiang Mai',
      status: 'planning',
      start_date: '2026-10-05',
      end_date: '2026-10-12',
      destinations: ['Bangkok', 'Chiang Mai'],
      currency: 'THB',
      members: ['Alice', 'Bob', 'Charlie', 'Diana'],
      transport_mode: 'transit',
      tags: ['vacation', 'temples', 'food'],
      created_at: '2026-09-01T00:00:00.000Z',
    };
    await plannerRepository.upsertTrip(trip);
    const trips = await plannerRepository.listTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].title).toBe('Thailand 2026: Bangkok & Chiang Mai');

    // 2. Ingest Researched Places
    const places: PlannerTripPlace[] = [
      {
        schema_version: '0.1',
        type: 'trip_place',
        id: 'place-oakwood-bkk',
        trip_id: trip.id,
        title: 'Oakwood Studios Sukhumvit Bangkok',
        source_provider: 'google_maps',
        source_url: 'https://maps.google.com/?cid=oakwood',
        source_place_id: 'ChIJ_oakwood_bkk',
        kind: 'stay',
        priority: 'must',
        observed_price: '฿2,500/晚',
        observed_rating: 4.5,
        observed_review_count: 996,
        coordinates: { lat: 13.725, lng: 100.578 },
        tags: ['stay', 'bts-thonglor'],
        signals: [],
        risks: [],
        reservation_status: 'booked',
        state: 'candidate',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1',
        type: 'trip_place',
        id: 'place-grand-palace',
        trip_id: trip.id,
        title: 'The Grand Palace',
        source_provider: 'google_maps',
        source_url: 'https://maps.google.com/?cid=grand_palace',
        source_place_id: 'ChIJ_grand_palace',
        kind: 'attraction',
        priority: 'must',
        open_hours: '08:30 - 15:30',
        duration_minutes: 120,
        observed_price: '฿500',
        observed_rating: 4.6,
        coordinates: { lat: 13.750, lng: 100.491 },
        tags: ['attraction', 'landmark'],
        signals: [],
        risks: ['Strict dress code required'],
        reservation_status: 'none',
        state: 'candidate',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1',
        type: 'trip_place',
        id: 'place-wat-pho',
        trip_id: trip.id,
        title: 'Wat Phra Chetuphon (Wat Pho)',
        source_provider: 'google_maps',
        source_url: 'https://maps.google.com/?cid=wat_pho',
        source_place_id: 'ChIJ_wat_pho',
        kind: 'attraction',
        priority: 'must',
        open_hours: '08:00 - 18:30',
        duration_minutes: 90,
        observed_price: '฿200',
        observed_rating: 4.7,
        coordinates: { lat: 13.746, lng: 100.493 },
        tags: ['attraction', 'temple'],
        signals: [],
        risks: [],
        reservation_status: 'none',
        state: 'candidate',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1',
        type: 'trip_place',
        id: 'place-thipsamai',
        trip_id: trip.id,
        title: 'Thipsamai Padthai Pratoopee',
        source_provider: 'google_maps',
        source_url: 'https://maps.google.com/?cid=thipsamai',
        source_place_id: 'ChIJ_thipsamai',
        kind: 'food',
        priority: 'want',
        open_hours: '16:00 - 23:00',
        duration_minutes: 60,
        observed_price: '฿200–400',
        observed_rating: 4.2,
        coordinates: { lat: 13.752, lng: 100.505 },
        tags: ['food', 'michelin'],
        signals: ['Popular evening spot'],
        risks: [],
        reservation_status: 'none',
        state: 'candidate',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1',
        type: 'trip_place',
        id: 'place-anantara-cnx',
        trip_id: trip.id,
        title: 'Anantara Chiang Mai Resort',
        source_provider: 'google_maps',
        source_url: 'https://maps.google.com/?cid=anantara_cnx',
        source_place_id: 'ChIJ_anantara_cnx',
        kind: 'stay',
        priority: 'must',
        observed_price: '฿4,500/晚',
        observed_rating: 4.8,
        coordinates: { lat: 18.783, lng: 99.003 },
        tags: ['stay', 'ping-river'],
        signals: [],
        risks: [],
        reservation_status: 'booked',
        state: 'candidate',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ];

    const imported = await plannerRepository.importCapturedPlaces(places);
    expect(imported).toHaveLength(5);
    expect(await plannerRepository.listPlaces()).toHaveLength(5);

    // 3. Hotel Stay Spans (Bangkok: 10/05..10/07, Chiang Mai: 10/08..10/11)
    const bkkStay = await plannerRepository.setStaySpan('place-oakwood-bkk', ['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(bkkStay).toHaveLength(3);

    const cnxStay = await plannerRepository.setStaySpan('place-anantara-cnx', ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(cnxStay).toHaveLength(4);

    // Verify hotel transfer detection on 2026-10-08
    const tripDates = listTripDates(trip.start_date, trip.end_date);
    const allPlaces = await plannerRepository.listPlaces();
    const allVisits = await plannerRepository.listVisits();
    const scheduled = materializePlannerScheduledPlaces(allPlaces, allVisits);

    const transferInfo = detectHotelTransferDays(scheduled, tripDates);
    expect(transferInfo['2026-10-08'].isTransferDay).toBe(true);
    expect(transferInfo['2026-10-08'].checkoutHotel?.title).toBe('Oakwood Studios Sukhumvit Bangkok');
    expect(transferInfo['2026-10-08'].checkinHotel?.title).toBe('Anantara Chiang Mai Resort');

    // 4. Schedule Day 1 Sightseeing (2026-10-05)
    // Grand Palace: 09:00 - 11:00
    const vPalace = await plannerRepository.addVisit('place-grand-palace', '2026-10-05', {
      start: '09:00',
      duration_minutes: 120,
    });
    // Wat Pho: 11:30 - 13:00
    const vPho = await plannerRepository.addVisit('place-wat-pho', '2026-10-05', {
      start: '11:30',
      duration_minutes: 90,
    });
    // Thipsamai: 17:00 - 18:00
    const vThip = await plannerRepository.addVisit('place-thipsamai', '2026-10-05', {
      start: '17:00',
      duration_minutes: 60,
    });

    expect(vPalace).toBeDefined();
    expect(vPho).toBeDefined();
    expect(vThip).toBeDefined();

    // 5. Verify Day 1 Daily Sort Orders Contiguity [0, 1, 2, 3]
    const day1Visits = (await plannerRepository.listVisits())
      .filter((v) => v.date === '2026-10-05')
      .sort((a, b) => a.sort_order - b.sort_order);

    expect(day1Visits.map((v) => v.sort_order)).toEqual([0, 1, 2, 3]);
    expect(day1Visits[0].place_id).toBe('place-oakwood-bkk'); // Hotel anchor is 0
    expect(day1Visits[1].place_id).toBe('place-grand-palace');
    expect(day1Visits[2].place_id).toBe('place-wat-pho');
    expect(day1Visits[3].place_id).toBe('place-thipsamai');

    // 6. Persist Routing Legs
    const legs: PlannerTripLeg[] = [
      {
        schema_version: '0.1',
        type: 'trip_leg',
        id: plannerTripLegId(trip.id, 'place-grand-palace', 'place-wat-pho'),
        trip_id: trip.id,
        from_place_id: 'place-grand-palace',
        to_place_id: 'place-wat-pho',
        mode: 'walking',
        duration_minutes: 12,
        distance_meters: 900,
        source: 'openrouteservice',
        observed_at: '2026-09-01T00:00:00.000Z',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        schema_version: '0.1',
        type: 'trip_leg',
        id: plannerTripLegId(trip.id, 'place-wat-pho', 'place-thipsamai'),
        trip_id: trip.id,
        from_place_id: 'place-wat-pho',
        to_place_id: 'place-thipsamai',
        mode: 'transit',
        duration_minutes: 18,
        distance_meters: 2400,
        source: 'openrouteservice',
        observed_at: '2026-09-01T00:00:00.000Z',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ];
    for (const leg of legs) await plannerRepository.upsertLeg(leg);

    // 7. Canonical Day Assessment for 2026-10-05
    const latestPlaces = await plannerRepository.listPlaces();
    const latestVisits = await plannerRepository.listVisits();
    const latestLegs = await plannerRepository.listLegs();
    const latestScheduled = materializePlannerScheduledPlaces(latestPlaces, latestVisits);

    const assessment = evaluatePlannerDay(trip, latestScheduled, latestLegs, '2026-10-05');
    expect(assessment.time_overlaps).toHaveLength(0);
    expect(assessment.travel_conflicts).toHaveLength(0);
    expect(assessment.is_overloaded).toBe(false);

    // Grand Palace: 09:00-11:00 (open 08:30-15:30) -> clean
    // Wat Pho: 11:30-13:00 (open 08:00-18:30) -> clean
    // Thipsamai: 17:00-18:00 (open 16:00-23:00) -> clean
    expect(assessment.opening_hours_warnings).toHaveLength(0);

    // 8. Estimate Budget
    const fx: FxSettings = { base: 'THB', overrides: undefined };
    const budget = estimateTripBudget(latestScheduled, 4, fx);
    expect(budget.totalEstimated).toBeGreaterThan(0);
    expect(budget.perPersonEstimated).toBe(Math.round(budget.totalEstimated / 4));

    // 9. Export Deterministic RFC 5545 ICS Calendar & Calendar Feed
    const ics = await plannerRepository.exportTripIcs(trip.id);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain(`X-WR-CALNAME:${trip.title}`);
    expect(ics).toContain('The Grand Palace');
    expect(ics).toContain('Wat Phra Chetuphon');
    expect(ics).toContain('Thipsamai Padthai Pratoopee');
    expect(ics).toContain('DTSTART:20261005T090000');
    expect(ics).toContain('DTEND:20261005T110000');
    expect(ics).toContain('DTSTART:20261005T113000');
    expect(ics).toContain('DTEND:20261005T130000');
    expect(ics).toContain('DTSTART:20261005T170000');
    expect(ics).toContain('DTEND:20261005T180000');
    expect(ics).toContain('END:VCALENDAR');

    // Verify Calendar Feed Creation (PRO)
    const feed = await plannerRepository.createOrUpdateCalendarFeed(trip.id);
    expect(feed.trip_id).toBe(trip.id);
    expect(feed.feed_token).toHaveLength(32);
    expect(feed.enabled).toBe(true);
  });
});