import { expandAndExtractListId, resolveGoogleMapsListByUrl } from '../api';
import {
  checkOpeningHoursCollision,
  ensurePlaceKindTag,
  findExistingTripPlace,
  inferPlaceKind,
  inferSourceProvider,
  normalizeDelimitedText,
  placeIdentityKey,
  reorderPendingPlaces,
  type PlannerPlaceKind,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from '../../domain/planner';
import { mergeWriteCaptureState, normalizeCaptureState, saveCaptureStateViaWorker, writeCaptureState } from '../capture-state';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { el } from '../dom';
import { cleanExtractedText, isJunkNavigationText, safeDecodeUri, today } from '../utils';
import { readCurrentPlace } from './capture';
import { getExistingPlaceForUrl, MAP_CURRENCY_OVERRIDE_KEY, MAP_CURRENCY_OVERRIDE_ORIGIN_KEY, store, t } from './store';
import {
  applyI18n,
  autoFillPlaceForm,
  populateEditTripForm,
  renderCandidatesList,
  renderCurrencyPill,
  renderCurrentPlace,
  renderSmartListCard,
  renderState,
  setStatus,
  syncQuickChipStates,
} from './ui';

const LANG_STORAGE_KEY = 'ownlyCaptureLang';

export async function saveState(): Promise<void> {
  try {
    // Merge-write inside the single-writer queue: quick captures added by the
    // background worker in between survive; locally deleted ids never return.
    const viaWorker = await saveCaptureStateViaWorker(store.state, store.locallyDeletedIds);
    if (viaWorker?.ok && viaWorker.state) {
      store.state = viaWorker.state;
    } else {
      store.state = await mergeWriteCaptureState(store.state, store.locallyDeletedIds);
    }
    store.locallyDeletedIds.clear();
  } catch (error) {
    console.warn('[Ownly Capture] Failed to persist capture state', error);
    setStatus(
      store.lang === 'zh'
        ? '⚠️ 状态保存失败：请重试或重新打开侧栏（扩展可能刚被重载）。'
        : '⚠️ Failed to save state. Retry or reopen the panel (the extension may have been reloaded).',
      'error',
    );
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

let searchDebounce: number | undefined;

function nextSortOrderFor(date: string): number {
  return store.state.pendingPlaces
    .filter((p) => p.trip_id === store.state.activeTripId && p.scheduled_date === date)
    .reduce((max, p) => Math.max(max, p.sort_order ?? -1), -1) + 1;
}

function applyBulk(mutate: (place: PlannerTripPlace, value?: string) => PlannerTripPlace, value?: string): void {
  const dict = t();
  if (store.bulkSelected.size === 0) return;
  const ids = new Set(store.bulkSelected);
  store.state = {
    ...store.state,
    pendingPlaces: store.state.pendingPlaces.map((p) => (ids.has(p.id) ? mutate(p, value) : p)),
  };
  const count = ids.size;
  store.bulkSelected.clear();
  void saveState().then(() => setStatus(dict.bulkApplied(count), 'success'));
}

function buildPlaceFromDetected(
  item: CurrentResearchPlace,
  tripId: string,
  tripTags: string[],
  now: string,
): PlannerTripPlace {
  const cleanTitle = cleanExtractedText(item.title);
  const cleanAddress = item.address ? cleanExtractedText(item.address) : undefined;
    const inferredKind = inferPlaceKind(cleanTitle + ' ' + (item.category || '') + ' ' + (cleanAddress || ''));
    return {
      schema_version: '0.1',
      type: 'trip_place',
      id: crypto.randomUUID(),
      trip_id: tripId,
      title: cleanTitle,
      source_provider: item.sourceProvider || 'google_maps',
      source_url: item.sourceUrl,
      kind: inferredKind,
      area: cleanAddress?.split(/[,，·]/)[0]?.trim() || undefined,
      priority: 'want',
      tags: ensurePlaceKindTag(
        tripTags,
        inferredKind,
        store.lang,
      ),
      why: item.userNote || item.summary || undefined,
      signals: [],
      risks: [],
    notes: item.userNote || undefined,
    open_hours: item.openHours ? cleanExtractedText(item.openHours) : undefined,
    address: cleanAddress,
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
}

/**
 * Bulk-paste list resolution that prefers the active Maps tab's content script
 * (correct authuser/cookie context for multi-account users), falling back to
 * the legacy side-panel fetch when no tab is available.
 */
async function resolveListPlacesSmart(
  line: string,
  activeTrip?: PlannerTrip,
): Promise<PlannerTripPlace[] | null> {
  const ref = await expandAndExtractListId(line);
  if (!ref) return null;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && /^https:\/\/(www\.google\.[a-z.]+|maps\.google\.[a-z.]+)/i.test(tab.url ?? '')) {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_FETCH_LIST_BY_ID',
        listUrl: ref.finalUrl,
        listId: ref.listId,
      }) as { savedList?: DetectedSavedList | null } | undefined;
      if (resp && 'savedList' in resp) {
        const places = resp.savedList?.places ?? [];
        const now = new Date().toISOString();
        const tripTags = activeTrip?.tags ?? [];
        return places.map((p) => buildPlaceFromDetected(p, activeTrip?.id || '', tripTags, now));
      }
    }
  } catch {}

  return resolveGoogleMapsListByUrl(line, activeTrip);
}



