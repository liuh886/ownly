/**
 * Sample Trip onboarding policy.
 *
 * Product Governance requires that Ownly never *silently* writes demo data into
 * a real data folder. A Sample Trip is therefore always an explicit click, and
 * the only thing persisted about the decision is a one-line flag used to keep
 * the picker from re-nagging a user who already chose.
 *
 * Pure functions, mirroring `first-object-onboarding.ts`, so the trigger can be
 * tested without a browser.
 */
import { SAMPLE_TRIP_TAG } from '@/data/sample-trips/registry';
import type { PlannerTrip } from '@/domain/planner';

/** Set once a user loads any Sample Trip. */
export const SAMPLE_TRIP_LOADED_KEY = 'ownly_sample_trip_loaded';
/** Set when a user explicitly hides the picker without loading anything. */
export const SAMPLE_TRIP_DISMISSED_KEY = 'ownly_sample_trip_dismissed';

export interface SampleTripPromptState {
  isConnected: boolean;
  dataLoaded: boolean;
  tripCount: number;
  loaded: boolean;
  dismissed: boolean;
}

export interface SampleTripPromptDecision {
  /** Render the picker cards on the Planner empty state. */
  showPicker: boolean;
  /** Offer only the compact "load a Sample Trip" link (e.g. inside a modal). */
  showCompactLink: boolean;
}

/**
 * The picker is for a genuinely empty Planner. Once a user has any trip —
 * their own or a Sample Trip they loaded — they have something to read, so
 * pushing example data at them is noise rather than help.
 */
export function resolveSampleTripPrompt(state: SampleTripPromptState): SampleTripPromptDecision {
  const ready = state.isConnected && state.dataLoaded && state.tripCount === 0;
  if (!ready || state.loaded) return { showPicker: false, showCompactLink: false };
  if (state.dismissed) return { showPicker: false, showCompactLink: true };
  return { showPicker: true, showCompactLink: true };
}

export function isSampleTrip(trip: Pick<PlannerTrip, 'tags'>): boolean {
  return (trip.tags ?? []).includes(SAMPLE_TRIP_TAG);
}
