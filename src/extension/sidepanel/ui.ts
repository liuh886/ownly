import {
  checkOpeningHoursCollision,
  classifyResearchChip,
  inferPlaceKind,
  listTripDates,
  normalizeDelimitedText,
  type PlannerPlaceKind,
  type PlannerPlacePriority,
  type PlannerTripPlace,
} from '../../domain/planner';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { el } from '../dom';
import { escapeHtml } from '../utils';
import { getExistingPlaceForUrl, store, t } from './store';

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

export function setStatus(message: string, tone: 'muted' | 'success' | 'error' = 'muted') {
  el.status.textContent = message;
  el.status.dataset.tone = tone;
}

export function applyI18n() {
  const dict = t();
  el.langToggle.textContent = store.lang === 'zh' ? 'EN' : '中文';
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
  renderSmartListCard();
  renderCandidatesList();
}

function renderChips() {
  const dict = t();
  el.quickChips.innerHTML = '';

  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
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
  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
  const tripPlaces = store.state.pendingPlaces.filter((p) => p.trip_id === store.state.activeTripId);

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
    btn.className = `filter-btn ${store.activeFilter === item.id ? 'active' : ''}`;
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      store.activeFilter = item.id;
      renderFilters();
      renderCandidatesList();
    });
    el.candidatesFilterBar.append(btn);
  }
}

export function populateEditTripForm() {
  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
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
  el.editTripCurrency.value = activeTrip.currency || store.pageDetectedCurrency || 'CNY';
  el.editTripTransport.value = activeTrip.transport_mode || 'transit';
}

export function renderState() {
  const dict = t();
  el.tripSelect.innerHTML = '';
  if (store.state.trips.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = dict.noTripOption;
    el.tripSelect.append(option);
    el.editTripSection.style.display = 'none';
  } else {
    for (const trip of store.state.trips) {
      const option = document.createElement('option');
      option.value = trip.id;
      const currencyBadge = trip.currency ? ` [${trip.currency}]` : '';
      option.textContent = trip.tags?.length ? `${trip.title} (${trip.tags.join(', ')})${currencyBadge}` : `${trip.title}${currencyBadge}`;
      el.tripSelect.append(option);
    }
    const active = store.state.trips.some((trip) => trip.id === store.state.activeTripId)
      ? store.state.activeTripId
      : store.state.trips[0].id;
    store.state.activeTripId = active;
    el.tripSelect.value = active ?? '';
    populateEditTripForm();
  }
  el.pending.textContent = `${store.state.pendingPlaces.length} ${dict.pendingSuffix}`;
}

export function renderCurrencyPill() {
  const dict = t();
  if (store.pageDetectedCurrency) {
    el.btnDetectedCurrencyPill.style.display = 'inline-block';
    el.btnDetectedCurrencyPill.textContent = dict.detectedCurrencyPill(store.pageDetectedCurrency);
  } else {
    el.btnDetectedCurrencyPill.style.display = 'none';
  }
}

