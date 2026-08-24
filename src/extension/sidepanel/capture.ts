import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { el } from '../dom';
import { store, t } from './store';
import { autoFillPlaceForm, renderCurrencyPill, renderCurrentPlace, renderSmartListCard, setStatus } from './ui';

const PRICE_RETRY_DELAY_MS = 2000;
let lastPriceRetryKey = '';

function needsPriceRetry(): boolean {
  const place = store.currentPlace;
  if (!place) return false;
  if (place.sourceUrl === lastPriceRetryKey) return false;
  // Hotel/restaurant rate modules load lazily after the panel renders —
  // schedule one targeted re-read when the first pass missed the price.
  if (place.priceLevel) return false;
  const cat = (place.category || '').toLowerCase();
  const likelyPriced =
    !cat ||
    /hotel|hostel|ryokan|resort|guesthouse|restaurant|ramen|sushi|izakaya|cafe|coffee|tea house|bar\b|bistro|buffet|美食|酒店|旅馆|民宿|饭店|度假村|餐厅|咖啡|居酒屋|烤肉|拉面/.test(cat);
  return likelyPriced;
}

export async function readCurrentPlace(): Promise<void> {
  setStatus(t().readingStatus);
  el.placePanel.classList.add('is-loading');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    store.currentPlace = null;
    store.detectedSavedList = null;
    store.detectedListPlaces = [];
    store.pageDetectedCurrency = undefined;
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
  type ListMessageResponse = {
    listPlaces?: CurrentResearchPlace[];
  };

  let placeResp: PlaceMessageResponse | null = null;
  let listResp: ListMessageResponse | null = null;

  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
  const targetTags = (activeTrip?.tags || []).filter(Boolean);

  try {
    placeResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE', targetTags, targetCurrency: store.state.trips.find((trip) => trip.id === store.state.activeTripId)?.currency })) as PlaceMessageResponse;
    listResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_VISIBLE_LIST_PLACES' })) as ListMessageResponse;
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
        placeResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE', targetTags, targetCurrency: store.state.trips.find((trip) => trip.id === store.state.activeTripId)?.currency })) as PlaceMessageResponse;
        listResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_VISIBLE_LIST_PLACES' })) as ListMessageResponse;
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
  store.pageDetectedCurrency = store.currentPlace?.detectedCurrency || store.detectedSavedList?.detectedCurrency;

  const listKey = store.detectedSavedList
    ? `${store.detectedSavedList.listName}|${store.detectedSavedList.listUrl}`
    : '';
  if (listKey !== store.smartListKey) {
    store.smartListKey = listKey;
    store.smartListDismissed = false;
  }

  el.placePanel.classList.remove('is-loading');
  if (store.currentPlace && store.currentPlace.sourceProvider === 'google_maps') {
    try {
      const { enrichPlaceFromHtml } = await import('../content');
      store.currentPlace = await enrichPlaceFromHtml(store.currentPlace);
    } catch {}
  }
  renderCurrentPlace();
  renderSmartListCard();
  renderCurrencyPill();
  if (store.currentPlace) {
    autoFillPlaceForm(store.currentPlace);
  }

  // One-shot retry for lazily loaded price modules (hotels, restaurants).
  if (needsPriceRetry()) {
    lastPriceRetryKey = store.currentPlace!.sourceUrl;
    window.setTimeout(() => {
      if (store.currentPlace?.sourceUrl === lastPriceRetryKey) {
        void readCurrentPlace();
      }
    }, PRICE_RETRY_DELAY_MS);
  }
}
