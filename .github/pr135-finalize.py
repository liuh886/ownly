from pathlib import Path
import re

# Apply the already-staged web + execution transforms first.
exec(Path('.github/pr135-core.py').read_text())


def replace_between(text: str, start: str, end: str, replacement: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f'start marker not found: {start[:80]}')
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f'end marker not found: {end[:80]}')
    return text[:a] + replacement + text[b:]

# ── Planner schedule proposals: proposals mutate/create Visit occurrences, never Place facts.
p = Path('src/domain/planner-schedule.ts')
s = p.read_text()
s = s.replace(
"export interface PlannerScheduleProposalItem {\n  id: string;\n  scheduled_date: string;\n  scheduled_start?: string;\n  sort_order: number;\n  duration_minutes?: number;\n}\n",
"export interface PlannerScheduleProposalItem {\n  visit_id?: string;\n  place_id: string;\n  date: string;\n  start?: string;\n  sort_order: number;\n  duration_minutes?: number;\n}\n",
)
s = s.replace(
"export interface PlannerScheduleIssue {\n  severity: 'error' | 'warning';\n  code: string;\n  message: string;\n  place_id?: string;\n}\n\nexport interface PlannerScheduleEvaluation {\n  valid: boolean;\n  issues: PlannerScheduleIssue[];\n  places: PlannerTripPlace[];\n}\n",
"export interface PlannerScheduleIssue {\n  severity: 'error' | 'warning';\n  code: string;\n  message: string;\n  visit_id?: string;\n  place_id?: string;\n}\n\nexport interface PlannerScheduleEvaluation {\n  valid: boolean;\n  issues: PlannerScheduleIssue[];\n  visits: PlannerTripVisit[];\n}\n",
)
s = s.replace(
"import { sortPlannerScheduledPlaces, type PlannerScheduledPlace } from './planner-visits';",
"import { materializePlannerScheduledPlaces, sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripVisit } from './planner-visits';",
)
start = s.index('function isHardConstraint(')
new_tail = r'''function isHardConstraint(visit: PlannerTripVisit): boolean {
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
    issues.push(...validatePlannerTiming(
      item.start,
      effectiveDuration,
      { allowCrossMidnight: Boolean(existing?.is_anchor) },
    ).map((issue) => ({ ...issue, visit_id: visitId, place_id: item.place_id })));

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
      proposed.set(visitId, existing);
      continue;
    }

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

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    visits: nextVisits,
  };
}
'''
s = s[:start] + new_tail
p.write_text(s)

# ── Planner map: scheduled pins are Visit projections; candidate place remains reusable.
p = Path('src/components/planner/PlannerMap.tsx')
s = p.read_text()
s = s.replace("import type { PlannerTripPlace } from '@/domain/planner';", "import type { PlannerTripPlace } from '@/domain/planner';\nimport type { PlannerScheduledPlace } from '@/domain/planner-visits';")
s = s.replace("  scheduledPlaces: PlannerTripPlace[];", "  scheduledPlaces: PlannerScheduledPlace[];")
s = s.replace("  onUnschedulePlace: (place: PlannerTripPlace) => void;", "  onUnschedulePlace: (place: PlannerScheduledPlace) => void;")
s = s.replace("  place: PlannerTripPlace;", "  place: PlannerTripPlace | PlannerScheduledPlace;")
s = s.replace(
"  const selectedPlace = useMemo(() => {\n    return points.find((p) => p.place.id === selectedPlaceId)?.place ?? null;\n  }, [points, selectedPlaceId]);",
"  const selectedPoint = useMemo(() => points.find((point) => point.place.id === selectedPlaceId) ?? null, [points, selectedPlaceId]);\n  const selectedPlace = selectedPoint?.place ?? null;\n  const selectedScheduledPlace = selectedPoint?.isScheduled ? selectedPoint.place as PlannerScheduledPlace : null;",
)
s = s.replace("              {selectedPlace.scheduled_date ? (", "              {selectedScheduledPlace ? (")
s = s.replace("                    onUnschedulePlace(selectedPlace);", "                    onUnschedulePlace(selectedScheduledPlace);")
p.write_text(s)

