from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one occurrence, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


# 1) Canonical Planner time fact: one persisted start time. End time remains derived.
replace_once(
    'src/domain/planner.ts',
    "  scheduled_date?: string;\n  sort_order?: number;",
    "  scheduled_date?: string;\n  /** Canonical local start time for an executable itinerary item (HH:mm). */\n  scheduled_start?: string;\n  sort_order?: number;",
)
replace_once(
    'src/domain/planner.ts',
    "    scheduled_date: undefined,\n    sort_order: undefined,",
    "    scheduled_date: undefined,\n    scheduled_start: undefined,\n    sort_order: undefined,",
)
replace_once(
    'src/domain/planner.ts',
    "\nexport {\n  calculateDayTimeSlots,\n  exportTripToICalProMarkdown,\n  generateAiItineraryPlan,\n  parseICalProMarkdown,\n  ICAL_PRO_PRIORITY_MAP,\n  REVERSE_PRIORITY_MAP,\n  type ICalProExportOptions,\n  type AiPlanOptions,\n  type AiItineraryResult,\n} from './ical-pro';",
    "",
)

# 2) Deterministic schedule proposal validation. MCP clients/LLMs propose; Ownly validates facts.
write('src/domain/planner-schedule.ts', r'''import {
  checkOpeningHoursCollision,
  listTripDates,
  type PlannerTrip,
  type PlannerTripPlace,
} from './planner';

export interface PlannerScheduleProposalItem {
  id: string;
  scheduled_date: string;
  scheduled_start?: string;
  sort_order: number;
  duration_minutes?: number;
}

export interface PlannerScheduleIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  place_id?: string;
}

export interface PlannerScheduleEvaluation {
  valid: boolean;
  issues: PlannerScheduleIssue[];
  places: PlannerTripPlace[];
}

const CLOCK_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function plannerClockToMinutes(value?: string | null): number | null {
  if (!value || !CLOCK_RE.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getScheduledEndTime(
  start?: string | null,
  durationMinutes?: number | null,
): string | null {
  const startMinutes = plannerClockToMinutes(start);
  if (startMinutes === null || !Number.isInteger(durationMinutes) || !durationMinutes || durationMinutes <= 0) {
    return null;
  }
  const end = (startMinutes + durationMinutes) % (24 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

function isHardConstraint(place: PlannerTripPlace): boolean {
  return Boolean(place.locked || place.is_anchor);
}

function sameOptional<T>(next: T | undefined, current: T | undefined): boolean {
  return next === undefined || next === current;
}

export function evaluatePlannerScheduleProposal(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  proposal: PlannerScheduleProposalItem[],
): PlannerScheduleEvaluation {
  const issues: PlannerScheduleIssue[] = [];
  const dates = new Set(listTripDates(trip.start_date, trip.end_date));
  const tripPlaces = places.filter((place) => place.trip_id === trip.id && place.state !== 'dropped');
  const byId = new Map(tripPlaces.map((place) => [place.id, place] as const));
  const seen = new Set<string>();
  const proposed = new Map<string, PlannerTripPlace>();

  for (const item of proposal) {
    if (seen.has(item.id)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_PLACE', place_id: item.id, message: 'A place appears more than once in the schedule proposal.' });
      continue;
    }
    seen.add(item.id);

    const existing = byId.get(item.id);
    if (!existing) {
      issues.push({ severity: 'error', code: 'PLACE_NOT_FOUND', place_id: item.id, message: 'The proposed place does not belong to this trip.' });
      continue;
    }
    if (!dates.has(item.scheduled_date)) {
      issues.push({ severity: 'error', code: 'DATE_OUTSIDE_TRIP', place_id: item.id, message: `${item.scheduled_date} is outside the trip date range.` });
    }
    if (item.scheduled_start !== undefined && plannerClockToMinutes(item.scheduled_start) === null) {
      issues.push({ severity: 'error', code: 'INVALID_START_TIME', place_id: item.id, message: 'scheduled_start must use 24-hour HH:mm format.' });
    }
    if (!Number.isInteger(item.sort_order) || item.sort_order < 0) {
      issues.push({ severity: 'error', code: 'INVALID_SORT_ORDER', place_id: item.id, message: 'sort_order must be a non-negative integer.' });
    }
    if (item.duration_minutes !== undefined && (!Number.isInteger(item.duration_minutes) || item.duration_minutes <= 0 || item.duration_minutes > 24 * 60)) {
      issues.push({ severity: 'error', code: 'INVALID_DURATION', place_id: item.id, message: 'duration_minutes must be an integer between 1 and 1440.' });
    }

    if (isHardConstraint(existing)) {
      const unchanged = item.scheduled_date === existing.scheduled_date
        && item.sort_order === existing.sort_order
        && sameOptional(item.scheduled_start, existing.scheduled_start)
        && sameOptional(item.duration_minutes, existing.duration_minutes);
      if (!unchanged) {
        issues.push({
          severity: 'error',
          code: 'HARD_CONSTRAINT_CHANGED',
          place_id: item.id,
          message: `${existing.title} is locked/anchored and cannot be moved by an AI schedule proposal.`,
        });
      }
      proposed.set(item.id, existing);
      continue;
    }

    const startMinutes = plannerClockToMinutes(item.scheduled_start);
    if (startMinutes !== null && item.duration_minutes && startMinutes + item.duration_minutes > 24 * 60) {
      issues.push({
        severity: 'error',
        code: 'CROSSES_MIDNIGHT',
        place_id: item.id,
        message: 'Movable proposal items must finish on the same calendar day; overnight anchors should be modeled explicitly.',
      });
    }

    proposed.set(item.id, {
      ...existing,
      state: 'scheduled',
      scheduled_date: item.scheduled_date,
      scheduled_start: item.scheduled_start,
      sort_order: item.sort_order,
      duration_minutes: item.duration_minutes ?? existing.duration_minutes,
      // AI proposals never promote their own decisions to hard constraints.
      locked: existing.locked,
    });
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    return { valid: false, issues, places };
  }

  const nextPlaces = places.map((place) => proposed.get(place.id) ?? place);
  const timedByDate = new Map<string, Array<{ place: PlannerTripPlace; start: number; end: number }>>();

  for (const place of nextPlaces) {
    if (place.trip_id !== trip.id || place.state !== 'scheduled' || !place.scheduled_date) continue;
    const start = plannerClockToMinutes(place.scheduled_start);
    if (start !== null && place.duration_minutes && place.duration_minutes > 0) {
      const bucket = timedByDate.get(place.scheduled_date) ?? [];
      bucket.push({ place, start, end: start + place.duration_minutes });
      timedByDate.set(place.scheduled_date, bucket);
    } else if (place.scheduled_start) {
      issues.push({
        severity: 'warning',
        code: 'TIMED_ITEM_MISSING_DURATION',
        place_id: place.id,
        message: `${place.title} has a start time but no duration; calendar projection will remain date-only until duration is known.`,
      });
    }

    const hours = checkOpeningHoursCollision(place.open_hours, place.scheduled_date, place.preferred_window);
    if (hours.isCollision) {
      issues.push({ severity: 'warning', code: 'OPENING_HOURS_WARNING', place_id: place.id, message: hours.reason ?? 'Possible opening-hours conflict.' });
    }
  }

  for (const [date, items] of timedByDate) {
    items.sort((a, b) => a.start - b.start);
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];
      if (current.start < previous.end) {
        issues.push({
          severity: 'error',
          code: 'TIME_OVERLAP',
          place_id: current.place.id,
          message: `${date}: ${previous.place.title} overlaps ${current.place.title}.`,
        });
      }
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    places: nextPlaces,
  };
}
''')

