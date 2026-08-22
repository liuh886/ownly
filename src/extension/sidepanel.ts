import { resolveGoogleMapsListByUrl } from './api';
import { today } from './utils';
import {
  EMPTY_CAPTURE_STATE,
  checkOpeningHoursCollision,
  classifyResearchChip,
  inferPlaceKind,
  inferSourceProvider,
  listTripDates,
  normalizeDelimitedText,
  type OwnlyCaptureState,
  type PlannerPlaceKind,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from '../domain/planner';
import type { CurrentResearchPlace, DetectedSavedList } from './content';

const STORAGE_KEY = 'ownlyCaptureStateV1';
const LANG_STORAGE_KEY = 'ownlyCaptureLang';

import { I18N, type Lang } from './i18n';

const KIND_ICONS: Record<PlannerPlaceKind, string> = {
  attraction: '🏰',
  food: '🍜',
  cafe: '☕',
  stay: '🏨',
  shopping: '🛍️',
  transit: '🚇',
  experience: '🧗',
  other: '📍',
};

type ElementMap = {
  langToggle: HTMLButtonElement;
  topbarSubtitle: HTMLElement;
  lblActiveTrip: HTMLElement;
  btnDetectedCurrencyPill: HTMLButtonElement;
  tripSelect: HTMLSelectElement;
  editTripSection: HTMLElement;
  sumEditTrip: HTMLElement;
  editTripForm: HTMLFormElement;
  lblEditTripTitle: HTMLElement;
  editTripTitle: HTMLInputElement;
  lblEditTripStart: HTMLElement;
  editTripStart: HTMLInputElement;
  lblEditTripEnd: HTMLElement;
  editTripEnd: HTMLInputElement;
  lblEditTripDestinations: HTMLElement;
  editTripDestinations: HTMLInputElement;
  lblEditTripTags: HTMLElement;
  editTripTags: HTMLInputElement;
  lblEditTripCurrency: HTMLElement;
  editTripCurrency: HTMLInputElement;
  lblEditTripTransport: HTMLElement;
  editTripTransport: HTMLSelectElement;
  btnSaveTripEdit: HTMLButtonElement;
  btnDeleteTrip: HTMLButtonElement;
  createTripSection: HTMLElement;
  sumCreateTrip: HTMLElement;
  tripForm: HTMLFormElement;
  lblTripTitle: HTMLElement;
  tripTitle: HTMLInputElement;
  lblTripStart: HTMLElement;
  tripStart: HTMLInputElement;
  lblTripEnd: HTMLElement;
  tripEnd: HTMLInputElement;
  lblTripDestinations: HTMLElement;
  tripDestinations: HTMLInputElement;
  lblTripTags: HTMLElement;
  tripTags: HTMLInputElement;
  lblTripCurrency: HTMLElement;
  tripCurrency: HTMLInputElement;
  lblTripTransport: HTMLElement;
  tripTransport: HTMLSelectElement;
  btnCreateTrip: HTMLButtonElement;
  bulkImportSection: HTMLElement;
  sumBulkImport: HTMLElement;
  lblBulkText: HTMLElement;
  bulkInputText: HTMLTextAreaElement;
  btnParseBulkImport: HTMLButtonElement;
  savedListMatchBanner: HTMLElement;
  savedListCountBadge: HTMLElement;
  savedListNameTitle: HTMLElement;
  savedListMatchDesc: HTMLElement;
  btnSyncSavedListAll: HTMLButtonElement;
  batchSection: HTMLElement;
  sumBatchList: HTMLElement;
  batchListContainer: HTMLElement;
  btnToggleSelectAll: HTMLButtonElement;
  btnBatchAdd: HTMLButtonElement;
  lblCurrentPlace: HTMLElement;
  btnDismissPlace: HTMLButtonElement;
  placeTitle: HTMLElement;
  placeUrl: HTMLElement;
  placeCapturedBanner: HTMLElement;
  txtCapturedBanner: HTMLElement;
  placeMetaBadges: HTMLElement;
  refreshPlace: HTMLButtonElement;
  captureForm: HTMLFormElement;
  lblKind: HTMLElement;
  kind: HTMLSelectElement;
  lblPriority: HTMLElement;
  priority: HTMLSelectElement;
  lblArea: HTMLElement;
  area: HTMLInputElement;
  lblTags: HTMLElement;
  tags: HTMLInputElement;
  lblDuration: HTMLElement;
  duration: HTMLInputElement;
  lblWindow: HTMLElement;
  window: HTMLInputElement;
  lblRating: HTMLElement;
  rating: HTMLInputElement;
  lblPrice: HTMLElement;
  price: HTMLInputElement;
  lblQuickChips: HTMLElement;
  quickChips: HTMLElement;
  lblWhy: HTMLElement;
  why: HTMLTextAreaElement;
  lblSignals: HTMLElement;
  signals: HTMLInputElement;
  lblRisks: HTMLElement;
  risks: HTMLInputElement;
  lblNotes: HTMLElement;
  notes: HTMLTextAreaElement;
  btnCaptureSubmit: HTMLButtonElement;
  btnRemoveCandidate: HTMLButtonElement;
  candidatesDrawer: HTMLElement;
  sumCandidatesDrawer: HTMLElement;
  candidatesCountBadge: HTMLElement;
  candidatesSearch: HTMLInputElement;
  candidatesFilterBar: HTMLElement;
  candidatesListContainer: HTMLElement;
  pending: HTMLElement;
  status: HTMLElement;
};

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing Ownly Capture element: ${id}`);
  return node as T;
}

const el: ElementMap = {
  langToggle: required('langToggle'),
  topbarSubtitle: required('topbarSubtitle'),
  lblActiveTrip: required('lblActiveTrip'),
  btnDetectedCurrencyPill: required('btnDetectedCurrencyPill'),
  tripSelect: required('tripSelect'),
  editTripSection: required('editTripSection'),
  sumEditTrip: required('sumEditTrip'),
  editTripForm: required('editTripForm'),
  lblEditTripTitle: required('lblEditTripTitle'),
  editTripTitle: required('editTripTitle'),
  lblEditTripStart: required('lblEditTripStart'),
  editTripStart: required('editTripStart'),
  lblEditTripEnd: required('lblEditTripEnd'),
  editTripEnd: required('editTripEnd'),
  lblEditTripDestinations: required('lblEditTripDestinations'),
  editTripDestinations: required('editTripDestinations'),
  lblEditTripTags: required('lblEditTripTags'),
  editTripTags: required('editTripTags'),
  lblEditTripCurrency: required('lblEditTripCurrency'),
  editTripCurrency: required('editTripCurrency'),
  lblEditTripTransport: required('lblEditTripTransport'),
  editTripTransport: required('editTripTransport'),
  btnSaveTripEdit: required('btnSaveTripEdit'),
  btnDeleteTrip: required('btnDeleteTrip'),
  createTripSection: required('createTripSection'),
  sumCreateTrip: required('sumCreateTrip'),
  tripForm: required('tripForm'),
  lblTripTitle: required('lblTripTitle'),
  tripTitle: required('tripTitle'),
  lblTripStart: required('lblTripStart'),
  tripStart: required('tripStart'),
  lblTripEnd: required('lblTripEnd'),
  tripEnd: required('tripEnd'),
  lblTripDestinations: required('lblTripDestinations'),
  tripDestinations: required('tripDestinations'),
  lblTripTags: required('lblTripTags'),
  tripTags: required('tripTags'),
  lblTripCurrency: required('lblTripCurrency'),
  tripCurrency: required('tripCurrency'),
  lblTripTransport: required('lblTripTransport'),
  tripTransport: required('tripTransport'),
  btnCreateTrip: required('btnCreateTrip'),
  bulkImportSection: required('bulkImportSection'),
  sumBulkImport: required('sumBulkImport'),
  lblBulkText: required('lblBulkText'),
  bulkInputText: required('bulkInputText'),
  btnParseBulkImport: required('btnParseBulkImport'),
  savedListMatchBanner: required('savedListMatchBanner'),
  savedListCountBadge: required('savedListCountBadge'),
  savedListNameTitle: required('savedListNameTitle'),
  savedListMatchDesc: required('savedListMatchDesc'),
  btnSyncSavedListAll: required('btnSyncSavedListAll'),
  batchSection: required('batchSection'),
  sumBatchList: required('sumBatchList'),
  batchListContainer: required('batchListContainer'),
  btnToggleSelectAll: required('btnToggleSelectAll'),
  btnBatchAdd: required('btnBatchAdd'),
  lblCurrentPlace: required('lblCurrentPlace'),
  btnDismissPlace: required('btnDismissPlace'),
  placeTitle: required('placeTitle'),
  placeUrl: required('placeUrl'),
  placeCapturedBanner: required('placeCapturedBanner'),
  txtCapturedBanner: required('txtCapturedBanner'),
  placeMetaBadges: required('placeMetaBadges'),
  refreshPlace: required('refreshPlace'),
  captureForm: required('captureForm'),
  lblKind: required('lblKind'),
  kind: required('kind'),
  lblPriority: required('lblPriority'),
  priority: required('priority'),
  lblArea: required('lblArea'),
  area: required('area'),
  lblTags: required('lblTags'),
  tags: required('tags'),
  lblDuration: required('lblDuration'),
  duration: required('duration'),
  lblWindow: required('lblWindow'),
  window: required('window'),
  lblRating: required('lblRating'),
  rating: required('rating'),
  lblPrice: required('lblPrice'),
  price: required('price'),
  lblQuickChips: required('lblQuickChips'),
  quickChips: required('quickChips'),
  lblWhy: required('lblWhy'),
  why: required('why'),
  lblSignals: required('lblSignals'),
  signals: required('signals'),
  lblRisks: required('lblRisks'),
  risks: required('risks'),
  lblNotes: required('lblNotes'),
  notes: required('notes'),
  btnCaptureSubmit: required('btnCaptureSubmit'),
  btnRemoveCandidate: required('btnRemoveCandidate'),
  candidatesDrawer: required('candidatesDrawer'),
  sumCandidatesDrawer: required('sumCandidatesDrawer'),
  candidatesCountBadge: required('candidatesCountBadge'),
  candidatesSearch: required('candidatesSearch'),
  candidatesFilterBar: required('candidatesFilterBar'),
  candidatesListContainer: required('candidatesListContainer'),
  pending: required('pending'),
  status: required('status'),
};

let currentLang: Lang = 'zh';
let state: OwnlyCaptureState = { ...EMPTY_CAPTURE_STATE };
let currentPlace: CurrentResearchPlace | null = null;
let detectedSavedList: DetectedSavedList | null = null;
let detectedListPlaces: CurrentResearchPlace[] = [];
let activeFilter = 'all';
let searchQuery = '';
let pageDetectedCurrency: string | undefined = undefined;
let userDismissedPlaceUrl: string | null = null;

el.btnDismissPlace.addEventListener('click', () => {
  if (currentPlace) {
    userDismissedPlaceUrl = currentPlace.sourceUrl;
    currentPlace = null;
    renderCurrentPlace();
    renderSavedListMatch();
    renderBatchList();
  }
});

function t() {
  return I18N[currentLang];
}


function setStatus(message: string, tone: 'muted' | 'success' | 'error' = 'muted') {
  el.status.textContent = message;
  el.status.dataset.tone = tone;
}

function applyI18n() {
  const dict = t();
  el.langToggle.textContent = currentLang === 'zh' ? 'EN' : '中文';
  el.topbarSubtitle.textContent = dict.subtitle;
  el.lblActiveTrip.textContent = dict.activeTrip;
  el.sumCreateTrip.textContent = dict.createTripSummary;
  el.sumEditTrip.textContent = dict.editTripSummary;

  el.lblTripTitle.childNodes[0].nodeValue = dict.tripTitleLabel;
  el.tripTitle.placeholder = dict.tripTitlePlaceholder;
  el.lblTripStart.childNodes[0].nodeValue = dict.tripStartLabel;
  el.lblTripEnd.childNodes[0].nodeValue = dict.tripEndLabel;
  el.lblTripDestinations.childNodes[0].nodeValue = dict.tripDestinationsLabel;
  el.tripDestinations.placeholder = dict.tripDestinationsPlaceholder;
  el.lblTripTags.childNodes[0].nodeValue = dict.tripTagsLabel;
  el.tripTags.placeholder = dict.tripTagsPlaceholder;
  el.lblTripCurrency.childNodes[0].nodeValue = dict.tripCurrencyLabel;
  el.lblTripTransport.childNodes[0].nodeValue = dict.tripTransportLabel;
  el.btnCreateTrip.textContent = dict.btnCreateTrip;

  el.lblEditTripTitle.childNodes[0].nodeValue = dict.tripTitleLabel;
  el.editTripTitle.placeholder = dict.tripTitlePlaceholder;
  el.lblEditTripStart.childNodes[0].nodeValue = dict.tripStartLabel;
  el.lblEditTripEnd.childNodes[0].nodeValue = dict.tripEndLabel;
  el.lblEditTripDestinations.childNodes[0].nodeValue = dict.tripDestinationsLabel;
  el.editTripDestinations.placeholder = dict.tripDestinationsPlaceholder;
  el.lblEditTripTags.childNodes[0].nodeValue = dict.tripTagsLabel;
  el.editTripTags.placeholder = dict.tripTagsPlaceholder;
  el.lblEditTripCurrency.childNodes[0].nodeValue = dict.tripCurrencyLabel;
  el.lblEditTripTransport.childNodes[0].nodeValue = dict.tripTransportLabel;
  el.btnSaveTripEdit.textContent = dict.btnSaveTripEdit;
  el.btnDeleteTrip.textContent = dict.btnDeleteTrip;

  el.sumBulkImport.textContent = dict.sumBulkImport;
  el.lblBulkText.childNodes[0].nodeValue = dict.lblBulkText;
  el.bulkInputText.placeholder = dict.bulkPlaceholder;
  el.btnParseBulkImport.textContent = dict.btnParseBulkImport;

  el.btnToggleSelectAll.textContent = dict.btnSelectAll;
  el.btnBatchAdd.textContent = dict.btnBatchAdd;

  el.lblCurrentPlace.textContent = dict.currentPlaceLabel;
  el.refreshPlace.textContent = dict.refreshBtn;
  el.txtCapturedBanner.textContent = dict.capturedBanner;

  el.lblKind.childNodes[0].nodeValue = dict.kindLabel;
  for (const opt of Array.from(el.kind.options)) {
    const val = opt.value as PlannerPlaceKind;
    if (dict.kinds[val]) opt.textContent = dict.kinds[val];
  }

  el.lblPriority.childNodes[0].nodeValue = dict.priorityLabel;
  for (const opt of Array.from(el.priority.options)) {
    const val = opt.value as PlannerPlacePriority;
    if (dict.priorities[val]) opt.textContent = dict.priorities[val];
  }

  for (const opt of Array.from(el.tripTransport.options)) {
    const val = opt.value as keyof typeof dict.transport;
    if (dict.transport[val]) opt.textContent = dict.transport[val];
  }

  for (const opt of Array.from(el.editTripTransport.options)) {
    const val = opt.value as keyof typeof dict.transport;
    if (dict.transport[val]) opt.textContent = dict.transport[val];
  }

  el.lblArea.childNodes[0].nodeValue = dict.areaLabel;
  el.area.placeholder = dict.areaPlaceholder;
  el.lblTags.childNodes[0].nodeValue = dict.tagsLabel;
  el.tags.placeholder = dict.tagsPlaceholder;
  el.lblDuration.childNodes[0].nodeValue = dict.durationLabel;
  el.duration.placeholder = dict.durationPlaceholder;
  el.lblWindow.childNodes[0].nodeValue = dict.windowLabel;
  el.window.placeholder = dict.windowPlaceholder;
  el.lblRating.childNodes[0].nodeValue = dict.ratingLabel;
  el.rating.placeholder = dict.ratingPlaceholder;
  el.lblPrice.childNodes[0].nodeValue = dict.priceLabel;
  el.price.placeholder = dict.pricePlaceholder;
  el.lblQuickChips.textContent = dict.quickChipsLabel;

  el.lblWhy.childNodes[0].nodeValue = dict.whyLabel;
  el.why.placeholder = dict.whyPlaceholder;
  el.lblSignals.childNodes[0].nodeValue = dict.signalsLabel;
  el.signals.placeholder = dict.signalsPlaceholder;
  el.lblRisks.childNodes[0].nodeValue = dict.risksLabel;
  el.risks.placeholder = dict.risksPlaceholder;
  el.lblNotes.childNodes[0].nodeValue = dict.notesLabel;
  el.notes.placeholder = dict.notesPlaceholder;
  el.btnRemoveCandidate.textContent = dict.btnRemoveCandidate;

  el.sumCandidatesDrawer.textContent = dict.drawerTitle;
  el.candidatesSearch.placeholder = dict.searchPlaceholder;

  renderChips();
  renderFilters();
  renderState();
  renderCurrentPlace();
  renderSavedListMatch();
  renderCandidatesList();
}

function renderChips() {
  const dict = t();
  el.quickChips.innerHTML = '';

  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  const customTags = activeTrip?.tags || [];

  // Render custom trip sub-tags first (e.g. 曼谷, 清迈, 普吉)
  for (const tag of customTags) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.style.borderColor = '#6ee7b7';
    btn.style.background = '#ecfdf5';
    btn.style.color = '#047857';
    btn.style.fontWeight = '600';
    btn.textContent = `🏷️ + ${tag}`;
    btn.addEventListener('click', () => {
      const existing = normalizeDelimitedText(el.tags.value);
      if (!existing.includes(tag)) {
        el.tags.value = [...existing, tag].join(', ');
      }
    });
    el.quickChips.append(btn);
  }

  for (const chip of dict.chips) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = `+ ${chip}`;
    btn.addEventListener('click', () => {
      const isRisk = classifyResearchChip(chip) === 'risk';
      const targetInput = isRisk ? el.risks : el.signals;
      const existing = normalizeDelimitedText(targetInput.value);
      if (!existing.includes(chip)) {
        targetInput.value = [...existing, chip].join(', ');
      }
    });
    el.quickChips.append(btn);
  }
}

function renderFilters() {
  const dict = t();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  const tripPlaces = state.pendingPlaces.filter((p) => p.trip_id === state.activeTripId);

  const filters: { id: string; label: string }[] = [
    { id: 'all', label: dict.allFilter },
    { id: 'must', label: dict.mustFilter },
    { id: 'want', label: dict.wantFilter },
    { id: 'food', label: dict.foodFilter },
    { id: 'attraction', label: dict.attractionFilter },
    { id: 'stay', label: dict.stayFilter },
  ];

  // Dynamically add trip tags and place tags as filter chips (e.g. 曼谷, 清迈, 普吉)
  const allTags = Array.from(new Set([...(activeTrip?.tags || []), ...tripPlaces.flatMap((p) => p.tags)])).filter(Boolean);
  for (const tag of allTags) {
    filters.push({ id: `tag:${tag}`, label: `🏷️ ${tag}` });
  }

  el.candidatesFilterBar.innerHTML = '';
  for (const item of filters) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-btn ${activeFilter === item.id ? 'active' : ''}`;
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      activeFilter = item.id;
      renderFilters();
      renderCandidatesList();
    });
    el.candidatesFilterBar.append(btn);
  }
}

