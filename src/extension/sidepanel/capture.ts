import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { inferSourceProvider, normalizeObservedPrice } from '../../domain/planner';
import { el } from '../dom';
import { matchesSavedListContext } from '../saved-list-match';
import { logger } from '../logger';
import { store, t, saveState, getActiveCollection, getActivePlaces } from './store';
import { autoFillPlaceForm, renderCurrencyPill, renderCurrentPlace, renderSmartListCard, setStatus } from './ui';

const PRICE_RETRY_DELAYS = [1500, 3000, 5000];
let priceRetryCount = 0;
let lastPriceRetryUrl = '';
let priceRetryTimer: number | undefined;

export function cancelPriceRetry(): void {
  if (priceRetryTimer !== undefined) {
    window.clearTimeout(priceRetryTimer);
    priceRetryTimer = undefined;
  }
}

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
  cancelPriceRetry();
  store.currentPlace = null;
  store.detectedSavedList = null;
  store.detectedListPlaces = [];
  store.detectedAllLists = [];
  store.pageDetectedCurrency = store.mapCurrencyOverride;
}

export async function readCurrentPlace(options?: { soft?: boolean }): Promise<void> {
  const started = Date.now();
  const soft = Boolean(options?.soft);
  if (!soft) {
    setStatus(t().readingStatus);
    el.placePanel.classList.add('is-loading');
  }
  logger.debug('Capture', 'readCurrentPlace start', { soft });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    logger.warn('Capture', 'readCurrentPlace: no active tab');
    clearPageState();
    el.placePanel.classList.remove('is-loading');
    renderCurrentPlace();
    renderSmartListCard();
    renderCurrencyPill();
    return;
  }

  const provider = tab.url ? inferSourceProvider(tab.url) : 'other';
  if (provider === 'other') {
    logger.debug('Capture', 'readCurrentPlace: tab is not a supported provider', { url: tab.url?.slice(0, 80) });
    clearPageState();
    el.placePanel.classList.remove('is-loading');
    renderCurrentPlace();
    renderSmartListCard();
    renderCurrencyPill();
    return;
  }

  logger.debug('Capture', 'readCurrentPlace tab', { tabId: tab.id, provider, url: tab.url?.slice(0, 80) });

  type PlaceMessageResponse = {
    place?: CurrentResearchPlace | null;
    savedList?: DetectedSavedList | null;
    allLists?: Array<{ listId?: string; listName: string; count?: number; url?: string }>;
    detectedCurrency?: string;
  };
  type ListMessageResponse = { listPlaces?: CurrentResearchPlace[]; listName?: string; truncated?: boolean };

  const collection = getActiveCollection();
  const targetTags: string[] = [];
  let placeResp: PlaceMessageResponse | null = null;
  let listResp: ListMessageResponse | null = null;

  let readError: string | null = null;
  try {
    [placeResp, listResp] = await Promise.all([
      chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_GET_CURRENT_PLACE',
        targetTags,
        targetCurrency: collection?.currency,
        overrideCurrency: store.mapCurrencyOverride,
      }) as Promise<PlaceMessageResponse>,
      chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_GET_VISIBLE_LIST_PLACES',
        overrideCurrency: store.mapCurrencyOverride,
      }) as Promise<ListMessageResponse>,
    ]);
    logger.info('Capture', 'readCurrentPlace: content responses', {
      hasPlace: Boolean(placeResp?.place),
      hasSavedList: Boolean(placeResp?.savedList),
      allLists: placeResp?.allLists?.length ?? 0,
      listPlaces: listResp?.listPlaces?.length ?? 0,
      ms: Date.now() - started,
    });
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e);
    logger.warn('Capture', 'readCurrentPlace: primary sendMessage failed, retrying injection', readError);
    try {
      const scriptingApi = (chrome as unknown as { scripting?: { executeScript: (options: unknown) => Promise<unknown> } }).scripting;
      if (scriptingApi && tab.id) {
        await scriptingApi.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        await new Promise((r) => setTimeout(r, 150));
        [placeResp, listResp] = await Promise.all([
          chrome.tabs.sendMessage(tab.id, {
            type: 'OWNLY_GET_CURRENT_PLACE',
            targetTags,
            targetCurrency: collection?.currency,
            overrideCurrency: store.mapCurrencyOverride,
          }) as Promise<PlaceMessageResponse>,
          chrome.tabs.sendMessage(tab.id, {
            type: 'OWNLY_GET_VISIBLE_LIST_PLACES',
            overrideCurrency: store.mapCurrencyOverride,
          }) as Promise<ListMessageResponse>,
        ]);
        logger.info('Capture', 'readCurrentPlace: retry injection succeeded', { hasPlace: Boolean(placeResp?.place), ms: Date.now() - started });
      }
    } catch (innerErr) {
      clearPageState();
      if (!options?.soft) {
        setStatus(store.lang === 'zh' ? '当前页面不支持 Capture 或未完全加载。' : 'Capture is not available or page is not loaded.', 'error');
      }
      const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      logger.debug('Capture', 'Could not read current provider page after content-script retry', { error: msg, tabId: tab.id, url: tab.url?.slice(0, 80) });
    }
  }

  if (placeResp?.place && placeResp.place.sourceUrl !== store.userDismissedPlaceUrl) {
    const effectiveCurrency = store.mapCurrencyOverride || placeResp.place.detectedCurrency || placeResp.detectedCurrency;
    store.currentPlace = {
      ...placeResp.place,
      detectedCurrency: effectiveCurrency,
    };
  } else {
    store.currentPlace = null;
  }
  store.detectedSavedList = placeResp?.savedList ?? null;
  store.detectedAllLists = Array.isArray(placeResp?.allLists) ? placeResp.allLists : [];

  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && store.detectedAllLists.length > 0) {
    const targetList = store.detectedAllLists.find((list) => matchesSavedListContext(list.listName, collection))
      || (store.detectedAllLists.length === 1 ? store.detectedAllLists[0] : undefined);

    if (targetList?.listId) {
      try {
        const fetched = await chrome.tabs.sendMessage(tab.id, {
          type: 'OWNLY_FETCH_LIST_BY_ID',
          listId: targetList.listId,
          overrideCurrency: store.mapCurrencyOverride,
        }) as { savedList?: DetectedSavedList | null };
        if (fetched.savedList?.places.length) store.detectedSavedList = fetched.savedList;
      } catch (error) {
        logger.warn('capture', `Saved-list fetch failed for ${targetList.listName}`, String(error));
      }
    }
  }

  const directListPlaces = Array.isArray(listResp?.listPlaces) ? listResp.listPlaces : [];
  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && directListPlaces.length > 0 && listResp?.listName) {
    store.detectedSavedList = {
      listName: listResp.listName,
      listUrl: tab.url || '',
      detectedCurrency: store.mapCurrencyOverride || placeResp?.detectedCurrency,
      places: directListPlaces,
      truncated: Boolean(listResp.truncated),
    };
  } else if (
    store.detectedSavedList &&
    listResp?.listPlaces &&
    listResp.listName &&
    store.detectedSavedList.listName === listResp.listName &&
    listResp.listPlaces.length > store.detectedSavedList.places.length
  ) {
    // 同名列表且 DOM 更长时优先 DOM（不动 EntityList/Identity/enrichment，仅侧面板择优）
    logger.info('Capture', 'DOM list longer than EntityList, preferring DOM', {
      listName: listResp.listName,
      entityCount: store.detectedSavedList.places.length,
      domCount: listResp.listPlaces.length,
    });
    store.detectedSavedList = {
      listName: listResp.listName,
      listUrl: tab.url || '',
      detectedCurrency: store.mapCurrencyOverride || placeResp?.detectedCurrency || store.detectedSavedList.detectedCurrency,
      places: listResp.listPlaces,
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
  // PR-A 回退：有当前地点或列表时自动展开 添加收藏 面板，确保预览可见
  const addPanel = document.getElementById('addPanel') as HTMLDetailsElement | null;
  if (addPanel && (store.currentPlace || (store.detectedSavedList?.places.length ?? 0) > 0)) addPanel.open = true;

  logger.debug('Capture', 'readCurrentPlace: render done', {
    hasPlace: Boolean(store.currentPlace),
    placeTitle: store.currentPlace?.title?.slice(0, 30),
    savedList: store.detectedSavedList?.listName,
    savedCount: store.detectedSavedList?.places.length ?? 0,
    currency: store.pageDetectedCurrency,
    ms: Date.now() - started,
    error: readError,
  });

  // Auto-capture price from page if place exists in collection
  const activePlace = store.currentPlace;
  if (activePlace?.priceLevel) {
    const places = getActivePlaces();
    const match = places.find(
      (p) => p.source.url === activePlace.sourceUrl ||
        (activePlace.sourcePlaceId && p.source.place_id === activePlace.sourcePlaceId),
    );
    if (match && !match.price?.raw) {
      const price = activePlace.priceLevel;
      logger.info('Capture', 'Auto-capturing price for existing place', { title: match.title, price, currency: activePlace.detectedCurrency });
      const normalizedPrice = normalizeObservedPrice(price, activePlace.detectedCurrency || store.pageDetectedCurrency);
      store.updatePlace(match.id, (p) => ({
        ...p,
        price: {
          raw: price,
          currency: normalizedPrice?.currency,
          min: normalizedPrice?.min,
          max: normalizedPrice?.max,
          unit: normalizedPrice?.unit,
          level: normalizedPrice?.level,
        },
        updated_at: new Date().toISOString(),
      }));
      try {
        await saveState();
        setStatus(`${store.lang === 'zh' ? '💰 已自动抓取价格：' : '💰 Price captured: '}${match.title} → ${price}`, 'success');
        logger.info('Capture', 'Auto price persisted', { title: match.title, price });
      } catch (error) {
        setStatus(store.lang === 'zh' ? '价格已读取，但保存失败。' : 'Price was read, but save failed.', 'error');
        logger.error('Capture', 'Failed to persist auto-captured price', { error: error instanceof Error ? error.message : String(error), title: match.title });
      }
    }
  }

  if (store.currentPlace) {
    logger.debug('Capture', 'autoFillPlaceForm', { title: store.currentPlace.title });
    autoFillPlaceForm(store.currentPlace);
  }

  cancelPriceRetry();
  if (needsPriceRetry() && store.currentPlace) {
    const delay = PRICE_RETRY_DELAYS[Math.min(priceRetryCount, PRICE_RETRY_DELAYS.length - 1)];
    priceRetryCount += 1;
    lastPriceRetryUrl = store.currentPlace.sourceUrl;
    const retryUrl = lastPriceRetryUrl;
    logger.info('Capture', 'Scheduling price retry', { delay, retryCount: priceRetryCount, url: retryUrl.slice(0, 60) });
    priceRetryTimer = window.setTimeout(() => {
      priceRetryTimer = undefined;
      if (store.currentPlace?.sourceUrl === retryUrl) void readCurrentPlace({ soft: true });
    }, delay);
  } else {
    if (priceRetryCount > 0) logger.debug('Capture', 'Price retry finished', { finalPrice: store.currentPlace?.priceLevel });
    priceRetryCount = 0;
  }
}
