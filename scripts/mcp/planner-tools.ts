import { resolve } from 'node:path';
import {
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

function requireTrip(dataLocation: string, tripId: string) {
  const entry = listPlannerTrips(dataLocation).find((e) => e.frontmatter.id === tripId);
  if (!entry) {
    throw new OwnlyMcpError(`Planner trip was not found: ${tripId}`, 'NOT_FOUND');
  }
  return entry.frontmatter as unknown as PlannerTrip;
}

export function getPlannerSummary(dataLocation: string): Record<string, unknown> {
  const trips = listPlannerTrips(dataLocation).map((e) => e.frontmatter);
  const places = listPlannerPlaces(dataLocation).map((e) => e.frontmatter);
  const expenses = listPlannerExpenses(dataLocation).map((e) => e.frontmatter);
  return {
    trips: trips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      status: trip.status,
      dates: `${trip.start_date} → ${trip.end_date}`,
      currency: trip.currency ?? null,
      places_total: places.filter((p) => p.trip_id === trip.id).length,
      scheduled: places.filter((p) => p.trip_id === trip.id && p.state === 'scheduled').length,
      candidates: places.filter((p) => p.trip_id === trip.id && p.state === 'candidate').length,
      dropped: places.filter((p) => p.trip_id === trip.id && p.state === 'dropped').length,
      expenses: expenses.filter((e) => e.trip_id === trip.id).length,
    })),
    totals: {
      trips: trips.length,
      places: places.length,
      expenses: expenses.length,
    },
  };
}

export function getPlannerTripDetail(dataLocation: string, tripId: string): Record<string, unknown> {
  const trip = requireTrip(dataLocation, tripId);
  const places = listPlannerPlaces(dataLocation)
    .map((e) => e.frontmatter as unknown as PlannerTripPlace)
    .filter((p) => p.trip_id === tripId && p.state !== 'dropped')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const bookings = listPlannerBookings(dataLocation)
    .map((e) => e.frontmatter as unknown as { trip_id: string; [k: string]: unknown })
    .filter((b) => b.trip_id === tripId);
  const expenses = listPlannerExpenses(dataLocation)
    .map((e) => e.frontmatter as unknown as TripExpenseItem)
    .filter((x) => x.trip_id === tripId);

  const fx: FxSettings = { base: (trip.currency || 'CNY').toUpperCase(), overrides: trip.fx_rates };
  const scheduled = places.filter((p) => p.state === 'scheduled');
  const budget = estimateTripBudget(scheduled, Math.max(1, trip.members?.length ?? 1), fx);

  const dates = listTripDates(trip.start_date, trip.end_date);
  const conflicts = dates
    .map((date) => ({
      date,
      collisions: places
        .filter((p) => p.scheduled_date === date && p.open_hours)
        .map((p) => ({ place: p.title, ...checkOpeningHoursCollision(p.open_hours, date) }))
        .filter((c) => c.isCollision),
    }))
    .filter((d) => d.collisions.length > 0);

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
    places: places.map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      state: p.state,
      priority: p.priority,
      date: p.scheduled_date ?? null,
      order: p.sort_order ?? null,
      locked: p.locked ?? false,
      rating: p.observed_rating ?? null,
      price: p.observed_price ?? null,
      area: p.area ?? null,
      phone: p.phone ?? null,
      source_url: p.source_url,
    })),
    bookings,
    expenses: expenses.map((e) => ({
      id: e.id, title: e.title, amount: e.amount, currency: e.currency,
      category: e.category, paid_by: e.paid_by, split_members: e.split_members,
    })),
  };
}
