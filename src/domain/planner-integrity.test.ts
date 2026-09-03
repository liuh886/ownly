import { describe, expect, it } from 'vitest';
import { checkPlannerIntegrity } from './planner-integrity';
import type { PlannerTripPlace } from './planner';
import type { PlannerTripVisit } from './planner-visits';

function place(over: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id: over.id ?? 'place-1',
    trip_id: over.trip_id ?? 'trip-1',
    title: over.title ?? 'Test Place',
    source_provider: over.source_provider ?? 'google_maps',
    source_url: over.source_url ?? 'https://maps.example.com/1',
    source_place_id: over.source_place_id ?? 'ChIJ111',
    kind: over.kind ?? 'attraction',
    tags: over.tags ?? [],
    signals: over.signals ?? [],
    risks: over.risks ?? [],
    reservation_status: over.reservation_status ?? 'none',
    state: over.state ?? 'candidate',
    ...over,
  } as PlannerTripPlace;
}

function visit(over: Partial<PlannerTripVisit> = {}): PlannerTripVisit {
  return {
    schema_version: '0.1',
    type: 'trip_visit',
    id: over.id ?? 'visit-1',
    trip_id: over.trip_id ?? 'trip-1',
    place_id: over.place_id ?? 'place-1',
    date: over.date ?? '2026-10-05',
    sort_order: over.sort_order ?? 0,
    locked: over.locked ?? false,
    is_anchor: over.is_anchor ?? false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as PlannerTripVisit;
}

describe('planner-integrity', () => {
  it('detects orphan visit', () => {
    const r = checkPlannerIntegrity({ trips: [{ id: 'trip-1' }], places: [], visits: [visit({ place_id: 'missing' })] });
    expect(r.issues.some((i) => i.category === 'orphan_visit')).toBe(true);
    expect(r.fixable).toHaveLength(1);
    expect(r.summary.errors).toBe(1);
  });

  it('detects duplicate strong identity in same trip', () => {
    const p1 = place({ id: 'a', source_place_id: 'ChIJ111' });
    const p2 = place({ id: 'b', source_place_id: 'ChIJ111' });
    const r = checkPlannerIntegrity({ trips: [{ id: 'trip-1' }], places: [p1, p2], visits: [] });
    expect(r.issues.some((i) => i.category === 'duplicate_identity')).toBe(true);
  });

  it('does not flag duplicate across different trips', () => {
    const p1 = place({ id: 'a', trip_id: 'trip-1', source_place_id: 'ChIJ111' });
    const p2 = place({ id: 'b', trip_id: 'trip-2', source_place_id: 'ChIJ111' });
    const r = checkPlannerIntegrity({ trips: [{ id: 'trip-1' }, { id: 'trip-2' }], places: [p1, p2], visits: [] });
    expect(r.issues.some((i) => i.category === 'duplicate_identity')).toBe(false);
  });

  it('fixable tracks orphan visits for reconstruct', () => {
    const r = checkPlannerIntegrity({ trips: [{ id: 'trip-1' }], places: [place({ id: 'ok' })], visits: [visit({ place_id: 'missing', id: 'v1' })] });
    expect(r.fixable[0]).toMatchObject({ visitId: 'v1', placeId: 'missing' });
  });
});