# ── MCP write service: Visit files are the only scheduling writes.
p = Path('scripts/shared/ownly-write-service.ts')
s = p.read_text()
s = s.replace("import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';", "import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';")
s = s.replace("import { createPlannerTripVisit, plannerTripVisitFileName, type PlannerTripVisit } from '../../src/domain/planner-visits';", "import { createPlannerTripVisit, materializePlannerScheduledPlaces, plannerTripVisitFileName, sortPlannerScheduledPlaces, type PlannerTripVisit } from '../../src/domain/planner-visits';")

ops_start = s.index('  prepareSchedulePlace(')
ops_end = s.index('\n\n  prepareApplyTravelTimeOptimization(', ops_start)
new_ops = r'''  private plannerVisitEntry(visitId: string) {
    const entry = findPlannerEntry(listPlannerVisits(this.dataLocation), visitId);
    if (!entry) {
      throw new OwnlyMutationError(`Planner visit was not found: ${visitId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    return entry;
  }

  prepareAddVisit(placeId: string, date: string, sortOrder?: number, locked = false): PreparedOwnlyOperation {
    const placeEntry = this.plannerPlaceEntry(placeId);
    const place = placeEntry.frontmatter;
    if (place.state === 'dropped') throw new OwnlyMutationError('Dropped places cannot be scheduled.', 'INVALID_INPUT');
    const visits = listPlannerVisits(this.dataLocation).map((entry) => entry.frontmatter as PlannerTripVisit);
    const order = sortOrder ?? visits
      .filter((visit) => visit.trip_id === place.trip_id && visit.date === date)
      .reduce((max, visit) => Math.max(max, visit.sort_order), -1) + 1;
    const visit = createPlannerTripVisit(place, date, order, { locked }, this.now(), randomUUID());
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const fileName = plannerTripVisitFileName(visit.id);
    const filePath = join(directory, fileName);
    const expected = fingerprint(filePath);
    return this.prepare('planner_add_visit', { place: { id: place.id, title: place.title }, visit }, () => {
      assertUnchanged(filePath, expected);
      mkdirSync(directory, { recursive: true });
      writeFileSync(filePath, serializeMarkdownEntity(visit, ''), 'utf8');
      writeAgentLog(this.dataLocation, 'planner_add_visit', visit.id, null, visit);
      return { visit_id: visit.id, place_id: place.id, date: visit.date, sort_order: visit.sort_order };
    });
  }

  prepareRemoveVisit(visitId: string): PreparedOwnlyOperation {
    const entry = this.plannerVisitEntry(visitId);
    const before = entry.frontmatter as PlannerTripVisit;
    const expected = fingerprint(entry.filePath);
    return this.prepare('planner_remove_visit', { before, after: null }, () => {
      assertUnchanged(entry.filePath, expected);
      unlinkSync(entry.filePath);
      writeAgentLog(this.dataLocation, 'planner_remove_visit', visitId, before, null);
      return { visit_id: visitId, removed: true };
    });
  }

  prepareReorderDay(date: string, visitId: string, delta: -1 | 1): PreparedOwnlyOperation {
    const entries = listPlannerVisits(this.dataLocation)
      .filter((entry) => entry.frontmatter.date === date)
      .sort((left, right) => left.frontmatter.sort_order - right.frontmatter.sort_order);
    const index = entries.findIndex((entry) => entry.frontmatter.id === visitId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= entries.length) {
      throw new OwnlyMutationError('Reorder target is out of bounds for this day.', 'INVALID_INPUT');
    }
    const reordered = [...entries];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    const targets = reordered
      .map((entry, sort_order) => ({
        entry,
        next: { ...entry.frontmatter, sort_order, updated_at: this.now().toISOString() } as PlannerTripVisit,
        expected: fingerprint(entry.filePath),
      }))
      .filter(({ entry, next }) => entry.frontmatter.sort_order !== next.sort_order);
    return this.prepare('planner_reorder_day', {
      date,
      changes: targets.map(({ next }) => ({ visit_id: next.id, place_id: next.place_id, sort_order: next.sort_order })),
    }, () => {
      for (const targetItem of targets) assertUnchanged(targetItem.entry.filePath, targetItem.expected);
      for (const targetItem of targets) writeEntry(dirname(targetItem.entry.filePath), targetItem.entry.fileName, targetItem.next, targetItem.entry.body);
      return { date, updated: targets.length };
    });
  }'''