async function revealPlaceInMaps(sourceUrl: string): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return;
    if (!/^https:\/\/(www\.google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl)/i.test(tab.url)) return;
    await chrome.tabs.update(tab.id, { url: sourceUrl });
  } catch {}
}

/**
 * Candidate pool drag-to-reorder: the ⠿ grip starts the drag, cards highlight
 * as drop targets, and dropping reorders the visible subset via the domain
 * helper (hidden/filtered places keep their absolute slots) then persists.
 */
function initCandidateDragReorder(): void {
  let draggedPlaceId: string | null = null;

  const clearDropMarkers = (): void => {
    el.candidatesListContainer.querySelectorAll<HTMLElement>('.candidate-card.drop-target')
      .forEach((card) => card.classList.remove('drop-target'));
  };

  el.candidatesListContainer.addEventListener('dragstart', (e) => {
    const grip = (e.target as HTMLElement).closest<HTMLElement>('.grip');
    const card = grip?.closest<HTMLElement>('.candidate-card');
    if (!grip || !card) return;
    draggedPlaceId = card.dataset.placeId || null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedPlaceId || '');
    }
    card.classList.add('dragging');
  });

  el.candidatesListContainer.addEventListener('dragend', () => {
    draggedPlaceId = null;
    clearDropMarkers();
    el.candidatesListContainer.querySelectorAll<HTMLElement>('.candidate-card.dragging')
      .forEach((card) => card.classList.remove('dragging'));
  });

  el.candidatesListContainer.addEventListener('dragover', (e) => {
    if (!draggedPlaceId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    clearDropMarkers();
    const card = (e.target as HTMLElement).closest<HTMLElement>('.candidate-card');
    if (card && card.dataset.placeId !== draggedPlaceId) card.classList.add('drop-target');
  });

  el.candidatesListContainer.addEventListener('drop', (e) => {
    if (!draggedPlaceId) return;
    e.preventDefault();
    const targetCard = (e.target as HTMLElement).closest<HTMLElement>('.candidate-card');
    const sourceId = draggedPlaceId;
    draggedPlaceId = null;
    clearDropMarkers();
    if (!targetCard) return;
    const targetId = targetCard.dataset.placeId;
    if (!targetId || targetId === sourceId) return;

    const visibleIds = Array.from(el.candidatesListContainer.querySelectorAll<HTMLElement>('.candidate-card'))
      .map((card) => card.dataset.placeId)
      .filter((id): id is string => Boolean(id));
    const fromIdx = visibleIds.indexOf(sourceId);
    const toIdx = visibleIds.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    visibleIds.splice(toIdx, 0, visibleIds.splice(fromIdx, 1)[0]);
    store.state = { ...store.state, pendingPlaces: reorderPendingPlaces(store.state.pendingPlaces, visibleIds) };
    void saveState();
  });
}

