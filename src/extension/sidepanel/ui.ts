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
} from '../../domain/planner';
import type { CurrentResearchPlace } from '../content';
import type { CapturePlace } from '../../domain/capture';
import { el } from '../dom';
import { logger } from '../logger';
import { escapeHtml, isPlausiblePriceText, isZeroOrPlaceholderPrice } from '../utils';
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

export function showImportReport(report: { received: number; created: string[]; updated: string[]; deduped: string[]; failed: { title: string; reason: string }[] }) {
  const dict = t();
  const banner = el.importReportBanner;
  const stats = el.importReportStats;
  const failedBox = el.importReportFailed;

  const createdCount = report.created.length;
  const dedupedCount = report.deduped.length + report.updated.length;
  const failedCount = report.failed.length;

  const hasFailures = failedCount > 0;
  banner.className = 'import-report-banner ' + (hasFailures ? 'warning' : 'success');

  el.importReportIcon.textContent = hasFailures ? '⚠️' : '✅';
  el.importReportTitle.textContent = store.lang === 'zh'
    ? `已导入 ${createdCount} 个地点${dedupedCount > 0 ? `，去重 ${dedupedCount} 个` : ''}`
    : `Imported ${createdCount} places${dedupedCount > 0 ? `, ${dedupedCount} deduped` : ''}`;

  stats.innerHTML = '';
  const addStat = (label: string, count: number, cls: string) => {
    if (count === 0) return;
    const span = document.createElement('span');
    span.className = 'import-report-stat ' + cls;
    span.textContent = `${count} ${label}`;
    stats.appendChild(span);
  };
  addStat(store.lang === 'zh' ? '新增' : 'created', createdCount, 'created');
  addStat(store.lang === 'zh' ? '去重' : 'deduped', dedupedCount, 'deduped');
  if (hasFailures) addStat(store.lang === 'zh' ? '失败' : 'failed', failedCount, 'failed');

  if (hasFailures) {
    failedBox.style.display = 'block';
    failedBox.textContent = report.failed.map((f) => `• ${f.title}: ${f.reason}`).join('\n');
  } else {
    failedBox.style.display = 'none';
    failedBox.textContent = '';
  }

  banner.style.display = 'block';
  el.importReportDismiss.onclick = () => { banner.style.display = 'none'; };
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
  el.btnCreateCollection.textContent = store.lang === 'zh' ? '＋ 新建' : '+ New';
  el.btnExportActiveCollection.textContent = store.lang === 'zh' ? '📤 分享 / 导出' : '📤 Share / Export';
  el.btnDeleteActiveCollection.textContent = store.lang === 'zh' ? '🗑️ 删除' : 'Delete';

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

let debugLevelFilter: string = 'ALL';
let debugSearchQuery: string = '';
let debugAutoScroll = true;

export function updateDebugLogViewer() {
  const viewer = el.debugLogViewer as HTMLElement | null;
  if (!viewer) return;
  // Sync filter UI state
  try {
    debugLevelFilter = (el.debugLogLevelFilter?.value as string) || debugLevelFilter;
    debugSearchQuery = (el.debugLogSearch?.value as string) ?? debugSearchQuery;
    debugAutoScroll = el.debugLogAutoScroll ? el.debugLogAutoScroll.checked : debugAutoScroll;
  } catch {}

  const stats = logger.getStats();
  const statsEl = el.debugLogStats as HTMLElement | null;
  if (statsEl) {
    const byLevel = Object.entries(stats.byLevel).map(([k, v]) => `${k}:${v}`).join(' ');
    statsEl.textContent = `${stats.total} 日志${byLevel ? ` · ${byLevel}` : ''} · ${stats.sessionId.slice(0, 8)}`;
    statsEl.title = `Session: ${stats.sessionId}\nBy scope: ${Object.entries(stats.byScope).map(([k, v]) => `${k}:${v}`).join(' ')}`;
  }

  // Filter logs
  let logs = logger.getLogs();
  if (debugLevelFilter && debugLevelFilter !== 'ALL') {
    logs = logs.filter((e) => e.level === debugLevelFilter);
  }
  if (debugSearchQuery.trim()) {
    const q = debugSearchQuery.trim().toLowerCase();
    logs = logs.filter((e) => `${e.scope} ${e.message} ${JSON.stringify(e.data ?? '')}`.toLowerCase().includes(q));
  }
  // Cap display to last 300 to avoid DOM thrash
  const displayLogs = logs.slice(-300);
  const formatted = displayLogs.map((e) => logger.formatEntryText(e)).join('\n');

  const report = store.state.lastImportReport;
  const importDebug = report
    ? [
        'Capture Import Debug',
        `Received: ${report.received}`,
        `Imported: ${report.created.length + report.updated.length} (${report.created.length} new, ${report.updated.length} updated)`,
        `Failed: ${report.failed.length}`,
        ...(report.failed.length > 0
          ? ['Failed Items:', ...report.failed.flatMap((item) => [`• ${item.title}`, `  Reason: ${item.reason}`]), 'Retry available']
          : []),
      ].join('\n')
    : '';

  const text = [importDebug, formatted].filter(Boolean).join('\n\n') || (store.lang === 'zh' ? '[暂无调试日志 — 试试切换到 Google Maps 地点页后点 刷新]' : '[No debug logs yet]');
  // Highlight errors inline by wrapping? keep plain but add prefix
  viewer.textContent = text;
  if (debugAutoScroll) viewer.scrollTop = viewer.scrollHeight;
}

export function initDebugLogFilters(): void {
  try {
    el.debugLogLevelFilter?.addEventListener('change', () => updateDebugLogViewer());
    el.debugLogSearch?.addEventListener('input', () => {
      // debounce input
      window.setTimeout(() => updateDebugLogViewer(), 80);
    });
    el.debugLogAutoScroll?.addEventListener('change', () => {
      debugAutoScroll = el.debugLogAutoScroll.checked;
    });
  } catch {}
}

function renderChips() {
  const dict = t();
  el.quickChips.innerHTML = '';

  const activeTrip = store.state.activeContext;
  const customTags: string[] = [];

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
  // Active collection places for filter calculation
  const activePlaces = store.getActivePlaces();
  const tripPlaces = activePlaces.map((p) => ({
    id: p.id,
    title: p.title,
    address: p.address,
    area: p.address?.split(/[,，·]/)[0]?.trim(),
    kind: p.inferred_kind || 'other',
    priority: p.user?.priority,
    tags: p.user?.tags || [],
    signals: [] as string[],
    risks: [] as string[],
  }));

  const filters: { id: string; label: string; count: number }[] = [
    { id: 'all', label: dict.allFilter, count: tripPlaces.length },
  ];

  const mustCount = tripPlaces.filter((p) => p.priority === 'must').length;
  if (mustCount > 0) filters.push({ id: 'must', label: dict.mustFilter, count: mustCount });

  const wantCount = tripPlaces.filter((p) => p.priority === 'want').length;
  if (wantCount > 0) filters.push({ id: 'want', label: dict.wantFilter, count: wantCount });

  const allKinds: PlannerPlaceKind[] = ['stay', 'food', 'cafe', 'attraction', 'experience', 'shopping', 'transit', 'service', 'other'];
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
    const cleanName = getPlannerKindLabel(kind, store.lang);
    const label = `${KIND_ICONS[kind] || ''} ${cleanName}`;
    filters.push({ id: kind, label, count });
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
        (p.tags || []).some((t: string) => t.trim().toLowerCase() === tagLower) ||
        (p.signals || []).some((s: string) => s.trim().toLowerCase() === tagLower) ||
        (p.risks || []).some((r: string) => r.trim().toLowerCase() === tagLower),
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
  // Pending count now reflects active collection (Inbox-first)
  const activePlaces = store.getActivePlaces();
  el.pending.textContent = `${activePlaces.length} ${dict.pendingSuffix}`;
  const activeCollection = store.getActiveCollection();
  const inbox = store.getInboxCollection();
  // Show active collection as primary context (independent from Planner)
  if (activeCollection) {
    el.captureContextTitle.textContent = `${activeCollection.title}${activeCollection.currency ? ` [${activeCollection.currency}]` : ''} · ${activePlaces.length} 地点`;
    const planner = store.stateV3.planner_target;
    if (planner) {
      el.captureContextHint.textContent = store.lang === 'zh'
        ? `已关联 Planner：${planner.title}（可一键导入）`
        : `Linked Planner: ${planner.title}`;
    } else {
      el.captureContextHint.textContent = store.lang === 'zh'
        ? `独立合集 · ${store.stateV3.collections.length} 个合集，当前：${activeCollection.title}`
        : `Independent collection · ${store.stateV3.collections.length} collections`;
    }
  } else {
    el.captureContextTitle.textContent = store.lang === 'zh' ? 'Inbox' : 'Inbox';
    el.captureContextHint.textContent = store.lang === 'zh' ? '独立合集 · 可直接收藏，无需 Planner' : 'Independent · capture without Planner';
  }
  el.btnCaptureSubmit.disabled = !activeCollection;
  // Populate collection selector
  try {
    const sel = el.collectionSelector as HTMLSelectElement;
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = '';
      for (const col of store.stateV3.collections) {
        const opt = document.createElement('option');
        opt.value = col.id;
        const count = store.stateV3.places.filter((p) => p.collection_id === col.id).length;
        const isInbox = col.id === inbox?.id;
        opt.textContent = `${isInbox ? '📥 ' : '📁 '}${col.title} (${count})`;
        sel.append(opt);
      }
      sel.value = activeCollection?.id || prev || store.stateV3.collections[0]?.id || '';
    }
    const isInboxActive = activeCollection?.id === inbox?.id;
    if (el.btnDeleteActiveCollection) {
      el.btnDeleteActiveCollection.disabled = Boolean(isInboxActive);
      el.btnDeleteActiveCollection.style.opacity = isInboxActive ? '0.4' : '1';
      el.btnDeleteActiveCollection.style.cursor = isInboxActive ? 'not-allowed' : 'pointer';
      el.btnDeleteActiveCollection.title = isInboxActive
        ? (store.lang === 'zh' ? '默认 Inbox 合集不可删除' : 'Default Inbox cannot be deleted')
        : (store.lang === 'zh' ? `删除合集：${activeCollection?.title}` : `Delete collection: ${activeCollection?.title}`);
    }
    if (el.btnExportActiveCollection) {
      el.btnExportActiveCollection.title = store.lang === 'zh'
        ? `导出当前合集「${activeCollection?.title || 'Inbox'}」为 JSON 文件`
        : `Export active collection "${activeCollection?.title || 'Inbox'}" as JSON`;
    }
  } catch {}
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
  renderCurrentPlace();
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
    const isGeneric = existing.inferred_kind === 'attraction' || existing.inferred_kind === 'other' || !existing.inferred_kind;
    const hasSpecificDetection = freshDetectedKind !== 'attraction' && freshDetectedKind !== 'other';
    const effectiveKind = (isGeneric && hasSpecificDetection) ? freshDetectedKind : (existing.inferred_kind || freshDetectedKind);

    el.kind.value = effectiveKind;
    el.area.value = existing.address?.split(/[,，·]/)[0]?.trim() || (place.address?.split(/[,，·]/)[0]?.trim() || '');
    const rawTags = existing.user?.tags || [];
    el.tags.value = ensurePlaceKindTag(rawTags, effectiveKind, store.lang).join(', ');
    el.duration.value = existing.user?.duration_minutes ? String(existing.user.duration_minutes) : '';
    el.window.value = existing.user?.preferred_window || '';
    el.rating.value = existing.rating ? String(existing.rating) : (place.rating ? String(place.rating) : '');
    const storedPrice = isPlausiblePriceText(existing.price?.raw) ? existing.price?.raw : undefined;
    el.price.value = storedPrice || (isPlausiblePriceText(place.priceLevel) ? place.priceLevel! : '');
    el.why.value = existing.user?.why || place.summary || '';
    el.signals.value = '';
    el.risks.value = '';
    el.notes.value = existing.user?.notes || '';
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
  const baseTags: string[] = [];
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
      el.lblCurrentPlace.textContent = store.lang === 'zh' ? '当前识别：📋 收藏列表' : 'Recognized List';
      el.placeTitle.textContent = store.detectedSavedList.listName;
      el.placeUrl.textContent = dictLocal.browsingListDesc(store.detectedSavedList.places.length);
      el.placeCapturedBanner.style.display = 'none';

      const bCount = document.createElement('span');
      bCount.className = 'badge highlight';
      bCount.textContent = `📋 ${store.detectedSavedList.places.length} 个地点`;
      el.placeMetaBadges.append(bCount);

      if (store.detectedSavedList.truncated) {
        const bTrunc = document.createElement('span');
        bTrunc.className = 'badge';
        bTrunc.textContent = store.lang === 'zh' ? `⚠️ 列表已截断至 500 个` : `⚠️ Truncated to 500`;
        el.placeMetaBadges.append(bTrunc);
      }

      el.smartListContainer.style.display = 'block';
      el.btnSmartSyncAll.textContent = dict.syncAllBtn(store.detectedSavedList.places.length);
      el.btnToggleListPreview.textContent = store.isListPreviewOpen ? dict.collapseList : dict.pickPlaces;
      el.smartListPreviewContainer.style.display = store.isListPreviewOpen ? 'block' : 'none';

      el.batchListContainer.innerHTML = '';
      for (const item of store.detectedSavedList.places) {
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
        subEl.textContent = sub || item.address || '';
        info.append(titleEl, subEl);

        row.append(chk, thumb, info);
        el.batchListContainer.append(row);
      }

      el.captureForm.style.display = 'none';
      setStatus(dictLocal.listSensedStatus(store.detectedSavedList.places.length));
      return;
    } else {
      el.lblCurrentPlace.textContent = dict.currentPlaceLabel;
      el.placeTitle.textContent = dict.noPlaceTitle;
      el.placeUrl.textContent = dict.noPlaceUrl;
      el.smartListContainer.style.display = 'none';
      el.captureForm.style.display = 'block';
      setStatus(dict.noPlaceStatus);
    }
    el.placeCapturedBanner.style.display = 'none';
    el.btnCaptureSubmit.textContent = dict.btnAddCandidate;
    el.btnRemoveCandidate.style.display = 'none';
    return;
  }

  el.lblCurrentPlace.textContent = store.lang === 'zh' ? '当前识别：📍 地点' : 'Recognized Place';
  el.smartListContainer.style.display = 'none';
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