async function loadState(): Promise<void> {
  const result = await chrome.storage.local.get([STORAGE_KEY, LANG_STORAGE_KEY]);
  const langVal = result[LANG_STORAGE_KEY];
  if (langVal === 'zh' || langVal === 'en') {
    currentLang = langVal;
  }
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
  renderCurrentPlace();
  renderSavedListMatch();
  renderCandidatesList();
}

function populateEditTripForm() {
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  if (!activeTrip) {
    el.editTripSection.style.display = 'none';
    return;
  }
  el.editTripSection.style.display = 'block';
  el.editTripTitle.value = activeTrip.title;
  el.editTripStart.value = activeTrip.start_date;
  el.editTripEnd.value = activeTrip.end_date;
  el.editTripDestinations.value = activeTrip.destinations?.join(', ') || '';
  el.editTripTags.value = activeTrip.tags?.join(', ') || '';
  el.editTripCurrency.value = activeTrip.currency || pageDetectedCurrency || 'CNY';
  el.editTripTransport.value = activeTrip.transport_mode || 'transit';
}

function renderState() {
  const dict = t();
  el.tripSelect.innerHTML = '';
  if (state.trips.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = dict.noTripOption;
    el.tripSelect.append(option);
    el.editTripSection.style.display = 'none';
  } else {
    for (const trip of state.trips) {
      const option = document.createElement('option');
      option.value = trip.id;
      const currencyBadge = trip.currency ? ` [${trip.currency}]` : '';
      option.textContent = trip.tags?.length ? `${trip.title} (${trip.tags.join(', ')})${currencyBadge}` : `${trip.title}${currencyBadge}`;
      el.tripSelect.append(option);
    }
    const active = state.trips.some((trip) => trip.id === state.activeTripId)
      ? state.activeTripId
      : state.trips[0].id;
    state.activeTripId = active;
    el.tripSelect.value = active ?? '';
    populateEditTripForm();
  }
  el.pending.textContent = `${state.pendingPlaces.length} ${dict.pendingSuffix}`;
}

