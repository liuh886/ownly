import {
  classifyResearchChip,
  convertPriceRange,
  ensurePlaceKindTag,
  getPlannerKindLabel,
  inferPlaceKind,
  isPlausibleCustomTag,
  normalizeDelimitedText,
  PLANNER_KIND_ICONS,
  PLANNER_KIND_LABELS,
  type PlannerPlaceKind,
  type PlannerTripPlace,
} from '../../domain/planner';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { el } from '../dom';
import { logger } from '../logger';
import { escapeHtml, isPlausiblePriceText, isZeroOrPlaceholderPrice } from '../utils';
import { matchesSavedListContext } from '../saved-list-match';
import { getExistingPlaceForUrl, store, t } from './store';

const KIND_ICONS = PLANNER_KIND_ICONS;

const PROVIDER_META: Record<string, { emoji: string; label: string }> = {
  google_maps: { emoji: '🗺️', label: 'Maps' },
  tabelog: { emoji: '🍜', label: 'Tabelog' },
  xiaohongshu: { emoji: '📕', label: '小红书' },
  booking: { emoji: '🏨', label: 'Booking' },
  other: { emoji: '🔗', label: 'Link' },
};

let statusTimer: number | undefined;

/**
 * Rewrites only the leading text node of a label, leaving nested inputs and
 * other elements untouched. Safe no-op when the label has no text child
 * (e.g. the hidden chip-target spans), so i18n can never crash the panel.
 */
function setLeadingLabel(node: HTMLElement, text: string): void {
  const first = node.childNodes[0];
  if (first && first.nodeType === Node.TEXT_NODE) {
    (first as Text).nodeValue = text;
  }
}

export function setStatus(message: string, tone: 'muted' | 'success' | 'error' = 'muted') {
  if (statusTimer !== undefined) {
    window.clearTimeout(statusTimer);
    statusTimer = undefined;
  }
  el.status.textContent = message;
  el.status.dataset.tone = tone;
  el.status.classList.add('visible');
  if (tone !== 'muted' && message) {
    statusTimer = window.setTimeout(() => {
      el.status.classList.remove('visible');
      statusTimer = undefined;
    }, 3200);
  }
}

export function applyI18n() {
  const dict = t();
  document.documentElement.lang = store.lang;
  el.langToggle.textContent = store.lang === 'zh' ? 'EN' : '中文';
  el.lblFxTooltipToggle.title = dict.toggleFxTooltipDesc;
  el.txtFxTooltipToggle.textContent = dict.toggleFxTooltipLabel;
  el.lblDebugToggle.title = dict.toggleDebugDesc;
  el.txtDebugToggle.textContent = dict.toggleDebugLabel;
  el.toggleDebugMode.checked = store.debugModeEnabled;
  el.debugDrawer.style.display = store.debugModeEnabled ? 'block' : 'none';
  el.lblActiveTrip.textContent = dict.activeTrip;
  el.sumBulkImport.textContent = dict.sumBulkImport;
  setLeadingLabel(el.lblBulkText, dict.lblBulkText);
  el.bulkInputText.placeholder = dict.bulkPlaceholder;
  el.btnParseBulkImport.textContent = dict.btnParseBulkImport;
  el.btnBackupState.textContent = dict.backupBtn;
  el.btnRestoreState.textContent = dict.restoreBtn;

  el.btnToggleSelectAll.textContent = dict.btnSelectAll;
  el.btnBatchAdd.textContent = dict.btnBatchAdd;

  el.lblCurrentPlace.textContent = dict.currentPlaceLabel;
  el.refreshPlace.textContent = dict.refreshBtn;
  el.txtCapturedBanner.textContent = dict.capturedBanner;

  setLeadingLabel(el.lblKind, dict.kindLabel);
  for (const opt of Array.from(el.kind.options)) {
    const val = opt.value as PlannerPlaceKind;
    if (dict.kinds[val]) opt.textContent = dict.kinds[val];
  }

  setLeadingLabel(el.lblArea, dict.areaLabel);
  el.area.placeholder = dict.areaPlaceholder;
  setLeadingLabel(el.lblTags, dict.tagsLabel);
  el.tags.placeholder = dict.tagsPlaceholder;
  setLeadingLabel(el.lblDuration, dict.durationLabel);
  el.duration.placeholder = dict.durationPlaceholder;
  setLeadingLabel(el.lblWindow, dict.windowLabel);
  el.window.placeholder = dict.windowPlaceholder;
  setLeadingLabel(el.lblRating, dict.ratingLabel);
  el.rating.placeholder = dict.ratingPlaceholder;
  setLeadingLabel(el.lblPrice, dict.priceLabel);
  el.price.placeholder = dict.pricePlaceholder;
  el.lblQuickChips.textContent = dict.quickChipsLabel;

  setLeadingLabel(el.lblWhy, dict.whyLabel);
  el.why.placeholder = dict.whyPlaceholder;
  el.captureAdvancedSummary.textContent = dict.advancedSettings;
  setLeadingLabel(el.lblSignals, dict.signalsLabel);
  el.signals.placeholder = dict.signalsPlaceholder;
  setLeadingLabel(el.lblRisks, dict.risksLabel);
  el.risks.placeholder = dict.risksPlaceholder;
  setLeadingLabel(el.lblNotes, dict.notesLabel);
  el.notes.placeholder = dict.notesPlaceholder;
  el.btnRemoveCandidate.textContent = dict.btnRemoveCandidate;

  el.sumCandidatesDrawer.textContent = dict.drawerTitle;
  el.candidatesSearch.placeholder = dict.searchPlaceholder;

  el.btnEnrichCandidates.textContent = dict.btnEnrichCandidates;
  el.btnSelectAllCandidates.textContent = dict.btnSelectAllCandidates;
  el.btnBulkEnrich.textContent = dict.btnBulkEnrichCandidates;
  el.btnBulkDelete.textContent = dict.btnBulkDeleteCandidates;
  el.btnBulkExit.textContent = dict.btnBulkExitInline;
  if (el.bulkPrioritySelect.options[0]) {
    el.bulkPrioritySelect.options[0].textContent = dict.bulkPriorityPlaceholder;
  }

  el.sumDebugDrawer.textContent = dict.sumDebugDrawer;
  el.btnCopyDebugLogs.textContent = dict.btnCopyDebugLogs;
  el.btnExportDiagnostics.textContent = dict.btnExportDiagnostics;
  el.btnClearDebugLogs.textContent = dict.btnClearDebugLogs;

  renderCurrencyPill();
  renderChips();
  renderFilters();
  renderState();
  renderCurrentPlace();
  renderSmartListCard();
  renderCandidatesList();
  syncQuickChipStates();
  updateDebugLogViewer();
}

