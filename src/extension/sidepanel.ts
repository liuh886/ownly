import {
  EMPTY_CAPTURE_STATE,
  normalizeDelimitedText,
  type OwnlyCaptureState,
  type PlannerPlaceKind,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from '../domain/planner';

const STORAGE_KEY = 'ownlyCaptureStateV1';

type CurrentPlace = { title: string; sourceUrl: string };

type ElementMap = {
  tripSelect: HTMLSelectElement;
  tripForm: HTMLFormElement;
  tripTitle: HTMLInputElement;
  tripStart: HTMLInputElement;
  tripEnd: HTMLInputElement;
  tripDestinations: HTMLInputElement;
  tripCurrency: HTMLInputElement;
  tripTransport: HTMLSelectElement;
  placeTitle: HTMLElement;
  placeUrl: HTMLElement;
  refreshPlace: HTMLButtonElement;
  captureForm: HTMLFormElement;
  kind: HTMLSelectElement;
  priority: HTMLSelectElement;
  area: HTMLInputElement;
  duration: HTMLInputElement;
  window: HTMLInputElement;
  rating: HTMLInputElement;
  price: HTMLInputElement;
  why: HTMLTextAreaElement;
  signals: HTMLInputElement;
  risks: HTMLInputElement;
  notes: HTMLTextAreaElement;
  pending: HTMLElement;
  status: HTMLElement;
};

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing Ownly Capture element: ${id}`);
  return node as T;
}

const el: ElementMap = {
  tripSelect: required('tripSelect'),
  tripForm: required('tripForm'),
  tripTitle: required('tripTitle'),
  tripStart: required('tripStart'),
  tripEnd: required('tripEnd'),
  tripDestinations: required('tripDestinations'),
  tripCurrency: required('tripCurrency'),
  tripTransport: required('tripTransport'),
  placeTitle: required('placeTitle'),
  placeUrl: required('placeUrl'),
  refreshPlace: required('refreshPlace'),
  captureForm: required('captureForm'),
  kind: required('kind'),
  priority: required('priority'),
  area: required('area'),
  duration: required('duration'),
  window: required('window'),
  rating: required('rating'),
  price: required('price'),
  why: required('why'),
  signals: required('signals'),
  risks: required('risks'),
  notes: required('notes'),
  pending: required('pending'),
  status: required('status'),
};

let state: OwnlyCaptureState = { ...EMPTY_CAPTURE_STATE };
let currentPlace: CurrentPlace | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function setStatus(message: string, tone: 'muted' | 'success' | 'error' = 'muted') {
  el.status.textContent = message;
  el.status.dataset.tone = tone;
}

async function loadState(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY];
  if (value && typeof value === 'object') {
    const saved = value as Partial<OwnlyCaptureState>;
    state = {
      version: 1,
      trips: Array.isArray(saved.trips) ? saved.trips : [],
      activeTripId: typeof saved.activeTripId === 'string' ? saved.activeTripId : null,
      pendingPlaces: Array.isArray(saved.pendingPlaces) ? saved.pendingPlaces : [],
      knownPlaceIds: saved.knownPlaceIds && typeof saved.knownPlaceIds === 'object'
        ? saved.knownPlaceIds as Record<string, string>
        : {},
    };
  }
}

async function saveState(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  renderState();
}

function renderState() {
  el.tripSelect.innerHTML = '';
  if (state.trips.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Create a trip below';
    el.tripSelect.append(option);
  } else {
    for (const trip of state.trips) {
      const option = document.createElement('option');
      option.value = trip.id;
      option.textContent = trip.title;
      el.tripSelect.append(option);
    }
    const active = state.trips.some((trip) => trip.id === state.activeTripId)
      ? state.activeTripId
      : state.trips[0].id;
    state.activeTripId = active;
    el.tripSelect.value = active ?? '';
  }
  el.pending.textContent = `${state.pendingPlaces.length} pending`;
}

async function readCurrentPlace(): Promise<void> {
  setStatus('Reading current Google Maps place…');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    currentPlace = null;
    renderCurrentPlace();
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE' }) as { place?: CurrentPlace | null };
    currentPlace = response?.place ?? null;
  } catch {
    currentPlace = null;
  }
  renderCurrentPlace();
}

function renderCurrentPlace() {
  if (!currentPlace) {
    el.placeTitle.textContent = 'Open a place in Google Maps';
    el.placeUrl.textContent = 'Ownly Capture only saves a place after you choose it.';
    setStatus('No Google Maps place detected.');
    return;
  }
  el.placeTitle.textContent = currentPlace.title;
  el.placeUrl.textContent = currentPlace.sourceUrl;
  setStatus('Ready to capture.');
}

function createTripFromForm(): PlannerTrip | null {
  const title = el.tripTitle.value.trim();
  const start = el.tripStart.value;
  const end = el.tripEnd.value;
  if (!title || !start || !end || end < start) {
    setStatus('Trip title and a valid date range are required.', 'error');
    return null;
  }
  const now = new Date().toISOString();
  return {
    schema_version: '0.1',
    type: 'trip',
    id: crypto.randomUUID(),
    title,
    status: 'planning',
    start_date: start,
    end_date: end,
    destinations: normalizeDelimitedText(el.tripDestinations.value),
    currency: el.tripCurrency.value.trim() || undefined,
    transport_mode: el.tripTransport.value as PlannerTrip['transport_mode'],
    created_at: now,
    updated_at: now,
  };
}

el.tripForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const trip = createTripFromForm();
  if (!trip) return;
  state = { ...state, trips: [...state.trips, trip], activeTripId: trip.id };
  void saveState().then(() => {
    el.tripForm.reset();
    el.tripCurrency.value = 'CNY';
    el.tripTransport.value = 'transit';
    setStatus(`Active trip: ${trip.title}`, 'success');
  });
});

el.tripSelect.addEventListener('change', () => {
  state = { ...state, activeTripId: el.tripSelect.value || null };
  void saveState();
});

el.refreshPlace.addEventListener('click', () => { void readCurrentPlace(); });

el.captureForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.activeTripId) {
    setStatus('Create or select a trip first.', 'error');
    return;
  }
  if (!currentPlace) {
    setStatus('Open a Google Maps place first.', 'error');
    return;
  }

  const duration = Number(el.duration.value);
  const rating = Number(el.rating.value);
  const now = new Date().toISOString();
  const placeKey = `${state.activeTripId}::${currentPlace.sourceUrl}`;
  const stableId = state.knownPlaceIds[placeKey] ?? crypto.randomUUID();
  const existing = state.pendingPlaces.find((place) => place.id === stableId);
  const place: PlannerTripPlace = {
    schema_version: '0.1',
    type: 'trip_place',
    id: stableId,
    trip_id: state.activeTripId,
    title: currentPlace.title,
    source_provider: 'google_maps',
    source_url: currentPlace.sourceUrl,
    kind: el.kind.value as PlannerPlaceKind,
    area: el.area.value.trim() || undefined,
    priority: el.priority.value as PlannerPlacePriority,
    tags: [],
    why: el.why.value.trim() || undefined,
    signals: normalizeDelimitedText(el.signals.value),
    risks: normalizeDelimitedText(el.risks.value),
    notes: el.notes.value.trim() || undefined,
    observed_rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    observed_price: el.price.value.trim() || undefined,
    observed_at: today(),
    preferred_window: el.window.value.trim() || undefined,
    duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.min(1440, Math.round(duration)) : undefined,
    reservation_status: 'none',
    state: 'candidate',
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  state = {
    ...state,
    knownPlaceIds: { ...state.knownPlaceIds, [placeKey]: place.id },
    pendingPlaces: [...state.pendingPlaces.filter((item) => item.id !== place.id), place],
  };
  void saveState().then(() => {
    el.captureForm.reset();
    el.kind.value = 'attraction';
    el.priority.value = 'want';
    setStatus(existing ? 'Research candidate updated.' : 'Added to research pool.', 'success');
  });
});

void (async () => {
  await loadState();
  renderState();
  await readCurrentPlace();
})();
