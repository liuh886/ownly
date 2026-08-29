from __future__ import annotations

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_exact(path: str, old: str, new: str, count: int = 1) -> None:
    text = read(path)
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} occurrence(s), found {actual}: {old[:80]!r}")
    write(path, text.replace(old, new, count))


def replace_regex(path: str, pattern: str, replacement: str, count: int = 1) -> None:
    text = read(path)
    updated, actual = re.subn(pattern, replacement, text, count=count, flags=re.S)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} regex replacement(s), found {actual}: {pattern[:80]!r}")
    write(path, updated)


# 1) One authoritative time engine: planner-schedule.ts.
write(
    "src/domain/planner-schedule.ts",
    r'''import {
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

export interface PlannerTimeOverlap {
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
  fromTime: string;
  toTime: string;
  warning: string;
}

export interface PlannerTimingValidationOptions {
  allowCrossMidnight?: boolean;
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

export function validatePlannerTiming(
  start?: string | null,
  durationMinutes?: number | null,
  options: PlannerTimingValidationOptions = {},
): PlannerScheduleIssue[] {
  const issues: PlannerScheduleIssue[] = [];
  const hasStart = start !== undefined && start !== null && start !== '';
  const hasDuration = durationMinutes !== undefined && durationMinutes !== null;
  const startMinutes = plannerClockToMinutes(start);

  if (hasStart && startMinutes === null) {
    issues.push({
      severity: 'error',
      code: 'INVALID_START_TIME',
      message: 'scheduled_start must use 24-hour HH:mm format.',
    });
  }

  if (hasDuration && (!Number.isInteger(durationMinutes) || !durationMinutes || durationMinutes <= 0 || durationMinutes > 24 * 60)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_DURATION',
      message: 'duration_minutes must be an integer between 1 and 1440.',
    });
  }

  if (
    !options.allowCrossMidnight
    && startMinutes !== null
    && Number.isInteger(durationMinutes)
    && Boolean(durationMinutes)
    && durationMinutes! > 0
    && startMinutes + durationMinutes! > 24 * 60
  ) {
    issues.push({
      severity: 'error',
      code: 'CROSSES_MIDNIGHT',
      message: 'Movable schedule items must finish on the same calendar day; overnight anchors should be modeled explicitly.',
    });
  }

  return issues;
}

export function findPlannerTimeOverlaps(
  places: PlannerTripPlace[],
  date: string,
): PlannerTimeOverlap[] {
  const timed = places
    .filter((place) => place.state === 'scheduled' && place.scheduled_date === date)
    .map((place) => {
      const start = plannerClockToMinutes(place.scheduled_start);
      if (start === null || !Number.isInteger(place.duration_minutes) || !place.duration_minutes || place.duration_minutes <= 0) {
        return null;
      }
      return { place, start, end: start + place.duration_minutes };
    })
    .filter((item): item is { place: PlannerTripPlace; start: number; end: number } => item !== null)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const overlaps: PlannerTimeOverlap[] = [];
  for (let leftIndex = 0; leftIndex < timed.length; leftIndex += 1) {
    const left = timed[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < timed.length; rightIndex += 1) {
      const right = timed[rightIndex];
      if (right.start >= left.end) break;
      if (Math.max(left.start, right.start) >= Math.min(left.end, right.end)) continue;

      const leftEnd = getScheduledEndTime(left.place.scheduled_start, left.place.duration_minutes);
      const rightEnd = getScheduledEndTime(right.place.scheduled_start, right.place.duration_minutes);
      if (!left.place.scheduled_start || !right.place.scheduled_start || !leftEnd || !rightEnd) continue;

      const fromTime = `${left.place.scheduled_start}-${leftEnd}`;
      const toTime = `${right.place.scheduled_start}-${rightEnd}`;
      overlaps.push({
        fromId: left.place.id,
        toId: right.place.id,
        fromTitle: left.place.title,
        toTitle: right.place.title,
        fromTime,
        toTime,
        warning: `${left.place.title} (${fromTime}) overlaps ${right.place.title} (${toTime}).`,
      });
    }
  }
  return overlaps;
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
    if (!Number.isInteger(item.sort_order) || item.sort_order < 0) {
      issues.push({ severity: 'error', code: 'INVALID_SORT_ORDER', place_id: item.id, message: 'sort_order must be a non-negative integer.' });
    }

    issues.push(...validatePlannerTiming(
      item.scheduled_start,
      item.duration_minutes,
      { allowCrossMidnight: isHardConstraint(existing) },
    ).map((issue) => ({ ...issue, place_id: item.id })));

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

  for (const place of nextPlaces) {
    if (place.trip_id !== trip.id || place.state !== 'scheduled' || !place.scheduled_date) continue;
    if (place.scheduled_start && !place.duration_minutes) {
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

  for (const date of dates) {
    for (const overlap of findPlannerTimeOverlaps(nextPlaces, date)) {
      issues.push({
        severity: 'error',
        code: 'TIME_OVERLAP',
        place_id: overlap.toId,
        message: `${date}: ${overlap.warning}`,
      });
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    places: nextPlaces,
  };
}
''',
)

