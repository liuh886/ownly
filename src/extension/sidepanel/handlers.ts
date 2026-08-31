import { expandAndExtractListId, resolveGoogleMapsListByUrl } from '../api';
import {
  ensurePlaceKindTag,
  findExistingTripPlace,
  inferPlaceKind,
  inferSourceProvider,
  mergeCapturedPlaceResearch,
  normalizeDelimitedText,
  normalizeObservedPrice,
  reorderPendingPlaces,
  type PlannerPlaceKind,
  type PlannerPlacePriority,
  type CaptureContext,
  type PlannerTripPlace,
} from '../../domain/planner';
import { normalizeCaptureState, saveCaptureStateViaWorker, writeCaptureState } from '../capture-state';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { el } from '../dom';
import { cleanExtractedText, isJunkNavigationText, safeDecodeUri, today } from '../utils';
import { readCurrentPlace } from './capture';
import { enrichCandidatePlacesBatch, mergeDetectedResearchIntoPlannerPlaces } from '../enrichment';
import { DEBUG_STORAGE_KEY, getExistingPlaceForUrl, store, t } from './store';
import {
  applyI18n,
  autoFillPlaceForm,
  renderCandidatesList,
  renderCurrencyPill,
  renderCurrentPlace,
  renderSmartListCard,
  renderState,
  setStatus,
  syncQuickChipStates,
  updateDebugLogViewer,
} from './ui';
import { logger } from '../logger';

const LANG_STORAGE_KEY = 'ownlyCaptureLang';

export async function saveState(): Promise<void> {
  try {
    const viaWorker = await saveCaptureStateViaWorker(store.state, store.locallyDeletedIds);
    store.state = viaWorker.state;
    store.locallyDeletedIds.clear();
  } catch (error) {
    console.warn('[Ownly Capture] Failed to persist capture state', error);
    setStatus(t().saveStateFailed, 'error');
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

function mergeEnrichedPendingPlace(
  current: PlannerTripPlace,
  enrichedById: ReadonlyMap<string, PlannerTripPlace>,
): PlannerTripPlace {
  const enriched = enrichedById.get(current.id);
  return enriched ? mergeCapturedPlaceResearch(current, enriched) : current;
}

function isGoogleMapsTabUrl(url = ''): boolean {
  return /^https:\/\/(www\.google\.[a-z.]+|maps\.google\.[a-z.]+)\/maps(?:\/|$)/i.test(url);
}

async function findGoogleMapsTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.find((tab) => tab.active && isGoogleMapsTabUrl(tab.url))
    ?? tabs.find((tab) => isGoogleMapsTabUrl(tab.url));
}

function researchPlaceFromPlanner(place: PlannerTripPlace): CurrentResearchPlace {
  return {
    title: place.title,
    sourceUrl: place.source_url,
    sourceProvider: place.source_provider,
    sourcePlaceId: place.source_place_id,
    rating: place.observed_rating,
    reviewCount: place.observed_review_count,
    category: place.source_category,
    priceLevel: place.observed_price,
    detectedCurrency: place.price_currency,
    address: place.address,
    coordinates: place.coordinates,
    openHours: place.open_hours,
    phone: place.phone,
    plusCode: place.plus_code,
    menuUrl: place.menu_url,
    reservationUrl: place.reservation_url,
    reviewTopics: place.review_topics,
    types: place.types,
  };
}

function formatStrengthenCoverage(places: PlannerTripPlace[]): string {
  const total = places.length;
  const rating = places.filter((place) => place.observed_rating !== undefined).length;
  const reviews = places.filter((place) => place.observed_review_count !== undefined).length;
  const price = places.filter((place) => Boolean(place.observed_price && place.observed_price !== '0' && !/^SGD\s*0$/i.test(place.observed_price))).length;
  const category = places.filter((place) => Boolean(place.source_category)).length;
  const address = places.filter((place) => Boolean(place.address)).length;
  const coordinates = places.filter((place) => Boolean(place.coordinates)).length;
  return store.lang === 'zh'
    ? `评分 ${rating}/${total} · 评论 ${reviews}/${total} · 价格 ${price}/${total} · 分类 ${category}/${total} · 地址 ${address}/${total} · 坐标 ${coordinates}/${total}`
    : `rating ${rating}/${total} · reviews ${reviews}/${total} · price ${price}/${total} · category ${category}/${total} · address ${address}/${total} · coordinates ${coordinates}/${total}`;
}

async function strengthenCandidatesThroughMaps(
  candidates: PlannerTripPlace[],
): Promise<{ attempted: number; enriched: number; failed: number; merged: PlannerTripPlace[] } | null> {
  const eligible = candidates.filter((place) => place.source_provider === 'google_maps' && Boolean(place.source_place_id));
  if (eligible.length === 0) return null;

  const tab = await findGoogleMapsTab();
  if (!tab?.id) throw new Error(t().strengthenNeedsGoogleMaps);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'OWNLY_ENRICH_SAVED_LIST',
    savedList: {
      listName: 'Ownly candidates',
      listUrl: tab.url || '',
      detectedCurrency: store.pageDetectedCurrency,
      places: eligible.map(researchPlaceFromPlanner),
    } satisfies DetectedSavedList,
    overrideCurrency: store.mapCurrencyOverride,
    force: true,
  }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;

  const targetIds = new Set(eligible.map((place) => place.id));
  const latestTargets = store.state.pendingPlaces.filter((place) => targetIds.has(place.id));
  const merged = mergeDetectedResearchIntoPlannerPlaces(
    latestTargets,
    response?.savedList?.places ?? [],
    store.mapCurrencyOverride || store.pageDetectedCurrency,
  );
  const mergedById = new Map(merged.map((place) => [place.id, place] as const));
  store.state = {
    ...store.state,
    pendingPlaces: store.state.pendingPlaces.map((place) => mergedById.get(place.id) ?? place),
  };
  await saveState();
  return {
    attempted: response?.attempted ?? 0,
    enriched: response?.enriched ?? 0,
    failed: response?.failed ?? 0,
    merged,
  };
}

