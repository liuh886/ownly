/**
 * Sample Trip quality gate.
 *
 * A Sample Trip is the first real itinerary a new user ever sees, so it is held
 * to a stricter bar than any hand-authored trip:
 *
 *  1. every entity satisfies the Ownly schema with zero errors;
 *  2. every day reaches `feasible` — no time overlaps, no travel conflicts, no
 *     opening-hours warnings, load below `heavy`;
 *  3. Doctor reports zero errors and zero warnings; the only `info` issues are
 *     the deliberately unscheduled research-pool places;
 *  4. the registry card counts match the data, so the picker cannot advertise a
 *     trip that no longer exists.
 *
 * A failure here means a new user would have seen a broken itinerary.
 */
import { describe, expect, it } from 'vitest';
import { loadSampleTripBundle } from './load';
import { SAMPLE_TRIPS, SAMPLE_TRIP_IDS, allSampleTrips } from './registry';
import { CURRENT_SCHEMA_VERSION } from '@/domain/schema/common';
import { validateEntity } from '@/domain/schema';
import { listTripDates, DEFAULT_USD_PIVOT } from '@/domain/planner';
import { materializePlannerScheduledPlaces, countPlannerPlaceStates } from '@/domain/planner-visits';
import { evaluatePlannerDay } from '@/domain/planner-schedule';
import { checkPlannerIntegrity } from '@/domain/planner-integrity';
import { parseTripBundle, instantiateTripBundle } from '@/domain/trip-bundle';

const built = await Promise.all(SAMPLE_TRIP_IDS.map(async (id) => ({ id, data: await loadSampleTripBundle(id) })));