write(
    "src/domain/planner-schedule.test.ts",
    r'''import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from './planner';
import {
  evaluatePlannerScheduleProposal,
  findPlannerTimeOverlaps,
  getScheduledEndTime,
  validatePlannerTiming,
} from './planner-schedule';

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

  it('detects every nested overlap, not only adjacent intervals', () => {
    const places = [
      place('a', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '09:00', duration_minutes: 180 }),
      place('b', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '10:00', duration_minutes: 30 }),
      place('c', { state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: '11:00', duration_minutes: 30 }),
    ];
    const overlaps = findPlannerTimeOverlaps(places, '2026-10-05');
    expect(overlaps.map((item) => [item.fromId, item.toId])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
  });

  it('uses one validation contract for manual and MCP time facts', () => {
    expect(validatePlannerTiming('24:00', 60).some((issue) => issue.code === 'INVALID_START_TIME')).toBe(true);
    expect(validatePlannerTiming('09:00', 1441).some((issue) => issue.code === 'INVALID_DURATION')).toBe(true);
    expect(validatePlannerTiming('23:30', 60).some((issue) => issue.code === 'CROSSES_MIDNIGHT')).toBe(true);
    expect(validatePlannerTiming('23:30', 60, { allowCrossMidnight: true })).toEqual([]);
    expect(validatePlannerTiming(undefined, 90)).toEqual([]);
  });

  it('derives end time instead of persisting a second authority', () => {
    expect(getScheduledEndTime('23:00', 60)).toBe('00:00');
    expect(getScheduledEndTime(undefined, 60)).toBeNull();
    expect(getScheduledEndTime('09:00', undefined)).toBeNull();
  });
});
''',
)

# 2) Remove the duplicate PR #129 overlap engine from planner.ts and its duplicate test.
replace_exact(
    "src/domain/planner.ts",
    """function parseClockMinutes(value?: string | null): number | null {\n  if (!value || !/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(value)) return null;\n  const [h, m] = value.split(':').map(Number);\n  return h * 60 + m;\n}\n\n""",
    "",
)
replace_exact(
    "src/domain/planner.ts",
    "  timeOverlaps: Array<{ fromTitle: string; toTitle: string; fromTime: string; toTime: string; warning: string }>;\n",
    "",
)
replace_regex(
    "src/domain/planner.ts",
    r"\n  const timeOverlaps: Array<\{ fromTitle: string; toTitle: string; fromTime: string; toTime: string; warning: string \}> = \[\];.*?\n\n  return \{",
    "\n\n  return {",
)
replace_exact("src/domain/planner.ts", "    timeOverlaps,\n", "")
replace_regex(
    "src/domain/planner.test.ts",
    r"\n  it\('detects time overlaps between timed places on the same date', \(\) => \{.*?\n  \}\);(?=\n\}\);\n\ndescribe\('parseImportPayload')",
    "",
)

