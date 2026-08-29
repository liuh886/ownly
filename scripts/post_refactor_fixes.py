from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f'{path}: missing cleanup snippet: {old[:160]}')
    write(path, text.replace(old, new, 1))


# The original FX block wrapped local-storage listeners and the background query
# in one try/catch. The hard cut removes the storage listeners; keep the query
# itself inside a fresh try/catch.
replace_once(
    'src/extension/content.ts',
    "  function applyOverride(override?: string) {\n    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;\n  }\n\n    // 3. Query background for FX rates & target currency",
    "  function applyOverride(override?: string) {\n    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;\n  }\n\n  try {\n    // Query background for FX rates & target currency",
)

# Chrome's runtime supports storage.session, but the repo's installed Chrome
# typings predate it. Keep the runtime contract isolated in one tiny adapter.
write('src/extension/session-storage.ts', '''export interface SessionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export const sessionStorage = (chrome.storage as unknown as { session: SessionStorageArea }).session;
''')

background = read('src/extension/background.ts')
background = background.replace("import type { CurrentResearchPlace } from './content';\n", "import type { CurrentResearchPlace } from './content';\nimport { sessionStorage } from './session-storage';\n", 1)
background = background.replace('chrome.storage.session.', 'sessionStorage.')
write('src/extension/background.ts', background)

store = read('src/extension/sidepanel/store.ts')
store = store.replace("import { I18N, type Lang } from '../i18n';\n", "import { I18N, type Lang } from '../i18n';\nimport { sessionStorage } from '../session-storage';\n", 1)
store = store.replace('chrome.storage.session.', 'sessionStorage.')
write('src/extension/sidepanel/store.ts', store)

# Worker messages return a success payload after failures have already thrown;
# model that fact explicitly so callers do not carry a false error branch.
capture_state = read('src/extension/capture-state.ts')
capture_state = capture_state.replace(
    "type WorkerResult<T> = { ok: true; state?: OwnlyCaptureState; result?: T } | { ok: false; error?: string };\n\nasync function sendWorker<T>(message: Record<string, unknown>): Promise<WorkerResult<T>> {\n  const response = await chrome.runtime.sendMessage(message) as WorkerResult<T> | undefined;\n  if (!response?.ok) throw new Error(response?.error || 'Ownly Capture background worker did not persist state');\n  return response;\n}",
    "type WorkerSuccess<T> = { ok: true; state?: OwnlyCaptureState; result?: T };\ntype WorkerResult<T> = WorkerSuccess<T> | { ok: false; error?: string };\n\nasync function sendWorker<T>(message: Record<string, unknown>): Promise<WorkerSuccess<T>> {\n  const response = await chrome.runtime.sendMessage(message) as WorkerResult<T> | undefined;\n  if (!response || response.ok !== true) throw new Error(response?.error || 'Ownly Capture background worker did not persist state');\n  return response;\n}",
    1,
)
write('src/extension/capture-state.ts', capture_state)