s = s[:ops_start] + new_ops + s[ops_end:]

# Travel-time optimization now reorders Visit files while travel facts remain keyed by canonical place ids.
opt_start = s.index('  prepareApplyTravelTimeOptimization(')
opt_end = s.index('\n\n  prepareSetStaySpan(', opt_start)
new_opt = r'''  prepareApplyTravelTimeOptimization(
    tripId: string,
    date: string,
    orderedVisitIds: string[],
    legs: PlannerTripLeg[],
    summary: { original_minutes: number; optimized_minutes: number; saved_minutes: number; used_manual_pairs: string[] },
  ): PreparedOwnlyOperation {
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) =>
      entry.frontmatter.trip_id === tripId && entry.frontmatter.date === date,
    );
    const current = [...visitEntries]
      .sort((left, right) => left.frontmatter.sort_order - right.frontmatter.sort_order)
      .map((entry) => entry.frontmatter as PlannerTripVisit);
    if (orderedVisitIds.length !== current.length || new Set(orderedVisitIds).size !== current.length) {
      throw new OwnlyMutationError('Optimized order must contain every visit exactly once.', 'INVALID_INPUT');
    }
    const currentIds = new Set(current.map((visit) => visit.id));
    if (orderedVisitIds.some((id) => !currentIds.has(id))) {
      throw new OwnlyMutationError('Optimized order contains a visit outside this trip/day.', 'INVALID_INPUT');
    }
    const places = listPlannerPlaces(this.dataLocation)
      .filter((entry) => entry.frontmatter.trip_id === tripId)
      .map((entry) => entry.frontmatter as PlannerTripPlace);
    const projected = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(places, current));
    projected.forEach((scheduledVisit, index) => {
      if ((index === 0 || scheduledVisit.locked || scheduledVisit.is_anchor) && orderedVisitIds[index] !== scheduledVisit.visit_id) {
        throw new OwnlyMutationError(`${scheduledVisit.title} is fixed and cannot move during travel-time optimization.`, 'INVALID_INPUT');
      }
    });

    const timestamp = this.now().toISOString();
    const orderById = new Map(orderedVisitIds.map((id, index) => [id, index] as const));
    const visitTargets = visitEntries
      .map((entry) => ({
        entry,
        next: { ...entry.frontmatter, sort_order: orderById.get(entry.frontmatter.id)!, updated_at: timestamp } as PlannerTripVisit,
        expected: fingerprint(entry.filePath),
      }))
      .filter(({ entry, next }) => entry.frontmatter.sort_order !== next.sort_order);

    const tripPlaceIds = new Set(places.map((place) => place.id));
    const existingLegs = listPlannerLegs(this.dataLocation);
    const existingById = new Map(existingLegs.map((entry) => [entry.frontmatter.id, entry.frontmatter] as const));
    const legDirectory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.legs);
    const normalizedLegs = legs.map((leg) => {
      if (leg.trip_id !== tripId || !tripPlaceIds.has(leg.from_place_id) || !tripPlaceIds.has(leg.to_place_id) || leg.from_place_id === leg.to_place_id) {
        throw new OwnlyMutationError(`Invalid travel leg endpoints: ${leg.from_place_id} → ${leg.to_place_id}`, 'INVALID_INPUT');
      }
      if (!Number.isInteger(leg.duration_minutes) || leg.duration_minutes <= 0 || leg.duration_minutes > 1440) {
        throw new OwnlyMutationError('Travel duration must be an integer between 1 and 1440 minutes.', 'INVALID_INPUT');
      }
      const existing = existingById.get(leg.id);
      return { ...leg, created_at: existing?.created_at ?? leg.created_at ?? timestamp, updated_at: timestamp };
    });
    const legTargets = normalizedLegs.map((leg) => {
      const filePath = join(legDirectory, plannerTripLegFileName(leg.id));
      return { leg, filePath, expected: fingerprint(filePath) };
    });

    return this.prepare('planner_optimize_day_travel_time', {
      trip_id: tripId,
      date,
      ...summary,
      order: orderedVisitIds,
      refreshed_legs: normalizedLegs.map((leg) => ({ from: leg.from_place_id, to: leg.to_place_id, minutes: leg.duration_minutes })),
    }, () => {
      for (const target of visitTargets) assertUnchanged(target.entry.filePath, target.expected);
      for (const target of legTargets) assertUnchanged(target.filePath, target.expected);
      for (const target of visitTargets) writeFileSync(target.entry.filePath, serializeMarkdownEntity(target.next, target.entry.body), 'utf8');
      if (legTargets.length > 0) mkdirSync(legDirectory, { recursive: true });
      for (const target of legTargets) {
        writeFileSync(target.filePath, serializeMarkdownEntity(target.leg, ''), 'utf8');
        writeAgentLog(this.dataLocation, 'planner_optimize_day_travel_time_leg', target.leg.id, existingById.get(target.leg.id) ?? null, target.leg);
      }
      writeAgentLog(this.dataLocation, 'planner_optimize_day_travel_time', `${tripId}:${date}`, current.map((visit) => visit.id), orderedVisitIds);
      return { trip_id: tripId, date, updated_visits: visitTargets.length, refreshed_legs: legTargets.length, saved_minutes: summary.saved_minutes };
    });
  }'''