# 3) MCP reads schedule health from the same authoritative overlap helper.
write(
    "scripts/mcp/planner-tools.ts",
    r'''import {
  listPlannerBookings,
  listPlannerExpenses,
  listPlannerPlaces,
  listPlannerTrips,
} from '../cli/planner-storage';
import { OwnlyMcpError } from './ownly-tools';
import {
  estimateTripBudget,
  checkDayScheduleCollisions,
  listTripDates,
  type FxSettings,
  type PlannerTrip,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '../../src/domain/planner';
import { findPlannerTimeOverlaps } from '../../src/domain/planner-schedule';
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
    .map((date) => {
      const summary = checkDayScheduleCollisions(places, date);
      const timeOverlaps = findPlannerTimeOverlaps(places, date);
      const collisions = places
        .filter((place) => place.scheduled_date === date && summary.placeCollisions[place.id]?.isCollision)
        .map((place) => ({
          place: place.title,
          isCollision: true,
          reason: summary.placeCollisions[place.id]?.reason,
        }));
      return {
        date,
        has_collision: summary.hasCollision || timeOverlaps.length > 0,
        collisions,
        time_overlaps: timeOverlaps,
        is_overloaded: summary.isOverloaded,
        overload_reason: summary.overloadReason,
        long_transits: summary.longTransits,
      };
    })
    .filter((day) => day.has_collision);

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
''',
)

# 4) Manual timing writes use the same deterministic validation contract.
replace_exact(
    "src/services/PlannerRepository.ts",
    "import { exportTripToICalProMarkdown } from '@/domain/ical-pro';\n",
    "import { exportTripToICalProMarkdown } from '@/domain/ical-pro';\nimport { validatePlannerTiming } from '@/domain/planner-schedule';\n",
)
replace_regex(
    "src/services/PlannerRepository.ts",
    r"  async updatePlaceTiming\(\n    placeId: string,\n    timing: \{ scheduled_start\?: string \| null; duration_minutes\?: number \| null \},\n  \): Promise<PlannerTripPlace \| null> \{.*?\n  \}\n\n  /\*\* Rewrites sort_order",
    r'''  async updatePlaceTiming(
    placeId: string,
    timing: { scheduled_start?: string | null; duration_minutes?: number | null },
  ): Promise<PlannerTripPlace | null> {
    await this.initialize();
    const places = await this.listPlaces();
    const existing = places.find((place) => place.id === placeId);
    if (!existing) return null;

    const scheduledStart = timing.scheduled_start?.trim() || undefined;
    const durationMinutes = timing.duration_minutes ?? undefined;
    const timingErrors = validatePlannerTiming(
      scheduledStart,
      durationMinutes,
      { allowCrossMidnight: Boolean(existing.is_anchor) },
    ).filter((issue) => issue.severity === 'error');
    if (timingErrors.length > 0) {
      throw new Error(timingErrors.map((issue) => issue.message).join(' | '));
    }

    const next: PlannerTripPlace = {
      ...existing,
      scheduled_start: scheduledStart,
      duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    };
    await this.upsert(next);
    return next;
  }

  /** Rewrites sort_order''',
)
replace_regex(
    "src/services/PlannerRepository.ts",
    r"  /\*\*\n   \* Generates and writes an obsidian-ical-plugin-pro compliant Markdown file to Trips/\n   \* so Obsidian can immediately sync it to Google Calendar via the iCal Pro plugin\.\n   \*/\n  async saveTripICalMarkdown\(trip: PlannerTrip, places: PlannerTripPlace\[\]\): Promise<string> \{.*?\n  \}\n",
    r'''  /** Writes a one-way iCal Pro projection from freshly re-read canonical Planner/Vault state. */
  async saveTripICalMarkdown(tripId: string): Promise<string> {
    await this.initialize();
    const trip = (await this.listTrips()).find((item) => item.id === tripId);
    if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);
    const places = (await this.listPlaces()).filter((place) => place.trip_id === tripId);
    const markdown = exportTripToICalProMarkdown(trip, places);
    const fileName = `trip--${trip.id}.itinerary.md`;
    await this.store.writeMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.trips),
      fileName,
      markdown,
    );
    return fileName;
  }
''',
)

