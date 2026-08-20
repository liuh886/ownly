import { EMPTY_CAPTURE_STATE, type OwnlyCaptureState } from '../domain/planner';

const STORAGE_KEY = 'ownlyCaptureStateV1';
const REQUEST_SOURCE = 'ownly-planner-web';
const RESPONSE_SOURCE = 'ownly-capture-extension';

async function loadState(): Promise<OwnlyCaptureState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY];
  if (!value || typeof value !== 'object') return { ...EMPTY_CAPTURE_STATE };
  const state = value as Partial<OwnlyCaptureState>;
  return {
    version: 1,
    trips: Array.isArray(state.trips) ? state.trips : [],
    activeTripId: typeof state.activeTripId === 'string' ? state.activeTripId : null,
    pendingPlaces: Array.isArray(state.pendingPlaces) ? state.pendingPlaces : [],
  };
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data as { source?: string; requestId?: string; type?: string; payload?: unknown };
  if (!message || message.source !== REQUEST_SOURCE || !message.requestId || !message.type) return;

  void (async () => {
    try {
      if (message.type === 'PULL_CAPTURE_STATE') {
        const state = await loadState();
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'CAPTURE_STATE', payload: state }, window.location.origin);
        return;
      }

      if (message.type === 'ACK_CAPTURED_PLACES') {
        const payload = message.payload as { placeIds?: string[] } | undefined;
        const ids = new Set(Array.isArray(payload?.placeIds) ? payload.placeIds : []);
        const state = await loadState();
        await chrome.storage.local.set({
          [STORAGE_KEY]: {
            ...state,
            pendingPlaces: state.pendingPlaces.filter((place) => !ids.has(place.id)),
          },
        });
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'ACK_CAPTURED_PLACES_RESULT', payload: { ok: true } }, window.location.origin);
      }
    } catch (error) {
      window.postMessage({
        source: RESPONSE_SOURCE,
        requestId: message.requestId,
        type: 'ERROR',
        error: error instanceof Error ? error.message : 'Ownly Capture bridge failed',
      }, window.location.origin);
    }
  })();
});
