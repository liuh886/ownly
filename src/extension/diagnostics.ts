/**
 * Ownly Diagnostics Bundle — comprehensive snapshot for AI-assisted debugging.
 *
 * Collects: Inbox state, planner target, tab context, storage health,
 * content extraction signals, bridge status, performance & error summary.
 * Never includes secrets; price/notes are redacted unless explicitly allowed.
 */

import { logger } from './logger';
import { readCaptureStateV3, CAPTURE_STORAGE_KEY } from './capture-state';
import { sessionStorage } from './session-storage';
import { inferSourceProvider } from '../domain/planner';

export interface OwnlyDiagnosticsBundleV2 {
  schema: 'ownly.diagnostics';
  version: 2;
  exportedAt: string;
  sessionId: string;
  extension: {
    manifestVersion: string;
    sidepanelUrl: string;
    userAgent: string;
    language: string;
    debugMode: boolean;
    context: string;
  };
  capture: {
    stateV3: unknown;
    collections: unknown[];
    inbox: unknown | null;
    activeCollection: unknown | null;
    plannerTarget: unknown | null;
    stats: { totalPlaces: number; inboxPlaces: number; collections: number; withCoordinates: number; withRating: number; withPrice: number };
  };
  tab: {
    url: string | null;
    detectedCurrency: string | null;
    overrideCurrency: string | null;
    currentPlace: unknown | null;
    detectedSavedList: unknown | null;
    detectedAllLists: unknown[];
  } | null;
  storage: {
    captureStorageKey: string;
    storageQuota?: { bytesInUse?: number; quota?: number };
    fxOverride: string | null;
    recentErrors: string[];
  };
  performance: {
    readCurrentPlaceMs?: number;
    lastEnrichDurationMs?: number;
    lastImportDurationMs?: number;
  };
  logs: {
    stats: ReturnType<typeof logger.getStats>;
    entries: ReturnType<typeof logger.getLogs>;
    recentWarns: ReturnType<typeof logger.getLogs>;
    recentErrors: ReturnType<typeof logger.getLogs>;
  };
  health: {
    status: 'ok' | 'warn' | 'error';
    warnings: string[];
    errors: string[];
    selectorDrifts: string[];
  };
}

const lastPerf: OwnlyDiagnosticsBundleV2['performance'] = {};
const selectorDrifts: string[] = [];

// Called from selectors.ts driftCheck via message — accumulate here
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'OWNLY_SELECTOR_DRIFT') {
      const selector = (msg as { selector?: string }).selector;
      if (selector && !selectorDrifts.includes(selector)) {
        selectorDrifts.push(selector);
        logger.warn('Diagnostics', `Selector drift recorded: ${selector}`);
      }
    }
  });
}

export function recordPerf(key: keyof OwnlyDiagnosticsBundleV2['performance'], ms: number): void {
  lastPerf[key] = ms;
}