async function readCurrentPlace(): Promise<void> {
  setStatus(t().readingStatus);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    currentPlace = null;
    detectedSavedList = null;
    detectedListPlaces = [];
    pageDetectedCurrency = undefined;
    renderCurrentPlace();
    renderSavedListMatch();
    renderBatchList();
    renderCurrencyPill();
    return;
  }

  type PlaceMessageResponse = {
    place?: CurrentResearchPlace | null;
    savedList?: DetectedSavedList | null;
    allLists?: Array<{ listId?: string; listName: string; count?: number; url?: string }>;
  };
  type ListMessageResponse = {
    listPlaces?: CurrentResearchPlace[];
  };

  let placeResp: PlaceMessageResponse | null = null;
  let listResp: ListMessageResponse | null = null;

  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  const targetTags = (activeTrip?.tags || []).filter(Boolean);

  try {
    placeResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE', targetTags })) as PlaceMessageResponse;
    listResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_VISIBLE_LIST_PLACES' })) as ListMessageResponse;
  } catch {
    // If message failed (e.g. content script was disconnected after extension reload), dynamically inject it
    try {
      const scripting = (chrome as unknown as { scripting?: { executeScript: (opts: unknown) => Promise<unknown> } }).scripting;
      if (scripting && tab.id) {
        await scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        await new Promise((r) => setTimeout(r, 150));
        placeResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE', targetTags })) as PlaceMessageResponse;
        listResp = (await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_VISIBLE_LIST_PLACES' })) as ListMessageResponse;
      }
    } catch (err) {
      console.warn('Could not inject content script:', err);
    }
  }

  if (placeResp?.place && placeResp.place.sourceUrl !== userDismissedPlaceUrl) {
    currentPlace = placeResp.place;
  } else {
    currentPlace = null;
  }
  detectedSavedList = placeResp?.savedList ?? null;
  detectedAllLists = Array.isArray(placeResp?.allLists) ? placeResp.allLists : [];

  // If no single savedList was directly detected, but we have lists in detectedAllLists, try to fetch matching or first list
  if ((!detectedSavedList || detectedSavedList.places.length === 0) && detectedAllLists.length > 0 && tab.id) {
    const tripTags = (activeTrip?.tags || []).map((t) => t.trim().toLowerCase());
    const tripTitle = (activeTrip?.title || '').trim().toLowerCase();

    const targetList = detectedAllLists.find((l) => {
      const name = l.listName.toLowerCase();
      return tripTags.some((t) => t && (name === t || name.includes(t) || t.includes(name)))
        || (tripTitle && (name.includes(tripTitle) || tripTitle.includes(name)));
    }) || (detectedAllLists.length === 1 ? detectedAllLists[0] : undefined);

    if (targetList?.listId) {
      try {
        const fetched = (await chrome.tabs.sendMessage(tab.id, {
          type: 'OWNLY_FETCH_LIST_BY_ID',
          listId: targetList.listId,
        })) as { savedList?: DetectedSavedList | null };
        if (fetched?.savedList && fetched.savedList.places.length > 0) {
          detectedSavedList = fetched.savedList;
        }
      } catch {}
    }
  }

  const directListPlaces = Array.isArray(listResp?.listPlaces) ? listResp.listPlaces : [];
  detectedListPlaces = (detectedSavedList?.places && detectedSavedList.places.length > 0)
    ? detectedSavedList.places
    : directListPlaces;
  pageDetectedCurrency = currentPlace?.detectedCurrency || detectedSavedList?.detectedCurrency;

  renderCurrentPlace();
  renderSavedListMatch();
  renderBatchList();
  renderCurrencyPill();
  if (currentPlace) {
    autoFillPlaceForm(currentPlace);
  }
}

