import {
  checkOpeningHoursCollision,
  isTransitHubPlace,
  listTripDates,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
} from './planner';
import { materializePlannerScheduledPlaces, sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripVisit } from './planner-visits';

export interface PlannerScheduleProposalItem {
  visit_id?: string;
  place_id: string;
  date: string;
  start?: string;
  sort_order: number;
  duration_minutes?: number;
}

export interface PlannerScheduleIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  visit_id?: string;
  place_id?: string;
}

export interface PlannerScheduleEvaluation {
  valid: boolean;
  issues: PlannerScheduleIssue[];
  visits: PlannerTripVisit[];
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

export const PLANNER_CLOCK_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOCK_RE = PLANNER_CLOCK_RE;

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
  places: PlannerScheduledPlace[],
  date: string,
): PlannerTimeOverlap[] {
  const timed = places
    .filter((place) => place.scheduled_date === date)
    .map((place) => {
      const start = plannerClockToMinutes(place.scheduled_start);
      if (start === null || !Number.isInteger(place.duration_minutes) || !place.duration_minutes || place.duration_minutes <= 0) {
        return null;
      }
      return { place, start, end: start + place.duration_minutes };
    })
    .filter((item): item is { place: PlannerScheduledPlace; start: number; end: number } => item !== null)
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

export interface PlannerTimelineStopItem {
  type: 'stop';
  id: string;
  visit_id: string;
  place_id: string;
  title: string;
  start?: string;
  end?: string;
  duration_minutes?: number;
  crosses_midnight: boolean;
  locked: boolean;
  is_anchor: boolean;
  is_inferred_start?: boolean;
  inferred_start?: string;
}

export interface PlannerTimelineTravelItem {
  type: 'travel';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  mode: PlannerTripLeg['mode'];
  duration_minutes: number;
  distance_meters?: number;
  source: PlannerTripLeg['source'];
  start?: string;
  end?: string;
}

export interface PlannerTimelineGapItem {
  type: 'gap';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  start: string;
  end: string;
  duration_minutes: number;
}

export interface PlannerTimelineConflictItem {
  type: 'conflict';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  earliest_arrival?: string;
  next_start?: string;
  late_by_minutes: number;
}

export interface PlannerTimelineUnknownItem {
  type: 'unknown';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  reason: 'travel_time_missing' | 'schedule_time_missing';
}

export type PlannerExecutionTimelineItem =
  | PlannerTimelineStopItem
  | PlannerTimelineTravelItem
  | PlannerTimelineGapItem
  | PlannerTimelineConflictItem
  | PlannerTimelineUnknownItem;

export type PlannerExecutionTransitionItem = Exclude<PlannerExecutionTimelineItem, PlannerTimelineStopItem>;

export interface PlannerDayExecutionTimeline {
  date: string;
  status: PlannerDayFeasibilityStatus;
  valid: boolean;
  items: PlannerExecutionTimelineItem[];
}

function transitionKey(fromId: string, toId: string): string {
  return `${fromId}→${toId}`;
}

function formatClockWithinDay(totalMinutes: number): string | undefined {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) return undefined;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export interface PlannerEffectiveTiming {
  start?: string;
  end?: string;
  duration_minutes?: number;
  is_inferred_start: boolean;
  inferred_start?: string;
}

/**
 * Day-seed for inference: when a day has no fixed start at all, the chain
 * starts here (inferred) so every stop still gets an order instead of
 * collapsing into all-day tasks. Ticket logic — the first stop of an
 * unpinned day conventionally begins mid-morning.
 */
export const DEFAULT_INFERRED_DAY_START = '09:00';

function defaultStopDurationMinutes(place: PlannerScheduledPlace): number {
  return Number.isInteger(place.duration_minutes) && (place.duration_minutes as number) > 0
    ? (place.duration_minutes as number)
    : (isTransitHubPlace(place) ? 15 : 60);
}

export function calculateEffectiveDayTiming(
  places: PlannerScheduledPlace[],
  legs: PlannerTripLeg[],
  tripId?: string,
): Map<string, PlannerEffectiveTiming> {
  const result = new Map<string, PlannerEffectiveTiming>();
  const legByPair = new Map(
    legs
      .filter((leg) => !tripId || leg.trip_id === tripId)
      .map((leg) => [transitionKey(leg.from_place_id, leg.to_place_id), leg] as const),
  );

  let prevEffectiveEnd: string | undefined = undefined;
  const hasAnyManualStart = places.some((item) => Boolean(item.scheduled_start && CLOCK_RE.test(item.scheduled_start)));

  for (let index = 0; index < places.length; index += 1) {
    const place = places[index];
    const prevPlace = index > 0 ? places[index - 1] : undefined;
    const leg = prevPlace ? legByPair.get(transitionKey(prevPlace.place_id, place.place_id)) : undefined;

    const hasManualStart = Boolean(place.scheduled_start && CLOCK_RE.test(place.scheduled_start));
    let start: string | undefined = undefined;
    let isInferred = false;
    let inferredStart: string | undefined = undefined;

    // 1. Calculate potential inferred start from previous stop + leg
    if (prevEffectiveEnd && leg && Number.isInteger(leg.duration_minutes) && leg.duration_minutes >= 0) {
      const prevEndMin = plannerClockToMinutes(prevEffectiveEnd);
      if (prevEndMin !== null) {
        const arrivalMin = prevEndMin + leg.duration_minutes;
        inferredStart = formatClockWithinDay(arrivalMin);
      }
    }

    // 2. Priority: Manual start overrides inferred start
    if (hasManualStart) {
      start = place.scheduled_start;
      isInferred = false;
    } else if (inferredStart) {
      start = inferredStart;
      isInferred = true;
    } else if (index === 0 && !hasAnyManualStart) {
      // 3. Day seed: nothing fixed all day — start the chain here (inferred)
      // so every stop keeps an order instead of collapsing to all-day tasks.
      start = DEFAULT_INFERRED_DAY_START;
      isInferred = true;
      inferredStart = DEFAULT_INFERRED_DAY_START;
    }

    const defaultDuration = defaultStopDurationMinutes(place);
    const duration = Number.isInteger(place.duration_minutes) && place.duration_minutes && place.duration_minutes > 0
      ? place.duration_minutes
      : (start ? defaultDuration : undefined);

    const end = start && duration ? getScheduledEndTime(start, duration) ?? undefined : undefined;

    result.set(place.id, {
      start,
      end,
      duration_minutes: duration,
      is_inferred_start: isInferred,
      inferred_start: inferredStart,
    });

    // A stop running past midnight cannot seed same-day inference: the wrapped
    // end (e.g. 00:30) belongs to the next day, so the chain breaks here
    // instead of inferring a 00:50 arrival earlier the same day.
    const startMin = start ? plannerClockToMinutes(start) : null;
    prevEffectiveEnd = startMin !== null && duration && startMin + duration < 24 * 60 ? end : undefined;
  }

  // 4. Backward pass: a fixed start pulls earlier untimed stops into the chain
  // (stop start = next start − leg − own duration). Threads through any known
  // start so multi-anchor days stay continuous; stops before midnight stay unknown.
  let anchorMinutes: number | undefined = undefined;
  for (let index = places.length - 1; index >= 0; index -= 1) {
    const place = places[index];
    const entry = result.get(place.id);
    if (!entry) continue;
    const currentMinutes = plannerClockToMinutes(entry.start);
    if (currentMinutes !== null) {
      anchorMinutes = currentMinutes;
      continue;
    }
    if (anchorMinutes === undefined) continue;
    const nextPlace = places[index + 1];
    const leg = nextPlace ? legByPair.get(transitionKey(place.place_id, nextPlace.place_id)) : undefined;
    if (!leg || !Number.isInteger(leg.duration_minutes) || leg.duration_minutes < 0) {
      anchorMinutes = undefined;
      continue;
    }
    const stopDuration: number = defaultStopDurationMinutes(place);
    const backStart: number = anchorMinutes - leg.duration_minutes - stopDuration;
    if (backStart < 0) {
      anchorMinutes = undefined;
      continue;
    }
    const inferred = formatClockWithinDay(backStart);
    if (!inferred) {
      anchorMinutes = undefined;
      continue;
    }
    entry.start = inferred;
    entry.is_inferred_start = true;
    entry.inferred_start = inferred;
    entry.duration_minutes = stopDuration;
    entry.end = getScheduledEndTime(inferred, stopDuration) ?? undefined;
    anchorMinutes = backStart;
  }

  return result;
}

export function evaluatePlannerDayFeasibility(
  trip: PlannerTrip,
  places: PlannerScheduledPlace[],
  legs: PlannerTripLeg[],
  date: string,
): PlannerDayFeasibility {
  const dayPlaces = sortPlannerScheduledPlaces(
    places.filter((place) => place.trip_id === trip.id && place.scheduled_date === date),
  );
  const timingMap = calculateEffectiveDayTiming(dayPlaces, legs, trip.id);
  const legByPair = new Map(
    legs
      .filter((leg) => leg.trip_id === trip.id)
      .map((leg) => [transitionKey(leg.from_place_id, leg.to_place_id), leg] as const),
  );
  const transitions: PlannerTravelTransition[] = [];

  for (let index = 0; index < dayPlaces.length - 1; index += 1) {
    const from = dayPlaces[index];
    const to = dayPlaces[index + 1];
    const fromTiming = timingMap.get(from.id);
    const toTiming = timingMap.get(to.id);
    const leg = legByPair.get(transitionKey(from.place_id, to.place_id));

    if (!leg) {
      if (isTransitHubPlace(from) && isTransitHubPlace(to)) {
        // Intercity transit-to-transit: timing depends on ticket/schedule, omit local commute requirement
        const departureTime = fromTiming?.end;
        const departureMinutes = plannerClockToMinutes(departureTime);
        const nextStartMinutes = plannerClockToMinutes(toTiming?.start);
        if (departureMinutes !== null && nextStartMinutes !== null) {
          const slack = nextStartMinutes - departureMinutes;
          transitions.push({
            from_id: from.id,
            to_id: to.id,
            from_title: from.title,
            to_title: to.title,
            status: slack < 0 ? 'conflict' : 'ok',
            departure_time: departureTime ?? undefined,
            earliest_arrival: formatClockWithinDay(departureMinutes),
            next_start: toTiming?.start,
            slack_minutes: slack,
            late_by_minutes: slack < 0 ? Math.abs(slack) : undefined,
          });
        } else {
          transitions.push({
            from_id: from.id,
            to_id: to.id,
            from_title: from.title,
            to_title: to.title,
            status: 'ok',
            departure_time: departureTime ?? undefined,
            next_start: toTiming?.start,
          });
        }
        continue;
      }
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

    const departureTime = fromTiming?.end;
    const departureMinutes = plannerClockToMinutes(departureTime);
    const nextStartMinutes = plannerClockToMinutes(toTiming?.start);
    if (!Number.isInteger(leg.duration_minutes) || leg.duration_minutes < 0) {
      // Corrupt leg payload (the !leg case is handled above): never let NaN
      // or negative durations produce a bogus ok/conflict verdict.
      transitions.push({
        from_id: from.id,
        to_id: to.id,
        from_title: from.title,
        to_title: to.title,
        status: 'unknown',
        unknown_reason: 'travel_time_missing',
        leg,
        departure_time: departureTime ?? undefined,
        next_start: toTiming?.start,
      });
      continue;
    }
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
        next_start: toTiming?.start,
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
      next_start: toTiming?.start,
      slack_minutes: slack,
      late_by_minutes: slack < 0 ? Math.abs(slack) : undefined,
    });
  }

  const status: PlannerDayFeasibilityStatus = transitions.some((item) => item.status === 'conflict')
    ? 'conflict'
    : transitions.some((item) => item.status === 'unknown') ? 'unknown' : 'feasible';
  return { date, status, valid: status === 'feasible', transitions };
}