# Capture page reader: no Trip mirror, no origin-persistent FX state, no direct
# storage fallback. It only enriches the current V2 inbox candidate.
write('src/extension/sidepanel/capture.ts', '''import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { findExistingTripPlace } from '../../domain/planner';
import { el } from '../dom';
import { saveCaptureStateViaWorker } from '../capture-state';
import { store, t } from './store';
import { autoFillPlaceForm, renderCurrencyPill, renderCurrentPlace, renderSmartListCard, setStatus } from './ui';

const PRICE_RETRY_DELAYS = [1500, 3000, 5000];
let priceRetryCount = 0;
let lastPriceRetryUrl = '';

function needsPriceRetry(): boolean {
  const place = store.currentPlace;
  if (!place) return false;
  if (place.sourceUrl !== lastPriceRetryUrl) priceRetryCount = 0;
  else if (priceRetryCount >= PRICE_RETRY_DELAYS.length) return false;
  if (place.priceLevel) return false;
  const category = (place.category || '').toLowerCase();
  return !category || /hotel|hostel|ryokan|resort|guesthouse|restaurant|ramen|sushi|izakaya|cafe|coffee|tea house|bar\\b|bistro|buffet|美食|酒店|旅馆|民宿|饭店|度假村|餐厅|咖啡|居酒屋|烤肉|拉面/.test(category);
}

function clearPageState(): void {
  store.currentPlace = null;
  store.detectedSavedList = null;
  store.detectedListPlaces = [];
  store.detectedAllLists = [];
  store.pageDetectedCurrency = store.mapCurrencyOverride;
}

export async function readCurrentPlace(options?: { soft?: boolean }): Promise<void> {
  if (!options?.soft) {
    setStatus(t().readingStatus);
    el.placePanel.classList.add('is-loading');
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    clearPageState();
    el.placePanel.classList.remove('is-loading');
    renderCurrentPlace();
    renderSmartListCard();
    renderCurrencyPill();
    return;
  }

  type PlaceMessageResponse = {
    place?: CurrentResearchPlace | null;
    savedList?: DetectedSavedList | null;
    allLists?: Array<{ listId?: string; listName: string; count?: number; url?: string }>;
    detectedCurrency?: string;
  };
  type ListMessageResponse = { listPlaces?: CurrentResearchPlace[] };

  const context = store.state.activeContext;
  const targetTags = (context?.tags ?? []).filter(Boolean);
  let placeResp: PlaceMessageResponse | null = null;
  let listResp: ListMessageResponse | null = null;

  try {
    [placeResp, listResp] = await Promise.all([
      chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_GET_CURRENT_PLACE',
        targetTags,
        targetCurrency: context?.currency,
        overrideCurrency: store.mapCurrencyOverride,
      }) as Promise<PlaceMessageResponse>,
      chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_GET_VISIBLE_LIST_PLACES',
        overrideCurrency: store.mapCurrencyOverride,
      }) as Promise<ListMessageResponse>,
    ]);
  } catch (error) {
    clearPageState();
    if (!options?.soft) {
      setStatus(store.lang === 'zh' ? '当前页面不支持 Capture。' : 'Capture is not available on this page.', 'error');
    }
    console.warn('[Ownly Capture] Could not read current provider page', error);
  }

  if (placeResp?.place && placeResp.place.sourceUrl !== store.userDismissedPlaceUrl) {
    store.currentPlace = placeResp.place.detectedCurrency || !placeResp.detectedCurrency
      ? placeResp.place
      : { ...placeResp.place, detectedCurrency: placeResp.detectedCurrency };
  } else {
    store.currentPlace = null;
  }
  store.detectedSavedList = placeResp?.savedList ?? null;
  store.detectedAllLists = Array.isArray(placeResp?.allLists) ? placeResp.allLists : [];

  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && store.detectedAllLists.length > 0) {
    const contextTags = (context?.tags ?? []).map((tag) => tag.trim().toLowerCase());
    const contextTitle = (context?.title ?? '').trim().toLowerCase();
    const targetList = store.detectedAllLists.find((list) => {
      const name = list.listName.toLowerCase();
      return contextTags.some((tag) => tag && (name === tag || name.includes(tag) || tag.includes(name)))
        || Boolean(contextTitle && (name.includes(contextTitle) || contextTitle.includes(name)));
    }) || (store.detectedAllLists.length === 1 ? store.detectedAllLists[0] : undefined);

    if (targetList?.listId) {
      try {
        const fetched = await chrome.tabs.sendMessage(tab.id, {
          type: 'OWNLY_FETCH_LIST_BY_ID',
          listId: targetList.listId,
          overrideCurrency: store.mapCurrencyOverride,
        }) as { savedList?: DetectedSavedList | null };
        if (fetched.savedList?.places.length) store.detectedSavedList = fetched.savedList;
      } catch {}
    }
  }

  const directListPlaces = Array.isArray(listResp?.listPlaces) ? listResp.listPlaces : [];
  store.detectedListPlaces = store.detectedSavedList?.places.length
    ? store.detectedSavedList.places
    : directListPlaces;
  store.pageDetectedCurrency = store.mapCurrencyOverride
    || store.currentPlace?.detectedCurrency
    || store.detectedSavedList?.detectedCurrency;

  const listKey = store.detectedSavedList
    ? `${store.detectedSavedList.listName}|${store.detectedSavedList.listUrl}`
    : '';
  if (listKey !== store.smartListKey) {
    store.smartListKey = listKey;
    store.smartListDismissed = false;
  }

  el.placePanel.classList.remove('is-loading');
  renderCurrentPlace();
  renderSmartListCard();
  renderCurrencyPill();

  if (context && store.currentPlace?.priceLevel) {
    const match = findExistingTripPlace(
      store.state.pendingPlaces,
      context.tripId,
      store.currentPlace.sourceUrl,
      store.currentPlace.sourcePlaceId,
      store.currentPlace.coordinates,
    );
    if (match && !match.observed_price) {
      const price = store.currentPlace.priceLevel;
      store.state = {
        ...store.state,
        pendingPlaces: store.state.pendingPlaces.map((place) =>
          place.id === match.id ? { ...place, observed_price: price, updated_at: new Date().toISOString() } : place,
        ),
      };
      try {
        const saved = await saveCaptureStateViaWorker(store.state, store.locallyDeletedIds);
        store.state = saved.state;
        setStatus(`${store.lang === 'zh' ? '💰 已自动抓取价格：' : '💰 Price captured: '}${match.title} → ${price}`, 'success');
      } catch (error) {
        setStatus(store.lang === 'zh' ? '价格已读取，但 Inbox 保存失败。' : 'Price was read, but the Inbox write failed.', 'error');
        console.warn('[Ownly Capture] Failed to persist auto-captured price', error);
      }
    }
  }

  if (store.currentPlace) autoFillPlaceForm(store.currentPlace);

  if (needsPriceRetry()) {
    const delay = PRICE_RETRY_DELAYS[Math.min(priceRetryCount, PRICE_RETRY_DELAYS.length - 1)];
    priceRetryCount += 1;
    lastPriceRetryUrl = store.currentPlace!.sourceUrl;
    const retryUrl = lastPriceRetryUrl;
    window.setTimeout(() => {
      if (store.currentPlace?.sourceUrl === retryUrl) void readCurrentPlace({ soft: true });
    }, delay);
  } else {
    priceRetryCount = 0;
  }
}
''')

