import {
  DEFAULT_USD_PIVOT,
  ensurePlaceKindTag,
  inferPlaceKind,
  type PlannerTripPlace,
} from '../domain/planner';
import {
  EMPTY_CAPTURE_STATE_V3,
  findExistingPlaceByIdentity,
  findExistingPlaceByResilientIdentity,
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
import { logger } from './logger';

async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    logger.info('Background', 'Side panel behavior configured: openPanelOnActionClick');
  } catch (error) {
    logger.warn('Background', 'Could not configure side panel', String(error));
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
  const inbox = state.collections.find((c) => c.title === 'Inbox' || c.id.startsWith('inbox-'));
  if (inbox) return inbox;
  if (state.collections.length > 0) {
    const active = state.collections.find((c) => c.id === state.active_collection_id);
    if (active) return active;
    return state.collections[0];
  }
  const now = new Date().toISOString();
  return {
    id: `inbox-${Date.now()}`,
    title: 'Inbox',
    created_at: now,
  };
}

async function quickCaptureCurrentPlace() {
  const started = Date.now();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    logger.warn('Background', 'Quick capture aborted: no active tab');
    return;
  }
  const tabId = tab.id;
  logger.info('Background', 'Quick capture triggered', { tabId, url: tab.url });

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'OWNLY_GET_CURRENT_PLACE',
    }) as { place?: CurrentResearchPlace | null };
    const place = response?.place;
    if (!place?.title || !place.sourceUrl) {
      logger.warn('Background', 'Quick capture: no place detected on page', { tabId, url: tab.url, response });
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }
    logger.info('Background', 'Quick capture: place detected', { title: place.title, url: place.sourceUrl, placeId: place.sourcePlaceId, rating: place.rating });

    const capturedId = await mutateCaptureStateV3InWorker((state) => {
      const collection = getDefaultCollection(state);
      const collectionPlaces = state.places.filter((p) => p.collection_id === collection.id);
      const existing = findExistingPlaceByResilientIdentity(collectionPlaces, {
        source_provider: place.sourceProvider,
        source_place_id: place.sourcePlaceId,
        source_url: place.sourceUrl,
        title: place.title,
        coordinates: place.coordinates ?? null,
      }) ?? findExistingPlaceByIdentity(collectionPlaces, {
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
      logger.error('Background', 'Quick capture: mutate returned empty id', { tabId });
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }
    logger.info('Background', 'Quick capture: persisted', { capturedId, tabId, ms: Date.now() - started });
    void flashBadge(tabId, '✓', '#047857');
    try {
      await chrome.sidePanel.open({ tabId });
      await chrome.runtime.sendMessage({ type: 'OWNLY_FOCUS_CAPTURE' }).catch(() => {});
      logger.info('Background', 'Quick capture: sidepanel opened', { tabId });
    } catch (e) {
      logger.warn('Background', 'Quick capture: sidepanel open failed', String(e));
    }
  } catch (error) {
    logger.error('Background', 'Quick capture error', { error: error instanceof Error ? error.stack || error.message : String(error), tabId });
    console.warn('[Ownly Capture] Quick capture error', error);
    void flashBadge(tabId, '!', '#b91c1c');
  }
}

chrome.commands.onCommand.addListener((command) => {
  logger.info('Background', 'Command received', { command });
  if (command === 'quick-capture-place') void quickCaptureCurrentPlace();
});

const TRACKED_TAB_URL = /^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)/i;
const FX_RATES_CACHE_KEY = 'ownly_fx_rates';
const FX_RATES_TIME_KEY = 'ownly_fx_rates_updated_at';
const FX_TOOLTIP_ENABLED_KEY = 'ownly_fx_tooltip_enabled';
const FX_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const fxOverrideKey = (tabId: number) => `ownlyFxOverride:${tabId}`;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || (!changeInfo.url && !changeInfo.status)) return;
  const url = changeInfo.url || tab.url || '';
  if (!TRACKED_TAB_URL.test(url)) return;
  logger.debug('Background', 'Tab updated', { tabId, url: url.slice(0, 80), status: changeInfo.status });
  void chrome.runtime.sendMessage({ type: 'OWNLY_TAB_CHANGED', tabId, url }).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  logger.debug('Background', 'Tab activated', { tabId });
  void chrome.tabs.get(tabId).then((tab) => {
    if (tab.url && TRACKED_TAB_URL.test(tab.url)) {
      logger.debug('Background', 'Tab activated with URL', { tabId, url: tab.url.slice(0, 80) });
      void chrome.runtime.sendMessage({ type: 'OWNLY_TAB_CHANGED', tabId, url: tab.url }).catch(() => {});
    }
  }).catch((e) => logger.warn('Background', 'Tab get failed on activated', String(e)));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const type = (message as { type?: string }).type;

  if (type === 'OWNLY_SELECTOR_DRIFT') {
    const selector = (message as { selector?: string }).selector || 'unknown';
    logger.warn('Background', `Selector drift: ${selector}`, { sender: sender.tab?.url?.slice(0, 60) });
    void chrome.action.setBadgeText({ text: '!' }).catch(() => {});
    void chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' }).catch(() => {});
    // Also broadcast to diagnostics layer — diagnostics.ts listens for this type
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
    const rawDeletedCols = (message as { locallyDeletedCollectionIds?: unknown }).locallyDeletedCollectionIds;
    const deletedColIds = Array.isArray(rawDeletedCols)
      ? new Set(rawDeletedCols.filter((id): id is string => typeof id === 'string'))
      : undefined;
    logger.info('Background', 'CAPTURE_SAVE_STATE_V3', { incomingPlaces: incoming.places.length, deletedIds: deletedIds?.size ?? 0, deletedCols: deletedColIds?.size ?? 0, activeCollection: incoming.active_collection_id });
    void mutateCaptureStateV3InWorker((current) => {
      // 1. Collections: respect tombstones for deleted collections
      const colMap = new Map(current.collections.map((c) => [c.id, c]));
      for (const col of incoming.collections) {
        if (deletedColIds?.has(col.id)) continue;
        colMap.set(col.id, col);
      }
      // Remove tombstoned collections from merged result
      if (deletedColIds) {
        for (const delId of deletedColIds) colMap.delete(delId);
      }
      const mergedCollections = Array.from(colMap.values());

      // 2. Places: incoming edits take precedence; keep non-incoming current places (excluding deleted)
      const incomingMap = new Map(incoming.places.map((p) => [p.id, p]));
      const preservedCurrent = current.places
        .filter((p) => (!deletedIds || !deletedIds.has(p.id)) && !incomingMap.has(p.id) && (!deletedColIds || !deletedColIds.has(p.collection_id)));
      const validIncoming = incoming.places
        .filter((p) => (!deletedIds || !deletedIds.has(p.id)) && (!deletedColIds || !deletedColIds.has(p.collection_id)));

      const mergedPlaces = [...preservedCurrent, ...validIncoming];
      // Ensure active_collection_id points to existing collection
      const activeId = incoming.active_collection_id || current.active_collection_id;
      const activeExists = mergedCollections.some((c) => c.id === activeId);
      const fallbackActive = mergedCollections[0]?.id;
      const merged: OwnlyCaptureStateV3 = {
        version: 3,
        active_collection_id: activeExists ? activeId : fallbackActive,
        collections: mergedCollections,
        places: mergedPlaces,
        planner_target: incoming.planner_target || current.planner_target,
      };
      return { state: merged, result: merged };
    })
      .then((state) => {
        logger.info('Background', 'CAPTURE_SAVE_STATE_V3 persisted', { totalPlaces: state.places.length, collections: state.collections.length });
        sendResponse({ ok: true, state });
      })
      .catch((error: unknown) => {
        logger.error('Background', 'CAPTURE_SAVE_STATE_V3 failed', String(error));
        sendResponse({ ok: false, error: String(error) });
      });
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

  if (type === 'CAPTURE_APPLY_IMPORT_REPORT' || type === 'CAPTURE_APPLY_IMPORT_REPORT_V3') {
    const report = (message as { report?: { created?: string[]; updated?: string[]; deduped?: string[] } }).report;
    if (report) {
      const importedIds = new Set([
        ...(report.created || []),
        ...(report.updated || []),
        ...(report.deduped || []),
      ].filter(Boolean));
      if (importedIds.size > 0) {
        void mutateCaptureStateV3InWorker((current) => ({
          state: {
            ...current,
            places: current.places.filter((p) => !importedIds.has(p.id)),
          },
          result: undefined,
        }))
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
        return true;
      }
    }
    sendResponse({ ok: true });
    return true;
  }

  // ─── Legacy V2 Handlers (kept during transition) ───────────────────────────

  if (type === 'CAPTURE_SAVE_STATE' || type === 'CAPTURE_REPLACE_STATE' || type === 'CAPTURE_SET_CONTEXT') {
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

    sendResponse({ ok: true });
    return true;
  }

  // ─── FX Handlers ───────────────────────────────────────────────────────────

  if (type === 'OWNLY_SET_FX_OVERRIDE') {
    const tabId = (message as { tabId?: unknown }).tabId;
    const currency = (message as { currency?: unknown }).currency;
    if (typeof tabId !== 'number') {
      logger.warn('Background', 'OWNLY_SET_FX_OVERRIDE missing tabId');
      sendResponse({ ok: false, error: 'missing tab id' });
      return;
    }
    logger.info('Background', 'OWNLY_SET_FX_OVERRIDE', { tabId, currency });
    void (async () => {
      const key = fxOverrideKey(tabId);
      const normalized = typeof currency === 'string' && currency.trim() && currency !== 'AUTO'
        ? currency.trim().toUpperCase()
        : undefined;
      if (normalized) await sessionStorage.set({ [key]: normalized });
      else await sessionStorage.remove(key);
      await chrome.tabs.sendMessage(tabId, { type: 'OWNLY_CURRENCY_OVERRIDE_CHANGED', overrideCurrency: normalized }).catch(() => {});
      logger.info('Background', 'FX override applied', { tabId, normalized: normalized ?? 'AUTO' });
      sendResponse({ ok: true });
    })().catch((error: unknown) => {
      logger.error('Background', 'OWNLY_SET_FX_OVERRIDE failed', String(error));
      sendResponse({ ok: false, error: String(error) });
    });
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
      // Get currency from active collection or default to CNY
      const activeCollection = state.collections.find((c) => c.id === state.active_collection_id);
      const targetCurrency = activeCollection?.currency || 'CNY';
      sendResponse({
        ok: true,
        targetCurrency,
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
    logger.debug('Background', 'Refreshing FX rates');
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) {
      logger.warn('Background', 'FX fetch HTTP not ok', { status: res.status });
      return DEFAULT_USD_PIVOT;
    }
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data?.result === 'success' && data.rates) {
      const pivotMap: Record<string, number> = { USD: 1 };
      for (const [code, rate] of Object.entries(data.rates)) {
        if (typeof rate === 'number' && rate > 0) pivotMap[code.toUpperCase()] = Math.round((1 / rate) * 100000) / 100000;
      }
      await chrome.storage.local.set({ [FX_RATES_CACHE_KEY]: pivotMap, [FX_RATES_TIME_KEY]: Date.now() });
      logger.info('Background', 'FX rates refreshed', { count: Object.keys(pivotMap).length });
      return pivotMap;
    }
    logger.warn('Background', 'FX response not success', data);
  } catch (error) {
    logger.error('Background', 'Failed to fetch live FX rates', String(error));
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