export function updateDebugLogViewer() {
  const viewer = el.debugLogViewer;
  if (!viewer) return;
  const logs = logger.getAllFormattedText();
  const report = store.state.lastImportReport;
  const importDebug = report
    ? [
        'Capture Import Debug',
        `Received: ${report.received}`,
        `Imported: ${report.imported.length}`,
        `Failed: ${report.failed.length}`,
        ...(report.failed.length > 0
          ? ['Failed Items:', ...report.failed.flatMap((item) => [`• ${item.title}`, `  Reason: ${item.reason}`]), 'Retry available']
          : []),
      ].join('\n')
    : '';
  viewer.textContent = [importDebug, logs].filter(Boolean).join('\n\n') || (store.lang === 'zh' ? '[暂无调试日志]' : '[No debug logs yet]');
  viewer.scrollTop = viewer.scrollHeight;
}

function renderChips() {
  const dict = t();
  el.quickChips.innerHTML = '';

  const activeTrip = store.state.activeContext;
  const customTags = activeTrip?.tags || [];

  // Render custom trip sub-tags first (e.g. 曼谷, 清迈, 普吉)
  for (const tag of customTags) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip custom-chip';
    btn.dataset.chip = tag;
    btn.dataset.kind = 'tag';
    btn.textContent = `🏷️ ${tag}`;
    btn.addEventListener('click', () => {
      const existing = normalizeDelimitedText(el.tags.value);
      if (existing.includes(tag)) {
        el.tags.value = existing.filter((item) => item !== tag).join(', ');
      } else {
        el.tags.value = [...existing, tag].join(', ');
        if (!el.captureAdvanced.open) el.captureAdvanced.open = true;
        el.tags.focus({ preventScroll: false });
      }
      syncQuickChipStates();
    });
    el.quickChips.append(btn);
  }

  for (const chip of dict.chips) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.chip = chip;
    btn.dataset.kind = classifyResearchChip(chip);
    btn.textContent = `+ ${chip}`;
    btn.addEventListener('click', () => {
      const isRisk = classifyResearchChip(chip) === 'risk';
      const targetInput = isRisk ? el.risks : el.signals;
      const existing = normalizeDelimitedText(targetInput.value);
      if (existing.includes(chip)) {
        targetInput.value = existing.filter((item) => item !== chip).join(', ');
      } else {
        targetInput.value = [...existing, chip].join(', ');
        if (!el.captureAdvanced.open) {
          el.captureAdvanced.open = true;
        }
        targetInput.focus({ preventScroll: false });
      }
      syncQuickChipStates();
    });
    el.quickChips.append(btn);
  }
  syncQuickChipStates();
}

