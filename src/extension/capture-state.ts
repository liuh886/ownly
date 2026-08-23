import { EMPTY_CAPTURE_STATE, type OwnlyCaptureState } from '../domain/planner';

export const CAPTURE_STORAGE_KEY = 'ownlyCaptureStateV1';

export function normalizeCaptureState(value: unknown): OwnlyCaptureState {
  if (!value || typeof value !== 'object') return { ...EMPTY_CAPTURE_STATE };
  const state = value as Partial<OwnlyCaptureState>;
  return {
    version: 1,
    trips: Array.isArray(state.trips) ? state.trips : [],
    activeTripId: typeof state.activeTripId === 'string' ? state.activeTripId : null,
    pendingPlaces: Array.isArray(state.pendingPlaces) ? state.pendingPlaces : [],
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

export function saveCaptureStateViaWorker(next: OwnlyCaptureState): Promise<{ ok: boolean } | null> {
  return chrome.runtime
    .sendMessage({ type: 'CAPTURE_SAVE_STATE', state: next })
    .then((response) => response as { ok: boolean } | null)
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