let searchDebounce: number | undefined;


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
  const inferredKind = inferPlaceKind([cleanTitle, item.category, cleanAddress, ...(item.types || [])].filter(Boolean).join(' '));
  const normalizedPrice = normalizeObservedPrice(item.priceLevel, item.detectedCurrency || store.pageDetectedCurrency);
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id: crypto.randomUUID(),
    trip_id: tripId,
    title: cleanTitle,
    source_provider: item.sourceProvider || 'google_maps',
    source_url: item.sourceUrl,
    source_place_id: item.sourcePlaceId,
    source_category: item.category ? cleanExtractedText(item.category) : undefined,
    kind: inferredKind,
    area: cleanAddress?.split(/[,，·]/)[0]?.trim() || undefined,
    priority: 'want',
    tags: ensurePlaceKindTag(tripTags, inferredKind, store.lang),
    why: item.userNote || item.summary || undefined,
    signals: [],
    risks: [],
    notes: item.userNote || undefined,
    open_hours: item.openHours ? cleanExtractedText(item.openHours) : undefined,
    address: cleanAddress,
    observed_rating: item.rating,
    observed_review_count: item.reviewCount,
    observed_price: item.priceLevel,
    price_currency: normalizedPrice?.currency,
    price_min: normalizedPrice?.min,
    price_max: normalizedPrice?.max,
    price_unit: normalizedPrice?.unit,
    price_level: normalizedPrice?.level,
    observed_at: today(),
    coordinates: item.coordinates,
    phone: item.phone,
    plus_code: item.plusCode,
    menu_url: item.menuUrl,
    reservation_url: item.reservationUrl,
    review_topics: item.reviewTopics,
    types: item.types,
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
  activeTrip?: CaptureContext,
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
        return places.map((p) => buildPlaceFromDetected(p, activeTrip?.tripId || '', tripTags, now));
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
            category: editing.source_category ?? editing.kind,
            address: editing.address,
            coordinates: editing.coordinates,
            rating: editing.observed_rating,
            reviewCount: editing.observed_review_count,
            priceLevel: editing.observed_price,
            detectedCurrency: editing.price_currency,
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
          const normalizedPrice = normalizeObservedPrice(newPrice, p.price_currency || store.pageDetectedCurrency);
          return {
            ...p,
            kind: newKind,
            priority: newPriority,
            observed_price: newPrice,
            price_currency: normalizedPrice?.currency,
            price_min: normalizedPrice?.min,
            price_max: normalizedPrice?.max,
            price_unit: normalizedPrice?.unit,
            price_level: normalizedPrice?.level,
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

  el.toggleDebugMode.addEventListener('change', () => {
    store.debugModeEnabled = el.toggleDebugMode.checked;
    void chrome.storage.local.set({ [DEBUG_STORAGE_KEY]: store.debugModeEnabled });
    el.debugDrawer.style.display = store.debugModeEnabled ? 'block' : 'none';
    if (store.debugModeEnabled) {
      updateDebugLogViewer();
    }
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

  el.btnCopyDebugLogs.addEventListener('click', () => {
    const text = logger.getAllFormattedText();
    void navigator.clipboard.writeText(text).then(() => {
      setStatus(t().debugLogsCopied, 'success');
    }).catch(() => {
      setStatus('Failed to copy logs', 'error');
    });
  });

  el.btnExportDiagnostics.addEventListener('click', () => {
    const payload = logger.exportDiagnostics({
      activeContext: store.state.activeContext,
      pendingPlacesCount: store.state.pendingPlaces.length,
      pendingPlacesSample: store.state.pendingPlaces.slice(0, 10),
      detectedSavedList: store.detectedSavedList ? {
        listName: store.detectedSavedList.listName,
        placeCount: store.detectedSavedList.places.length,
        placesSample: store.detectedSavedList.places.slice(0, 5),
      } : null,
      pageDetectedCurrency: store.pageDetectedCurrency,
      mapCurrencyOverride: store.mapCurrencyOverride,
      lang: store.lang,
    });
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ownly-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(t().debugDiagnosticsExported, 'success');
  });

  el.btnClearDebugLogs.addEventListener('click', () => {
    logger.clear();
    updateDebugLogViewer();
    setStatus(t().debugLogsCleared, 'muted');
  });

  logger.subscribe(() => {
    updateDebugLogViewer();
  });


  // Page-currency override is tab/session scoped. When the user manually overrides currency (e.g. to SGD),
  // they explicitly correct erroneous capture currency. Update active place, form, and existing pending candidates.
  el.currencySelector.addEventListener('change', () => {
    const selected = el.currencySelector.value;
    if (!selected) return;
    store.mapCurrencyOverride = selected === 'AUTO' ? undefined : selected;
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.runtime.sendMessage({
          type: 'OWNLY_SET_FX_OVERRIDE',
          tabId: tab.id,
          currency: store.mapCurrencyOverride,
        });
      }
      if (store.mapCurrencyOverride) {
        store.pageDetectedCurrency = store.mapCurrencyOverride;
        if (store.currentPlace) {
          store.currentPlace = { ...store.currentPlace, detectedCurrency: store.mapCurrencyOverride };
        }
        if (store.detectedSavedList) {
          store.detectedSavedList = { ...store.detectedSavedList, detectedCurrency: store.mapCurrencyOverride };
        }

        // Re-normalize and correct currency on pending candidates in active trip
        const activeTripId = store.state.activeContext?.tripId;
        if (activeTripId) {
          let updatedAny = false;
          store.state = {
            ...store.state,
            pendingPlaces: store.state.pendingPlaces.map((place) => {
              if (place.trip_id !== activeTripId) return place;
              if (!place.observed_price || place.observed_price === '0' || /^SGD\s*0$/i.test(place.observed_price)) {
                if (place.observed_price || place.price_currency || place.price_min !== undefined) {
                  updatedAny = true;
                  return {
                    ...place,
                    observed_price: undefined,
                    price_currency: undefined,
                    price_min: undefined,
                    price_max: undefined,
                    price_unit: undefined,
                    price_level: undefined,
                    updated_at: new Date().toISOString(),
                  };
                }
                return place;
              }
              const nextNorm = normalizeObservedPrice(place.observed_price, store.mapCurrencyOverride);
              if (nextNorm && (place.price_currency !== nextNorm.currency || place.price_min !== nextNorm.min || place.price_max !== nextNorm.max)) {
                updatedAny = true;
                return {
                  ...place,
                  price_currency: nextNorm.currency || store.mapCurrencyOverride,
                  price_min: nextNorm.min,
                  price_max: nextNorm.max,
                  price_unit: nextNorm.unit,
                  price_level: nextNorm.level,
                  updated_at: new Date().toISOString(),
                };
              }
              return place;
            }),
          };
          if (updatedAny) {
            await saveState();
          }
        }
      }

      renderCurrencyPill();
      renderCurrentPlace();
      renderCandidatesList();
      setStatus(t().currencyApplied(selected), 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  el.btnRedetectCurrency.addEventListener('click', () => {
    store.mapCurrencyOverride = undefined;
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.runtime.sendMessage({ type: 'OWNLY_SET_FX_OVERRIDE', tabId: tab.id, currency: null });
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_REDETECT_PAGE_CURRENCY',
        targetCurrency: store.state.activeContext?.currency,
      }) as { detectedCurrency?: string } | undefined;
      const detected = response?.detectedCurrency || 'USD';
      store.pageDetectedCurrency = detected;
      if (store.currentPlace) store.currentPlace = { ...store.currentPlace, detectedCurrency: detected };
      renderCurrencyPill();
      renderCurrentPlace();
      renderCandidatesList();
      setStatus(t().reDetectedCurrency(detected), 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  // Select all / deselect all in bulk mode
  el.btnSelectAllCandidates.addEventListener('click', () => {
    const checkboxes = el.candidatesListContainer.querySelectorAll<HTMLInputElement>('.bulk-check');
    const allChecked = [...checkboxes].every((c) => c.checked);
    checkboxes.forEach((c) => { c.checked = !allChecked; });
    if (allChecked) store.bulkSelected.clear();
    else checkboxes.forEach((c) => { if (c.dataset.placeId) store.bulkSelected.add(c.dataset.placeId); });
  });

  // One-click strengthen all candidates in the active trip (Maps in-tab pass + background batch enrichment)
  el.btnEnrichCandidates.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const context = store.state.activeContext;
      if (!context) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const candidates = store.state.pendingPlaces.filter((place) => place.trip_id === context.tripId);
      if (candidates.length === 0) {
        setStatus(dict.emptyCandidates, 'muted');
        return;
      }
      setStatus(dict.strengtheningStart(candidates.length));
      logger.info('EnrichCandidates', `Starting enrichment for ${candidates.length} candidates`, {
        candidatesSample: candidates.slice(0, 5).map((p) => ({ title: p.title, source_place_id: p.source_place_id })),
      });

      // Phase 1: Try fast in-tab Maps pass for items with Place ID if Maps tab is open
      let mapsEnrichedCount = 0;
      let targetCandidates = [...candidates];
      try {
        const mapsTab = await findGoogleMapsTab();
        const withPlaceId = targetCandidates.filter((p) => p.source_provider === 'google_maps' && Boolean(p.source_place_id));
        logger.maps('EnrichCandidates', `Found Google Maps tab (id: ${mapsTab?.id}), ${withPlaceId.length} places with placeId`);
        if (mapsTab?.id && withPlaceId.length > 0) {
          const mapsResult = await strengthenCandidatesThroughMaps(withPlaceId);
          logger.maps('EnrichCandidates', 'In-tab Maps strengthen result', mapsResult);
          if (mapsResult && mapsResult.enriched > 0) {
            mapsEnrichedCount = mapsResult.enriched;
            const mergedMap = new Map(mapsResult.merged.map((p) => [p.id, p] as const));
            targetCandidates = targetCandidates.map((p) => mergedMap.get(p.id) ?? p);
          }
        }
      } catch (err) {
        logger.warn('EnrichCandidates', 'In-tab Google Maps pass skipped', err instanceof Error ? err.message : String(err));
        console.warn('[Ownly Capture] In-tab Google Maps pass skipped:', err);
      }

      // Phase 2: Run batch enrichment for any candidates still missing facts
      const needEnrichment = targetCandidates.filter((p) =>
        !p.observed_rating ||
        !p.observed_review_count ||
        !p.observed_price ||
        !p.source_category ||
        !p.address ||
        !p.coordinates
      );
      logger.info('EnrichCandidates', `Phase 2: ${needEnrichment.length} candidates need background fetch`);

      let batchEnrichedCount = 0;
      if (needEnrichment.length > 0) {
        const { enrichedPlaces, totalEnriched } = await enrichCandidatePlacesBatch(
          needEnrichment,
          (processed, total, currentPlace) => {
            setStatus(dict.enrichingProgress(processed, total, currentPlace.title));
            renderCandidatesList();
          }
        );
        batchEnrichedCount = totalEnriched;
        if (totalEnriched > 0) {
          const enrichedMap = new Map(enrichedPlaces.map((p) => [p.id, p] as const));
          store.state = {
            ...store.state,
            pendingPlaces: store.state.pendingPlaces.map((p) => mergeEnrichedPendingPlace(p, enrichedMap)),
          };
          await saveState();
        }
      }

      const totalEnriched = mapsEnrichedCount + batchEnrichedCount;
      const latestCandidates = store.state.pendingPlaces.filter((p) => p.trip_id === context.tripId);
      if (totalEnriched > 0) {
        setStatus(
          `${dict.enrichComplete(totalEnriched)} · ${formatStrengthenCoverage(latestCandidates)}`,
          'success',
        );
      } else {
        const stillMissing = latestCandidates.some((p) => !p.observed_rating || !p.address || !p.source_category);
        if (stillMissing) {
          setStatus(
            store.lang === 'zh'
              ? `未通过当前会话补全到新信息 · ${formatStrengthenCoverage(latestCandidates)}`
              : `No new details could be enriched · ${formatStrengthenCoverage(latestCandidates)}`,
            'muted',
          );
        } else {
          setStatus(
            `${dict.enrichNoneNeeded} · ${formatStrengthenCoverage(latestCandidates)}`,
            'muted',
          );
        }
      }
      renderCandidatesList();
    })().catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'));
  });

  el.btnBulkEnrich.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      if (store.bulkSelected.size === 0) return;
      const selected = new Set(store.bulkSelected);
      const candidates = store.state.pendingPlaces.filter((place) => selected.has(place.id));
      if (candidates.length === 0) return;

      setStatus(dict.strengtheningStart(candidates.length));

      // Phase 1: Try in-tab Maps pass for selected items with Place ID
      let mapsEnrichedCount = 0;
      let targetCandidates = [...candidates];
      try {
        const mapsTab = await findGoogleMapsTab();
        const withPlaceId = targetCandidates.filter((p) => p.source_provider === 'google_maps' && Boolean(p.source_place_id));
        if (mapsTab?.id && withPlaceId.length > 0) {
          const mapsResult = await strengthenCandidatesThroughMaps(withPlaceId);
          if (mapsResult && mapsResult.enriched > 0) {
            mapsEnrichedCount = mapsResult.enriched;
            const mergedMap = new Map(mapsResult.merged.map((p) => [p.id, p] as const));
            targetCandidates = targetCandidates.map((p) => mergedMap.get(p.id) ?? p);
          }
        }
      } catch (err) {
        console.warn('[Ownly Capture] In-tab Google Maps pass skipped:', err);
      }

      // Phase 2: Run batch enrichment on remaining items missing data
      const needEnrichment = targetCandidates.filter((p) =>
        !p.observed_rating ||
        !p.observed_review_count ||
        !p.observed_price ||
        !p.source_category ||
        !p.address ||
        !p.coordinates
      );

      let batchEnrichedCount = 0;
      if (needEnrichment.length > 0) {
        const { enrichedPlaces, totalEnriched } = await enrichCandidatePlacesBatch(
          needEnrichment,
          (processed, total, currentPlace) => {
            setStatus(dict.enrichingProgress(processed, total, currentPlace.title));
            renderCandidatesList();
          }
        );
        batchEnrichedCount = totalEnriched;
        if (totalEnriched > 0) {
          const enrichedMap = new Map(enrichedPlaces.map((p) => [p.id, p] as const));
          store.state = {
            ...store.state,
            pendingPlaces: store.state.pendingPlaces.map((p) => mergeEnrichedPendingPlace(p, enrichedMap)),
          };
          await saveState();
        }
      }

      const totalEnriched = mapsEnrichedCount + batchEnrichedCount;
      const latestSelected = store.state.pendingPlaces.filter((p) => selected.has(p.id));
      if (totalEnriched > 0) {
        setStatus(
          `${dict.enrichComplete(totalEnriched)} · ${formatStrengthenCoverage(latestSelected)}`,
          'success',
        );
      } else {
        const stillMissing = latestSelected.some((p) => !p.observed_rating || !p.address || !p.source_category);
        if (stillMissing) {
          setStatus(
            store.lang === 'zh'
              ? `未通过当前会话补全到新信息 · ${formatStrengthenCoverage(latestSelected)}`
              : `No new details could be enriched · ${formatStrengthenCoverage(latestSelected)}`,
            'muted',
          );
        } else {
          setStatus(
            `${dict.enrichNoneNeeded} · ${formatStrengthenCoverage(latestSelected)}`,
            'muted',
          );
        }
      }
      renderCandidatesList();
    })().catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'));
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

  // Smart-list import only fills the Capture inbox for the Planner-selected context.
  el.btnSmartSyncAll.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const context = store.state.activeContext;
      let savedList = store.detectedSavedList;
      if (!context) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      if (!savedList || savedList.places.length === 0) return;
      logger.maps('SmartSyncAll', `Starting smart sync for list "${savedList.listName}"`, {
        totalPlaces: savedList.places.length,
        placesSample: savedList.places.slice(0, 5).map((p) => ({ title: p.title, sourcePlaceId: p.sourcePlaceId })),
      });
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          setStatus(store.lang === 'zh' ? '正在补全评分、评论量、分类与价格…' : 'Enriching ratings, reviews, categories and prices…');
          logger.fetch('SmartSyncAll', `Sending OWNLY_ENRICH_SAVED_LIST to tab ${tab.id}`);
          const enriched = await chrome.tabs.sendMessage(tab.id, {
            type: 'OWNLY_ENRICH_SAVED_LIST',
            savedList,
            overrideCurrency: store.mapCurrencyOverride,
            force: true,
          }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;
          logger.parser('SmartSyncAll', 'Received enrichment response from tab', enriched);
          if (enriched?.savedList?.places?.length) {
            savedList = enriched.savedList;
            store.detectedSavedList = savedList;
          }
        }
      } catch (error) {
        logger.error('SmartSyncAll', 'Saved-list detail enrichment failed', error instanceof Error ? error.message : String(error));
        console.warn('[Ownly Capture] Saved-list detail enrichment failed', error);
      }
      const now = new Date().toISOString();
      const mergedPending = new Map(store.state.pendingPlaces.map((place) => [place.id, place] as const));
      let importedCount = 0;
      for (const item of savedList.places) {
        const title = cleanExtractedText(item.title);
        if (!title || isJunkNavigationText(title)) continue;
        const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, item.sourceUrl, item.sourcePlaceId, item.coordinates);
        const id = existing?.id ?? crypto.randomUUID();
        const address = item.address ? cleanExtractedText(item.address) : undefined;
        const kind = inferPlaceKind([title, item.category, address, ...(item.types || [])].filter(Boolean).join(' '));
        const rawExistingPrice = existing?.observed_price;
        const validExistingPrice = (rawExistingPrice && rawExistingPrice !== '0' && !/^SGD\s*0$/i.test(rawExistingPrice))
          ? rawExistingPrice
          : undefined;
        const effectivePrice = item.priceLevel || validExistingPrice;
        const normalizedPrice = normalizeObservedPrice(effectivePrice, item.detectedCurrency || savedList.detectedCurrency || store.pageDetectedCurrency);
        const captured: PlannerTripPlace = {
          schema_version: '0.1',
          type: 'trip_place',
          id,
          trip_id: context.tripId,
          title,
          source_provider: item.sourceProvider || 'google_maps',
          source_url: item.sourceUrl,
          source_place_id: item.sourcePlaceId ?? existing?.source_place_id,
          source_category: item.category ? cleanExtractedText(item.category) : existing?.source_category,
          kind: existing?.kind ?? kind,
          area: existing?.area ?? address?.split(/[,，·]/)[0]?.trim(),
          priority: existing?.priority ?? 'want',
          tags: ensurePlaceKindTag(Array.from(new Set([...(existing?.tags ?? []), ...(context.tags ?? []), savedList.listName])), existing?.kind ?? kind, store.lang),
          why: existing?.why ?? item.userNote ?? item.summary,
          signals: existing?.signals ?? [],
          risks: existing?.risks ?? [],
          notes: existing?.notes ?? item.userNote,
          observed_rating: item.rating ?? existing?.observed_rating,
          observed_review_count: item.reviewCount ?? existing?.observed_review_count,
          observed_price: effectivePrice,
          price_currency: normalizedPrice?.currency ?? (validExistingPrice ? existing?.price_currency : undefined),
          price_min: normalizedPrice?.min,
          price_max: normalizedPrice?.max,
          price_unit: normalizedPrice?.unit,
          price_level: normalizedPrice?.level,
          observed_at: today(),
          preferred_window: existing?.preferred_window,
          duration_minutes: existing?.duration_minutes,
          open_hours: item.openHours ?? existing?.open_hours,
          address: address ?? existing?.address,
          coordinates: item.coordinates ?? existing?.coordinates,
          phone: item.phone ?? existing?.phone,
          plus_code: item.plusCode ?? existing?.plus_code,
          menu_url: item.menuUrl ?? existing?.menu_url,
          reservation_url: item.reservationUrl ?? existing?.reservation_url,
          review_topics: item.reviewTopics ?? existing?.review_topics,
          types: Array.from(new Set([...(item.types ?? []), ...(existing?.types ?? [])])),
          reservation_status: 'none',
          state: 'candidate',
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        mergedPending.set(id, captured);
        importedCount += 1;
      }
      store.state = { ...store.state, pendingPlaces: [...mergedPending.values()] };
      await saveState();
      store.smartListDismissed = true;
      renderSmartListCard();
      const total = savedList.places.length;
      const withRating = savedList.places.filter((p) => p.rating !== undefined).length;
      const withReviews = savedList.places.filter((p) => p.reviewCount !== undefined).length;
      const withPrice = savedList.places.filter((p) => Boolean(p.priceLevel)).length;
      const withCategory = savedList.places.filter((p) => Boolean(p.category)).length;
      const coverage = store.lang === 'zh'
        ? ` · 评分 ${withRating}/${total} · 评论量 ${withReviews}/${total} · 价格 ${withPrice}/${total} · 分类 ${withCategory}/${total}`
        : ` · rating ${withRating}/${total} · reviews ${withReviews}/${total} · price ${withPrice}/${total} · category ${withCategory}/${total}`;
      setStatus(`${dict.savedListSynced(importedCount, savedList.listName)}${coverage}`, 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  el.btnToggleListPreview.addEventListener('click', () => {
    store.isListPreviewOpen = !store.isListPreviewOpen;
    renderSmartListCard();
  });

  // Bulk text/list import targets the active Planner context only.
  el.btnParseBulkImport.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const context = store.state.activeContext;
      if (!context) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const text = el.bulkInputText.value.trim();
      if (!text) {
        setStatus(dict.bulkImportEmpty, 'error');
        return;
      }
      const lines = text.split(/[\r\n;]+/).map((line) => line.trim()).filter(Boolean);
      const mergedPending = new Map(store.state.pendingPlaces.map((place) => [place.id, place] as const));
      let importedCount = 0;
      const errors: string[] = [];
      const newlyAdded: PlannerTripPlace[] = [];
      for (const line of lines) {
        const isUrl = /^https?:\/\//i.test(line);
        if (isUrl && (line.includes('maps.app.goo.gl') || line.includes('!2s') || line.includes('placelists/list') || line.includes('goo.gl/maps'))) {
          try {
            const listItems = await resolveListPlacesSmart(line, context);
            if (listItems && listItems.length > 0) {
              for (const item of listItems) {
                const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, item.source_url, item.source_place_id, item.coordinates);
                if (existing) continue;
                item.id = crypto.randomUUID();
                item.trip_id = context.tripId;
                item.state = 'candidate';
                mergedPending.set(item.id, item);
                newlyAdded.push(item);
                importedCount += 1;
              }
              continue;
            }
            errors.push(dict.parseNotFoundLine(line));
          } catch (error) {
            errors.push(dict.parseFailedLine(line, error instanceof Error ? error.message : 'unknown'));
          }
        }

        const sourceUrl = isUrl ? line : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
        const title = isUrl ? (line.match(/\/maps\/place\/([^/?#]+)/)?.[1]?.replace(/\+/g, ' ') || line) : line;
        const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, sourceUrl);
        if (existing) continue;
        const kind = inferPlaceKind(safeDecodeUri(title));
        const now = new Date().toISOString();
        const place: PlannerTripPlace = {
          schema_version: '0.1',
          type: 'trip_place',
          id: crypto.randomUUID(),
          trip_id: context.tripId,
          title: safeDecodeUri(title),
          source_provider: inferSourceProvider(sourceUrl),
          source_url: sourceUrl,
          kind,
          priority: 'want',
          tags: ensurePlaceKindTag(context.tags ?? [], kind, store.lang),
          signals: [],
          risks: [],
          observed_at: today(),
          reservation_status: 'none',
          state: 'candidate',
          created_at: now,
          updated_at: now,
        };
        mergedPending.set(place.id, place);
        newlyAdded.push(place);
        importedCount += 1;
      }
      store.state = { ...store.state, pendingPlaces: [...mergedPending.values()] };
      await saveState();
      el.bulkInputText.value = '';
      setStatus(errors.length > 0 ? dict.importedWithWarnings(importedCount, errors.join(', ')) : dict.importedCount(importedCount), 'success');

      // Asynchronously enrich newly imported places
      if (newlyAdded.length > 0) {
        void (async () => {
          const { enrichedPlaces, totalEnriched } = await enrichCandidatePlacesBatch(
            newlyAdded,
            (processed, total, currentPlace) => {
              setStatus(dict.enrichingProgress(processed, total, currentPlace.title));
              renderCandidatesList();
            }
          );
          if (totalEnriched > 0) {
            const enrichedMap = new Map(enrichedPlaces.map((p) => [p.id, p] as const));
            store.state = {
              ...store.state,
              pendingPlaces: store.state.pendingPlaces.map((p) => mergeEnrichedPendingPlace(p, enrichedMap)),
            };
            await saveState();
            setStatus(dict.enrichComplete(totalEnriched), 'success');
            renderCandidatesList();
          }
        })();
      }
    })().catch((error) => setStatus(String(error), 'error'));
  });

  el.btnToggleSelectAll.addEventListener('click', () => {
    const checkboxes = el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every((c) => c.checked);
    checkboxes.forEach((c) => { c.checked = !allChecked; });
  });

  el.btnBatchAdd.addEventListener('click', () => {
    void (async () => {
      const context = store.state.activeContext;
      if (!context) {
        setStatus(t().tripRequiredError, 'error');
        return;
      }
      const selectedUrls = new Set(Array.from(el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.dataset.url).filter(Boolean));
      const source = store.detectedSavedList?.places?.length ? store.detectedSavedList.places : store.detectedListPlaces;
      const mergedPending = new Map(store.state.pendingPlaces.map((place) => [place.id, place] as const));
      let added = 0;
      const now = new Date().toISOString();
      for (const item of source.filter((place) => selectedUrls.has(place.sourceUrl))) {
        const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, item.sourceUrl, item.sourcePlaceId, item.coordinates);
        if (existing) continue;
        const kind = inferPlaceKind([item.title, item.category, item.address, ...(item.types || [])].filter(Boolean).join(' '));
        const place: PlannerTripPlace = {
          schema_version: '0.1', type: 'trip_place', id: crypto.randomUUID(), trip_id: context.tripId,
          title: item.title, source_provider: item.sourceProvider || 'google_maps', source_url: item.sourceUrl,
          source_place_id: item.sourcePlaceId, kind, priority: 'want', tags: ensurePlaceKindTag(context.tags ?? [], kind, store.lang),
          why: item.userNote || item.summary, signals: [], risks: [], notes: item.userNote,
          open_hours: item.openHours, address: item.address, observed_rating: item.rating, observed_price: item.priceLevel,
          observed_at: today(), coordinates: item.coordinates, phone: item.phone, plus_code: item.plusCode,
          menu_url: item.menuUrl, reservation_url: item.reservationUrl, review_topics: item.reviewTopics, types: item.types,
          reservation_status: 'none', state: 'candidate', created_at: now, updated_at: now,
        };
        mergedPending.set(place.id, place);
        added += 1;
      }
      store.state = { ...store.state, pendingPlaces: [...mergedPending.values()] };
      await saveState();
      setStatus(t().batchAddedSuccess(added), 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  // Trip CRUD lives in Planner/Vault. Capture has no local Trip editor.

  el.refreshPlace.addEventListener('click', () => {
    store.userDismissedPlaceUrl = null;
    void readCurrentPlace();
  });

  el.btnRemoveCandidate.addEventListener('click', () => {
    const dict = t();
    if (!store.currentPlace || !store.state.activeContext?.tripId) return;
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
    const context = store.state.activeContext;
    if (!context) {
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
    const existing = findExistingTripPlace(
      store.state.pendingPlaces,
      context.tripId,
      store.currentPlace.sourceUrl,
      store.currentPlace.sourcePlaceId,
      store.currentPlace.coordinates,
    );
    const kind = (el.kind.value as PlannerPlaceKind) || 'other';
    const tags = ensurePlaceKindTag(normalizeDelimitedText(el.tags.value), kind, store.lang);
    const rawPrice = el.price.value.trim() || undefined;
    const normalizedPrice = normalizeObservedPrice(rawPrice, store.currentPlace.detectedCurrency || existing?.price_currency || store.pageDetectedCurrency);
    const id = existing?.id ?? crypto.randomUUID();
    const place: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id,
      trip_id: context.tripId,
      title: cleanExtractedText(store.currentPlace.title),
      source_provider: store.currentPlace.sourceProvider || 'google_maps',
      source_url: store.currentPlace.sourceUrl,
      source_place_id: store.currentPlace.sourcePlaceId ?? existing?.source_place_id,
      source_category: store.currentPlace.category ? cleanExtractedText(store.currentPlace.category) : existing?.source_category,
      kind,
      area: cleanExtractedText(el.area.value.trim()) || undefined,
      priority: existing?.priority ?? 'want',
      tags,
      why: cleanExtractedText(el.why.value.trim()) || undefined,
      signals: normalizeDelimitedText(el.signals.value).map(cleanExtractedText).filter(Boolean),
      risks: normalizeDelimitedText(el.risks.value).map(cleanExtractedText).filter(Boolean),
      notes: cleanExtractedText(el.notes.value.trim()) || undefined,
      observed_rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
      observed_review_count: store.currentPlace.reviewCount ?? existing?.observed_review_count,
      observed_price: rawPrice,
      price_currency: normalizedPrice?.currency,
      price_min: normalizedPrice?.min,
      price_max: normalizedPrice?.max,
      price_unit: normalizedPrice?.unit,
      price_level: normalizedPrice?.level,
      observed_at: today(),
      preferred_window: el.window.value.trim() || undefined,
      duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.min(1440, Math.round(duration)) : undefined,
      open_hours: cleanExtractedText(store.currentPlace.openHours ?? existing?.open_hours) || undefined,
      address: cleanExtractedText(store.currentPlace.address ?? existing?.address) || undefined,
      coordinates: store.currentPlace.coordinates ?? existing?.coordinates,
      phone: store.currentPlace.phone ?? existing?.phone,
      plus_code: store.currentPlace.plusCode ?? existing?.plus_code,
      menu_url: store.currentPlace.menuUrl ?? existing?.menu_url,
      reservation_url: store.currentPlace.reservationUrl ?? existing?.reservation_url,
      review_topics: store.currentPlace.reviewTopics ?? existing?.review_topics,
      types: Array.from(new Set([...(store.currentPlace.types ?? []), ...(existing?.types ?? [])])),
      reservation_status: 'none',
      state: 'candidate',
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    store.state = { ...store.state, pendingPlaces: [...store.state.pendingPlaces.filter((item) => item.id !== id), place] };
    void saveState().then(() => {
      syncQuickChipStates();
      setStatus(existing ? dict.candidateUpdated : dict.candidateAdded, 'success');
      flashNewCandidate(place.id);
    });
  });

  el.captureForm.addEventListener('keydown' , (event) => {
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