# Repository tests prove canonical re-read and invalid timing rejection.
replace_exact(
    "src/services/PlannerRepository.schedule.test.ts",
    "import type { PlannerTripPlace } from '@/domain/planner';\n",
    "import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';\n",
)
replace_regex(
    "src/services/PlannerRepository.schedule.test.ts",
    r"  it\('saveTripICalMarkdown generates and writes obsidian-ical-plugin-pro file', async \(\) => \{.*?\n  \}\);",
    r'''  it('saveTripICalMarkdown re-reads canonical Planner state before projection', async () => {
    const trip: PlannerTrip = {
      schema_version: '0.1', type: 'trip', id: 'trip-1', title: 'Bangkok 2026', status: 'planning',
      start_date: '2026-11-01', end_date: '2026-11-03', destinations: ['Bangkok'], created_at: '2026-08-24T00:00:00.000Z',
    };
    await plannerRepository.upsertTrip(trip);
    await plannerRepository.updatePlaceTiming('a', { scheduled_start: '09:00', duration_minutes: 90 });

    const fileName = await plannerRepository.saveTripICalMarkdown('trip-1');
    expect(fileName).toBe('trip--trip-1.itinerary.md');
    const written = files.get('vault/Trips')?.get('trip--trip-1.itinerary.md');
    expect(written).toBeDefined();
    expect(written).toContain('09:00-10:30');
  });''',
)
replace_exact(
    "src/services/PlannerRepository.schedule.test.ts",
    """  it('returns null when updating timing for non-existent place', async () => {\n""",
    """  it('rejects invalid and ordinary cross-midnight manual timing', async () => {\n    await expect(plannerRepository.updatePlaceTiming('a', { scheduled_start: '24:00', duration_minutes: 60 })).rejects.toThrow();\n    await expect(plannerRepository.updatePlaceTiming('a', { scheduled_start: '09:00', duration_minutes: 1441 })).rejects.toThrow();\n    await expect(plannerRepository.updatePlaceTiming('a', { scheduled_start: '23:30', duration_minutes: 60 })).rejects.toThrow();\n  });\n\n  it('returns null when updating timing for non-existent place', async () => {\n""",
)