write('src/domain/planner-schedule.test.ts', r'''import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import { evaluatePlannerScheduleProposal, getScheduledEndTime } from './planner-schedule';

const trip: PlannerTrip = {
  schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Bangkok', status: 'planning',
  start_date: '2026-10-05', end_date: '2026-10-07', destinations: ['Bangkok'], created_at: '2026-08-29T00:00:00Z',
};

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: trip.id, title: id,
    source_provider: 'google_maps', source_url: `https://maps.google.com/${id}`, kind: 'attraction',
    tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate',
    created_at: '2026-08-29T00:00:00Z', ...overrides,
  };
}

describe('Planner schedule proposal', () => {
  it('persists explicit time facts without auto-locking AI decisions', () => {
    const candidate = place('wat-pho');
    const result = evaluatePlannerScheduleProposal(trip, [candidate], [{
      id: candidate.id, scheduled_date: '2026-10-05', scheduled_start: '09:30', sort_order: 0, duration_minutes: 90,
    }]);
    expect(result.valid).toBe(true);
    expect(result.places[0].scheduled_start).toBe('09:30');
    expect(result.places[0].duration_minutes).toBe(90);
    expect(result.places[0].locked).not.toBe(true);
  });

  it('rejects moving a locked or anchored hard constraint', () => {
    const anchor = place('concert', {
      state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '19:30', sort_order: 3,
      duration_minutes: 150, locked: true, is_anchor: true, anchor_type: 'reservation',
    });
    const result = evaluatePlannerScheduleProposal(trip, [anchor], [{
      id: anchor.id, scheduled_date: '2026-10-06', scheduled_start: '20:00', sort_order: 0, duration_minutes: 150,
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'HARD_CONSTRAINT_CHANGED')).toBe(true);
  });

  it('rejects deterministic time overlap', () => {
    const first = place('a', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '09:00', sort_order: 0, duration_minutes: 120 });
    const second = place('b');
    const result = evaluatePlannerScheduleProposal(trip, [first, second], [{
      id: second.id, scheduled_date: '2026-10-05', scheduled_start: '10:00', sort_order: 1, duration_minutes: 60,
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'TIME_OVERLAP')).toBe(true);
  });

  it('derives end time instead of persisting a second authority', () => {
    expect(getScheduledEndTime('23:00', 60)).toBe('00:00');
    expect(getScheduledEndTime(undefined, 60)).toBeNull();
    expect(getScheduledEndTime('09:00', undefined)).toBeNull();
  });
});
''')

