import { ensurePlaceKindTag, mergeCaptureState, type PlannerTrip, type PlannerTripPlace } from '../domain/planner';

export const CAPTURE_STORAGE_KEY = 'ownlyCaptureStateV1';

export interface OwnlyCaptureState {
  version: 1;
  trips: PlannerTrip[];
  activeTripId: string | null;
  pendingPlaces: PlannerTripPlace[];
  knownPlaceIds: Record<string, string>;
}

export const EMPTY_CAPTURE_STATE: OwnlyCaptureState = {
  version: 1,
  trips: [],
  activeTripId: null,
  pendingPlaces: [],
  knownPlaceIds: {},
};

/** Drops structurally-broken trips and guarantees a non-empty title. */
function normalizeTrips(value: unknown): PlannerTrip[] {
  if (!Array.isArray(value)) return [];
  const trips = value.filter((item): item is PlannerTrip => {
    return Boolean(item && typeof item === 'object' && typeof (item as PlannerTrip).id === 'string');
  });
  for (const trip of trips) {
    if (!trip.status) trip.status = 'planning';
    if (!Array.isArray(trip.tags)) trip.tags = [];
    if (!Array.isArray(trip.destinations)) trip.destinations = [];
  }
  return trips;
}

function normalizePlaces(value: unknown): PlannerTripPlace[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PlannerTripPlace => {
    return Boolean(item && typeof item === 'object' && typeof (item as PlannerTripPlace).id === 'string');
  }).map((item) => {
    const kind = item.kind || 'other';
    return {
      ...item,
      kind,
      tags: ensurePlaceKindTag(Array.isArray(item.tags) ? item.tags : [], kind),
      signals: Array.isArray(item.signals) ? item.signals : [],
      risks: Array.isArray(item.risks) ? item.risks : [],
    };
  });
}

export function normalizeCaptureState(value: unknown): OwnlyCaptureState {
  if (!value || typeof value !== 'object') return { ...EMPTY_CAPTURE_STATE };
  const state = value as Partial<OwnlyCaptureState>;
  const trips = normalizeTrips(state.trips);
  const activeTripId =
    typeof state.activeTripId === 'string' && trips.some((trip) => trip.id === state.activeTripId)
      ? state.activeTripId
      : null;
  return {
    version: 1,
    trips,
    activeTripId,
    pendingPlaces: normalizePlaces(state.pendingPlaces),
    knownPlaceIds: state.knownPlaceIds && !Array.isArray(state.knownPlaceIds) && typeof state.knownPlaceIds === 'object'
      ? state.knownPlaceIds as Record<string, string>
      : {},
  };
}

export async function readCaptureState(): Promise<OwnlyCaptureState> {
  const result = await chrome.storage.local.get(CAPTURE_STORAGE_KEY);
  return normalizeCaptureState(result[CAPTURE_STORAGE_KEY]);
}

let opChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = opChain.then(task, task);
  opChain = run.then(() => undefined, () => undefined);
  return run;
}

export function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  return enqueue(task);
}

export async function writeCaptureState(next: OwnlyCaptureState): Promise<void> {
  await enqueue(() => chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: next }));
}

/**
 * Side-panel save path: re-reads the freshest storage state inside the
 * single-writer queue and merges it with the panel's local state, so a
 * quick-capture written by the background worker in between is never lost.
 */
export async function mergeWriteCaptureState(
  local: OwnlyCaptureState,
  locallyDeletedIds?: ReadonlySet<string>,
): Promise<OwnlyCaptureState> {
  return enqueue(async () => {
    let fresh: OwnlyCaptureState;
    try {
      fresh = await readCaptureState();
    } catch {
      fresh = { ...EMPTY_CAPTURE_STATE };
    }
    const merged = mergeCaptureState(fresh, local, locallyDeletedIds);
    await chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: merged });
    return merged;
  });
}

export function saveCaptureStateViaWorker(
  next: OwnlyCaptureState,
  locallyDeletedIds?: ReadonlySet<string>,
): Promise<{ ok: boolean; state?: OwnlyCaptureState } | null> {
  return chrome.runtime
    .sendMessage({
      type: 'CAPTURE_SAVE_STATE',
      state: next,
      locallyDeletedIds: locallyDeletedIds ? [...locallyDeletedIds] : [],
    })
    .then((response) => response as { ok: boolean; state?: OwnlyCaptureState } | null)
    .catch(() => null);
}

export function ackPlacesViaWorker(placeIds: string[]): Promise<{ ok: boolean } | null> {
  return chrome.runtime
    .sendMessage({ type: 'CAPTURE_ACK_PLACES', placeIds })
    .then((response) => response as { ok: boolean } | null)
    .catch(() => null);
}

export function updateCaptureState<R>(
  mutate: (current: OwnlyCaptureState) => { state: OwnlyCaptureState; result: R },
): Promise<R> {
  return enqueue(async () => {
    const current = await readCaptureState();
    const { state, result } = mutate(current);
    await chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: state });
    return result;
  });
}