export function syncQuickChipStates(): void {
  const tags = new Set(normalizeDelimitedText(el.tags.value));
  const signals = new Set(normalizeDelimitedText(el.signals.value));
  const risks = new Set(normalizeDelimitedText(el.risks.value));
  for (const btn of Array.from(el.quickChips.querySelectorAll<HTMLButtonElement>('.chip'))) {
    const value = btn.dataset.chip || '';
    const kind = btn.dataset.kind || 'signal';
    const selected = kind === 'tag' ? tags.has(value) : kind === 'risk' ? risks.has(value) : signals.has(value);
    btn.classList.toggle('selected', selected);
    const baseLabel = kind === 'tag' ? `🏷️ ${value}` : `+ ${value}`;
    btn.textContent = selected && kind !== 'tag' ? `✓ ${value}` : baseLabel;
  }
}

function renderFilters() {
  const dict = t();
  const activeTrip = store.state.activeContext;
  const tripPlaces = store.state.pendingPlaces.filter(
    (p) => p.trip_id === store.state.activeContext?.tripId,
  );

  const filters: { id: string; label: string; count: number }[] = [
    { id: 'all', label: dict.allFilter, count: tripPlaces.length },
  ];

  const mustCount = tripPlaces.filter((p) => p.priority === 'must').length;
  if (mustCount > 0) filters.push({ id: 'must', label: dict.mustFilter, count: mustCount });

  const wantCount = tripPlaces.filter((p) => p.priority === 'want').length;
  if (wantCount > 0) filters.push({ id: 'want', label: dict.wantFilter, count: wantCount });

  const allKinds: PlannerPlaceKind[] = ['stay', 'food', 'cafe', 'attraction', 'experience', 'shopping', 'transit', 'other'];
  for (const kind of allKinds) {
    const kindTagZh = PLANNER_KIND_LABELS[kind]?.zh.toLowerCase() || '';
    const kindTagEn = PLANNER_KIND_LABELS[kind]?.en.toLowerCase() || '';
    const count = tripPlaces.filter(
      (p) =>
        p.kind === kind ||
        p.tags.some((t) => {
          const lower = t.trim().toLowerCase();
          return lower === kindTagZh || lower === kindTagEn;
        }),
    ).length;
    if (count > 0) {
      const cleanName = getPlannerKindLabel(kind, store.lang);
      const label = `${KIND_ICONS[kind] || ''} ${cleanName}`;
      filters.push({ id: kind, label, count });
    }
  }

  // Dynamically add non-kind tags as filter chips (e.g. 曼谷, 清迈, 普吉)
  const excludedNames = new Set<string>();
  for (const p of tripPlaces) {
    if (p.title) excludedNames.add(p.title.trim().toLowerCase());
    if (p.address) {
      excludedNames.add(p.address.trim().toLowerCase());
      p.address.split(/[,，·]/).forEach((part) => {
        const t = part.trim().toLowerCase();
        if (t.length > 2) excludedNames.add(t);
      });
    }
    if (p.area) excludedNames.add(p.area.trim().toLowerCase());
  }

  const knownKindTags = new Set(
    Object.values(PLANNER_KIND_LABELS).flatMap((l) => [
      l.zh.toLowerCase(),
      l.en.toLowerCase(),
      '观光景点',
      '餐厅美食',
      '咖啡甜品',
      '酒店住宿',
      '购物商场',
      '交通中转',
      '体验活动',
      '景点',
      '美食',
      '咖啡',
      '住宿',
      '购物',
      '交通',
      '体验',
      '其它',
      '其他',
    ]),
  );

  const allTags = Array.from(
    new Set([
      ...(activeTrip?.tags || []),
      ...tripPlaces.flatMap((p) => [...(p.tags || []), ...(p.signals || []), ...(p.risks || [])]),
    ]),
  )
    .filter(Boolean)
    .filter((tag) => {
      const lower = tag.trim().toLowerCase();
      return !knownKindTags.has(lower) && !excludedNames.has(lower) && isPlausibleCustomTag(tag, excludedNames);
    });

  for (const tag of allTags) {
    const tagLower = tag.trim().toLowerCase();
    const count = tripPlaces.filter(
      (p) =>
        p.tags.some((t) => t.trim().toLowerCase() === tagLower) ||
        p.signals?.some((s) => s.trim().toLowerCase() === tagLower) ||
        p.risks?.some((r) => r.trim().toLowerCase() === tagLower),
    ).length;
    if (count > 0) {
      filters.push({ id: `tag:${tag}`, label: `🏷️ ${tag}`, count });
    }
  }

  el.candidatesFilterBar.innerHTML = '';
  for (const item of filters) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-btn ${store.activeFilter === item.id ? 'active' : ''}`;
    btn.textContent = `${item.label} (${item.count})`;
    btn.addEventListener('click', () => {
      store.activeFilter = store.activeFilter === item.id && item.id !== 'all' ? 'all' : item.id;
      renderFilters();
      renderCandidatesList();
    });
    el.candidatesFilterBar.append(btn);
  }
}


export function renderState() {
  const dict = t();
  el.pending.textContent = `${store.state.pendingPlaces.length} ${dict.pendingSuffix}`;
  const context = store.state.activeContext;
  el.captureContextTitle.textContent = context
    ? `${context.title}${context.currency ? ` [${context.currency}]` : ''}`
    : (store.lang === 'zh' ? '未连接 Planner 行程' : 'No Planner trip selected');
  el.captureContextHint.textContent = context
    ? (store.lang === 'zh' ? '由 Planner 控制 · Capture 只收集研究候选' : 'Controlled by Planner · Capture only collects research candidates')
    : (store.lang === 'zh' ? '请先在 Ownly Planner 选择一个行程' : 'Select a trip in Ownly Planner first');
  el.btnCaptureSubmit.disabled = !context;
  renderChips();
  renderFilters();
}

export const CURRENCY_OPTIONS_CONFIG: Array<{ code: string; nameZh: string; nameEn: string; symbol: string }> = [
  { code: 'SGD', nameZh: '新加坡元', nameEn: 'Singapore Dollar', symbol: 'S$' },
  { code: 'CNY', nameZh: '人民币', nameEn: 'Chinese Yuan', symbol: '¥' },
  { code: 'USD', nameZh: '美元', nameEn: 'US Dollar', symbol: '$' },
  { code: 'THB', nameZh: '泰铢', nameEn: 'Thai Baht', symbol: '฿' },
  { code: 'JPY', nameZh: '日元', nameEn: 'Japanese Yen', symbol: '¥' },
  { code: 'HKD', nameZh: '港币', nameEn: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'TWD', nameZh: '新台币', nameEn: 'New Taiwan Dollar', symbol: 'NT$' },
  { code: 'EUR', nameZh: '欧元', nameEn: 'Euro', symbol: '€' },
  { code: 'GBP', nameZh: '英镑', nameEn: 'British Pound', symbol: '£' },
  { code: 'AUD', nameZh: '澳元', nameEn: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', nameZh: '加元', nameEn: 'Canadian Dollar', symbol: 'C$' },
  { code: 'KRW', nameZh: '韩元', nameEn: 'South Korean Won', symbol: '₩' },
  { code: 'MYR', nameZh: '马来西亚令吉', nameEn: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'VND', nameZh: '越南盾', nameEn: 'Vietnamese Dong', symbol: '₫' },
  { code: 'PHP', nameZh: '菲律宾比索', nameEn: 'Philippine Peso', symbol: '₱' },
  { code: 'IDR', nameZh: '印尼盾', nameEn: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'AED', nameZh: '阿联酋迪拉姆', nameEn: 'UAE Dirham', symbol: 'AED' },
  { code: 'NZD', nameZh: '新西兰元', nameEn: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CHF', nameZh: '瑞士法郎', nameEn: 'Swiss Franc', symbol: 'CHF' },
];

export function renderCurrencyPill() {
  const bar = el.pageCurrencyBar;
  const sel = el.currencySelector;
  const btnRedetect = el.btnRedetectCurrency;

  const detected = store.pageDetectedCurrency || '';
  const isZh = store.lang === 'zh';

  if (bar) bar.style.display = 'flex';

  if (btnRedetect) {
    btnRedetect.title = isZh ? '恢复自动检测 / 重新检测' : 'Reset to auto-detect / Re-detect';
  }

  if (sel) {
    sel.innerHTML = '';

    const isOverride = Boolean(store.mapCurrencyOverride);
    if (isOverride) {
      sel.classList.add('is-override');
      sel.title = isZh
        ? `当前页面手动指定货币：${store.mapCurrencyOverride}`
        : `Manual page currency override: ${store.mapCurrencyOverride}`;
    } else {
      sel.classList.remove('is-override');
      sel.title = isZh
        ? `当前页面自动检测货币：${detected || '检测中'}`
        : `Auto-detected page currency: ${detected || 'detecting'}`;
    }

    // 1. AUTO Option with live detected indicator
    const autoOpt = document.createElement('option');
    autoOpt.value = 'AUTO';
    autoOpt.textContent = isZh
      ? (detected ? `⚡ 自动 (${detected})` : '⚡ 自动检测')
      : (detected ? `⚡ Auto (${detected})` : '⚡ Auto');
    sel.append(autoOpt);

    // 2. Full currency options list
    for (const item of CURRENCY_OPTIONS_CONFIG) {
      const opt = document.createElement('option');
      opt.value = item.code;
      opt.textContent = isZh
        ? `${item.code} - ${item.nameZh} (${item.symbol})`
        : `${item.code} - ${item.nameEn} (${item.symbol})`;
      sel.append(opt);
    }

    sel.value = store.mapCurrencyOverride || 'AUTO';
  }
}

export function renderSmartListCard() {
  const dict = t();
  if (store.smartListDismissed) {
    el.smartListSection.style.display = 'none';
    return;
  }
  const activeTrip = store.state.activeContext;

  // 1. Overview page with multiple lists found
  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && store.detectedAllLists.length > 0) {
    el.smartListSection.style.display = 'block';
    el.smartListSection.className = 'panel stack match-banner neutral';
    el.smartListBadge.textContent = dict.listsFoundBadge;
    el.smartListTitle.textContent = dict.listsFoundTitle(store.detectedAllLists.length);
    el.smartListCountBadge.textContent = dict.clickToLoad;
    el.smartListDesc.innerHTML = `${escapeHtml(dict.loadListIntro)}<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:5px;">` +
      store.detectedAllLists.map((l) => `<button type="button" class="list-chip" data-list-id="${escapeHtml(l.listId || '')}">📁 ${escapeHtml(l.listName)}${l.count ? ` (${l.count})` : ''}</button>`).join('') +
      '</div>';
    el.btnSmartSyncAll.style.display = 'none';
    el.btnToggleListPreview.style.display = 'none';
    el.smartListPreviewContainer.style.display = 'none';

    // Add click listeners to list chips
    const chips = el.smartListDesc.querySelectorAll<HTMLButtonElement>('.list-chip');
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
  const truncNote = store.detectedSavedList.truncated ? ` ⚠️ ${dict.truncatedWarn(places.length)}` : '';
  el.smartListSection.style.display = 'block';
  el.btnSmartSyncAll.style.display = 'block';
  el.btnToggleListPreview.style.display = 'block';
  el.smartListTitle.textContent = store.detectedSavedList.listName;
  el.smartListCountBadge.textContent = dict.placesCountBadge(places.length);

  let isMatched = false;
  if (activeTrip) {
    isMatched = matchesSavedListContext(store.detectedSavedList.listName, activeTrip);

    el.smartListSection.className = isMatched ? 'panel stack match-banner' : 'panel stack match-banner neutral';
    el.smartListBadge.textContent = isMatched ? dict.matchedBadge : dict.sensedBadge;
    el.smartListDesc.textContent = isMatched
      ? dict.matchedDesc(store.detectedSavedList.listName, activeTrip.title) + truncNote
      : dict.unmatchedDesc(places.length, activeTrip.title) + truncNote;
    el.btnSmartSyncAll.textContent = dict.syncAllBtn(places.length);
  } else {
    el.smartListSection.className = 'panel stack match-banner neutral';
    el.smartListBadge.textContent = dict.sensedBadge;
    el.smartListDesc.textContent = dict.sensedNoTripDesc(store.detectedSavedList.listName, places.length) + truncNote;
    el.btnSmartSyncAll.textContent = dict.importAllBtn(places.length);
  }

  // Preview container render
  el.smartListPreviewContainer.style.display = store.isListPreviewOpen ? 'block' : 'none';
  el.btnToggleListPreview.textContent = store.isListPreviewOpen ? dict.collapseList : dict.pickPlaces;
  el.batchListContainer.innerHTML = '';

  for (const item of places) {
    const row = document.createElement('div');
    row.className = 'batch-item';

    const thumb = document.createElement('span');
    thumb.className = 'batch-thumb';
    thumb.textContent = KIND_ICONS[inferPlaceKind(item.category || item.title)] || '📍';

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

    row.append(thumb, chk, info);
    el.batchListContainer.append(row);
  }
}

