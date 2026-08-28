import {
  acknowledgeCapturedPlaces,
  DEFAULT_USD_PIVOT,
  ensurePlaceKindTag,
  findExistingTripPlace,
  inferPlaceKind,
  mergeCaptureState,
  placeIdentityKey,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../domain/planner';
import { CAPTURE_STORAGE_KEY, updateCaptureState } from './capture-state';
import type { CurrentResearchPlace } from './content';

async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('[Ownly Capture] Could not configure side panel', error);
  }
}

async function flashBadge(tabId: number, text: string, color: string) {
  if (!tabId) return;
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    setTimeout(() => {
      void chrome.action.setBadgeText({ tabId, text: '' });
    }, 2000);
  } catch {}
}

async function quickCaptureCurrentPlace() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const tabId = tab.id;

  try {
    const preState = await chrome.storage.local.get(CAPTURE_STORAGE_KEY);
    const preActive = (preState[CAPTURE_STORAGE_KEY] as OwnlyCaptureState | undefined)?.activeTripId;
    const preTrip = (preState[CAPTURE_STORAGE_KEY] as OwnlyCaptureState | undefined)?.trips?.find((t) => t.id === preActive);

    const response = await chrome.tabs.sendMessage(tabId, { type: 'OWNLY_GET_CURRENT_PLACE', targetCurrency: preTrip?.currency }) as { place?: CurrentResearchPlace | null };
    const place = response?.place;
    if (!place?.title || !place.sourceUrl) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }

    const capturedId = await updateCaptureState((state) => {
      if (!state.activeTripId) return { state, result: null };
      const tripId = state.activeTripId;
      const existing = findExistingTripPlace(state.knownPlaceIds, state.pendingPlaces, tripId, place.sourceUrl, place.sourcePlaceId);
      const idKey = placeIdentityKey(tripId, place.sourceUrl);
      // Reuse the acked place's identity so re-capture updates instead of duplicating.
      const stableId = existing?.id ?? state.knownPlaceIds[idKey] ?? crypto.randomUUID();
      const now = new Date().toISOString();
      const activeTrip = state.trips.find((trip) => trip.id === tripId);

      const freshKind = inferPlaceKind([place.title, place.category, place.address, ...(place.types || [])].filter(Boolean).join(' '));
      const isGeneric = existing?.kind === 'attraction' || existing?.kind === 'other';
      const hasSpecific = freshKind !== 'attraction' && freshKind !== 'other';
      const effectiveKind = (existing && !isGeneric) ? existing.kind : (hasSpecific ? freshKind : (existing?.kind ?? freshKind));

      const tripPlace: PlannerTripPlace = {
        schema_version: '0.1',
        type: 'trip_place',
        id: stableId,
        trip_id: tripId,
        title: place.title,
        source_provider: place.sourceProvider || 'google_maps',
        source_url: place.sourceUrl,
        kind: effectiveKind,
        area: place.address?.split(/[,，·]/)[0]?.trim() || undefined,
        priority: existing?.priority ?? 'want',
        tags: ensurePlaceKindTag(
          Array.from(new Set([...(activeTrip?.tags ?? []), ...(existing?.tags ?? [])])),
          effectiveKind,
        ),
        why: existing?.why ?? place.summary,
        signals: existing?.signals ?? [],
        risks: existing?.risks ?? [],
        notes: existing?.notes,
        observed_rating: place.rating ?? existing?.observed_rating,
        observed_price: place.priceLevel ?? existing?.observed_price,
        observed_at: now.slice(0, 10),
        coordinates: place.coordinates ?? existing?.coordinates,
        source_place_id: place.sourcePlaceId ?? existing?.source_place_id,
        reservation_status: existing?.reservation_status ?? 'none',
        state: existing?.state ?? 'candidate',
        scheduled_date: existing?.scheduled_date,
        sort_order: existing?.sort_order,
        locked: existing?.locked,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };

      return {
        state: {
          ...state,
          knownPlaceIds: { ...state.knownPlaceIds, [idKey]: stableId },
          pendingPlaces: [...state.pendingPlaces.filter((item) => item.id !== stableId), tripPlace],
        },
        result: stableId,
      };
    });

    if (capturedId) {
      void flashBadge(tabId, '✓', '#047857');
      try {
        await chrome.sidePanel.open({ tabId });
        await chrome.runtime.sendMessage({ type: 'OWNLY_FOCUS_CAPTURE' }).catch(() => {});
      } catch {}
    } else {
      void flashBadge(tabId, '!', '#b91c1c');
    }
  } catch (error) {
    console.warn('[Ownly Capture] Quick capture error', error);
    void flashBadge(tabId, '!', '#b91c1c');
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-capture-place') {
    void quickCaptureCurrentPlace();
  }
});