function candidateCardSig(place: { id: string; updated_at?: string; price_currency?: string }, dictKey: string): string {
  return [
    place.updated_at || '',
    place.price_currency || '',
    store.mapCurrencyOverride || '',
    store.pageDetectedCurrency || '',
    store.getActiveCollection()?.currency || '',
    store.editingCandidateId === place.id ? 'edit' : 'view',
    store.bulkMode ? 'bulk' : 'single',
    store.bulkSelected.has(place.id) ? 'sel' : 'unsel',
    dictKey,
  ].join('|');
}

export function getVisibleFilteredPlaces(): CapturePlace[] {
  const all = store.getActivePlaces();
  const kindMatches = (p: CapturePlace, kind: PlannerPlaceKind): boolean => {
    const zhLabel = PLANNER_KIND_LABELS[kind]?.zh.toLowerCase() || '';
    const enLabel = PLANNER_KIND_LABELS[kind]?.en.toLowerCase() || '';
    return (
      p.inferred_kind === kind ||
      (p.user?.tags || []).some((t) => {
        const lower = t.trim().toLowerCase();
        return lower === zhLabel || lower === enLabel;
      })
    );
  };

  let filtered = all;
  if (store.activeFilter === 'must') filtered = filtered.filter((p) => p.user?.priority === 'must');
  if (store.activeFilter === 'want') filtered = filtered.filter((p) => p.user?.priority === 'want');
  if (store.activeFilter === 'stay') filtered = filtered.filter((p) => kindMatches(p, 'stay'));
  if (store.activeFilter === 'food') filtered = filtered.filter((p) => kindMatches(p, 'food'));
  if (store.activeFilter === 'cafe') filtered = filtered.filter((p) => kindMatches(p, 'cafe'));
  if (store.activeFilter === 'attraction') filtered = filtered.filter((p) => kindMatches(p, 'attraction'));
  if (store.activeFilter === 'experience') filtered = filtered.filter((p) => kindMatches(p, 'experience'));
  if (store.activeFilter === 'shopping') filtered = filtered.filter((p) => kindMatches(p, 'shopping'));
  if (store.activeFilter === 'transit') filtered = filtered.filter((p) => kindMatches(p, 'transit'));
  if (store.activeFilter === 'service') filtered = filtered.filter((p) => kindMatches(p, 'service'));
  if (store.activeFilter === 'other') filtered = filtered.filter((p) => kindMatches(p, 'other'));
  if (store.activeFilter.startsWith('tag:')) {
    const filterTag = store.activeFilter.slice(4).trim().toLowerCase();
    filtered = filtered.filter((p) => (p.user?.tags || []).some((tag) => tag.trim().toLowerCase() === filterTag));
  }

  if (store.searchQuery.trim()) {
    const query = store.searchQuery.trim().toLowerCase();
    filtered = filtered.filter((p) =>
      p.title.toLowerCase().includes(query) ||
      p.address?.toLowerCase().includes(query) ||
      (p.user?.tags || []).some((tag) => tag.toLowerCase().includes(query))
    );
  }

  return filtered;
}