export function buildPlannerDayExecutionTimeline(
  trip: PlannerTrip,
  places: PlannerScheduledPlace[],
  legs: PlannerTripLeg[],
  date: string,
): PlannerDayExecutionTimeline {
  const dayPlaces = sortPlannerScheduledPlaces(
    places.filter((place) => place.trip_id === trip.id && place.scheduled_date === date),
  );
  const timingMap = calculateEffectiveDayTiming(dayPlaces, legs, trip.id);
  const feasibility = evaluatePlannerDayFeasibility(trip, places, legs, date);
  const transitionByPair = new Map(
    feasibility.transitions.map((transition) => [transitionKey(transition.from_id, transition.to_id), transition] as const),
  );
  const items: PlannerExecutionTimelineItem[] = [];

  for (let index = 0; index < dayPlaces.length; index += 1) {
    const place = dayPlaces[index];
    const timing = timingMap.get(place.id);
    const startMinutes = plannerClockToMinutes(timing?.start);
    const duration = timing?.duration_minutes;
    const end = timing?.end;

    items.push({
      type: 'stop',
      id: `stop:${place.id}`,
      visit_id: place.visit_id,
      place_id: place.place_id,
      title: place.title,
      start: timing?.start,
      end,
      duration_minutes: duration,
      crosses_midnight: startMinutes !== null && duration !== undefined && startMinutes + duration > 24 * 60,
      locked: Boolean(place.locked),
      is_anchor: Boolean(place.is_anchor),
      is_inferred_start: timing?.is_inferred_start,
      inferred_start: timing?.inferred_start,
    });

    const next = dayPlaces[index + 1];
    if (!next) continue;
    if (isTransitHubPlace(place) && isTransitHubPlace(next) && !transitionByPair.get(transitionKey(place.id, next.id))?.leg) {
      // Intercity transit-to-transit: do not calculate road travel time, leave empty (ticket-based)
      continue;
    }
    const transition = transitionByPair.get(transitionKey(place.id, next.id));
    if (!transition) {
      items.push({
        type: 'unknown', id: `unknown:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        reason: 'travel_time_missing',
      });
      continue;
    }

    if (transition.leg) {
      const travelEnd = transition.earliest_arrival
        ?? (transition.departure_time
          ? getScheduledEndTime(transition.departure_time, transition.leg.duration_minutes) ?? undefined
          : undefined);
      items.push({
        type: 'travel', id: `travel:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        mode: transition.leg.mode,
        duration_minutes: transition.leg.duration_minutes,
        distance_meters: transition.leg.distance_meters,
        source: transition.leg.source,
        start: transition.departure_time,
        end: travelEnd,
      });
    }

    if (
      transition.status === 'ok'
      && transition.slack_minutes !== undefined
      && transition.slack_minutes > 0
      && transition.earliest_arrival
      && transition.next_start
    ) {
      items.push({
        type: 'gap', id: `gap:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        start: transition.earliest_arrival,
        end: transition.next_start,
        duration_minutes: transition.slack_minutes,
      });
    } else if (transition.status === 'conflict') {
      items.push({
        type: 'conflict', id: `conflict:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        earliest_arrival: transition.earliest_arrival,
        next_start: transition.next_start,
        late_by_minutes: transition.late_by_minutes ?? 0,
      });
    } else if (transition.status === 'unknown') {
      items.push({
        type: 'unknown', id: `unknown:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        reason: transition.unknown_reason ?? 'schedule_time_missing',
      });
    }
  }

  return { date, status: feasibility.status, valid: feasibility.valid, items };
}

export type PlannerDayOverallStatus = 'feasible' | 'warning' | 'conflict' | 'unknown';

export type PlannerLoadLevel = 'easy' | 'moderate' | 'tight' | 'heavy';

export interface PlannerDayLoadTopContributor {
  kind: 'stop' | 'transit';
  title: string;
  minutes: number;
}

export interface PlannerDayLoad {
  score: number;
  level: PlannerLoadLevel;
  /** 游览/活动分钟：只计浏览类停留，stay 住宿休息不计入. */
  activity_minutes: number;
  transit_minutes: number;
  stop_count: number;
  span_minutes: number | null;
  longest_stretch_minutes: number | null;
  lunch_ok: boolean;
  dinner_ok: boolean;
  top_contributor: PlannerDayLoadTopContributor | null;
  suggestion: string | null;
}

// Load weights: activity dominates, transit/stops/span share the rest.
// activity > 600min floors the score at 80 to preserve the legacy overload rule.
const LOAD_WEIGHTS = { activity: 50, transit: 20, stops: 15, span: 15 };
const LOAD_MEAL_WINDOWS = { lunch: [11 * 60 + 30, 13 * 60 + 30], dinner: [17 * 60 + 30, 19 * 60 + 30] } as const;
const LOAD_MEAL_MIN_FREE = 45;
const LOAD_STRETCH_TOLERANCE = 20;

export const PLANNER_LOAD_LEVEL_LABEL: Record<PlannerLoadLevel, string> = {
  easy: '宽松',
  moderate: '适中',
  tight: '紧凑',
  heavy: '超载',
};

function freeOverlapMinutes(free: Array<{ s: number; e: number }>, from: number, to: number): number {
  let total = 0;
  for (const gap of free) {
    total += Math.max(0, Math.min(gap.e, to) - Math.max(gap.s, from));
  }
  return total;
}

export function calculateDayLoad(
  dayPlaces: PlannerScheduledPlace[],
  legs: PlannerTripLeg[],
  tripId: string,
  timeline: PlannerDayExecutionTimeline,
): PlannerDayLoad {
  const ordered = sortPlannerScheduledPlaces(dayPlaces);
  const kindByPlaceId = new Map(ordered.map((p) => [p.place_id, p.kind] as const));
  // 住宿是休息不是游览：activity 只计非 stay 停留.
  const activity = ordered.reduce(
    (sum, p) => sum + (p.kind === 'stay' ? 0 : (Number.isInteger(p.duration_minutes) && (p.duration_minutes ?? 0) > 0 ? (p.duration_minutes ?? 0) : 0)),
    0,
  );

  const legByPair = new Map(
    legs.filter((leg) => leg.trip_id === tripId)
      .map((leg) => [transitionKey(leg.from_place_id, leg.to_place_id), leg] as const),
  );
  let transit = 0;
  let topTransit: PlannerDayLoadTopContributor | null = null;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const leg = legByPair.get(transitionKey(ordered[index].place_id, ordered[index + 1].place_id));
    const minutes = leg && Number.isInteger(leg.duration_minutes) && leg.duration_minutes > 0 ? leg.duration_minutes : 0;
    transit += minutes;
    if (minutes > 0 && (!topTransit || minutes > topTransit.minutes)) {
      topTransit = { kind: 'transit', title: `${ordered[index].title} → ${ordered[index + 1].title}`, minutes };
    }
  }

  // Busy intervals from effective timeline times (stops + travel).
  const busy: Array<{ s: number; e: number }> = [];
  for (const item of timeline.items) {
    if (item.type !== 'stop' && item.type !== 'travel') continue;
    const s = plannerClockToMinutes(item.start);
    const e = plannerClockToMinutes(item.end);
    if (s !== null && e !== null && e > s) busy.push({ s, e });
  }
  busy.sort((a, b) => a.s - b.s);
  const merged: Array<{ s: number; e: number }> = [];
  for (const interval of busy) {
    const last = merged[merged.length - 1];
    if (last && interval.s <= last.e) last.e = Math.max(last.e, interval.e);
    else merged.push({ ...interval });
  }
  const free: Array<{ s: number; e: number }> = [];
  for (let index = 0; index + 1 < merged.length; index += 1) {
    if (merged[index + 1].s > merged[index].e) free.push({ s: merged[index].e, e: merged[index + 1].s });
  }
  const span = merged.length > 0 ? merged[merged.length - 1].e - merged[0].s : null;

  let longestStretch: number | null = merged.length > 0 ? 0 : null;
  let runStart: number | null = null;
  let runEnd: number | null = null;
  for (const interval of merged) {
    if (runStart === null || interval.s - (runEnd ?? 0) >= LOAD_STRETCH_TOLERANCE) {
      if (runStart !== null && longestStretch !== null) {
        longestStretch = Math.max(longestStretch, (runEnd ?? 0) - runStart);
      }
      runStart = interval.s;
      runEnd = interval.e;
    } else {
      runEnd = Math.max(runEnd ?? 0, interval.e);
    }
  }
  if (runStart !== null && longestStretch !== null) {
    longestStretch = Math.max(longestStretch, (runEnd ?? 0) - runStart);
  }

  let lunchOk = true;
  let dinnerOk = true;
  if (span !== null && merged.length > 0) {
    // 坐在餐厅里就是正餐：food 类停留与空闲缺口合并计入 45 分钟.
    const foodBusy: Array<{ s: number; e: number }> = [];
    for (const item of timeline.items) {
      if (item.type !== 'stop') continue;
      if (kindByPlaceId.get(item.place_id) !== 'food') continue;
      const s = plannerClockToMinutes(item.start);
      const e = plannerClockToMinutes(item.end);
      if (s !== null && e !== null && e > s) foodBusy.push({ s, e });
    }
    // food 停留已在 merged 忙碌段内，不在 free 里，不会重复计算.
    const mealCoveredMinutes = (from: number, to: number) =>
      freeOverlapMinutes(free, from, to) + freeOverlapMinutes(foodBusy, from, to);
    // Only call out a meal when the day actually spans the whole meal window;
    // a morning-only half day ending at noon needs no lunch warning.
    const dayStart = merged[0].s;
    const dayEnd = merged[merged.length - 1].e;
    if (dayStart <= LOAD_MEAL_WINDOWS.lunch[0] && dayEnd >= LOAD_MEAL_WINDOWS.lunch[1]) {
      lunchOk = mealCoveredMinutes(...LOAD_MEAL_WINDOWS.lunch) >= LOAD_MEAL_MIN_FREE;
    }
    if (dayStart <= LOAD_MEAL_WINDOWS.dinner[0] && dayEnd >= LOAD_MEAL_WINDOWS.dinner[1]) {
      dinnerOk = mealCoveredMinutes(...LOAD_MEAL_WINDOWS.dinner) >= LOAD_MEAL_MIN_FREE;
    }
  }

  let topStop: PlannerDayLoadTopContributor | null = null;
  for (const place of ordered) {
    if (place.kind === 'stay') continue;
    const minutes = place.duration_minutes ?? 0;
    if (minutes > 0 && (!topStop || minutes > topStop.minutes)) {
      topStop = { kind: 'stop', title: place.title, minutes };
    }
  }
  const top = topTransit && (!topStop || topTransit.minutes >= topStop.minutes) ? topTransit : topStop;

  let score = (Math.min(activity, 900) / 600) * LOAD_WEIGHTS.activity
    + (Math.min(transit, 300) / 180) * LOAD_WEIGHTS.transit
    + (Math.min(ordered.length, 12) / 8) * LOAD_WEIGHTS.stops
    + (span !== null ? (Math.min(span, 960) / 720) * LOAD_WEIGHTS.span : 0);
  score = Math.min(100, Math.round(score));
  if (activity > 600) score = Math.max(score, 80);
  const level: PlannerLoadLevel = score >= 80 ? 'heavy' : score >= 60 ? 'tight' : score >= 35 ? 'moderate' : 'easy';

  const notes: string[] = [];
  if ((level === 'tight' || level === 'heavy') && top) {
    notes.push(top.kind === 'stop'
      ? `「${top.title}」约 ${top.minutes} 分钟占全天最高，移出当天或缩短停留可明显减负`
      : `「${top.title}」交通约 ${top.minutes} 分钟，考虑调整顺序或更换交通方式`);
  }
  if (!lunchOk) notes.push('午餐时段缺少 45 分钟以上空闲');
  if (!dinnerOk) notes.push('晚餐时段缺少 45 分钟以上空闲');

  return {
    score,
    level,
    activity_minutes: activity,
    transit_minutes: transit,
    stop_count: ordered.length,
    span_minutes: span,
    longest_stretch_minutes: longestStretch,
    lunch_ok: lunchOk,
    dinner_ok: dinnerOk,
    top_contributor: top,
    suggestion: notes.length > 0 ? notes.join('；') : null,
  };
}

export interface PlannerOpeningHoursIssue {
  visit_id: string;
  place_id: string;
  title: string;
  reason: string;
}

export interface PlannerDayMissingFact {
  from_id?: string;
  to_id?: string;
  visit_id?: string;
  place_id?: string;
  title: string;
  reason: 'travel_time_missing' | 'schedule_time_missing' | 'duration_missing';
}

export interface PlannerDayAssessment {
  date: string;
  status: PlannerDayOverallStatus;
  timeline: PlannerDayExecutionTimeline;
  time_overlaps: PlannerTimeOverlap[];
  travel_conflicts: PlannerTimelineConflictItem[];
  opening_hours_warnings: PlannerOpeningHoursIssue[];
  missing_facts: PlannerDayMissingFact[];
  load: PlannerDayLoad;
  is_overloaded: boolean;
  overload_reason?: string;
  total_activity_minutes: number;
  scheduled_places: PlannerScheduledPlace[];
}

export function evaluatePlannerDay(
  trip: PlannerTrip,
  places: PlannerScheduledPlace[],
  legs: PlannerTripLeg[],
  date: string,
): PlannerDayAssessment {
  const dayPlaces = sortPlannerScheduledPlaces(
    places.filter((place) => place.trip_id === trip.id && place.scheduled_date === date),
  );
  const timeline = buildPlannerDayExecutionTimeline(trip, dayPlaces, legs, date);
  const time_overlaps = findPlannerTimeOverlaps(dayPlaces, date);
  const travel_conflicts = timeline.items.filter(
    (item): item is PlannerTimelineConflictItem => item.type === 'conflict',
  );

  const opening_hours_warnings: PlannerOpeningHoursIssue[] = [];
  let total_activity_minutes = 0;

  for (const place of dayPlaces) {
    const stop = timeline.items.find(
      (item): item is PlannerTimelineStopItem => item.type === 'stop' && (item.visit_id === place.visit_id || (item.visit_id === undefined && item.place_id === place.place_id)),
    );
    const col = checkOpeningHoursCollision(place.open_hours, date, place.preferred_window, stop?.start, stop?.end);
    if (col.isCollision) {
      opening_hours_warnings.push({
        visit_id: place.visit_id,
        place_id: place.place_id,
        title: place.title,
        reason: col.reason || 'Possible opening-hours conflict',
      });
    }
    if (place.kind !== 'stay' && place.duration_minutes && place.duration_minutes > 0) {
      total_activity_minutes += place.duration_minutes;
    }
  }

  const missing_facts: PlannerDayMissingFact[] = [];
  for (const item of timeline.items) {
    if (item.type === 'unknown') {
      missing_facts.push({
        from_id: item.from_id,
        to_id: item.to_id,
        title: `${item.from_title} → ${item.to_title}`,
        reason: item.reason,
      });
    }
  }

  for (const place of dayPlaces) {
    if (place.scheduled_start && !place.duration_minutes) {
      missing_facts.push({
        visit_id: place.visit_id,
        place_id: place.place_id,
        title: place.title,
        reason: 'duration_missing',
      });
    }
  }

  const load = calculateDayLoad(dayPlaces, legs, trip.id, timeline);
  const is_overloaded = load.level === 'heavy';
  const overload_reason = is_overloaded
    ? `全天负荷 ${load.score} 分（${PLANNER_LOAD_LEVEL_LABEL[load.level]}）：游览约 ${(load.activity_minutes / 60).toFixed(1)} 小时，交通约 ${load.transit_minutes} 分钟，共 ${load.stop_count} 站${load.suggestion ? `；${load.suggestion}` : ''}`
    : undefined;

  let status: PlannerDayOverallStatus = 'feasible';
  if (time_overlaps.length > 0 || travel_conflicts.length > 0) {
    status = 'conflict';
  } else if (timeline.status === 'unknown' || missing_facts.length > 0) {
    status = 'unknown';
  } else if (opening_hours_warnings.length > 0 || is_overloaded) {
    status = 'warning';
  } else {
    status = 'feasible';
  }

  return {
    date,
    status,
    timeline,
    time_overlaps,
    travel_conflicts,
    opening_hours_warnings,
    missing_facts,
    load,
    is_overloaded,
    overload_reason,
    total_activity_minutes,
    scheduled_places: dayPlaces,
  };
}

function isHardConstraint(visit: PlannerTripVisit): boolean {
  return Boolean(visit.locked || visit.is_anchor);
}

function sameOptional<T>(next: T | undefined, current: T | undefined): boolean {
  return next === undefined || next === current;
}

export function evaluatePlannerScheduleProposal(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  proposal: PlannerScheduleProposalItem[],
): PlannerScheduleEvaluation {
  const issues: PlannerScheduleIssue[] = [];
  const dates = new Set(listTripDates(trip.start_date, trip.end_date));
  const tripPlaces = places.filter((place) => place.trip_id === trip.id && place.state !== 'dropped');
  const placeById = new Map(tripPlaces.map((place) => [place.id, place] as const));
  const tripVisits = visits.filter((visit) => visit.trip_id === trip.id);
  const visitById = new Map(tripVisits.map((visit) => [visit.id, visit] as const));
  const proposed = new Map<string, PlannerTripVisit>();
  const seen = new Set<string>();

  for (const item of proposal) {
    const visitId = item.visit_id?.trim();
    if (!visitId) {
      issues.push({ severity: 'error', code: 'VISIT_ID_REQUIRED', place_id: item.place_id, message: 'A prepared schedule proposal requires a visit_id for each occurrence.' });
      continue;
    }
    if (seen.has(visitId)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_VISIT', visit_id: visitId, place_id: item.place_id, message: 'A visit appears more than once in the schedule proposal.' });
      continue;
    }
    seen.add(visitId);

    const place = placeById.get(item.place_id);
    if (!place) {
      issues.push({ severity: 'error', code: 'PLACE_NOT_FOUND', visit_id: visitId, place_id: item.place_id, message: 'The proposed place does not belong to this trip.' });
      continue;
    }
    const existing = visitById.get(visitId);
    if (existing && existing.place_id !== item.place_id) {
      issues.push({ severity: 'error', code: 'VISIT_PLACE_MISMATCH', visit_id: visitId, place_id: item.place_id, message: 'An existing visit cannot be reassigned to another place.' });
      continue;
    }
    if (!dates.has(item.date)) {
      issues.push({ severity: 'error', code: 'DATE_OUTSIDE_TRIP', visit_id: visitId, place_id: item.place_id, message: `${item.date} is outside the trip date range.` });
    }
    if (!Number.isInteger(item.sort_order) || item.sort_order < 0) {
      issues.push({ severity: 'error', code: 'INVALID_SORT_ORDER', visit_id: visitId, place_id: item.place_id, message: 'sort_order must be a non-negative integer.' });
    }

    const effectiveDuration = item.duration_minutes ?? existing?.duration_minutes ?? place.duration_minutes;

    if (existing && isHardConstraint(existing)) {
      const unchanged = item.date === existing.date
        && item.sort_order === existing.sort_order
        && sameOptional(item.start, existing.start)
        && sameOptional(item.duration_minutes, existing.duration_minutes);
      if (!unchanged) {
        issues.push({
          severity: 'error',
          code: 'HARD_CONSTRAINT_CHANGED',
          visit_id: visitId,
          place_id: item.place_id,
          message: `${place.title} has a locked/anchored visit that cannot be moved by an AI schedule proposal.`,
        });
      }
      // Unchanged hard constraints are grandfathered without re-validation:
      // legacy data (e.g. a locked overnight span from before midnight rules)
      // must not make every identical no-op proposal invalid.
      proposed.set(visitId, existing);
      continue;
    }

    issues.push(...validatePlannerTiming(
      item.start,
      effectiveDuration,
      { allowCrossMidnight: Boolean(existing?.is_anchor) },
    ).map((issue) => ({ ...issue, visit_id: visitId, place_id: item.place_id })));

    proposed.set(visitId, {
      schema_version: '0.1',
      type: 'trip_visit',
      id: visitId,
      trip_id: trip.id,
      place_id: item.place_id,
      date: item.date,
      start: item.start,
      duration_minutes: effectiveDuration,
      sort_order: item.sort_order,
      locked: existing?.locked ?? false,
      is_anchor: existing?.is_anchor ?? false,
      anchor_type: existing?.anchor_type,
      created_at: existing?.created_at ?? '',
      updated_at: existing?.updated_at,
    });
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    return { valid: false, issues, visits };
  }

  const nextVisits = [
    ...visits.filter((visit) => !proposed.has(visit.id)),
    ...proposed.values(),
  ];
  const scheduled = materializePlannerScheduledPlaces(places, nextVisits);

  for (const scheduledVisit of scheduled) {
    if (scheduledVisit.trip_id !== trip.id) continue;
    if (scheduledVisit.scheduled_start && !scheduledVisit.duration_minutes) {
      issues.push({
        severity: 'warning',
        code: 'TIMED_ITEM_MISSING_DURATION',
        visit_id: scheduledVisit.visit_id,
        place_id: scheduledVisit.place_id,
        message: `${scheduledVisit.title} has a start time but no duration; calendar projection will remain date-only until duration is known.`,
      });
    }
    const hours = checkOpeningHoursCollision(
      scheduledVisit.open_hours,
      scheduledVisit.scheduled_date,
      scheduledVisit.preferred_window,
      scheduledVisit.scheduled_start,
      scheduledVisit.scheduled_start && scheduledVisit.duration_minutes
        ? getScheduledEndTime(scheduledVisit.scheduled_start, scheduledVisit.duration_minutes) ?? undefined
        : undefined,
    );
    if (hours.isCollision) {
      issues.push({
        severity: 'warning',
        code: 'OPENING_HOURS_WARNING',
        visit_id: scheduledVisit.visit_id,
        place_id: scheduledVisit.place_id,
        message: hours.reason ?? 'Possible opening-hours conflict.',
      });
    }
  }

  for (const date of dates) {
    for (const overlap of findPlannerTimeOverlaps(scheduled, date)) {
      issues.push({
        severity: 'error',
        code: 'TIME_OVERLAP',
        visit_id: overlap.toId,
        message: `${date}: ${overlap.warning}`,
      });
    }
  }

  issues.push(...validatePlannerDaySortOrders(nextVisits, dates, trip.id));

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    visits: nextVisits,
  };
}

export function validatePlannerDaySortOrders(
  visits: PlannerTripVisit[],
  dates: Iterable<string>,
  tripId?: string,
): PlannerScheduleIssue[] {
  const issues: PlannerScheduleIssue[] = [];
  for (const date of dates) {
    const dayVisits = visits.filter((v) => (!tripId || v.trip_id === tripId) && v.date === date);
    if (dayVisits.length > 0) {
      const orders = dayVisits.map((v) => v.sort_order).sort((a, b) => a - b);
      const isContiguous = orders.every((val, idx) => val === idx);
      if (!isContiguous) {
        issues.push({
          severity: 'error',
          code: 'DISCONTINUOUS_SORT_ORDER',
          message: `${date}: daily sort_order must form a contiguous sequence [0..${dayVisits.length - 1}], received [${orders.join(', ')}].`,
        });
      }
    }
  }
  return issues;
}