export function autoFillPlaceForm(place: CurrentResearchPlace) {
  const compositeKindText = [
    place.category,
    place.title,
    place.address,
    ...(place.types || []),
  ].filter(Boolean).join(' ');
  const freshDetectedKind = inferPlaceKind(compositeKindText);

  const existing = getExistingPlaceForUrl(place.sourceUrl, place.sourcePlaceId);
  if (existing) {
    const isGeneric = existing.kind === 'attraction' || existing.kind === 'other';
    const hasSpecificDetection = freshDetectedKind !== 'attraction' && freshDetectedKind !== 'other';
    const effectiveKind = (isGeneric && hasSpecificDetection) ? freshDetectedKind : existing.kind;

    el.kind.value = effectiveKind;
    el.area.value = existing.area || (place.address?.split(/[,，·]/)[0]?.trim() || '');
    const rawTags = existing.tags || [];
    el.tags.value = ensurePlaceKindTag(rawTags, effectiveKind, store.lang).join(', ');
    el.duration.value = existing.duration_minutes ? String(existing.duration_minutes) : '';
    el.window.value = existing.preferred_window || '';
    el.rating.value = existing.observed_rating ? String(existing.observed_rating) : (place.rating ? String(place.rating) : '');
    const storedPrice = isPlausiblePriceText(existing.observed_price) ? existing.observed_price : undefined;
    el.price.value = storedPrice || (isPlausiblePriceText(place.priceLevel) ? place.priceLevel! : '');
    el.why.value = existing.why || place.summary || '';
    el.signals.value = existing.signals?.join(', ') || '';
    el.risks.value = existing.risks?.join(', ') || '';
    el.notes.value = existing.notes || '';
    applyTierNote(place);
    return;
  }

  // No existing — start fresh: clear all optional fields before auto-filling
  el.rating.value = '';
  el.price.value = '';
  el.area.value = '';
  el.tags.value = '';
  el.duration.value = '';
  el.window.value = '';
  el.why.value = '';
  el.signals.value = '';
  el.risks.value = '';
  el.notes.value = '';

  if (place.rating) {
    el.rating.value = String(place.rating);
  }
  if (place.priceLevel && isPlausiblePriceText(place.priceLevel)) {
    el.price.value = place.priceLevel;
  } else if (place.detectedCurrency) {
    el.price.placeholder = t().pricePlaceholderWithCurrency(place.detectedCurrency);
  }
  el.kind.value = freshDetectedKind;
  if (place.address && !el.area.value) {
    const parts = place.address.split(/[,，·]/).map((p) => p.trim()).filter(Boolean);
    el.area.value = parts[0] || place.address;
  }
  if ((place.userNote || place.summary) && !el.why.value) {
    el.why.value = place.userNote || place.summary || '';
  }
  applyTierNote(place);
  if (place.userNote && !el.notes.value) {
    el.notes.value = place.userNote;
  }
  const baseTags = (store.state.activeContext?.tags || []).filter(Boolean);
  el.tags.value = ensurePlaceKindTag(baseTags, freshDetectedKind, store.lang).join(', ');
}

