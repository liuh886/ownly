import {
  buildGoogleMapsRouteUrl,
  extractPlaceCoordinates,
  getPlannerKindLabel,
  listTripDates,
  PLANNER_KIND_ICONS,
  sortPlannerScheduledPlaces,
  type PlannerScheduledPlace,
  type PlannerTrip,
  type PlannerTripPlace,
  type TripExpenseItem,
} from './planner';
import { materializePlannerScheduledPlaces, type PlannerTripVisit } from './planner-visits';

/**
 * Single-file itinerary export: one self-contained `.html` document that opens
 * offline on any phone browser. It is a read-only reading surface, not an
 * importable artifact — the desktop data folder stays the single source of
 * truth. Design contract (v1):
 *
 * - zero external resources: inline CSS only, no <script>, no fonts/CDN/images;
 * - progressive enhancement: every day renders inside <details open>, readable
 *   without JavaScript anywhere;
 * - the map is a set of deep links (per stop + per day route), never embedded;
 * - the same privacy line as the share bundle: members / calendar_feed /
 *   duplicate-pair bookkeeping / review backlink are stripped; expenses are
 *   opt-in and explicit.
 */

export interface TripItineraryHtmlInput {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  expenses: TripExpenseItem[];
  language?: 'zh' | 'en';
  includeExpenses?: boolean;
  generatedAt?: string;
}

interface ItineraryDay {
  date: string;
  stops: PlannerScheduledPlace[];
  routeUrl: string;
}

const COPY = {
  zh: {
    lang: 'zh-Hans',
    docTitleSuffix: '行程单',
    kicker: '只读行程快照 · Read-only snapshot',
    generatedAt: '生成于',
    readonly: '仅供阅读，不会改动原始行程。',
    noDestination: '未设定目的地',
    day: '第',
    dayUnit: '天',
    stops: '站',
    noStops: '当天无安排。',
    route: 'Google Maps 路线导航',
    daysNav: '跳转到某天',
    source: '来源',
    map: '地图',
    call: '电话',
    why: '推荐理由',
    notes: '备注',
    pool: '待选灵感池',
    poolEmpty: '无未排期地点。',
    expenses: '费用账本',
    expensesExcluded: '该快照未包含费用。',
    expenseEntries: '笔',
    printHint: '可打印为纸质行程单',
  },
  en: {
    lang: 'en',
    docTitleSuffix: 'Itinerary',
    kicker: 'Read-only snapshot',
    generatedAt: 'Generated',
    readonly: 'For reading only — the original trip is never modified.',
    noDestination: 'No destination set',
    day: 'Day',
    dayUnit: '',
    stops: 'stops',
    noStops: 'Nothing scheduled this day.',
    route: 'Google Maps directions',
    daysNav: 'Jump to a day',
    source: 'Source',
    map: 'Map',
    call: 'Call',
    why: 'Why',
    notes: 'Notes',
    pool: 'Candidate pool',
    poolEmpty: 'No unscheduled places.',
    expenses: 'Expenses',
    expensesExcluded: 'Expenses were not included in this snapshot.',
    expenseEntries: 'entries',
    printHint: 'Printable itinerary',
  },
} as const;

