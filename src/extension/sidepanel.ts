import {
  EMPTY_CAPTURE_STATE,
  inferPlaceKind,
  normalizeDelimitedText,
  type OwnlyCaptureState,
  type PlannerPlaceKind,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from '../domain/planner';
import type { CurrentGoogleMapsPlace } from './content';

const STORAGE_KEY = 'ownlyCaptureStateV1';
const LANG_STORAGE_KEY = 'ownlyCaptureLang';

type Lang = 'zh' | 'en';

const I18N = {
  zh: {
    subtitle: 'Google Maps 灵感采集 → Ownly Planner',
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
    tripTagsPlaceholder: '例如：东京2026, 美食清单, Want to go',
    tripCurrencyLabel: '货币',
    tripTransportLabel: '主要交通',
    btnCreateTrip: '创建并设为当前行程',
    currentPlaceLabel: 'Google Maps 当前地点',
    refreshBtn: '🔄 刷新',
    noPlaceTitle: '请在 Google Maps 中打开地点',
    noPlaceUrl: '在地图中点击任意地点即可自动识别',
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
    ratingLabel: 'Google 评分',
    ratingPlaceholder: '4.6',
    priceLabel: '人均价格 / 价格区间',
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
    btnCaptureSubmit: '➕ 加入行程候选池',
    readyStatus: '就绪。',
    readingStatus: '正在读取 Google Maps 地点信息…',
    noPlaceStatus: '未检测到地点，请在当前标签页打开 Google Maps 地点。',
    readyToCapture: '地点已识别，可直接调整或保存。',
    tripRequiredError: '请先创建或选择一个行程。',
    placeRequiredError: '请先在 Google Maps 中打开一个地点。',
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
    subtitle: 'Google Maps research → Ownly Planner',
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
    tripTagsPlaceholder: 'e.g. Tokyo 2026, Foodie, Want to go',
    tripCurrencyLabel: 'Currency',
    tripTransportLabel: 'Primary transport',
    btnCreateTrip: 'Create & activate',
    currentPlaceLabel: 'Current place in Google Maps',
    refreshBtn: '🔄 Refresh',
    noPlaceTitle: 'Open a place in Google Maps',
    noPlaceUrl: 'Click any place on Google Maps to detect automatically',
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
    ratingLabel: 'Google rating',
    ratingPlaceholder: '4.6',
    priceLabel: 'Observed price / range',
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
    btnCaptureSubmit: '➕ Add to research pool',
    readyStatus: 'Ready.',
    readingStatus: 'Reading Google Maps place…',
    noPlaceStatus: 'No place detected. Open a place on Google Maps first.',
    readyToCapture: 'Place detected. Review details and save.',
    tripRequiredError: 'Create or select a trip first.',
    placeRequiredError: 'Open a Google Maps place first.',
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
  lblCurrentPlace: HTMLElement;
  placeTitle: HTMLElement;
  placeUrl: HTMLElement;
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
  lblCurrentPlace: required('lblCurrentPlace'),
  placeTitle: required('placeTitle'),
  placeUrl: required('placeUrl'),
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
  pending: required('pending'),
  status: required('status'),
};

let currentLang: Lang = 'zh';
let state: OwnlyCaptureState = { ...EMPTY_CAPTURE_STATE };
let currentPlace: CurrentGoogleMapsPlace | null = null;

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

  el.lblCurrentPlace.textContent = dict.currentPlaceLabel;
  el.refreshPlace.textContent = dict.refreshBtn;

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
  el.btnCaptureSubmit.textContent = dict.btnCaptureSubmit;

  renderChips();
  renderState();
  renderCurrentPlace();
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
    renderCurrentPlace();
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_GET_CURRENT_PLACE' }) as { place?: CurrentGoogleMapsPlace | null };
    currentPlace = response?.place ?? null;
  } catch {
    currentPlace = null;
  }
  renderCurrentPlace();
  if (currentPlace) {
    autoFillPlaceForm(currentPlace);
  }
}

function autoFillPlaceForm(place: CurrentGoogleMapsPlace) {
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

function renderCurrentPlace() {
  const dict = t();
  el.placeMetaBadges.innerHTML = '';
  if (!currentPlace) {
    el.placeTitle.textContent = dict.noPlaceTitle;
    el.placeUrl.textContent = dict.noPlaceUrl;
    setStatus(dict.noPlaceStatus);
    return;
  }
  el.placeTitle.textContent = currentPlace.title;
  el.placeUrl.textContent = currentPlace.sourceUrl;

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
    source_provider: 'google_maps',
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
    setStatus(existing ? dict.candidateUpdated : dict.candidateAdded, 'success');
  });
});

void (async () => {
  await loadState();
  applyI18n();
  await readCurrentPlace();
})();