function applyTierNote(place: CurrentResearchPlace): void {
  const tier = place.tierNote?.trim();
  if (!tier) return;
  if (el.why.value.includes(tier)) return;
  el.why.value = el.why.value ? `${el.why.value}\n🏨 ${tier}` : `🏨 ${tier}`;
}

export function renderCurrentPlace() {
  const dict = t();
  el.placeMetaBadges.innerHTML = '';
  el.btnDismissPlace.style.display = store.currentPlace ? 'inline-block' : 'none';
  const provider = store.currentPlace?.sourceProvider;
  if (store.currentPlace && provider) {
    el.placeProvider.textContent = `${PROVIDER_META[provider].emoji} ${PROVIDER_META[provider].label}`;
    el.placeProvider.title = PROVIDER_META[provider].label;
    el.placeProvider.style.display = 'inline-flex';
  } else {
    el.placeProvider.style.display = 'none';
  }
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
  if (store.currentPlace.address || store.currentPlace.coordinates) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = '📍';
    b.title = store.currentPlace.address || `${store.currentPlace.coordinates?.lat}, ${store.currentPlace.coordinates?.lng}`;
    el.placeMetaBadges.append(b);
  }

  setStatus(dict.readyToCapture);
}

function sanitizeSafeHref(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

const cardCache = new Map<string, { sig: string; node: HTMLDivElement }>();

function candidateCardSig(place: import('../../domain/planner').PlannerTripPlace, dictKey: string): string {
  return [
    place.updated_at || '',
    place.price_currency || '',
    store.mapCurrencyOverride || '',
    store.pageDetectedCurrency || '',
    store.state.activeContext?.currency || '',
    store.editingCandidateId === place.id ? 'edit' : 'view',
    store.bulkMode ? 'bulk' : 'single',
    store.bulkSelected.has(place.id) ? 'sel' : 'unsel',
    dictKey,
  ].join('|');
}

export function renderCandidatesList() {
  const dict = t();
  const dictKey = store.lang;

  let candidates = store.state.pendingPlaces.filter(
    (p) => p.trip_id === store.state.activeContext?.tripId,
  );
  el.candidatesCountBadge.textContent = String(candidates.length);

  el.btnEnrichCandidates.style.display = store.bulkMode ? 'none' : 'inline-block';
  if (store.bulkMode) {
    el.btnBulkEnrich.textContent = store.bulkSelected.size > 0
      ? (store.lang === 'zh' ? `⚡ 一键补强 (${store.bulkSelected.size})` : `⚡ Strengthen (${store.bulkSelected.size})`)
      : dict.btnBulkEnrichCandidates;
  }

  const kindMatches = (p: PlannerTripPlace, kind: PlannerPlaceKind): boolean => {
    const zhLabel = PLANNER_KIND_LABELS[kind]?.zh.toLowerCase() || '';
    const enLabel = PLANNER_KIND_LABELS[kind]?.en.toLowerCase() || '';
    return (
      p.kind === kind ||
      p.tags.some((t) => {
        const lower = t.trim().toLowerCase();
        return lower === zhLabel || lower === enLabel;
      })
    );
  };

  if (store.activeFilter === 'must') candidates = candidates.filter((p) => p.priority === 'must');
  if (store.activeFilter === 'want') candidates = candidates.filter((p) => p.priority === 'want');
  if (store.activeFilter === 'stay') candidates = candidates.filter((p) => kindMatches(p, 'stay'));
  if (store.activeFilter === 'food') candidates = candidates.filter((p) => kindMatches(p, 'food'));
  if (store.activeFilter === 'cafe') candidates = candidates.filter((p) => kindMatches(p, 'cafe'));
  if (store.activeFilter === 'attraction') candidates = candidates.filter((p) => kindMatches(p, 'attraction'));
  if (store.activeFilter === 'experience') candidates = candidates.filter((p) => kindMatches(p, 'experience'));
  if (store.activeFilter === 'shopping') candidates = candidates.filter((p) => kindMatches(p, 'shopping'));
  if (store.activeFilter === 'transit') candidates = candidates.filter((p) => kindMatches(p, 'transit'));
  if (store.activeFilter === 'other') candidates = candidates.filter((p) => kindMatches(p, 'other'));
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
    cardCache.clear();
    const empty = document.createElement('div');
    empty.style.color = '#78716c';
    empty.style.fontSize = '11px';
    empty.style.padding = '8px 4px';
    empty.textContent = dict.emptyCandidates;
    el.candidatesListContainer.append(empty);
    return;
  }

  const seen = new Set<string>();
  for (const place of candidates) {
    seen.add(place.id);
    const sig = candidateCardSig(place, dictKey);
    let node = cardCache.get(place.id)?.node;
    const cached = cardCache.get(place.id);
    if (cached && cached.sig === sig) {
      el.candidatesListContainer.append(cached.node);
      continue;
    }
    node = buildCandidateCard(place, dict);
    cardCache.set(place.id, { sig, node });
    el.candidatesListContainer.append(node);
  }
  for (const id of [...cardCache.keys()]) {
    if (!seen.has(id)) cardCache.delete(id);
  }
}