function renderCurrencyPill() {
  const dict = t();
  if (pageDetectedCurrency) {
    el.btnDetectedCurrencyPill.style.display = 'inline-block';
    el.btnDetectedCurrencyPill.textContent = dict.detectedCurrencyPill(pageDetectedCurrency);

    // If active trip has no currency set or is default CNY and we are browsing THB/JPY, offer suggestion
    if (!el.tripCurrency.value || el.tripCurrency.value === 'CNY') {
      el.tripCurrency.value = pageDetectedCurrency;
    }
  } else {
    el.btnDetectedCurrencyPill.style.display = 'none';
  }
}

let detectedAllLists: Array<{ listId?: string; listName: string; count?: number; url?: string }> = [];

function renderSavedListMatch() {
  const dict = t();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);

  if ((!detectedSavedList || detectedSavedList.places.length === 0) && detectedAllLists.length > 0) {
    el.savedListMatchBanner.style.display = 'block';
    el.savedListNameTitle.textContent = `检测到 ${detectedAllLists.length} 个收藏列表`;
    el.savedListCountBadge.textContent = '点击载入';
    el.savedListMatchDesc.innerHTML = '页面中发现以下收藏列表，请点击要导入的列表：<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">' +
      detectedAllLists.map((l) => `<button type="button" class="btn-list-chip" data-list-id="${l.listId || ''}" style="padding:4px 8px; font-size:11px; background:#fff; border:1px solid #10b981; color:#065f46; border-radius:12px; cursor:pointer;">📁 ${l.listName}${l.count ? ` (${l.count})` : ''}</button>`).join('') +
      '</div>';
    el.btnSyncSavedListAll.style.display = 'none';

    // Add click listeners to list chips
    const chips = el.savedListMatchDesc.querySelectorAll<HTMLButtonElement>('.btn-list-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const listId = chip.dataset.listId;
        if (listId) {
          setStatus('正在获取列表地点…');
          void chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
            if (activeTab?.id) {
              void (chrome.tabs.sendMessage(activeTab.id, { type: 'OWNLY_FETCH_LIST_BY_ID', listId }) as Promise<{ savedList?: DetectedSavedList | null }>).then((resp) => {
                if (resp?.savedList) {
                  detectedSavedList = resp.savedList;
                  renderSavedListMatch();
                  renderBatchList();
                  setStatus(`已载入「${resp.savedList.listName}」（${resp.savedList.places.length} 个地点）`, 'success');
                }
              });
            }
          });
        }
      });
    });
    return;
  }

  if (!detectedSavedList || detectedSavedList.places.length === 0) {
    el.savedListMatchBanner.style.display = 'none';
    return;
  }

  el.btnSyncSavedListAll.style.display = 'block';
  el.savedListMatchBanner.style.display = 'block';
  el.savedListNameTitle.textContent = detectedSavedList.listName;
  el.savedListCountBadge.textContent = `${detectedSavedList.places.length} 个地点`;

  if (activeTrip) {
    const listNameNorm = detectedSavedList.listName.trim().toLowerCase();
    const tripTags = (activeTrip.tags || []).map((t) => t.trim().toLowerCase());
    const tripTitleNorm = activeTrip.title.trim().toLowerCase();
    const savedListNameNorm = (activeTrip.saved_list_name || '').trim().toLowerCase();

    // Match condition: list name is in tags (e.g. 'th26'), or tag is in list name, or title matches
    const isMatched =
      tripTags.includes(listNameNorm) ||
      tripTags.some((tag) => tag && (listNameNorm.includes(tag) || tag.includes(listNameNorm))) ||
      listNameNorm === savedListNameNorm ||
      listNameNorm.includes(tripTitleNorm) ||
      tripTitleNorm.includes(listNameNorm);

    el.savedListMatchDesc.textContent = isMatched
      ? dict.savedListMatchDesc(detectedSavedList.listName, activeTrip.title)
      : `Google 收藏列表「${detectedSavedList.listName}」包含 ${detectedSavedList.places.length} 个地点，可一键导入至当前行程「${activeTrip.title}」`;
    el.btnSyncSavedListAll.textContent = dict.btnSyncSavedListAll(detectedSavedList.listName, detectedSavedList.places.length);
  } else {
    el.savedListMatchDesc.textContent = `检测到 Google 收藏列表「${detectedSavedList.listName}」（${detectedSavedList.places.length} 个地点），请先在上方创建行程即可一键导入！`;
    el.btnSyncSavedListAll.textContent = `⚡ 导入全部 ${detectedSavedList.places.length} 个地点`;
  }
}