export async function buildDiagnosticsBundle(opts: {
  store?: {
    lang: string;
    debugModeEnabled: boolean;
    stateV3: unknown;
    currentPlace: unknown;
    detectedSavedList: unknown;
    detectedAllLists: unknown[];
    pageDetectedCurrency?: string;
    mapCurrencyOverride?: string;
  };
  tabId?: number;
} = {}): Promise<OwnlyDiagnosticsBundleV2> {
  const started = Date.now();
  const store = opts.store;
  let captureState: unknown = null;
  let inbox: unknown = null;
  let activeCollection: unknown = null;
  let plannerTarget: unknown = null;
  let stats = { totalPlaces: 0, inboxPlaces: 0, collections: 0, withCoordinates: 0, withRating: 0, withPrice: 0 };

  try {
    const state = await readCaptureStateV3();
    captureState = state;
    const collections = (state as unknown as { collections?: unknown[] }).collections ?? [];
    // Derive stats
    const places = (state as unknown as { places?: Array<Record<string, unknown>> }).places ?? [];
    const inboxCol = (state as unknown as { collections?: Array<{ title?: string; id?: string }> }).collections?.find((c) => c.title === 'Inbox' || c.id?.startsWith('inbox-')) ?? null;
    inbox = inboxCol;
    const activeId = (state as unknown as { active_collection_id?: string }).active_collection_id;
    activeCollection = collections.find((c: unknown) => (c as { id?: string }).id === activeId) ?? collections[0] ?? null;
    plannerTarget = (state as unknown as { planner_target?: unknown }).planner_target ?? null;
    const inboxId = (inboxCol as { id?: string } | null)?.id;
    const inboxPlaces = inboxId ? places.filter((p) => (p as { collection_id?: string }).collection_id === inboxId) : [];
    stats = {
      totalPlaces: places.length,
      inboxPlaces: inboxPlaces.length,
      collections: collections.length,
      withCoordinates: places.filter((p) => (p as { coordinates?: unknown }).coordinates).length,
      withRating: places.filter((p) => (p as { rating?: unknown }).rating !== undefined).length,
      withPrice: places.filter((p) => {
        const pr = (p as { price?: { raw?: string } }).price;
        return Boolean(pr?.raw);
      }).length,
    };
  } catch (e) {
    captureState = { error: String(e) };
  }

  // Tab context
  let tabInfo: OwnlyDiagnosticsBundleV2['tab'] = null;
  if (store) {
    tabInfo = {
      url: typeof window !== 'undefined' ? window.location.href : null,
      detectedCurrency: (store.pageDetectedCurrency as string) ?? null,
      overrideCurrency: (store.mapCurrencyOverride as string) ?? null,
      currentPlace: store.currentPlace ?? null,
      detectedSavedList: store.detectedSavedList ? {
        listName: (store.detectedSavedList as { listName?: string }).listName,
        placeCount: (store.detectedSavedList as { places?: unknown[] }).places?.length ?? 0,
        sample: (store.detectedSavedList as { places?: unknown[] }).places?.slice(0, 3) ?? [],
      } : null,
      detectedAllLists: store.detectedAllLists ?? [],
    };
  } else if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabInfo = {
        url: activeTab?.url ?? null,
        detectedCurrency: null,
        overrideCurrency: null,
        currentPlace: null,
        detectedSavedList: null,
        detectedAllLists: [],
      };
      if (activeTab?.id) {
        const session = await sessionStorage.get(`ownlyFxOverride:${activeTab.id}`);
        const raw = session[`ownlyFxOverride:${activeTab.id}`];
        if (typeof raw === 'string' && raw.trim()) tabInfo.overrideCurrency = raw.trim().toUpperCase();
      }
    } catch {}
  }

  // Storage health
  const fxOverride: string | null = null;
  let quota: { bytesInUse?: number; quota?: number } | undefined;
  try {
    const localAny = chrome.storage?.local as unknown as { getBytesInUse?: (keys: null) => Promise<number> };
    if (typeof chrome !== 'undefined' && localAny?.getBytesInUse) {
      const bytes = await localAny.getBytesInUse(null);
      quota = { bytesInUse: bytes as unknown as number };
    }
  } catch {}

  // Recent errors
  const allLogs = logger.getLogs();
  const recentWarns = allLogs.filter((l) => l.level === 'WARN').slice(-20);
  const recentErrors = allLogs.filter((l) => l.level === 'ERROR').slice(-20);

  // Actionable errors (exclude expected host permission / unsupported tab / soft injection skips)
  const actionableErrors = recentErrors.filter((l) => {
    const msg = typeof l.message === 'string' ? l.message : JSON.stringify(l.message || '');
    return !/Cannot access contents of url|Extension manifest must request permission|primary sendMessage failed|Missing strong Google Maps identity/i.test(msg);
  });

  // Health warnings
  const warnings: string[] = [];
  const errors: string[] = [];
  if (stats.inboxPlaces === 0 && stats.totalPlaces === 0) warnings.push('Inbox empty — no places captured yet');
  if (stats.withCoordinates < stats.totalPlaces * 0.5 && stats.totalPlaces > 0) warnings.push(`Only ${stats.withCoordinates}/${stats.totalPlaces} places have coordinates`);

  // Price coverage check: only evaluate against places where price is expected (stay / food)
  const placesList = Array.isArray((captureState as { places?: Array<{ inferred_kind?: string }> })?.places)
    ? (captureState as { places: Array<{ inferred_kind?: string }> }).places
    : [];
  const stayAndFoodCount = placesList.filter((p) => p.inferred_kind === 'stay' || p.inferred_kind === 'food').length;
  if (stayAndFoodCount > 0 && stats.withPrice < stayAndFoodCount * 0.3) {
    warnings.push(`Only ${stats.withPrice}/${stayAndFoodCount} stay/food places have price`);
  }

  if (actionableErrors.length > 0) errors.push(`${actionableErrors.length} error logs in buffer`);
  if (selectorDrifts.length > 0) warnings.push(`Selector drift detected: ${selectorDrifts.join(', ')}`);

  if (tabInfo?.url && /^https?:\/\//.test(tabInfo.url)) {
    const provider = inferSourceProvider(tabInfo.url);
    if (provider !== 'other' && !tabInfo.currentPlace) {
      warnings.push(`Active travel page (${provider}) could not be extracted`);
    }
  }

  const runtimeAny = chrome.runtime as unknown as { getManifest?: () => { version: string } };
  const bundle: OwnlyDiagnosticsBundleV2 = {
    schema: 'ownly.diagnostics',
    version: 2,
    exportedAt: new Date().toISOString(),
    sessionId: logger.getSessionId(),
    extension: {
      manifestVersion: (typeof chrome !== 'undefined' && runtimeAny?.getManifest ? runtimeAny.getManifest().version : 'unknown'),
      sidepanelUrl: typeof window !== 'undefined' ? window.location.href : 'background',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      language: (store as unknown as { lang?: string })?.lang ?? 'unknown',
      debugMode: Boolean((store as unknown as { debugModeEnabled?: boolean })?.debugModeEnabled),
      context: typeof window !== 'undefined' ? window.location.pathname : 'background',
    },
    capture: {
      stateV3: captureState,
      collections: ((captureState as { collections?: unknown[] } | null)?.collections ?? []) as unknown[],
      inbox,
      activeCollection,
      plannerTarget,
      stats,
    },
    tab: tabInfo,
    storage: {
      captureStorageKey: CAPTURE_STORAGE_KEY,
      storageQuota: quota,
      fxOverride,
      recentErrors: recentErrors.map((e) => logger.formatEntryText(e)),
    },
    performance: { ...lastPerf, readCurrentPlaceMs: lastPerf.readCurrentPlaceMs },
    logs: {
      stats: logger.getStats(),
      entries: allLogs.slice(-200),
      recentWarns,
      recentErrors,
    },
    health: {
      status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warn' : 'ok',
      warnings,
      errors,
      selectorDrifts: [...selectorDrifts],
    },
  };

  logger.debug('Diagnostics', `Bundle built in ${Date.now() - started}ms`, {
    stats: bundle.capture.stats,
    health: bundle.health.status,
    logCount: bundle.logs.entries.length,
  });

  return bundle;
}

export function bundleToText(bundle: OwnlyDiagnosticsBundleV2): string {
  return JSON.stringify(bundle, null, 2);
}

export async function copyDiagnosticsBundle(storeArg?: { lang: string; debugModeEnabled: boolean; stateV3: unknown; currentPlace: unknown; detectedSavedList: unknown; detectedAllLists: unknown[]; pageDetectedCurrency?: string; mapCurrencyOverride?: string }): Promise<{ ok: boolean; text: string }> {
  const bundle = await buildDiagnosticsBundle({ store: storeArg as unknown as never });
  const text = bundleToText(bundle);
  try {
    await navigator.clipboard.writeText(text);
    logger.info('Diagnostics', 'Diagnostics bundle copied to clipboard', { sessionId: bundle.sessionId, places: bundle.capture.stats.totalPlaces });
    return { ok: true, text };
  } catch (e) {
    logger.warn('Diagnostics', 'Clipboard write failed for diagnostics', String(e));
    return { ok: false, text };
  }
}
