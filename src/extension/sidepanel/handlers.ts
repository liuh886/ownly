import { resolveGoogleMapsListByUrl } from '../api';
import {
  findExistingTripPlace,
  inferPlaceKind,
  inferSourceProvider,
  normalizeDelimitedText,
  placeIdentityKey,
  type PlannerPlaceKind,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from '../../domain/planner';
import { saveCaptureStateViaWorker, writeCaptureState } from '../capture-state';
import { el } from '../dom';
import { cleanExtractedText, isJunkNavigationText, safeDecodeUri, today } from '../utils';
import { readCurrentPlace } from './capture';
import { getExistingPlaceForUrl, store, t } from './store';
import {
  applyI18n,
  populateEditTripForm,
  renderCandidatesList,
  renderCurrentPlace,
  renderSmartListCard,
  renderState,
  setStatus,
  syncQuickChipStates,
} from './ui';

const LANG_STORAGE_KEY = 'ownlyCaptureLang';

export async function saveState(): Promise<void> {
  const viaWorker = await saveCaptureStateViaWorker(store.state);
  if (!viaWorker?.ok) {
    await writeCaptureState(store.state);
  }
  renderState();
  renderCurrentPlace();
  renderSmartListCard();
  renderCandidatesList();
}

function scrollCardIntoView(placeId: string, focusEditor = false): void {
  requestAnimationFrame(() => {
    const card = el.candidatesListContainer.querySelector<HTMLElement>(`.candidate-card[data-place-id="${placeId}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (focusEditor) {
      card.querySelector<HTMLSelectElement>('.candidate-inline-editor select')?.focus({ preventScroll: true });
    }
  });
}

function flashNewCandidate(placeId: string): void {
  el.candidatesDrawer.open = true;
  requestAnimationFrame(() => {
    const card = el.candidatesListContainer.querySelector<HTMLElement>(`.candidate-card[data-place-id="${placeId}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.classList.add('flash-new');
    window.setTimeout(() => card.classList.remove('flash-new'), 950);
  });
}

function initDragReorder(): void {
  const list = el.candidatesListContainer;
  let draggingId: string | null = null;

  list.addEventListener('dragstart', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.candidate-card');
    if (!card) return;
    draggingId = card.dataset.placeId || null;
    card.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', draggingId || ''); } catch {}
    }
  });

  list.addEventListener('dragover', (e) => {
    if (!draggingId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    for (const el2 of Array.from(list.querySelectorAll('.drop-above'))) el2.classList.remove('drop-above');
    const over = (e.target as HTMLElement).closest<HTMLElement>('.candidate-card');
    if (over && over.dataset.placeId !== draggingId) over.classList.add('drop-above');
  });

  list.addEventListener('drop', (e) => {
    if (!draggingId) return;
    e.preventDefault();
    const over = (e.target as HTMLElement).closest<HTMLElement>('.candidate-card');
    const srcId = draggingId;
    draggingId = null;
    for (const el2 of Array.from(list.querySelectorAll('.drop-above'))) el2.classList.remove('drop-above');
    if (!over) return;
    const overId = over.dataset.placeId;
    if (!overId || overId === srcId) return;

    const orderedIds = [...list.querySelectorAll<HTMLElement>('.candidate-card')]
      .map((c) => c.dataset.placeId)
      .filter((id): id is string => Boolean(id));
    const fromIdx = orderedIds.indexOf(srcId);
    if (fromIdx === -1) return;
    orderedIds.splice(fromIdx, 1);
    const toIdx = orderedIds.indexOf(overId);
    orderedIds.splice(toIdx, 0, srcId);

    const pending = [...store.state.pendingPlaces];
    const slots: number[] = [];
    pending.forEach((p, i) => { if (orderedIds.includes(p.id)) slots.push(i); });
    const reordered = orderedIds
      .map((id) => pending.find((p) => p.id === id))
      .filter((p): p is PlannerTripPlace => Boolean(p));
    slots.forEach((slotIdx, i) => { pending[slotIdx] = reordered[i]; });
    store.state = { ...store.state, pendingPlaces: pending };
    void saveState();
  });

  list.addEventListener('dragend', () => {
    draggingId = null;
    for (const el2 of Array.from(list.querySelectorAll('.candidate-card'))) {
      el2.classList.remove('dragging', 'drop-above');
    }
  });
}

function initCandidateDelegation() {
  el.candidatesListContainer.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.day-select')) {
      const placeId = target.dataset.placeId;
      const select = target as HTMLSelectElement;
      const selectedDate = select.value;
      if (!placeId) return;

      const updatedPlaces = store.state.pendingPlaces.map((p) => {
        if (p.id !== placeId) return p;
        return {
          ...p,
          scheduled_date: selectedDate || undefined,
          state: selectedDate ? ('scheduled' as const) : ('candidate' as const),
          updated_at: new Date().toISOString(),
        };
      });
      store.state = { ...store.state, pendingPlaces: updatedPlaces };
      void saveState();
    }
  });

  el.candidatesListContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.editingCandidateId) {
      store.editingCandidateId = null;
      renderCandidatesList();
    }
  });

  el.candidatesListContainer.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const placeId = target.dataset.placeId;
    if (!placeId) return;
    const dict = t();

    if (action === 'edit') {
      store.editingCandidateId = store.editingCandidateId === placeId ? null : placeId;
      renderCandidatesList();
      if (store.editingCandidateId === placeId) scrollCardIntoView(placeId, true);
    } else if (action === 'delete') {
      store.state = { ...store.state, pendingPlaces: store.state.pendingPlaces.filter((p) => p.id !== placeId) };
      if (store.editingCandidateId === placeId) store.editingCandidateId = null;
      void saveState().then(() => {
        renderCurrentPlace();
      });
    } else if (action === 'cancel-inline') {
      store.editingCandidateId = null;
      renderCandidatesList();
    } else if (action === 'save-inline') {
      const card = target.closest<HTMLElement>('.candidate-card');
      if (!card) return;
      const form = card.querySelector<HTMLFormElement>('.candidate-inline-editor');
      if (!form) return;

      const kindSelect = form.querySelector<HTMLSelectElement>('select[name="kind"]');
      const prioritySelect = form.querySelector<HTMLSelectElement>('select[name="priority"]');
      const areaInput = form.querySelector<HTMLInputElement>('input[name="area"]');
      const priceInput = form.querySelector<HTMLInputElement>('input[name="price"]');
      const ratingInput = form.querySelector<HTMLInputElement>('input[name="rating"]');
      const durationInput = form.querySelector<HTMLInputElement>('input[name="duration"]');
      const tagsInput = form.querySelector<HTMLInputElement>('input[name="tags"]');
      const notesTextarea = form.querySelector<HTMLTextAreaElement>('textarea[name="notes"]');

      const newKind = (kindSelect?.value || 'attraction') as PlannerPlaceKind;
      const newPriority = (prioritySelect?.value || 'want') as PlannerPlacePriority;
      const newArea = areaInput ? cleanExtractedText(areaInput.value) || undefined : undefined;
      const newPrice = priceInput ? cleanExtractedText(priceInput.value) || undefined : undefined;
      const numRating = ratingInput ? parseFloat(ratingInput.value) : NaN;
      const numDuration = durationInput ? parseInt(durationInput.value, 10) : NaN;
      const newTags = tagsInput ? normalizeDelimitedText(tagsInput.value).map(cleanExtractedText).filter(Boolean) : [];
      const newNotes = notesTextarea ? cleanExtractedText(notesTextarea.value) || undefined : undefined;

      store.state = {
        ...store.state,
        pendingPlaces: store.state.pendingPlaces.map((p) => {
          if (p.id !== placeId) return p;
          return {
            ...p,
            kind: newKind,
            priority: newPriority,
            area: newArea,
            observed_price: newPrice,
            observed_rating: Number.isFinite(numRating) && numRating >= 1 && numRating <= 5 ? numRating : undefined,
            duration_minutes: Number.isFinite(numDuration) && numDuration > 0 ? Math.min(1440, numDuration) : undefined,
            tags: newTags,
            notes: newNotes,
            why: newNotes || p.why,
            updated_at: new Date().toISOString(),
          };
        }),
      };

      void saveState().then(() => {
        store.editingCandidateId = null;
        setStatus(dict.candidateUpdated, 'success');
        renderCandidatesList();
        scrollCardIntoView(placeId);
      });
    }
  });
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
    currency: el.tripCurrency.value.trim() || store.pageDetectedCurrency || undefined,
    transport_mode: el.tripTransport.value as PlannerTrip['transport_mode'],
    created_at: now,
    updated_at: now,
  };
}

