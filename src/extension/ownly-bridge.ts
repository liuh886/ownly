import { acknowledgeCapturedPlaces } from '../domain/planner';
import { ackPlacesViaWorker, readCaptureState, updateCaptureState } from './capture-state';

const REQUEST_SOURCE = 'ownly-planner-web';
const RESPONSE_SOURCE = 'ownly-capture-extension';

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data as { source?: string; requestId?: string; type?: string; payload?: unknown };
  if (!message || message.source !== REQUEST_SOURCE || !message.requestId || !message.type) return;

  void (async () => {
    try {
      if (message.type === 'PULL_CAPTURE_STATE') {
        const state = await readCaptureState();
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'CAPTURE_STATE', payload: state }, window.location.origin);
        return;
      }

      if (message.type === 'ACK_CAPTURED_PLACES') {
        const payload = message.payload as { placeIds?: string[] } | undefined;
        const ids = Array.isArray(payload?.placeIds) ? payload.placeIds : [];
        const viaWorker = await ackPlacesViaWorker(ids);
        if (!viaWorker?.ok) {
          await updateCaptureState((current) => ({
            state: acknowledgeCapturedPlaces(current, ids),
            result: { ok: true },
          }));
        }
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