export function renderSmartListCard() {
  const dict = t();
  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);

  // 1. Overview page with multiple lists found
  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && store.detectedAllLists.length > 0) {
    el.smartListSection.style.display = 'block';
    el.smartListSection.className = 'panel stack match-banner neutral';
    el.smartListBadge.textContent = dict.listsFoundBadge;
    el.smartListTitle.textContent = dict.listsFoundTitle(store.detectedAllLists.length);
    el.smartListCountBadge.textContent = dict.clickToLoad;
    el.smartListDesc.innerHTML = `${escapeHtml(dict.loadListIntro)}<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:5px;">` +
      store.detectedAllLists.map((l) => `<button type="button" class="btn-list-chip" data-list-id="${escapeHtml(l.listId || '')}" style="padding:3px 7px; font-size:10.5px; background:#fff; border:1px solid #10b981; color:#065f46; border-radius:12px; cursor:pointer; font-weight:600;">📁 ${escapeHtml(l.listName)}${l.count ? ` (${l.count})` : ''}</button>`).join('') +
      '</div>';
    el.btnSmartSyncAll.style.display = 'none';
    el.btnToggleListPreview.style.display = 'none';
    el.smartListPreviewContainer.style.display = 'none';

    // Add click listeners to list chips
    const chips = el.smartListDesc.querySelectorAll<HTMLButtonElement>('.btn-list-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const listId = chip.dataset.listId;
        if (listId) {
          setStatus(dict.fetchingList);
          void chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
            if (activeTab?.id) {
              void (chrome.tabs.sendMessage(activeTab.id, { type: 'OWNLY_FETCH_LIST_BY_ID', listId }) as Promise<{ savedList?: DetectedSavedList | null }>).then((resp) => {
                if (resp?.savedList) {
                  store.detectedSavedList = resp.savedList;
                  renderSmartListCard();
                  renderCurrentPlace();
                  setStatus(dict.fetchedListStatus(resp.savedList!.listName, resp.savedList!.places.length), 'success');
                }
              });
            }
          });
        }
      });
    });
    return;
  }

  // 2. Single list detected
  if (!store.detectedSavedList || store.detectedSavedList.places.length === 0) {
    el.smartListSection.style.display = 'none';
    return;
  }

  const places = store.detectedSavedList.places;
  el.smartListSection.style.display = 'block';
  el.btnSmartSyncAll.style.display = 'block';
  el.btnToggleListPreview.style.display = 'block';
  el.smartListTitle.textContent = store.detectedSavedList.listName;
  el.smartListCountBadge.textContent = dict.placesCountBadge(places.length);

  let isMatched = false;
  if (activeTrip) {
    const listNameNorm = store.detectedSavedList.listName.trim().toLowerCase();
    const tripTags = (activeTrip.tags || []).map((tag) => tag.trim().toLowerCase());
    const tripTitleNorm = activeTrip.title.trim().toLowerCase();
    const savedListNameNorm = (activeTrip.saved_list_name || '').trim().toLowerCase();

    isMatched =
      tripTags.includes(listNameNorm) ||
      tripTags.some((tag) => tag && (listNameNorm.includes(tag) || tag.includes(listNameNorm))) ||
      listNameNorm === savedListNameNorm ||
      listNameNorm.includes(tripTitleNorm) ||
      tripTitleNorm.includes(listNameNorm);

    el.smartListSection.className = isMatched ? 'panel stack match-banner' : 'panel stack match-banner neutral';
    el.smartListBadge.textContent = isMatched ? dict.matchedBadge : dict.sensedBadge;
    el.smartListDesc.textContent = isMatched
      ? dict.matchedDesc(store.detectedSavedList.listName, activeTrip.title)
      : dict.unmatchedDesc(places.length, activeTrip.title);
    el.btnSmartSyncAll.textContent = dict.syncAllBtn(places.length);
  } else {
    el.smartListSection.className = 'panel stack match-banner neutral';
    el.smartListBadge.textContent = dict.sensedBadge;
    el.smartListDesc.textContent = dict.sensedNoTripDesc(store.detectedSavedList.listName, places.length);
    el.btnSmartSyncAll.textContent = dict.importAllBtn(places.length);
  }

  // Preview container render
  el.smartListPreviewContainer.style.display = store.isListPreviewOpen ? 'block' : 'none';
  el.btnToggleListPreview.textContent = store.isListPreviewOpen ? dict.collapseList : dict.pickPlaces;
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
    const titleEl = document.createElement('div');
    titleEl.className = 'batch-item-title';
    titleEl.textContent = item.title;
    const subEl = document.createElement('div');
    subEl.className = 'batch-item-sub';
    subEl.textContent = sub;
    info.append(titleEl, subEl);

    row.append(chk, info);
    el.batchListContainer.append(row);
  }
}

export function autoFillPlaceForm(place: CurrentResearchPlace) {
  const existing = getExistingPlaceForUrl(place.sourceUrl, place.sourcePlaceId);
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
  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
  if (activeTrip?.tags?.length && !el.tags.value) {
    el.tags.value = activeTrip.tags.join(', ');
  }
}