s = s[:opt_start] + new_opt + s[opt_end:]

stay_start = s.index('  prepareSetStaySpan(')
stay_end = s.index('\n\n  prepareDropPlannerPlace(', stay_start)
new_stay = r'''  prepareSetStaySpan(hotelPlaceId: string, dates: string[]): PreparedOwnlyOperation {
    const hotelEntry = findPlannerEntry(listPlannerPlaces(this.dataLocation), hotelPlaceId);
    if (!hotelEntry || hotelEntry.frontmatter.kind !== 'stay' || hotelEntry.frontmatter.state === 'dropped') {
      throw new OwnlyMutationError(`Hotel place was not found: ${hotelPlaceId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const hotel = hotelEntry.frontmatter;
    const dateSet = new Set(dates);
    const placeById = new Map(
      listPlannerPlaces(this.dataLocation)
        .filter((entry) => entry.frontmatter.trip_id === hotel.trip_id)
        .map((entry) => [entry.frontmatter.id, entry.frontmatter] as const),
    );
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === hotel.trip_id);
    const stale = visitEntries.filter((entry) => dateSet.has(entry.frontmatter.date) && placeById.get(entry.frontmatter.place_id)?.kind === 'stay');
    const timestamp = this.now();
    const created = dates.map((date) => createPlannerTripVisit(hotel, date, 0, {
      locked: true,
      is_anchor: true,
      anchor_type: 'stay_checkin',
    }, timestamp, randomUUID()));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const createTargets = created.map((visit) => {
      const fileName = plannerTripVisitFileName(visit.id);
      const filePath = join(directory, fileName);
      return { visit, fileName, filePath, expected: fingerprint(filePath) };
    });
    const staleTargets = stale.map((entry) => ({ entry, expected: fingerprint(entry.filePath) }));

    return this.prepare(
      'planner_set_stay_span',
      {
        hotel: hotel.title,
        dates,
        creates: created.map((visit) => ({ visit_id: visit.id, date: visit.date })),
        retires_visit_ids: stale.map((entry) => entry.frontmatter.id),
      },
      () => {
        for (const target of staleTargets) assertUnchanged(target.entry.filePath, target.expected);
        for (const target of createTargets) assertUnchanged(target.filePath, target.expected);
        for (const target of staleTargets) unlinkSync(target.entry.filePath);
        mkdirSync(directory, { recursive: true });
        for (const target of createTargets) writeFileSync(target.filePath, serializeMarkdownEntity(target.visit, ''), 'utf8');
        return { hotel_id: hotelPlaceId, nights: dates.length, retired_visits: stale.length, created_visits: created.length };
      },
    );
  }'''
s = s[:stay_start] + new_stay + s[stay_end:]