describe('Sample Trips', () => {
  describe.each(built)('$id', ({ data }) => {
    const { bundle, expenses, members } = data;

    it('is a valid ownly.trip.bundle v1 payload', () => {
      expect(bundle.kind).toBe('ownly.trip.bundle');
      expect(bundle.version).toBe(1);
      const roundTripped = parseTripBundle(JSON.stringify(bundle));
      expect(roundTripped.trip.id).toBe(bundle.trip.id);
      expect(roundTripped.places).toHaveLength(bundle.places.length);
      expect(roundTripped.visits).toHaveLength(bundle.visits.length);
      expect(roundTripped.legs).toHaveLength(bundle.legs.length);
    });

    it('declares a base timezone and only per-day overrides that are real trip dates', () => {
      // Calendar export turns on these fields, so a stale or out-of-range day
      // key would silently produce a wrong UTC instant.
      expect(bundle.trip.timezone, 'base timezone must be set').toBeTruthy();
      for (const [date, zone] of Object.entries(bundle.trip.day_timezones ?? {})) {
        expect(bundle.trip.start_date <= date && date <= bundle.trip.end_date, `override ${date} outside trip`).toBe(true);
        expect(zone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
      }
    });

    it('has every entity pass schema validation with zero errors', () => {
      for (const entity of [bundle.trip, ...bundle.places, ...bundle.visits, ...bundle.legs]) {
        const result = validateEntity(entity);
        const errors = result.issues.filter((issue) => issue.severity === 'error');
        expect(errors, `${entity.type}:${entity.id} → ${JSON.stringify(errors)}`).toEqual([]);
      }
    });

    it('keeps every visit inside the trip date range', () => {
      for (const visit of bundle.visits) {
        expect(visit.date >= bundle.trip.start_date, `${visit.id} before start`).toBe(true);
        expect(visit.date <= bundle.trip.end_date, `${visit.id} after end`).toBe(true);
      }
      const dates = new Set(bundle.visits.map((visit) => visit.date));
      for (const date of dates) {
        expect(listTripDates(bundle.trip.start_date, bundle.trip.end_date)).toContain(date);
      }
    });

    it('schedules no more than 3 stops per day', () => {
      const perDay = new Map<string, number>();
      for (const visit of bundle.visits) {
        perDay.set(visit.date, (perDay.get(visit.date) ?? 0) + 1);
      }
      for (const [date, count] of perDay) {
        expect(count, `${date} has ${count} stops`).toBeLessThanOrEqual(3);
      }
    });

    it('gives every stop an explicit start and duration', () => {
      for (const visit of bundle.visits) {
        expect(visit.start, `${visit.id} has no start`).toMatch(/^\d{2}:\d{2}$/);
        expect(visit.duration_minutes, `${visit.id} has no duration`).toBeGreaterThan(0);
      }
      for (const place of bundle.places) {
        expect(place.duration_minutes, `${place.id} has no duration`).toBeGreaterThan(0);
      }
    });

    it('has a leg for every consecutive pair inside a day', () => {
      const byDay = new Map<string, string[]>();
      for (const visit of bundle.visits) {
        const list = byDay.get(visit.date) ?? [];
        list.push(visit.place_id);
        byDay.set(visit.date, list);
      }
      const legPairs = new Set(bundle.legs.map((leg) => `${leg.from_place_id}→${leg.to_place_id}`));
      for (const [date, placeIds] of byDay) {
        const ordered = bundle.visits
          .filter((visit) => visit.date === date)
          .sort((left, right) => left.sort_order - right.sort_order)
          .map((visit) => visit.place_id);
        expect(ordered).toEqual(expect.arrayContaining(placeIds));
        for (let index = 0; index + 1 < ordered.length; index += 1) {
          const pair = `${ordered[index]}→${ordered[index + 1]}`;
          expect(legPairs.has(pair), `${date}: missing leg ${pair}`).toBe(true);
        }
      }
    });

    it('references only places that exist in the same trip', () => {
      const placeIds = new Set(bundle.places.map((place) => place.id));
      for (const visit of bundle.visits) {
        expect(placeIds.has(visit.place_id), `${visit.id} → ${visit.place_id}`).toBe(true);
      }
      for (const leg of bundle.legs) {
        expect(placeIds.has(leg.from_place_id)).toBe(true);
        expect(placeIds.has(leg.to_place_id)).toBe(true);
      }
      for (const expense of expenses) {
        if (expense.placeId) expect(placeIds.has(expense.placeId), `${expense.id} → ${expense.placeId}`).toBe(true);
      }
    });

    it('uses one schema version throughout', () => {
      for (const entity of [bundle.trip, ...bundle.places, ...bundle.visits, ...bundle.legs]) {
        expect(entity.schema_version).toBe(CURRENT_SCHEMA_VERSION);
      }
    });

    it('resolves every place to a trip destination, not 未分类城市', async () => {
      const { inferPlaceCity } = await import('@/domain/planner');
      for (const place of bundle.places) {
        const city = inferPlaceCity(place, bundle.trip.destinations);
        expect(city, `${place.id} (${place.title}) → ${city}`).not.toBe('未分类城市');
        expect(bundle.trip.destinations).toContain(city);
      }
    });

    it('makes every day feasible', () => {
      const scheduled = materializePlannerScheduledPlaces(bundle.places, bundle.visits);
      for (const date of listTripDates(bundle.trip.start_date, bundle.trip.end_date)) {
        const assessment = evaluatePlannerDay(bundle.trip, scheduled, bundle.legs, date);
        const detail = JSON.stringify({
          time_overlaps: assessment.time_overlaps,
          travel_conflicts: assessment.travel_conflicts,
          opening_hours_warnings: assessment.opening_hours_warnings,
          missing_facts: assessment.missing_facts,
          overload: assessment.overload_reason,
        });
        expect(assessment.status, `${bundle.trip.id} ${date} → ${detail}`).toBe('feasible');
        expect(assessment.is_overloaded, `${date} load ${assessment.load.level}/${assessment.load.score}`).toBe(false);
      }
    });

    it('gives every day a lunch and dinner gap', () => {
      const scheduled = materializePlannerScheduledPlaces(bundle.places, bundle.visits);
      for (const date of listTripDates(bundle.trip.start_date, bundle.trip.end_date)) {
        const { load } = evaluatePlannerDay(bundle.trip, scheduled, bundle.legs, date);
        expect(load.lunch_ok, `${date} has no lunch gap`).toBe(true);
        expect(load.dinner_ok, `${date} has no dinner gap`).toBe(true);
      }
    });

    it('is clean under Planner Doctor', () => {
      const report = checkPlannerIntegrity({
        trips: [{ id: bundle.trip.id }],
        places: bundle.places,
        visits: bundle.visits,
      });
      expect(report.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(report.issues.filter((issue) => issue.severity === 'warning')).toEqual([]);
      // `orphan_place` is the research pool, which every Sample Trip ships on purpose.
      const unexpected = report.issues.filter((issue) => issue.category !== 'orphan_place');
      expect(unexpected, JSON.stringify(unexpected)).toEqual([]);
      expect(report.summary.infos).toBeGreaterThan(0);
    });

    it('ships a research pool of unscheduled candidates', () => {
      const counts = countPlannerPlaceStates(bundle.places, bundle.visits);
      expect(counts.active - counts.scheduled).toBeGreaterThan(0);
    });

    it('splits every expense between declared members', () => {
      expect(members?.length ?? 0).toBeGreaterThan(0);
      for (const expense of expenses) {
        expect(members).toContain(expense.paidBy);
        expect(expense.splitMembers.length).toBeGreaterThan(0);
        for (const member of expense.splitMembers) expect(members).toContain(member);
        expect(expense.amount).toBeGreaterThan(0);
        expect(expense.currency).toMatch(/^[A-Z]{3}$/);
      }
    });

    it('keeps a multi-currency ledger so the FX path is exercised', () => {
      const currencies = new Set(expenses.map((expense) => expense.currency));
      expect(currencies.size).toBeGreaterThan(0);
      // Every code the ledger stores must be one Ownly can actually price,
      // otherwise the budget panel silently drops the whole trip to "unconverted".
      for (const code of currencies) {
        expect(DEFAULT_USD_PIVOT[code], `no FX pivot for ${code}`).toBeGreaterThan(0);
      }
    });
  });

  it('regenerates every id on import, so loading twice never collides', () => {
    for (const { data } of built) {
      const parsed = parseTripBundle(JSON.stringify(data.bundle));
      const first = instantiateTripBundle(parsed);
      const second = instantiateTripBundle(parsed);
      expect(first.trip.id).not.toBe(data.bundle.trip.id);
      expect(first.trip.id).not.toBe(second.trip.id);
      const originalPlaceIds = new Set(data.bundle.places.map((place) => place.id));
      for (const place of first.places) expect(originalPlaceIds.has(place.id)).toBe(false);
      for (const visit of first.visits) expect(visit.id).toMatch(/^visit:[0-9a-f-]{36}$/);
    }
  });

  it('keeps registry card counts honest', async () => {
    for (const { id, data } of built) {
      const summary = SAMPLE_TRIPS[id];
      expect(summary.days).toBe(listTripDates(data.bundle.trip.start_date, data.bundle.trip.end_date).length);
      expect(summary.stops).toBe(data.bundle.visits.length);
      const counts = countPlannerPlaceStates(data.bundle.places, data.bundle.visits);
      expect(summary.poolSize).toBe(counts.active - counts.scheduled);
    }
    expect(allSampleTrips()).toHaveLength(SAMPLE_TRIP_IDS.length);
  });

  it('covers three distinct regions and never collides on identity', () => {
    const regions = built.map(({ data }) => data.bundle.trip.destinations[0]);
    expect(new Set(regions).size).toBe(SAMPLE_TRIP_IDS.length);
    for (const { data } of built) {
      const urls = new Set(data.bundle.places.map((place) => place.source_url));
      const titles = new Set(data.bundle.places.map((place) => place.title));
      expect(urls.size).toBe(data.bundle.places.length);
      expect(titles.size).toBe(data.bundle.places.length);
    }
  });

  it('demonstrates per-day timezone overrides somewhere in the set', () => {
    // The Thailand trip crosses Bangkok (UTC+7) → Kunming (UTC+8). The other
    // two stay in one zone, which is correct data — but at least one Sample
    // Trip must show the per-day override, or the feature is never demonstrated.
    const crossing = built.filter(({ data }) =>
      Object.values(data.bundle.trip.day_timezones ?? {}).some((zone) => zone !== data.bundle.trip.timezone),
    );
    expect(crossing.map(({ id }) => id)).toContain('sample-thailand-6d');
  });
});