export function renderCurrentPlace() {
  const dict = t();
  el.placeMetaBadges.innerHTML = '';
  if (!store.currentPlace) {
    if (store.detectedSavedList && store.detectedSavedList.places.length > 0) {
      const dictLocal = t();
      el.placeTitle.textContent = dictLocal.browsingListTitle(store.detectedSavedList.listName);
      el.placeUrl.textContent = dictLocal.browsingListDesc(store.detectedSavedList.places.length);
      el.captureForm.style.display = 'none';
      setStatus(dictLocal.listSensedStatus(store.detectedSavedList.places.length));
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
  el.placeTitle.textContent = store.currentPlace.title;
  el.placeUrl.textContent = store.currentPlace.sourceUrl;

  const existing = getExistingPlaceForUrl(store.currentPlace.sourceUrl, store.currentPlace.sourcePlaceId);
  if (existing) {
    el.placeCapturedBanner.style.display = 'flex';
    el.btnCaptureSubmit.textContent = dict.btnUpdateCandidate;
    el.btnRemoveCandidate.style.display = 'inline-block';
  } else {
    el.placeCapturedBanner.style.display = 'none';
    el.btnCaptureSubmit.textContent = dict.btnAddCandidate;
    el.btnRemoveCandidate.style.display = 'none';
  }

  if (store.currentPlace.rating) {
    const b = document.createElement('span');
    b.className = 'badge highlight';
    b.textContent = `★ ${store.currentPlace.rating}${store.currentPlace.reviewCount ? ` (${store.currentPlace.reviewCount.toLocaleString()})` : ''}`;
    el.placeMetaBadges.append(b);
  }
  if (store.currentPlace.category) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `🏷️ ${store.currentPlace.category}`;
    el.placeMetaBadges.append(b);
  }
  if (store.currentPlace.priceLevel) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `💰 ${store.currentPlace.priceLevel}`;
    el.placeMetaBadges.append(b);
  } else if (store.currentPlace.detectedCurrency) {
    const b = document.createElement('span');
    b.className = 'badge highlight';
    b.textContent = `💱 ${store.currentPlace.detectedCurrency}`;
    el.placeMetaBadges.append(b);
  }
  if (store.currentPlace.openStatus) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `⏰ ${store.currentPlace.openStatus}`;
    el.placeMetaBadges.append(b);
  }
  if (store.currentPlace.address) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = `📍 ${store.currentPlace.address.slice(0, 30)}`;
    el.placeMetaBadges.append(b);
  }

  setStatus(dict.readyToCapture);
}

