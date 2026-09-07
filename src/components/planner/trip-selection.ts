import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';

export const SELECTED_TRIP_STORAGE_KEY = 'ownly_planner_selected_trip_id';

function tripTouchTimestamp(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
): string {
  let latest = trip.updated_at || trip.created_at || '';
  for (const place of places) {
    if (place.trip_id === trip.id && place.updated_at && place.updated_at > latest) {
      latest = place.updated_at;
    }
  }
  for (const visit of visits) {
    if (visit.trip_id === trip.id && visit.updated_at && visit.updated_at > latest) {
      latest = visit.updated_at;
    }
  }
  return latest;
}

/**
 * Decides which trip to show when Planner loads without a valid in-memory
 * selection: last-selected trip (if it still exists) → most recently touched
 * trip (trip + its places/visits max updated_at) → first in list.
 * ISO-8601 timestamps compare lexicographically.
 */
export function resolveInitialTripId(
  trips: PlannerTrip[],
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  storedTripId: string,
): string {
  if (trips.length === 0) return '';
  if (storedTripId && trips.some((trip) => trip.id === storedTripId)) return storedTripId;
  let best = trips[0];
  let bestTouch = tripTouchTimestamp(best, places, visits);
  for (const trip of trips) {
    const touch = tripTouchTimestamp(trip, places, visits);
    if (touch > bestTouch) {
      best = trip;
      bestTouch = touch;
    }
  }
  return best.id;
}
