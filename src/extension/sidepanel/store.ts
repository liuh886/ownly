import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { readCaptureStateV3, saveCaptureStateV3ViaWorker, writeCaptureStateV3 } from '../capture-state';
import { DEFAULT_INBOX_TITLE, EMPTY_CAPTURE_STATE_V3, ensureInboxCollection, findExistingPlaceByIdentity, getInboxCollection as getInboxCollectionDomain, type CaptureCollection, type CapturePlace, type OwnlyCaptureStateV3 } from '../../domain/capture';
import { I18N, type Lang } from '../i18n';
import { sessionStorage } from '../session-storage';
import { logger } from '../logger';

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

/** Build a V2-compatible facade from V3 state for backward compat during transition. */
function buildV2Facade(v3: OwnlyCaptureStateV3) {
  const activeCollection = v3.collections.find((c) => c.id === v3.active_collection_id) || v3.collections[0] || null;
  const places = activeCollection ? v3.places.filter((p) => p.collection_id === activeCollection.id) : [];
  return {
    version: 2 as const,
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
      area: p.address?.split(/[,，·]/)[0]?.trim() || undefined,
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
    lastImportReport: undefined as import('../../domain/planner').ImportReport | undefined,
  };
}

export const store = {
  lang: detectDefaultLanguage(),
  stateV3: { ...EMPTY_CAPTURE_STATE_V3 } as OwnlyCaptureStateV3,
  /** V2-compatible facade — mutable, updated whenever stateV3 changes. */
  state: buildV2Facade(EMPTY_CAPTURE_STATE_V3),
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

  /** Update V3 state and rebuild V2 facade. */
  setState(next: OwnlyCaptureStateV3) {
    this.stateV3 = next;
    this.state = buildV2Facade(next);
  },

  /** Get the active collection. */
  getActiveCollection(): CaptureCollection | null {
    if (this.stateV3.collections.length === 0) return null;
    return this.stateV3.collections.find((c) => c.id === this.stateV3.active_collection_id) || this.stateV3.collections[0];
  },

  getInboxCollection(): CaptureCollection | null {
    return getInboxCollectionDomain(this.stateV3);
  },

  getInboxPlaces(): CapturePlace[] {
    const inbox = this.getInboxCollection();
    if (!inbox) return [];
    return this.stateV3.places.filter((p) => p.collection_id === inbox.id);
  },

  /** Get places in the active collection. */
  getActivePlaces(): CapturePlace[] {
    const collection = this.getActiveCollection();
    if (!collection) return [];
    return this.stateV3.places.filter((p) => p.collection_id === collection.id);
  },

  /** Ensure a default collection exists. Returns it. — P0: Capture 无需 Trip */
  ensureDefaultCollection(): CaptureCollection {
    const ensured = ensureInboxCollection(this.stateV3);
    if (ensured !== this.stateV3) this.setState(ensured);
    const existing = this.getActiveCollection();
    if (existing) return existing;
    const now = new Date().toISOString();
    const collection: CaptureCollection = {
      id: `inbox-${Date.now()}`,
      title: DEFAULT_INBOX_TITLE,
      created_at: now,
    };
    this.setState({
      ...this.stateV3,
      collections: [...this.stateV3.collections, collection],
      active_collection_id: collection.id,
    });
    return collection;
  },

  /** Update a place in V3 state by id. */
  updatePlace(placeId: string, mutator: (p: CapturePlace) => CapturePlace) {
    this.setState({
      ...this.stateV3,
      places: this.stateV3.places.map((p) => p.id === placeId ? mutator(p) : p),
    });
  },

  /** Remove a place from V3 state by id. */
  removePlace(placeId: string) {
    this.setState({
      ...this.stateV3,
      places: this.stateV3.places.filter((p) => p.id !== placeId),
    });
  },

  /** Add a place to V3 state. */
  addPlace(place: CapturePlace) {
    this.setState({
      ...this.stateV3,
      places: [...this.stateV3.places.filter((p) => p.id !== place.id), place],
    });
  },

  /** Create a new collection with given title. Returns it and sets as active. */
  createCollection(title: string): CaptureCollection {
    const clean = title.trim();
    if (!clean) throw new Error('Collection title required');
    const existing = this.stateV3.collections.find((c) => c.title.toLocaleLowerCase() === clean.toLocaleLowerCase());
    if (existing) {
      this.setState({ ...this.stateV3, active_collection_id: existing.id });
      return existing;
    }
    const now = new Date().toISOString();
    const col: CaptureCollection = { id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: clean, created_at: now };
    this.setState({ ...this.stateV3, collections: [...this.stateV3.collections, col], active_collection_id: col.id });
    logger.info('Store', 'createCollection', { id: col.id, title: col.title });
    return col;
  },

  /** Set active collection by id. */
  setActiveCollection(id: string): boolean {
    if (!this.stateV3.collections.some((c) => c.id === id)) return false;
    this.setState({ ...this.stateV3, active_collection_id: id });
    logger.info('Store', 'setActiveCollection', { id });
    return true;
  },
};

export const DEBUG_STORAGE_KEY = 'ownlyDebugMode';

export function t() {
  return I18N[store.lang];
}

export function getActiveCollection(): CaptureCollection | null {
  return store.getActiveCollection();
}

export function getActivePlaces(): CapturePlace[] {
  return store.getActivePlaces();
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
  store.setState(fresh);
}

export function getExistingPlaceForUrl(sourceUrl: string, sourcePlaceId?: string): CapturePlace | undefined {
  const places = getActivePlaces();
  // First: strong identity check (Google Place ID, CID)
  const byIdentity = findExistingPlaceByIdentity(places, {
    source_provider: store.currentPlace?.sourceProvider,
    source_place_id: sourcePlaceId ?? store.currentPlace?.sourcePlaceId,
    source_url: sourceUrl,
  });
  if (byIdentity) return byIdentity;
  // Fallback: URL / place_id / coordinates
  return places.find(
    (p) =>
      p.source.url === sourceUrl ||
      (sourcePlaceId && p.source.place_id === sourcePlaceId) ||
      (store.currentPlace?.coordinates && p.coordinates &&
        p.coordinates.lat === store.currentPlace.coordinates.lat &&
        p.coordinates.lng === store.currentPlace.coordinates.lng),
  );
}

/** Save V3 state via worker. */
export async function saveState(): Promise<void> {
  const started = Date.now();
  const payload = { places: store.stateV3.places.length, collections: store.stateV3.collections.length, deleted: store.locallyDeletedIds.size };
  logger.debug('Store', 'saveState → worker', payload);
  try {
    const viaWorker = await saveCaptureStateV3ViaWorker(store.stateV3, store.locallyDeletedIds);
    store.setState(viaWorker.state);
    store.locallyDeletedIds.clear();
    logger.info('Store', 'saveState persisted', { ...payload, ms: Date.now() - started, afterPlaces: viaWorker.state.places.length });
  } catch (error) {
    logger.error('Store', 'Failed to persist capture state', { error: error instanceof Error ? error.stack || error.message : String(error), payload });
    console.warn('[Ownly Capture] Failed to persist capture state', error);
    throw error;
  }
}

/** Write V3 state directly (for restore). */
export async function writeState(next: OwnlyCaptureStateV3): Promise<void> {
  await writeCaptureStateV3(next);
  store.setState(next);
}
