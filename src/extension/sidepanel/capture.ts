import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { normalizePlaceIdentity } from '../../domain/planner';
import { el } from '../dom';
import { store, t } from './store';
import { autoFillPlaceForm, renderCurrencyPill, renderCurrentPlace, renderSmartListCard, setStatus } from './ui';

const PRICE_RETRY_DELAYS = [1500, 3000, 5000];
let priceRetryCount = 0;
let lastPriceRetryUrl = '';

function needsPriceRetry(): boolean {
  const place = store.currentPlace;
  if (!place) return false;
  if (place.sourceUrl !== lastPriceRetryUrl) { priceRetryCount = 0; } else if (priceRetryCount >= PRICE_RETRY_DELAYS.length) { return false; }
  // Hotel/restaurant rate modules load lazily after the panel renders —
  // schedule one targeted re-read when the first pass missed the price.
  if (place.priceLevel) return false;
  const cat = (place.category || '').toLowerCase();
  const likelyPriced =
    !cat ||
    /hotel|hostel|ryokan|resort|guesthouse|restaurant|ramen|sushi|izakaya|cafe|coffee|tea house|bar\b|bistro|buffet|美食|酒店|旅馆|民宿|饭店|度假村|餐厅|咖啡|居酒屋|烤肉|拉面/.test(cat);
  return likelyPriced;
}

export async function readCurrentPlace(options?: { soft?: boolean }): Promise<void> {
  if (!options?.soft) {
    setStatus(t().readingStatus);
    el.placePanel.classList.add('is-loading');
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    store.currentPlace = null;
    store.detectedSavedList = null;
    store.detectedListPlaces = [];
    store.pageDetectedCurrency = undefined;
    if (!options?.soft) {
      el.placePanel.classList.remove('is-loading');
    }
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
  type ListMessageResponse = {
    listPlaces?: CurrentResearchPlace[];
  };

  let placeResp: PlaceMessageResponse | null = null;
  let listResp: ListMessageResponse | null = null;

  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
  const targetTags = (activeTrip?.tags || []).filter(Boolean);

  try {
    placeResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE', targetTags, targetCurrency: store.state.trips.find((trip) => trip.id === store.state.activeTripId)?.currency, overrideCurrency: store.mapCurrencyOverride })) as PlaceMessageResponse;
    listResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_VISIBLE_LIST_PLACES', overrideCurrency: store.mapCurrencyOverride })) as ListMessageResponse;
  } catch {
    // If message failed (e.g. content script was disconnected after extension reload), dynamically inject it
    try {
      const scripting = (chrome as unknown as { scripting?: { executeScript: (opts: unknown) => Promise<unknown> } }).scripting;
      if (scripting && tab.id) {
        await scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        await new Promise((r) => setTimeout(r, 150));
        placeResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE', targetTags, targetCurrency: store.state.trips.find((trip) => trip.id === store.state.activeTripId)?.currency, overrideCurrency: store.mapCurrencyOverride })) as PlaceMessageResponse;
        listResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_VISIBLE_LIST_PLACES', overrideCurrency: store.mapCurrencyOverride })) as ListMessageResponse;
      }
    } catch (err) {
      console.warn('Could not inject content script:', err);
    }
  }

  if (placeResp?.place && placeResp.place.sourceUrl !== store.userDismissedPlaceUrl) {
    store.currentPlace = placeResp.place;
    if (!store.currentPlace.detectedCurrency && placeResp.detectedCurrency) {
      store.currentPlace = { ...store.currentPlace, detectedCurrency: placeResp.detectedCurrency };
    }
  } else {
    store.currentPlace = null;
  }
  store.detectedSavedList = placeResp?.savedList ?? null;
  store.detectedAllLists = Array.isArray(placeResp?.allLists) ? placeResp.allLists : [];

  // If no single savedList was directly detected, but we have lists in detectedAllLists, try to fetch matching or first list
  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && store.detectedAllLists.length > 0 && tab.id) {
    const tripTags = (activeTrip?.tags || []).map((tag) => tag.trim().toLowerCase());
    const tripTitle = (activeTrip?.title || '').trim().toLowerCase();

    const targetList = store.detectedAllLists.find((l) => {
      const name = l.listName.toLowerCase();
      return tripTags.some((tag) => tag && (name === tag || name.includes(tag) || tag.includes(name)))
        || (tripTitle && (name.includes(tripTitle) || tripTitle.includes(name)));
    }) || (store.detectedAllLists.length === 1 ? store.detectedAllLists[0] : undefined);

    if (targetList?.listId) {
      try {
        const fetched = (await chrome.tabs.sendMessage(tab.id, {
          type: 'OWNLY_FETCH_LIST_BY_ID',
          listId: targetList.listId,
          overrideCurrency: store.mapCurrencyOverride,
        })) as { savedList?: DetectedSavedList | null };
        if (fetched?.savedList && fetched.savedList.places.length > 0) {
          store.detectedSavedList = fetched.savedList;
        }
      } catch {}
    }
  }

  const directListPlaces = Array.isArray(listResp?.listPlaces) ? listResp.listPlaces : [];
  store.detectedListPlaces = (store.detectedSavedList?.places && store.detectedSavedList.places.length > 0)
    ? store.detectedSavedList.places
    : directListPlaces;
  // Manual override always wins over page auto-detection; otherwise keep the detected value.
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

  // Auto-capture price for existing pool candidates when browsing their Maps page
  if (store.currentPlace && store.currentPlace.priceLevel && store.state.activeTripId) {
    const identity = normalizePlaceIdentity(store.currentPlace.sourceUrl);
    const match = store.state.pendingPlaces.find(
      (p) => p.trip_id === store.state.activeTripId
        && !p.observed_price
        && normalizePlaceIdentity(p.source_url) === identity,
    );
    if (match && store.currentPlace.priceLevel) {
      const price = store.currentPlace.priceLevel;
      const nowIso = new Date().toISOString();
      // Immutable update — the single-writer merge path persists it below.
      store.state = {
        ...store.state,
        pendingPlaces: store.state.pendingPlaces.map((p) =>
          p.id === match.id ? { ...p, observed_price: price, updated_at: nowIso } : p,
        ),
      };
      void import('../capture-state').then(({ saveCaptureStateViaWorker }) =>
        saveCaptureStateViaWorker(store.state, store.locallyDeletedIds).then((r) => {
          if (!r?.ok) void import('../capture-state').then(({ writeCaptureState }) => writeCaptureState(store.state));
        }),
      );
      setStatus(
        (store.lang === 'zh' ? '💰 已自动抓取价格: ' : '💰 Price captured: ') + (match.title ?? '') + ' → ' + price,
        'success',
      );
    }
  }

  if (store.currentPlace) {
    autoFillPlaceForm(store.currentPlace);
  }

  // Multi-round retry for lazily loaded price modules (hotels, restaurants).
  if (needsPriceRetry()) {
    const delay = PRICE_RETRY_DELAYS[Math.min(priceRetryCount, PRICE_RETRY_DELAYS.length - 1)];
    priceRetryCount += 1;
    lastPriceRetryUrl = store.currentPlace!.sourceUrl;
    const retryUrl = lastPriceRetryUrl;
    window.setTimeout(() => {
      if (store.currentPlace?.sourceUrl === retryUrl) {
        void readCurrentPlace({ soft: true });
      }
    }, delay);
  } else {
    priceRetryCount = 0;
  }
}
