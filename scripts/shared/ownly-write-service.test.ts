import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMarkdownEntity, serializeMarkdownEntity } from '../../src/data/frontmatter';
import { plannerTripLegId, type PlannerTrip, type PlannerTripLeg, type PlannerTripPlace } from '../../src/domain/planner';
import type { PlannerTripVisit } from '../../src/domain/planner-visits';
import type { WYQDObject } from '../../src/domain/types';
import { OwnlyWriteService } from './ownly-write-service';

const temporaryRoots: string[] = [];
const NOW = new Date('2026-08-14T12:00:00+08:00');

function fixture(): { container: string; dataRoot: string } {
  const container = mkdtempSync(join(tmpdir(), 'ownly-write-'));
  temporaryRoots.push(container);
  const dataRoot = join(container, 'Ownly');
  for (const relative of [
    'Objects', 'Snapshots', 'Reviews', 'Logs/Object Experiences', 'Archive/Objects',
    'Trips', 'Trip Places', 'Trip Visits', 'Trip Legs',
  ]) {
    mkdirSync(join(dataRoot, relative), { recursive: true });
  }
  return { container, dataRoot };
}

function seedPlannerPair(dataRoot: string): { trip: PlannerTrip; from: PlannerTripPlace; to: PlannerTripPlace; fromVisit: PlannerTripVisit; toVisit: PlannerTripVisit } {
  const trip: PlannerTrip = {
    schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Bangkok', status: 'planning',
    start_date: '2026-10-05', end_date: '2026-10-06', destinations: ['Bangkok'], created_at: NOW.toISOString(),
  };
  const base = {
    schema_version: '0.1' as const, type: 'trip_place' as const, trip_id: trip.id,
    source_provider: 'google_maps' as const, kind: 'attraction' as const,
    tags: [], signals: [], risks: [], reservation_status: 'none' as const, state: 'candidate' as const,
    created_at: NOW.toISOString(),
  };
  const from: PlannerTripPlace = { ...base, id: 'a', title: 'A', source_url: 'https://maps.google.com/a' };
  const to: PlannerTripPlace = { ...base, id: 'b', title: 'B', source_url: 'https://maps.google.com/b' };
  const fromVisit: PlannerTripVisit = {
    schema_version: '0.1', type: 'trip_visit', id: 'visit:a', trip_id: trip.id, place_id: from.id,
    date: '2026-10-05', sort_order: 0, locked: false, is_anchor: false, created_at: NOW.toISOString(),
  };
  const toVisit: PlannerTripVisit = {
    schema_version: '0.1', type: 'trip_visit', id: 'visit:b', trip_id: trip.id, place_id: to.id,
    date: '2026-10-05', sort_order: 1, locked: false, is_anchor: false, created_at: NOW.toISOString(),
  };
  writeFileSync(join(dataRoot, 'Trips', 'trip--trip-1.md'), serializeMarkdownEntity(trip, ''), 'utf8');
  writeFileSync(join(dataRoot, 'Trip Places', 'place--a.md'), serializeMarkdownEntity(from, ''), 'utf8');
  writeFileSync(join(dataRoot, 'Trip Places', 'place--b.md'), serializeMarkdownEntity(to, ''), 'utf8');
  writeFileSync(join(dataRoot, 'Trip Visits', 'visit--a.md'), serializeMarkdownEntity(fromVisit, ''), 'utf8');
  writeFileSync(join(dataRoot, 'Trip Visits', 'visit--b.md'), serializeMarkdownEntity(toVisit, ''), 'utf8');
  return { trip, from, to, fromVisit, toVisit };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('OwnlyWriteService', () => {
  it('previews without writing and requires explicit write enablement', async () => {
    const { dataRoot } = fixture();
    const service = new OwnlyWriteService(dataRoot, { now: () => NOW });
    const prepared = service.prepareCreateObject({
      object_type: 'physical', title: 'Camera', amount: 8000,
    });

    expect(prepared).toMatchObject({ action: 'create_object', write_enabled: false });
    expect(prepared.preview).toMatchObject({ before: null, after: { title: 'Camera' } });
    expect(readdirSync(join(dataRoot, 'Objects'))).toEqual([]);
    await expect(service.commit(prepared.operation_id)).rejects.toMatchObject({
      code: 'WRITE_DISABLED',
    });
    expect(readdirSync(join(dataRoot, 'Objects'))).toEqual([]);
  });

  it('backs up, commits once, and returns the same result when retried', async () => {
    const { container, dataRoot } = fixture();
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const prepared = service.prepareCreateObject({
      object_type: 'recurring_cost', title: 'Ownly Cloud', amount: 25,
      currency: 'CNY', billing_day: 14,
    });

    const first = await service.commit(prepared.operation_id);
    const second = await service.commit(prepared.operation_id);
    expect(second).toEqual(first);
    expect(first.status).toBe('committed');
    expect(existsSync(join(container, 'Ownly Backups', first.backup_file))).toBe(true);
    const files = readdirSync(join(dataRoot, 'Objects'));
    expect(files).toHaveLength(1);
    const stored = parseMarkdownEntity<WYQDObject>(
      readFileSync(join(dataRoot, 'Objects', files[0]), 'utf8'),
    ).frontmatter;
    expect(stored).toMatchObject({
      title: 'Ownly Cloud', object_type: 'recurring_cost', annualized_cost: 300,
    });
    expect(readFileSync(join(dataRoot, 'Logs', 'agent_operations.log'), 'utf8'))
      .toContain('object_add');
  });

  it('rejects stale previews instead of overwriting a concurrent edit', async () => {
    const { dataRoot } = fixture();
    const creator = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const created = await creator.commit(creator.prepareCreateObject({
      object_type: 'physical', title: 'Camera', amount: 8000,
    }).operation_id);
    const id = String((created.result.object as WYQDObject).id);
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const prepared = service.prepareUpdateObject({ id, title: 'New Camera' });
    const objectFile = join(dataRoot, 'Objects', readdirSync(join(dataRoot, 'Objects'))[0]);
    writeFileSync(objectFile, `${readFileSync(objectFile, 'utf8')}\nConcurrent note.\n`, 'utf8');

    await expect(service.commit(prepared.operation_id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(readFileSync(objectFile, 'utf8')).not.toContain('title: New Camera');
  });

  it('persists travel legs only after explicit commit', async () => {
    const { dataRoot } = fixture();
    const { trip, from, to } = seedPlannerPair(dataRoot);
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const leg: PlannerTripLeg = {
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(trip.id, from.id, to.id), trip_id: trip.id,
      from_place_id: from.id, to_place_id: to.id, mode: 'transit', duration_minutes: 25,
      source: 'manual', observed_at: NOW.toISOString(), created_at: NOW.toISOString(),
    };
    const prepared = service.preparePlannerUpsertTravelLegs([leg], 'planner_set_travel_leg');
    expect(prepared).toMatchObject({ action: 'planner_set_travel_leg', write_enabled: true });
    expect(readdirSync(join(dataRoot, 'Trip Legs'))).toEqual([]);

    const committed = await service.commit(prepared.operation_id);
    expect(committed.result).toMatchObject({ trip_id: trip.id, written: 1 });
    const files = readdirSync(join(dataRoot, 'Trip Legs'));
    expect(files).toHaveLength(1);
    const stored = parseMarkdownEntity<PlannerTripLeg>(readFileSync(join(dataRoot, 'Trip Legs', files[0]), 'utf8')).frontmatter;
    expect(stored).toMatchObject({
      id: leg.id, from_place_id: from.id, to_place_id: to.id, mode: 'transit', duration_minutes: 25, source: 'manual',
    });
  });

  it('keeps manual reorder scoped to the selected Visit trip', async () => {
    const { dataRoot } = fixture();
    const { trip, from, toVisit } = seedPlannerPair(dataRoot);
    const otherTrip: PlannerTrip = { ...trip, id: 'trip-2', title: 'Osaka' };
    const otherPlace: PlannerTripPlace = { ...from, id: 'other', trip_id: otherTrip.id, title: 'Other' };
    const otherVisit: PlannerTripVisit = {
      schema_version: '0.1', type: 'trip_visit', id: 'visit:other', trip_id: otherTrip.id, place_id: otherPlace.id,
      date: '2026-10-05', sort_order: 0, locked: false, is_anchor: false, created_at: NOW.toISOString(),
    };
    writeFileSync(join(dataRoot, 'Trips', 'trip--trip-2.md'), serializeMarkdownEntity(otherTrip, ''), 'utf8');
    writeFileSync(join(dataRoot, 'Trip Places', 'place--other.md'), serializeMarkdownEntity(otherPlace, ''), 'utf8');
    writeFileSync(join(dataRoot, 'Trip Visits', 'visit--other.md'), serializeMarkdownEntity(otherVisit, ''), 'utf8');

    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const prepared = service.prepareReorderDay('2026-10-05', toVisit.id, -1);
    await service.commit(prepared.operation_id);
    const storedOther = parseMarkdownEntity<PlannerTripVisit>(
      readFileSync(join(dataRoot, 'Trip Visits', 'visit--other.md'), 'utf8'),
    ).frontmatter;
    expect(storedOther.sort_order).toBe(0);
  });

  it('replaces stay spans, preserves unchanged Visit ids, and becomes a no-churn repeat', async () => {
    const { dataRoot } = fixture();
    const { from } = seedPlannerPair(dataRoot);
    const hotel: PlannerTripPlace = { ...from, id: 'hotel', kind: 'stay', title: 'Hotel' };
    writeFileSync(join(dataRoot, 'Trip Places', 'place--hotel.md'), serializeMarkdownEntity(hotel, ''), 'utf8');
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });

    await service.commit(service.prepareSetStaySpan('hotel', ['2026-10-05', '2026-10-06', '2026-10-07']).operation_id);
    const first = readdirSync(join(dataRoot, 'Trip Visits'))
      .map((file) => parseMarkdownEntity<PlannerTripVisit>(readFileSync(join(dataRoot, 'Trip Visits', file), 'utf8')).frontmatter)
      .filter((visit) => visit.place_id === 'hotel');
    const firstByDate = new Map(first.map((visit) => [visit.date, visit.id] as const));

    await service.commit(service.prepareSetStaySpan('hotel', ['2026-10-06', '2026-10-07', '2026-10-08']).operation_id);
    const shifted = readdirSync(join(dataRoot, 'Trip Visits'))
      .map((file) => parseMarkdownEntity<PlannerTripVisit>(readFileSync(join(dataRoot, 'Trip Visits', file), 'utf8')).frontmatter)
      .filter((visit) => visit.place_id === 'hotel')
      .sort((left, right) => left.date.localeCompare(right.date));
    expect(shifted.map((visit) => visit.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);
    expect(shifted[0].id).toBe(firstByDate.get('2026-10-06'));
    expect(shifted[1].id).toBe(firstByDate.get('2026-10-07'));

    const repeat = service.prepareSetStaySpan('hotel', ['2026-10-06', '2026-10-07', '2026-10-08']);
    expect(repeat.preview).toMatchObject({ creates: [], retires_visit_ids: [] });
    await service.commit(repeat.operation_id);
    expect(readdirSync(join(dataRoot, 'Trip Visits'))
      .map((file) => parseMarkdownEntity<PlannerTripVisit>(readFileSync(join(dataRoot, 'Trip Visits', file), 'utf8')).frontmatter)
      .filter((visit) => visit.place_id === 'hotel')).toHaveLength(3);
  });

  it('refuses to drop a Planner Place while a Visit references it', () => {
    const { dataRoot } = fixture();
    const { from } = seedPlannerPair(dataRoot);
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    expect(() => service.prepareDropPlannerPlace(from.id)).toThrow(/remove 1 scheduled visit/i);
  });

  it('commits an optimized Visit order and its final adjacent canonical legs in one confirmed operation', async () => {
    const { dataRoot } = fixture();
    const { trip, from, to, fromVisit, toVisit } = seedPlannerPair(dataRoot);
    const third: PlannerTripPlace = { ...to, id: 'c', title: 'C', source_url: 'https://maps.google.com/c' };
    const thirdVisit: PlannerTripVisit = {
      schema_version: '0.1', type: 'trip_visit', id: 'visit:c', trip_id: trip.id, place_id: third.id,
      date: '2026-10-05', sort_order: 2, locked: false, is_anchor: false, created_at: NOW.toISOString(),
    };
    writeFileSync(join(dataRoot, 'Trip Places', 'place--c.md'), serializeMarkdownEntity(third, ''), 'utf8');
    writeFileSync(join(dataRoot, 'Trip Visits', 'visit--c.md'), serializeMarkdownEntity(thirdVisit, ''), 'utf8');

    const legs: PlannerTripLeg[] = [
      {
        schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(trip.id, from.id, third.id), trip_id: trip.id,
        from_place_id: from.id, to_place_id: third.id, mode: 'driving', duration_minutes: 10,
        distance_meters: 2500, source: 'openrouteservice', observed_at: NOW.toISOString(), created_at: NOW.toISOString(),
      },
      {
        schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(trip.id, third.id, to.id), trip_id: trip.id,
        from_place_id: third.id, to_place_id: to.id, mode: 'driving', duration_minutes: 12,
        distance_meters: 3100, source: 'openrouteservice', observed_at: NOW.toISOString(), created_at: NOW.toISOString(),
      },
    ];
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const prepared = service.prepareApplyTravelTimeOptimization(
      trip.id, '2026-10-05', [fromVisit.id, thirdVisit.id, toVisit.id], legs,
      { original_minutes: 60, optimized_minutes: 22, saved_minutes: 38, used_manual_pairs: [] },
    );
    expect(prepared).toMatchObject({ action: 'planner_optimize_day_travel_time', write_enabled: true });
    expect(readdirSync(join(dataRoot, 'Trip Legs'))).toEqual([]);

    const committed = await service.commit(prepared.operation_id);
    expect(committed.result).toMatchObject({ trip_id: trip.id, date: '2026-10-05', updated_visits: 2, refreshed_legs: 2, saved_minutes: 38 });
    const storedOrder = readdirSync(join(dataRoot, 'Trip Visits'))
      .map((file) => parseMarkdownEntity<PlannerTripVisit>(readFileSync(join(dataRoot, 'Trip Visits', file), 'utf8')).frontmatter)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((visit) => visit.place_id);
    expect(storedOrder).toEqual(['a', 'c', 'b']);
    expect(readdirSync(join(dataRoot, 'Trip Legs'))).toHaveLength(2);
  });

  it('supports lifecycle, log, review, snapshot, archive, and restore operations', async () => {
    const { dataRoot } = fixture();
    let tick = 0;
    const service = new OwnlyWriteService(dataRoot, {
      allowWrite: true,
      now: () => new Date(NOW.getTime() + tick++ * 1000),
    });
    const objectResult = await service.commit(service.prepareCreateObject({
      object_type: 'physical', title: 'Old Camera', amount: 1000,
      purchased_at: '2025-01-01',
    }).operation_id);
    const id = String((objectResult.result.object as WYQDObject).id);

    await service.commit(service.prepareRetireObject(id, '2026-08-14').operation_id);
    await service.commit(service.prepareAddObjectLog({
      id, event_type: 'lesson', summary: 'Used less than expected.',
    }).operation_id);
    await service.commit(service.prepareCreateReview({
      review_type: 'object_review', target_id: id, summary: 'Useful learning.',
    }).operation_id);
    await service.commit(service.prepareCreateSnapshot({ assets: 100, liabilities: 20 }).operation_id);
    await service.commit(service.prepareArchiveObject(id).operation_id);
    expect(readdirSync(join(dataRoot, 'Objects'))).toEqual([]);
    await service.commit(service.prepareRestoreObject(id).operation_id);

    expect(readdirSync(join(dataRoot, 'Objects'))).toHaveLength(1);
    expect(readdirSync(join(dataRoot, 'Logs', 'Object Experiences'))).toHaveLength(1);
    expect(readdirSync(join(dataRoot, 'Reviews'))).toHaveLength(1);
    expect(readdirSync(join(dataRoot, 'Snapshots'))).toHaveLength(1);
  });
});
