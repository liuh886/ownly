import { readCaptureStateV3 } from './capture-state';

const REQUEST_SOURCE = 'ownly-planner-web';
const RESPONSE_SOURCE = 'ownly-capture-extension';

function getTargetOrigin(): string {
  if (typeof window === 'undefined') return '*';
  return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
}

window.addEventListener('message', (event) => {
  const isSameOrigin = !event.origin || event.origin === 'null' || event.origin === window.location.origin;
  if (event.source !== window || !isSameOrigin) return;
  const message = event.data as { source?: string; requestId?: string; type?: string; payload?: unknown };
  if (!message || message.source !== REQUEST_SOURCE || !message.requestId || !message.type) return;

  void (async () => {
    try {
      if (message.type === 'PULL_CAPTURE_STATE') {
        const state = await readCaptureStateV3();
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'CAPTURE_STATE', payload: state }, getTargetOrigin());
        return;
      }
      if (message.type === 'APPLY_CAPTURE_IMPORT_REPORT') {
        // V3: import report is now handled by the Planner, no need to update Capture state
        // The Capture state is updated when the user sends places to Planner
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'APPLY_CAPTURE_IMPORT_REPORT_RESULT', payload: { ok: true } }, getTargetOrigin());
        return;
      }
      if (message.type === 'SET_CAPTURE_CONTEXT') {
        // V3: Convert context to planner_target
        const payload = message.payload as { context?: { tripId?: string; title?: string; currency?: string } | null } | undefined;
        const { setPlannerTargetViaWorker } = await import('./capture-state');
        const target = payload?.context?.tripId && payload?.context?.title
          ? { trip_id: payload.context.tripId, title: payload.context.title }
          : null;
        await setPlannerTargetViaWorker(target);
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'SET_CAPTURE_CONTEXT_RESULT', payload: { ok: true } }, getTargetOrigin());
      }
    } catch (error) {
      window.postMessage({
        source: RESPONSE_SOURCE,
        requestId: message.requestId,
        type: 'ERROR',
        error: error instanceof Error ? error.message : 'Ownly Capture bridge failed',
      }, getTargetOrigin());
    }
  })();
});
