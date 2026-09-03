import { expandAndExtractListId } from '../api';
import {
  ensurePlaceKindTag,
  inferPlaceKind,
  inferSourceProvider,
  normalizeDelimitedText,
  normalizeObservedPrice,
} from '../../domain/planner';
import {
  findExistingPlace,
  findExistingPlaceByIdentity,
  reorderPlaces,
  mergePlaceResearch,
  type CapturePlace,
} from '../../domain/capture';
import type { PlannerTripPlace } from '../../domain/planner';
import { saveState, getActiveCollection, getActivePlaces, store, t, DEBUG_STORAGE_KEY, getExistingPlaceForUrl } from './store';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { el } from '../dom';
import { cleanExtractedText, isJunkNavigationText, isZeroOrPlaceholderPrice, safeDecodeUri } from '../utils';
import { readCurrentPlace } from './capture';
import { enrichCandidatePlacesBatch, isCandidateMissingData, mergeDetectedResearchIntoPlannerPlaces } from '../enrichment';
import {
  applyI18n,
  autoFillPlaceForm,
  renderCandidatesList,
  renderCurrencyPill,
  renderCurrentPlace,
  renderSmartListCard,
  renderState,
  setStatus,
  showImportReport,
  syncQuickChipStates,
  updateDebugLogViewer,
} from './ui';
import { logger } from '../logger';
import { setupImportExportHandlers } from './import-export';

const LANG_STORAGE_KEY = 'ownlyCaptureLang';

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

function isGoogleMapsTabUrl(url = ''): boolean {
  return /^https:\/\/(www\.google\.[a-z.]+|maps\.google\.[a-z.]+)\/maps(?:\/|$)/i.test(url);
}

async function findGoogleMapsTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.find((tab) => tab.active && isGoogleMapsTabUrl(tab.url))
    ?? tabs.find((tab) => isGoogleMapsTabUrl(tab.url));
}

function researchPlaceFromCapturePlace(place: CapturePlace): CurrentResearchPlace {
  return {
    title: place.title,
    sourceUrl: place.source.url,
    sourceProvider: place.source.provider,
    sourcePlaceId: place.source.place_id,
    rating: place.rating,
    reviewCount: place.review_count,
    category: place.source.category,
    priceLevel: place.price?.raw,
    detectedCurrency: place.price?.currency,
    address: place.address,
    coordinates: place.coordinates,
    openHours: place.open_hours,
    phone: place.phone,
    plusCode: place.plus_code,
    menuUrl: place.menu_url,
    reservationUrl: place.reservation_url,
    reviewTopics: place.review_topics,
    types: place.source.types,
  };
}

function formatStrengthenCoverage(places: CapturePlace[]): string {
  const total = places.length;
  const rating = places.filter((place) => place.rating !== undefined).length;
  const reviews = places.filter((place) => place.review_count !== undefined).length;
  const stayPlaces = places.filter((p) => p.inferred_kind === 'stay' || (p.source.category && /hotel|resort|lodging|hostel|inn|stay|酒店|旅馆|住宿|民宿/i.test(p.source.category)));
  const stayWithPrice = stayPlaces.filter((p) => Boolean(p.price?.raw && !isZeroOrPlaceholderPrice(p.price.raw))).length;
  const price = places.filter((place) => Boolean(place.price?.raw && !isZeroOrPlaceholderPrice(place.price.raw))).length;
  const category = places.filter((place) => Boolean(place.source.category)).length;
  const coordinates = places.filter((place) => Boolean(place.coordinates)).length;

  const priceStats = stayPlaces.length > 0
    ? (store.lang === 'zh' ? `价格 ${price}/${total} (含住宿 ${stayWithPrice}/${stayPlaces.length})` : `price ${price}/${total} (stay ${stayWithPrice}/${stayPlaces.length})`)
    : (store.lang === 'zh' ? `价格 ${price}/${total}` : `price ${price}/${total}`);

  return store.lang === 'zh'
    ? `评分 ${rating}/${total} · 评论 ${reviews}/${total} · ${priceStats} · 分类 ${category}/${total} · 坐标 ${coordinates}/${total}`
    : `rating ${rating}/${total} · reviews ${reviews}/${total} · ${priceStats} · category ${category}/${total} · coordinates ${coordinates}/${total}`;
}

async function strengthenCandidatesThroughMaps(
  candidates: CapturePlace[],
): Promise<{ attempted: number; enriched: number; failed: number; merged: CapturePlace[] } | null> {
  const eligible = candidates.filter((place) => place.source.provider === 'google_maps' && Boolean(place.source.place_id));
  if (eligible.length === 0) return null;

  const tab = await findGoogleMapsTab();
  if (!tab?.id) throw new Error(t().strengthenNeedsGoogleMaps);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'OWNLY_ENRICH_SAVED_LIST',
    savedList: {
      listName: 'Ownly candidates',
      listUrl: tab.url || '',
      detectedCurrency: store.pageDetectedCurrency,
      places: eligible.map(researchPlaceFromCapturePlace),
    } satisfies DetectedSavedList,
    overrideCurrency: store.mapCurrencyOverride,
    force: true,
  }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;

  const targetIds = new Set(eligible.map((place) => place.id));
  const facadePlaces = store.state.pendingPlaces.filter((p) => targetIds.has(p.id)) as unknown as PlannerTripPlace[];
  const merged = mergeDetectedResearchIntoPlannerPlaces(
    facadePlaces,
    response?.savedList?.places ?? [],
    store.mapCurrencyOverride || store.pageDetectedCurrency,
  );
  const mergedById = new Map(merged.map((place) => [place.id, place] as const));
  const collection = getActiveCollection();
  if (collection) {
    const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
    const latestTargets = store.stateV3.places.filter((place) => targetIds.has(place.id));
    const updatedActivePlaces = latestTargets.map((p) => {
      const enrichedVp = mergedById.get(p.id);
      if (!enrichedVp) return p;
      return mergePlaceResearch(p, {
        title: enrichedVp.title,
        source: { ...p.source, category: enrichedVp.source_category, types: enrichedVp.types },
        address: enrichedVp.address,
        coordinates: enrichedVp.coordinates,
        rating: enrichedVp.observed_rating,
        review_count: enrichedVp.observed_review_count,
        price: enrichedVp.observed_price ? { raw: enrichedVp.observed_price, currency: enrichedVp.price_currency, min: enrichedVp.price_min, max: enrichedVp.price_max, unit: enrichedVp.price_unit, level: enrichedVp.price_level } : undefined,
        phone: enrichedVp.phone,
        plus_code: enrichedVp.plus_code,
        open_hours: enrichedVp.open_hours,
        menu_url: enrichedVp.menu_url,
        reservation_url: enrichedVp.reservation_url,
        review_topics: enrichedVp.review_topics,
      });
    });
    store.setState({ ...store.stateV3, places: [...otherPlaces, ...updatedActivePlaces] });
    await saveState();
  }
  return {
    attempted: response?.attempted ?? 0,
    enriched: response?.enriched ?? 0,
    failed: response?.failed ?? 0,
    merged: store.stateV3.places.filter((place) => targetIds.has(place.id)),
  };
}