# 3) iCal Pro becomes a one-way projection adapter. No reverse parser; no built-in pseudo-AI planner.
write('src/domain/ical-pro.ts', r'''import {
  buildGoogleMapsRouteUrl,
  getPlannerKindLabel,
  listTripDates,
  sortPlannerPlaces,
  PLANNER_KIND_ICONS,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from './planner';
import { getScheduledEndTime } from './planner-schedule';

export const ICAL_PRO_PRIORITY_MAP: Record<PlannerPlacePriority, string> = {
  must: '⏫',
  want: '🔼',
  optional: '🔽',
};

export interface ICalProExportOptions {
  includeAlarm?: boolean;
  alarmMinutes?: number;
  useDayPlannerHeadings?: boolean;
  language?: 'zh' | 'en';
}

export function exportTripToICalProMarkdown(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  options: ICalProExportOptions = {},
): string {
  const {
    includeAlarm = true,
    alarmMinutes = 15,
    useDayPlannerHeadings = true,
    language = 'zh',
  } = options;
  const zh = language === 'zh';
  const tripPlaces = places.filter((place) => place.trip_id === trip.id && place.state !== 'dropped');
  const dates = listTripDates(trip.start_date, trip.end_date);
  const lines: string[] = [
    '---',
    `title: ${JSON.stringify(trip.title)}`,
    'type: trip_itinerary',
    `trip_id: ${JSON.stringify(trip.id)}`,
    `start_date: ${JSON.stringify(trip.start_date)}`,
    `end_date: ${JSON.stringify(trip.end_date)}`,
    `destinations: ${JSON.stringify(trip.destinations || [])}`,
    `currency: ${JSON.stringify(trip.currency || 'USD')}`,
    'generator: ownly-planner-ical-pro',
    `updated_at: ${JSON.stringify(new Date().toISOString())}`,
    '---',
    '',
    `# ✈️ ${trip.title}`,
    '',
    `> 📅 **${zh ? '行程日期' : 'Dates'}:** ${trip.start_date} ~ ${trip.end_date}`,
    `> ${zh ? '此文件是 Planner/Vault 的单向日历投影；编辑此文件不会反写 Planner。' : 'This file is a one-way calendar projection of Planner/Vault; editing it does not write back to Planner.'}`,
    '',
  ];

  dates.forEach((date, dayIndex) => {
    const dayPlaces = sortPlannerPlaces(
      tripPlaces.filter((place) => place.scheduled_date === date && place.state === 'scheduled'),
    );
    lines.push(useDayPlannerHeadings ? `## Day ${dayIndex + 1} · ${date}` : `### ${date}`);

    if (dayPlaces.length === 0) {
      lines.push(`- [ ] ${date} ${zh ? '自由活动 / 待排期' : 'Free Day / Unscheduled'}`, '');
      return;
    }

    const routeUrl = buildGoogleMapsRouteUrl(dayPlaces, trip.transport_mode);
    if (routeUrl) lines.push(`🗺️ [${zh ? '当天 Google Maps 路线导航' : 'Day Route Directions'}](${routeUrl})`, '');

    dayPlaces.forEach((place) => {
      const icon = PLANNER_KIND_ICONS[place.kind] || '📍';
      const priorityIcon = place.priority ? ICAL_PRO_PRIORITY_MAP[place.priority] : '🔼';
      const alarmTag = includeAlarm && place.priority === 'must' ? ` ⏰ ${alarmMinutes}` : '';
      const endTime = getScheduledEndTime(place.scheduled_start, place.duration_minutes);
      const timing = place.scheduled_start && endTime
        ? `${date} ${place.scheduled_start}-${endTime}`
        : date;
      lines.push(`- [ ] ${timing} ${icon} ${place.title} ${priorityIcon}${alarmTag}`);

      const kindLabel = getPlannerKindLabel(place.kind, language);
      lines.push(`    - 🏷️ ${zh ? '类别' : 'Category'}: ${kindLabel}${place.area ? ` · ${place.area}` : ''}`);
      if (place.address) lines.push(`    - 📍 ${zh ? '地址' : 'Address'}: ${place.address}`);
      if (place.open_hours) lines.push(`    - ⏰ ${zh ? '营业时间' : 'Hours'}: ${place.open_hours}`);
      if (place.observed_price) lines.push(`    - 💰 ${zh ? '参考价格' : 'Price'}: ${place.observed_price}`);
      if (place.observed_rating) lines.push(`    - ⭐ ${zh ? '评分' : 'Rating'}: ${place.observed_rating}`);
      if (place.phone) lines.push(`    - 📞 ${zh ? '电话' : 'Phone'}: ${place.phone}`);
      if (place.why) lines.push(`    - 💡 ${zh ? '理由' : 'Why'}: ${place.why}`);
      if (place.notes) lines.push(`    - 📝 ${zh ? '备注' : 'Notes'}: ${place.notes}`);
      if (place.source_url) lines.push(`    - 🔗 ${zh ? '链接' : 'Link'}: ${place.source_url}`);
    });
    lines.push('');
  });

  const candidates = tripPlaces.filter((place) => place.state === 'candidate');
  if (candidates.length > 0) {
    lines.push('---', '', `## 💡 ${zh ? '备选研究灵感池' : 'Candidate Pool'} (VTODO)`);
    candidates.forEach((place) => {
      const icon = PLANNER_KIND_ICONS[place.kind] || '📍';
      const priorityIcon = place.priority ? ICAL_PRO_PRIORITY_MAP[place.priority] : '🔼';
      lines.push(`- [ ] ${icon} ${place.title} ${priorityIcon}`);
      if (place.why || place.notes) lines.push(`    - ${place.why || place.notes}`);
      if (place.address) lines.push(`    - 📍 ${place.address}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
''')

