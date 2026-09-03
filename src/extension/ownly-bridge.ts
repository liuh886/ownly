import { readCaptureStateV3 } from './capture-state';
import { logger } from './logger';

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

  logger.debug('Bridge', 'ownly-bridge received', { type: message.type, requestId: message.requestId?.slice(0, 8) });
  void (async () => {
    try {
      if (message.type === 'PULL_CAPTURE_STATE') {
        const state = await readCaptureStateV3();
        logger.info('Bridge', 'PULL_CAPTURE_STATE → respond', { places: state.places.length, collections: state.collections.length });
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'CAPTURE_STATE', payload: state }, getTargetOrigin());
        return;
      }
      if (message.type === 'APPLY_CAPTURE_IMPORT_REPORT') {
        const payload = message.payload as { report?: { created?: string[]; updated?: string[]; deduped?: string[] } } | undefined;
        if (payload?.report) {
          const importedIds = new Set([
            ...(payload.report.created || []),
            ...(payload.report.updated || []),
            ...(payload.report.deduped || []),
          ].filter(Boolean));
          if (importedIds.size > 0) {
            const { mutateCaptureStateV3InWorker } = await import('./capture-state');
            await mutateCaptureStateV3InWorker((current) => ({
              state: {
                ...current,
                places: current.places.filter((p) => !importedIds.has(p.id)),
              },
              result: undefined,
            }));
            logger.info('Bridge', 'APPLY_CAPTURE_IMPORT_REPORT → removed imported places', { count: importedIds.size });
          }
        }
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'APPLY_CAPTURE_IMPORT_REPORT_RESULT', payload: { ok: true } }, getTargetOrigin());
        return;
      }
      if (message.type === 'SET_CAPTURE_CONTEXT') {
        // V3: Convert context to planner_target
        const payload = message.payload as { context?: { tripId?: string; title?: string; currency?: string } | null } | undefined;
        logger.info('Bridge', 'SET_CAPTURE_CONTEXT', payload?.context);
        const { setPlannerTargetViaWorker } = await import('./capture-state');
        const target = payload?.context?.tripId && payload?.context?.title
          ? { trip_id: payload.context.tripId, title: payload.context.title }
          : null;
        await setPlannerTargetViaWorker(target);
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'SET_CAPTURE_CONTEXT_RESULT', payload: { ok: true } }, getTargetOrigin());
      }
    } catch (error) {
      logger.error('Bridge', 'ownly-bridge error', error instanceof Error ? error.stack || error.message : String(error));
      window.postMessage({
        source: RESPONSE_SOURCE,
        requestId: message.requestId,
        type: 'ERROR',
        error: error instanceof Error ? error.message : 'Ownly Capture bridge failed',
      }, getTargetOrigin());
    }
  })();
});
