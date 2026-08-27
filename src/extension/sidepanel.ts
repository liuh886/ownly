import { CAPTURE_STORAGE_KEY, normalizeCaptureState } from './capture-state';
import { el } from './dom';
import { loadState, store } from './sidepanel/store';
import { readCurrentPlace } from './sidepanel/capture';
import { initHandlers } from './sidepanel/handlers';
import {
  applyI18n,
  populateEditTripForm,
  renderCandidatesList,
  renderCurrentPlace,
  renderSmartListCard,
  renderState,
} from './sidepanel/ui';

// Live-reload when the background service worker (quick capture / web ack)
// writes state externally.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[CAPTURE_STORAGE_KEY]) return;
  const incoming = normalizeCaptureState(changes[CAPTURE_STORAGE_KEY].newValue);
  if (JSON.stringify(incoming) === JSON.stringify(store.state)) return;
  store.state = incoming;
  populateEditTripForm();
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
    void readCurrentPlace();
    return;
  }
  if ((message as { type?: string }).type === 'OWNLY_FOCUS_CAPTURE') {
    el.captureForm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    window.setTimeout(() => {
      el.why.focus({ preventScroll: true });
      const end = el.why.value.length;
      el.why.setSelectionRange(end, end);
    }, 120);
  }
});

// Auto-refresh when tab updates or gains focus
window.addEventListener('focus', () => { void readCurrentPlace(); });

void (async () => {
  await loadState();
  applyI18n();
  initHandlers();
  await readCurrentPlace();
})();