# 5) Timing modal consumes planner-schedule helpers; opening-hours UI claims only what parser can verify.
write(
    "src/components/planner/PlaceTimingModal.tsx",
    r'''import { useMemo, useState } from 'react';
import { checkOpeningHoursCollision, type PlannerTripPlace } from '@/domain/planner';
import {
  findPlannerTimeOverlaps,
  getScheduledEndTime,
  validatePlannerTiming,
} from '@/domain/planner-schedule';

interface PlaceTimingModalProps {
  open: boolean;
  place: PlannerTripPlace | null;
  dayOtherPlaces?: PlannerTripPlace[];
  onClose: () => void;
  onSave: (placeId: string, timing: { scheduled_start?: string; duration_minutes?: number }) => Promise<void>;
  language?: 'zh' | 'en';
}

const QUICK_START_TIMES = [
  { labelZh: '早晨 09:00', labelEn: 'Morning 09:00', value: '09:00' },
  { labelZh: '午餐 11:30', labelEn: 'Lunch 11:30', value: '11:30' },
  { labelZh: '下午 14:00', labelEn: 'Afternoon 14:00', value: '14:00' },
  { labelZh: '傍晚 17:00', labelEn: 'Evening 17:00', value: '17:00' },
  { labelZh: '夜间 19:30', labelEn: 'Night 19:30', value: '19:30' },
];

const QUICK_DURATIONS = [
  { labelZh: '30 分钟', labelEn: '30m', minutes: 30 },
  { labelZh: '1 小时', labelEn: '1h', minutes: 60 },
  { labelZh: '1.5 小时', labelEn: '1.5h', minutes: 90 },
  { labelZh: '2 小时', labelEn: '2h', minutes: 120 },
  { labelZh: '3 小时', labelEn: '3h', minutes: 180 },
];

function timingIssueText(code: string, zh: boolean): string {
  if (!zh) {
    if (code === 'INVALID_START_TIME') return 'Start time must use 24-hour HH:mm format.';
    if (code === 'INVALID_DURATION') return 'Duration must be an integer between 1 and 1440 minutes.';
    if (code === 'CROSSES_MIDNIGHT') return 'Ordinary stops must finish on the same calendar day.';
    return 'Invalid schedule timing.';
  }
  if (code === 'INVALID_START_TIME') return '开始时间必须使用 24 小时 HH:mm 格式。';
  if (code === 'INVALID_DURATION') return '停留时长必须是 1–1440 分钟的整数。';
  if (code === 'CROSSES_MIDNIGHT') return '普通地点不能跨越午夜；过夜安排应建模为明确的 anchor。';
  return '行程时段无效。';
}

export function PlaceTimingModal({
  open,
  place,
  dayOtherPlaces = [],
  onClose,
  onSave,
  language = 'zh',
}: PlaceTimingModalProps) {
  const zh = language === 'zh';
  const [startTime, setStartTime] = useState<string>(() => place?.scheduled_start || '');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>(() => place?.duration_minutes || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const normalizedDuration = typeof durationMinutes === 'number' ? durationMinutes : undefined;
  const timingErrors = useMemo(
    () => validatePlannerTiming(
      startTime || undefined,
      normalizedDuration,
      { allowCrossMidnight: Boolean(place?.is_anchor) },
    ).filter((issue) => issue.severity === 'error'),
    [normalizedDuration, place?.is_anchor, startTime],
  );

  const computedEndTime = useMemo(
    () => getScheduledEndTime(startTime || undefined, normalizedDuration),
    [startTime, normalizedDuration],
  );

  const hoursWarning = useMemo(() => {
    if (!place?.open_hours || !place.scheduled_date) return null;
    const result = checkOpeningHoursCollision(place.open_hours, place.scheduled_date, place.preferred_window);
    return result.isCollision ? result.reason : null;
  }, [place]);

  const overlapWarning = useMemo(() => {
    if (!place?.scheduled_date || !startTime || !normalizedDuration) return null;
    const prospective: PlannerTripPlace = {
      ...place,
      state: 'scheduled',
      scheduled_start: startTime,
      duration_minutes: normalizedDuration,
    };
    const overlap = findPlannerTimeOverlaps([...dayOtherPlaces, prospective], place.scheduled_date)
      .find((item) => item.fromId === place.id || item.toId === place.id);
    if (!overlap) return null;
    return zh
      ? `所选时段与【${overlap.fromId === place.id ? overlap.toTitle : overlap.fromTitle}】存在时间重叠（${overlap.fromTime} / ${overlap.toTime}）。`
      : `Selected time overlaps ${overlap.fromId === place.id ? overlap.toTitle : overlap.fromTitle} (${overlap.fromTime} / ${overlap.toTime}).`;
  }, [dayOtherPlaces, normalizedDuration, place, startTime, zh]);

  if (!open || !place) return null;

  const handleSave = async () => {
    if (timingErrors.length > 0) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(place.id, {
        scheduled_start: startTime.trim() || undefined,
        duration_minutes: normalizedDuration,
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(place.id, { scheduled_start: undefined, duration_minutes: undefined });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-base font-bold text-stone-900"><span>🕒</span><span>{zh ? '调整行程时间' : 'Adjust Schedule Timing'}</span></h2>
            <p className="mt-0.5 max-w-xs truncate text-xs font-medium text-stone-500">{place.title} · {place.scheduled_date}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={zh ? '关闭' : 'Close'}>✕</button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-700">{zh ? '1. 开始时间 (24小时制)' : '1. Start Time (24-hour)'}</label>
          <div className="flex items-center gap-2">
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 shadow-2xs focus:border-stone-900 focus:outline-none" />
            {startTime ? <button type="button" onClick={() => setStartTime('')} className="rounded-lg border border-stone-200 px-2.5 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50">{zh ? '清空' : 'Clear'}</button> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_START_TIMES.map((item) => <button key={item.value} type="button" onClick={() => setStartTime(item.value)} className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${startTime === item.value ? 'bg-stone-900 font-semibold text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{zh ? item.labelZh : item.labelEn}</button>)}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-700">{zh ? '2. 停留 / 游览耗时' : '2. Visit Duration'}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="1440"
              step="5"
              placeholder={zh ? '例如 90' : 'e.g. 90'}
              value={durationMinutes}
              onChange={(event) => {
                const value = event.target.value;
                setDurationMinutes(value === '' ? '' : Number(value));
              }}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 shadow-2xs focus:border-stone-900 focus:outline-none"
            />
            <span className="text-xs font-medium text-stone-500">{zh ? '分钟' : 'mins'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_DURATIONS.map((item) => <button key={item.minutes} type="button" onClick={() => setDurationMinutes(item.minutes)} className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${durationMinutes === item.minutes ? 'bg-stone-900 font-semibold text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{zh ? item.labelZh : item.labelEn}</button>)}
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-stone-700">{zh ? '📅 日历投影预览' : '📅 Calendar Projection'}</span>
            {startTime && computedEndTime ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">VEVENT</span> : <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">{zh ? 'date-only' : 'date-only'}</span>}
          </div>
          <p className="font-mono text-sm font-semibold text-stone-800">{startTime && computedEndTime ? `${place.scheduled_date} ${startTime} - ${computedEndTime}` : `${place.scheduled_date} (${zh ? '日期级任务' : 'date-only task'})`}</p>
          <p className="text-[11px] leading-relaxed text-stone-500">{zh ? '开始时间与时长都明确时才生成具体时间块；订阅日历将在客户端下一次刷新时更新。' : 'A timed block is projected only when both start time and duration are explicit; subscribed calendars update on their next client refresh.'}</p>
        </div>

        {timingErrors.length > 0 ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">{timingErrors.map((issue) => <p key={issue.code}>{timingIssueText(issue.code, zh)}</p>)}</div> : null}

        {hoursWarning ? <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900"><span className="text-base leading-none">⚠️</span><div className="flex-1"><span className="font-semibold">{zh ? '营业日 / 偏好时段提示:' : 'Opening day / preferred-window warning:'}</span><p className="mt-0.5 text-[11px] text-amber-800">{hoursWarning}</p></div></div> : null}
        {overlapWarning ? <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900"><span className="text-base leading-none">⚠️</span><div className="flex-1"><span className="font-semibold">{zh ? '时段重叠预警:' : 'Time Overlap Warning:'}</span><p className="mt-0.5 text-[11px] text-rose-800">{overlapWarning}</p></div></div> : null}
        {saveError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">{saveError}</div> : null}

        <div className="flex items-center justify-between border-t border-stone-100 pt-2">
          <button type="button" onClick={() => void handleClear()} disabled={saving || (!place.scheduled_start && !place.duration_minutes)} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40">{zh ? '清除时间' : 'Clear Timing'}</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">{zh ? '取消' : 'Cancel'}</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || timingErrors.length > 0} className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50">{saving ? '…' : (zh ? '保存时段' : 'Save Timing')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
''',
)

