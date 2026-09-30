/**
 * First-run orchestration.
 *
 * Ownly used to interrupt a new user with up to three independent dialogs —
 * storage choice, a Capture→Collection→Planner explainer, and a "record your
 * first real object" chooser — each gated by its own localStorage heuristic.
 * They competed for the same empty state and never told one story.
 *
 * This module is the single authority on where a new user is in that path.
 * Storage selection is decided by the shell (it needs a folder picker), so the
 * guide covers the two steps that were previously in conflict: the mental model
 * first, then the first real record.
 */
import { FIRST_OBJECT_COMPLETED_KEY, FIRST_OBJECT_DISMISSED_KEY } from './first-object-onboarding';

/** LocalStorage key from the retired standalone Capture explainer. */
export const LEGACY_CAPTURE_ONBOARDING_KEY = 'ownly:capture-onboarding:dismissed';

export { FIRST_OBJECT_COMPLETED_KEY, FIRST_OBJECT_DISMISSED_KEY };

export type FirstRunStep = 'model' | 'first-record' | 'done';

export interface FirstRunState {
  isConnected: boolean;
  dataLoaded: boolean;
  objectCount: number;
  completed: boolean;
  dismissed: boolean;
  /** True when the retired Capture dialog was already dismissed by this user. */
  captureExplainerSeen: boolean;
  /** A Sample Trip counts as content: it is a real trip in the data folder. */
  sampleTripLoaded: boolean;
}

/**
 * `null` means "do not interrupt". A user who has ever dismissed the explainer
 * goes straight to the actionable step rather than being shown a lesson twice.
 */
export function resolveFirstRunStep(state: FirstRunState): FirstRunStep | null {
  if (!state.isConnected || !state.dataLoaded) return null;
  if (state.completed || state.dismissed) return null;
  if (state.objectCount > 0) return null;
  if (state.sampleTripLoaded) return null;
  return state.captureExplainerSeen ? 'first-record' : 'model';
}

/** Interpret the legacy key so a returning user is not re-taught the model. */
export function hasSeenCaptureExplainer(raw: string | null): boolean {
  return raw === '1' || raw === 'true';
}
