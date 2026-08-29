import {
  checkOpeningHoursCollision,
  listTripDates,
  sortPlannerPlaces,
  type PlannerTrip,
  type PlannerTripLeg,
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

export type PlannerTravelTransitionStatus = 'ok' | 'unknown' | 'conflict';
export type PlannerDayFeasibilityStatus = 'feasible' | 'unknown' | 'conflict';

export interface PlannerTravelTransition {
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  status: PlannerTravelTransitionStatus;
  unknown_reason?: 'travel_time_missing' | 'schedule_time_missing';
  leg?: PlannerTripLeg;
  departure_time?: string;
  earliest_arrival?: string;
  next_start?: string;
  slack_minutes?: number;
  late_by_minutes?: number;
}

export interface PlannerDayFeasibility {
  date: string;
  status: PlannerDayFeasibilityStatus;
  valid: boolean;
  transitions: PlannerTravelTransition[];
}

function transitionKey(fromId: string, toId: string): string {
  return `${fromId}→${toId}`;
}

function formatClockWithinDay(totalMinutes: number): string | undefined {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) return undefined;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function evaluatePlannerDayFeasibility(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  legs: PlannerTripLeg[],
  date: string,
): PlannerDayFeasibility {
  const dayPlaces = sortPlannerPlaces(
    places.filter((place) => place.trip_id === trip.id && place.state === 'scheduled' && place.scheduled_date === date),
  );
  const legByPair = new Map(
    legs
      .filter((leg) => leg.trip_id === trip.id)
      .map((leg) => [transitionKey(leg.from_place_id, leg.to_place_id), leg] as const),
  );
  const transitions: PlannerTravelTransition[] = [];

  for (let index = 0; index < dayPlaces.length - 1; index += 1) {
    const from = dayPlaces[index];
    const to = dayPlaces[index + 1];
    const leg = legByPair.get(transitionKey(from.id, to.id));
    if (!leg) {
      transitions.push({
        from_id: from.id,
        to_id: to.id,
        from_title: from.title,
        to_title: to.title,
        status: 'unknown',
        unknown_reason: 'travel_time_missing',
      });
      continue;
    }

    const departureTime = getScheduledEndTime(from.scheduled_start, from.duration_minutes);
    const departureMinutes = plannerClockToMinutes(departureTime);
    const nextStartMinutes = plannerClockToMinutes(to.scheduled_start);
    if (departureMinutes === null || nextStartMinutes === null) {
      transitions.push({
        from_id: from.id,
        to_id: to.id,
        from_title: from.title,
        to_title: to.title,
        status: 'unknown',
        unknown_reason: 'schedule_time_missing',
        leg,
        departure_time: departureTime ?? undefined,
        next_start: to.scheduled_start,
      });
      continue;
    }

    const arrivalMinutes = departureMinutes + leg.duration_minutes;
    const slack = nextStartMinutes - arrivalMinutes;
    transitions.push({
      from_id: from.id,
      to_id: to.id,
      from_title: from.title,
      to_title: to.title,
      status: slack < 0 ? 'conflict' : 'ok',
      leg,
      departure_time: departureTime ?? undefined,
      earliest_arrival: formatClockWithinDay(arrivalMinutes),
      next_start: to.scheduled_start,
      slack_minutes: slack,
      late_by_minutes: slack < 0 ? Math.abs(slack) : undefined,
    });
  }

  const status: PlannerDayFeasibilityStatus = transitions.some((item) => item.status === 'conflict')
    ? 'conflict'
    : transitions.some((item) => item.status === 'unknown') ? 'unknown' : 'feasible';
  return { date, status, valid: status === 'feasible', transitions };
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

    const effectiveDuration = item.duration_minutes ?? existing.duration_minutes;
    issues.push(...validatePlannerTiming(
      item.scheduled_start,
      effectiveDuration,
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
      duration_minutes: effectiveDuration,
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