write('src/domain/ical-pro.test.ts', r'''import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import { exportTripToICalProMarkdown } from './ical-pro';

const trip: PlannerTrip = {
  schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Tokyo', status: 'planning',
  start_date: '2026-10-20', end_date: '2026-10-21', destinations: ['Tokyo'], created_at: '2026-08-29T00:00:00Z',
};

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: trip.id, title: id,
    source_provider: 'google_maps', source_url: `https://maps.google.com/${id}`, kind: 'attraction',
    tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate',
    created_at: '2026-08-29T00:00:00Z', ...overrides,
  };
}

describe('iCal Pro projection', () => {
  it('projects canonical start + duration into a VEVENT-compatible time range', () => {
    const timed = place('Senso-ji', {
      state: 'scheduled', scheduled_date: '2026-10-20', scheduled_start: '09:15',
      duration_minutes: 90, sort_order: 0, priority: 'must', address: 'Asakusa',
    });
    const markdown = exportTripToICalProMarkdown(trip, [timed]);
    expect(markdown).toContain('- [ ] 2026-10-20 09:15-10:45 🏰 Senso-ji ⏫ ⏰ 15');
    expect(markdown).toContain('📍 地址: Asakusa');
  });

  it('never invents a default start time or duration', () => {
    const dateOnly = place('Skytree', {
      state: 'scheduled', scheduled_date: '2026-10-20', sort_order: 0, priority: 'want',
    });
    const markdown = exportTripToICalProMarkdown(trip, [dateOnly]);
    expect(markdown).toContain('- [ ] 2026-10-20 🏰 Skytree 🔼');
    expect(markdown).not.toContain('09:00');
    expect(markdown).not.toMatch(/2026-10-20 \d{2}:\d{2}-\d{2}:\d{2} 🏰 Skytree/);
  });

  it('keeps unscheduled research candidates as floating VTODO items', () => {
    const candidate = place('Ramen', { kind: 'food', priority: 'optional' });
    const markdown = exportTripToICalProMarkdown(trip, [candidate]);
    expect(markdown).toContain('备选研究灵感池 (VTODO)');
    expect(markdown).toContain('- [ ] 🍜 Ramen 🔽');
  });
});
''')

# 4) PlannerRepository imports the projection adapter directly and clears canonical time on unschedule.
replace_once(
    'src/services/PlannerRepository.ts',
    "  ensurePlaceKindTag,\n  exportTripToICalProMarkdown,\n  mergeCapturedPlaceResearch,",
    "  ensurePlaceKindTag,\n  mergeCapturedPlaceResearch,",
)
replace_once(
    'src/services/PlannerRepository.ts',
    "} from '@/domain/planner';\nimport { obsidianService }",
    "} from '@/domain/planner';\nimport { exportTripToICalProMarkdown } from '@/domain/ical-pro';\nimport { obsidianService }",
)
replace_once(
    'src/services/PlannerRepository.ts',
    "      scheduled_date: undefined,\n      sort_order: undefined,",
    "      scheduled_date: undefined,\n      scheduled_start: undefined,\n      sort_order: undefined,",
)
replace_once(
    'scripts/cli/planner-storage.ts',
    "    scheduled_date: undefined,\n    sort_order: undefined,",
    "    scheduled_date: undefined,\n    scheduled_start: undefined,\n    sort_order: undefined,",
)

# 5) Web displays only canonical time facts. It does not synthesize schedules.
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "  buildGoogleMapsRouteUrl,\n  calculateDayTimeSlots,\n  checkOpeningHoursCollision,",
    "  buildGoogleMapsRouteUrl,\n  checkOpeningHoursCollision,",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "  exportPlacesToKML,\n  exportTripToICalProMarkdown,\n  exportTripToMarkdown,",
    "  exportPlacesToKML,\n  exportTripToMarkdown,",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "  sortPlannerPlaces,\n  ICAL_PRO_PRIORITY_MAP,\n  PLANNER_KIND_ICONS,",
    "  sortPlannerPlaces,\n  PLANNER_KIND_ICONS,",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "} from '@/domain/planner';\nimport { plannerRepository }",
    "} from '@/domain/planner';\nimport { exportTripToICalProMarkdown, ICAL_PRO_PRIORITY_MAP } from '@/domain/ical-pro';\nimport { getScheduledEndTime } from '@/domain/planner-schedule';\nimport { plannerRepository }",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "\n  const dayTimeSlots = useMemo(() => {\n    return calculateDayTimeSlots(scheduled);\n  }, [scheduled]);\n",
    "",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "        ? '已生成 iCal Pro Markdown 行程单！已复制到剪贴板，可供 obsidian-ical-plugin-pro 自动同步至 Google Calendar。'\n        : 'Copied iCal Pro Markdown itinerary! Compatible with obsidian-ical-plugin-pro for Google Calendar sync.',",
    "        ? '已复制 iCal Pro 日历投影；时间只来自 Planner 已确认的开始时间与时长。'\n        : 'Copied the iCal Pro calendar projection; timed events only use confirmed Planner start times and durations.',",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "        ? '已下载 iCal Pro 行程单文件 (.md)，放入 Obsidian Vault 即可被 iCal Pro 插件同步至 Google Calendar！'\n        : 'Downloaded iCal Pro itinerary file (.md)!',",
    "        ? '已下载 iCal Pro 日历投影 (.md)；可放入 Obsidian Vault 由 iCal Pro 生成订阅源。'\n        : 'Downloaded the iCal Pro calendar projection (.md).',",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "                  const col = dayCollisions.placeCollisions[place.id] || checkOpeningHoursCollision(place.open_hours, activeDate, place.preferred_window);\n                  const slot = dayTimeSlots[index];",
    "                  const col = dayCollisions.placeCollisions[place.id] || checkOpeningHoursCollision(place.open_hours, activeDate, place.preferred_window);\n                  const scheduledEnd = getScheduledEndTime(place.scheduled_start, place.duration_minutes);",
)
replace_once(
    'src/components/planner/PlannerHome.tsx',
    "                            {slot ? (\n                              <span className=\"rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-stone-600\">\n                                🕒 {slot.startTime}-{slot.endTime}\n                              </span>\n                            ) : null}",
    "                            {place.scheduled_start ? (\n                              <span className=\"rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-stone-600\">\n                                🕒 {place.scheduled_start}{scheduledEnd ? `-${scheduledEnd}` : ''}\n                              </span>\n                            ) : null}",
)