# 6) PlannerHome: canonical re-read for projection, same overlap helper in UI, truthful sync wording.
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    "import { getScheduledEndTime } from '@/domain/planner-schedule';\n",
    "import { findPlannerTimeOverlaps, getScheduledEndTime } from '@/domain/planner-schedule';\n",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    "const fileName = await plannerRepository.saveTripICalMarkdown(selectedTrip, places);",
    "const fileName = await plannerRepository.saveTripICalMarkdown(selectedTrip.id);",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    "? `已成功保存行程单至 Trips/${fileName}，Obsidian iCal Pro 插件将自动索引并同步至 Google Calendar！`\n          : `Saved itinerary to Trips/${fileName} for Obsidian iCal Pro plugin!`,",
    "? `已更新 Trips/${fileName} 日历投影；订阅日历将在客户端下一次刷新时更新。`\n          : `Updated Trips/${fileName}; subscribed calendars will update on their next client refresh.`,",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    "  }, [selectedTrip, places, zh]);\n\n  const copyItineraryText",
    "  }, [selectedTrip, zh]);\n\n  const copyItineraryText",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    "title={zh ? '一键生成并保存 iCal Pro 行程单至 Vault 的 Trips/ 目录（由 iCal Pro 插件直接同步 Google Calendar）' : 'Save iCal Pro itinerary to Vault (Trips/) for calendar sync'}",
    "title={zh ? '从当前 Planner/Vault 权威状态重新生成 iCal Pro 日历投影' : 'Regenerate the iCal Pro projection from canonical Planner/Vault state'}",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    "title={zh ? '点击设置/修改此站的开始时间与停留时长（自动投影至 Google Calendar）' : 'Click to adjust start time & duration for Google Calendar sync'}",
    "title={zh ? '设置此站的开始时间与停留时长；日历投影由 Planner 权威状态生成' : 'Set start time and duration; calendar output is derived from Planner state'}",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    """  const dayCollisions = useMemo(() => {\n    return checkDayScheduleCollisions(tripPlaces, activeDate);\n  }, [tripPlaces, activeDate]);\n\n""",
    """  const dayCollisions = useMemo(() => {\n    return checkDayScheduleCollisions(tripPlaces, activeDate);\n  }, [tripPlaces, activeDate]);\n\n  const dayTimeOverlaps = useMemo(() => {\n    return findPlannerTimeOverlaps(tripPlaces, activeDate);\n  }, [tripPlaces, activeDate]);\n\n""",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    "{dayCollisions.isOverloaded || dayCollisions.longTransits.length > 0 ? (",
    "{dayCollisions.isOverloaded || dayCollisions.longTransits.length > 0 || dayTimeOverlaps.length > 0 ? (",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    """            <div className=\"mx-4 mt-2 space-y-1\">\n              {dayCollisions.isOverloaded ? (\n""",
    """            <div className=\"mx-4 mt-2 space-y-1\">\n              {dayTimeOverlaps.map((overlap) => (\n                <div key={`${overlap.fromId}-${overlap.toId}`} className=\"flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-900 shadow-2xs font-medium\">\n                  <span>⚠️</span>\n                  <span>{zh ? `${overlap.fromTitle} 与 ${overlap.toTitle} 时段重叠（${overlap.fromTime} / ${overlap.toTime}）` : `${overlap.fromTitle} overlaps ${overlap.toTitle} (${overlap.fromTime} / ${overlap.toTime})`}</span>\n                </div>\n              ))}\n              {dayCollisions.isOverloaded ? (\n""",
)
replace_exact(
    "src/components/planner/PlannerHome.tsx",
    """                  const col = dayCollisions.placeCollisions[place.id] || checkOpeningHoursCollision(place.open_hours, activeDate, place.preferred_window);\n                  const scheduledEnd = getScheduledEndTime(place.scheduled_start, place.duration_minutes);\n""",
    """                  const timeOverlap = dayTimeOverlaps.find((overlap) => overlap.fromId === place.id || overlap.toId === place.id);\n                  const col = timeOverlap\n                    ? { isCollision: true, reason: zh ? '与当天其它地点存在时间重叠' : 'Overlaps another timed stop on this day' }\n                    : dayCollisions.placeCollisions[place.id] || checkOpeningHoursCollision(place.open_hours, activeDate, place.preferred_window);\n                  const scheduledEnd = getScheduledEndTime(place.scheduled_start, place.duration_minutes);\n""",
)