export function renderCandidatesList() {
  const dict = t();
  const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
  const tripDays = activeTrip ? listTripDates(activeTrip.start_date, activeTrip.end_date) : [];

  let candidates = store.state.pendingPlaces.filter((p) => p.trip_id === store.state.activeTripId);
  el.candidatesCountBadge.textContent = String(candidates.length);

  if (store.activeFilter === 'must') candidates = candidates.filter((p) => p.priority === 'must');
  if (store.activeFilter === 'want') candidates = candidates.filter((p) => p.priority === 'want');
  if (store.activeFilter === 'food') candidates = candidates.filter((p) => p.kind === 'food' || p.kind === 'cafe');
  if (store.activeFilter === 'attraction') candidates = candidates.filter((p) => p.kind === 'attraction');
  if (store.activeFilter === 'stay') candidates = candidates.filter((p) => p.kind === 'stay');
  if (store.activeFilter.startsWith('tag:')) {
    const filterTag = store.activeFilter.slice(4).trim().toLowerCase();
    candidates = candidates.filter((p) => p.tags.some((tag) => tag.trim().toLowerCase() === filterTag));
  }

  if (store.searchQuery.trim()) {
    const query = store.searchQuery.trim().toLowerCase();
    candidates = candidates.filter((p) =>
      p.title.toLowerCase().includes(query) ||
      p.area?.toLowerCase().includes(query) ||
      p.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  el.candidatesListContainer.innerHTML = '';
  if (candidates.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#78716c';
    empty.style.fontSize = '11px';
    empty.style.padding = '8px 4px';
    empty.textContent = dict.emptyCandidates;
    el.candidatesListContainer.append(empty);
    return;
  }

  for (const place of candidates) {
    const card = document.createElement('div');
    card.className = 'candidate-card';
    card.dataset.placeId = place.id;

    const header = document.createElement('div');
    header.className = 'candidate-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'candidate-title';
    titleEl.textContent = `${KIND_ICONS[place.kind] || '📍'} ${place.title}`;

    const priorityBadge = document.createElement('span');
    priorityBadge.className = `badge ${place.priority}`;
    priorityBadge.textContent = dict.priorities[place.priority] || place.priority;

    header.append(titleEl, priorityBadge);

    if (store.editingCandidateId === place.id) {
      card.append(header, buildInlineEditor(place, dict));
    } else {
      card.append(header, buildCandidateDetails(place, dict, tripDays));
    }
    el.candidatesListContainer.append(card);
  }
}

function buildInlineEditor(
  place: PlannerTripPlace,
  dict: ReturnType<typeof t>,
): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'candidate-inline-editor';
  form.addEventListener('submit', (e) => e.preventDefault());

  // Row 1: Kind & Priority
  const row1 = document.createElement('div');
  row1.className = 'inline-row';

  const kindLabel = document.createElement('label');
  kindLabel.textContent = dict.kindLabel;
  const kindSelect = document.createElement('select');
  kindSelect.name = 'kind';
  Object.entries(dict.kinds).forEach(([key, val]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${KIND_ICONS[key as PlannerPlaceKind] || ''} ${val}`;
    kindSelect.append(opt);
  });
  kindSelect.value = place.kind || 'attraction';
  kindLabel.append(kindSelect);

  const priorityLabel = document.createElement('label');
  priorityLabel.textContent = dict.priorityLabel;
  const prioritySelect = document.createElement('select');
  prioritySelect.name = 'priority';
  Object.entries(dict.priorities).forEach(([key, val]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = val;
    prioritySelect.append(opt);
  });
  prioritySelect.value = place.priority || 'want';
  priorityLabel.append(prioritySelect);

  row1.append(kindLabel, priorityLabel);

  // Row 2: Area & Price
  const row2 = document.createElement('div');
  row2.className = 'inline-row';

  const areaLabel = document.createElement('label');
  areaLabel.textContent = dict.areaLabel;
  const areaInput = document.createElement('input');
  areaInput.name = 'area';
  areaInput.type = 'text';
  areaInput.value = place.area || '';
  areaInput.placeholder = dict.areaPlaceholder;
  areaLabel.append(areaInput);

  const priceLabel = document.createElement('label');
  priceLabel.textContent = dict.priceLabel;
  const priceInput = document.createElement('input');
  priceInput.name = 'price';
  priceInput.type = 'text';
  priceInput.value = place.observed_price || '';
  priceInput.placeholder = dict.pricePlaceholder;
  priceLabel.append(priceInput);

  row2.append(areaLabel, priceLabel);

  // Row 3: Rating & Duration
  const row3 = document.createElement('div');
  row3.className = 'inline-row';

  const ratingLabel = document.createElement('label');
  ratingLabel.textContent = dict.ratingLabel;
  const ratingInput = document.createElement('input');
  ratingInput.name = 'rating';
  ratingInput.type = 'number';
  ratingInput.step = '0.1';
  ratingInput.min = '1';
  ratingInput.max = '5';
  ratingInput.value = place.observed_rating ? String(place.observed_rating) : '';
  ratingInput.placeholder = dict.ratingPlaceholder;
  ratingLabel.append(ratingInput);

  const durationLabel = document.createElement('label');
  durationLabel.textContent = dict.durationLabel;
  const durationInput = document.createElement('input');
  durationInput.name = 'duration';
  durationInput.type = 'number';
  durationInput.step = '15';
  durationInput.min = '15';
  durationInput.max = '1440';
  durationInput.value = place.duration_minutes ? String(place.duration_minutes) : '';
  durationInput.placeholder = dict.durationPlaceholder;
  durationLabel.append(durationInput);

  row3.append(ratingLabel, durationLabel);

  // Row 4: Tags
  const row4 = document.createElement('div');
  row4.className = 'inline-row';
  const tagsLabel = document.createElement('label');
  tagsLabel.style.width = '100%';
  tagsLabel.textContent = dict.tagsLabel;
  const tagsInput = document.createElement('input');
  tagsInput.name = 'tags';
  tagsInput.type = 'text';
  tagsInput.value = place.tags.join(', ');
  tagsInput.placeholder = dict.tagsPlaceholder;
  tagsLabel.append(tagsInput);
  row4.append(tagsLabel);

  // Row 5: Notes / Why
  const row5 = document.createElement('div');
  row5.className = 'inline-row';
  const notesLabel = document.createElement('label');
  notesLabel.style.width = '100%';
  notesLabel.textContent = dict.notesLabel;
  const notesTextarea = document.createElement('textarea');
  notesTextarea.name = 'notes';
  notesTextarea.value = place.notes || place.why || '';
  notesTextarea.placeholder = dict.notesPlaceholder;
  notesLabel.append(notesTextarea);
  row5.append(notesLabel);

  // Action buttons with dataset actions
  const actionRow = document.createElement('div');
  actionRow.className = 'inline-actions';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.className = 'btn-cancel-inline';
  btnCancel.dataset.action = 'cancel-inline';
  btnCancel.dataset.placeId = place.id;
  btnCancel.textContent = dict.btnCancelInlineEdit;

  const btnSave = document.createElement('button');
  btnSave.type = 'button';
  btnSave.className = 'btn-save-inline';
  btnSave.dataset.action = 'save-inline';
  btnSave.dataset.placeId = place.id;
  btnSave.textContent = dict.btnSaveInlineEdit;

  actionRow.append(btnCancel, btnSave);
  form.append(row1, row2, row3, row4, row5, actionRow);
  return form;
}

function buildCandidateDetails(
  place: PlannerTripPlace,
  dict: ReturnType<typeof t>,
  tripDays: string[],
): HTMLDivElement {
  const wrapper = document.createElement('div');

  const details = document.createElement('div');
  details.className = 'candidate-details';
  if (place.area) details.innerHTML += `<span>📍 ${escapeHtml(place.area)}</span>`;
  if (place.observed_rating) details.innerHTML += `<span>★ ${place.observed_rating}</span>`;
  if (place.observed_price) details.innerHTML += `<span>💰 ${escapeHtml(place.observed_price)}</span>`;
  if (place.duration_minutes) details.innerHTML += `<span>⏱️ ${place.duration_minutes}m</span>`;
  if (place.tags.length) details.innerHTML += `<span>🏷️ ${escapeHtml(place.tags.join(', '))}</span>`;
  const noteText = place.notes || place.why;
  if (noteText) {
    details.innerHTML += `<div style="color:#57534e;font-size:11px;line-height:1.3;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">📝 ${escapeHtml(noteText)}</div>`;
  }
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
  daySelect.dataset.action = 'day-select';
  daySelect.dataset.placeId = place.id;
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

  const btnGroup = document.createElement('div');
  btnGroup.className = 'card-btns';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'card-btn';
  editBtn.dataset.action = 'edit';
  editBtn.dataset.placeId = place.id;
  editBtn.textContent = `✏️ ${dict.editAction}`;

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'card-btn del';
  delBtn.dataset.action = 'delete';
  delBtn.dataset.placeId = place.id;
  delBtn.textContent = `🗑️ ${dict.deleteAction}`;

  btnGroup.append(editBtn, delBtn);
  actions.append(daySelect, btnGroup);

  wrapper.append(details, actions);
  return wrapper;
}
