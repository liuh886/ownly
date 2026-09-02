import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { readCaptureStateV3 } from '../capture-state';
import { EMPTY_CAPTURE_STATE_V3, type CaptureCollection, type CapturePlace, type OwnlyCaptureStateV3 } from '../../domain/capture';
import { I18N, type Lang } from '../i18n';
import { sessionStorage } from '../session-storage';

const LANG_STORAGE_KEY = 'ownlyCaptureLang';
const fxOverrideKey = (tabId: number) => `ownlyFxOverride:${tabId}`;

export interface SavedListSummary {
  listId?: string;
  listName: string;
  count?: number;
  url?: string;
}

function detectDefaultLanguage(): Lang {
  try {
    const raw = (chrome.i18n?.getUILanguage?.() || (typeof navigator !== 'undefined' ? navigator.language : 'en')).toLowerCase();
    return raw.startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

/** V2-compatible facade over V3 state for minimal diff during transition. */
function createV2Compat(v3: OwnlyCaptureStateV3) {
  const activeCollection = v3.collections.find((c) => c.id === v3.active_collection_id) || v3.collections[0] || null;
  const tripId = activeCollection?.id || '';
  const places = activeCollection ? v3.places.filter((p) => p.collection_id === activeCollection.id) : [];
  return {
    activeContext: v3.planner_target
      ? { tripId: v3.planner_target.trip_id, title: v3.planner_target.title, currency: activeCollection?.currency }
      : (activeCollection ? { tripId: activeCollection.id, title: activeCollection.title, currency: activeCollection.currency } : null),
    pendingPlaces: places.map((p) => ({
      id: p.id,
      trip_id: p.collection_id,
      title: p.title,
      source_provider: p.source.provider,
      source_url: p.source.url,
      source_place_id: p.source.place_id,
      source_category: p.source.category,
      types: p.source.types,
      kind: p.inferred_kind || 'other',
      priority: p.user?.priority,
      tags: p.user?.tags || [],
      why: p.user?.why,
      notes: p.user?.notes,
      observed_rating: p.rating,
      observed_review_count: p.review_count,
      observed_price: p.price?.raw,
      price_currency: p.price?.currency,
      price_min: p.price?.min,
      price_max: p.price?.max,
      price_unit: p.price?.unit,
      price_level: p.price?.level,
      open_hours: p.open_hours,
      address: p.address,
      coordinates: p.coordinates,
      phone: p.phone,
      plus_code: p.plus_code,
      preferred_window: p.user?.preferred_window,
      duration_minutes: p.user?.duration_minutes,
      menu_url: p.menu_url,
      reservation_url: p.reservation_url,
      review_topics: p.review_topics,
      signals: [],
      risks: [],
      reservation_status: 'none' as const,
      state: 'candidate' as const,
      created_at: p.captured_at,
      updated_at: p.updated_at,
    })),
  };
}

export const store = {
  lang: detectDefaultLanguage(),
  stateV3: { ...EMPTY_CAPTURE_STATE_V3 } as OwnlyCaptureStateV3,
  currentPlace: null as CurrentResearchPlace | null,
  detectedSavedList: null as DetectedSavedList | null,
  detectedListPlaces: [] as CurrentResearchPlace[],
  detectedAllLists: [] as SavedListSummary[],
  activeFilter: 'all',
  searchQuery: '',
  pageDetectedCurrency: undefined as string | undefined,
  mapCurrencyOverride: undefined as string | undefined,
  locallyDeletedIds: new Set<string>(),
  userDismissedPlaceUrl: null as string | null,
  smartListDismissed: false,
  smartListKey: '' as string,
  editingCandidateId: null as string | null,
  isListPreviewOpen: false,
  bulkMode: false,
  bulkSelected: new Set<string>(),
  debugModeEnabled: false,

  /** V2-compatible getter for backward compat during transition. */
  get state() { return createV2Compat(this.stateV3); },
};

export const DEBUG_STORAGE_KEY = 'ownlyDebugMode';

export function t() {
  return I18N[store.lang];
}

/** Get the active collection from V3 state. */
export function getActiveCollection(): CaptureCollection | null {
  const state = store.stateV3;
  if (state.collections.length === 0) return null;
  return state.collections.find((c) => c.id === state.active_collection_id) || state.collections[0];
}

/** Get places in the active collection. */
export function getActivePlaces(): CapturePlace[] {
  const collection = getActiveCollection();
  if (!collection) return [];
  return store.stateV3.places.filter((p) => p.collection_id === collection.id);
}

export async function loadState(): Promise<void> {
  const [langRes, debugRes, fresh, tabs] = await Promise.all([
    chrome.storage.local.get(LANG_STORAGE_KEY),
    chrome.storage.local.get(DEBUG_STORAGE_KEY),
    readCaptureStateV3(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  const langVal = langRes[LANG_STORAGE_KEY];
  if (langVal === 'zh' || langVal === 'en') {
    store.lang = langVal;
  } else {
    store.lang = detectDefaultLanguage();
  }
  store.debugModeEnabled = Boolean(debugRes[DEBUG_STORAGE_KEY]);
  const tabId = tabs[0]?.id;
  if (typeof tabId === 'number') {
    const session = await sessionStorage.get(fxOverrideKey(tabId));
    const raw = session[fxOverrideKey(tabId)];
    if (typeof raw === 'string' && raw.trim()) store.mapCurrencyOverride = raw.trim().toUpperCase();
  }
  store.stateV3 = fresh;
}

export function getExistingPlaceForUrl(sourceUrl: string, sourcePlaceId?: string): CapturePlace | undefined {
  const places = getActivePlaces();
  return places.find(
    (p) =>
      p.source.url === sourceUrl ||
      (sourcePlaceId && p.source.place_id === sourcePlaceId) ||
      (store.currentPlace?.coordinates && p.coordinates &&
        p.coordinates.lat === store.currentPlace.coordinates.lat &&
        p.coordinates.lng === store.currentPlace.coordinates.lng),
  );
}