# 6) MCP read surface: expose facts needed by an external AI client, not a built-in pseudo-AI engine.
write('scripts/mcp/planner-tools.ts', r'''import {
  listPlannerBookings,
  listPlannerExpenses,
  listPlannerPlaces,
  listPlannerTrips,
} from '../cli/planner-storage';
import { OwnlyMcpError } from './ownly-tools';
import {
  estimateTripBudget,
  checkOpeningHoursCollision,
  listTripDates,
  type FxSettings,
  type PlannerTrip,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '../../src/domain/planner';
import { exportTripToICalProMarkdown, type ICalProExportOptions } from '../../src/domain/ical-pro';

function requireTrip(dataLocation: string, tripId: string) {
  const entry = listPlannerTrips(dataLocation).find((item) => item.frontmatter.id === tripId);
  if (!entry) throw new OwnlyMcpError(`Planner trip was not found: ${tripId}`, 'NOT_FOUND');
  return entry.frontmatter as unknown as PlannerTrip;
}

export function getPlannerSummary(dataLocation: string): Record<string, unknown> {
  const trips = listPlannerTrips(dataLocation).map((item) => item.frontmatter);
  const places = listPlannerPlaces(dataLocation).map((item) => item.frontmatter);
  const expenses = listPlannerExpenses(dataLocation).map((item) => item.frontmatter);
  return {
    trips: trips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      status: trip.status,
      dates: `${trip.start_date} → ${trip.end_date}`,
      currency: trip.currency ?? null,
      places_total: places.filter((place) => place.trip_id === trip.id).length,
      scheduled: places.filter((place) => place.trip_id === trip.id && place.state === 'scheduled').length,
      candidates: places.filter((place) => place.trip_id === trip.id && place.state === 'candidate').length,
      dropped: places.filter((place) => place.trip_id === trip.id && place.state === 'dropped').length,
      expenses: expenses.filter((expense) => expense.trip_id === trip.id).length,
    })),
    totals: { trips: trips.length, places: places.length, expenses: expenses.length },
  };
}

export function getPlannerTripDetail(dataLocation: string, tripId: string): Record<string, unknown> {
  const trip = requireTrip(dataLocation, tripId);
  const places = listPlannerPlaces(dataLocation)
    .map((item) => item.frontmatter as unknown as PlannerTripPlace)
    .filter((place) => place.trip_id === tripId && place.state !== 'dropped')
    .sort((left, right) => (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER));
  const bookings = listPlannerBookings(dataLocation)
    .map((item) => item.frontmatter as unknown as { trip_id: string; [key: string]: unknown })
    .filter((booking) => booking.trip_id === tripId);
  const expenses = listPlannerExpenses(dataLocation)
    .map((item) => item.frontmatter as unknown as TripExpenseItem)
    .filter((expense) => expense.trip_id === tripId);

  const fx: FxSettings = { base: (trip.currency || 'CNY').toUpperCase(), overrides: trip.fx_rates };
  const scheduled = places.filter((place) => place.state === 'scheduled');
  const budget = estimateTripBudget(scheduled, Math.max(1, trip.members?.length ?? 1), fx);
  const conflicts = listTripDates(trip.start_date, trip.end_date)
    .map((date) => ({
      date,
      collisions: places
        .filter((place) => place.scheduled_date === date && place.open_hours)
        .map((place) => ({ place: place.title, ...checkOpeningHoursCollision(place.open_hours, date, place.preferred_window) }))
        .filter((collision) => collision.isCollision),
    }))
    .filter((day) => day.collisions.length > 0);

  return {
    trip,
    budget: {
      base_currency: fx.base,
      total: budget.totalEstimated,
      per_person: budget.perPersonEstimated,
      breakdown: budget.categoryBreakdown,
      currencies_found: budget.currencies,
      fx_overrides: trip.fx_rates ?? {},
    },
    conflicts,
    places: places.map((place) => ({
      id: place.id,
      title: place.title,
      kind: place.kind,
      state: place.state,
      priority: place.priority ?? null,
      scheduled_date: place.scheduled_date ?? null,
      scheduled_start: place.scheduled_start ?? null,
      duration_minutes: place.duration_minutes ?? null,
      sort_order: place.sort_order ?? null,
      locked: place.locked ?? false,
      is_anchor: place.is_anchor ?? false,
      anchor_type: place.anchor_type ?? null,
      preferred_window: place.preferred_window ?? null,
      open_hours: place.open_hours ?? null,
      reservation_status: place.reservation_status,
      rating: place.observed_rating ?? null,
      review_count: place.observed_review_count ?? null,
      price: place.observed_price ?? null,
      price_currency: place.price_currency ?? null,
      price_min: place.price_min ?? null,
      price_max: place.price_max ?? null,
      price_unit: place.price_unit ?? null,
      area: place.area ?? null,
      address: place.address ?? null,
      coordinates: place.coordinates ?? null,
      phone: place.phone ?? null,
      source_url: place.source_url,
    })),
    bookings,
    expenses: expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      currency: expense.currency,
      category: expense.category,
      paid_by: expense.paid_by,
      split_members: expense.split_members,
    })),
  };
}

export function getPlannerTripICalMarkdown(
  dataLocation: string,
  tripId: string,
  options: ICalProExportOptions = {},
): { tripId: string; title: string; markdown: string } {
  const trip = requireTrip(dataLocation, tripId);
  const places = listPlannerPlaces(dataLocation)
    .map((item) => item.frontmatter as unknown as PlannerTripPlace)
    .filter((place) => place.trip_id === tripId);
  return { tripId: trip.id, title: trip.title, markdown: exportTripToICalProMarkdown(trip, places, options) };
}
''')