function initCandidateDelegation() {
  el.candidatesListContainer.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.bulk-check')) {
      const chk = target as HTMLInputElement;
      const id = chk.dataset.placeId;
      if (!id) return;
      if (chk.checked) store.bulkSelected.add(id);
      else store.bulkSelected.delete(id);
      chk.closest<HTMLElement>('.candidate-card')?.classList.toggle('bulk-selected', chk.checked);
      return;
    }
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
      if (selectedDate) {
        const changed = store.state.pendingPlaces.find((p) => p.id === placeId);
        const col = checkOpeningHoursCollision(changed?.open_hours, selectedDate);
        if (col.isCollision) setStatus(t().dayConflictWarn(col.reason ?? ''), 'error');
      }
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
      if (store.editingCandidateId === placeId) {
        scrollCardIntoView(placeId, true);
        const editing = store.state.pendingPlaces.find((p) => p.id === placeId);
        if (editing) {
          store.currentPlace = {
            title: editing.title,
            sourceUrl: editing.source_url,
            sourceProvider: editing.source_provider,
            sourcePlaceId: editing.source_place_id,
            category: editing.kind,
            address: editing.address,
            coordinates: editing.coordinates,
            rating: editing.observed_rating,
            priceLevel: editing.observed_price,
            summary: editing.why,
            userNote: editing.notes,
            openHours: editing.open_hours,
            phone: editing.phone,
            plusCode: editing.plus_code,
            menuUrl: editing.menu_url,
            reservationUrl: editing.reservation_url,
            reviewTopics: editing.review_topics,
            types: editing.types,
          };
          renderCurrentPlace();
          autoFillPlaceForm(store.currentPlace);
          syncQuickChipStates();
          if (editing.source_url) void revealPlaceInMaps(editing.source_url);
        }
      }
    } else if (action === 'delete') {
      store.locallyDeletedIds.add(placeId);
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
      const priceInput = form.querySelector<HTMLInputElement>('input[name="price"]');
      const ratingInput = form.querySelector<HTMLInputElement>('input[name="rating"]');
      const durationInput = form.querySelector<HTMLInputElement>('input[name="duration"]');
      const tagsInput = form.querySelector<HTMLInputElement>('input[name="tags"]');
      const notesTextarea = form.querySelector<HTMLTextAreaElement>('textarea[name="notes"]');

      const newKind = (kindSelect?.value || 'attraction') as PlannerPlaceKind;
      const newPriority = (prioritySelect?.value || 'want') as PlannerPlacePriority;
      const newPrice = priceInput ? cleanExtractedText(priceInput.value) || undefined : undefined;
      const numRating = ratingInput ? parseFloat(ratingInput.value) : NaN;
      const numDuration = durationInput ? parseInt(durationInput.value, 10) : NaN;
      const rawTags = tagsInput ? normalizeDelimitedText(tagsInput.value).map(cleanExtractedText).filter(Boolean) : [];
      const newTags = ensurePlaceKindTag(rawTags, newKind, store.lang);
      const newNotes = notesTextarea ? cleanExtractedText(notesTextarea.value) || undefined : undefined;

      store.state = {
        ...store.state,
        pendingPlaces: store.state.pendingPlaces.map((p) => {
          if (p.id !== placeId) return p;
          return {
            ...p,
            kind: newKind,
            priority: newPriority,
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
    if (searchDebounce !== undefined) window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      searchDebounce = undefined;
      store.searchQuery = el.candidatesSearch.value;
      renderCandidatesList();
    }, 180);
  });

  el.btnBulkToggle.addEventListener('click', () => {
    store.bulkMode = !store.bulkMode;
    if (!store.bulkMode) store.bulkSelected.clear();
    el.bulkActionBar.style.display = store.bulkMode ? 'flex' : 'none';
    el.btnBulkToggle.textContent = store.bulkMode ? t().bulkExitBtn : '☑️';
    renderCandidatesList();
  });

  el.btnBulkExit.addEventListener('click', () => {
    store.bulkMode = false;
    store.bulkSelected.clear();
    el.bulkActionBar.style.display = 'none';
    el.btnBulkToggle.textContent = '☑️';
    renderCandidatesList();
  });

  el.btnBulkDelete.addEventListener('click', () => {
    const dict = t();
    if (store.bulkSelected.size === 0) return;
    const anchors = store.state.pendingPlaces.filter((p) => store.bulkSelected.has(p.id) && p.is_anchor);
    if (anchors.length > 0) {
      setStatus(dict.anchorProtected, 'error');
      for (const a of anchors) store.bulkSelected.delete(a.id);
      if (store.bulkSelected.size === 0) return;
    }
    const ids = new Set(store.bulkSelected);
    for (const id of ids) store.locallyDeletedIds.add(id);
    store.state = { ...store.state, pendingPlaces: store.state.pendingPlaces.filter((p) => !ids.has(p.id)) };
    store.bulkSelected.clear();
    void saveState().then(() => setStatus(dict.candidateRemoved, 'success'));
  });

  el.bulkPrioritySelect.addEventListener('change', () => {
    applyBulk((place, value) => ({ ...place, priority: value as PlannerPlacePriority }));
    el.bulkPrioritySelect.value = '';
  });

  el.bulkDaySelect.addEventListener('change', () => {
    const date = el.bulkDaySelect.value;
    if (!date) return;
    applyBulk((place) => ({
      ...place,
      scheduled_date: date,
      state: 'scheduled' as const,
      sort_order: nextSortOrderFor(date),
    }));
    el.bulkDaySelect.value = '';
  });

  // Currency selector: user picks the MAP currency used to read prices on this
  // page. AUTO restores auto-detection. Trip currency (stats base) is untouched.
  el.currencySelector.addEventListener('change', () => {
    const dict = t();
    const selected = el.currencySelector.value;
    if (!selected) return;
    store.mapCurrencyOverride = selected === 'AUTO' ? undefined : selected;

    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        let origin: string | undefined = undefined;
        if (currentTab?.url) {
          try { origin = new URL(currentTab.url).origin; } catch {}
        }
        store.mapCurrencyOverrideOrigin = store.mapCurrencyOverride ? origin : undefined;

        await chrome.storage.local.set({
          [MAP_CURRENCY_OVERRIDE_KEY]: store.mapCurrencyOverride || '',
          [MAP_CURRENCY_OVERRIDE_ORIGIN_KEY]: store.mapCurrencyOverrideOrigin || '',
        });

        if (currentTab?.id) {
          await chrome.tabs.sendMessage(currentTab.id, {
            type: 'OWNLY_CURRENCY_OVERRIDE_CHANGED',
            overrideCurrency: store.mapCurrencyOverride,
          });
        }
      } catch {}
    })();

    if (store.mapCurrencyOverride) {
      store.pageDetectedCurrency = store.mapCurrencyOverride;
      if (store.currentPlace) {
        store.currentPlace = { ...store.currentPlace, detectedCurrency: store.mapCurrencyOverride };
      }
      if (store.detectedSavedList) {
        store.detectedSavedList = { ...store.detectedSavedList, detectedCurrency: store.mapCurrencyOverride };
      }
    }

    renderCurrencyPill();
    renderCurrentPlace();
    setStatus(dict.currencyApplied(selected), 'success');
  });

  // Re-detect currency on demand
  el.btnRedetectCurrency.addEventListener('click', () => {
    store.mapCurrencyOverride = undefined;
    store.mapCurrencyOverrideOrigin = undefined;
    void chrome.storage.local.set({
      [MAP_CURRENCY_OVERRIDE_KEY]: '',
      [MAP_CURRENCY_OVERRIDE_ORIGIN_KEY]: '',
    });

    const activeTrip = store.state.trips.find((t) => t.id === store.state.activeTripId);
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          const response = (await chrome.tabs.sendMessage(tabs[0].id, {
            type: 'OWNLY_REDETECT_PAGE_CURRENCY',
            targetCurrency: activeTrip?.currency,
          })) as { detectedCurrency?: string } | undefined;
          const detected = response?.detectedCurrency || 'USD';
          store.pageDetectedCurrency = detected;
          if (store.currentPlace) {
            store.currentPlace = { ...store.currentPlace, detectedCurrency: detected };
          }
          renderCurrencyPill();
          renderCurrentPlace();
          setStatus(
            store.lang === 'zh' ? `已重新检测页面货币：${detected}` : `Page currency re-detected: ${detected}`,
            'success',
          );
        }
      } catch {}
    })();
  });

  // Select all / deselect all in bulk mode
  el.btnSelectAllCandidates.addEventListener('click', () => {
    const checkboxes = el.candidatesListContainer.querySelectorAll<HTMLInputElement>('.bulk-check');
    const allChecked = [...checkboxes].every((c) => c.checked);
    checkboxes.forEach((c) => { c.checked = !allChecked; });
    if (allChecked) store.bulkSelected.clear();
    else checkboxes.forEach((c) => { if (c.dataset.placeId) store.bulkSelected.add(c.dataset.placeId); });
  });

  el.btnBackupState.addEventListener('click', () => {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), captureState: store.state }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ownly-capture-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(t().backupSaved, 'success');
  });

  el.btnRestoreState.addEventListener('click', () => el.fileRestoreState.click());

  el.fileRestoreState.addEventListener('change', () => {
    void (async () => {
      const file = el.fileRestoreState.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text()) as { captureState?: unknown };
        if (!window.confirm(t().confirmRestore)) return;
        const next = normalizeCaptureState(parsed.captureState ?? parsed);
        await writeCaptureState(next);
        store.state = next;
        renderState();
        populateEditTripForm();
        renderCurrentPlace();
        renderSmartListCard();
        renderCandidatesList();
        setStatus(t().restoredCount(next.pendingPlaces.length), 'success');
      } catch {
        setStatus(store.lang === 'zh' ? '备份文件无效。' : 'Invalid backup file.', 'error');
      }
      el.fileRestoreState.value = '';
    })();
  });

  el.btnCloseSmartList.addEventListener('click', () => {
    store.smartListDismissed = true;
    renderSmartListCard();
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
      let droppedCount = 0;
      const incomingIds = new Set<string>();

      for (const item of store.detectedSavedList.places) {
        const placeTitle = cleanExtractedText(item.title);
        if (!placeTitle || isJunkNavigationText(placeTitle)) continue;

        const found = findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, tripId, item.sourceUrl, item.sourcePlaceId);
        const idKey = placeIdentityKey(tripId, item.sourceUrl);
        const stableId = found?.id ?? store.state.knownPlaceIds[idKey] ?? crypto.randomUUID();
        updatedKnown[idKey] = stableId;
        incomingIds.add(stableId);

        const cleanAddress = item.address ? cleanExtractedText(item.address) : undefined;
        const placeArea = cleanAddress?.split(/[,，·]/)[0]?.trim() || undefined;
        const cleanNote = (!item.userNote || isJunkNavigationText(item.userNote)) ? undefined : cleanExtractedText(item.userNote);
        const cleanWhy = cleanNote || ((!item.summary || isJunkNavigationText(item.summary)) ? undefined : cleanExtractedText(item.summary));
        const inferredKind = inferPlaceKind(placeTitle + ' ' + (item.category || '') + ' ' + (cleanAddress || ''));
        const combinedTags = ensurePlaceKindTag(
          Array.from(new Set([...(found?.tags ?? []), ...(activeTrip.tags ?? []), listTag])),
          inferredKind,
          store.lang,
        );

        const captured: PlannerTripPlace = {
          schema_version: '0.1',
          type: 'trip_place',
          id: stableId,
          trip_id: tripId,
          title: placeTitle,
          source_provider: item.sourceProvider || 'google_maps',
          source_url: item.sourceUrl,
          kind: inferredKind,
          area: found?.area ?? placeArea,
          priority: found?.priority ?? 'want',
          tags: combinedTags,
          why: found?.why ?? cleanWhy,
          signals: found?.signals ?? [],
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
      phone: item.phone ?? found?.phone,
      plus_code: item.plusCode ?? found?.plus_code,
      menu_url: item.menuUrl ?? found?.menu_url,
      reservation_url: item.reservationUrl ?? found?.reservation_url,
      review_topics: item.reviewTopics ?? found?.review_topics,
      types: item.types ?? found?.types,
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

      const missing = store.state.pendingPlaces.filter((p) =>
        p.trip_id === tripId
        && p.state === 'candidate'
        && !p.scheduled_date
        && p.tags.includes(listTag)
        && !incomingIds.has(p.id));
      if (missing.length > 0 && window.confirm(dict.removedDetected(missing.length, listTag))) {
        const dropIds = new Set(missing.map((m) => m.id));
        for (const [id, place] of mergedPending) {
          if (dropIds.has(id)) mergedPending.set(id, { ...place, state: 'dropped' as const, updated_at: new Date().toISOString() });
        }
        droppedCount = missing.length;
      }

      store.state = {
        ...store.state,
        knownPlaceIds: updatedKnown,
        pendingPlaces: [...mergedPending.values()],
      };

      void saveState().then(() => {
        setStatus(dict.savedListSynced(importedCount, listTag) + (droppedCount > 0 ? ` · ${dict.markedDropped(droppedCount)}` : ''), 'success');
        store.smartListDismissed = true;
        renderSmartListCard();
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
              const listItems = await resolveListPlacesSmart(line, activeTrip);
              if (listItems && listItems.length > 0) {
                for (const item of listItems) {
                  const found = findExistingTripPlace(store.state.knownPlaceIds, store.state.pendingPlaces, store.state.activeTripId, item.source_url, item.source_place_id);
                  if (found) continue;
                  item.trip_id = store.state.activeTripId;
                  const idKey = placeIdentityKey(store.state.activeTripId, item.source_url);
                  item.id = store.state.knownPlaceIds[idKey] ?? crypto.randomUUID();
                  updatedKnown[idKey] = item.id;
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

          const idKey = placeIdentityKey(store.state.activeTripId, sourceUrl);
          const stableId = store.state.knownPlaceIds[idKey] ?? crypto.randomUUID();
          updatedKnown[idKey] = stableId;

          const inferredKind = inferPlaceKind(safeDecodeUri(title));
          const place: PlannerTripPlace = {
            schema_version: '0.1',
            type: 'trip_place',
            id: stableId,
            trip_id: store.state.activeTripId,
            title: safeDecodeUri(title),
            source_provider: inferSourceProvider(sourceUrl),
            source_url: sourceUrl,
            kind: inferredKind,
            priority: 'want',
            tags: ensurePlaceKindTag(activeTrip?.tags ?? [], inferredKind, store.lang),
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
      const idKey = placeIdentityKey(tripId, item.sourceUrl);
      const stableId = store.state.knownPlaceIds[idKey] ?? crypto.randomUUID();
      updatedKnown[idKey] = stableId;

      const inferredKind = inferPlaceKind((item.title || '') + ' ' + (item.category || '') + ' ' + (item.address || ''));
      const place: PlannerTripPlace = {
        schema_version: '0.1',
        type: 'trip_place',
        id: stableId,
        trip_id: tripId,
        title: item.title,
        source_provider: item.sourceProvider || 'google_maps',
        source_url: item.sourceUrl,
        kind: inferredKind,
        priority: 'want',
        tags: ensurePlaceKindTag(activeTrip?.tags ?? [], inferredKind, store.lang),
        why: item.userNote || item.summary,
        signals: [],
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
    const removedPlaces = store.state.pendingPlaces.filter((p) => p.trip_id === deletedTripId);
    for (const place of removedPlaces) store.locallyDeletedIds.add(place.id);

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

    store.locallyDeletedIds.add(existing.id);
    store.state = { ...store.state, pendingPlaces: store.state.pendingPlaces.filter((p) => p.id !== existing.id) };
    void saveState().then(() => {
      el.captureForm.reset();
      el.kind.value = 'attraction';
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
    // Reuse the identity of an already-synced (acked) place so a re-capture
    // updates the Vault entry instead of creating a duplicate.
    const placeKey = placeIdentityKey(store.state.activeTripId, store.currentPlace.sourceUrl);
    const stableId = existing?.id ?? store.state.knownPlaceIds[placeKey] ?? crypto.randomUUID();

    const selectedKind = (el.kind.value as PlannerPlaceKind) || 'other';
    const placeTags = normalizeDelimitedText(el.tags.value);
    const combinedTags = ensurePlaceKindTag(
      placeTags,
      selectedKind,
      store.lang,
    );

    const place: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: stableId,
      trip_id: store.state.activeTripId,
      title: cleanExtractedText(store.currentPlace.title),
      source_provider: store.currentPlace.sourceProvider || 'google_maps',
      source_url: store.currentPlace.sourceUrl,
      kind: selectedKind,
      area: cleanExtractedText(el.area.value.trim()) || undefined,
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
      phone: store.currentPlace.phone ?? existing?.phone,
      plus_code: store.currentPlace.plusCode ?? existing?.plus_code,
      menu_url: store.currentPlace.menuUrl ?? existing?.menu_url,
      reservation_url: store.currentPlace.reservationUrl ?? existing?.reservation_url,
      review_topics: store.currentPlace.reviewTopics ?? existing?.review_topics,
      types: (() => {
        const merged = new Set<string>([...(store.currentPlace.types ?? []), ...(existing?.types ?? [])]);
        return merged.size > 0 ? [...merged] : undefined;
      })(),
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
      flashNewCandidate(place.id);
    });
  });

  el.captureForm.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      el.btnCaptureSubmit.click();
    }
  });

  el.kind.addEventListener('change', () => {
    const newKind = (el.kind.value as PlannerPlaceKind) || 'other';
    el.price.placeholder = newKind === 'stay'
      ? t().pricePlaceholderStay
      : t().pricePlaceholder;
    const currentTags = normalizeDelimitedText(el.tags.value);
    el.tags.value = ensurePlaceKindTag(currentTags, newKind, store.lang).join(', ');
  });

  void chrome.storage.local.get('ownly_fx_tooltip_enabled').then((data) => {
    el.toggleFxTooltip.checked = data.ownly_fx_tooltip_enabled !== false;
  }).catch(() => {});

  el.toggleFxTooltip.addEventListener('change', () => {
    const isEnabled = el.toggleFxTooltip.checked;
    void chrome.runtime.sendMessage({ type: 'OWNLY_SET_FX_TOOLTIP_ENABLED', enabled: isEnabled });
  });

  initCandidateDelegation();
  initCandidateDragReorder();
}


