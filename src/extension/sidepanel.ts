import { CAPTURE_STORAGE_KEY, normalizeCaptureStateV3 } from './capture-state';
import { el } from './dom';
import { loadState, store } from './sidepanel/store';
import { readCurrentPlace } from './sidepanel/capture';
import { initHandlers } from './sidepanel/handlers';
import {
  applyI18n,
  initDebugLogFilters,
  renderCandidatesList,
  renderCurrentPlace,
  renderSmartListCard,
  renderState,
} from './sidepanel/ui';
import { logger } from './logger';

// Live-reload when the background service worker (quick capture / web ack)
// writes state externally.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[CAPTURE_STORAGE_KEY]) return;
  const incoming = normalizeCaptureStateV3(changes[CAPTURE_STORAGE_KEY].newValue);
  if (JSON.stringify(incoming) === JSON.stringify(store.stateV3)) return;
  logger.info('Sidepanel', 'Storage external change → re-render', { places: incoming.places.length, collections: incoming.collections.length });
  store.setState(incoming);
  renderState();
  renderCurrentPlace();
  renderSmartListCard();
  renderCandidatesList();
});

let lastTabRefresh = 0;
chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return;
  if ((message as { type?: string }).type === 'OWNLY_TAB_CHANGED') {
    const now = Date.now();
    if (now - lastTabRefresh < 350) return;
    lastTabRefresh = now;
    logger.debug('Sidepanel', 'OWNLY_TAB_CHANGED → readCurrentPlace', message);
    void readCurrentPlace();
    return;
  }
  if ((message as { type?: string }).type === 'OWNLY_FOCUS_CAPTURE') {
    logger.info('Sidepanel', 'OWNLY_FOCUS_CAPTURE → scroll to form');
    el.captureForm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    window.setTimeout(() => {
      el.why.focus({ preventScroll: true });
      const end = el.why.value.length;
      el.why.setSelectionRange(end, end);
    }, 120);
  }
});

// Auto-refresh when tab updates or gains focus
window.addEventListener('focus', () => {
  logger.debug('Sidepanel', 'window focus → readCurrentPlace');
  void readCurrentPlace();
});

void (async () => {
  logger.info('Sidepanel', 'Sidepanel boot', { ua: navigator.userAgent.slice(0, 80), url: location.href });
  await logger.hydrate();
  await loadState();
  logger.info('Sidepanel', 'loadState done', { lang: store.lang, places: store.getInboxPlaces().length, collections: store.stateV3.collections.length, debug: store.debugModeEnabled });
  applyI18n();
  initDebugLogFilters();
  initHandlers();
  await readCurrentPlace();
  logger.info('Sidepanel', 'initial readCurrentPlace done', { hasPlace: Boolean(store.currentPlace), hasList: Boolean(store.detectedSavedList) });
})();

// Global error hook is in logger.ts; add sidepanel-specific unhandled
window.addEventListener('error', (e) => logger.error('SidepanelGlobal', e.message, { stack: (e.error as Error)?.stack }));
window.addEventListener('unhandledrejection', (e) => logger.error('SidepanelGlobal', 'unhandledrejection', String(e.reason)));