# 7) Write service: schedule proposal is validated, never auto-locked; calendar file is regenerated only from canonical Planner.
replace_once(
    'scripts/shared/ownly-write-service.ts',
    "import {\n  exportTripToICalProMarkdown,\n  generateStaySpanPlaces,",
    "import {\n  generateStaySpanPlaces,",
)
replace_once(
    'scripts/shared/ownly-write-service.ts',
    "} from '../../src/domain/planner';",
    "} from '../../src/domain/planner';\nimport { exportTripToICalProMarkdown } from '../../src/domain/ical-pro';\nimport { evaluatePlannerScheduleProposal, type PlannerScheduleProposalItem } from '../../src/domain/planner-schedule';",
)
text = read('scripts/shared/ownly-write-service.ts')
start = text.index('  preparePlannerApplyAiPlan(')
end = text.index('  prepareRestoreObject(', start)
replacement = r'''  preparePlannerApplyScheduleProposal(
    tripId: string,
    proposal: { places: PlannerScheduleProposalItem[] },
  ): PreparedOwnlyOperation {
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) {
      throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const trip = tripEntry.frontmatter as unknown as PlannerTrip;
    const allEntries = listPlannerPlaces(this.dataLocation);
    const tripEntries = allEntries.filter((entry) => entry.frontmatter.trip_id === tripId);
    const currentPlaces = tripEntries.map((entry) => entry.frontmatter as unknown as PlannerTripPlace);
    const evaluation = evaluatePlannerScheduleProposal(trip, currentPlaces, proposal.places);
    const errors = evaluation.issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      throw new OwnlyMutationError(
        `Schedule proposal is invalid: ${errors.map((issue) => issue.message).join(' | ')}`,
        'INVALID_INPUT' as OwnlyMutationErrorCode,
      );
    }

    const nextById = new Map(evaluation.places.map((place) => [place.id, place] as const));
    const proposedIds = new Set(proposal.places.map((place) => place.id));
    const updates = tripEntries
      .filter((entry) => proposedIds.has(entry.frontmatter.id))
      .map((entry) => ({ entry, next: nextById.get(entry.frontmatter.id)! }))
      .filter(({ entry, next }) => (
        entry.frontmatter.state !== next.state
        || entry.frontmatter.scheduled_date !== next.scheduled_date
        || entry.frontmatter.scheduled_start !== next.scheduled_start
        || entry.frontmatter.sort_order !== next.sort_order
        || entry.frontmatter.duration_minutes !== next.duration_minutes
      ));

    if (updates.length === 0) {
      throw new OwnlyMutationError('Schedule proposal does not change any Planner decision.', 'INVALID_INPUT' as OwnlyMutationErrorCode);
    }
    const expectedMap = new Map(updates.map(({ entry }) => [entry.filePath, fingerprint(entry.filePath)] as const));
    const warnings = evaluation.issues.filter((issue) => issue.severity === 'warning');

    return this.prepare(
      'planner_apply_schedule_proposal',
      {
        trip_id: tripId,
        updated_count: updates.length,
        warnings,
        updates: updates.map(({ entry, next }) => ({
          id: entry.frontmatter.id,
          title: entry.frontmatter.title,
          scheduled_date: next.scheduled_date,
          scheduled_start: next.scheduled_start,
          duration_minutes: next.duration_minutes,
          sort_order: next.sort_order,
          locked: next.locked ?? false,
        })),
      },
      () => {
        for (const { entry, next } of updates) {
          assertUnchanged(entry.filePath, expectedMap.get(entry.filePath)!);
          const persisted = { ...next, updated_at: todayISO(this.now()) };
          writeEntry(dirname(entry.filePath), entry.fileName, persisted, entry.body);
        }
        writeAgentLog(this.dataLocation, 'planner_apply_schedule_proposal', tripId, null, { updated_count: updates.length, warnings });
        return { trip_id: tripId, applied_count: updates.length, warnings };
      },
    );
  }

  preparePlannerSaveICalMarkdown(tripId: string): PreparedOwnlyOperation {
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) {
      throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const trip = tripEntry.frontmatter as unknown as PlannerTrip;
    const placeEntries = listPlannerPlaces(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);
    const places = placeEntries.map((entry) => entry.frontmatter as unknown as PlannerTripPlace);
    const markdown = exportTripToICalProMarkdown(trip, places);
    const expectedTrip = fingerprint(tripEntry.filePath);
    const expectedPlaces = new Map(placeEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.trips);
    const fileName = `trip--${trip.id}.itinerary.md`;
    const targetPath = join(directory, fileName);

    return this.prepare(
      'planner_save_ical_markdown',
      { trip_id: tripId, target_file: fileName, length: markdown.length },
      () => {
        assertUnchanged(tripEntry.filePath, expectedTrip);
        for (const entry of placeEntries) assertUnchanged(entry.filePath, expectedPlaces.get(entry.filePath)!);
        mkdirSync(directory, { recursive: true });
        writeFileSync(targetPath, markdown, 'utf8');
        writeAgentLog(this.dataLocation, 'planner_save_ical_markdown', tripId, null, { file_name: fileName });
        return { trip_id: tripId, file_name: fileName, file_path: targetPath, saved: true };
      },
    );
  }

'''
write('scripts/shared/ownly-write-service.ts', text[:start] + replacement + text[end:])