let searchDebounce: number | undefined;

function applyBulk(mutate: (place: CapturePlace, value?: string) => CapturePlace, value?: string): void {
  const dict = t();
  if (store.bulkSelected.size === 0) return;
  const ids = new Set(store.bulkSelected);
  const collection = getActiveCollection();
  if (!collection) return;
  const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
  const activePlaces = getActivePlaces().map((p) => (ids.has(p.id) ? mutate(p, value) : p));
  store.setState({ ...store.stateV3, places: [...otherPlaces, ...activePlaces] });
  const count = ids.size;
  store.bulkSelected.clear();
  void saveState().then(() => setStatus(dict.bulkApplied(count), 'success'));
}

function buildPlaceFromDetected(
  item: CurrentResearchPlace,
  collectionId: string,
  now: string,
): CapturePlace {
  const cleanTitle = cleanExtractedText(item.title);
  const cleanAddress = item.address ? cleanExtractedText(item.address) : undefined;
  const inferredKind = inferPlaceKind([cleanTitle, item.category, cleanAddress, ...(item.types || [])].filter(Boolean).join(' '));
  const normalizedPrice = normalizeObservedPrice(item.priceLevel, item.detectedCurrency || store.pageDetectedCurrency);
  return {
    id: crypto.randomUUID(),
    collection_id: collectionId,
    title: cleanTitle,
    source: {
      provider: item.sourceProvider || 'google_maps',
      url: item.sourceUrl,
      place_id: item.sourcePlaceId,
      category: item.category ? cleanExtractedText(item.category) : undefined,
      types: item.types,
    },
    inferred_kind: inferredKind as CapturePlace['inferred_kind'],
    address: cleanAddress,
    rating: item.rating,
    review_count: item.reviewCount,
    price: normalizedPrice ? {
      raw: item.priceLevel,
      currency: normalizedPrice.currency,
      min: normalizedPrice.min,
      max: normalizedPrice.max,
      unit: normalizedPrice.unit,
      level: normalizedPrice.level,
    } : (item.priceLevel ? { raw: item.priceLevel } : undefined),
    open_hours: item.openHours ? cleanExtractedText(item.openHours) : undefined,
    phone: item.phone,
    plus_code: item.plusCode,
    menu_url: item.menuUrl,
    reservation_url: item.reservationUrl,
    review_topics: item.reviewTopics,
    user: {
      priority: 'want',
      tags: ensurePlaceKindTag([], inferredKind, store.lang),
      why: item.userNote || item.summary || undefined,
      notes: item.userNote || undefined,
    },
    captured_at: now,
  };
}

/**
 * Bulk-paste list resolution using the active Maps tab's content script as authority
 * (ensuring correct authuser/cookie/locale context for multi-account users).
 */
