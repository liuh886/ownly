/**
 * Compact authoring surface for the bundled Sample Trips.
 *
 * A Sample Trip is a plain `ownly.trip.bundle` v1 payload, so it loads through
 * exactly the same parse → instantiate → import path as a trip shared by
 * another person. The specs below exist only to keep the data readable: they
 * drop the boilerplate every entity needs (`schema_version`, `type`, lifecycle
 * defaults, deterministic ids, timestamps) and expand into the full contract.
 *
 * Two rules govern the data, both enforced by sample-trips tests:
 *
 *  1. Every scheduled stop has an explicit `start` and `duration_minutes`, and
 *     every consecutive pair inside one day has a leg. Ownly treats a missing
 *     leg as `travel_time_missing`, which downgrades a day to `unknown`.
 *  2. `open_hours` always carries a weekday qualifier. `parseDailyOpeningRange`
 *     (src/domain/planner.ts) returns null — and fails open — as soon as it
 *     sees `周X` / `月曜`, so a qualified string can still report a genuine
 *     周一闭馆 while never mis-parsing a range it does not own.
 */
import type {
  PlannerPlaceKind,
  PlannerPlacePriority,
  PlannerReservationStatus,
  PlannerPriceUnit,
  PlannerTravelMode,
  PlannerTrip,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseCategory,
} from '@/domain/planner';
import { plannerTripLegId } from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
import type { OwnlyTripBundle } from '@/domain/trip-bundle';
import { CURRENT_SCHEMA_VERSION } from '@/domain/schema/common';

/** Fixed so every bundled Sample Trip is byte-stable across builds. */
export const SAMPLE_TRIP_TIMESTAMP = '2026-09-30T00:00:00.000Z';

/**
 * `CURRENT_SCHEMA_VERSION` is declared as the `SchemaVersion` union while every
 * planner entity pins the literal `'0.1'`. Narrowing it here turns a future
 * schema bump into one loud failure at the sample boundary instead of a
 * silently malformed data set.
 */
function pinSchemaVersion(): '0.1' {
  if (CURRENT_SCHEMA_VERSION !== '0.1') {
    throw new Error(
      `Sample Trips are authored against schema 0.1 but core is now ${CURRENT_SCHEMA_VERSION}. Re-author them before shipping.`,
    );
  }
  return '0.1';
}

const SCHEMA_VERSION = pinSchemaVersion();

/**
 * Prices are published standard admission rates, recorded once as a static
 * baseline. They are not live observations and will drift with the venue.
 */
export const SAMPLE_TRIP_OBSERVED_AT = '2026-09-30';

export interface SamplePlaceSpec {
  id: string;
  title: string;
  kind: PlannerPlaceKind;
  /** City / neighbourhood. Also what `inferPlaceCity` matches on. */
  area: string;
  /** [lat, lng] */
  coords: readonly [number, number];
  address?: string;
  priority?: PlannerPlacePriority;
  openHours?: string;
  durationMinutes?: number;
  preferredWindow?: 'morning' | 'afternoon' | 'evening' | 'night';
  price?: { label: string; currency: string; min?: number; max?: number; unit?: PlannerPriceUnit };
  rating?: number;
  why?: string;
  tags?: string[];
  signals?: string[];
  risks?: string[];
  reservation?: PlannerReservationStatus;
}

/**
 * A place with no entry in `visits` stays in the research pool. That is the
 * intended shape, not an omission: the pool is what teaches candidates →
 * schedule, so every Sample Trip ships a few unscheduled options.
 */

export interface SampleVisitSpec {
  placeId: string;
  date: string;
  start: string;
  /** Overrides the place duration when one day needs a shorter or longer slot. */
  durationMinutes?: number;
  locked?: boolean;
  isAnchor?: boolean;
  anchorType?: PlannerTripVisit['anchor_type'];
}

export interface SampleLegSpec {
  from: string;
  to: string;
  mode: PlannerTravelMode;
  minutes: number;
  meters?: number;
}

export interface SampleExpenseSpec {
  id: string;
  placeId?: string;
  title: string;
  category: TripExpenseCategory;
  amount: number;
  currency: string;
  date?: string;
  paidBy: string;
  splitMembers: string[];
  notes?: string;
}

export interface SampleTripSpec {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  destinations: string[];
  currency: string;
  transportMode?: PlannerTravelMode;
  timezone?: string;
  dayTimezones?: Record<string, string>;
  members?: string[];
  tags?: string[];
  places: SamplePlaceSpec[];
  visits: SampleVisitSpec[];
  legs: SampleLegSpec[];
  expenses?: SampleExpenseSpec[];
}

/**
 * A resolvable Google Maps search link. We deliberately do not invent a
 * `source_place_id`: a fabricated Place ID would become strong identity
 * evidence and could auto-merge two genuinely different venues later.
 */
