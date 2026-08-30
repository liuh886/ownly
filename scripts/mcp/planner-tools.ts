import {
  listPlannerBookings,
  listPlannerExpenses,
  listPlannerLegs,
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
  type PlannerTripLeg,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '../../src/domain/planner';
import { buildPlannerDayExecutionTimeline, findPlannerTimeOverlaps } from '../../src/domain/planner-schedule';
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
  const legs = listPlannerLegs(dataLocation)
    .map((item) => item.frontmatter as unknown as PlannerTripLeg)
    .filter((leg) => leg.trip_id === tripId);
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

  const executionTimeline = listTripDates(trip.start_date, trip.end_date)
    .map((date) => buildPlannerDayExecutionTimeline(trip, places, legs, date));

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
    travel_legs: legs,
    execution_timeline: executionTimeline,
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
