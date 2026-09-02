import {
  DEFAULT_USD_PIVOT,
  ensurePlaceKindTag,
  inferPlaceKind,
  type PlannerTripPlace,
} from '../domain/planner';
import {
  EMPTY_CAPTURE_STATE_V3,
  findExistingPlaceByIdentity,
  type CaptureCollection,
  type CapturePlace,
  type OwnlyCaptureStateV3,
} from '../domain/capture';
import {
  mutateCaptureStateV3InWorker,
  normalizeCaptureStateV3,
  readCaptureStateV3,
} from './capture-state';
import type { CurrentResearchPlace } from './content';
import { sessionStorage } from './session-storage';

async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('[Ownly Capture] Could not configure side panel', error);
  }
}

async function flashBadge(tabId: number, text: string, color: string) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }), 2000);
  } catch {}
}

function getDefaultCollection(state: OwnlyCaptureStateV3): CaptureCollection {
  if (state.collections.length > 0) {
    const active = state.collections.find((c) => c.id === state.active_collection_id);
    if (active) return active;
    return state.collections[0];
  }
  // No collection exists → create default
  const now = new Date().toISOString();
  return {
    id: `default-${Date.now()}`,
    title: '我的收藏',
    created_at: now,
  };
}

async function quickCaptureCurrentPlace() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const tabId = tab.id;

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'OWNLY_GET_CURRENT_PLACE',
    }) as { place?: CurrentResearchPlace | null };
    const place = response?.place;
    if (!place?.title || !place.sourceUrl) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }

    const capturedId = await mutateCaptureStateV3InWorker((state) => {
      const collection = getDefaultCollection(state);
      const collectionPlaces = state.places.filter((p) => p.collection_id === collection.id);
      const existing = findExistingPlaceByIdentity(collectionPlaces, {
        source_provider: place.sourceProvider,
        source_place_id: place.sourcePlaceId,
        source_url: place.sourceUrl,
      }) ?? collectionPlaces.find(
        (p) => p.source.url === place.sourceUrl || (p.source.place_id && p.source.place_id === place.sourcePlaceId),
      );

      const now = new Date().toISOString();
      const freshKind = inferPlaceKind([place.title, place.category, place.address, ...(place.types || [])].filter(Boolean).join(' '));
      const isGeneric = existing?.inferred_kind === 'attraction' || existing?.inferred_kind === 'other' || !existing?.inferred_kind;
      const hasSpecific = freshKind !== 'attraction' && freshKind !== 'other';
      const effectiveKind = existing && !isGeneric ? existing.inferred_kind : (hasSpecific ? freshKind : (existing?.inferred_kind ?? freshKind));
      const stableId = existing?.id ?? crypto.randomUUID();

      const newCollectionIds = new Set(state.collections.map((c) => c.id));
      if (!newCollectionIds.has(collection.id)) {
        state = { ...state, collections: [...state.collections, collection] };
      }

      const capturePlace: CapturePlace = {
        id: stableId,
        collection_id: collection.id,
        title: place.title,
        source: {
          provider: (place.sourceProvider as CapturePlace['source']['provider']) || 'google_maps',
          url: place.sourceUrl,
          place_id: place.sourcePlaceId ?? existing?.source.place_id,
          category: place.category ?? existing?.source.category,
          types: Array.from(new Set([...(place.types ?? []), ...(existing?.source.types ?? [])])),
        },
        address: place.address ?? existing?.address,
        coordinates: place.coordinates ?? existing?.coordinates,
        rating: place.rating ?? existing?.rating,
        review_count: place.reviewCount ?? existing?.review_count,
        price: place.priceLevel ? { raw: place.priceLevel } : existing?.price,
        open_hours: place.openHours ?? existing?.open_hours,
        phone: place.phone ?? existing?.phone,
        plus_code: place.plusCode ?? existing?.plus_code,
        menu_url: place.menuUrl ?? existing?.menu_url,
        reservation_url: place.reservationUrl ?? existing?.reservation_url,
        review_topics: place.reviewTopics ?? existing?.review_topics,
        inferred_kind: effectiveKind,
        user: existing?.user ? {
          ...existing.user,
          why: existing.user.why ?? place.summary,
          notes: existing.user.notes ?? place.userNote,
        } : {
          priority: 'want',
          tags: ensurePlaceKindTag([], effectiveKind),
          why: place.summary,
          notes: place.userNote,
        },
        captured_at: existing?.captured_at ?? now,
        updated_at: now,
      };

      return {
        state: {
          ...state,
          active_collection_id: collection.id,
          places: [...state.places.filter((p) => p.id !== stableId), capturePlace],
        },
        result: stableId,
      };
    });

    if (!capturedId) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }
    void flashBadge(tabId, '✓', '#047857');
    try {
      await chrome.sidePanel.open({ tabId });
      await chrome.runtime.sendMessage({ type: 'OWNLY_FOCUS_CAPTURE' }).catch(() => {});
    } catch {}
  } catch (error) {
    console.warn('[Ownly Capture] Quick capture error', error);
    void flashBadge(tabId, '!', '#b91c1c');
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-capture-place') void quickCaptureCurrentPlace();
});