function renderBatchList() {
  const dict = t();
  const places = (detectedSavedList?.places && detectedSavedList.places.length > 0)
    ? detectedSavedList.places
    : detectedListPlaces;

  if (places.length === 0) {
    el.batchSection.style.display = 'none';
    return;
  }

  el.batchSection.style.display = 'block';
  el.batchSection.setAttribute('open', '');
  el.sumBatchList.textContent = dict.batchSummary(places.length);
  el.batchListContainer.innerHTML = '';

  for (const item of places) {
    const row = document.createElement('div');
    row.className = 'batch-item';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = true;
    chk.dataset.url = item.sourceUrl;

    const info = document.createElement('div');
    info.className = 'batch-item-info';
    const sub = [item.category, item.rating ? `★ ${item.rating}` : '', item.userNote ? `📝 ${item.userNote}` : ''].filter(Boolean).join(' · ');
    info.innerHTML = `<div class="batch-item-title">${item.title}</div><div class="batch-item-sub">${sub}</div>`;

    row.append(chk, info);
    el.batchListContainer.append(row);
  }
}

function autoFillPlaceForm(place: CurrentResearchPlace) {
  const existing = getExistingPlaceForUrl(place.sourceUrl);
  if (existing) {
    el.kind.value = existing.kind;
    el.priority.value = existing.priority;
    el.area.value = existing.area || '';
    el.tags.value = existing.tags?.join(', ') || '';
    el.duration.value = existing.duration_minutes ? String(existing.duration_minutes) : '';
    el.window.value = existing.preferred_window || '';
    el.rating.value = existing.observed_rating ? String(existing.observed_rating) : (place.rating ? String(place.rating) : '');
    el.price.value = existing.observed_price || place.priceLevel || '';
    el.why.value = existing.why || place.summary || '';
    el.signals.value = existing.signals?.join(', ') || '';
    el.risks.value = existing.risks?.join(', ') || '';
    el.notes.value = existing.notes || '';
    return;
  }

  if (place.rating) {
    el.rating.value = String(place.rating);
  }
  if (place.priceLevel) {
    el.price.value = place.priceLevel;
  } else if (place.detectedCurrency) {
    el.price.placeholder = `${place.detectedCurrency} 价格预算`;
  }
  if (place.category) {
    el.kind.value = inferPlaceKind(place.category);
  }
  if (place.address && !el.area.value) {
    const parts = place.address.split(/[,，·]/).map((p) => p.trim()).filter(Boolean);
    el.area.value = parts[0] || place.address;
  }
  if ((place.userNote || place.summary) && !el.why.value) {
    el.why.value = place.userNote || place.summary || '';
  }
  if (place.userNote && !el.notes.value) {
    el.notes.value = place.userNote;
  }
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  if (activeTrip?.tags?.length && !el.tags.value) {
    el.tags.value = activeTrip.tags.join(', ');
  }
}

function getExistingPlaceForUrl(sourceUrl: string): PlannerTripPlace | undefined {
  if (!state.activeTripId) return undefined;
  const placeKey = `${state.activeTripId}::${sourceUrl}`;
  const stableId = state.knownPlaceIds[placeKey];
  return state.pendingPlaces.find((p) => p.id === stableId || p.source_url === sourceUrl);
}

function renderCurrentPlace() {
  const dict = t();
  el.placeMetaBadges.innerHTML = '';
  if (!currentPlace) {
    if (detectedSavedList && detectedSavedList.places.length > 0) {
      el.placeTitle.textContent = `📋 正在浏览列表：「${detectedSavedList.listName}」`;
      el.placeUrl.textContent = `已自动提取当前列表全部 ${detectedSavedList.places.length} 个地点，请在上方点击一键同步或在下方批量列表中查看。`;
      el.captureForm.style.display = 'none';
      setStatus(currentLang === 'zh' ? `已感知列表（共 ${detectedSavedList.places.length} 个地点）` : `List detected (${detectedSavedList.places.length} places)`);
    } else {
      el.placeTitle.textContent = dict.noPlaceTitle;
      el.placeUrl.textContent = dict.noPlaceUrl;
      el.captureForm.style.display = 'block';
      setStatus(dict.noPlaceStatus);
    }
    el.placeCapturedBanner.style.display = 'none';
    el.btnCaptureSubmit.textContent = dict.btnAddCandidate;
    el.btnRemoveCandidate.style.display = 'none';
    return;
  }
  el.captureForm.style.display = 'block';
  el.placeTitle.textContent = currentPlace.title;
  el.placeUrl.textContent = currentPlace.sourceUrl;

  const existing = getExistingPlaceForUrl(currentPlace.sourceUrl);
  if (existing) {
    el.placeCapturedBanner.style.display = 'flex';
    el.btnCaptureSubmit.textContent = dict.btnUpdateCandidate;
    el.btnRemoveCandidate.style.display = 'inline-block';
  } else {
    el.placeCapturedBanner.style.display = 'none';
    el.btnCaptureSubmit.textContent = dict.btnAddCandidate;
    el.btnRemoveCandidate.style.display = 'none';
  }

  if (currentPlace.rating) {
    const b = document.createElement('span');
    b.className = 'badge highlight';
    b.textContent = `★ ${currentPlace.rating}${currentPlace.reviewCount ? ` (${currentPlace.reviewCount.toLocaleString()})` : ''}`;
    el.placeMetaBadges.append(b);
  }
  if (currentPlace.category) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `🏷️ ${currentPlace.category}`;
    el.placeMetaBadges.append(b);
  }
  if (currentPlace.priceLevel) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `💰 ${currentPlace.priceLevel}`;
    el.placeMetaBadges.append(b);
  } else if (currentPlace.detectedCurrency) {
    const b = document.createElement('span');
    b.className = 'badge highlight';
    b.textContent = `💱 ${currentPlace.detectedCurrency}`;
    el.placeMetaBadges.append(b);
  }
  if (currentPlace.openStatus) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `⏰ ${currentPlace.openStatus}`;
    el.placeMetaBadges.append(b);
  }
  if (currentPlace.address) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `📍 ${currentPlace.address.slice(0, 30)}`;
    el.placeMetaBadges.append(b);
  }

  setStatus(dict.readyToCapture);
}

