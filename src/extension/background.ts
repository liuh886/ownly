import {
  acknowledgeCapturedPlaces,
  findExistingTripPlace,
  inferPlaceKind,
  placeIdentityKey,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../domain/planner';
import { CAPTURE_STORAGE_KEY, enqueueWrite, updateCaptureState } from './capture-state';
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
    const response = await chrome.tabs.sendMessage(tabId, { type: 'OWNLY_GET_CURRENT_PLACE' }) as { place?: CurrentResearchPlace | null };
    const place = response?.place;
    if (!place?.title || !place.sourceUrl) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }

    const capturedId = await updateCaptureState((state) => {
      if (!state.activeTripId) return { state, result: null };
      const tripId = state.activeTripId;
      const existing = findExistingTripPlace(state.knownPlaceIds, state.pendingPlaces, tripId, place.sourceUrl, place.sourcePlaceId);
      const stableId = existing?.id ?? crypto.randomUUID();
      const now = new Date().toISOString();
      const activeTrip = state.trips.find((trip) => trip.id === tripId);

      const tripPlace: PlannerTripPlace = {
        schema_version: '0.1',
        type: 'trip_place',
        id: stableId,
        trip_id: tripId,
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
          knownPlaceIds: { ...state.knownPlaceIds, [placeIdentityKey(tripId, place.sourceUrl)]: stableId },
          pendingPlaces: [...state.pendingPlaces.filter((item) => item.id !== stableId), tripPlace],
        },
        result: stableId,
      };
    });

    if (capturedId) {
      void flashBadge(tabId, '✓', '#047857');
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const type = (message as { type?: string }).type;

  if (type === 'CAPTURE_SAVE_STATE') {
    const state = (message as { state?: OwnlyCaptureState }).state;
    if (!state || typeof state !== 'object') {
      sendResponse({ ok: false, error: 'invalid state' });
      return true;
    }
    void enqueueWrite(() => chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: state }))
      .then(() => sendResponse({ ok: true }))
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
});

chrome.runtime.onInstalled.addListener(() => { void configureSidePanel(); });
chrome.runtime.onStartup.addListener(() => { void configureSidePanel(); });
void configureSidePanel();