function mapsSearchUrl(title: string, area: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} ${area}`)}`;
}

export interface BuiltSampleTrip {
  bundle: OwnlyTripBundle;
  /**
   * Expenses are not part of the bundle schema — `ownly.trip.bundle` excludes
   * them by design, because a shared trip must not carry a sharer's ledger.
   * A Sample Trip is ours, so the loader re-applies these after import.
   */
  expenses: SampleExpenseSpec[];
  /**
   * `instantiateTripBundle` strips `members` for privacy, so the loader has to
   * put them back or the AA settlement panel renders with no participants.
   */
  members?: string[];
}

export function buildSampleTrip(spec: SampleTripSpec): BuiltSampleTrip {
  const tripId = spec.id;
  const trip: PlannerTrip = {
    schema_version: SCHEMA_VERSION,
    type: 'trip',
    id: tripId,
    title: spec.title,
    status: 'planning',
    start_date: spec.startDate,
    end_date: spec.endDate,
    destinations: spec.destinations,
    currency: spec.currency,
    transport_mode: spec.transportMode ?? 'transit',
    timezone: spec.timezone,
    day_timezones: spec.dayTimezones,
    members: spec.members,
    tags: spec.tags ?? ['sample', '示例'],
    created_at: SAMPLE_TRIP_TIMESTAMP,
  };

  const places: PlannerTripPlace[] = spec.places.map((place) => ({
    schema_version: SCHEMA_VERSION,
    type: 'trip_place',
    id: place.id,
    trip_id: tripId,
    title: place.title,
    source_provider: 'google_maps',
    source_url: mapsSearchUrl(place.title, place.area),
    kind: place.kind,
    area: place.area,
    address: place.address,
    priority: place.priority ?? 'want',
    tags: place.tags ?? [place.kind],
    why: place.why,
    signals: place.signals ?? [],
    risks: place.risks ?? [],
    observed_rating: place.rating,
    observed_price: place.price?.label,
    price_currency: place.price?.currency,
    price_min: place.price?.min,
    price_max: place.price?.max,
    price_unit: place.price?.unit,
    observed_at: place.price ? SAMPLE_TRIP_OBSERVED_AT : undefined,
    open_hours: place.openHours,
    preferred_window: place.preferredWindow,
    duration_minutes: place.durationMinutes,
    coordinates: { lat: place.coords[0], lng: place.coords[1] },
    reservation_status: place.reservation ?? 'none',
    state: 'candidate',
    created_at: SAMPLE_TRIP_TIMESTAMP,
  }));

  const placeById = new Map(spec.places.map((place) => [place.id, place] as const));
  const sortOrderByDate = new Map<string, number>();
  const visits: PlannerTripVisit[] = spec.visits.map((visit) => {
    const sortOrder = sortOrderByDate.get(visit.date) ?? 0;
    sortOrderByDate.set(visit.date, sortOrder + 1);
    const place = placeById.get(visit.placeId);
    if (!place) throw new Error(`Sample Trip ${tripId}: visit references unknown place "${visit.placeId}"`);
    return {
      schema_version: SCHEMA_VERSION,
      type: 'trip_visit',
      id: `visit:${tripId}:${visit.date}:${visit.placeId}`,
      trip_id: tripId,
      place_id: visit.placeId,
      date: visit.date,
      start: visit.start,
      // Mirror createPlannerTripVisit: an occurrence carries its own duration,
      // and a place keeps the reusable default. The day's assessment reads the
      // materialized stop, so both must agree.
      duration_minutes: visit.durationMinutes ?? place.durationMinutes,
      sort_order: sortOrder,
      locked: visit.locked ?? false,
      is_anchor: visit.isAnchor ?? false,
      anchor_type: visit.anchorType,
      created_at: SAMPLE_TRIP_TIMESTAMP,
    };
  });

  const legs: PlannerTripLeg[] = spec.legs.map((leg) => ({
    schema_version: SCHEMA_VERSION,
    type: 'trip_leg',
    id: plannerTripLegId(tripId, leg.from, leg.to),
    trip_id: tripId,
    from_place_id: leg.from,
    to_place_id: leg.to,
    mode: leg.mode,
    duration_minutes: leg.minutes,
    distance_meters: leg.meters,
    source: 'manual',
    observed_at: SAMPLE_TRIP_OBSERVED_AT,
    created_at: SAMPLE_TRIP_TIMESTAMP,
  }));

  const bundle: OwnlyTripBundle = {
    kind: 'ownly.trip.bundle',
    version: 1,
    exported_at: SAMPLE_TRIP_TIMESTAMP,
    privacy: { expenses: 'excluded', members: 'excluded', calendar_feed: 'excluded' },
    trip,
    places,
    visits,
    legs,
  };

  return { bundle, expenses: spec.expenses ?? [], members: spec.members };
}