function renderCandidatesList() {
  const dict = t();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  const tripDays = activeTrip ? listTripDates(activeTrip.start_date, activeTrip.end_date) : [];

  let candidates = state.pendingPlaces.filter((p) => p.trip_id === state.activeTripId);
  el.candidatesCountBadge.textContent = String(candidates.length);

  if (activeFilter === 'must') candidates = candidates.filter((p) => p.priority === 'must');
  if (activeFilter === 'want') candidates = candidates.filter((p) => p.priority === 'want');
  if (activeFilter === 'food') candidates = candidates.filter((p) => p.kind === 'food' || p.kind === 'cafe');
  if (activeFilter === 'attraction') candidates = candidates.filter((p) => p.kind === 'attraction');
  if (activeFilter === 'stay') candidates = candidates.filter((p) => p.kind === 'stay');
  if (activeFilter.startsWith('tag:')) {
    const filterTag = activeFilter.slice(4).trim().toLowerCase();
    candidates = candidates.filter((p) => p.tags.some((t) => t.trim().toLowerCase() === filterTag));
  }

  if (searchQuery.trim()) {
    const query = searchQuery.trim().toLowerCase();
    candidates = candidates.filter((p) =>
      p.title.toLowerCase().includes(query) ||
      p.area?.toLowerCase().includes(query) ||
      p.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  el.candidatesListContainer.innerHTML = '';
  if (candidates.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#a8a29e';
    empty.style.fontSize = '11px';
    empty.style.padding = '8px 4px';
    empty.textContent = dict.emptyCandidates;
    el.candidatesListContainer.append(empty);
    return;
  }

  for (const place of candidates) {
    const card = document.createElement('div');
    card.className = 'candidate-card';

    const header = document.createElement('div');
    header.className = 'candidate-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'candidate-title';
    titleEl.textContent = `${KIND_ICONS[place.kind] || '📍'} ${place.title}`;

    const priorityBadge = document.createElement('span');
    priorityBadge.className = `badge ${place.priority}`;
    priorityBadge.textContent = dict.priorities[place.priority] || place.priority;

    header.append(titleEl, priorityBadge);

    const details = document.createElement('div');
    details.className = 'candidate-details';
    if (place.area) details.innerHTML += `<span>📍 ${place.area}</span>`;
    if (place.observed_rating) details.innerHTML += `<span>★ ${place.observed_rating}</span>`;
    if (place.observed_price) details.innerHTML += `<span>💰 ${place.observed_price}</span>`;
    if (place.duration_minutes) details.innerHTML += `<span>⏱️ ${place.duration_minutes}m</span>`;
    if (place.tags.length) details.innerHTML += `<span>🏷️ ${place.tags.join(', ')}</span>`;
    if (place.scheduled_date && place.open_hours) {
      const col = checkOpeningHoursCollision(place.open_hours, place.scheduled_date);
      if (col.isCollision) {
        details.innerHTML += `<span style="color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:1px 5px;font-weight:600;">⚠️ ${col.reason}</span>`;
      }
    }

    const actions = document.createElement('div');
    actions.className = 'candidate-actions';

    const daySelect = document.createElement('select');
    daySelect.className = 'day-select';
    const optPool = document.createElement('option');
    optPool.value = '';
    optPool.textContent = dict.unassignedDay;
    daySelect.append(optPool);

    tripDays.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = dict.dayOption(idx + 1, d.slice(5));
      daySelect.append(opt);
    });
    daySelect.value = place.scheduled_date || '';

    daySelect.addEventListener('change', () => {
      const selectedDate = daySelect.value;
      const updatedPlaces = state.pendingPlaces.map((p) => {
        if (p.id !== place.id) return p;
        return {
          ...p,
          scheduled_date: selectedDate || undefined,
          state: selectedDate ? ('scheduled' as const) : ('candidate' as const),
          updated_at: new Date().toISOString(),
        };
      });
      state = { ...state, pendingPlaces: updatedPlaces };
      void saveState();
    });

    const btnGroup = document.createElement('div');
    btnGroup.className = 'card-btns';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'card-btn';
    editBtn.textContent = `✏️ ${dict.editAction}`;
    editBtn.addEventListener('click', () => {
      currentPlace = {
        title: place.title,
        sourceUrl: place.source_url,
        sourceProvider: place.source_provider,
        rating: place.observed_rating,
        priceLevel: place.observed_price,
        summary: place.why,
      };
      autoFillPlaceForm(currentPlace);
      renderCurrentPlace();
      window.scrollTo({ top: 120, behavior: 'smooth' });
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'card-btn del';
    delBtn.textContent = `🗑️ ${dict.deleteAction}`;
    delBtn.addEventListener('click', () => {
      state = { ...state, pendingPlaces: state.pendingPlaces.filter((p) => p.id !== place.id) };
      void saveState().then(() => {
        renderCurrentPlace();
      });
    });

    btnGroup.append(editBtn, delBtn);
    actions.append(daySelect, btnGroup);

    card.append(header, details, actions);
    el.candidatesListContainer.append(card);
  }
}

function createTripFromForm(): PlannerTrip | null {
  const title = el.tripTitle.value.trim();
  const start = el.tripStart.value;
  const end = el.tripEnd.value;
  if (!title || !start || !end || end < start) {
    setStatus(t().tripValidateError, 'error');
    return null;
  }
  const now = new Date().toISOString();
  const tripTags = normalizeDelimitedText(el.tripTags.value);
  return {
    schema_version: '0.1',
    type: 'trip',
    id: crypto.randomUUID(),
    title,
    status: 'planning',
    start_date: start,
    end_date: end,
    destinations: normalizeDelimitedText(el.tripDestinations.value),
    tags: tripTags.length ? tripTags : undefined,
    saved_list_name: tripTags[0],
    currency: el.tripCurrency.value.trim() || pageDetectedCurrency || undefined,
    transport_mode: el.tripTransport.value as PlannerTrip['transport_mode'],
    created_at: now,
    updated_at: now,
  };
}

el.langToggle.addEventListener('click', () => {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  void chrome.storage.local.set({ [LANG_STORAGE_KEY]: currentLang });
  applyI18n();
});

el.candidatesSearch.addEventListener('input', () => {
  searchQuery = el.candidatesSearch.value;
  renderCandidatesList();
});

// Click detected currency pill to apply to active trip & place form
el.btnDetectedCurrencyPill.addEventListener('click', () => {
  const dict = t();
  if (!pageDetectedCurrency) return;
  el.tripCurrency.value = pageDetectedCurrency;
  el.editTripCurrency.value = pageDetectedCurrency;

  if (state.activeTripId) {
    state = {
      ...state,
      trips: state.trips.map((trip) =>
        trip.id === state.activeTripId ? { ...trip, currency: pageDetectedCurrency, updated_at: new Date().toISOString() } : trip
      ),
    };
    void saveState().then(() => {
      setStatus(dict.currencyApplied(pageDetectedCurrency!), 'success');
    });
  }
});

// ⚡ 1-Click Sync Matched Saved List (e.g. TH26)
el.btnSyncSavedListAll.addEventListener('click', () => {
  const dict = t();
  if (!detectedSavedList || detectedSavedList.places.length === 0) return;

  const now = new Date().toISOString();
  let activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);

  // If no active trip is selected, pick the first trip or create a new one automatically
  if (!activeTrip) {
    if (state.trips.length > 0) {
      activeTrip = state.trips[0];
      state.activeTripId = activeTrip.id;
    } else {
      const newTripId = crypto.randomUUID();
      activeTrip = {
        schema_version: '0.1',
        type: 'trip',
        id: newTripId,
        title: detectedSavedList.listName || 'TH26 探索之旅',
        status: 'planning',
        start_date: today(),
        end_date: today(),
        destinations: [detectedSavedList.listName || '旅行目的地'],
        tags: [detectedSavedList.listName || 'TH26'],
        saved_list_name: detectedSavedList.listName,
        currency: pageDetectedCurrency || 'THB',
        transport_mode: 'transit',
        created_at: now,
        updated_at: now,
      };
      state.trips = [activeTrip];
      state.activeTripId = newTripId;
    }
  }

  const updatedKnown = { ...state.knownPlaceIds };
  const newPlaces: PlannerTripPlace[] = [];
  const listTag = detectedSavedList.listName;

  for (const item of detectedSavedList.places) {
    const placeKey = `${state.activeTripId}::${item.sourceUrl}`;
    const stableId = updatedKnown[placeKey] ?? crypto.randomUUID();
    updatedKnown[placeKey] = stableId;

    const combinedTags = Array.from(new Set([...(activeTrip?.tags ?? []), listTag]));
    const place: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: stableId,
      trip_id: state.activeTripId!,
      title: item.title,
      source_provider: item.sourceProvider || 'google_maps',
      source_url: item.sourceUrl,
      kind: inferPlaceKind(item.category),
      area: item.address?.split(/[,，·]/)[0]?.trim() || undefined,
      priority: 'want',
      tags: combinedTags,
      why: item.userNote || item.summary,
      signals: item.category ? [item.category] : [],
      risks: [],
      notes: item.userNote,
      open_hours: item.openHours,
      address: item.address,
      observed_rating: item.rating,
      observed_price: item.priceLevel,
      observed_at: today(),
      reservation_status: 'none',
      state: 'candidate',
      created_at: now,
      updated_at: now,
    };
    newPlaces.push(place);
  }

  const existingIds = new Set(newPlaces.map((p) => p.id));
  state = {
    ...state,
    knownPlaceIds: updatedKnown,
    pendingPlaces: [...state.pendingPlaces.filter((p) => !existingIds.has(p.id)), ...newPlaces],
  };

  void saveState().then(() => {
    setStatus(dict.savedListSynced(newPlaces.length, listTag), 'success');
  });
});


