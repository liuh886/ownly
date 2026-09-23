/**
 * Cross-surface deep link into the Planner's selected trip.
 *
 * The Doctor data-health panel lives on the Home tab while trip selection
 * lives in Planner state, so the hand-off goes through the same localStorage
 * key the Planner already restores from on mount. Keeping the key here (core)
 * lets both the planner components and the shell share one source without the
 * shell importing planner-only modules.
 */
export const PLANNER_SELECTED_TRIP_STORAGE_KEY = 'ownly_planner_selected_trip_id';

/** Records the trip the Planner should open next time it mounts. */
export function focusPlannerTrip(tripId: string): void {
  if (!tripId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLANNER_SELECTED_TRIP_STORAGE_KEY, tripId);
  } catch { /* best-effort; failure is non-fatal */ }
}
