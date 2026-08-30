import type { PlannerScheduledPlace, PlannerTripPlace, PlannerVisitAnchorType } from './planner';

export { sortPlannerScheduledPlaces } from './planner';
export type { PlannerScheduledPlace, PlannerVisitAnchorType } from './planner';

export interface PlannerTripVisit {
  schema_version: '0.1';
  type: 'trip_visit';
  id: string;
  trip_id: string;
  place_id: string;
  date: string;
  start?: string;
  duration_minutes?: number;
  sort_order: number;
  locked: boolean;
  is_anchor: boolean;
  anchor_type?: PlannerVisitAnchorType;
  created_at: string;
  updated_at?: string;
}

/**
 * Derived execution read model. Trip Places remain reusable research facts;
 * Trip Visits own every occurrence-specific scheduling decision.
 */
export function materializePlannerScheduledPlaces(
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
): PlannerScheduledPlace[] {
  const byId = new Map(places.map((place) => [place.id, place] as const));
  return visits.flatMap((visit) => {
    const place = byId.get(visit.place_id);
    if (!place || place.trip_id !== visit.trip_id || place.state === 'dropped') return [];
    return [{
      ...place,
      id: visit.id,
      visit_id: visit.id,
      place_id: place.id,
      state: 'scheduled' as const,
      scheduled_date: visit.date,
      scheduled_start: visit.start,
      duration_minutes: visit.duration_minutes ?? place.duration_minutes,
      sort_order: visit.sort_order,
      locked: visit.locked,
      is_anchor: visit.is_anchor,
      anchor_type: visit.anchor_type,
    }];
  });
}

export function createPlannerTripVisit(
  place: PlannerTripPlace,
  date: string,
  sortOrder: number,
  options: Partial<Pick<PlannerTripVisit, 'start' | 'duration_minutes' | 'locked' | 'is_anchor' | 'anchor_type'>> = {},
  now = new Date(),
  id = crypto.randomUUID(),
): PlannerTripVisit {
  const timestamp = now.toISOString();
  return {
    schema_version: '0.1',
    type: 'trip_visit',
    id: `visit:${id}`,
    trip_id: place.trip_id,
    place_id: place.id,
    date,
    start: options.start,
    duration_minutes: options.duration_minutes ?? place.duration_minutes,
    sort_order: sortOrder,
    locked: options.locked ?? false,
    is_anchor: options.is_anchor ?? false,
    anchor_type: options.anchor_type,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function plannerTripVisitFileName(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'visit';
  return `visit--${safe}.md`;
}