export function initHandlers(): void {
  el.btnDismissPlace.addEventListener('click', () => {
    if (store.currentPlace) {
      store.userDismissedPlaceUrl = store.currentPlace.sourceUrl;
      store.currentPlace = null;
      renderCurrentPlace();
      renderSmartListCard();
    }
  });

  el.langToggle.addEventListener('click', () => {
    store.lang = store.lang === 'zh' ? 'en' : 'zh';
    void chrome.storage.local.set({ [LANG_STORAGE_KEY]: store.lang });
    applyI18n();
  });

  el.candidatesSearch.addEventListener('input', () => {
    store.searchQuery = el.candidatesSearch.value;
    renderCandidatesList();
  });

  // Click detected currency pill to apply to active trip & place form
  el.btnDetectedCurrencyPill.addEventListener('click', () => {
    const dict = t();
    if (!store.pageDetectedCurrency) return;
    el.tripCurrency.value = store.pageDetectedCurrency;
    el.editTripCurrency.value = store.pageDetectedCurrency;

    if (store.state.activeTripId) {
      store.state = {
        ...store.state,
        trips: store.state.trips.map((trip) =>
          trip.id === store.state.activeTripId ? { ...trip, currency: store.pageDetectedCurrency, updated_at: new Date().toISOString() } : trip
        ),
      };
      void saveState().then(() => {
        setStatus(dict.currencyApplied(store.pageDetectedCurrency!), 'success');
      });
    }
  });

  // ⚡ 1-Click Sync Matched Saved List
  el.btnSmartSyncAll.addEventListener('click', () => {
    const dict = t();
    if (!store.detectedSavedList || store.detectedSavedList.places.length === 0) return;

    el.btnSmartSyncAll.classList.add('btn-loading');
    const origText = el.btnSmartSyncAll.textContent;
    el.btnSmartSyncAll.textContent = `⏳ ${dict.syncingBtn}`;

    try {
      const now = new Date().toISOString();
      let activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);

      // If no active trip is selected, pick the first trip or create a new one automatically
      if (!activeTrip) {
        if (store.state.trips.length > 0) {
          activeTrip = store.state.trips[0];
          store.state.activeTripId = activeTrip.id;
        } else {
          const newTripId = crypto.randomUUID();
          activeTrip = {
            schema_version: '0.1',
            type: 'trip',
            id: newTripId,
            title: store.detectedSavedList.listName || '探索之旅',
            status: 'planning',
            start_date: today(),
            end_date: today(),
            destinations: [store.detectedSavedList.listName || '旅行目的地'],
            tags: [store.detectedSavedList.listName || '收藏列表'],
            saved_list_name: store.detectedSavedList.listName,
            currency: store.pageDetectedCurrency || 'CNY',
            transport_mode: 'transit',
            created_at: now,
            updated_at: now,
          };
          store.state.trips = [activeTrip];
          store.state.activeTripId = newTripId;
        }
      }

      const tripId = store.state.activeTripId!;
      const updatedKnown = { ...store.state.knownPlaceIds };
      const mergedPending = new Map(store.state.pendingPlaces.map((p) => [p.id, p]));
      const listTag = store.detectedSavedList.listName;
      let importedCount = 0;

      for (const item of store.detectedSavedList.places) {
        const placeTitle = cleanExtractedText(item.title);
        if (!placeTitle || isJunkNavigationText(placeTitle)) continue;

        const found = findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, tripId, item.sourceUrl, item.sourcePlaceId);
        const stableId = found?.id ?? crypto.randomUUID();
        updatedKnown[placeIdentityKey(tripId, item.sourceUrl)] = stableId;

        const cleanAddress = item.address ? cleanExtractedText(item.address) : undefined;
        const placeArea = cleanAddress?.split(/[,，·]/)[0]?.trim() || undefined;
        const cleanNote = (!item.userNote || isJunkNavigationText(item.userNote)) ? undefined : cleanExtractedText(item.userNote);
        const cleanWhy = cleanNote || ((!item.summary || isJunkNavigationText(item.summary)) ? undefined : cleanExtractedText(item.summary));
        const combinedTags = Array.from(new Set([...(found?.tags ?? []), ...(activeTrip.tags ?? []), listTag]));

        const captured: PlannerTripPlace = {
          schema_version: '0.1',
          type: 'trip_place',
          id: stableId,
          trip_id: tripId,
          title: placeTitle,
          source_provider: item.sourceProvider || 'google_maps',
          source_url: item.sourceUrl,
          kind: inferPlaceKind(placeTitle + ' ' + (item.category || '') + ' ' + (cleanAddress || '')),
          area: found?.area ?? placeArea,
          priority: found?.priority ?? 'want',
          tags: combinedTags,
          why: found?.why ?? cleanWhy,
          signals: found?.signals ?? (item.category ? [cleanExtractedText(item.category)] : []),
          risks: found?.risks ?? [],
          notes: found?.notes ?? cleanNote,
          open_hours: item.openHours ? cleanExtractedText(item.openHours) : (found?.open_hours ?? undefined),
          address: cleanAddress ?? found?.address,
          observed_rating: found?.observed_rating ?? item.rating,
          observed_price: found?.observed_price ?? item.priceLevel,
          observed_at: today(),
          duration_minutes: found?.duration_minutes,
          preferred_window: found?.preferred_window,
          coordinates: item.coordinates ?? found?.coordinates,
          source_place_id: item.sourcePlaceId ?? found?.source_place_id,
          reservation_status: found?.reservation_status ?? 'none',
          state: found?.state ?? 'candidate',
          scheduled_date: found?.scheduled_date,
          sort_order: found?.sort_order,
          locked: found?.locked,
          created_at: found?.created_at ?? now,
          updated_at: now,
        };
        mergedPending.set(stableId, captured);
        importedCount += 1;
      }

      store.state = {
        ...store.state,
        knownPlaceIds: updatedKnown,
        pendingPlaces: [...mergedPending.values()],
      };

      void saveState().then(() => {
        setStatus(dict.savedListSynced(importedCount, listTag), 'success');
      });
    } finally {
      el.btnSmartSyncAll.classList.remove('btn-loading');
      el.btnSmartSyncAll.textContent = origText;
    }
  });

  el.btnToggleListPreview.addEventListener('click', () => {
    store.isListPreviewOpen = !store.isListPreviewOpen;
    renderSmartListCard();
  });

  // Bulk Text / Links Parser
  el.btnParseBulkImport.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      if (!store.state.activeTripId) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const text = el.bulkInputText.value.trim();
      if (!text) {
        setStatus(dict.bulkImportEmpty, 'error');
        return;
      }

      const lines = text.split(/[\r\n;]+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      el.btnParseBulkImport.classList.add('btn-loading');
      const origText = el.btnParseBulkImport.textContent;
      el.btnParseBulkImport.textContent = `⏳ ${dict.syncingBtn}`;

      try {
        setStatus(dict.parsingStatus);
        const now = new Date().toISOString();
        const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
        const updatedKnown = { ...store.state.knownPlaceIds };
        const mergedPending = new Map(store.state.pendingPlaces.map((p) => [p.id, p]));
        let importedCount = 0;
        const errors: string[] = [];

        for (const line of lines) {
          const isUrl = /^https?:\/\//i.test(line);
          if (isUrl && (line.includes('maps.app.goo.gl') || line.includes('!2s') || line.includes('placelists/list') || line.includes('goo.gl/maps'))) {
            try {
              const listItems = await resolveGoogleMapsListByUrl(line, activeTrip);
              if (listItems.length > 0) {
                for (const item of listItems) {
                  const found = findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, store.state.activeTripId, item.source_url, item.source_place_id);
                  if (found) continue;
                  item.trip_id = store.state.activeTripId;
                  item.id = crypto.randomUUID();
                  updatedKnown[placeIdentityKey(store.state.activeTripId, item.source_url)] = item.id;
                  mergedPending.set(item.id, item);
                  importedCount += 1;
                }
                continue;
              } else {
                errors.push(dict.parseNotFoundLine(line));
              }
            } catch (e: unknown) {
              errors.push(dict.parseFailedLine(line, e instanceof Error ? e.message : 'unknown'));
            }
          }

          const sourceUrl = isUrl ? line : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
          const title = isUrl ? (line.match(/\/maps\/place\/([^/?#]+)/)?.[1]?.replace(/\+/g, ' ') || line) : line;

          const found = findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, store.state.activeTripId, sourceUrl);
          if (found) continue;

          const stableId = crypto.randomUUID();
          updatedKnown[placeIdentityKey(store.state.activeTripId, sourceUrl)] = stableId;

          const place: PlannerTripPlace = {
            schema_version: '0.1',
            type: 'trip_place',
            id: stableId,
            trip_id: store.state.activeTripId,
            title: safeDecodeUri(title),
            source_provider: inferSourceProvider(sourceUrl),
            source_url: sourceUrl,
            kind: inferPlaceKind(safeDecodeUri(title)),
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
          mergedPending.set(stableId, place);
          importedCount += 1;
        }

        store.state = {
          ...store.state,
          knownPlaceIds: updatedKnown,
          pendingPlaces: [...mergedPending.values()],
        };

        await saveState();
        el.bulkInputText.value = '';
        if (errors.length > 0) {
          setStatus(dict.importedWithWarnings(importedCount, errors.join(', ')), 'success');
        } else {
          setStatus(dict.importedCount(importedCount), 'success');
        }
      } finally {
        el.btnParseBulkImport.classList.remove('btn-loading');
        el.btnParseBulkImport.textContent = origText;
      }
    })();
  });

  el.btnToggleSelectAll.addEventListener('click', () => {
    const checkboxes = el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every((c) => c.checked);
    checkboxes.forEach((c) => { c.checked = !allChecked; });
  });

  el.btnBatchAdd.addEventListener('click', () => {
    const dict = t();
    if (!store.state.activeTripId) {
      setStatus(dict.tripRequiredError, 'error');
      return;
    }
    const checkboxes = el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
    const selectedUrls = new Set(Array.from(checkboxes).map((c) => c.dataset.url).filter(Boolean));
    const allPlaces = (store.detectedSavedList?.places && store.detectedSavedList.places.length > 0)
      ? store.detectedSavedList.places
      : store.detectedListPlaces;
    const toAdd = allPlaces.filter((item) => selectedUrls.has(item.sourceUrl));
    if (toAdd.length === 0) return;

    const now = new Date().toISOString();
    const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
    const tripId = store.state.activeTripId;
    const updatedKnown = { ...store.state.knownPlaceIds };
    const mergedPending = new Map(store.state.pendingPlaces.map((p) => [p.id, p]));
    let addedCount = 0;

    for (const item of toAdd) {
      const found = findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, tripId, item.sourceUrl, item.sourcePlaceId);
      if (found) continue;
      const stableId = crypto.randomUUID();
      updatedKnown[placeIdentityKey(tripId, item.sourceUrl)] = stableId;

      const place: PlannerTripPlace = {
        schema_version: '0.1',
        type: 'trip_place',
        id: stableId,
        trip_id: tripId,
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
        coordinates: item.coordinates,
        source_place_id: item.sourcePlaceId,
        reservation_status: 'none',
        state: 'candidate',
        created_at: now,
        updated_at: now,
      };
      mergedPending.set(stableId, place);
      addedCount += 1;
    }

    store.state = {
      ...store.state,
      knownPlaceIds: updatedKnown,
      pendingPlaces: [...mergedPending.values()],
    };

    void saveState().then(() => {
      setStatus(dict.batchAddedSuccess(addedCount), 'success');
    });
  });

  // Edit active trip form submission
  el.editTripForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const dict = t();
    if (!store.state.activeTripId) return;

    const title = el.editTripTitle.value.trim();
    const start = el.editTripStart.value;
    const end = el.editTripEnd.value;
    if (!title || !start || !end || end < start) {
      setStatus(dict.tripValidateError, 'error');
      return;
    }

    const tripTags = normalizeDelimitedText(el.editTripTags.value);
    const now = new Date().toISOString();

    store.state = {
      ...store.state,
      trips: store.state.trips.map((trip) => {
        if (trip.id !== store.state.activeTripId) return trip;
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
    if (!store.state.activeTripId) return;
    const trip = store.state.trips.find((item) => item.id === store.state.activeTripId);
    if (!trip) return;

    if (!window.confirm(dict.confirmDeleteTrip(trip.title))) return;

    const deletedTripId = store.state.activeTripId;
    const remainingTrips = store.state.trips.filter((item) => item.id !== deletedTripId);
    const nextActiveId = remainingTrips[0]?.id || null;

    store.state = {
      ...store.state,
      trips: remainingTrips,
      activeTripId: nextActiveId,
      pendingPlaces: store.state.pendingPlaces.filter((p) => p.trip_id !== deletedTripId),
    };

    void saveState().then(() => {
      setStatus(dict.tripDeletedSuccess, 'success');
    });
  });

  el.tripForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const trip = createTripFromForm();
    if (!trip) return;
    store.state = { ...store.state, trips: [...store.state.trips, trip], activeTripId: trip.id };
    void saveState().then(() => {
      el.tripForm.reset();
      el.tripCurrency.value = store.pageDetectedCurrency || 'CNY';
      el.tripTransport.value = 'transit';
      setStatus(t().tripCreated(trip.title), 'success');
    });
  });

  el.tripSelect.addEventListener('change', () => {
    store.state = { ...store.state, activeTripId: el.tripSelect.value || null };
    void saveState();
    populateEditTripForm();
    const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
    if (activeTrip?.tags?.length && !el.tags.value) {
      el.tags.value = activeTrip.tags.join(', ');
    }
  });

  el.refreshPlace.addEventListener('click', () => {
    store.userDismissedPlaceUrl = null;
    void readCurrentPlace();
  });

  el.btnRemoveCandidate.addEventListener('click', () => {
    const dict = t();
    if (!store.currentPlace || !store.state.activeTripId) return;
    const existing = getExistingPlaceForUrl(store.currentPlace.sourceUrl, store.currentPlace.sourcePlaceId);
    if (!existing) return;

    store.state = { ...store.state, pendingPlaces: store.state.pendingPlaces.filter((p) => p.id !== existing.id) };
    void saveState().then(() => {
      el.captureForm.reset();
      el.kind.value = 'attraction';
      el.priority.value = 'want';
      syncQuickChipStates();
      setStatus(dict.candidateRemoved, 'success');
    });
  });

  el.captureForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const dict = t();
    if (!store.state.activeTripId) {
      setStatus(dict.tripRequiredError, 'error');
      return;
    }
    if (!store.currentPlace) {
      setStatus(dict.placeRequiredError, 'error');
      return;
    }

    const duration = Number(el.duration.value);
    const rating = Number(el.rating.value);
    const now = new Date().toISOString();
    const existing = findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, store.state.activeTripId, store.currentPlace.sourceUrl, store.currentPlace.sourcePlaceId);
    const stableId = existing?.id ?? crypto.randomUUID();
    const placeKey = placeIdentityKey(store.state.activeTripId, store.currentPlace.sourceUrl);

    const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);
    const placeTags = normalizeDelimitedText(el.tags.value);
    const combinedTags = Array.from(new Set([...(activeTrip?.tags ?? []), ...placeTags]));

    const place: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: stableId,
      trip_id: store.state.activeTripId,
      title: cleanExtractedText(store.currentPlace.title),
      source_provider: store.currentPlace.sourceProvider || 'google_maps',
      source_url: store.currentPlace.sourceUrl,
      kind: el.kind.value as PlannerPlaceKind,
      area: cleanExtractedText(el.area.value.trim()) || undefined,
      priority: el.priority.value as PlannerPlacePriority,
      tags: combinedTags,
      why: cleanExtractedText(el.why.value.trim()) || undefined,
      signals: normalizeDelimitedText(el.signals.value).map(cleanExtractedText).filter(Boolean),
      risks: normalizeDelimitedText(el.risks.value).map(cleanExtractedText).filter(Boolean),
      notes: cleanExtractedText(el.notes.value.trim()) || undefined,
      observed_rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
      observed_price: el.price.value.trim() || undefined,
      observed_at: today(),
      preferred_window: el.window.value.trim() || undefined,
      duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.min(1440, Math.round(duration)) : undefined,
      open_hours: cleanExtractedText(store.currentPlace.openHours ?? existing?.open_hours) || undefined,
      address: cleanExtractedText(store.currentPlace.address ?? existing?.address) || undefined,
      coordinates: store.currentPlace.coordinates ?? existing?.coordinates,
      source_place_id: store.currentPlace.sourcePlaceId ?? existing?.source_place_id,
      reservation_status: existing?.reservation_status ?? 'none',
      state: existing?.state ?? 'candidate',
      scheduled_date: existing?.scheduled_date,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    store.state = {
      ...store.state,
      knownPlaceIds: { ...store.state.knownPlaceIds, [placeKey]: place.id },
      pendingPlaces: [...store.state.pendingPlaces.filter((item) => item.id !== place.id), place],
    };
    void saveState().then(() => {
      syncQuickChipStates();
      setStatus(existing ? dict.candidateUpdated : dict.candidateAdded, 'success');
      if (!existing) flashNewCandidate(place.id);
    });
  });

  el.captureForm.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      el.btnCaptureSubmit.click();
    }
  });

  initDragReorder();
  initCandidateDelegation();
}