const TRACKED_TAB_URL = /^https:\/\/(www\.google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|[^/]*tabelog\.com|[^/]*xiaohongshu\.com|[^/]*booking\.com)/i;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.status) return;
  const url = changeInfo.url || tab.url || '';
  if (!TRACKED_TAB_URL.test(url)) return;
  void chrome.runtime.sendMessage({ type: 'OWNLY_TAB_CHANGED', tabId, url }).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => {
    if (tab.url && TRACKED_TAB_URL.test(tab.url)) {
      void chrome.runtime.sendMessage({ type: 'OWNLY_TAB_CHANGED', tabId, url: tab.url }).catch(() => {});
    }
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const type = (message as { type?: string }).type;

  if (type === 'OWNLY_SELECTOR_DRIFT') {
    void (async () => {
      try {
        await chrome.action.setBadgeText({ text: '!' });
        await chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' });
      } catch {}
    })();
    sendResponse({ ok: true });
    return;
  }

  if (type === 'CAPTURE_SAVE_STATE') {
    const incoming = (message as { state?: OwnlyCaptureState }).state;
    if (!incoming || typeof incoming !== 'object') {
      sendResponse({ ok: false, error: 'invalid state' });
      return true;
    }
    const rawDeleted = (message as { locallyDeletedIds?: unknown }).locallyDeletedIds;
    const deletedIds = Array.isArray(rawDeleted)
      ? new Set(rawDeleted.filter((id): id is string => typeof id === 'string'))
      : undefined;
    // Merge inside the single-writer queue: trips/activeTripId come from the
    // panel, background-added quick captures survive, deleted ids never return.
    void updateCaptureState((current) => {
      const merged = mergeCaptureState(current, incoming, deletedIds);
      return { state: merged, result: { ok: true, state: merged } };
    })
      .then((result) => sendResponse(result))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_ACK_PLACES') {
    const placeIds = (message as { placeIds?: unknown }).placeIds;
    const ids = Array.isArray(placeIds) ? placeIds.filter((id): id is string => typeof id === 'string') : [];
    void updateCaptureState((current) => ({
      state: acknowledgeCapturedPlaces(current, ids),
      result: { ok: true },
    }))
      .then((result) => sendResponse(result))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'OWNLY_GET_FX_CONFIG') {
    void (async () => {
      try {
        const rates = await getCachedFxRates();
        const stored = await chrome.storage.local.get([CAPTURE_STORAGE_KEY, FX_TOOLTIP_ENABLED_KEY]);
        const state = stored[CAPTURE_STORAGE_KEY] as OwnlyCaptureState | undefined;
        const activeTrip = state?.trips?.find((t) => t.id === state.activeTripId);
        const targetCurrency = activeTrip?.currency || 'CNY';
        const enabled = stored[FX_TOOLTIP_ENABLED_KEY] !== false;
        sendResponse({ ok: true, targetCurrency, rates, enabled });
      } catch {
        sendResponse({ ok: false, targetCurrency: 'CNY', rates: DEFAULT_USD_PIVOT, enabled: true });
      }
    })();
    return true;
  }

  if (type === 'OWNLY_SET_FX_TOOLTIP_ENABLED') {
    const enabled = (message as { enabled?: boolean }).enabled !== false;
    void (async () => {
      await chrome.storage.local.set({ [FX_TOOLTIP_ENABLED_KEY]: enabled });
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          void chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_FX_TOOLTIP_STATUS_CHANGED', enabled }).catch(() => {});
        }
      }
    })();
    sendResponse({ ok: true });
    return true;
  }
});

const FX_RATES_CACHE_KEY = 'ownly_fx_rates';
const FX_RATES_TIME_KEY = 'ownly_fx_rates_updated_at';
const FX_TOOLTIP_ENABLED_KEY = 'ownly_fx_tooltip_enabled';
const FX_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCachedFxRates(): Promise<Record<string, number>> {
  try {
    const data = await chrome.storage.local.get([FX_RATES_CACHE_KEY, FX_RATES_TIME_KEY]);
    const cachedRates = data[FX_RATES_CACHE_KEY] as Record<string, number> | undefined;
    const lastUpdated = (data[FX_RATES_TIME_KEY] as number) || 0;
    const now = Date.now();

    if (cachedRates && now - lastUpdated < FX_CACHE_MAX_AGE_MS) {
      return cachedRates;
    }

    void refreshFxRates();
    return cachedRates || DEFAULT_USD_PIVOT;
  } catch {
    return DEFAULT_USD_PIVOT;
  }
}

async function refreshFxRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return DEFAULT_USD_PIVOT;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data?.result === 'success' && data?.rates && typeof data.rates === 'object') {
      const pivotMap: Record<string, number> = { USD: 1 };
      for (const [code, rate] of Object.entries(data.rates)) {
        if (typeof rate === 'number' && rate > 0) {
          pivotMap[code.toUpperCase()] = Math.round((1 / rate) * 100000) / 100000;
        }
      }
      await chrome.storage.local.set({
        [FX_RATES_CACHE_KEY]: pivotMap,
        [FX_RATES_TIME_KEY]: Date.now(),
      });
      return pivotMap;
    }
  } catch (e) {
    console.warn('[Ownly Capture] Failed to fetch live FX rates, using pivot fallback:', e);
  }
  return DEFAULT_USD_PIVOT;
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
  void refreshFxRates();
});
chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
  void refreshFxRates();
});
void configureSidePanel();