# Schedule proposal now writes only Visit files and can create repeated occurrences of one place.
prop_start = s.index('  preparePlannerApplyScheduleProposal(')
prop_end = s.index('\n\n  preparePlannerSaveICalMarkdown(', prop_start)
new_prop = r'''  preparePlannerApplyScheduleProposal(
    tripId: string,
    proposal: { visits: PlannerScheduleProposalItem[] },
  ): PreparedOwnlyOperation {
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    const trip = tripEntry.frontmatter as unknown as PlannerTrip;
    const placeEntries = listPlannerPlaces(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);
    const places = placeEntries.map((entry) => entry.frontmatter as PlannerTripPlace);
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);
    const currentVisits = visitEntries.map((entry) => entry.frontmatter as PlannerTripVisit);
    const normalized = proposal.visits.map((item) => ({ ...item, visit_id: item.visit_id?.trim() || `visit:${randomUUID()}` }));
    const evaluation = evaluatePlannerScheduleProposal(trip, places, currentVisits, normalized);
    const errors = evaluation.issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      throw new OwnlyMutationError(`Schedule proposal is invalid: ${errors.map((issue) => issue.message).join(' | ')}`, 'INVALID_INPUT' as OwnlyMutationErrorCode);
    }
    const nextById = new Map(evaluation.visits.map((visit) => [visit.id, visit] as const));
    const existingById = new Map(visitEntries.map((entry) => [entry.frontmatter.id, entry] as const));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const timestamp = this.now().toISOString();
    const targets = normalized.map((item) => {
      const id = item.visit_id!;
      const existing = existingById.get(id);
      const evaluated = nextById.get(id)!;
      const next: PlannerTripVisit = {
        ...evaluated,
        created_at: existing?.frontmatter.created_at ?? timestamp,
        updated_at: timestamp,
      };
      const fileName = existing?.fileName ?? plannerTripVisitFileName(id);
      const filePath = existing?.filePath ?? join(directory, fileName);
      return { existing, next, fileName, filePath, expected: fingerprint(filePath) };
    }).filter(({ existing, next }) => !existing || JSON.stringify(existing.frontmatter) !== JSON.stringify(next));
    if (targets.length === 0) throw new OwnlyMutationError('Schedule proposal does not change any Planner visit.', 'INVALID_INPUT' as OwnlyMutationErrorCode);
    const warnings = evaluation.issues.filter((issue) => issue.severity === 'warning');

    return this.prepare('planner_apply_schedule_proposal', {
      trip_id: tripId,
      updated_count: targets.length,
      warnings,
      visits: targets.map(({ next }) => ({
        visit_id: next.id,
        place_id: next.place_id,
        date: next.date,
        start: next.start,
        duration_minutes: next.duration_minutes,
        sort_order: next.sort_order,
        locked: next.locked,
      })),
    }, () => {
      for (const target of targets) assertUnchanged(target.filePath, target.expected);
      mkdirSync(directory, { recursive: true });
      for (const target of targets) writeFileSync(target.filePath, serializeMarkdownEntity(target.next, target.existing?.body ?? ''), 'utf8');
      writeAgentLog(this.dataLocation, 'planner_apply_schedule_proposal', tripId, null, { updated_count: targets.length, warnings });
      return { trip_id: tripId, applied_count: targets.length, warnings };
    });
  }'''
s = s[:prop_start] + new_prop + s[prop_end:]

# Ensure iCal save includes visit fingerprints as part of its canonical input.
s = s.replace("    const markdown = exportTripToICalProMarkdown(trip, places);", "    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);\n    const visits = visitEntries.map((entry) => entry.frontmatter as PlannerTripVisit);\n    const markdown = exportTripToICalProMarkdown(trip, places, visits);")
s = s.replace("    const expectedPlaces = new Map(placeEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));", "    const expectedPlaces = new Map(placeEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));\n    const expectedVisits = new Map(visitEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));")
s = s.replace("        for (const entry of placeEntries) assertUnchanged(entry.filePath, expectedPlaces.get(entry.filePath)!);", "        for (const entry of placeEntries) assertUnchanged(entry.filePath, expectedPlaces.get(entry.filePath)!);\n        for (const entry of visitEntries) assertUnchanged(entry.filePath, expectedVisits.get(entry.filePath)!);")
p.write_text(s)