export function renderCandidatesList() {
  const dict = t();
  const dictKey = store.lang;

  const totalActivePlaces = store.getActivePlaces();
  const visiblePlaces = getVisibleFilteredPlaces();
  el.candidatesCountBadge.textContent = String(totalActivePlaces.length);

  el.btnEnrichCandidates.style.display = store.bulkMode ? 'none' : 'inline-block';
  if (store.bulkMode) {
    el.btnBulkEnrich.textContent = store.bulkSelected.size > 0
      ? (store.lang === 'zh' ? `⚡ 一键补强 (${store.bulkSelected.size})` : `⚡ Strengthen (${store.bulkSelected.size})`)
      : dict.btnBulkEnrichCandidates;
  }

  // Show active collection places (or Inbox places when Inbox is selected)
  let candidates: V2FacadePlace[] = visiblePlaces.map((cp) => {
    // Map CapturePlace to V2FacadePlace shape for existing card rendering
    return {
      id: cp.id,
      trip_id: cp.collection_id,
      title: cp.title,
      source_provider: cp.source.provider,
      source_url: cp.source.url,
      source_place_id: cp.source.place_id,
      source_category: cp.source.category,
      types: cp.source.types,
      kind: cp.inferred_kind || 'other',
      area: cp.address?.split(/[,，·]/)[0]?.trim(),
      priority: cp.user?.priority,
      tags: cp.user?.tags || [],
      why: cp.user?.why,
      notes: cp.user?.notes,
      observed_rating: cp.rating,
      observed_review_count: cp.review_count,
      observed_price: cp.price?.raw,
      price_currency: cp.price?.currency,
      price_min: cp.price?.min,
      price_max: cp.price?.max,
      price_unit: cp.price?.unit,
      price_level: cp.price?.level,
      open_hours: cp.open_hours,
      address: cp.address,
      coordinates: cp.coordinates,
      phone: cp.phone,
      plus_code: cp.plus_code,
      preferred_window: cp.user?.preferred_window,
      duration_minutes: cp.user?.duration_minutes,
      menu_url: cp.menu_url,
      reservation_url: cp.reservation_url,
      review_topics: cp.review_topics,
      signals: [],
      risks: [],
      reservation_status: 'none' as const,
      state: 'candidate' as const,
      created_at: cp.captured_at,
      updated_at: cp.updated_at,
    };
  });

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

type V2FacadePlace = {
  id: string;
  trip_id: string;
  title: string;
  source_provider: string;
  source_url: string;
  source_place_id?: string;
  source_category?: string;
  types?: string[];
  kind: string;
  area?: string;
  priority?: string;
  tags: string[];
  why?: string;
  notes?: string;
  observed_rating?: number;
  observed_review_count?: number;
  observed_price?: string;
  price_currency?: string;
  price_min?: number;
  price_max?: number;
  price_unit?: string;
  price_level?: number;
  open_hours?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  phone?: string;
  plus_code?: string;
  preferred_window?: string;
  duration_minutes?: number;
  menu_url?: string;
  reservation_url?: string;
  review_topics?: string[];
  signals: string[];
  risks: string[];
  reservation_status: string;
  state: string;
  created_at?: string;
  updated_at?: string;
};

function buildCandidateCard(
  place: V2FacadePlace,
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
    titleEl.textContent = `${KIND_ICONS[place.kind as PlannerPlaceKind] || '📍'} ${place.title}`;

    header.append(grip, titleEl);

    if (store.editingCandidateId === place.id) {
      card.append(header, buildInlineEditor(place, dict));
    } else {
      card.append(header, buildCandidateDetails(place, dict));
    }
  return card;
}


function buildInlineEditor(
  place: V2FacadePlace,
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
  place: V2FacadePlace,
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
  // Inbox: 主显 谷歌原生类别标签（如 🏷️ 国际机场 / 🏷️ 宾馆 / 🏷️ 面馆）、评分、价格（含汇率换算）、用户自定义标签、位置
  const KNOWN_KINDS = new Set([
    'transit', 'stay', 'food', 'cafe', 'attraction', 'shopping', 'experience', 'service', 'other',
    '交通', '住宿', '美食', '咖啡', '景点体验', '景点', '体验', '购物', '服务', '其它', '其他',
  ]);
  const mainParts: string[] = [];
  const rawCategory = place.source_category?.trim() || (place.types && place.types.length > 0 ? place.types[0] : '');
  const categoryLabel = rawCategory && !KNOWN_KINDS.has(rawCategory.toLowerCase()) ? rawCategory : '';
  if (categoryLabel) {
    mainParts.push(`<span class="badge" title="${escapeHtml(categoryLabel)}">🏷️ ${escapeHtml(categoryLabel)}</span>`);
  }
  if (place.observed_rating && place.observed_rating > 1.0 && place.observed_rating <= 5.0) {
    mainParts.push(`<span>★ ${place.observed_rating}</span>`);
  }
  if (place.observed_price && !isZeroOrPlaceholderPrice(place.observed_price)) {
    const activeTrip = store.state.activeContext;
    const sourceCurrency = place.price_currency || store.mapCurrencyOverride || store.pageDetectedCurrency;
    const converted = activeTrip?.currency
      ? convertPriceRange(place.observed_price, activeTrip.currency, undefined, sourceCurrency)
      : null;
    if (converted && converted.sourceCurrency !== converted.targetCurrency && converted.convertedMin > 0) {
      mainParts.push(`<span>💰 ${escapeHtml(place.observed_price)} <small style="opacity:0.85; font-size:10px; color:var(--accent);">(≈ ${escapeHtml(converted.formattedTarget)})</small></span>`);
    } else {
      mainParts.push(`<span>💰 ${escapeHtml(place.observed_price)}</span>`);
    }
  }
  const userTags = place.tags.filter((t) => !KNOWN_KINDS.has(t.trim().toLowerCase()));
  if (userTags.length) {
    const shown = userTags.slice(0, 2).join(', ');
    const more = userTags.length > 2 ? ` +${userTags.length - 2}` : '';
    mainParts.push(`<span>🏷️ ${escapeHtml(shown)}${more}</span>`);
  }
  if (place.area || place.address) {
    mainParts.push(`<span title="${escapeHtml(place.address ?? place.area ?? '')}">📍</span>`);
  }
  details.innerHTML = mainParts.join(' ');

  // Extra details — plus_code / menu / reservation / duration / review_topics / open_hours emoji / phone emoji / signals / risks / notes
  const extra = document.createElement('div');
  extra.className = 'candidate-extra';
  extra.style.display = 'block';
  const extraParts: string[] = [];
  if (place.plus_code) extraParts.push(`<span class="badge" title="Plus Code: ${escapeHtml(place.plus_code)}">➕ ${escapeHtml(place.plus_code)}</span>`);
  const safeMenuUrl = sanitizeSafeHref(place.menu_url);
  if (safeMenuUrl) extraParts.push(`<a href="${escapeHtml(safeMenuUrl)}" target="_blank" rel="noreferrer" class="badge">${escapeHtml(dict.menuBadge)}</a>`);
  const safeResUrl = sanitizeSafeHref(place.reservation_url);
  if (safeResUrl) extraParts.push(`<a href="${escapeHtml(safeResUrl)}" target="_blank" rel="noreferrer" class="badge highlight">${escapeHtml(dict.reserveBadge)}</a>`);
  if (place.review_topics && place.review_topics.length > 0) {
    extraParts.push(`<span class="badge">💬 ${escapeHtml(place.review_topics.slice(0, 3).join(' · '))}</span>`);
  }
  if (place.open_hours) {
    extraParts.push(`<span class="badge" title="${escapeHtml(place.open_hours)}">🕒</span>`);
  }
  if (place.phone) {
    extraParts.push(`<a href="tel:${escapeHtml(place.phone)}" class="badge" title="${escapeHtml(place.phone)}">📞</a>`);
  }
  if (place.duration_minutes) extraParts.push(`<span>⏱️ ${place.duration_minutes}m</span>`);
  if (place.tags.length > 2) extraParts.push(`<span>🏷️ ${escapeHtml(place.tags.join(', '))}</span>`);
  if (place.signals && place.signals.length > 0) {
    extraParts.push(...place.signals.map((s) => `<span class="badge">✅ ${escapeHtml(s)}</span>`));
  }
  if (place.risks && place.risks.length > 0) {
    extraParts.push(...place.risks.map((r) => `<span class="risk-flag">⚠️ ${escapeHtml(r)}</span>`));
  }
  const noteText = place.notes || place.why;
  if (noteText) {
    extraParts.push(`<div class="note-line">📝 ${escapeHtml(noteText)}</div>`);
  }
  if (extraParts.length) {
    extra.innerHTML = extraParts.join(' ');
  }

  const actions = document.createElement('div');
  actions.className = 'candidate-actions';

  const btnGroup = document.createElement('div');
  btnGroup.className = 'card-btns';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'card-btn';
  editBtn.dataset.action = 'edit';
  editBtn.dataset.placeId = place.id;
  editBtn.textContent = '✏️';
  editBtn.title = dict.editAction;

  const mustBtn = document.createElement('button');
  mustBtn.type = 'button';
  mustBtn.className = 'card-btn';
  mustBtn.dataset.action = 'toggle-must';
  mustBtn.dataset.placeId = place.id;
  const isMust = place.priority === 'must';
  mustBtn.textContent = isMust ? '⭐' : '☆';
  mustBtn.title = isMust
    ? (store.lang === 'zh' ? '已标记为必去（点击取消）' : 'Marked as Must (click to toggle)')
    : (store.lang === 'zh' ? '设为必去' : 'Mark as Must');

  const addToTripBtn = document.createElement('button');
  addToTripBtn.type = 'button';
  addToTripBtn.className = 'card-btn';
  addToTripBtn.dataset.action = 'add-to-trip';
  addToTripBtn.dataset.placeId = place.id;
  addToTripBtn.textContent = '➕';
  addToTripBtn.title = store.lang === 'zh' ? '加入行程' : 'Add to Trip';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'card-btn del';
  delBtn.dataset.action = 'delete';
  delBtn.dataset.placeId = place.id;
  delBtn.textContent = '🗑️';
  delBtn.title = dict.deleteAction;

  btnGroup.append(editBtn, mustBtn, addToTripBtn, delBtn);
  actions.append(btnGroup);

  if (extraParts.length) wrapper.append(details, extra, actions);
  else wrapper.append(details, actions);
  return wrapper;
}
