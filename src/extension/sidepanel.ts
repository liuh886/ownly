import {
  EMPTY_CAPTURE_STATE,
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

type Lang = 'zh' | 'en';

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

const I18N = {
  zh: {
    subtitle: '多源灵感采集 → Ownly Planner',
    pendingSuffix: '待同步',
    activeTrip: '当前行程',
    noTripOption: '请在下方新建行程',
    createTripSummary: '➕ 新建行程',
    tripTitleLabel: '行程名称',
    tripTitlePlaceholder: '例如：东京赏樱 2026',
    tripStartLabel: '开始日期',
    tripEndLabel: '结束日期',
    tripDestinationsLabel: '目的地',
    tripDestinationsPlaceholder: '例如：东京, 浅草, 涩谷',
    tripTagsLabel: '行程标签 / 收藏夹名',
    tripTagsPlaceholder: '例如：TH26, 东京2026, Want to go',
    tripCurrencyLabel: '货币',
    tripTransportLabel: '主要交通',
    btnCreateTrip: '创建并设为当前行程',
    sumBulkImport: '📥 批量导入 / 粘贴地点或列表链接',
    lblBulkText: '批量粘贴链接或地点名 (每行一个)',
    bulkPlaceholder: '支持批量粘贴：\nhttps://maps.google.com/...\n浅草寺\n东京晴空塔',
    btnParseBulkImport: '📥 解析并快速加入候选池',
    bulkImportSuccess: (count: number) => `已成功解析并导入 ${count} 个地点至候选池！`,
    bulkImportEmpty: '请先输入或粘贴地点链接或名称。',
    savedListMatchBadge: '🌟 自动匹配收藏夹',
    savedListMatchDesc: (list: string, trip: string) => `检测到 Google 收藏夹「${list}」与当前行程「${trip}」的标签匹配`,
    btnSyncSavedListAll: (list: string, count: number) => `⚡ 一键同步「${list}」全部 ${count} 个地点至候选池`,
    savedListSynced: (count: number, list: string) => `已成功将「${list}」全部 ${count} 个地点一键同步至候选池！`,
    batchSummary: (count: number) => `📋 批量感知：当前地图列表 (${count} 个地点)`,
    btnSelectAll: '全选 / 取消',
    btnBatchAdd: '➕ 批量加入候选池',
    batchAddedSuccess: (count: number) => `已成功批量添加 ${count} 个地点至候选池！`,
    currentPlaceLabel: '当前识别地点',
    refreshBtn: '🔄 刷新',
    noPlaceTitle: '请在地图或页面中打开地点',
    noPlaceUrl: '在 Google Maps、Tabelog、小红书浏览时自动识别',
    capturedBanner: '✓ 该地点已在当前行程候选池中',
    kindLabel: '地点类别',
    priorityLabel: '优先级',
    areaLabel: '区域 / 街区',
    areaPlaceholder: '例如：浅草 / 涩谷 / 新宿',
    tagsLabel: '地点标签',
    tagsPlaceholder: '例如：夜景, 必吃, 需预约',
    durationLabel: '预计停留 (分钟)',
    durationPlaceholder: '90',
    windowLabel: '偏好时段',
    windowPlaceholder: '例如：上午 / 傍晚日落 / 晚上',
    ratingLabel: '评分',
    ratingPlaceholder: '4.6',
    priceLabel: '人均价格 / 预算',
    pricePlaceholder: '例如：¥2,000 / 人',
    quickChipsLabel: '快捷标签',
    whyLabel: '选择理由 (Why)',
    whyPlaceholder: '为什么选这个地点？有哪些吸引你的亮点？',
    signalsLabel: '正向信号',
    signalsPlaceholder: '例如：绝美日落, 地道当地人多, 早餐很赞',
    risksLabel: '风险提醒 / 避坑',
    risksPlaceholder: '例如：周末排队极长, 需提前2周预约, 雨天不宜',
    notesLabel: '个人备忘笔记',
    notesPlaceholder: '你自己的游玩心得或计划备忘，而非直接复制评论',
    btnAddCandidate: '➕ 加入行程候选池',
    btnUpdateCandidate: '✓ 更新候选心得',
    btnRemoveCandidate: '🗑️ 移出',
    candidateRemoved: '已从候选池中移出。',
    drawerTitle: '🗂️ 当前行程候选池',
    searchPlaceholder: '🔍 搜索候选地点、区域或标签...',
    allFilter: '全部',
    mustFilter: '必去 (Must)',
    wantFilter: '想去 (Want)',
    foodFilter: '美食',
    attractionFilter: '景点',
    stayFilter: '住宿',
    unassignedDay: '候选池',
    dayOption: (idx: number, date: string) => `第 ${idx} 天 (${date})`,
    editAction: '编辑',
    deleteAction: '删除',
    emptyCandidates: '当前行程暂无候选地点，浏览地图或导入收藏夹即可快速添加。',
    readyStatus: '就绪。',
    readingStatus: '正在读取页面地点与收藏夹…',
    noPlaceStatus: '未检测到地点，请在标签页中打开地点。',
    readyToCapture: '地点已识别，可直接调整或保存。',
    tripRequiredError: '请先创建或选择一个行程。',
    placeRequiredError: '请先打开一个地点页面。',
    candidateUpdated: '已更新该地点的研究心得。',
    candidateAdded: '已成功加入候选池！',
    tripCreated: (title: string) => `已激活行程：${title}`,
    tripValidateError: '行程名称与起止日期为必填项，且结束日期不能早于开始日期。',
    chips: ['必去', '必吃', '需排队', '建议预约', '绝美夜景', '日落机位', '避开雨天', '交通便利', '只收现金', '安静惬意'],
    kinds: {
      attraction: '观光景点 (Attraction)',
      food: '餐厅美食 (Food)',
      cafe: '咖啡甜品 (Cafe)',
      stay: '酒店住宿 (Stay)',
      shopping: '购物商场 (Shopping)',
      transit: '交通中转 (Transit)',
      experience: '体验活动 (Experience)',
      other: '其它 (Other)',
    },
    priorities: {
      must: '必去 (Must)',
      want: '想去 (Want)',
      optional: '可选 (Optional)',
    },
    transport: {
      transit: '公共交通 (Transit)',
      walking: '步行 (Walking)',
      driving: '自驾 (Driving)',
      bicycling: '骑行 (Bicycling)',
    },
  },
  en: {
    subtitle: 'Multi-source research → Ownly Planner',
    pendingSuffix: 'pending',
    activeTrip: 'Active trip',
    noTripOption: 'Create a trip below',
    createTripSummary: '➕ Create trip',
    tripTitleLabel: 'Trip title',
    tripTitlePlaceholder: 'e.g. Tokyo Sakura 2026',
    tripStartLabel: 'Start date',
    tripEndLabel: 'End date',
    tripDestinationsLabel: 'Destinations',
    tripDestinationsPlaceholder: 'e.g. Tokyo, Asakusa, Shibuya',
    tripTagsLabel: 'Trip tags / Google List name',
    tripTagsPlaceholder: 'e.g. TH26, Foodie, Want to go',
    tripCurrencyLabel: 'Currency',
    tripTransportLabel: 'Primary transport',
    btnCreateTrip: 'Create & activate',
    sumBulkImport: '📥 Bulk Import / Paste Places & Links',
    lblBulkText: 'Paste links or place names (one per line)',
    bulkPlaceholder: 'Paste links or names:\nhttps://maps.google.com/...\nAsakusa Temple\nTokyo Tower',
    btnParseBulkImport: '📥 Parse & Add to Pool',
    bulkImportSuccess: (count: number) => `Successfully parsed and imported ${count} places!`,
    bulkImportEmpty: 'Please enter or paste place links or names first.',
    savedListMatchBadge: '🌟 Auto-Matched Saved List',
    savedListMatchDesc: (list: string, trip: string) => `Detected Google List "${list}" matching active trip "${trip}" tags`,
    btnSyncSavedListAll: (list: string, count: number) => `⚡ Sync all ${count} places from "${list}" to Research Pool`,
    savedListSynced: (count: number, list: string) => `Successfully synced all ${count} places from "${list}" to Research Pool!`,
    batchSummary: (count: number) => `📋 Batch Detected: Map List (${count} places)`,
    btnSelectAll: 'Select All / None',
    btnBatchAdd: '➕ Add Selected to Pool',
    batchAddedSuccess: (count: number) => `Successfully batch added ${count} places to research pool!`,
    currentPlaceLabel: 'Detected place',
    refreshBtn: '🔄 Refresh',
    noPlaceTitle: 'Open a place page',
    noPlaceUrl: 'Auto-detects while browsing Google Maps, Tabelog, Xiaohongshu',
    capturedBanner: '✓ This place is already in your research pool',
    kindLabel: 'Place kind',
    priorityLabel: 'Priority',
    areaLabel: 'Area / District',
    areaPlaceholder: 'e.g. Asakusa / Shibuya / Nimman',
    tagsLabel: 'Place tags',
    tagsPlaceholder: 'e.g. Night view, Must try, Booking needed',
    durationLabel: 'Duration (min)',
    durationPlaceholder: '90',
    windowLabel: 'Preferred window',
    windowPlaceholder: 'e.g. early morning / sunset / evening',
    ratingLabel: 'Rating',
    ratingPlaceholder: '4.6',
    priceLabel: 'Observed price / budget',
    pricePlaceholder: 'e.g. ~$25 / person',
    quickChipsLabel: 'Quick tags',
    whyLabel: 'Why it matters (Why)',
    whyPlaceholder: 'Why did this place survive your research? Key highlights?',
    signalsLabel: 'Research signals',
    signalsPlaceholder: 'e.g. sunset view, authentic local crowd, great breakfast',
    risksLabel: 'Risks / caveats',
    risksPlaceholder: 'e.g. long weekend queue, 2-week advance booking, rain sensitive',
    notesLabel: 'Personal note',
    notesPlaceholder: 'Your own judgment, not a copy of Google reviews',
    btnAddCandidate: '➕ Add to research pool',
    btnUpdateCandidate: '✓ Update research note',
    btnRemoveCandidate: '🗑️ Remove',
    candidateRemoved: 'Removed from research pool.',
    drawerTitle: '🗂️ Trip Candidates Pool',
    searchPlaceholder: '🔍 Search places, areas, tags...',
    allFilter: 'All',
    mustFilter: 'Must',
    wantFilter: 'Want',
    foodFilter: 'Food',
    attractionFilter: 'Attraction',
    stayFilter: 'Stay',
    unassignedDay: 'Candidate Pool',
    dayOption: (idx: number, date: string) => `Day ${idx} (${date})`,
    editAction: 'Edit',
    deleteAction: 'Delete',
    emptyCandidates: 'No candidates yet for this trip. Browse maps or import list to add places.',
    readyStatus: 'Ready.',
    readingStatus: 'Reading place details and saved lists…',
    noPlaceStatus: 'No place detected. Open a place on map or webpage.',
    readyToCapture: 'Place detected. Review details and save.',
    tripRequiredError: 'Create or select a trip first.',
    placeRequiredError: 'Open a place page first.',
    candidateUpdated: 'Research candidate updated.',
    candidateAdded: 'Added to research pool!',
    tripCreated: (title: string) => `Active trip: ${title}`,
    tripValidateError: 'Trip title and valid date range are required.',
    chips: ['Must visit', 'Foodie', 'Queue alert', 'Booking needed', 'Night view', 'Sunset spot', 'Avoid rain', 'Near transit', 'Cash only', 'Quiet vibe'],
    kinds: {
      attraction: 'Attraction',
      food: 'Food / Dining',
      cafe: 'Cafe / Dessert',
      stay: 'Stay / Hotel',
      shopping: 'Shopping',
      transit: 'Transit / Station',
      experience: 'Experience',
      other: 'Other',
    },
    priorities: {
      must: 'Must',
      want: 'Want',
      optional: 'Optional',
    },
    transport: {
      transit: 'Transit',
      walking: 'Walking',
      driving: 'Driving',
      bicycling: 'Bicycling',
    },
  },
};

type ElementMap = {
  langToggle: HTMLButtonElement;
  topbarSubtitle: HTMLElement;
  lblActiveTrip: HTMLElement;
  tripSelect: HTMLSelectElement;
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
  tripSelect: required('tripSelect'),
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

function t() {
  return I18N[currentLang];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  for (const chip of dict.chips) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = `+ ${chip}`;
    btn.addEventListener('click', () => {
      const isRisk = /queue|rain|advance|cash|排队|雨|预约|现金/i.test(chip);
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
  const filters = [
    { id: 'all', label: dict.allFilter },
    { id: 'must', label: dict.mustFilter },
    { id: 'want', label: dict.wantFilter },
    { id: 'food', label: dict.foodFilter },
    { id: 'attraction', label: dict.attractionFilter },
    { id: 'stay', label: dict.stayFilter },
  ];
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

function renderState() {
  const dict = t();
  el.tripSelect.innerHTML = '';
  if (state.trips.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = dict.noTripOption;
    el.tripSelect.append(option);
  } else {
    for (const trip of state.trips) {
      const option = document.createElement('option');
      option.value = trip.id;
      option.textContent = trip.tags?.length ? `${trip.title} [${trip.tags.join(', ')}]` : trip.title;
      el.tripSelect.append(option);
    }
    const active = state.trips.some((trip) => trip.id === state.activeTripId)
      ? state.activeTripId
      : state.trips[0].id;
    state.activeTripId = active;
    el.tripSelect.value = active ?? '';
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
    renderCurrentPlace();
    renderSavedListMatch();
    renderBatchList();
    return;
  }
  try {
    const placeResp = await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE' }) as { place?: CurrentResearchPlace | null; savedList?: DetectedSavedList | null };
    currentPlace = placeResp?.place ?? null;
    detectedSavedList = placeResp?.savedList ?? null;
  } catch {
    currentPlace = null;
    detectedSavedList = null;
  }
  try {
    const listResp = await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_VISIBLE_LIST_PLACES' }) as { listPlaces?: CurrentResearchPlace[] };
    detectedListPlaces = Array.isArray(listResp?.listPlaces) ? listResp.listPlaces : [];
  } catch {
    detectedListPlaces = [];
  }

  renderCurrentPlace();
  renderSavedListMatch();
  renderBatchList();
  if (currentPlace) {
    autoFillPlaceForm(currentPlace);
  }
}

function renderSavedListMatch() {
  const dict = t();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  if (!detectedSavedList || detectedSavedList.places.length === 0 || !activeTrip) {
    el.savedListMatchBanner.style.display = 'none';
    return;
  }

  const listNameNorm = detectedSavedList.listName.trim().toLowerCase();
  const tripTags = (activeTrip.tags || []).map((t) => t.trim().toLowerCase());
  const tripTitleNorm = activeTrip.title.trim().toLowerCase();
  const savedListNameNorm = (activeTrip.saved_list_name || '').trim().toLowerCase();

  // Match condition: list name is in tags (e.g. 'th26'), or tag is in list name, or title matches
  const isMatched =
    tripTags.includes(listNameNorm) ||
    tripTags.some((tag) => tag && listNameNorm.includes(tag)) ||
    listNameNorm === savedListNameNorm ||
    listNameNorm.includes(tripTitleNorm) ||
    tripTitleNorm.includes(listNameNorm);

  el.savedListMatchBanner.style.display = 'block';
  el.savedListNameTitle.textContent = detectedSavedList.listName;
  el.savedListCountBadge.textContent = `${detectedSavedList.places.length} 个地点`;
  el.savedListMatchDesc.textContent = isMatched
    ? dict.savedListMatchDesc(detectedSavedList.listName, activeTrip.title)
    : `Google 收藏列表「${detectedSavedList.listName}」包含 ${detectedSavedList.places.length} 个地点`;
  el.btnSyncSavedListAll.textContent = dict.btnSyncSavedListAll(detectedSavedList.listName, detectedSavedList.places.length);
}

function renderBatchList() {
  const dict = t();
  // If saved list match banner is already showing the list, hide the secondary batch section
  if (detectedSavedList && detectedSavedList.places.length > 0) {
    el.batchSection.style.display = 'none';
    return;
  }
  if (detectedListPlaces.length <= 1) {
    el.batchSection.style.display = 'none';
    return;
  }
  el.batchSection.style.display = 'block';
  el.sumBatchList.textContent = dict.batchSummary(detectedListPlaces.length);
  el.batchListContainer.innerHTML = '';

  for (const item of detectedListPlaces) {
    const row = document.createElement('div');
    row.className = 'batch-item';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = true;
    chk.dataset.url = item.sourceUrl;

    const info = document.createElement('div');
    info.className = 'batch-item-info';
    info.innerHTML = `<div class="batch-item-title">${item.title}</div><div class="batch-item-sub">${item.category || ''} ${item.rating ? `★ ${item.rating}` : ''}</div>`;

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
  }
  if (place.category) {
    el.kind.value = inferPlaceKind(place.category);
  }
  if (place.address && !el.area.value) {
    const parts = place.address.split(/[,，·]/).map((p) => p.trim()).filter(Boolean);
    el.area.value = parts[0] || place.address;
  }
  if (place.summary && !el.why.value) {
    el.why.value = place.summary;
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
    el.placeTitle.textContent = dict.noPlaceTitle;
    el.placeUrl.textContent = dict.noPlaceUrl;
    el.placeCapturedBanner.style.display = 'none';
    el.btnCaptureSubmit.textContent = dict.btnAddCandidate;
    el.btnRemoveCandidate.style.display = 'none';
    setStatus(dict.noPlaceStatus);
    return;
  }
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
    if (place.duration_minutes) details.innerHTML += `<span>⏱️ ${place.duration_minutes}m</span>`;
    if (place.tags.length) details.innerHTML += `<span>🏷️ ${place.tags.join(', ')}</span>`;

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
    currency: el.tripCurrency.value.trim() || undefined,
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

// ⚡ 1-Click Sync Matched Saved List (e.g. TH26)
el.btnSyncSavedListAll.addEventListener('click', () => {
  const dict = t();
  if (!state.activeTripId || !detectedSavedList || detectedSavedList.places.length === 0) return;

  const now = new Date().toISOString();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
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
      trip_id: state.activeTripId,
      title: item.title,
      source_provider: item.sourceProvider || 'google_maps',
      source_url: item.sourceUrl,
      kind: inferPlaceKind(item.category),
      area: item.address?.split(/[,，·]/)[0]?.trim() || undefined,
      priority: 'want',
      tags: combinedTags,
      why: item.summary,
      signals: item.category ? [item.category] : [],
      risks: [],
      observed_rating: item.rating,
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

  const now = new Date().toISOString();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  const updatedKnown = { ...state.knownPlaceIds };
  const newPlaces: PlannerTripPlace[] = [];

  for (const line of lines) {
    const isUrl = /^https?:\/\//i.test(line);
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
    setStatus(dict.bulkImportSuccess(newPlaces.length), 'success');
  });
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
  const toAdd = detectedListPlaces.filter((item) => selectedUrls.has(item.sourceUrl));
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
      signals: [],
      risks: [],
      observed_rating: item.rating,
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

el.tripForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const trip = createTripFromForm();
  if (!trip) return;
  state = { ...state, trips: [...state.trips, trip], activeTripId: trip.id };
  void saveState().then(() => {
    el.tripForm.reset();
    el.tripCurrency.value = 'CNY';
    el.tripTransport.value = 'transit';
    setStatus(t().tripCreated(trip.title), 'success');
  });
});

el.tripSelect.addEventListener('change', () => {
  state = { ...state, activeTripId: el.tripSelect.value || null };
  void saveState();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);
  if (activeTrip?.tags?.length && !el.tags.value) {
    el.tags.value = activeTrip.tags.join(', ');
  }
});

el.refreshPlace.addEventListener('click', () => { void readCurrentPlace(); });

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