# ── ORS reads Visit order, but stores reusable travel facts by canonical place pair.
p = Path('scripts/mcp/openrouteservice.ts')
s = p.read_text()
s = s.replace("import { listPlannerLegs, listPlannerPlaces, listPlannerTrips } from '../cli/planner-storage';", "import { listPlannerLegs, listPlannerPlaces, listPlannerTrips, listPlannerVisits } from '../cli/planner-storage';")
s = s.replace("  sortPlannerPlaces,\n", "")
s = s.replace("} from '../../src/domain/planner';\n", "} from '../../src/domain/planner';\nimport { materializePlannerScheduledPlaces, sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripVisit } from '../../src/domain/planner-visits';\n", 1)
old = """  const places = sortPlannerPlaces(\n    listPlannerPlaces(dataLocation)\n      .map((item) => item.frontmatter as PlannerTripPlace)\n      .filter((place) => place.trip_id === tripId && place.state === 'scheduled' && place.scheduled_date === date),\n  );\n  if (places.length < 2) throw new OwnlyMcpError('At least two scheduled places are required to refresh travel legs.', 'INVALID_INPUT');\n"""
new = """  const placeFacts = listPlannerPlaces(dataLocation)\n    .map((item) => item.frontmatter as PlannerTripPlace)\n    .filter((place) => place.trip_id === tripId && place.state !== 'dropped');\n  const visits = listPlannerVisits(dataLocation)\n    .map((item) => item.frontmatter as PlannerTripVisit)\n    .filter((visit) => visit.trip_id === tripId && visit.date === date);\n  const places = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(placeFacts, visits));\n  if (places.length < 2) throw new OwnlyMcpError('At least two scheduled visits are required to refresh travel legs.', 'INVALID_INPUT');\n"""
if old not in s: raise SystemExit('ORS refresh scheduled block not found')
s = s.replace(old,new,1)
s = s.replace("    const pair = `${from.id}→${to.id}`;", "    const pair = `${from.place_id}→${to.place_id}`;", 1)
s = s.replace("      id: plannerTripLegId(tripId, from.id, to.id),", "      id: plannerTripLegId(tripId, from.place_id, to.place_id),", 1)
s = s.replace("      from_place_id: from.id,\n      to_place_id: to.id,", "      from_place_id: from.place_id,\n      to_place_id: to.place_id,", 1)

old2 = """  const places = sortPlannerPlaces(\n    listPlannerPlaces(dataLocation)\n      .map((item) => item.frontmatter as PlannerTripPlace)\n      .filter((place) => place.trip_id === tripId && place.state === 'scheduled' && place.scheduled_date === date),\n  );\n  if (places.length < 3) throw new OwnlyMcpError('At least three scheduled places are required for travel-time optimization.', 'INVALID_INPUT');\n"""
new2 = """  const placeFacts = listPlannerPlaces(dataLocation)\n    .map((item) => item.frontmatter as PlannerTripPlace)\n    .filter((place) => place.trip_id === tripId && place.state !== 'dropped');\n  const visits = listPlannerVisits(dataLocation)\n    .map((item) => item.frontmatter as PlannerTripVisit)\n    .filter((visit) => visit.trip_id === tripId && visit.date === date);\n  const places = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(placeFacts, visits));\n  if (places.length < 3) throw new OwnlyMcpError('At least three scheduled visits are required for travel-time optimization.', 'INVALID_INPUT');\n"""
if old2 not in s: raise SystemExit('ORS optimize scheduled block not found')
s = s.replace(old2,new2,1)
s = s.replace("    places as Array<PlannerTripPlace & { coordinates: { lat: number; lng: number } }>,", "    places as Array<PlannerScheduledPlace & { coordinates: { lat: number; lng: number } }>,")
# Manual leg facts are applied to every matching Visit pair in the ephemeral matrix.
manual_old = """  const dayIds = new Set(places.map((place) => place.id));\n  const usedManualPairs: string[] = [];\n  for (const leg of existingLegs) {\n    if (leg.source !== 'manual' || !dayIds.has(leg.from_place_id) || !dayIds.has(leg.to_place_id)) continue;\n    matrix[leg.from_place_id]![leg.to_place_id] = leg.duration_minutes;\n  }\n"""
manual_new = """  const usedManualPairs: string[] = [];\n  for (const leg of existingLegs) {\n    if (leg.source !== 'manual') continue;\n    for (const from of places) {\n      if (from.place_id !== leg.from_place_id) continue;\n      for (const to of places) {\n        if (to.place_id !== leg.to_place_id) continue;\n        matrix[from.id]![to.id] = leg.duration_minutes;\n      }\n    }\n  }\n"""
if manual_old not in s: raise SystemExit('ORS manual matrix block not found')
s = s.replace(manual_old, manual_new)
s = s.replace("    const pair = `${from.id}→${to.id}`;", "    const pair = `${from.place_id}→${to.place_id}`;", 1)
s = s.replace("      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(tripId, from.id, to.id), trip_id: tripId,\n      from_place_id: from.id, to_place_id: to.id, mode, duration_minutes: duration,", "      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(tripId, from.place_id, to.place_id), trip_id: tripId,\n      from_place_id: from.place_id, to_place_id: to.place_id, mode, duration_minutes: duration,")
p.write_text(s)