const TRACKED_TAB_URL = /^https:\/\//i;
const FX_RATES_CACHE_KEY = 'ownly_fx_rates';
const FX_RATES_TIME_KEY = 'ownly_fx_rates_updated_at';
const FX_TOOLTIP_ENABLED_KEY = 'ownly_fx_tooltip_enabled';
const FX_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const fxOverrideKey = (tabId: number) => `ownlyFxOverride:${tabId}`;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || (!changeInfo.url && !changeInfo.status)) return;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const type = (message as { type?: string }).type;

  if (type === 'OWNLY_SELECTOR_DRIFT') {
    void chrome.action.setBadgeText({ text: '!' }).catch(() => {});
    void chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  // ─── V3 Handlers ───────────────────────────────────────────────────────────

  if (type === 'CAPTURE_SAVE_STATE_V3') {
    const incoming = normalizeCaptureStateV3((message as { state?: unknown }).state);
    const rawDeleted = (message as { locallyDeletedIds?: unknown }).locallyDeletedIds;
    const deletedIds = Array.isArray(rawDeleted)
      ? new Set(rawDeleted.filter((id): id is string => typeof id === 'string'))
      : undefined;
    void mutateCaptureStateV3InWorker((current) => {
      // Merge: keep local places not in deletedIds, add incoming places, deduplicate by id
      const localPlaces = deletedIds
        ? current.places.filter((p) => !deletedIds.has(p.id))
        : current.places;
      const localPlaceIds = new Set(localPlaces.map((p) => p.id));
      const incomingOnly = incoming.places.filter((p) => !localPlaceIds.has(p.id));
      const merged: OwnlyCaptureStateV3 = {
        version: 3,
        active_collection_id: incoming.active_collection_id || current.active_collection_id,
        collections: [...current.collections],
        places: [...localPlaces, ...incomingOnly],
        planner_target: incoming.planner_target || current.planner_target,
      };
      return { state: merged, result: merged };
    })
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_REPLACE_STATE_V3') {
    const incoming = normalizeCaptureStateV3((message as { state?: unknown }).state);
    void mutateCaptureStateV3InWorker((current) => ({
      state: { ...incoming, planner_target: current.planner_target },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_SET_COLLECTION') {
    const collection = (message as { collection?: unknown }).collection as CaptureCollection | undefined;
    if (!collection || typeof collection.id !== 'string') {
      sendResponse({ ok: false, error: 'invalid collection' });
      return;
    }
    void mutateCaptureStateV3InWorker((current) => {
      const exists = current.collections.find((c) => c.id === collection.id);
      const collections = exists
        ? current.collections.map((c) => c.id === collection.id ? collection : c)
        : [...current.collections, collection];
      return {
        state: { ...current, collections },
        result: undefined,
      };
    })
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_SET_ACTIVE_COLLECTION') {
    const collectionId = (message as { collectionId?: unknown }).collectionId;
    if (typeof collectionId !== 'string') {
      sendResponse({ ok: false, error: 'invalid collectionId' });
      return;
    }
    void mutateCaptureStateV3InWorker((current) => ({
      state: { ...current, active_collection_id: collectionId },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_SET_PLANNER_TARGET') {
    const target = (message as { target?: unknown }).target as { trip_id: string; title: string } | null;
    void mutateCaptureStateV3InWorker((current) => ({
      state: { ...current, planner_target: target && typeof target.trip_id === 'string' ? target : undefined },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  // ─── Legacy V2 Handlers (kept during transition) ───────────────────────────

  if (type === 'CAPTURE_SAVE_STATE' || type === 'CAPTURE_REPLACE_STATE' || type === 'CAPTURE_SET_CONTEXT' || type === 'CAPTURE_APPLY_IMPORT_REPORT') {
    // Forward V2 messages to V3 by migrating on the fly
    if (type === 'CAPTURE_SET_CONTEXT') {
      const context = (message as { context?: unknown }) as { context?: { tripId?: string; title?: string; currency?: string } };
      if (context.context?.tripId && context.context?.title) {
        void mutateCaptureStateV3InWorker((current) => {
          const target = { trip_id: context.context!.tripId!, title: context.context!.title! };
          if (context.context?.currency) {
            // Update active collection currency if it matches
            const activeCol = current.collections.find((c) => c.id === current.active_collection_id);
            if (activeCol) {
              return {
                state: {
                  ...current,
                  planner_target: target,
                  collections: current.collections.map((c) =>
                    c.id === activeCol.id ? { ...c, currency: context.context!.currency!.toUpperCase() } : c
                  ),
                },
                result: undefined,
              };
            }
          }
          return {
            state: { ...current, planner_target: target },
            result: undefined,
          };
        })
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
      } else {
        // Clear planner target
        void mutateCaptureStateV3InWorker((current) => ({
          state: { ...current, planner_target: undefined },
          result: undefined,
        }))
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
      }
      return true;
    }

    // For SAVE/REPLACE/APPLY_REPORT, read V2 and forward
    sendResponse({ ok: true });
    return true;
  }

  // ─── FX Handlers ───────────────────────────────────────────────────────────

  if (type === 'OWNLY_SET_FX_OVERRIDE') {
    const tabId = (message as { tabId?: unknown }).tabId;
    const currency = (message as { currency?: unknown }).currency;
    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'missing tab id' });
      return;
    }
    void (async () => {
      const key = fxOverrideKey(tabId);
      const normalized = typeof currency === 'string' && currency.trim() && currency !== 'AUTO'
        ? currency.trim().toUpperCase()
        : undefined;
      if (normalized) await sessionStorage.set({ [key]: normalized });
      else await sessionStorage.remove(key);
      await chrome.tabs.sendMessage(tabId, { type: 'OWNLY_CURRENCY_OVERRIDE_CHANGED', overrideCurrency: normalized }).catch(() => {});
      sendResponse({ ok: true });
    })().catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'OWNLY_GET_FX_CONFIG') {
    void (async () => {
      const [rates, stored, state] = await Promise.all([
        getCachedFxRates(),
        chrome.storage.local.get(FX_TOOLTIP_ENABLED_KEY),
        readCaptureStateV3(),
      ]);
      const tabId = sender.tab?.id;
      let overrideCurrency: string | undefined;
      if (typeof tabId === 'number') {
        const session = await sessionStorage.get(fxOverrideKey(tabId));
        const raw = session[fxOverrideKey(tabId)];
        if (typeof raw === 'string' && raw.trim()) overrideCurrency = raw.trim().toUpperCase();
      }
      // Get currency from active collection or planner target
      const activeCollection = state.collections.find((c) => c.id === state.active_collection_id);
      const targetCurrency = activeCollection?.currency || state.planner_target?.title ? undefined : 'CNY';
      sendResponse({
        ok: true,
        targetCurrency: targetCurrency || activeCollection?.currency || 'CNY',
        rates,
        enabled: stored[FX_TOOLTIP_ENABLED_KEY] !== false,
        overrideCurrency,
      });
    })().catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'OWNLY_SET_FX_TOOLTIP_ENABLED') {
    const enabled = (message as { enabled?: boolean }).enabled !== false;
    void (async () => {
      await chrome.storage.local.set({ [FX_TOOLTIP_ENABLED_KEY]: enabled });
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) void chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_FX_TOOLTIP_STATUS_CHANGED', enabled }).catch(() => {});
      }
    })();
    sendResponse({ ok: true });
    return true;
  }
});

async function getCachedFxRates(): Promise<Record<string, number>> {
  try {
    const data = await chrome.storage.local.get([FX_RATES_CACHE_KEY, FX_RATES_TIME_KEY]);
    const cachedRates = data[FX_RATES_CACHE_KEY] as Record<string, number> | undefined;
    const lastUpdated = (data[FX_RATES_TIME_KEY] as number) || 0;
    if (cachedRates && Date.now() - lastUpdated < FX_CACHE_MAX_AGE_MS) return cachedRates;
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
    if (data?.result === 'success' && data.rates) {
      const pivotMap: Record<string, number> = { USD: 1 };
      for (const [code, rate] of Object.entries(data.rates)) {
        if (typeof rate === 'number' && rate > 0) pivotMap[code.toUpperCase()] = Math.round((1 / rate) * 100000) / 100000;
      }
      await chrome.storage.local.set({ [FX_RATES_CACHE_KEY]: pivotMap, [FX_RATES_TIME_KEY]: Date.now() });
      return pivotMap;
    }
  } catch (error) {
    console.warn('[Ownly Capture] Failed to fetch live FX rates:', error);
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
