import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { findExistingTripPlace, normalizeObservedPrice } from '../../domain/planner';
import { el } from '../dom';
import { saveCaptureStateViaWorker } from '../capture-state';
import { matchesSavedListContext } from '../saved-list-match';
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
  return !category || /hotel|hostel|ryokan|resort|guesthouse|restaurant|ramen|sushi|izakaya|cafe|coffee|tea house|bar\b|bistro|buffet|美食|酒店|旅馆|民宿|饭店|度假村|餐厅|咖啡|居酒屋|烤肉|拉面/.test(category);
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
  type ListMessageResponse = { listPlaces?: CurrentResearchPlace[]; listName?: string; truncated?: boolean };

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
    const targetList = store.detectedAllLists.find((list) => matchesSavedListContext(list.listName, context))
      || (store.detectedAllLists.length === 1 ? store.detectedAllLists[0] : undefined);

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
  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && directListPlaces.length > 0 && listResp?.listName) {
    store.detectedSavedList = {
      listName: listResp.listName,
      listUrl: tab.url || '',
      detectedCurrency: placeResp?.detectedCurrency,
      places: directListPlaces,
      truncated: Boolean(listResp.truncated),
    };
  }
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
      const normalizedPrice = normalizeObservedPrice(price, store.currentPlace.detectedCurrency || store.pageDetectedCurrency);
      store.state = {
        ...store.state,
        pendingPlaces: store.state.pendingPlaces.map((place) =>
          place.id === match.id ? {
            ...place,
            observed_price: price,
            price_currency: normalizedPrice?.currency,
            price_min: normalizedPrice?.min,
            price_max: normalizedPrice?.max,
            price_unit: normalizedPrice?.unit,
            price_level: normalizedPrice?.level,
            updated_at: new Date().toISOString(),
          } : place,
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