# ── MCP tools expose occurrences explicitly; old Place scheduling commands are removed.
p = Path('packages/mcp/src/index.mjs')
s = p.read_text()
old_tools_start = s.index("  server.registerTool(\n    'ownly_planner_prepare_schedule_place'")
old_tools_end = s.index("\n\n  server.registerTool(\n    'ownly_planner_prepare_optimize_day_travel_time'", old_tools_start)
new_tools = r'''  server.registerTool(
    'ownly_planner_prepare_add_visit',
    {
      title: 'Preview Adding a Planner Visit',
      description: 'Preview adding one occurrence of a reusable place to a day. The place remains in the research pool and can be added again on the same or another day.',
      inputSchema: z.object({
        place_id: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        sort_order: z.number().int().nonnegative().optional(),
        locked: z.boolean().optional(),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ place_id, date, sort_order, locked }) => writeService.prepareAddVisit(place_id, date, sort_order, locked ?? false)),
  );

  server.registerTool(
    'ownly_planner_prepare_remove_visit',
    {
      title: 'Preview Removing a Planner Visit',
      description: 'Preview removing one scheduled occurrence without deleting or changing the reusable place fact.',
      inputSchema: z.object({ visit_id: z.string().min(1) }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ visit_id }) => writeService.prepareRemoveVisit(visit_id)),
  );

  server.registerTool(
    'ownly_planner_prepare_reorder_day',
    {
      title: 'Preview Reordering a Day',
      description: 'Preview moving one visit one position up (-1) or down (+1) within its day.',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        visit_id: z.string().min(1),
        delta: z.union([z.literal(-1), z.literal(1)]),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ date, visit_id, delta }) => writeService.prepareReorderDay(date, visit_id, delta)),
  );'''
s = s[:old_tools_start] + new_tools + s[old_tools_end:]
# Proposal schema uses occurrences and supports repeated place_id values.
prop_start = s.index("  server.registerTool(\n    'ownly_planner_prepare_apply_schedule_proposal'")
prop_end = s.index("\n\n  server.registerTool(\n    'ownly_planner_prepare_save_ical_markdown'", prop_start)
new_mcp_prop = r'''  server.registerTool(
    'ownly_planner_prepare_apply_schedule_proposal',
    {
      title: 'Preview Schedule Proposal',
      description: 'Validate and preview an MCP client/LLM Visit proposal. Existing locked/anchored visits cannot move. Omitting visit_id creates a new occurrence, so one place may appear multiple times.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        visits: z.array(z.object({
          visit_id: z.string().min(1).optional(),
          place_id: z.string().min(1),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
          sort_order: z.number().int().nonnegative(),
          duration_minutes: z.number().int().positive().max(1440).optional(),
        })).min(1),
      }),
      annotations: PREPARE_WRITE_ANNOTATIONS,
    },
    safeHandler(({ trip_id, visits }) => writeService.preparePlannerApplyScheduleProposal(trip_id, { visits })),
  );'''
s = s[:prop_start] + new_mcp_prop + s[prop_end:]
s = s.replace("description: 'Overview of all trips with place counts (scheduled/candidates/dropped) and expense counts.'", "description: 'Overview of trips with reusable place counts, Visit occurrence counts, dropped places and expenses.'")
s = s.replace("description: 'Full trip context: trip, FX-aware budget, conflicts, canonical travel legs, derived execution timelines, places, bookings and expenses.'", "description: 'Full trip context: reusable places, repeatable Visit occurrences, FX-aware budget, conflicts, canonical travel legs, execution timelines, bookings and expenses.'")
p.write_text(s)

print('repeatable visit finalization staged')