async function resolveListPlacesSmart(line: string, collectionId?: string): Promise<CapturePlace[] | null> {
  const ref = await expandAndExtractListId(line);
  if (!ref) return null;

  const tab = await findGoogleMapsTab();
  if (!tab?.id) {
    throw new Error(t().strengthenNeedsGoogleMaps);
  }

  const resp = await chrome.tabs.sendMessage(tab.id, {
    type: 'OWNLY_FETCH_LIST_BY_ID',
    listUrl: ref.finalUrl,
    listId: ref.listId,
  }) as { savedList?: DetectedSavedList | null } | undefined;

  if (resp && 'savedList' in resp) {
    const places = resp.savedList?.places ?? [];
    const now = new Date().toISOString();
    return places.map((p) => buildPlaceFromDetected(p, collectionId || '', now));
  }

  return [];
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
    const collection = getActiveCollection();
    if (collection) {
      const newPlaces = reorderPlaces(getActivePlaces(), visibleIds);
      const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
      store.setState({ ...store.stateV3, places: [...otherPlaces, ...newPlaces] });
      void saveState();
    }
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

  el.candidatesListContainer.addEventListener('click', async (e) => {
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
        const editing = getActivePlaces().find((p) => p.id === placeId);
        if (editing) {
          store.currentPlace = {
            title: editing.title,
            sourceUrl: editing.source.url,
            sourceProvider: editing.source.provider,
            sourcePlaceId: editing.source.place_id,
            category: editing.source.category ?? editing.inferred_kind,
            address: editing.address,
            coordinates: editing.coordinates,
            rating: editing.rating,
            reviewCount: editing.review_count,
            priceLevel: editing.price?.raw,
            detectedCurrency: editing.price?.currency,
            summary: editing.user?.why,
            userNote: editing.user?.notes,
            openHours: editing.open_hours,
            phone: editing.phone,
            plusCode: editing.plus_code,
            menuUrl: editing.menu_url,
            reservationUrl: editing.reservation_url,
            reviewTopics: editing.review_topics,
            types: editing.source.types,
          };
          renderCurrentPlace();
          autoFillPlaceForm(store.currentPlace);
          syncQuickChipStates();
          if (editing.source.url) void revealPlaceInMaps(editing.source.url);
        }
      }
    } else if (action === 'toggle-must') {
      const place = getActivePlaces().find((p) => p.id === placeId);
      if (place) {
        const nextPriority = place.user?.priority === 'must' ? undefined : 'must';
        store.updatePlace(placeId, (p) => ({
          ...p,
          user: { ...p.user, priority: nextPriority },
          updated_at: new Date().toISOString(),
        }));
        void saveState().then(() => {
          setStatus(nextPriority === 'must'
            ? (store.lang === 'zh' ? '已标记为必去。' : 'Marked as Must.')
            : (store.lang === 'zh' ? '已取消必去标记。' : 'Unmarked Must.'),
            'success');
          renderState();
          renderCandidatesList();
          renderCurrentPlace();
        });
      }
    } else if (action === 'delete') {
      store.locallyDeletedIds.add(placeId);
      store.removePlace(placeId);
      if (store.editingCandidateId === placeId) store.editingCandidateId = null;
      void saveState().then(() => {
        renderState();
        renderCandidatesList();
        renderCurrentPlace();
      });
    } else if (action === 'archive') {
      // PR-C: Gmail-style archive — same as delete for Inbox, but semantically归档
      store.locallyDeletedIds.add(placeId);
      store.removePlace(placeId);
      if (store.editingCandidateId === placeId) store.editingCandidateId = null;
      void saveState().then(() => {
        setStatus(store.lang === 'zh' ? '已归档。' : 'Archived.', 'success');
        renderState();
        renderCandidatesList();
        renderCurrentPlace();
      });
    } else if (action === 'add-to-trip') {
      const place = getActivePlaces().find((p) => p.id === placeId);
      if (!place) {
        setStatus(store.lang === 'zh' ? '未找到地点。' : 'Place not found.', 'error');
        return;
      }
      // For now, copy single-place share JSON; Planner's Import modal can paste it
      try {
        const singleJson = JSON.stringify({ schema: 'ownly.capture.collection', version: 1, exported_at: new Date().toISOString(), collection: { id: place.collection_id, title: 'Inbox', place_count: 1 }, places: [place] }, null, 2);
        await navigator.clipboard.writeText(singleJson);
        setStatus(store.lang === 'zh' ? '已复制，去行程管理中导入即可加入行程。' : 'Copied — paste in Trip Management Import to add to trip.', 'success');
      } catch {
        window.prompt(store.lang === 'zh' ? '复制以下 JSON 并在行程管理导入：' : 'Copy JSON and import in Trip Management:', JSON.stringify(place));
      }
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

      const newKind = (kindSelect?.value || 'attraction') as CapturePlace['inferred_kind'];
      const newPriority = (prioritySelect?.value || 'want') as CapturePlace['user'] extends { priority?: infer P } ? P : never;
      const newPrice = priceInput ? cleanExtractedText(priceInput.value) || undefined : undefined;
      const numRating = ratingInput ? parseFloat(ratingInput.value) : NaN;
      const numDuration = durationInput ? parseInt(durationInput.value, 10) : NaN;
      const rawTags = tagsInput ? normalizeDelimitedText(tagsInput.value).map(cleanExtractedText).filter(Boolean) : [];
      const newTags = ensurePlaceKindTag(rawTags, newKind, store.lang);
      const newNotes = notesTextarea ? cleanExtractedText(notesTextarea.value) || undefined : undefined;

      store.updatePlace(placeId, (p) => {
        const normalizedPrice = normalizeObservedPrice(newPrice, p.price?.currency || store.pageDetectedCurrency);
        return {
          ...p,
          inferred_kind: newKind,
          user: {
            ...p.user,
            priority: newPriority,
            tags: newTags,
            notes: newNotes,
            why: newNotes || p.user?.why,
            duration_minutes: Number.isFinite(numDuration) && numDuration > 0 ? Math.min(1440, numDuration) : undefined,
          },
          price: normalizedPrice ? {
            raw: newPrice,
            currency: normalizedPrice.currency,
            min: normalizedPrice.min,
            max: normalizedPrice.max,
            unit: normalizedPrice.unit,
            level: normalizedPrice.level,
          } : (newPrice ? { raw: newPrice } : p.price),
          rating: Number.isFinite(numRating) && numRating >= 1 && numRating <= 5 ? numRating : undefined,
          updated_at: new Date().toISOString(),
        };
      });

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
    const collection = getActiveCollection();
    if (collection) {
      const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
      const activePlaces = getActivePlaces().filter((p) => !ids.has(p.id));
      store.setState({ ...store.stateV3, places: [...otherPlaces, ...activePlaces] });
    }
    store.bulkSelected.clear();
    void saveState().then(() => setStatus(dict.candidateRemoved, 'success'));
  });

  el.bulkPrioritySelect.addEventListener('change', () => {
    applyBulk((place, value) => ({
      ...place,
      user: { ...place.user, priority: value as CapturePlace['user'] extends { priority?: infer P } ? P : never },
    }));
    el.bulkPrioritySelect.value = '';
  });

  el.btnCopyDebugLogs.addEventListener('click', () => {
    logger.info('Diagnostics', 'Copy debug logs clicked', logger.getStats());
    const text = logger.getAllFormattedText();
    void navigator.clipboard.writeText(text).then(() => {
      logger.info('Diagnostics', 'Debug logs copied', { chars: text.length });
      setStatus(t().debugLogsCopied, 'success');
    }).catch((e) => {
      logger.error('Diagnostics', 'Copy logs failed', String(e));
      setStatus('Failed to copy logs', 'error');
    });
  });

  el.btnCopyAIDiagnostics.addEventListener('click', async () => {
    logger.info('Diagnostics', 'Copy AI diagnostics clicked', { inboxCount: store.getInboxPlaces().length });
    try {
      const { buildDiagnosticsBundle, bundleToText } = await import('../diagnostics');
      const bundle = await buildDiagnosticsBundle({ store });
      const text = bundleToText(bundle);
      try {
        await navigator.clipboard.writeText(text);
        logger.info('Diagnostics', 'AI diagnostics copied', { sessionId: bundle.sessionId, health: bundle.health.status });
        setStatus(store.lang === 'zh' ? `🤖 AI 诊断包已复制（${bundle.capture.stats.inboxPlaces} 地点，${bundle.logs.stats.total} 日志，健康：${bundle.health.status}）` : `🤖 AI diagnostics copied (${bundle.capture.stats.inboxPlaces} places, ${bundle.logs.stats.total} logs)`, 'success');
      } catch {
        logger.warn('Diagnostics', 'Clipboard fallback to prompt');
        window.prompt(store.lang === 'zh' ? '复制 AI 诊断包：' : 'Copy AI diagnostics:', text);
      }
    } catch (e) {
      // Fallback to legacy bundle if diagnostics module fails
      logger.error('Diagnostics', 'buildDiagnosticsBundle failed, fallback', String(e));
      const inbox = store.getInboxCollection();
      const inboxPlaces = store.getInboxPlaces();
      const bundle = {
        hint: 'Copy this JSON and paste to AI for diagnosis — contains Inbox, Capture state, and logs',
        exportedAt: new Date().toISOString(),
        extension: { title: document.title, url: location.href, userAgent: navigator.userAgent },
        captureStateV3: {
          active_collection_id: store.stateV3.active_collection_id,
          collections: store.stateV3.collections,
          places: inboxPlaces.slice(0, 20),
          places_total: inboxPlaces.length,
          inbox: inbox ? { id: inbox.id, title: inbox.title } : null,
          planner_target: store.stateV3.planner_target,
        },
        inboxSample: inboxPlaces.slice(0, 10).map((p) => ({ id: p.id, title: p.title, source: p.source, address: p.address, collection_id: p.collection_id })),
        activeCollection: getActiveCollection() ? { id: getActiveCollection()!.id, title: getActiveCollection()!.title } : null,
        detectedSavedList: store.detectedSavedList ? { listName: store.detectedSavedList.listName, placeCount: store.detectedSavedList.places.length, placesSample: store.detectedSavedList.places.slice(0, 5).map((p) => ({ title: p.title, sourceUrl: p.sourceUrl, sourcePlaceId: p.sourcePlaceId })) } : null,
        currentPlace: store.currentPlace ? { title: store.currentPlace.title, sourceUrl: store.currentPlace.sourceUrl, sourcePlaceId: store.currentPlace.sourcePlaceId, category: store.currentPlace.category } : null,
        storage: { lang: store.lang, pageDetectedCurrency: store.pageDetectedCurrency, mapCurrencyOverride: store.mapCurrencyOverride },
        logs: logger.getLogs().slice(-80),
      };
      const text = JSON.stringify(bundle, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        setStatus(store.lang === 'zh' ? '🤖 AI 诊断包已复制，直接粘贴发给 AI 即可。' : '🤖 AI diagnostics copied — paste to AI.', 'success');
      } catch {
        window.prompt(store.lang === 'zh' ? '复制 AI 诊断包：' : 'Copy AI diagnostics:', text);
      }
    }
  });

  el.btnExportDiagnostics.addEventListener('click', () => {
    void (async () => {
      try {
        const { buildDiagnosticsBundle, bundleToText } = await import('../diagnostics');
        const bundle = await buildDiagnosticsBundle({ store });
        const payload = bundleToText(bundle);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ownly-diagnostics-${bundle.sessionId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        logger.info('Diagnostics', 'Diagnostics JSON exported', { sessionId: bundle.sessionId });
        setStatus(t().debugDiagnosticsExported, 'success');
      } catch (e) {
        const collection = getActiveCollection();
        const places = getActivePlaces();
        const payload = logger.exportDiagnostics({
          activeContext: collection ? { tripId: collection.id, title: collection.title, currency: collection.currency } : null,
          pendingPlacesCount: places.length,
          pendingPlacesSample: places.slice(0, 10),
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
        logger.error('Diagnostics', 'Fallback exportDiagnostics used', String(e));
        setStatus(t().debugDiagnosticsExported, 'success');
      }
    })();
  });

  el.btnClearDebugLogs.addEventListener('click', () => {
    logger.info('Diagnostics', 'Clear logs clicked', logger.getStats());
    void logger.clearAndPersist().then(() => {
      updateDebugLogViewer();
      setStatus(t().debugLogsCleared, 'muted');
    });
  });

  logger.subscribe((entry) => {
    updateDebugLogViewer();
    // Flash debug drawer if error and debug drawer closed
    if (entry.level === 'ERROR' && !store.debugModeEnabled) {
      el.debugDrawer.style.outline = '1px solid #b91c1c';
      window.setTimeout(() => { el.debugDrawer.style.outline = ''; }, 1200);
    }
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

        // Re-normalize and correct currency on pending candidates in active collection
        const collection = getActiveCollection();
        if (collection) {
          let updatedAny = false;
          const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
          const activePlaces = getActivePlaces().map((place) => {
            const priceRaw = place.price?.raw;
            if (!priceRaw || priceRaw === '0' || /^SGD\s*0$/i.test(priceRaw)) {
              if (priceRaw || place.price?.currency || place.price?.min !== undefined) {
                updatedAny = true;
                return { ...place, price: undefined, updated_at: new Date().toISOString() };
              }
              return place;
            }
            const nextNorm = normalizeObservedPrice(priceRaw, store.mapCurrencyOverride);
            if (nextNorm && (place.price?.currency !== nextNorm.currency || place.price?.min !== nextNorm.min || place.price?.max !== nextNorm.max)) {
              updatedAny = true;
              return {
                ...place,
                price: {
                  raw: priceRaw,
                  currency: nextNorm.currency || store.mapCurrencyOverride,
                  min: nextNorm.min,
                  max: nextNorm.max,
                  unit: nextNorm.unit,
                  level: nextNorm.level,
                },
                updated_at: new Date().toISOString(),
              };
            }
            return place;
          });
          if (updatedAny) {
            store.setState({ ...store.stateV3, places: [...otherPlaces, ...activePlaces] });
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
      const collection = getActiveCollection();
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_REDETECT_PAGE_CURRENCY',
        targetCurrency: collection?.currency,
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

  // One-click strengthen all candidates in the active collection (Maps in-tab pass + background batch enrichment)
  el.btnEnrichCandidates.addEventListener('click', () => {
    logger.info('Enrich', 'btnEnrichCandidates clicked');
    void (async () => {
      const dict = t();
      const collection = getActiveCollection();
      if (!collection) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const candidates = getActivePlaces();
      if (candidates.length === 0) {
        setStatus(dict.emptyCandidates, 'muted');
        return;
      }
      setStatus(dict.strengtheningStart(candidates.length));
      logger.info('EnrichCandidates', `Starting enrichment for ${candidates.length} candidates`, {
        candidatesSample: candidates.slice(0, 5).map((p) => ({ title: p.title, source_place_id: p.source.place_id })),
      });

      // Phase 1: Try fast in-tab Maps pass for items with Place ID if Maps tab is open
      let mapsEnrichedCount = 0;
      let targetCandidates = [...candidates];
      try {
        const mapsTab = await findGoogleMapsTab();
        const withPlaceId = targetCandidates.filter((p) => p.source.provider === 'google_maps' && Boolean(p.source.place_id));
        logger.maps('EnrichCandidates', `Found Google Maps tab (id: ${mapsTab?.id}), ${withPlaceId.length} places with placeId`);
        if (mapsTab?.id && withPlaceId.length > 0) {
          const mapsResult = await strengthenCandidatesThroughMaps(withPlaceId);
          logger.maps('EnrichCandidates', 'In-tab Maps strengthen result', mapsResult);
          if (mapsResult && mapsResult.enriched > 0) {
            mapsEnrichedCount = mapsResult.enriched;
            targetCandidates = getActivePlaces();
          }
        }
      } catch (err) {
        logger.warn('EnrichCandidates', 'In-tab Google Maps pass skipped', err instanceof Error ? err.message : String(err));
        console.warn('[Ownly Capture] In-tab Google Maps pass skipped:', err);
      }

      // Phase 2: Run batch enrichment for any candidates still missing facts
      const targetIds = new Set(targetCandidates.map((c) => c.id));
      const facadeForEnrich = store.state.pendingPlaces.filter((p) => targetIds.has(p.id)) as unknown as PlannerTripPlace[];
      const needEnrichment = facadeForEnrich.filter(isCandidateMissingData);
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
          const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
          const activePlaces = getActivePlaces().map((cp) => {
            const enrichedVp = enrichedMap.get(cp.id);
            if (!enrichedVp) return cp;
            return mergePlaceResearch(cp, {
              title: enrichedVp.title,
              source: { ...cp.source, category: enrichedVp.source_category, types: enrichedVp.types },
              address: enrichedVp.address,
              coordinates: enrichedVp.coordinates,
              rating: enrichedVp.observed_rating,
              review_count: enrichedVp.observed_review_count,
              price: enrichedVp.observed_price ? { raw: enrichedVp.observed_price, currency: enrichedVp.price_currency, min: enrichedVp.price_min, max: enrichedVp.price_max, unit: enrichedVp.price_unit, level: enrichedVp.price_level } : undefined,
              phone: enrichedVp.phone,
              plus_code: enrichedVp.plus_code,
              open_hours: enrichedVp.open_hours,
              menu_url: enrichedVp.menu_url,
              reservation_url: enrichedVp.reservation_url,
              review_topics: enrichedVp.review_topics,
            });
          });
          store.setState({ ...store.stateV3, places: [...otherPlaces, ...activePlaces] });
          await saveState();
        }
      }

      const totalEnriched = mapsEnrichedCount + batchEnrichedCount;
      const latestCandidates = getActivePlaces();
      if (totalEnriched > 0) {
        setStatus(
          `${dict.enrichComplete(totalEnriched)} · ${formatStrengthenCoverage(latestCandidates)}`,
          'success',
        );
      } else {
        const stillMissing = latestCandidates.some((p) => !p.rating || !p.address || !p.source.category);
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
      const collection = getActiveCollection();
      if (!collection) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const selected = new Set(store.bulkSelected);
      const candidates = selected.size > 0
        ? getActivePlaces().filter((place) => selected.has(place.id))
        : getActivePlaces();
      if (candidates.length === 0) return;

      setStatus(dict.strengtheningStart(candidates.length));

      // Phase 1: Try in-tab Maps pass for selected items with Place ID
      let mapsEnrichedCount = 0;
      let targetCandidates = [...candidates];
      try {
        const mapsTab = await findGoogleMapsTab();
        const withPlaceId = targetCandidates.filter((p) => p.source.provider === 'google_maps' && Boolean(p.source.place_id));
        if (mapsTab?.id && withPlaceId.length > 0) {
          const mapsResult = await strengthenCandidatesThroughMaps(withPlaceId);
          if (mapsResult && mapsResult.enriched > 0) {
            mapsEnrichedCount = mapsResult.enriched;
            targetCandidates = getActivePlaces();
          }
        }
      } catch (err) {
        console.warn('[Ownly Capture] In-tab Google Maps pass skipped:', err);
      }

      // Phase 2: Run batch enrichment on selected candidates
      let batchEnrichedCount = 0;
      if (targetCandidates.length > 0) {
        const targetIds = new Set(targetCandidates.map((c) => c.id));
        const facadeForEnrich = store.state.pendingPlaces.filter((p) => targetIds.has(p.id)) as unknown as PlannerTripPlace[];
        const needEnrichment = facadeForEnrich.filter(isCandidateMissingData);
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
          const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
          const activePlaces = getActivePlaces().map((cp) => {
            const enrichedVp = enrichedMap.get(cp.id);
            if (!enrichedVp) return cp;
            return mergePlaceResearch(cp, {
              title: enrichedVp.title,
              source: { ...cp.source, category: enrichedVp.source_category, types: enrichedVp.types },
              address: enrichedVp.address,
              coordinates: enrichedVp.coordinates,
              rating: enrichedVp.observed_rating,
              review_count: enrichedVp.observed_review_count,
              price: enrichedVp.observed_price ? { raw: enrichedVp.observed_price, currency: enrichedVp.price_currency, min: enrichedVp.price_min, max: enrichedVp.price_max, unit: enrichedVp.price_unit, level: enrichedVp.price_level } : undefined,
              phone: enrichedVp.phone,
              plus_code: enrichedVp.plus_code,
              open_hours: enrichedVp.open_hours,
              menu_url: enrichedVp.menu_url,
              reservation_url: enrichedVp.reservation_url,
              review_topics: enrichedVp.review_topics,
            });
          });
          store.setState({ ...store.stateV3, places: [...otherPlaces, ...activePlaces] });
          await saveState();
        }
      }

      const totalEnriched = mapsEnrichedCount + batchEnrichedCount;
      const latestCandidates = selected.size > 0
        ? getActivePlaces().filter((p) => selected.has(p.id))
        : getActivePlaces();
      if (totalEnriched > 0) {
        setStatus(
          `${dict.enrichComplete(totalEnriched)} · ${formatStrengthenCoverage(latestCandidates)}`,
          'success',
        );
      } else {
        const stillMissing = latestCandidates.some((p) => !p.rating || !p.address || !p.source.category);
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

  el.btnCloseSmartList.addEventListener('click', () => {
    logger.info('SmartList', 'dismiss clicked');
    store.smartListDismissed = true;
    renderSmartListCard();
  });

  // Smart-list import: independent — imports to active collection (no Planner required)
  el.btnSmartSyncAll.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const collection = store.getActiveCollection() ?? store.ensureDefaultCollection();
      let savedList = store.detectedSavedList;
      if (!collection) {
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
      const activePlaces = getActivePlaces();
      const syncedIds = new Set<string>();
      let importedCount = 0;
      const newPlaces: CapturePlace[] = [];
      for (const item of savedList.places) {
        const title = cleanExtractedText(item.title);
        if (!title || isJunkNavigationText(title)) continue;
        // Identity-first dedup: strong identity (Place ID/CID) → URL → coordinates
        const existing = findExistingPlaceByIdentity(activePlaces, {
          source_provider: item.sourceProvider,
          source_place_id: item.sourcePlaceId,
          source_url: item.sourceUrl,
        }) ?? findExistingPlace(activePlaces, item.sourceUrl, item.sourcePlaceId, item.coordinates);
        const id = existing?.id ?? crypto.randomUUID();
        syncedIds.add(id);
        const address = item.address ? cleanExtractedText(item.address) : undefined;
        const kind = inferPlaceKind([title, item.category, address, ...(item.types || [])].filter(Boolean).join(' '));
        const rawExistingPrice = existing?.price?.raw;
        const validExistingPrice = (rawExistingPrice && !isZeroOrPlaceholderPrice(rawExistingPrice))
          ? rawExistingPrice
          : undefined;
        const effectivePrice = item.priceLevel || validExistingPrice;
        const normalizedPrice = normalizeObservedPrice(effectivePrice, item.detectedCurrency || savedList.detectedCurrency || store.pageDetectedCurrency);
        let captured: CapturePlace;
        if (existing) {
          captured = mergePlaceResearch(existing, {
            title: title || existing.title,
            source: {
              ...existing.source,
              provider: item.sourceProvider || 'google_maps',
              url: item.sourceUrl || existing.source.url,
              place_id: item.sourcePlaceId ?? existing.source.place_id,
              category: item.category ? cleanExtractedText(item.category) : existing.source.category,
              types: Array.from(new Set([...(item.types ?? []), ...(existing.source.types ?? [])])),
            },
            address: address ?? existing.address,
            coordinates: item.coordinates ?? existing.coordinates,
            phone: item.phone ?? existing.phone,
            plus_code: item.plusCode ?? existing.plus_code,
            menu_url: item.menuUrl ?? existing.menu_url,
            reservation_url: item.reservationUrl ?? existing.reservation_url,
            review_topics: item.reviewTopics ?? existing.review_topics,
            rating: item.rating ?? existing.rating,
            review_count: item.reviewCount ?? existing.review_count,
            price: effectivePrice ? {
              raw: effectivePrice,
              currency: normalizedPrice?.currency ?? (validExistingPrice ? existing.price?.currency : undefined),
              min: normalizedPrice?.min,
              max: normalizedPrice?.max,
              unit: normalizedPrice?.unit,
              level: normalizedPrice?.level,
            } : existing.price,
            open_hours: item.openHours ?? existing.open_hours,
            updated_at: now,
          });
        } else {
          captured = {
            id,
            collection_id: collection.id,
            title,
            source: {
              provider: item.sourceProvider || 'google_maps',
              url: item.sourceUrl,
              place_id: item.sourcePlaceId,
              category: item.category ? cleanExtractedText(item.category) : undefined,
              types: item.types ?? [],
            },
            inferred_kind: kind as CapturePlace['inferred_kind'],
            address,
            rating: item.rating,
            review_count: item.reviewCount,
            price: effectivePrice ? {
              raw: effectivePrice,
              currency: normalizedPrice?.currency,
              min: normalizedPrice?.min,
              max: normalizedPrice?.max,
              unit: normalizedPrice?.unit,
              level: normalizedPrice?.level,
            } : undefined,
            open_hours: item.openHours,
            phone: item.phone,
            plus_code: item.plusCode,
            menu_url: item.menuUrl,
            reservation_url: item.reservationUrl,
            review_topics: item.reviewTopics,
            user: {
              priority: 'want',
              tags: ensurePlaceKindTag(savedList.listName ? [savedList.listName] : [], kind, store.lang),
              why: item.userNote ?? item.summary,
              notes: item.userNote,
            },
            captured_at: now,
          };
        }
        newPlaces.push(captured);
        importedCount += 1;
      }
      const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
      const existingActive = activePlaces.filter((p) => !syncedIds.has(p.id));
      store.setState({ ...store.stateV3, places: [...otherPlaces, ...existingActive, ...newPlaces] });
      await saveState();
      store.smartListDismissed = true;
      renderSmartListCard();
      renderCandidatesList();

      // Auto-enrich any synced candidates missing facts immediately in one smooth pass
      const syncedPlaces = getActivePlaces().filter((p) => syncedIds.has(p.id));
      const syncedIdsForEnrich = new Set(syncedPlaces.map((p) => p.id));
      const needsPass = store.state.pendingPlaces.filter((p) => syncedIdsForEnrich.has(p.id)) as unknown as PlannerTripPlace[];
      const needsPassMissing = needsPass.filter(isCandidateMissingData);
      if (needsPassMissing.length > 0) {
        setStatus(store.lang === 'zh' ? `正在自动补全 ${needsPassMissing.length} 个地点的 Place ID、评分与分类…` : `Auto-enriching ${needsPassMissing.length} places…`);
        const { enrichedPlaces, totalEnriched } = await enrichCandidatePlacesBatch(
          needsPassMissing,
          (processed, totalBatch, currentPlace) => {
            setStatus(dict.enrichingProgress(processed, totalBatch, currentPlace.title));
            renderCandidatesList();
          }
        );
        if (totalEnriched > 0) {
          const enrichedMap = new Map(enrichedPlaces.map((p) => [p.id, p] as const));
          const otherPlaces2 = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
          const activePlaces2 = getActivePlaces().map((cp) => {
            const enrichedVp = enrichedMap.get(cp.id);
            if (!enrichedVp) return cp;
            return mergePlaceResearch(cp, {
              title: enrichedVp.title,
              source: { ...cp.source, category: enrichedVp.source_category, types: enrichedVp.types },
              address: enrichedVp.address,
              coordinates: enrichedVp.coordinates,
              rating: enrichedVp.observed_rating,
              review_count: enrichedVp.observed_review_count,
              price: enrichedVp.observed_price ? { raw: enrichedVp.observed_price, currency: enrichedVp.price_currency, min: enrichedVp.price_min, max: enrichedVp.price_max, unit: enrichedVp.price_unit, level: enrichedVp.price_level } : undefined,
              phone: enrichedVp.phone,
              plus_code: enrichedVp.plus_code,
              open_hours: enrichedVp.open_hours,
              menu_url: enrichedVp.menu_url,
              reservation_url: enrichedVp.reservation_url,
              review_topics: enrichedVp.review_topics,
            });
          });
          store.setState({ ...store.stateV3, places: [...otherPlaces2, ...activePlaces2] });
          await saveState();
          renderCandidatesList();
        }
      }

      const finalSynced = getActivePlaces().filter((p) => syncedIds.has(p.id));
      const total = finalSynced.length;
      const withRating = finalSynced.filter((p) => p.rating !== undefined).length;
      const withReviews = finalSynced.filter((p) => p.review_count !== undefined).length;
      const withPrice = finalSynced.filter((p) => Boolean(p.price?.raw && !isZeroOrPlaceholderPrice(p.price.raw))).length;
      const withCategory = finalSynced.filter((p) => Boolean(p.source.category)).length;
      const coverage = store.lang === 'zh'
        ? ` · 评分 ${withRating}/${total} · 评论量 ${withReviews}/${total} · 价格 ${withPrice}/${total} · 分类 ${withCategory}/${total}`
        : ` · rating ${withRating}/${total} · reviews ${withReviews}/${total} · price ${withPrice}/${total} · category ${withCategory}/${total}`;
      setStatus(`${dict.savedListSynced(importedCount, savedList.listName)}${coverage}`, 'success');
      showImportReport({ received: savedList.places.length, created: newPlaces.map((p) => p.title), updated: [], deduped: [], failed: [] });
    })().catch((error) => setStatus(String(error), 'error'));
  });

  el.btnToggleListPreview.addEventListener('click', () => {
    store.isListPreviewOpen = !store.isListPreviewOpen;
    renderSmartListCard();
  });

  // Bulk text/list import targets the active collection only.
  el.btnParseBulkImport.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const collection = getActiveCollection();
      if (!collection) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const text = el.bulkInputText.value.trim();
      if (!text) {
        setStatus(dict.bulkImportEmpty, 'error');
        return;
      }
      const lines = text.split(/[\r\n;]+/).map((line) => line.trim()).filter(Boolean);
      const activePlaces = getActivePlaces();
      let importedCount = 0;
      const errors: string[] = [];
      const newlyAdded: CapturePlace[] = [];
      const now = new Date().toISOString();
      const newPlacesMap = new Map<string, CapturePlace>();
      for (const line of lines) {
        const isUrl = /^https?:\/\//i.test(line);
        if (isUrl && (line.includes('maps.app.goo.gl') || line.includes('!2s') || line.includes('placelists/list') || line.includes('goo.gl/maps'))) {
          try {
            const listItems = await resolveListPlacesSmart(line, collection.id);
            if (listItems && listItems.length > 0) {
              for (const item of listItems) {
                const existing = findExistingPlaceByIdentity(activePlaces, {
                  source_provider: item.source.provider,
                  source_place_id: item.source.place_id,
                  source_url: item.source.url,
                }) ?? findExistingPlace(activePlaces, item.source.url, item.source.place_id, item.coordinates);
                if (existing) continue;
                const newId = crypto.randomUUID();
                const newPlace: CapturePlace = { ...item, id: newId, collection_id: collection.id, captured_at: now };
                newPlacesMap.set(newId, newPlace);
                newlyAdded.push(newPlace);
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
        const existing = findExistingPlaceByIdentity(activePlaces, {
          source_url: sourceUrl,
        }) ?? findExistingPlace(activePlaces, sourceUrl);
        if (existing) continue;
        const kind = inferPlaceKind(safeDecodeUri(title));
        const newId = crypto.randomUUID();
        const place: CapturePlace = {
          id: newId,
          collection_id: collection.id,
          title: safeDecodeUri(title),
          source: {
            provider: inferSourceProvider(sourceUrl),
            url: sourceUrl,
          },
          inferred_kind: kind as CapturePlace['inferred_kind'],
          user: {
            priority: 'want',
            tags: ensurePlaceKindTag([], kind, store.lang),
          },
          captured_at: now,
        };
        newPlacesMap.set(newId, place);
        newlyAdded.push(place);
        importedCount += 1;
      }
      const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
      store.setState({ ...store.stateV3, places: [...otherPlaces, ...activePlaces, ...newlyAdded] });
      await saveState();
      el.bulkInputText.value = '';
      setStatus(errors.length > 0 ? dict.importedWithWarnings(importedCount, errors.join(', ')) : dict.importedCount(importedCount), 'success');
      showImportReport({
        received: lines.length,
        created: newlyAdded.map((p) => p.title),
        updated: [],
        deduped: [],
        failed: errors.map((e) => ({ title: e.split(':')[0] || e, reason: e })),
      });

      // Asynchronously enrich newly imported places
      if (newlyAdded.length > 0) {
        void (async () => {
          const newlyAddedIds = new Set(newlyAdded.map((p) => p.id));
          const facadeForEnrich = store.state.pendingPlaces.filter((p) => newlyAddedIds.has(p.id)) as unknown as PlannerTripPlace[];
          const needEnrichment = facadeForEnrich.filter(isCandidateMissingData);
          const { enrichedPlaces, totalEnriched } = await enrichCandidatePlacesBatch(
            needEnrichment,
            (processed, total, currentPlace) => {
              setStatus(dict.enrichingProgress(processed, total, currentPlace.title));
              renderCandidatesList();
            }
          );
          if (totalEnriched > 0) {
            const enrichedMap = new Map(enrichedPlaces.map((p) => [p.id, p] as const));
            const otherPlaces2 = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
            const activePlaces2 = getActivePlaces().map((cp) => {
              const enrichedVp = enrichedMap.get(cp.id);
              if (!enrichedVp) return cp;
              return mergePlaceResearch(cp, {
                title: enrichedVp.title,
                source: { ...cp.source, category: enrichedVp.source_category, types: enrichedVp.types },
                address: enrichedVp.address,
                coordinates: enrichedVp.coordinates,
                rating: enrichedVp.observed_rating,
                review_count: enrichedVp.observed_review_count,
                price: enrichedVp.observed_price ? { raw: enrichedVp.observed_price, currency: enrichedVp.price_currency, min: enrichedVp.price_min, max: enrichedVp.price_max, unit: enrichedVp.price_unit, level: enrichedVp.price_level } : undefined,
                phone: enrichedVp.phone,
                plus_code: enrichedVp.plus_code,
                open_hours: enrichedVp.open_hours,
                menu_url: enrichedVp.menu_url,
                reservation_url: enrichedVp.reservation_url,
                review_topics: enrichedVp.review_topics,
              });
            });
            store.setState({ ...store.stateV3, places: [...otherPlaces2, ...activePlaces2] });
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
      const inbox = store.getInboxCollection() ?? store.ensureDefaultCollection();
      const collection = inbox;
      if (!collection) {
        setStatus(t().tripRequiredError, 'error');
        return;
      }
      const selectedUrls = new Set(Array.from(el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.dataset.url).filter(Boolean));
      const source = store.detectedSavedList?.places?.length ? store.detectedSavedList.places : store.detectedListPlaces;
      const activePlaces = getActivePlaces();
      let added = 0;
      const now = new Date().toISOString();
      const newPlaces: CapturePlace[] = [];
      for (const item of source.filter((place) => selectedUrls.has(place.sourceUrl))) {
        const existing = findExistingPlaceByIdentity(activePlaces, {
          source_provider: item.sourceProvider,
          source_place_id: item.sourcePlaceId,
          source_url: item.sourceUrl,
        }) ?? findExistingPlace(activePlaces, item.sourceUrl, item.sourcePlaceId, item.coordinates);
        if (existing) continue;
        const kind = inferPlaceKind([item.title, item.category, item.address, ...(item.types || [])].filter(Boolean).join(' '));
        const place: CapturePlace = {
          id: crypto.randomUUID(),
          collection_id: collection.id,
          title: item.title,
          source: {
            provider: item.sourceProvider || 'google_maps',
            url: item.sourceUrl,
            place_id: item.sourcePlaceId,
            category: item.category ? cleanExtractedText(item.category) : undefined,
            types: item.types,
          },
          inferred_kind: kind as CapturePlace['inferred_kind'],
          user: {
            priority: 'want',
            tags: ensurePlaceKindTag([], kind, store.lang),
            why: item.userNote || item.summary,
            notes: item.userNote,
          },
          open_hours: item.openHours,
          address: item.address,
          rating: item.rating,
          review_count: item.reviewCount,
          price: item.priceLevel ? { raw: item.priceLevel } : undefined,
          coordinates: item.coordinates,
          phone: item.phone,
          plus_code: item.plusCode,
          menu_url: item.menuUrl,
          reservation_url: item.reservationUrl,
          review_topics: item.reviewTopics,
          captured_at: now,
        };
        newPlaces.push(place);
        added += 1;
      }
      const otherPlaces = store.stateV3.places.filter((p) => p.collection_id !== collection.id);
      store.setState({ ...store.stateV3, places: [...otherPlaces, ...activePlaces, ...newPlaces] });
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
    if (!store.currentPlace) return;
    const collection = getActiveCollection();
    if (!collection) return;
    const existing = getExistingPlaceForUrl(store.currentPlace.sourceUrl, store.currentPlace.sourcePlaceId);
    if (!existing) return;

    store.locallyDeletedIds.add(existing.id);
    store.removePlace(existing.id);
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
    logger.info('CaptureForm', 'submit', { title: store.currentPlace?.title, url: store.currentPlace?.sourceUrl?.slice(0, 60), kind: el.kind.value, targetCollection: store.getActiveCollection()?.title });
    const collection = store.getActiveCollection() ?? store.ensureDefaultCollection();
    if (!collection) {
      logger.error('CaptureForm', 'no collection');
      setStatus(dict.tripRequiredError, 'error');
      return;
    }
    if (!store.currentPlace) {
      logger.warn('CaptureForm', 'no currentPlace on submit');
      setStatus(dict.placeRequiredError, 'error');
      return;
    }
    const duration = Number(el.duration.value);
    const rating = Number(el.rating.value);
    const now = new Date().toISOString();
    const activePlaces = getActivePlaces();
    const existing = findExistingPlace(
      activePlaces,
      store.currentPlace.sourceUrl,
      store.currentPlace.sourcePlaceId,
      store.currentPlace.coordinates,
    );
    const kind = (el.kind.value as CapturePlace['inferred_kind']) || 'other';
    const tags = ensurePlaceKindTag(normalizeDelimitedText(el.tags.value), kind, store.lang);
    const rawPrice = el.price.value.trim() || undefined;
    const normalizedPrice = normalizeObservedPrice(rawPrice, store.currentPlace.detectedCurrency || existing?.price?.currency || store.pageDetectedCurrency);
    const id = existing?.id ?? crypto.randomUUID();
    const place: CapturePlace = {
      id,
      collection_id: collection.id,
      title: cleanExtractedText(store.currentPlace.title),
      source: {
        provider: store.currentPlace.sourceProvider || 'google_maps',
        url: store.currentPlace.sourceUrl,
        place_id: store.currentPlace.sourcePlaceId ?? existing?.source.place_id,
        category: store.currentPlace.category ? cleanExtractedText(store.currentPlace.category) : existing?.source.category,
        types: Array.from(new Set([...(store.currentPlace.types ?? []), ...(existing?.source.types ?? [])])),
      },
      inferred_kind: kind,
      address: cleanExtractedText(el.area.value.trim()) || cleanExtractedText(store.currentPlace.address ?? existing?.address) || undefined,
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
      review_count: store.currentPlace.reviewCount ?? existing?.review_count,
      price: normalizedPrice ? {
        raw: rawPrice,
        currency: normalizedPrice.currency,
        min: normalizedPrice.min,
        max: normalizedPrice.max,
        unit: normalizedPrice.unit,
        level: normalizedPrice.level,
      } : (rawPrice ? { raw: rawPrice } : undefined),
      open_hours: cleanExtractedText(store.currentPlace.openHours ?? existing?.open_hours) || undefined,
      phone: store.currentPlace.phone ?? existing?.phone,
      plus_code: store.currentPlace.plusCode ?? existing?.plus_code,
      menu_url: store.currentPlace.menuUrl ?? existing?.menu_url,
      reservation_url: store.currentPlace.reservationUrl ?? existing?.reservation_url,
      review_topics: store.currentPlace.reviewTopics ?? existing?.review_topics,
      user: {
        priority: existing?.user?.priority ?? 'want',
        tags,
        why: cleanExtractedText(el.why.value.trim()) || undefined,
        notes: cleanExtractedText(el.notes.value.trim()) || undefined,
        preferred_window: el.window.value.trim() || undefined,
        duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.min(1440, Math.round(duration)) : undefined,
      },
      captured_at: existing?.captured_at ?? now,
    };
    logger.info('CaptureForm', existing ? 'updating place' : 'creating place', { id, title: place.title, existing: Boolean(existing), placeId: place.source.place_id });
    store.setState({ ...store.stateV3, places: [...store.stateV3.places.filter((item) => item.id !== id), place] });
    void saveState().then(() => {
      syncQuickChipStates();
      setStatus(existing ? dict.candidateUpdated : dict.candidateAdded, 'success');
      logger.info('CaptureForm', existing ? 'place updated' : 'place added', { id, title: place.title });
      flashNewCandidate(place.id);
    }).catch((e) => {
      logger.error('CaptureForm', 'saveState failed after submit', String(e));
      setStatus(store.lang === 'zh' ? '保存失败，请重试。' : 'Save failed, retry.', 'error');
    });
  });

  el.captureForm.addEventListener('keydown' , (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      el.btnCaptureSubmit.click();
    }
  });

  el.kind.addEventListener('change', () => {
    const newKind = (el.kind.value as CapturePlace['inferred_kind']) || 'other';
    el.price.placeholder = newKind === 'stay'
      ? t().pricePlaceholderStay
      : t().pricePlaceholder;
    const currentTags = normalizeDelimitedText(el.tags.value);
    el.tags.value = ensurePlaceKindTag(currentTags, newKind, store.lang).join(', ');
  });

  // ── Collection Switcher (independent, no Planner needed) ──────────────────
  el.collectionSelector.addEventListener('change', () => {
    const id = el.collectionSelector.value;
    if (!id) return;
    const ok = store.setActiveCollection(id);
    if (ok) {
      logger.info('Collection', 'switch active', { id, title: store.getActiveCollection()?.title });
      void saveState().then(() => {
        renderState();
        renderCandidatesList();
        renderSmartListCard();
        renderCurrentPlace();
        setStatus(store.lang === 'zh' ? `已切换到合集：${store.getActiveCollection()?.title}` : `Switched to ${store.getActiveCollection()?.title}`, 'success');
      }).catch((e) => logger.error('Collection', 'switch save failed', String(e)));
      // Immediate feedback before persistence
      renderState();
      renderCandidatesList();
      renderSmartListCard();
    }
  });
  el.btnCreateCollection.addEventListener('click', () => {
    el.createCollectionRow.style.display = 'flex';
    el.inputNewCollection.value = '';
    el.inputNewCollection.focus();
    logger.debug('Collection', 'create row opened');
  });
  el.btnCancelCreateCollection.addEventListener('click', () => {
    el.createCollectionRow.style.display = 'none';
    el.inputNewCollection.value = '';
  });
  el.btnConfirmCreateCollection.addEventListener('click', () => {
    const title = el.inputNewCollection.value.trim();
    if (!title) {
      setStatus(store.lang === 'zh' ? '请输入合集名称' : 'Enter collection name', 'error');
      return;
    }
    try {
      const col = store.createCollection(title);
      logger.info('Collection', 'created', { id: col.id, title: col.title });
      el.createCollectionRow.style.display = 'none';
      el.inputNewCollection.value = '';
      void saveState().then(() => {
        renderState();
        renderCandidatesList();
        renderSmartListCard();
        setStatus(store.lang === 'zh' ? `已创建合集：${col.title}` : `Created ${col.title}`, 'success');
      });
    } catch (e) {
      logger.error('Collection', 'create failed', String(e));
      setStatus(String(e), 'error');
    }
  });
  el.inputNewCollection.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.btnConfirmCreateCollection.click();
    if (e.key === 'Escape') el.btnCancelCreateCollection.click();
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
  setupImportExportHandlers();
}
