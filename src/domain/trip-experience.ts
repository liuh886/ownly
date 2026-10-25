import type { PlannerTrip } from './planner';
import type { OneTimeExperienceObject } from './types';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';

export function tripExperienceId(trip: PlannerTrip): string | undefined {
  return trip.experience_id || trip.review_id;
}

export function tripExperienceStatus(trip: PlannerTrip, reviewed = false): OneTimeExperienceObject['status'] {
  return trip.status === 'completed' ? (reviewed ? 'reviewed' : 'completed')
    : trip.status === 'active' ? 'in_progress' : 'planned';
}

/** Planner owns itinerary fields; preserve budgets, detailed locations, notes and extensions. */
export function experienceFromTrip(trip: PlannerTrip, existing?: OneTimeExperienceObject): OneTimeExperienceObject {
  const locations = trip.destinations.map((city) => ({
    city,
    ...existing?.locations?.find((location) => location.city === city),
    ...(existing?.location?.city === city ? existing.location : {}),
  }));
  return {
    ...existing,
    schema_version: WYQD_SCHEMA_VERSION,
    type: 'object',
    object_type: 'one_time_experience',
    id: existing?.id ?? tripExperienceId(trip) ?? `obj_trip_review_${encodeURIComponent(trip.id)}`,
    title: trip.title,
    status: tripExperienceStatus(trip, Boolean(existing?.review_ref)),
    experience_subtype: locations.length ? 'travel_worldview' : existing?.experience_subtype,
    started_at: trip.start_date,
    ended_at: trip.end_date,
    location: locations[0],
    locations: locations.length ? locations : undefined,
    currency: trip.currency ?? existing?.currency ?? 'CNY',
    tags: existing?.tags ?? ['ownly', 'experience', 'travel'],
    created_at: existing?.created_at ?? trip.created_at,
    updated_at: trip.updated_at ?? trip.created_at,
  };
}

export function tripFromExperience(object: OneTimeExperienceObject, id: string, now: string): PlannerTrip {
  return {
    schema_version: '0.1', type: 'trip', id, experience_id: object.id,
    title: object.title,
    status: object.status === 'completed' || object.status === 'reviewed' ? 'completed'
      : object.status === 'in_progress' ? 'active' : 'planning',
    start_date: object.started_at ?? '', end_date: object.ended_at ?? object.started_at ?? '',
    destinations: (object.locations?.length ? object.locations : object.location ? [object.location] : [])
      .map((location) => location.city || location.region || location.country || '').filter(Boolean),
    currency: object.currency ?? 'CNY',
    created_at: now, updated_at: now,
  };
}
