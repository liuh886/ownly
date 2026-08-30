import {
  EMPTY_CAPTURE_STATE,
  findExistingTripPlace,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../../domain/planner';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { readCaptureState } from '../capture-state';
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

export const store = {
  lang: detectDefaultLanguage(),
  state: { ...EMPTY_CAPTURE_STATE } as OwnlyCaptureState,
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
};

export function t() {
  return I18N[store.lang];
}

export async function loadState(): Promise<void> {
  const [langRes, fresh, tabs] = await Promise.all([
    chrome.storage.local.get(LANG_STORAGE_KEY),
    readCaptureState(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  const langVal = langRes[LANG_STORAGE_KEY];
  if (langVal === 'zh' || langVal === 'en') {
    store.lang = langVal;
  } else {
    store.lang = detectDefaultLanguage();
  }
  const tabId = tabs[0]?.id;
  if (typeof tabId === 'number') {
    const session = await sessionStorage.get(fxOverrideKey(tabId));
    const raw = session[fxOverrideKey(tabId)];
    if (typeof raw === 'string' && raw.trim()) store.mapCurrencyOverride = raw.trim().toUpperCase();
  }
  store.state = fresh;
}

export function getExistingPlaceForUrl(sourceUrl: string, sourcePlaceId?: string): PlannerTripPlace | undefined {
  const tripId = store.state.activeContext?.tripId;
  if (!tripId) return undefined;
  return findExistingTripPlace(store.state.pendingPlaces, tripId, sourceUrl, sourcePlaceId, store.currentPlace?.coordinates);
}