# 8) MCP registry: delete built-in AI generator. Client proposes; Ownly prepares/commits validated schedule facts.
replace_once(
    'packages/mcp/src/index.mjs',
    "import {\n  getPlannerSummary,\n  getPlannerTripDetail,\n  getPlannerTripICalMarkdown,\n  generatePlannerAiPlan,\n} from '../../../scripts/mcp/planner-tools.ts';",
    "import {\n  getPlannerSummary,\n  getPlannerTripDetail,\n  getPlannerTripICalMarkdown,\n} from '../../../scripts/mcp/planner-tools.ts';",
)
text = read('packages/mcp/src/index.mjs')
start = text.index("  server.registerTool(\n    'ownly_planner_get_ical_markdown'")
end = text.index("  server.registerTool(\n    'ownly_prepare_create_object'", start)
replacement = r'''  server.registerTool(
    'ownly_planner_get_ical_markdown',
    {
      title: 'Planner iCal Pro Projection',
      description: 'Project confirmed Planner/Vault schedule facts into obsidian-ical-plugin-pro Markdown. Missing start times or durations are never invented.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        language: z.enum(['zh', 'en']).optional(),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    safeHandler(({ trip_id, language }) => getPlannerTripICalMarkdown(dataLocation, trip_id, { language })),
  );

  server.registerTool(
    'ownly_planner_prepare_apply_schedule_proposal',
    {
      title: 'Preview Schedule Proposal',
      description: 'Validate and preview an MCP client/LLM schedule proposal. Locked or anchored stops cannot be changed; accepted AI decisions remain unlocked until the user explicitly pins them.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        places: z.array(z.object({
          id: z.string().min(1),
          scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          scheduled_start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
          sort_order: z.number().int().nonnegative(),
          duration_minutes: z.number().int().positive().max(1440).optional(),
        })).min(1),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ trip_id, places }) => writeService.preparePlannerApplyScheduleProposal(trip_id, { places })),
  );

  server.registerTool(
    'ownly_planner_prepare_save_ical_markdown',
    {
      title: 'Preview Saving iCal Pro Projection',
      description: 'Preview regenerating the derived iCal Pro Markdown file from current canonical Planner/Vault facts. Arbitrary custom Markdown is not accepted.',
      inputSchema: z.object({ trip_id: z.string().min(1) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ trip_id }) => writeService.preparePlannerSaveICalMarkdown(trip_id)),
  );

'''
write('packages/mcp/src/index.mjs', text[:start] + replacement + text[end:])
replace_once(
    'packages/mcp/src/index.mjs',
    "Planner tools follow the same discipline: propose schedules/routes/budgets with read tools and planner_prepare_*, never silently overwrite locked stops (optimization pins them), and convert foreign prices only for display using trip fx_rates.",
    "Planner tools follow the same discipline: MCP clients/LLMs may propose schedules, but Ownly validates hard constraints and persists only confirmed decisions through planner_prepare_* + commit. Never invent missing start times, durations, prices, or transit facts; never silently overwrite locked/anchored stops; convert foreign prices only for display using trip fx_rates.",
)

# 9) Focused MCP tests reflect the new boundary.
text = read('scripts/mcp/planner-tools.test.ts')
text = text.replace(',\n  generatePlannerAiPlan', '')
text = text.replace(
    "    locked: true,\n    observed_price: '฿500',",
    "    locked: true,\n    scheduled_start: '09:00',\n    duration_minutes: 90,\n    observed_price: '฿500',",
)
start = text.index("describe('Planner MCP iCal Pro & AI Planner'")
text = text[:start] + r'''describe('Planner MCP calendar projection', () => {
  it('exports only canonical Planner time facts to iCal Pro Markdown', () => {
    const { root } = createFixture();
    const result = getPlannerTripICalMarkdown(root, 'trip-1');
    expect(result.tripId).toBe('trip-1');
    expect(result.title).toBe('Bangkok 2026');
    expect(result.markdown).toContain('2026-11-01 09:00-10:30');
    expect(result.markdown).not.toContain('ownly-ai-planner');
  });
});
'''
write('scripts/mcp/planner-tools.test.ts', text)