# 7) Prompt presets remain preferences, not fabricated facts.
replace_exact(
    "docs/AI_PLANNER_MCP.md",
    "将观景台、日落机位、海滩/地标精准安排在日落前 1 小时至蓝调时刻（约 17:00~18:30）；",
    "先根据目的地与日期确认当地当天真实日落时间，再将观景台、海滩/地标安排在日落前约 1 小时至蓝调时刻；如果无法确认日落时间，不要猜固定时刻；",
)

write(
    "tasks/todo.md",
    r'''# Planner Timing UX — PR #129

## Completed

- [x] Add manual `scheduled_start` + `duration_minutes` editing without creating a second time authority.
- [x] Keep all exact timing validation and overlap detection in `src/domain/planner-schedule.ts`.
- [x] Detect nested/all-pair overlaps, not only adjacent sorted intervals.
- [x] Reuse the same overlap facts in Web and MCP trip diagnostics.
- [x] Reject invalid time/duration and ordinary cross-midnight manual writes at repository boundary.
- [x] Re-read canonical Planner/Vault state before writing `.itinerary.md`.
- [x] Keep iCal Pro as one-way projection; calendar client refresh timing is external.
- [x] Make the timing modal usable on small/mobile viewports.
- [x] Keep scenario prompts as preferences; do not fabricate sunset time or missing schedule facts.

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
''',
)

# 8) This PR changes packaged MCP behavior, so publish it as a patch release.
package_path = ROOT / "packages/mcp/package.json"
package_json = json.loads(package_path.read_text(encoding="utf-8"))
package_json["version"] = "0.3.1"
package_path.write_text(json.dumps(package_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
replace_exact(
    "packages/mcp/src/index.mjs",
    "const SERVER_VERSION = '0.3.0';",
    "const SERVER_VERSION = '0.3.1';",
)
server_path = ROOT / "server.json"
server_json = json.loads(server_path.read_text(encoding="utf-8"))
server_json["version"] = "0.3.1"
server_json["packages"][0]["version"] = "0.3.1"
server_path.write_text(json.dumps(server_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("PR #129 refinement applied successfully")
