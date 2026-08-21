import {
  EMPTY_CAPTURE_STATE,
  inferPlaceKind,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../domain/planner';
import type { CurrentResearchPlace } from './content';

const STORAGE_KEY = 'ownlyCaptureStateV1';

async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('[Ownly Capture] Could not configure side panel', error);
  }
}

async function quickCaptureCurrentPlace() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE' }) as { place?: CurrentResearchPlace | null };
    const place = response?.place;
    if (!place?.title || !place.sourceUrl) return;

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const state = (result[STORAGE_KEY] as OwnlyCaptureState) || { ...EMPTY_CAPTURE_STATE };
    if (!state.activeTripId) return;

    const placeKey = `${state.activeTripId}::${place.sourceUrl}`;
    const stableId = state.knownPlaceIds?.[placeKey] ?? crypto.randomUUID();
    const existing = state.pendingPlaces?.find((item) => item.id === stableId);
    const now = new Date().toISOString();
    const activeTrip = state.trips?.find((t) => t.id === state.activeTripId);

    const tripPlace: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: stableId,
      trip_id: state.activeTripId,
      title: place.title,
      source_provider: place.sourceProvider || 'google_maps',
      source_url: place.sourceUrl,
      kind: inferPlaceKind(place.category),
      area: place.address?.split(/[,，·]/)[0]?.trim() || undefined,
      priority: existing?.priority ?? 'want',
      tags: Array.from(new Set([...(activeTrip?.tags ?? []), ...(existing?.tags ?? [])])),
      why: existing?.why ?? place.summary,
      signals: existing?.signals ?? [],
      risks: existing?.risks ?? [],
      notes: existing?.notes,
      observed_rating: place.rating,
      observed_price: place.priceLevel,
      observed_at: now.slice(0, 10),
      reservation_status: existing?.reservation_status ?? 'none',
      state: existing?.state ?? 'candidate',
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    const pendingPlaces = state.pendingPlaces || [];
    const updatedPending = [...pendingPlaces.filter((item) => item.id !== tripPlace.id), tripPlace];
    const updatedKnown = { ...(state.knownPlaceIds || {}), [placeKey]: tripPlace.id };

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...state,
        pendingPlaces: updatedPending,
        knownPlaceIds: updatedKnown,
      },
    });

    if (tab.id) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: '✓' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#047857' });
      setTimeout(() => {
        if (tab.id) void chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      }, 2000);
    }
  } catch (error) {
    console.warn('[Ownly Capture] Quick capture error', error);
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-capture-place') {
    void quickCaptureCurrentPlace();
  }
});

chrome.runtime.onInstalled.addListener(() => { void configureSidePanel(); });
chrome.runtime.onStartup.addListener(() => { void configureSidePanel(); });
void configureSidePanel();