# Remove the final old Trip-editor refresh hook left behind by the large handler
# contraction. Scheduling/Trip CRUD has no representation in Capture V2.
handlers = read('src/extension/sidepanel/handlers.ts').replace('    populateEditTripForm();\n', '')
write('src/extension/sidepanel/handlers.ts', handlers)

# Identity semantics: exact source ids > coordinates > canonical Google name.
# A location-bearing place URL must not collapse into a name-only search URL.
domain = read('src/domain/planner.ts')
domain = domain.replace("      if (query) return `g:q:${canonicalizePlaceName(query)}`;\n      if (placeName) return `g:place:${canonicalizePlaceName(placeName)}`;", "      if (query) return `g:name:${canonicalizePlaceName(query)}`;\n      if (placeName) return `g:name:${canonicalizePlaceName(placeName)}`;", 1)
write('src/domain/planner.ts', domain)

test = read('src/domain/planner.test.ts')
test = test.replace('expect(normalizePlaceIdentity(searchForm)).toBe(normalizePlaceIdentity(placeForm));', 'expect(normalizePlaceIdentity(searchForm)).not.toBe(normalizePlaceIdentity(placeForm));', 1)
test = test.replace("findExistingTripPlace({}, places, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=Sensoji%20')", "findExistingTripPlace(places, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=Sensoji%20')", 1)
test = test.replace("findExistingTripPlace({}, places, 'trip-1', 'https://maps.google.com/other-path', 'pid-1')", "findExistingTripPlace(places, 'trip-1', 'https://maps.google.com/other-path', 'pid-1')", 1)
test = test.replace("findExistingTripPlace({}, poisoned, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=a', 'same')", "findExistingTripPlace(poisoned, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=a', 'same')", 1)
test = test.replace("      version: 1 as const,\n      trips: [],\n      activeTripId: null,\n      pendingPlaces: [place('keep'), place('drop')],\n      knownPlaceIds: {},", "      version: 2 as const,\n      activeContext: { tripId: 'trip-1', title: 'Tokyo' },\n      pendingPlaces: [place('keep'), place('drop')],", 1)
write('src/domain/planner.test.ts', test)

print('post-refactor cleanup applied')
