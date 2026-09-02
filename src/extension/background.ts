import {
  DEFAULT_USD_PIVOT,
  applyCaptureImportReport,
  asCaptureCandidate,
  ensurePlaceKindTag,
  findExistingTripPlace,
  inferPlaceKind,
  mergeCaptureState,
  type CaptureContext,
  type ImportReport,
  type PlannerTripPlace,
} from '../domain/planner';
import {
  mutateCaptureStateInWorker,
  normalizeCaptureState,
  readCaptureState,
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

function normalizeContext(value: unknown): CaptureContext | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as Partial<CaptureContext>;
  if (typeof context.tripId !== 'string' || !context.tripId.trim()) return null;
  if (typeof context.title !== 'string' || !context.title.trim()) return null;
  return {
    tripId: context.tripId,
    title: context.title,
    currency: typeof context.currency === 'string' && context.currency.trim() ? context.currency.trim().toUpperCase() : undefined,
    tags: Array.isArray(context.tags) ? context.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : undefined,
  };
}

async function quickCaptureCurrentPlace() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const tabId = tab.id;

  try {
    const snapshot = await readCaptureState();
    const context = snapshot.activeContext;
    if (!context) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }

    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'OWNLY_GET_CURRENT_PLACE',
      targetCurrency: context.currency,
    }) as { place?: CurrentResearchPlace | null };
    const place = response?.place;
    if (!place?.title || !place.sourceUrl) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }

    const capturedId = await mutateCaptureStateInWorker((state) => {
      const active = state.activeContext;
      if (!active) return { state, result: null as string | null };
      const existing = findExistingTripPlace(
        state.pendingPlaces,
        active.tripId,
        place.sourceUrl,
        place.sourcePlaceId,
        place.coordinates,
      );
      const now = new Date().toISOString();
      const freshKind = inferPlaceKind([place.title, place.category, place.address, ...(place.types || [])].filter(Boolean).join(' '));
      const isGeneric = existing?.kind === 'attraction' || existing?.kind === 'other';
      const hasSpecific = freshKind !== 'attraction' && freshKind !== 'other';
      const effectiveKind = existing && !isGeneric ? existing.kind : (hasSpecific ? freshKind : (existing?.kind ?? freshKind));
      const stableId = existing?.id ?? crypto.randomUUID();

      const candidate = asCaptureCandidate({
        schema_version: '0.1',
        type: 'trip_place',
        id: stableId,
        trip_id: active.tripId,
        title: place.title,
        source_provider: place.sourceProvider || 'google_maps',
        source_url: place.sourceUrl,
        source_place_id: place.sourcePlaceId ?? existing?.source_place_id,
        kind: effectiveKind,
        area: (existing?.area ?? place.address?.split(/[,，·]/)[0]?.trim()) || undefined,
        priority: existing?.priority ?? 'want',
        tags: ensurePlaceKindTag(Array.from(new Set([...(active.tags ?? []), ...(existing?.tags ?? [])])), effectiveKind),
        why: existing?.why ?? place.summary,
        signals: existing?.signals ?? [],
        risks: existing?.risks ?? [],
        notes: existing?.notes ?? place.userNote,
        observed_rating: place.rating ?? existing?.observed_rating,
        observed_price: place.priceLevel ?? existing?.observed_price,
        observed_at: now.slice(0, 10),
        preferred_window: existing?.preferred_window,
        duration_minutes: existing?.duration_minutes,
        open_hours: place.openHours ?? existing?.open_hours,
        address: place.address ?? existing?.address,
        coordinates: place.coordinates ?? existing?.coordinates,
        phone: place.phone ?? existing?.phone,
        plus_code: place.plusCode ?? existing?.plus_code,
        menu_url: place.menuUrl ?? existing?.menu_url,
        reservation_url: place.reservationUrl ?? existing?.reservation_url,
        review_topics: place.reviewTopics ?? existing?.review_topics,
        types: Array.from(new Set([...(place.types ?? []), ...(existing?.types ?? [])])),
        reservation_status: 'none',
        state: 'candidate',
        created_at: existing?.created_at ?? now,
        updated_at: now,
      } satisfies PlannerTripPlace);

      return {
        state: {
          ...state,
          pendingPlaces: [...state.pendingPlaces.filter((item) => item.id !== stableId), candidate],
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

  if (type === 'CAPTURE_SAVE_STATE') {
    const incoming = normalizeCaptureState((message as { state?: unknown }).state);
    const rawDeleted = (message as { locallyDeletedIds?: unknown }).locallyDeletedIds;
    const deletedIds = Array.isArray(rawDeleted)
      ? new Set(rawDeleted.filter((id): id is string => typeof id === 'string'))
      : undefined;
    void mutateCaptureStateInWorker((current) => {
      const merged = mergeCaptureState(current, incoming, deletedIds);
      return { state: merged, result: merged };
    })
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_REPLACE_STATE') {
    const incoming = normalizeCaptureState((message as { state?: unknown }).state);
    void mutateCaptureStateInWorker((current) => ({
      state: { version: 2, activeContext: current.activeContext, pendingPlaces: incoming.pendingPlaces, lastImportReport: incoming.lastImportReport },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_SET_CONTEXT') {
    const context = normalizeContext((message as { context?: unknown }).context);
    void mutateCaptureStateInWorker((current) => ({
      state: { ...current, activeContext: context },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_APPLY_IMPORT_REPORT') {
    const report = (message as { report?: ImportReport }).report;
    if (!report || typeof report.received !== 'number' || !Array.isArray(report.created) || !Array.isArray(report.failed)) {
      sendResponse({ ok: false, error: 'invalid import report' });
      return;
    }
    const attemptedAt = new Date().toISOString().slice(0, 10);
    void mutateCaptureStateInWorker((current) => ({
      state: applyCaptureImportReport(current, report, attemptedAt),
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

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
        readCaptureState(),
      ]);
      const tabId = sender.tab?.id;
      let overrideCurrency: string | undefined;
      if (typeof tabId === 'number') {
        const session = await sessionStorage.get(fxOverrideKey(tabId));
        const raw = session[fxOverrideKey(tabId)];
        if (typeof raw === 'string' && raw.trim()) overrideCurrency = raw.trim().toUpperCase();
      }
      sendResponse({
        ok: true,
        targetCurrency: state.activeContext?.currency || 'CNY',
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