// Bulk Text / Links Parser
el.btnParseBulkImport.addEventListener('click', () => {
  void (async () => {
    const dict = t();
    if (!state.activeTripId) {
      setStatus(dict.tripRequiredError, 'error');
      return;
    }
    const text = el.bulkInputText.value.trim();
    if (!text) {
      setStatus(dict.bulkImportEmpty, 'error');
      return;
    }

    const lines = text.split(/[\n;]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    setStatus('正在解析地点与列表链接…');
    const now = new Date().toISOString();
    const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
    const updatedKnown = { ...state.knownPlaceIds };
    const newPlaces: PlannerTripPlace[] = [];
    const errors: string[] = [];

    for (const line of lines) {
      const isUrl = /^https?:\/\//i.test(line);
      if (isUrl && (line.includes('maps.app.goo.gl') || line.includes('!2s') || line.includes('placelists/list') || line.includes('goo.gl/maps'))) {
        try {
          const listItems = await resolveGoogleMapsListByUrl(line);
          if (listItems.length > 0) {
            for (const item of listItems) {
              const placeKey = `${state.activeTripId}::${item.source_url}`;
              item.id = updatedKnown[placeKey] ?? crypto.randomUUID();
              updatedKnown[placeKey] = item.id;
              newPlaces.push(item);
            }
            continue;
          } else {
            errors.push(`[未找到地点: ${line}]`);
          }
        } catch (e: unknown) {
          errors.push(`[解析失败: ${line} - ${e instanceof Error ? e.message : '未知错误'}]`);
        }
      }

      const sourceUrl = isUrl ? line : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
      const title = isUrl ? (line.match(/\/maps\/place\/([^/?#]+)/)?.[1]?.replace(/\+/g, ' ') || line) : line;
      const placeKey = `${state.activeTripId}::${sourceUrl}`;
      const stableId = updatedKnown[placeKey] ?? crypto.randomUUID();
      updatedKnown[placeKey] = stableId;

      const place: PlannerTripPlace = {
        schema_version: '0.1',
        type: 'trip_place',
        id: stableId,
        trip_id: state.activeTripId,
        title: decodeURIComponent(title),
        source_provider: inferSourceProvider(sourceUrl),
        source_url: sourceUrl,
        kind: 'attraction',
        priority: 'want',
        tags: activeTrip?.tags ?? [],
        signals: [],
        risks: [],
        observed_at: today(),
        reservation_status: 'none',
        state: 'candidate',
        created_at: now,
        updated_at: now,
      };
      newPlaces.push(place);
    }

  const existingIds = new Set(newPlaces.map((p) => p.id));
  state = {
    ...state,
    knownPlaceIds: updatedKnown,
    pendingPlaces: [...state.pendingPlaces.filter((p) => !existingIds.has(p.id)), ...newPlaces],
  };

    void saveState().then(() => {
      el.bulkInputText.value = '';
      if (newPlaces.length > 0 || errors.length > 0) {
        if (errors.length > 0) {
          setStatus(`导入了 ${newPlaces.length} 个地点。存在错误: ${errors.join(', ')}`, newPlaces.length > 0 ? 'success' : 'error');
        } else {
          setStatus(dict.bulkImportSuccess(newPlaces.length), 'success');
        }
      } else if (errors.length > 0) {
        setStatus(`解析失败或未找到有效数据: ${errors.join(', ')}`, 'error');
      }
    });
  })();
});

el.btnToggleSelectAll.addEventListener('click', () => {
  const checkboxes = el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every((c) => c.checked);
  checkboxes.forEach((c) => { c.checked = !allChecked; });
});

el.btnBatchAdd.addEventListener('click', () => {
  const dict = t();
  if (!state.activeTripId) {
    setStatus(dict.tripRequiredError, 'error');
    return;
  }
  const checkboxes = el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
  const selectedUrls = new Set(Array.from(checkboxes).map((c) => c.dataset.url).filter(Boolean));
  const allPlaces = (detectedSavedList?.places && detectedSavedList.places.length > 0)
    ? detectedSavedList.places
    : detectedListPlaces;
  const toAdd = allPlaces.filter((item) => selectedUrls.has(item.sourceUrl));
  if (toAdd.length === 0) return;

  const now = new Date().toISOString();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  const updatedKnown = { ...state.knownPlaceIds };
  const newPlaces: PlannerTripPlace[] = [];

  for (const item of toAdd) {
    const placeKey = `${state.activeTripId}::${item.sourceUrl}`;
    const stableId = updatedKnown[placeKey] ?? crypto.randomUUID();
    updatedKnown[placeKey] = stableId;

    const place: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: stableId,
      trip_id: state.activeTripId,
      title: item.title,
      source_provider: item.sourceProvider || 'google_maps',
      source_url: item.sourceUrl,
      kind: inferPlaceKind(item.category),
      priority: 'want',
      tags: activeTrip?.tags ?? [],
      why: item.userNote || item.summary,
      signals: item.category ? [item.category] : [],
      risks: [],
      notes: item.userNote,
      open_hours: item.openHours,
      address: item.address,
      observed_rating: item.rating,
      observed_price: item.priceLevel,
      observed_at: today(),
      reservation_status: 'none',
      state: 'candidate',
      created_at: now,
      updated_at: now,
    };
    newPlaces.push(place);
  }

  const existingIds = new Set(newPlaces.map((p) => p.id));
  state = {
    ...state,
    knownPlaceIds: updatedKnown,
    pendingPlaces: [...state.pendingPlaces.filter((p) => !existingIds.has(p.id)), ...newPlaces],
  };

  void saveState().then(() => {
    setStatus(dict.batchAddedSuccess(newPlaces.length), 'success');
  });
});

// Edit active trip form submission
el.editTripForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const dict = t();
  if (!state.activeTripId) return;

  const title = el.editTripTitle.value.trim();
  const start = el.editTripStart.value;
  const end = el.editTripEnd.value;
  if (!title || !start || !end || end < start) {
    setStatus(dict.tripValidateError, 'error');
    return;
  }

  const tripTags = normalizeDelimitedText(el.editTripTags.value);
  const now = new Date().toISOString();

  state = {
    ...state,
    trips: state.trips.map((trip) => {
      if (trip.id !== state.activeTripId) return trip;
      return {
        ...trip,
        title,
        start_date: start,
        end_date: end,
        destinations: normalizeDelimitedText(el.editTripDestinations.value),
        tags: tripTags.length ? tripTags : undefined,
        saved_list_name: tripTags[0] || undefined,
        currency: el.editTripCurrency.value.trim() || undefined,
        transport_mode: el.editTripTransport.value as PlannerTrip['transport_mode'],
        updated_at: now,
      };
    }),
  };

  void saveState().then(() => {
    setStatus(dict.tripSavedSuccess, 'success');
  });
});

// Delete active trip
el.btnDeleteTrip.addEventListener('click', () => {
  const dict = t();
  if (!state.activeTripId) return;
  const trip = state.trips.find((t) => t.id === state.activeTripId);
  if (!trip) return;

  if (!window.confirm(dict.confirmDeleteTrip(trip.title))) return;

  const deletedTripId = state.activeTripId;
  const remainingTrips = state.trips.filter((t) => t.id !== deletedTripId);
  const nextActiveId = remainingTrips[0]?.id || null;

  state = {
    ...state,
    trips: remainingTrips,
    activeTripId: nextActiveId,
    pendingPlaces: state.pendingPlaces.filter((p) => p.trip_id !== deletedTripId),
  };

  void saveState().then(() => {
    setStatus(dict.tripDeletedSuccess, 'success');
  });
});

el.tripForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const trip = createTripFromForm();
  if (!trip) return;
  state = { ...state, trips: [...state.trips, trip], activeTripId: trip.id };
  void saveState().then(() => {
    el.tripForm.reset();
    el.tripCurrency.value = pageDetectedCurrency || 'CNY';
    el.tripTransport.value = 'transit';
    setStatus(t().tripCreated(trip.title), 'success');
  });
});