type Copy = Record<keyof (typeof COPY)['zh'], string>;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Privacy line shared with the share bundle: drop non-portable trip fields. */
function sanitizeTrip(trip: PlannerTrip): PlannerTrip {
  const next = cloneJson(trip);
  delete next.members;
  delete next.calendar_feed;
  delete next.ignored_duplicate_pair_ids;
  delete next.review_id;
  return next;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function telHref(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 3 ? `tel:${cleaned}` : null;
}

function placeMapUrl(place: PlannerTripPlace | PlannerScheduledPlace): string | null {
  const coordinates = extractPlaceCoordinates(place);
  if (coordinates) {
    return `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`;
  }
  const query = place.address || place.title;
  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  return safeHref(place.source_url);
}

function buildDays(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
): ItineraryDay[] {
  const scheduled = materializePlannerScheduledPlaces(places, visits).filter(
    (place) => place.trip_id === trip.id,
  );
  const byDate = new Map<string, PlannerScheduledPlace[]>();
  for (const place of scheduled) {
    const list = byDate.get(place.scheduled_date) ?? [];
    list.push(place);
    byDate.set(place.scheduled_date, list);
  }
  return listTripDates(trip.start_date, trip.end_date).map((date) => {
    const stops = sortPlannerScheduledPlaces(byDate.get(date) ?? []);
    return {
      date,
      stops,
      routeUrl: stops.length > 1 ? buildGoogleMapsRouteUrl(stops, trip.transport_mode) : '',
    };
  });
}

function buildCandidatePool(
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  tripId: string,
): PlannerTripPlace[] {
  const visitedIds = new Set(
    visits.filter((visit) => visit.trip_id === tripId).map((visit) => visit.place_id),
  );
  return places.filter(
    (place) =>
      place.trip_id === tripId && place.state !== 'dropped' && !visitedIds.has(place.id),
  );
}

function renderLinks(
  place: PlannerTripPlace | PlannerScheduledPlace,
  copy: Copy,
): string {
  const links: string[] = [];
  const source = safeHref(place.source_url);
  if (source) {
    links.push(
      `<a href="${escapeHtml(source)}" rel="noopener noreferrer">🔗 ${copy.source}</a>`,
    );
  }
  const map = placeMapUrl(place);
  if (map) {
    links.push(`<a href="${escapeHtml(map)}" rel="noopener noreferrer">📍 ${copy.map}</a>`);
  }
  const tel = telHref(place.phone);
  if (tel) {
    links.push(`<a href="${escapeHtml(tel)}">📞 ${copy.call}</a>`);
  }
  return links.length > 0 ? `<div class="links">${links.join('')}</div>` : '';
}

function renderStop(
  place: PlannerScheduledPlace,
  index: number,
  language: 'zh' | 'en',
): string {
  const copy = COPY[language];
  const icon = PLANNER_KIND_ICONS[place.kind] ?? '📍';
  const kindLabel = getPlannerKindLabel(place.kind, language);
  const meta = [kindLabel, place.area].filter(Boolean).join(' · ');
  const why = place.why
    ? `<div class="why">💡 ${escapeHtml(place.why)}</div>`
    : '';
  const notes = place.notes
    ? `<div class="notes">📝 ${escapeHtml(place.notes)}</div>`
    : '';
  const time = place.scheduled_start
    ? `<span class="time">${escapeHtml(place.scheduled_start)}</span>`
    : '';
  return `<li>
  <span class="idx">${index + 1}</span>
  <div class="stop-main">
    <div class="title">${time}<span class="kind-icon">${icon}</span>${escapeHtml(place.title)}</div>
    ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
    ${why}
    ${notes}
    ${renderLinks(place, copy)}
  </div>
</li>`;
}

function renderDays(days: ItineraryDay[], language: 'zh' | 'en'): string {
  const copy = COPY[language];
  if (days.length === 0) return '';
  return days
    .map((day, index) => {
      const dayLabel =
        language === 'zh'
          ? `${copy.day}${index + 1}${copy.dayUnit}`
          : `${copy.day} ${index + 1}`;
      const route = day.routeUrl
        ? `<a class="route" href="${escapeHtml(day.routeUrl)}" rel="noopener noreferrer">🧭 ${copy.route}</a>`
        : '';
      const stops =
        day.stops.length > 0
          ? `<ol class="stops">${day.stops
              .map((stop, stopIndex) => renderStop(stop, stopIndex, language))
              .join('')}</ol>`
          : `<p class="empty">${copy.noStops}</p>`;
      return `<section class="day" id="day-${index + 1}">
  <details open>
    <summary>
      <span class="dnum">${dayLabel}</span>
      <span class="ddate">${escapeHtml(day.date)}</span>
      <span class="dcount">${day.stops.length} ${copy.stops}</span>
    </summary>
    <div class="day-body">
      ${route}
      ${stops}
    </div>
  </details>
</section>`;
    })
    .join('');
}

function renderJumpNav(days: ItineraryDay[], language: 'zh' | 'en'): string {
  if (days.length < 2) return '';
  const copy = COPY[language];
  const links = days
    .map((_, index) => `<a href="#day-${index + 1}">D${index + 1}</a>`)
    .join('');
  return `<nav class="jump" aria-label="${copy.daysNav}">${links}</nav>`;
}

function renderPool(pool: PlannerTripPlace[], language: 'zh' | 'en'): string {
  const copy = COPY[language];
  if (pool.length === 0) return '';
  const items = pool
    .map((place) => {
      const icon = PLANNER_KIND_ICONS[place.kind] ?? '📍';
      const meta = [getPlannerKindLabel(place.kind, language), place.area]
        .filter(Boolean)
        .join(' · ');
      return `<li>
  <div class="title"><span class="kind-icon">${icon}</span>${escapeHtml(place.title)}</div>
  ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
  ${renderLinks(place, copy)}
</li>`;
    })
    .join('');
  return `<section class="panel">
  <h2>💡 ${copy.pool} (${pool.length})</h2>
  <ul class="pool">${items}</ul>
</section>`;
}

function renderExpenses(
  expenses: TripExpenseItem[],
  language: 'zh' | 'en',
  includeExpenses: boolean,
): string {
  const copy = COPY[language];
  if (!includeExpenses) {
    return `<section class="panel">
  <h2>💰 ${copy.expenses}</h2>
  <p class="empty">${copy.expensesExcluded}</p>
</section>`;
  }
  if (expenses.length === 0) return '';
  const totals = new Map<string, number>();
  for (const item of expenses) {
    const currency = item.currency || '';
    totals.set(currency, (totals.get(currency) ?? 0) + item.amount);
  }
  const totalLine = [...totals.entries()]
    .map(([currency, total]) => `${escapeHtml(currency)} ${total.toLocaleString('en-US')}`)
    .join(' · ');
  const rows = expenses
    .map((item) => {
      const date = item.date ? `<span class="ex-date">${escapeHtml(item.date)}</span>` : '';
      return `<li>${date}<span class="ex-title">${escapeHtml(item.title)}</span><span class="ex-amount">${escapeHtml(item.currency)} ${item.amount.toLocaleString('en-US')}</span></li>`;
    })
    .join('');
  return `<section class="panel">
  <h2>💰 ${copy.expenses} (${expenses.length} ${copy.expenseEntries})</h2>
  <div class="ex-total">${totalLine}</div>
  <ul class="expenses">${rows}</ul>
</section>`;
}

function styles(): string {
  return `:root{color-scheme:light dark;--bg:#f5f5f4;--card:#fff;--ink:#1c1917;--muted:#78716c;--line:#e7e5e4;--accent:#047857;--accent-soft:#ecfdf5;--theme:#f5f5f4}
@media(prefers-color-scheme:dark){:root{--bg:#1c1917;--card:#292524;--ink:#f5f5f4;--muted:#a8a29e;--line:#44403c;--accent:#34d399;--accent-soft:#064e3b33;--theme:#1c1917}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
html,body{max-width:100%;overflow-x:hidden}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:14px 12px calc(40px + env(safe-area-inset-bottom))}
a{color:var(--accent)}
.trip{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
.kicker{font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.trip h1{margin:4px 0 0;font-size:20px;line-height:1.25}
.trip .dates{margin-top:4px;font-size:12px;color:var(--muted)}
.trip .gen{margin-top:8px;font-size:11px;color:var(--muted);border-top:1px dashed var(--line);padding-top:8px}
.jump{display:flex;gap:6px;overflow-x:auto;padding:10px 2px 2px;-webkit-overflow-scrolling:touch}
.jump a{flex:0 0 auto;min-height:34px;display:inline-flex;align-items:center;padding:5px 13px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12px;font-weight:600;text-decoration:none;color:var(--ink);touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.day{margin-top:10px;scroll-margin-top:8px}
details{background:var(--card);border:1px solid var(--line);border-radius:14px}
summary{position:sticky;top:0;z-index:2;display:flex;align-items:baseline;gap:8px;padding:12px;cursor:pointer;list-style:none;font-size:14px;background:var(--card);border-radius:13px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
details[open] summary{border-radius:13px 13px 0 0}
summary::-webkit-details-marker{display:none}
summary::after{content:'▾';margin-left:auto;color:var(--muted);font-size:12px}
details[open] summary::after{content:'▴'}
.dnum{font-weight:700}
.ddate{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.dcount{margin-left:auto;color:var(--muted);font-size:11px}
.day-body{padding:0 12px 12px}
.route{display:inline-flex;align-items:center;min-height:36px;margin:0 0 8px;font-size:12px;font-weight:600;text-decoration:none;touch-action:manipulation}
.stops{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.stops>li{display:flex;gap:8px;border-top:1px solid var(--line);padding-top:10px}
.stops>li:first-child{border-top:0;padding-top:0}
.idx{flex:0 0 20px;height:20px;border-radius:999px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.stop-main{min-width:0;flex:1}
.title{font-weight:600;font-size:14px;line-height:1.35;word-break:break-word}
.time{display:inline-block;margin-right:6px;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:700;font-size:13px}
.kind-icon{margin-right:4px}
.meta{margin-top:1px;font-size:11px;color:var(--muted)}
.why,.notes{margin-top:3px;font-size:12px;color:var(--ink);opacity:.9;line-height:1.4}
.notes{color:var(--muted)}
.links{margin-top:6px;display:flex;flex-wrap:wrap;gap:6px}
.links a{min-height:32px;display:inline-flex;align-items:center;font-size:12px;font-weight:600;text-decoration:none;background:var(--accent-soft);border-radius:999px;padding:4px 12px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.empty{margin:4px 0;font-size:12px;color:var(--muted)}
.panel{margin-top:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.panel h2{margin:0 0 8px;font-size:14px}
.pool{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.pool>li{border-top:1px solid var(--line);padding-top:8px}
.pool>li:first-child{border-top:0;padding-top:0}
.ex-total{font-size:15px;font-weight:700;margin-bottom:6px}
.expenses{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.expenses>li{display:flex;align-items:baseline;gap:8px;font-size:12px}
.ex-date{color:var(--muted);font-variant-numeric:tabular-nums;flex:0 0 auto}
.ex-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ex-amount{flex:0 0 auto;font-weight:600;font-variant-numeric:tabular-nums}
@media print{:root{--bg:#fff;--card:#fff;--ink:#000;--muted:#555;--line:#ccc}summary{position:static}summary::after{content:''}.links{display:none}.jump{display:none}}
`;
}

export function buildTripItineraryHtml(input: TripItineraryHtmlInput): string {
  const language = input.language ?? 'zh';
  const copy = COPY[language];
  const trip = sanitizeTrip(input.trip);
  const places = input.places.filter((place) => place.trip_id === trip.id);
  const visits = input.visits.filter((visit) => visit.trip_id === trip.id);
  const expenses = input.includeExpenses
    ? input.expenses.filter((expense) => expense.trip_id === trip.id)
    : [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const days = buildDays(trip, places, visits);
  const pool = buildCandidatePool(places, visits, trip.id);
  const destinations = (trip.destinations ?? []).join(', ') || copy.noDestination;

  return `<!doctype html>
<html lang="${copy.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f5f5f4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1c1917" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="format-detection" content="telephone=no">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(trip.title)} · ${copy.docTitleSuffix}</title>
<style>${styles()}</style>
</head>
<body>
<div class="wrap">
<header class="trip">
<div class="kicker">${copy.kicker}</div>
<h1>✈️ ${escapeHtml(trip.title)}</h1>
<div class="dates">${escapeHtml(trip.start_date)} → ${escapeHtml(trip.end_date)} · ${escapeHtml(destinations)}</div>
<div class="gen">${copy.generatedAt} ${escapeHtml(generatedAt)} · ${copy.readonly} · ${copy.printHint}</div>
</header>
${renderJumpNav(days, language)}
${renderDays(days, language)}
${renderPool(pool, language)}
${renderExpenses(expenses, language, input.includeExpenses === true)}
</div>
</body>
</html>
`;
}

export function tripItineraryHtmlFileName(title: string): string {
  const safe = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'ownly-trip'}.html`;
}