function buildCandidateCard(
  place: PlannerTripPlace,
  dict: ReturnType<typeof t>,
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'candidate-card' + (store.bulkMode && store.bulkSelected.has(place.id) ? ' bulk-selected' : '');
  card.dataset.placeId = place.id;

    const header = document.createElement('div');
    header.className = 'candidate-header';

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.draggable = true;
    grip.textContent = '⠿';
    grip.title = store.lang === 'zh' ? '拖动调整候选池顺序' : 'Drag to reorder the pool';

    const titleEl = document.createElement('div');
    titleEl.className = 'candidate-title';
    titleEl.textContent = `${KIND_ICONS[place.kind] || '📍'} ${place.title}`;

    header.append(grip, titleEl);

    if (store.editingCandidateId === place.id) {
      card.append(header, buildInlineEditor(place, dict));
    } else {
      card.append(header, buildCandidateDetails(place, dict));
    }
  return card;
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

  // Row 2: Price & Rating
  const row2 = document.createElement('div');
  row2.className = 'inline-row';

  const priceLabel = document.createElement('label');
  priceLabel.textContent = dict.priceLabel;
  const priceInput = document.createElement('input');
  priceInput.name = 'price';
  priceInput.type = 'text';
  priceInput.value = place.observed_price || '';
  priceInput.placeholder = dict.pricePlaceholder;
  priceLabel.append(priceInput);

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

  row2.append(priceLabel, ratingLabel);

  // Row 3: Duration & Tags
  const row3 = document.createElement('div');
  row3.className = 'inline-row';

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

  row3.append(durationLabel);

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
): HTMLDivElement {
  const wrapper = document.createElement('div');

  const details = document.createElement('div');
  details.className = 'candidate-details';
  if (store.bulkMode) {
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'bulk-check';
    chk.checked = store.bulkSelected.has(place.id);
    chk.dataset.action = 'bulk-check';
    chk.dataset.placeId = place.id;
    wrapper.append(chk);
  }
  const parts: string[] = [];
  if (place.area || place.address) parts.push('<span title="' + escapeHtml(place.address ?? place.area ?? '') + '">📍</span>');
  if (place.source_category) parts.push(`<span class="badge" title="${escapeHtml(place.source_category)}">🏷️ ${escapeHtml(place.source_category)}</span>`);
  if (place.plus_code) parts.push(`<span class="badge" title="Plus Code">➕ ${escapeHtml(place.plus_code)}</span>`);
  if (place.source_place_id) {
    parts.push(`<span class="badge" title="${escapeHtml(place.source_place_id)}">🆔</span>`);
  }
  const safeMenuUrl = sanitizeSafeHref(place.menu_url);
  if (safeMenuUrl) parts.push(`<a href="${escapeHtml(safeMenuUrl)}" target="_blank" rel="noreferrer" class="badge">${escapeHtml(dict.menuBadge)}</a>`);
  const safeResUrl = sanitizeSafeHref(place.reservation_url);
  if (safeResUrl) parts.push(`<a href="${escapeHtml(safeResUrl)}" target="_blank" rel="noreferrer" class="badge highlight">${escapeHtml(dict.reserveBadge)}</a>`);
  if (place.review_topics && place.review_topics.length > 0) {
    parts.push(`<span class="badge">💬 ${escapeHtml(place.review_topics.slice(0, 3).join(' · '))}</span>`);
  }
  if (place.observed_rating && place.observed_rating > 1.0 && place.observed_rating <= 5.0) {
    parts.push(`<span>★ ${place.observed_rating}</span>`);
  }
  if (place.observed_price && !isZeroOrPlaceholderPrice(place.observed_price)) {
    const activeTrip = store.state.activeContext;
    const sourceCurrency = place.price_currency || store.mapCurrencyOverride || store.pageDetectedCurrency;
    const converted = activeTrip?.currency
      ? convertPriceRange(place.observed_price, activeTrip.currency, undefined, sourceCurrency)
      : null;
    if (converted && converted.sourceCurrency !== converted.targetCurrency && converted.convertedMin > 0) {
      parts.push(`<span>💰 ${escapeHtml(place.observed_price)} <small style="opacity:0.85; font-size:10px; color:var(--accent);">(≈ ${escapeHtml(converted.formattedTarget)})</small></span>`);
    } else {
      parts.push(`<span>💰 ${escapeHtml(place.observed_price)}</span>`);
    }
  }
  if (place.duration_minutes) parts.push(`<span>⏱️ ${place.duration_minutes}m</span>`);
  if (place.tags.length) parts.push(`<span>🏷️ ${escapeHtml(place.tags.join(', '))}</span>`);
  if (place.signals && place.signals.length > 0) {
    parts.push(...place.signals.map((s) => `<span class="badge">✅ ${escapeHtml(s)}</span>`));
  }
  if (place.risks && place.risks.length > 0) {
    parts.push(...place.risks.map((r) => `<span class="risk-flag">⚠️ ${escapeHtml(r)}</span>`));
  }
  const noteText = place.notes || place.why;
  if (noteText) {
    parts.push(`<div class="note-line">📝 ${escapeHtml(noteText)}</div>`);
  }
  details.innerHTML = parts.join('');

  const actions = document.createElement('div');
  actions.className = 'candidate-actions';


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
  actions.append(btnGroup);

  wrapper.append(details, actions);
  return wrapper;
}