# 10) Documentation: AI is the MCP client; Planner is authority; iCal is projection, not a second writer.
write('docs/AI_PLANNER_MCP.md', r'''# Ownly AI Planner via MCP + iCal Pro Projection

Ownly 的 AI Planner 不在 Ownly 内部再造一个“AI 引擎”。Claude Desktop、Cursor、Antigravity 等 **MCP Client / LLM 就是规划器**；Ownly 只提供事实、确定性验证、两阶段写入和日历投影。

## 唯一数据闭环

```text
Capture facts
    ↓
Planner / Vault (single source of truth)
    ↓
MCP client reads trip facts
    ↓
LLM proposes date + order + optional HH:mm + duration
    ↓
Ownly deterministic validation
    ↓
prepare → user confirmation → commit
    ↓
iCal Pro Markdown projection
    ↓
Calendar subscription
```

### Planner 的时间事实

`Trip Place` 只新增一个权威时间字段：

```yaml
scheduled_date: 2026-10-05
scheduled_start: "09:30"
duration_minutes: 90
sort_order: 0
```

结束时间永远由 `scheduled_start + duration_minutes` 计算，不再保存第二份 `scheduled_end`。

如果缺少开始时间或时长，Ownly **不会**虚构 `09:00`、90 分钟或统一交通缓冲。日历投影保持 date-only/VTODO 语义，直到 Planner 有足够事实生成明确时间块。

## MCP 工具

### 读取

- `ownly_planner_summary`：旅行概览。
- `ownly_planner_get_trip`：向 AI 客户端返回 Planner 事实，包括日期、`scheduled_start`、时长、顺位、锁定/anchor、营业时间、坐标、评分、评论量和结构化价格。
- `ownly_planner_get_ical_markdown`：从当前 Planner/Vault 生成只读 iCal Pro Markdown 投影。

### 两阶段写入

- `ownly_planner_prepare_apply_schedule_proposal`：验证并预览 AI 客户端提出的 schedule proposal。
- `ownly_planner_prepare_save_ical_markdown`：从当前 canonical Planner 重新生成 `trip--<id>.itinerary.md`；不接受任意 `custom_markdown`。
- `ownly_commit_operation`：用户确认后提交 prepared operation。

推荐流程：

1. AI 调用 `ownly_planner_get_trip`。
2. AI 根据真实地点事实提出 `places[]`：`id + scheduled_date + sort_order + optional scheduled_start + optional duration_minutes`。
3. 调用 `ownly_planner_prepare_apply_schedule_proposal`。
4. Ownly 拒绝越界日期、非法时间、时间重叠，以及任何对 locked / anchor 的移动；营业时间等软约束以 warning 返回。
5. 用户确认后调用 `ownly_commit_operation`。
6. 再调用 `ownly_planner_prepare_save_ical_markdown` → 确认 → commit，更新日历投影。

AI proposal 本身不会把地点设为 `locked`。只有用户显式 pin/lock 的地点才成为 hard constraint。

## obsidian-ical-plugin-pro 语法

iCal Pro 支持：

```markdown
- [ ] 2026-10-05 09:30-11:00 Wat Pho ⏫ ⏰ 15
- [ ] 2026-10-05 Grand Palace 🔼
- [ ] Candidate Cafe 🔽
```

- 有日期 + 开始/结束时间 → `VEVENT`
- 只有日期 → date-only task / `VTODO`（具体显示取决于插件目标设置）
- 无日期 → floating `VTODO`
- `⏫ / 🔼 / 🔽` → iCalendar priority
- `⏰ 15` → alarm

Ownly 不反向解析 `.itinerary.md`，因此 Calendar 永远不是第二事实源。修改日历投影文件不会反写 Planner。

## Calendar 同步边界

`obsidian-ical-plugin-pro` 负责把 Markdown 投影为 iCalendar 订阅源，可供 Google Calendar、Apple Calendar、Outlook 等客户端订阅。订阅客户端自行决定刷新周期，因此不要把它描述成“实时双向同步”。
''')

replace_once(
    'docs/MCP.md',
    "| `ownly_planner_get_ical_markdown` | Export trip in obsidian-ical-plugin-pro syntax (VEVENT time slots for Google Calendar) |\n| `ownly_planner_ai_plan` | Deterministic AI planner itinerary generator with proximity clustering and realistic time slot allocation |",
    "| `ownly_planner_get_ical_markdown` | Project confirmed Planner/Vault schedule facts into obsidian-ical-plugin-pro Markdown |",
)
replace_once(
    'docs/MCP.md',
    "| `ownly_planner_prepare_apply_ai_plan` | Preview bulk applying an AI planned itinerary to the Vault |\n| `ownly_planner_prepare_save_ical_markdown` | Preview saving an iCal Pro Markdown file into Trips/ for Google Calendar sync |",
    "| `ownly_planner_prepare_apply_schedule_proposal` | Validate and preview an MCP client/LLM schedule proposal without changing locked/anchored stops |\n| `ownly_planner_prepare_save_ical_markdown` | Preview regenerating the derived iCal Pro Markdown projection from canonical Planner facts |",
)

write('tasks/todo.md', r'''# Planner Execution Model — PR #128

## Completed in this PR

- [x] Add canonical `scheduled_start` (`HH:mm`) to Planner place state; derive end time from duration.
- [x] Treat MCP client / LLM as the AI planner; remove the built-in deterministic pseudo-AI generator.
- [x] Add deterministic schedule-proposal validation before prepare/commit.
- [x] Preserve locked and anchor stops as hard constraints.
- [x] Keep accepted AI suggestions unlocked until the user explicitly pins them.
- [x] Detect exact timed overlaps without inventing transit time.
- [x] Export iCal Pro as a one-way projection from Planner/Vault only.
- [x] Delete reverse iCal → Planner parsing and arbitrary custom calendar writes.
- [x] Never invent missing start times, durations, or universal transit buffers.
- [x] Expose richer trip facts through MCP so external clients can reason from rating/review/price/hours/coordinates/anchors.

## Boundary

```text
Capture → Planner/Vault → MCP proposal → deterministic validation → prepare/commit → iCal projection
```

Planner/Vault remains the only schedule authority. Calendar output is derived.
''')

print('PR #128 reshape applied successfully')
