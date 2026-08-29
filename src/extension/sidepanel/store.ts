import {
  EMPTY_CAPTURE_STATE,
  findExistingTripPlace,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../../domain/planner';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { readCaptureState } from '../capture-state';
import { I18N, type Lang } from '../i18n';

const LANG_STORAGE_KEY = 'ownlyCaptureLang';
export const MAP_CURRENCY_OVERRIDE_KEY = 'ownlyMapCurrencyOverride';
export const MAP_CURRENCY_OVERRIDE_ORIGIN_KEY = 'ownlyMapCurrencyOverrideOrigin';

export interface SavedListSummary {
  listId?: string;
  listName: string;
  count?: number;
  url?: string;
}

export const store = {
  lang: 'zh' as Lang,
  state: { ...EMPTY_CAPTURE_STATE } as OwnlyCaptureState,
  currentPlace: null as CurrentResearchPlace | null,
  detectedSavedList: null as DetectedSavedList | null,
  detectedListPlaces: [] as CurrentResearchPlace[],
  detectedAllLists: [] as SavedListSummary[],
  activeFilter: 'all',
  searchQuery: '',
  pageDetectedCurrency: undefined as string | undefined,
  /** Manual map-currency override picked in the selector; undefined = auto-detect. */
  mapCurrencyOverride: undefined as string | undefined,
  /** Origin/domain for which the manual override was selected. */
  mapCurrencyOverrideOrigin: undefined as string | undefined,
  /** Place ids deleted locally since last successful persist; guards merge-write resurrection. */
  locallyDeletedIds: new Set<string>(),
  userDismissedPlaceUrl: null as string | null,
  smartListDismissed: false,
  smartListKey: '' as string,
  editingCandidateId: null as string | null,
  isListPreviewOpen: false,
  bulkMode: false,
  bulkSelected: new Set<string>(),
};

export function t() {
  return I18N[store.lang];
}

export async function loadState(): Promise<void> {
  const [langRes, currRes, originRes, fresh] = await Promise.all([
    chrome.storage.local.get(LANG_STORAGE_KEY),
    chrome.storage.local.get(MAP_CURRENCY_OVERRIDE_KEY),
    chrome.storage.local.get(MAP_CURRENCY_OVERRIDE_ORIGIN_KEY),
    readCaptureState(),
  ]);
  const langVal = langRes[LANG_STORAGE_KEY];
  if (langVal === 'zh' || langVal === 'en') {
    store.lang = langVal;
  }
  const currVal = currRes[MAP_CURRENCY_OVERRIDE_KEY];
  if (typeof currVal === 'string' && currVal.trim().length > 0 && currVal !== 'AUTO') {
    store.mapCurrencyOverride = currVal.trim().toUpperCase();
  }
  const originVal = originRes[MAP_CURRENCY_OVERRIDE_ORIGIN_KEY];
  if (typeof originVal === 'string' && originVal.trim().length > 0) {
    store.mapCurrencyOverrideOrigin = originVal.trim();
  }
  store.state = fresh;
}

export function getExistingPlaceForUrl(sourceUrl: string, sourcePlaceId?: string): PlannerTripPlace | undefined {
  if (!store.state.activeTripId) return undefined;
  return findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, store.state.activeTripId, sourceUrl, sourcePlaceId);
}
