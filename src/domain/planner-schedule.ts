import {
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
