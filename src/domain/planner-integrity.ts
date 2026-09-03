import { PlaceIdentityService } from './place-identity';
import type { PlannerTripPlace } from './planner';
import type { PlannerTripVisit } from './planner-visits';

export type PlannerIntegritySeverity = 'error' | 'warning' | 'info';
export type PlannerIntegrityCategory =
  | 'orphan_visit'
  | 'orphan_place'
  | 'duplicate_identity'
  | 'missing_identity'
  | 'invalid_kind';

export interface PlannerIntegrityIssue {
  severity: PlannerIntegritySeverity;
  category: PlannerIntegrityCategory;
  message: string;
  details?: Record<string, unknown>;
}

export interface PlannerIntegrityReport {
  checkedAt: string;
  summary: {
    trips: number;
    places: number;
    visits: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  issues: PlannerIntegrityIssue[];
  /** Subset of orphan_visit issues that can be auto-fixed via reconstructOrphanPlaces() */
  fixable: Array<{ visitId: string; placeId: string; tripId: string; date: string }>;
}

export interface PlannerIntegrityInput {
  trips: Array<{ id: string }>;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
}

/** Pure function — testable without I/O. */
export function checkPlannerIntegrity(input: PlannerIntegrityInput): PlannerIntegrityReport {
  const { trips, places, visits } = input;
  const issues: PlannerIntegrityIssue[] = [];
  const placeIds = new Set(places.map((p) => p.id));
  const visitedPlaceIds = new Set(visits.map((v) => v.place_id).filter(Boolean));

  // 1. Orphan visits
  for (const v of visits) {
    if (v.place_id && !placeIds.has(v.place_id)) {
      issues.push({
        severity: 'error',
        category: 'orphan_visit',
        message: `Visit "${v.id}" on ${v.date} references missing place "${v.place_id}"`,
        details: { visitId: v.id, placeId: v.place_id, tripId: v.trip_id, date: v.date },
      });
    }
  }

  // 2. Orphan places (active, never visited)
  for (const p of places) {
    if (p.state !== 'dropped' && !visitedPlaceIds.has(p.id)) {
      issues.push({
        severity: 'info',
        category: 'orphan_place',
        message: `Place "${p.title}" has no active visit`,
        details: { placeId: p.id, title: p.title, tripId: p.trip_id },
      });
    }
  }

  // 3. Duplicate strong identities per trip
  const byTrip = new Map<string, PlannerTripPlace[]>();
  for (const p of places) {
    if (!byTrip.has(p.trip_id)) byTrip.set(p.trip_id, []);
    byTrip.get(p.trip_id)!.push(p);
  }
  for (const [tripId, tripPlaces] of byTrip) {
    const idMap = new Map<string, PlannerTripPlace[]>();
    for (const p of tripPlaces) {
      for (const k of PlaceIdentityService.getStrongKeys(p)) {
        if (!idMap.has(k)) idMap.set(k, []);
        idMap.get(k)!.push(p);
      }
    }
    for (const [key, group] of idMap) {
      const unique = new Set(group.map((g) => g.id));
      if (unique.size > 1) {
        issues.push({
          severity: 'warning',
          category: 'duplicate_identity',
          message: `Trip "${tripId}" has ${unique.size} places sharing identity "${key}"`,
          details: { tripId, identityKey: key, placeIds: [...unique], titles: group.map((g) => g.title) },
        });
      }
    }
  }

  // 4. Missing identity
  for (const p of places) {
    if (!p.source_place_id?.trim() && !p.source_url?.trim()) {
      issues.push({
        severity: 'info',
        category: 'missing_identity',
        message: `Place "${p.title}" has no source_place_id or source_url`,
        details: { placeId: p.id, title: p.title },
      });
    }
  }

  // 5. Invalid kind
  const validKinds = new Set(['attraction', 'food', 'cafe', 'stay', 'shopping', 'transit', 'experience', 'service', 'other']);
  for (const p of places) {
    if (p.kind && !validKinds.has(p.kind)) {
      issues.push({
        severity: 'warning',
        category: 'invalid_kind',
        message: `Place "${p.title}" has invalid kind "${p.kind}"`,
        details: { placeId: p.id, kind: p.kind },
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.filter((i) => i.severity === 'info').length;

  const fixable = issues
    .filter((i) => i.category === 'orphan_visit' && i.severity === 'error')
    .map((i) => i.details as { visitId: string; placeId: string; tripId: string; date: string });

  return {
    checkedAt: new Date().toISOString(),
    summary: { trips: trips.length, places: places.length, visits: visits.length, errors, warnings, infos },
    issues,
    fixable,
  };
}

/** I/O wrapper for PlannerRepository. */
export async function runPlannerIntegrity(
  repo: {
    listTrips(): Promise<Array<{ id: string }>>;
    listPlaces(): Promise<PlannerTripPlace[]>;
    listVisits(): Promise<PlannerTripVisit[]>;
  },
): Promise<PlannerIntegrityReport> {
  const [trips, places, visits] = await Promise.all([repo.listTrips(), repo.listPlaces(), repo.listVisits()]);
  return checkPlannerIntegrity({ trips, places, visits });
}