el.tripSelect.addEventListener('change', () => {
  state = { ...state, activeTripId: el.tripSelect.value || null };
  void saveState();
  populateEditTripForm();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  if (activeTrip?.tags?.length && !el.tags.value) {
    el.tags.value = activeTrip.tags.join(', ');
  }
});

el.refreshPlace.addEventListener('click', () => {
  userDismissedPlaceUrl = null;
  void readCurrentPlace();
});

el.btnRemoveCandidate.addEventListener('click', () => {
  const dict = t();
  if (!currentPlace || !state.activeTripId) return;
  const existing = getExistingPlaceForUrl(currentPlace.sourceUrl);
  if (!existing) return;

  state = { ...state, pendingPlaces: state.pendingPlaces.filter((p) => p.id !== existing.id) };
  void saveState().then(() => {
    el.captureForm.reset();
    el.kind.value = 'attraction';
    el.priority.value = 'want';
    setStatus(dict.candidateRemoved, 'success');
  });
});

el.captureForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const dict = t();
  if (!state.activeTripId) {
    setStatus(dict.tripRequiredError, 'error');
    return;
  }
  if (!currentPlace) {
    setStatus(dict.placeRequiredError, 'error');
    return;
  }

  const duration = Number(el.duration.value);
  const rating = Number(el.rating.value);
  const now = new Date().toISOString();
  const placeKey = `${state.activeTripId}::${currentPlace.sourceUrl}`;
  const stableId = state.knownPlaceIds[placeKey] ?? crypto.randomUUID();
  const existing = state.pendingPlaces.find((place) => place.id === stableId);

  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  const placeTags = normalizeDelimitedText(el.tags.value);
  const combinedTags = Array.from(new Set([...(activeTrip?.tags ?? []), ...placeTags]));

  const place: PlannerTripPlace = {
    schema_version: '0.1',
    type: 'trip_place',
    id: stableId,
    trip_id: state.activeTripId,
    title: currentPlace.title,
    source_provider: currentPlace.sourceProvider || 'google_maps',
    source_url: currentPlace.sourceUrl,
    kind: el.kind.value as PlannerPlaceKind,
    area: el.area.value.trim() || undefined,
    priority: el.priority.value as PlannerPlacePriority,
    tags: combinedTags,
    why: el.why.value.trim() || undefined,
    signals: normalizeDelimitedText(el.signals.value),
    risks: normalizeDelimitedText(el.risks.value),
    notes: el.notes.value.trim() || undefined,
    observed_rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    observed_price: el.price.value.trim() || undefined,
    observed_at: today(),
    preferred_window: el.window.value.trim() || undefined,
    duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.min(1440, Math.round(duration)) : undefined,
    open_hours: currentPlace.openHours ?? existing?.open_hours,
    address: currentPlace.address ?? existing?.address,
    reservation_status: existing?.reservation_status ?? 'none',
    state: existing?.state ?? 'candidate',
    scheduled_date: existing?.scheduled_date,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  state = {
    ...state,
    knownPlaceIds: { ...state.knownPlaceIds, [placeKey]: place.id },
    pendingPlaces: [...state.pendingPlaces.filter((item) => item.id !== place.id), place],
  };
  void saveState().then(() => {
    setStatus(existing ? dict.candidateUpdated : dict.candidateAdded, 'success');
  });
});

// Auto-refresh when tab updates or gains focus
window.addEventListener('focus', () => { void readCurrentPlace(); });

void (async () => {
  await loadState();
  applyI18n();
  await readCurrentPlace();
})();




