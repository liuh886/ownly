import { getStrongPlaceIdentityKeys, haveConflictingStrongPlaceIdentity, shareStrongPlaceIdentity } from './place-identity';

export type PlannerTripStatus = 'planning' | 'active' | 'completed';
export type PlannerTravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';
export type PlannerTripLegSource = 'manual' | 'openrouteservice';
export type PlannerPlaceState = 'candidate' | 'done' | 'dropped';
export type PlannerPlacePriority = 'must' | 'want' | 'optional';
export type PlannerReservationStatus = 'none' | 'needed' | 'booked';
export type PlannerPriceUnit = 'person' | 'night' | 'item' | 'level' | 'unknown';
export type PlannerVisitAnchorType = 'flight' | 'stay_checkin' | 'stay_checkout' | 'transit' | 'reservation';
export type PlannerPlaceKind =
  | 'attraction'
  | 'food'
  | 'cafe'
  | 'stay'
  | 'shopping'
  | 'transit'
  | 'experience'
  | 'service'
  | 'other';

export interface PlannerTrip {
  schema_version: '0.1';
  type: 'trip';
  id: string;
  title: string;
  status: PlannerTripStatus;
  start_date: string;
  end_date: string;
  destinations: string[];
  tags?: string[];
  saved_list_name?: string;
  currency?: string;
  transport_mode?: PlannerTravelMode;
  travel_preferences?: string[];
  /** AA ledger participants, persisted so the ledger survives browsers/devices. */
  members?: string[];
  /** User-verified conversion overrides: fx_rates[FROM] = how many trip-currency per 1 FROM. */
  fx_rates?: Record<string, number>;
  /** Calendar subscription feed metadata for continuous read-only ICS sync (PRO). */
  calendar_feed?: PlannerTripCalendarFeed;
  /** User-reviewed duplicate pairs that must stay separate. Pair ids are canonical and order-independent. */
  ignored_duplicate_pair_ids?: string[];
  created_at: string;
  updated_at?: string;
}

export interface PlannerTripCalendarFeed {
  feed_token: string;
  trip_id: string;
  created_at: string;
  updated_at: string;
  enabled: boolean;
}

export type PlannerPlaceSourceProvider =
  | 'google_maps'
  | 'google_travel'
  | 'tabelog'
  | 'xiaohongshu'
  | 'booking'
  | 'other';

export interface HotelPropertyFacts {
  opened_year?: string;
  renovated_year?: string;
  room_count?: number;
  check_in?: string;
  check_out?: string;
}

export interface PlannerTripPlace {
  schema_version: '0.1';
  type: 'trip_place';
  id: string;
  trip_id: string;
  title: string;
  source_provider: PlannerPlaceSourceProvider;
  source_url: string;
  source_place_id?: string;
  kind: PlannerPlaceKind;
  area?: string;
  priority?: PlannerPlacePriority;
  tags: string[];
  why?: string;
  signals: string[];
  risks: string[];
  notes?: string;
  /** Raw source facts retained at full fidelity for downstream comparison. */
  source_category?: string;
  observed_rating?: number;
  observed_review_count?: number;
  observed_price?: string;
  price_currency?: string;
  price_min?: number;
  price_max?: number;
  price_unit?: PlannerPriceUnit;
  price_level?: number;
  observed_at?: string;
  preferred_window?: string;
  duration_minutes?: number;
  open_hours?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  reservation_status: PlannerReservationStatus;
  state: PlannerPlaceState;
  /** Contact & structured extras captured from Google Maps. */
  phone?: string;
  plus_code?: string;
  menu_url?: string;
  reservation_url?: string;
  review_topics?: string[];
  /** Google taxonomy types, e.g. ["lodging","restaurant","tourist_attraction"]. */
  types?: string[];
  /** Hotel property metadata (opening year, renovation year, rooms, check-in/out). */
  hotel_facts?: HotelPropertyFacts;
  /** P1: 分享来源追踪 — 记录该地点是否来自他人分享的 Collection */
  import_provenance?: {
    source_type: 'shared_collection';
    creator?: string;
    collection_id: string;
    shared_at?: string;
    imported_at: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface PlannerScheduledPlace extends Omit<PlannerTripPlace, 'id' | 'state' | 'duration_minutes'> {
  id: string;
  visit_id: string;
  place_id: string;
  state: 'scheduled';
  scheduled_date: string;
  scheduled_start?: string;
  duration_minutes?: number;
  sort_order: number;
  locked: boolean;
  is_anchor: boolean;
  anchor_type?: PlannerVisitAnchorType;
}

export function sortPlannerScheduledPlaces(places: PlannerScheduledPlace[]): PlannerScheduledPlace[] {
  return [...places].sort((left, right) => {
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    const start = (left.scheduled_start ?? '').localeCompare(right.scheduled_start ?? '');
    if (start !== 0) return start;
    return left.title.localeCompare(right.title);
  });
}

export interface PlannerTripLeg {
  schema_version: '0.1';
  type: 'trip_leg';
  id: string;
  trip_id: string;
  from_place_id: string;
  to_place_id: string;
  mode: PlannerTravelMode;
  duration_minutes: number;
  distance_meters?: number;
  source: PlannerTripLegSource;
  observed_at?: string;
  created_at: string;
  updated_at?: string;
}

export function stablePlannerHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function plannerTripLegId(tripId: string, fromPlaceId: string, toPlaceId: string): string {
  return `leg:${tripId}:${fromPlaceId}:${toPlaceId}`;
}

export function plannerTripLegFileName(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'travel-leg';
  return `leg--${safe}-${stablePlannerHash(id)}.md`;
}

export interface CaptureContext {
  tripId: string;
  title: string;
  currency?: string;
  tags?: string[];
}

export type ImportStatus = 'pending' | 'imported' | 'failed';

export interface ImportFailure {
  id: string;
  title: string;
  reason: string;
  detail?: string;
}

export interface ImportReport {
  received: number;
  created: string[];
  updated: string[];
  deduped: string[];
  failed: ImportFailure[];
}

export type CaptureCandidate = PlannerTripPlace & {
  status?: ImportStatus;
  reason?: string;
  lastAttempt?: string;
};

export interface OwnlyCaptureState {
  version: 2;
  activeContext: CaptureContext | null;
  pendingPlaces: CaptureCandidate[];
  lastImportReport?: ImportReport;
}

export const EMPTY_CAPTURE_STATE: OwnlyCaptureState = {
  version: 2,
  activeContext: null,
  pendingPlaces: [],
};

export function applyCaptureImportReport(
  state: OwnlyCaptureState,
  report: ImportReport,
  attemptedAt: string,
): OwnlyCaptureState {
  const imported = new Set([...report.created, ...report.updated, ...report.deduped]);
  const failedById = new Map(report.failed.map((item) => [item.id, item] as const));
  return {
    ...state,
    pendingPlaces: state.pendingPlaces
      .filter((place) => !imported.has(place.id))
      .map((place) => {
        const failed = failedById.get(place.id);
        if (!failed) return place;
        return { ...place, status: 'failed', reason: failed.reason, lastAttempt: attemptedAt };
      }),
    lastImportReport: report,
  };
}

export function asCaptureCandidate(place: PlannerTripPlace | CaptureCandidate): CaptureCandidate {
  const capture = place as CaptureCandidate;
  const status = capture.status === 'failed' || capture.status === 'imported' ? capture.status : 'pending';
  return {
    ...place,
    status,
    reason: status === 'failed' ? capture.reason : undefined,
    lastAttempt: status === 'failed' ? capture.lastAttempt : undefined,
    reservation_status: place.reservation_status ?? 'none',
    state: 'candidate',
  };
}

/**
 * Merge a panel snapshot with the freshest inbox. The background worker owns
 * activeContext; the panel only edits pending candidates. Tombstones prevent a
 * concurrent quick-capture merge from resurrecting a user deletion.
 */
export function mergeCaptureState(
  fresh: OwnlyCaptureState,
  local: OwnlyCaptureState,
  locallyDeletedIds?: ReadonlySet<string>,
): OwnlyCaptureState {
  const tombstones = locallyDeletedIds;
  const localPlaces = (tombstones
    ? local.pendingPlaces.filter((place) => !tombstones.has(place.id))
    : local.pendingPlaces).map(asCaptureCandidate);
  const localPlaceIds = new Set(localPlaces.map((place) => place.id));
  const backgroundOnly = fresh.pendingPlaces.filter(
    (place) => !localPlaceIds.has(place.id) && !(tombstones && tombstones.has(place.id)),
  );
  return {
    version: 2,
    activeContext: fresh.activeContext,
    pendingPlaces: [...localPlaces, ...backgroundOnly],
    lastImportReport: local.lastImportReport ?? fresh.lastImportReport,
  };
}

/**
 * Reorders a visible subset of places (e.g. the filtered candidate pool) while
 * keeping every hidden entry pinned to its original slot.
 */
export function reorderPendingPlaces(
  pendingPlaces: PlannerTripPlace[],
  orderedVisibleIds: string[],
): PlannerTripPlace[] {
  const visibleIds = orderedVisibleIds.filter((id) => pendingPlaces.some((p) => p.id === id));
  if (visibleIds.length === 0) return [...pendingPlaces];
  const slots: number[] = [];
  pendingPlaces.forEach((place, index) => {
    if (visibleIds.includes(place.id)) slots.push(index);
  });
  const next = [...pendingPlaces];
  visibleIds.forEach((id, i) => {
    const source = pendingPlaces.find((p) => p.id === id)!;
    next[slots[i]] = source;
  });
  return next;
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function listTripDates(startDate: string, endDate: string, maxDays = 90): string[] {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const result: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime() && result.length < maxDays) {
    result.push(formatDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function assertTripDate(trip: PlannerTrip, date: string): void {
  if (!trip) {
    throw new Error('Planner trip is required.');
  }
  if (!trip.start_date || !trip.end_date) {
    throw new Error(`Trip "${trip.title || trip.id}" is missing start_date or end_date.`);
  }
  if (date < trip.start_date || date > trip.end_date) {
    throw new Error(`Visit date ${date} is outside trip range ${trip.start_date} ~ ${trip.end_date}.`);
  }
}

export function assertTripDates(trip: PlannerTrip, dates: string[]): void {
  for (const date of dates) {
    assertTripDate(trip, date);
  }
}

export function isZeroOrPlaceholderPrice(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const t = raw.trim();
  if (t === '' || t === '0' || t === '$0' || t === '¥0' || t === '฿0' || t === '0.00' || t === '0.-' || t === '0 บาท') return true;
  if (/^(?:SGD|S\$|THB|USD|HKD|NT\$|¥|฿|\$|EUR|GBP|JPY|CNY|MYR|KRW|VND|INR)\s*0+(?:\.0+)?(?:\s*(?:[/·]|per|\/)?\s*(?:night|晚|person|人|pp|day|บาท))?$/i.test(t)) return true;
  if (/^(?:人均|per person|每人|每晚|per night|from|约)\s*[:：]?\s*(?:SGD|S\$|THB|USD|HKD|NT\$|¥|฿|\$)?\s*0+(?:\.0+)?$/i.test(t)) return true;
  if (/^(?:[A-Z]{3}|S\$|HK\$|US\$|NT\$|AU\$|CA\$|NZ\$|\$|¥|฿|€|£|₩)\s*0+(?:\.0+)?$/i.test(t)) return true;
  if (/^0+(?:\.0+)?\s*(?:[A-Z]{3}|S\$|HK\$|US\$|NT\$|AU\$|CA\$|NZ\$|\$|¥|฿|€|£|₩|บาท|泰铢|元|円)$/i.test(t)) return true;
  if (/^\d+[a-zA-Z]+-?$/i.test(t)) return true;
  if (/(?<!\.)[-–—〜~]$/.test(t)) return true;
  return false;
}

export function isValidExtractedPriceCandidate(candidate?: string | null): boolean {
  if (!candidate || typeof candidate !== 'string' || candidate.trim().length === 0) return false;
  const t = candidate.trim();
  if (/^([$€£¥￥฿₩])\1{0,3}$/.test(t)) return true;
  if (/(?<!\.)[-–—〜~]$/.test(t)) return false;
  if (/^\d+[a-zA-Z]+-?$/i.test(t)) return false;
  if (!/\d/.test(t)) return false;
  if (/^(?:directions|save|share|nearby|路线|保存|分享|附近)$/i.test(t)) return false;
  return !isZeroOrPlaceholderPrice(t);
}

export function mergeCapturedPlaceResearch(
  existing: PlannerTripPlace,
  captured: PlannerTripPlace,
): PlannerTripPlace {
  const mergedTypes = new Set<string>([...(captured.types ?? []), ...(existing.types ?? [])]);
  const hasContent = (val?: string | null): boolean => typeof val === 'string' && val.trim().length > 0;

  const validCapturedPrice = isValidExtractedPriceCandidate(captured.observed_price) ? captured.observed_price : undefined;
  const validExistingPrice = isValidExtractedPriceCandidate(existing.observed_price) ? existing.observed_price : undefined;
  const effectiveObservedPrice = validCapturedPrice ?? validExistingPrice;

  return {
    ...existing,
    id: existing.id,
    title: hasContent(captured.title) ? captured.title : existing.title,
    source_provider: captured.source_provider ?? existing.source_provider,
    source_url: captured.source_url ?? existing.source_url,
    source_place_id: captured.source_place_id ?? existing.source_place_id,

    // Planner-owned decisions stay on the canonical record. Recapture never backfills them.
    kind: existing.kind,
    area: existing.area,
    priority: existing.priority,
    tags: existing.tags,
    why: existing.why,
    signals: existing.signals,
    risks: existing.risks,
    notes: existing.notes,
    preferred_window: existing.preferred_window,
    duration_minutes: existing.duration_minutes,

    // Capture may refresh observed/source facts:
    source_category: hasContent(captured.source_category) ? captured.source_category : existing.source_category,
    observed_rating: (typeof captured.observed_rating === 'number' && Number.isFinite(captured.observed_rating))
      ? captured.observed_rating
      : existing.observed_rating,
    observed_review_count: (typeof captured.observed_review_count === 'number' && Number.isFinite(captured.observed_review_count))
      ? captured.observed_review_count
      : existing.observed_review_count,
    observed_price: effectiveObservedPrice,
    price_currency: validCapturedPrice ? captured.price_currency : (validExistingPrice ? existing.price_currency : undefined),
    price_min: validCapturedPrice
      ? (typeof captured.price_min === 'number' && Number.isFinite(captured.price_min) && captured.price_min > 0 ? captured.price_min : undefined)
      : (validExistingPrice && typeof existing.price_min === 'number' && Number.isFinite(existing.price_min) && existing.price_min > 0 ? existing.price_min : undefined),
    price_max: validCapturedPrice
      ? (typeof captured.price_max === 'number' && Number.isFinite(captured.price_max) && captured.price_max > 0 ? captured.price_max : undefined)
      : (validExistingPrice && typeof existing.price_max === 'number' && Number.isFinite(existing.price_max) && existing.price_max > 0 ? existing.price_max : undefined),
    price_unit: validCapturedPrice ? captured.price_unit : (validExistingPrice ? existing.price_unit : undefined),
    price_level: validCapturedPrice ? captured.price_level : (validExistingPrice ? existing.price_level : undefined),
    observed_at: hasContent(captured.observed_at) ? captured.observed_at : existing.observed_at,
    address: hasContent(captured.address) ? captured.address : existing.address,
    coordinates: captured.coordinates ?? existing.coordinates,
    open_hours: hasContent(captured.open_hours) ? captured.open_hours : existing.open_hours,
    phone: hasContent(captured.phone) ? captured.phone : existing.phone,
    plus_code: hasContent(captured.plus_code) ? captured.plus_code : existing.plus_code,
    menu_url: hasContent(captured.menu_url) ? captured.menu_url : existing.menu_url,
    reservation_url: hasContent(captured.reservation_url) ? captured.reservation_url : existing.reservation_url,
    review_topics: (captured.review_topics && captured.review_topics.length > 0) ? captured.review_topics : existing.review_topics,
    types: mergedTypes.size > 0 ? [...mergedTypes] : undefined,
    updated_at: captured.updated_at || new Date().toISOString(),
  };
}

function canonicalizePlaceName(value: string): string {
  return value.replace(/\+/g, ' ').trim().toLowerCase();
}

function roundedCoordinateIdentity(coordinates?: { lat: number; lng: number }): string | null {
  if (!coordinates) return null;
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null;
  return `${coordinates.lat.toFixed(5)},${coordinates.lng.toFixed(5)}`;
}

export function normalizePlaceIdentity(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isGoogleMaps = host === 'maps.google.com' || /(^|\.)google\.[a-z.]{2,}$/.test(host);
    if (isGoogleMaps) {
      const explicitPlaceId = parsed.searchParams.get('query_place_id') || parsed.searchParams.get('cid');
      if (explicitPlaceId) return `g:pid:${explicitPlaceId.toLowerCase()}`;

      const placeMatch = /\/maps\/place\/([^/]+)/.exec(parsed.pathname);
      let placeName = '';
      if (placeMatch?.[1]) {
        try { placeName = decodeURIComponent(placeMatch[1]); } catch { placeName = placeMatch[1]; }
      }
      const coordinateMatch = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(`${parsed.pathname}${parsed.hash}`);
      if (coordinateMatch) {
        const lat = Number(coordinateMatch[1]);
        const lng = Number(coordinateMatch[2]);
        const geo = roundedCoordinateIdentity({ lat, lng });
        if (geo) return `g:${canonicalizePlaceName(placeName || 'place')}@${geo}`;
      }

      const query = parsed.searchParams.get('query') || parsed.searchParams.get('q');
      if (query) return `g:name:${canonicalizePlaceName(query)}`;
      if (placeName) return `g:name:${canonicalizePlaceName(placeName)}`;
    }
    parsed.hash = '';
    return `u:${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {}
  return `u:${trimmed.toLowerCase()}`;
}

export function placeIdentityKey(tripId: string, sourceUrl: string): string {
  return `${tripId}::${normalizePlaceIdentity(sourceUrl)}`;
}

export function findExistingTripPlace(
  places: PlannerTripPlace[],
  tripId: string,
  sourceUrl: string,
  sourcePlaceId?: string,
  coordinates?: { lat: number; lng: number },
): PlannerTripPlace | undefined {
  const probeKeys = new Set(getStrongPlaceIdentityKeys({
    source_provider: inferSourceProvider(sourceUrl),
    source_place_id: sourcePlaceId,
    source_url: sourceUrl,
    coordinates,
  }));
  if (probeKeys.size === 0) return undefined;

  return places
    .filter((place) => place.trip_id === tripId)
    .find((place) => getStrongPlaceIdentityKeys(place).some((key) => probeKeys.has(key)));
}

export function cleanCanonicalTitle(title?: string | null): string {
  if (!title) return '';
  return title
    .replace(/^[\p{Emoji}\p{Symbol}\s·•\-🍜☕🏨📍⭐🏷️]+/u, '')
    .replace(/[\p{Emoji}\p{Symbol}\s·•\-🍜☕🏨📍⭐🏷️]+$/u, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function extractPlaceCid(place: { source_place_id?: string | null; source_url?: string | null }): string | null {
  if (place.source_place_id) {
    const match = /:0x([0-9a-f]+)$/i.exec(place.source_place_id.trim());
    if (match?.[1]) {
      try {
        return BigInt('0x' + match[1]).toString();
      } catch {}
    }
    if (/^\d{8,}$/.test(place.source_place_id.trim())) {
      return place.source_place_id.trim();
    }
    if (/^ChIJ[A-Za-z0-9_-]{8,}$/.test(place.source_place_id.trim())) {
      return place.source_place_id.trim().toLowerCase();
    }
  }
  if (place.source_url) {
    try {
      const url = new URL(place.source_url);
      const cid = url.searchParams.get('cid');
      if (cid && /^\d+$/.test(cid)) return cid;
      const qpid = url.searchParams.get('query_place_id');
      if (qpid) return qpid.toLowerCase();
    } catch {}
    const fidMatch = /0x[0-9a-f]+:0x([0-9a-f]+)/i.exec(place.source_url);
    if (fidMatch?.[1]) {
      try {
        return BigInt('0x' + fidMatch[1]).toString();
      } catch {}
    }
  }
  return null;
}

export interface SuspectedDuplicatePair {
  pairId: string;
  reason: string;
  score: number;
  distanceMeters?: number;
  primaryPlace: PlannerTripPlace;
  secondaryPlace: PlannerTripPlace;
}

export function detectSuspectedDuplicatePlaces(
  places: PlannerTripPlace[],
): SuspectedDuplicatePair[] {
  const results: SuspectedDuplicatePair[] = [];
  const n = places.length;

  for (let i = 0; i < n; i++) {
    const p1 = places[i];
    const t1 = cleanCanonicalTitle(p1.title);
    const phone1 = p1.phone?.replace(/\D+/g, '');

    for (let j = i + 1; j < n; j++) {
      const p2 = places[j];
      if (p1.trip_id !== p2.trip_id) continue;

      const t2 = cleanCanonicalTitle(p2.title);
      const phone2 = p2.phone?.replace(/\D+/g, '');
      if (haveConflictingStrongPlaceIdentity(p1, p2)) continue;

      let reason = '';
      let score = 0;
      let distMeters: number | undefined;

      // 1. Same Place ID or CID
      if (shareStrongPlaceIdentity(p1, p2)) {
        reason = 'Google Place ID / CID 一致';
        score = 1.0;
      }
      // 2. Exact or Substring Title Match
      else if (t1 && t2 && (t1 === t2 || (t1.length >= 4 && t2.includes(t1)) || (t2.length >= 4 && t1.includes(t2)))) {
        reason = t1 === t2 ? '地点名称完全一致' : '地点名称高度包含相似';
        score = 0.95;
      }
      // 3. Same Phone number (at least 7 digits)
      else if (phone1 && phone2 && phone1.length >= 7 && phone1 === phone2) {
        reason = `联系电话一致 (${p1.phone})`;
        score = 0.9;
      }
      // 4. Same URL Identity
      else if (p1.source_url && p2.source_url && normalizePlaceIdentity(p1.source_url) === normalizePlaceIdentity(p2.source_url)) {
        reason = '来源链接归一化指向同一地点';
        score = 0.9;
      }
      // 5. GPS Proximity (< 80m) + (same category or common token)
      else if (p1.coordinates && p2.coordinates) {
        const distKm = haversineDistanceKm(p1.coordinates, p2.coordinates);
        distMeters = Math.round(distKm * 1000);
        if (distKm <= 0.08) {
          const tokens1 = t1.split(/\s+/).filter((w) => w.length >= 2);
          const tokens2 = t2.split(/\s+/).filter((w) => w.length >= 2);
          const hasCommonToken = tokens1.some((w) => tokens2.includes(w));
          const sameCategory = p1.source_category && p2.source_category && p1.source_category === p2.source_category;
          const sameKind = p1.kind === p2.kind;

          if (hasCommonToken || (distKm <= 0.03 && (sameCategory || sameKind))) {
            reason = `地理位置重合（距离仅 ${distMeters} 米）${hasCommonToken ? '且名称包含共同词汇' : ''}`;
            score = 0.85;
          }
        }
      }

      if (score >= 0.8) {
        const p1Score = (p1.observed_review_count ?? 0) + (p1.address ? 100 : 0) + (p1.open_hours ? 50 : 0);
        const p2Score = (p2.observed_review_count ?? 0) + (p2.address ? 100 : 0) + (p2.open_hours ? 50 : 0);
        const [primaryPlace, secondaryPlace] = p1Score >= p2Score ? [p1, p2] : [p2, p1];

        results.push({
          pairId: [p1.id, p2.id].sort().join('--'),
          reason,
          score,
          distanceMeters: distMeters,
          primaryPlace,
          secondaryPlace,
        });
      }
    }
  }

  return results;
}

function escapeCdata(text: string): string {
  return text.replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function csvSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function getTripAreaCounts(places: PlannerTripPlace[]): Array<{ area: string; count: number }> {
  const counts = new Map<string, number>();
  for (const place of places) {
    const area = place.area?.trim();
    if (!area) continue;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((left, right) => right.count - left.count || left.area.localeCompare(right.area));
}

function directionsUrl(stops: Array<PlannerTripPlace | PlannerScheduledPlace>, travelMode: PlannerTrip['transport_mode']): string {
  if (stops.length === 0) return '';
  if (stops.length === 1) {
    const query = encodeURIComponent(stops[0].title);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  const waypoints = stops.slice(1, -1).map((place) => place.title).join('|');
  const params = new URLSearchParams({
    api: '1',
    origin: stops[0].title,
    destination: stops[stops.length - 1].title,
    travelmode: travelMode ?? 'transit',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsDirectionsSegments(
  places: PlannerScheduledPlace[],
  travelMode: PlannerTrip['transport_mode'] = 'transit',
): string[] {
  const scheduled = sortPlannerScheduledPlaces(places);
  if (scheduled.length === 0) return [];
  if (scheduled.length <= 5) return [directionsUrl(scheduled, travelMode)];

  const segments: string[] = [];
  for (let index = 0; index < scheduled.length - 1; index += 4) {
    const slice = scheduled.slice(index, Math.min(index + 5, scheduled.length));
    if (slice.length >= 2) segments.push(directionsUrl(slice, travelMode));
  }
  return segments;
}

export function normalizeDelimitedText(value: string): string[] {
  return value
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

export function inferPlaceKind(category?: string): PlannerPlaceKind {
  if (!category || !category.trim()) return 'other';
  const lower = category.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

  // 0. Special compound disambiguations:
  // e.g. "hotel restaurant", "hotel bar", "hotel cafe", "ski resort", "food court"
  if (/\b(?:hotel\s*restaurant|hotel\s*dining|hotel\s*bistro|hotel\s*bar|food\s*court|hawker\s*centre|hawker\s*center)\b|酒店餐厅|饭店餐厅|美食广场|大食代/i.test(lower)) {
    return 'food';
  }
  if (/\b(?:hotel\s*cafe|hotel\s*coffee|hotel\s*bakery|hotel\s*lounge)\b|酒店咖啡|酒店下午茶/i.test(lower)) {
    return 'cafe';
  }
  if (/\b(?:ski\s*resort|golf\s*resort|spa\s*resort)\b|滑雪场|滑雪度假村|温泉度假区/i.test(lower)) {
    return 'experience';
  }
  if (/\b(?:beach|waterfall|viewpoint|lookout|mountain|peak|island)\b|海滩|沙滩|瀑布|观景台|展望台/i.test(lower) && !/\b(?:resort|hotel|hostel|villas?|suites?|inn|ryokan|homestay)\b|度假村|度假酒店|酒店|旅馆|民宿/i.test(lower)) {
    return 'attraction';
  }

  // 1. Lodging & Stays (Hotels, Resorts, Villas, Hostels, Ryokans, Serviced Apartments, Brands like Oakwood/IHG/Marriott/UHG/Avani, etc.)
  // Evaluated before generic dining so hotels with in-house restaurants/bars (tagged with 'restaurant' in Google Maps types) are not misclassified as food
  if (
    /\b(?:hotel|resort|hostel|inn|ryokan|stay|motel|poshtel|chalet|lodge|cabin|glamping|pension|aparthotel|minshuku|ihg|uhg|marriott|hilton|hyatt|accor|sheraton|kempinski|intercontinental|novotel|ibis|mercure|aman|capella|rosewood|anantara|avani|fairmont|peninsula|pullman|sofitel|aloft|moxy|atour|hanting|ji\s*hotel|citadines|somerset|ascott|dusit|six\s*senses|belmond|outrigger|centara|centre\s*point|chatrium|sindhorn|salil|asai|the\s*quarter|quarter\s*hotel|holiday\s*inn|crowne\s*plaza|doubletree|waldorf\s*astoria|conrad|curio|canopy|tapestry|mgallery|swissotel|adagio|oakwood|pan\s*pacific|parkroyal|fraser|mandarin\s*oriental|shangri-la|four\s*seasons|ritz-carlton|st\.\s*regis|w\s*hotel|westin|radisson|banyan\s*tree|m[oö]venpick|le\s*m[eé]ridien|guesthouse|guest\s*house|lodging|accommodation|suites?|villas?|residence|homestay|serviced\s*apartment|b&b|bed\s*(&|and)\s*breakfast|capsule\s*hotel|love\s*hotel|machiya|hanok|riad|agriturismo|campground|rv\s*park|\d\s*[-–—]?\s*stars?\s*hotel)\b|호텔|리조트|게스트하우스|펜션|모텔|민박|호스텔|한옥|โรงแรม|ที่พัก|รีสอร์ท|โฮสเทล|เกสต์เฮาส์|วิลล่า|บังกะโล|ม่านรูด|ホテル|旅館|民宿|宿|ペンション|ゲストハウス|カプセルホテル|湯宿|坊|酒店|旅馆|民宿|客栈|青旅|青年旅舍|度假村|度假酒店|温泉旅馆|公寓式酒店|星级酒店|精品酒店|宾馆|别馆|营地|庄园|驿站|招待所|万豪|希尔顿|凯悦|洲际|喜来登|香格里拉|四季酒店|丽思卡尔顿|瑞吉|文华东方|半岛酒店|悦榕庄|安纳塔拉|亚朵|全季|汉庭|如家|锦江之星|桔子酒店|khách\s*sạn|hôtel|albergue|posada|parador|pousada|albergo/i.test(lower)
  ) {
    return 'stay';
  }

  // 2. Transit & Transportation (Airports, Train Stations, Metro, Piers, Ferries)
  // Evaluated before food/shopping so stations with restaurants/shops are classified as transit
  if (
    /\b(?:station|subway|metro|train|railway|bus|bus\s*stop|bus\s*terminal|airport|terminal|ferry|transit|pier|port|tram|heliport|harbor|harbour|dock|cable\s*car|ropeway|funicular|monorail|interchange|jetty|depot|transit_station|train_station|subway_station|bus_station)\b|공항|기차역|지하철역|정류장|터미널|선착장|สถานี|ท่าเรือ|สนามบิน|รถไฟฟ้า|สถานีรถไฟ|ป้ายรถเมล์|ขนส่ง|駅|地下鉄|空港|港|バスターミナル|乗り場|フェリー|ロープウェイ|ケーブルカー|车站|地铁|地铁站|机场|码头|火车站|公交|公交站|客运|缆车|中转|口岸|轮渡|渡轮|航站楼|站台|渡口|高铁站|轻轨|客运站|乘车点|bến\s*xe|nhà\s*ga|sân\s*bay|bến\s*tàu|gare|estación|aeroporto|stazione|flughafen/i.test(lower)
  ) {
    return 'transit';
  }

  // 3. Shopping, Malls, Supermarkets, Markets, Boutiques
  // Evaluated before generic food so shopping malls/night markets with dining are classified as shopping
  if (
    /\b(?:store|mall|shopping\s*mall|shopping\s*center|shopping\s*centre|market|supermarket|bazaar|outlet|outlet\s*mall|plaza|boutique|grocer|grocery|vintage|thrift|department\s*store|gift\s*shop|souvenir|bookstore|book\s*shop|pharmacy|drugstore|convenience\s*store|duty\s*free|flea\s*market|night\s*market|weekend\s*market|emporium|galleria|arcade|retail|don\s*quijote|donki|matsumoto\s*kiyoshi|bic\s*camera|yodobashi|daiso|muji|uniqlo|shopping_mall|department_store|supermarket|grocery_or_supermarket|convenience_store)\b|마트|백화점|쇼핑몰|시장|야시장|올리브영|면세점|편의점|아울렛|ตลาด|ห้าง|ซูเปอร์มาร์เก็ต|ตลาดนัด|ตลาดกลางคืน|ร้านค้า|ร้านขายยา|モール|ショッピング|百貨店|デパート|スーパー|市場|商店街|ドラッグストア|薬局|本屋|書店|免税店|ドン・キホーテ|マツモトキヨシ|アウトレット|ビッグカメラ|ヨドバシ|ダイソー|無印良品|ユニクロ|商场|购物中心|超市|购物|市场|百货|商店|奥特莱斯|免税店|便利店|书店|药妆|药妆店|药局|夜市|集市|市集|杂货|杂货店|商业街|专卖店|步行街|批发市场|堂吉诃德|唐吉诃德|松本清|大国药妆|无印良品|优衣库|文具店|杂物社|chợ|siêu\s*thị|tienda|mercado|centro\s*comercial|grand\s*magasin/i.test(lower)
  ) {
    return 'shopping';
  }

  // 4. Experience, Wellness, Sports, Activities (Spas, Massages, Onsen, Theme Parks, Cooking Classes, Cruises, Martial Arts)
  if (
    /\b(?:spa|massage|onsen|sauna|wellness|foot\s*massage|thai\s*massage|diving|scuba|snorkeling|ski|skiing|snowboard|surfing|climbing|bouldering|hiking|trekking|rafting|karting|go-kart|safari|workshop|class|cooking\s*class|pottery|tour|boat\s*tour|cruise|dinner\s*cruise|kayak|kayaking|canoeing|paragliding|zipline|skydive|skydiving|bungee|bowling|golf|gym|fitness|yoga|camp|camping|experience|activity|hot\s*spring|bathhouse|sento|jimjilbang|amusement\s*park|theme\s*park|water\s*park|escape\s*room|board\s*game|shooting\s*range|archery|horse\s*riding|atv|quad\s*bike|martial\s*arts|boxing|muay\s*thai|karate|taekwondo|judo|jiu\s*jitsu|kickboxing|disney|disneyland|disneysea|universal\s*studios|usj|warner\s*bros|legoland|fuji-q|lotte\s*world|everland)\b|스파|마사지|찜质방|온천|테마파크|스키장|원데이클래스|체험|액티비티|스쿠버|다이빙|스ปา|นวด|นวดแผนไทย|ออนเซ็น|ดำน้ำ|กิจกรรม|สวนสนุก|สวนน้ำ|温泉|銭湯|露天風呂|スパ|マッサージ|サウナ|体験|スキー|ダイビング|ツアー|遊園地|アクティビティ|教室|体验|活动|按摩|水疗|温泉|足浴|足疗|泰式按摩|盲人按摩|日归温泉|钱汤|汗蒸|潜水|冲浪|滑雪|徒步|漂流|游乐园|主题公园|水上乐园|工坊|课程|手作|烹饪课|陶艺|卡丁车|密室|密室逃脱|剧本杀|游船|跳伞|滑翔伞|热气球|射击|骑马|越野|丛林飞跃|蹦极|高尔夫|健身|健身房|瑜伽|采摘|研学|武术学校|泰拳|拳击|武馆|柔术|跆拳道|迪士尼|环球影城|乐高乐园|富士急|bains\s*thermaux|balneario/i.test(lower)
  ) {
    return 'experience';
  }

  // 5. Cafes, Bakeries, Coffee, Dessert, Tea (Checked before general dining so coffee shops don't get swallowed into generic food)
  if (
    /\b(?:cafe|café|coffee|roastery|espresso|boba|bubble\s*tea|milk\s*tea|matcha|patisserie|pâtisserie|chocolatier|gelateria|gelato|waffle|pancake|crepe|crêpe|creperie|crêperie|tea\s*house|tea\s*room|tea\s*salon|salon\s*de\s*thé|dessert|bakery|boulangerie|ice\s*cream|pastry|donut|doughnut|bagel|juice\s*bar|smoothie|acai|arabica|starbucks|blue\s*bottle|doutor|komeda|tully'?s|luckin|cotti|manner|seesaw|heytea|nayuki|chagee|gong\s*cha|koi\s*th[eé]|mixue|châteraisé|chateraise|ladur[eé]e|pierre\s*herm[eé]|harbs|after\s*you)\b|카페|커피|디저트|베이커리|찻집|빙수|제과점|คาเฟ่|กาแฟ|ชา|ขนม|เบเกอรี่|ไอศกรีม|ร้านกาแฟ|ชานม|ร้านเค้ก|カフェ|喫茶|喫茶店|コーヒー|珈琲|スイーツ|ベーカリー|ケーキ|洋菓子|和菓子|甘味処|茶屋|パン屋|咖啡|甜品|奶茶|面包|烘焙|茶室|茶馆|茶饮|冰淇淋|冰品|蛋糕|糕点|点心局|下午茶|糖水|糖水铺|饮品|咖啡馆|咖啡厅|手冲|烘焙坊|甜品店|星巴克|瑞幸|库迪|霸王茶姬|喜茶|奈雪|一点点|蜜雪冰城|茶颜悦色|古茗|茶百道|tiệm\s*cà\s*phê|quán\s*trà/i.test(lower)
  ) {
    return 'cafe';
  }

  // 6. Food, Dining, Restaurants, Bars, Street Food, Cuisines
  if (
    /\b(?:restaurant|cuisine|dining|food|kitchen|eatery|diner|ramen|sushi|izakaya|bar|pub|bistro|steak|steakhouse|grill|bbq|barbecue|noodle|noodles|noodle\s*shop|noodle\s*bar|noodle\s*house|buffet|tavern|pizzeria|pizza|burger|burgers|tacos|taqueria|taquería|trattoria|osteria|brasserie|cucina|seafood|hotpot|hot\s*pot|brunch|curry|tabelog|gastropub|brewery|microbrewery|yakitori|tempura|tonkatsu|shabu|shabu-shabu|udon|soba|dim\s*sum|dimsum|dumpling|dumplings|tapas|bento|skewer|skewers|poke|ceviche|rotisserie|warung|kopitiam|hawker|canteen|chophouse|fondue|cantina|churrascaria|shawarma|kebab|falafel|pho|banh\s*mi|pad\s*thai|som\s*tum|tom\s*yum|khao\s*soi|kuay\s*tiew|kway\s*teow|kuey\s*teow|boat\s*noodle|mookata|moo\s*kata|suki|sukiyaki|satay|roti|bak\s*kut\s*teh|khao\s*man\s*gai|khao\s*kha\s*moo|khao\s*pad|chicken\s*rice|yakiniku|kaiseki|kappo|omakase|teppanyaki|robatayaki|chirashi|gyoza|bao|donburi|yakisoba|unagi|kushikatsu|bodega)\b|wine\s*bar|cocktail|cantonese|sichuan|thai\s*food|street\s*food|night\s*market\s*food|fine\s*dining|casual\s*dining|ethnic\s*cuisine|local\s*cuisine|regional\s*cuisine|식당|맛집|고기집|삼겹살|갈비|치킨|포차|주점|분식|찌개|국밥|냉면|떡볶이|짜장면|곱창|해물|불고기|비빔밥|순두부|ร้านอาหาร|อาหาร|ก๋วยเตี๋ยว|ข้าวมันไก่|ส้มตำ|บาร์|ข้าวซอย|ต้มยำ|ผัดไทย|หมูกระทะ|ชาบู|ปิ้งย่าง|อาหารไทย|ซีฟู้ด|ร้านเหล้า|ラーメン|焼肉|寿司|うどん|そば|天ぷら|割烹|食堂|定食|居酒屋|焼き鳥|焼鸟|鍋|懐石|会席|おでん|立ち飲み|中華|洋食|和食|海鮮|とんかつ|串カツ|すき焼き|しゃぶしゃぶ|鉄板焼|うなぎ|蕎麦|餐厅|餐馆|料理|美食|小吃|拉面|米线|面馆|面条|面食|粉面|船面|咖喱面|牛肉面|云吞面|板面|车仔面|生粉|炒面|捞面|汤面|米粉|河粉|火锅|烧烤|烤肉|酒吧|居酒屋|酒场|快餐|大排档|早茶|熟食|排档|海鲜|日料|韩料|泰餐|西餐|粤菜|川菜|湘菜|鲁菜|淮扬菜|浙菜|闽菜|徽菜|家常菜|烤鸭|刺身|烧鸟|铁板烧|串烧|居食屋|私房菜|茶餐厅|酒馆|宵夜|夜市美食|烧腊|汤包|生煎|抄手|串串|冒菜|烤鱼|肉骨茶|砂锅|大排挡|馄饨|饺子|卤味|烧鹅|鳗鱼饭|猪脚饭|海南鸡饭|quán\s*ăn|nhà\s*hàng|quán\s*nhậu|restaurante|ristorante/i.test(lower)
  ) {
    return 'food';
  }

  // 7. Attractions, Sightseeing, Heritage, Culture, Nature (Beaches, Mountains, Islands, Temples)
  if (
    /\b(?:museum|temple|shrine|taisha|church|cathedral|mosque|synagogue|pagoda|monastery|wat|park|national\s*park|attraction|tourist\s*attraction|monument|landmark|castle|palace|imperial\s*palace|royal\s*palace|garden|botanical\s*garden|tower|tourist|historic|historical|heritage|unesco|ruins|gallery|art\s*gallery|beach|bay|coast|cove|shoreline|beachfront|viewpoint|lookout|observatory|observation\s*deck|skydeck|waterfall|island|lake|mountain|peak|canyon|gorge|cave|plaza|square|scenic|statue|bridge|zoo|safari\s*park|aquarium|botanical|sanctuary|nature\s*reserve|historic\s*site|old\s*town|ancient\s*town)\b|박물관|미술관|궁전|경복궁|창덕궁|타워|전망대|해변|해수욕장|사찰|유적지|วัด|พิพิธภัณฑ์|พระราชวัง|พระบรมมหาราชวัง|สวน|สวนสาธารณะ|อุทยานแห่งชาติ|หาด|ภูเขา|น้ำตก|จุดชมวิว|ปราสาท|โบราณสถาน|寺院|神社|城|庭園|公園|展望台|滝|島|湖|山|渓谷|水族館|動物園|美術館|博物館|名所|史跡|旧跡|鳥居|天守|大社|景点|景区|寺|寺庙|庙|禅寺|神社|鸟居|教堂|大教堂|博物馆|纪念馆|展览馆|公园|国立公园|国家公园|观光|古迹|遗址|城堡|城址|天守阁|皇宫|宫殿|行宫|塔|电视塔|钟楼|鼓楼|美术馆|艺术馆|沙滩|海滩|滩|海湾|海岸|海滨|沙洲|观景台|展望台|天空之镜|瀑布|岛|海岛|湖|湖泊|山|峡谷|地标|广场|风景区|动物园|水族馆|植物园|大桥|胜地|故居|陵园|古镇|老街|古城|名胜|chùa|đền|bảo\s*tàng|công\s*viên|bãi\s*biển|thác\s*nước|château|musée|cathédrale|plage|mirador|palazzo|duomo|monument/i.test(lower)
  ) {
    return 'attraction';
  }

  // 8. Services (ATMs, pharmacies, clinics, laundromats, convenience stores, post offices, repair shops)
  if (
    /\b(?:atm|bank|pharmacy|chemist|drugstore|clinic|hospital|medical|health|doctor|dentist|laundromat|laundry|dry\s*clean|convenience\s*store| cvs|7-?eleven|family\s*mart|lawson|mini\s*stop|post\s*office|邮局|repair|fix|key\s*cutting|notary|embassy|consulate|visa|coworking|coworking\s*space|internet\s*cafe| printing|copy\s*shop|car\s*wash|gas\s*station|petrol|parking|charger|charging\s*station|ev\s*charger)\b|银行|atm|药房|药店|诊所|医院|卫生所|体检|洗衣|干洗|便利店|超市|杂货|邮局|修车|汽车维修|手机维修|快递|打印|复印|加油站|充电桩|停车|保安|物业|旅行社|签证|大使馆|领事馆|共办公|共享办公|网吧|网吧|虾皮|药局|西药房|中药房|医疗|康复|牙科|眼科|皮肤科| Reformas|farmacia|clinic|lavandería|correos|gasolinera|estación\s*de\s*servicio/i.test(lower)
  ) {
    return 'service';
  }

  // Default to other for truly unclassified POIs
  return 'other';
}

/**
 * Maps a Google Places API types array to an Ownly place kind.
 * Priority order: experience → stay → transit → shopping → cafe → food → attraction → other
 *
 * @see https://developers.google.com/maps/documentation/places/web-service/place-types
 */
export function mapGoogleTypesToOwnlyKind(types: string[]): PlannerPlaceKind {
  if (!types.length) return 'other';
  const joined = types.join(' ').toLowerCase();

  // 1. Experience (theme parks, spas, activities)
  if (/amusement_park|stadium|aquarium|zoo|spa|gym|bowling|casino|night_club/.test(joined)) return 'experience';

  // 2. Stay (lodging)
  if (/lodging|hotel|hostel|resort|rv_park|campground/.test(joined)) return 'stay';

  // 3. Transit (transport hubs)
  if (/transit_station|subway_station|train_station|bus_station|airport|ferry_terminal|parking/.test(joined)) return 'transit';

  // 4. Shopping
  if (/shopping_mall|department_store|supermarket|convenience_store|grocery_or_supermarket|clothing_store|electronics_store|furniture_store|hardware_store|home_goods_store|jewelry_store|liquor_store|shoe_store|variety_store|pet_store/.test(joined)) return 'shopping';

  // 5. Cafe (coffee, bakery, dessert)
  if (/cafe|bakery|coffee_shop|ice_cream/.test(joined)) return 'cafe';

  // 6. Food (restaurants, bars)
  if (/restaurant|bar|food|meal_takeaway|meal_delivery/.test(joined)) return 'food';

  // 7. Attraction (tourism, culture, nature)
  if (/tourist_attraction|museum|art_gallery|church|mosque|synagogue|temple|natural_feature|park|point_of_interest|premise|neighborhood/.test(joined)) return 'attraction';

  // 8. Service (health, finance, government)
  if (/hospital|pharmacy|bank|atm|dentist|doctor|veterinary_care|post_office|police|fire_station|gas_station|car_dealer|car_repair|car_wash/.test(joined)) return 'service';

  return 'other';
}

export function inferSourceProvider(url: string): PlannerPlaceSourceProvider {
  if (/google\.[a-z.]+\/travel/i.test(url)) return 'google_travel';
  if (/google\.[a-z.]+\/maps|maps\.google\./i.test(url)) return 'google_maps';
  if (/tabelog\.com/i.test(url)) return 'tabelog';
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'xiaohongshu';
  if (/booking\.com/i.test(url)) return 'booking';
  return 'other';
}

export function checkOpeningHoursCollision(
  openHours?: string,
  scheduledDate?: string,
  preferredWindow?: string,
): { isCollision: boolean; reason?: string } {
  if (!openHours) return { isCollision: false };

  // 1. Day of week collision
  if (scheduledDate) {
    const date = parseDateOnly(scheduledDate);
    if (date) {
      const dayIndex = date.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayNamesZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

      const currentDayEn = dayNamesEn[dayIndex];
      const currentDayZh = dayNamesZh[dayIndex];
      const lowerHours = openHours.toLowerCase();

      const isMonClosed = dayIndex === 1 && (/mon(day)?:\s*(closed|休)|周一(闭馆|休息|休)|星期一(闭馆|休息|休)|定休日[：:]?\s*月/i.test(lowerHours));
      const isTueClosed = dayIndex === 2 && (/tue(sday)?:\s*(closed|休)|周二(闭馆|休息|休)|星期二(闭馆|休息|休)|定休日[：:]?\s*火/i.test(lowerHours));
      const isWedClosed = dayIndex === 3 && (/wed(nesday)?:\s*(closed|休)|周三(闭馆|休息|休)|星期三(闭馆|休息|休)|定休日[：:]?\s*水/i.test(lowerHours));
      const isThuClosed = dayIndex === 4 && (/thu(rsday)?:\s*(closed|休)|周四(闭馆|休息|休)|星期四(闭馆|休息|休)|定休日[：:]?\s*木/i.test(lowerHours));
      const isFriClosed = dayIndex === 5 && (/fri(day)?:\s*(closed|休)|周五(闭馆|休息|休)|星期五(闭馆|休息|休)|定休日[：:]?\s*金/i.test(lowerHours));
      const isSatClosed = dayIndex === 6 && (/sat(urday)?:\s*(closed|休)|周六(闭馆|休息|休)|星期六(闭馆|休息|休)|定休日[：:]?\s*土/i.test(lowerHours));
      const isSunClosed = dayIndex === 0 && (/sun(day)?:\s*(closed|休)|周日(闭馆|休息|休)|星期日(闭馆|休息|休)|定休日[：:]?\s*日/i.test(lowerHours));

      if (isMonClosed || isTueClosed || isWedClosed || isThuClosed || isFriClosed || isSatClosed || isSunClosed) {
        return {
          isCollision: true,
          reason: `${currentDayZh}通常休息 (${currentDayEn} Closed)`,
        };
      }
    }
  }

  // 2. Preferred window vs Open Hours time conflict
  if (preferredWindow) {
    const lowerWindow = preferredWindow.toLowerCase().trim();
    const lowerHours = openHours.toLowerCase();

    // Check evening/night window collision when hours indicate closing early (<= 17:30)
    if (lowerWindow === 'night' || lowerWindow === 'evening' || /晚上|夜间|傍晚/.test(lowerWindow)) {
      const closingMatch = /(?:~|-|至|到)\s*(0?\d|1[0-7]):([0-5]\d)/.exec(lowerHours);
      const closingHour = closingMatch ? Number(closingMatch[1]) : null;
      if (closingMatch && closingHour !== null && closingHour >= 6 && closingHour <= 17 && !/(?:2[0-4]|1[8-9]):[0-5]\d/.test(lowerHours) && !/24小时|24\s*hours/i.test(lowerHours)) {
        return {
          isCollision: true,
          reason: `地点约 ${closingMatch[1]}:${closingMatch[2]} 闭馆，傍晚/夜间不开放`,
        };
      }
    }

    // Check morning window collision when hours indicate opening late (>= 16:00)
    if (lowerWindow === 'morning' || /上午|早晨/.test(lowerWindow)) {
      const openingMatch = /(?:从|open|营业|:\s*)?\s*(1[6-9]|2[0-3]):([0-5]\d)\s*(?:~|-|至|到)/.exec(lowerHours);
      if (openingMatch && !/24小时|24\s*hours/i.test(lowerHours)) {
        return {
          isCollision: true,
          reason: `地点约 ${openingMatch[1]}:${openingMatch[2]} 开始营业，上午不开放`,
        };
      }
    }
  }

  return { isCollision: false };
}

export interface DayScheduleCollisionSummary {
  hasCollision: boolean;
  placeCollisions: Record<string, { isCollision: boolean; reason?: string }>;
  totalDurationMinutes: number;
  isOverloaded: boolean;
  overloadReason?: string;
  longTransits: Array<{ fromTitle: string; toTitle: string; distanceKm: number; warning: string }>;
}

export function checkDayScheduleCollisions(
  places: PlannerScheduledPlace[],
  date: string,
): DayScheduleCollisionSummary {
  const scheduled = sortPlannerScheduledPlaces(places.filter((p) => p.scheduled_date === date));
  const placeCollisions: Record<string, { isCollision: boolean; reason?: string }> = {};
  let hasCollision = false;
  let totalDurationMinutes = 0;

  scheduled.forEach((p) => {
    const col = checkOpeningHoursCollision(p.open_hours, date, p.preferred_window);
    if (col.isCollision) {
      placeCollisions[p.id] = col;
      hasCollision = true;
    }
    if (p.duration_minutes && p.duration_minutes > 0) totalDurationMinutes += p.duration_minutes;
  });

  const isOverloaded = totalDurationMinutes > 600; // > 10 hours
  const overloadReason = isOverloaded
    ? `单日预估活动耗时约 ${(totalDurationMinutes / 60).toFixed(1)} 小时，日程可能过紧`
    : undefined;
  if (isOverloaded) hasCollision = true;

  const longTransits: Array<{ fromTitle: string; toTitle: string; distanceKm: number; warning: string }> = [];
  for (let i = 0; i < scheduled.length - 1; i++) {
    const c1 = extractPlaceCoordinates(scheduled[i]);
    const c2 = extractPlaceCoordinates(scheduled[i + 1]);
    if (c1 && c2) {
      const dist = haversineDistanceKm(c1, c2);
      if (dist > 20) {
        longTransits.push({
          fromTitle: scheduled[i].title,
          toTitle: scheduled[i + 1].title,
          distanceKm: dist,
          warning: `跨区移动距离较远 (${dist.toFixed(1)} km)，建议合理安排交通`,
        });
        hasCollision = true;
      }
    }
  }


  return {
    hasCollision,
    placeCollisions,
    totalDurationMinutes,
    isOverloaded,
    overloadReason,
    longTransits,
  };
}

export function buildGoogleMapsRouteUrl(
  stops: Array<PlannerTripPlace | PlannerScheduledPlace>,
  travelMode: PlannerTrip['transport_mode'] = 'transit',
): string {
  if (stops.length === 0) return '';
  if (stops.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0].address || stops[0].title)}`;
  }
  const origin = encodeURIComponent(stops[0].address || stops[0].title);
  const destination = encodeURIComponent(stops[stops.length - 1].address || stops[stops.length - 1].title);
  const waypoints = stops.slice(1, -1).map((p) => encodeURIComponent(p.address || p.title)).join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${travelMode}`;
  if (waypoints) {
    url += `&waypoints=${waypoints}`;
  }
  return url;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportPlacesToKML(tripTitle: string, dateOrDay: string, places: Array<PlannerTripPlace | PlannerScheduledPlace>): string {
  const placemarks = places.map((place, index) => {
    const description = escapeCdata(`
        <p><b>类别:</b> ${escapeXml(place.kind)}</p>
        ${place.observed_rating ? `<p><b>评分:</b> ★ ${place.observed_rating}</p>` : ''}
        ${place.observed_price ? `<p><b>人均:</b> ${escapeXml(place.observed_price)}</p>` : ''}
        ${place.why ? `<p><b>理由:</b> ${escapeXml(place.why)}</p>` : ''}
        ${place.notes ? `<p><b>备注:</b> ${escapeXml(place.notes)}</p>` : ''}
        ${place.address ? `<p><b>地址:</b> ${escapeXml(place.address)}</p>` : ''}
        ${place.phone ? `<p><b>电话:</b> ${escapeXml(place.phone)}</p>` : ''}
        ${place.plus_code ? `<p><b>Plus Code:</b> ${escapeXml(place.plus_code)}</p>` : ''}
        ${place.menu_url ? `<p><b>菜单:</b> ${escapeXml(place.menu_url)}</p>` : ''}
        ${place.reservation_url ? `<p><b>预订:</b> ${escapeXml(place.reservation_url)}</p>` : ''}
        ${place.source_url ? `<p><a href="${escapeXml(place.source_url)}">Google Maps 链接</a></p>` : ''}
      `);
    const coordXml = place.coordinates && Number.isFinite(place.coordinates.lat) && Number.isFinite(place.coordinates.lng)
      ? `\n      <Point><coordinates>${place.coordinates.lng},${place.coordinates.lat},0</coordinates></Point>`
      : '';
    return `
    <Placemark>
      <name>${index + 1}. ${escapeXml(place.title)}</name>
      <description><![CDATA[${description}]]></description>
      ${place.address ? `<address>${escapeXml(place.address)}</address>` : ''}${coordXml}
    </Placemark>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(tripTitle)} - ${escapeXml(dateOrDay)}</name>
    <description>Ownly Travel Planner Route Export</description>
    ${placemarks}
  </Document>
</kml>`;
}

export function exportPlacesToCSV(places: Array<PlannerTripPlace | PlannerScheduledPlace>): string {
  const headers = ['Order', 'Title', 'Kind', 'Rating', 'Price', 'Address', 'Why', 'Notes', 'Tags', 'Google_Maps_URL', 'Phone', 'Plus_Code', 'Menu_URL', 'Reservation_URL', 'Date', 'Start_Time', 'Duration_Min'];
  const cell = (value: string) => `"${csvSafeCell(value.replace(/"/g, '""'))}"`;
  const rows = places.map((p, i) => {
    const scheduled = p as PlannerScheduledPlace;
    return [
      i + 1,
      cell(p.title || ''),
      `"${p.kind}"`,
      p.observed_rating ?? '',
      cell(p.observed_price || ''),
      cell(p.address || ''),
      cell(p.why || ''),
      cell(p.notes || ''),
      cell((p.tags || []).join(';')),
      cell(p.source_url || ''),
      cell(p.phone || ''),
      cell(p.plus_code || ''),
      cell(p.menu_url || ''),
      cell(p.reservation_url || ''),
      cell(scheduled.scheduled_date || ''),
      cell(scheduled.scheduled_start || ''),
      scheduled.duration_minutes ?? '',
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

export type ResearchChipCategory = 'risk' | 'signal' | 'tag';

export interface ResearchChipDefinition {
  id: string;
  label: string;
  category: ResearchChipCategory;
}

const KNOWN_RISK_KEYWORDS = [
  'queue', 'rain', 'advance', 'cash', 'wait', 'busy', 'crowded', 'booking', 'reservation',
  '排队', '雨', '预约', '现金', '拥挤', '避雷', '避开', '不宜',
];

export function classifyResearchChip(chipText: string): ResearchChipCategory {
  const normalized = chipText.trim().toLowerCase();
  if (KNOWN_RISK_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return 'risk';
  }
  return 'signal';
}

export const STANDARD_RESEARCH_CHIPS: Record<'zh' | 'en', ResearchChipDefinition[]> = {
  zh: [
    { id: 'must_go', label: '必去', category: 'signal' },
    { id: 'must_eat', label: '必吃', category: 'signal' },
    { id: 'need_queue', label: '需排队', category: 'risk' },
    { id: 'advise_booking', label: '建议预约', category: 'risk' },
    { id: 'night_view', label: '绝美夜景', category: 'signal' },
    { id: 'sunset_spot', label: '日落机位', category: 'signal' },
    { id: 'avoid_rain', label: '避开雨天', category: 'risk' },
    { id: 'convenient_transit', label: '交通便利', category: 'signal' },
    { id: 'cash_only', label: '只收现金', category: 'risk' },
    { id: 'quiet_cozy', label: '安静惬意', category: 'signal' },
  ],
  en: [
    { id: 'must_go', label: 'Must Go', category: 'signal' },
    { id: 'must_eat', label: 'Must Eat', category: 'signal' },
    { id: 'long_queue', label: 'Long Queue', category: 'risk' },
    { id: 'book_in_advance', label: 'Book in Advance', category: 'risk' },
    { id: 'scenic_view', label: 'Scenic View', category: 'signal' },
    { id: 'sunset_spot', label: 'Sunset Spot', category: 'signal' },
    { id: 'avoid_rainy_days', label: 'Avoid Rainy Days', category: 'risk' },
    { id: 'convenient_transit', label: 'Convenient Transit', category: 'signal' },
    { id: 'cash_only', label: 'Cash Only', category: 'risk' },
    { id: 'quiet_cozy', label: 'Quiet & Cozy', category: 'signal' },
  ],
};

export function extractPlaceCoordinates(
  place: Partial<PlannerTripPlace | PlannerScheduledPlace> | string | null | undefined,
): { lat: number; lng: number } | null {
  if (!place) return null;
  if (typeof place === 'object' && place.coordinates && Number.isFinite(place.coordinates.lat) && Number.isFinite(place.coordinates.lng)) {
    return { lat: place.coordinates.lat, lng: place.coordinates.lng };
  }

  const url = typeof place === 'string' ? place : place.source_url || '';
  if (!url) return null;

  // 1. @lat,lng e.g. @13.7437,100.4888 or @13.7437,100.4888,15z
  const atMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 2. !3dlat!4dlng (Google Maps place data protobuf serialization)
  const dMatch = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);
  if (dMatch) {
    const lat = parseFloat(dMatch[1]);
    const lng = parseFloat(dMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 3. query=lat,lng or q=lat,lng or ll=lat,lng
  const queryMatch = /[?&](?:query|q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export function haversineDistanceKm(
  c1: { lat: number; lng: number },
  c2: { lat: number; lng: number },
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
  const lat1 = (c1.lat * Math.PI) / 180;
  const lat2 = (c2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(Math.max(0, 1 - clampedA)));
  return Math.round(R * c * 100) / 100;
}

export interface MapBoundingResult {
  center: { lat: number; lng: number };
  zoom: number;
}

export interface MapPointLike {
  lat: number;
  lng: number;
  isScheduled?: boolean;
}

export function getMapPointsForFilter<T extends MapPointLike>(
  points: T[],
  filterMode: 'all' | 'candidates' | 'scheduled',
): T[] {
  if (filterMode === 'scheduled') {
    return points.filter((p) => Boolean(p.isScheduled));
  }
  if (filterMode === 'candidates') {
    return points.filter((p) => !p.isScheduled);
  }
  return points;
}

/**
 * Robust map viewport bounding calculation:
 * - Filters invalid or (0, 0) coordinates
 * - Applies cosine latitude projection to handle spherical distortion
 * - Prunes extreme global outliers (> 800km away when majority are tightly clustered)
 *   while preserving multi-city itineraries (e.g. Bangkok + Pattaya, Tokyo + Hakone).
 */
export function calculateBounds(pts: Array<{ lat: number; lng: number }>): MapBoundingResult {
  if (!pts || pts.length === 0) {
    return { center: { lat: 35.6762, lng: 139.6503 }, zoom: 13 };
  }

  // Filter out invalid or near-zero coordinates
  const validPts = pts.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      p.lat >= -90 &&
      p.lat <= 90 &&
      p.lng >= -180 &&
      p.lng <= 180 &&
      (Math.abs(p.lat) > 0.01 || Math.abs(p.lng) > 0.01),
  );

  if (validPts.length === 0) {
    const fallbackLat = Number.isFinite(pts[0]?.lat) ? pts[0].lat : 35.6762;
    const fallbackLng = Number.isFinite(pts[0]?.lng) ? pts[0].lng : 139.6503;
    return { center: { lat: fallbackLat, lng: fallbackLng }, zoom: 13 };
  }
  if (validPts.length === 1) {
    return { center: { lat: validPts[0].lat, lng: validPts[0].lng }, zoom: 12 };
  }

  // Calculate median center
  const sortedLats = [...validPts.map((p) => p.lat)].sort((a, b) => a - b);
  const sortedLngs = [...validPts.map((p) => p.lng)].sort((a, b) => a - b);
  const mid = Math.floor(sortedLats.length / 2);
  const medianLat = sortedLats.length % 2 === 0 ? (sortedLats[mid - 1] + sortedLats[mid]) / 2 : sortedLats[mid];
  const medianLng = sortedLngs.length % 2 === 0 ? (sortedLngs[mid - 1] + sortedLngs[mid]) / 2 : sortedLngs[mid];

  // Weighted distance with cosine latitude scaling to account for spherical geometry
  const midLatRad = (medianLat * Math.PI) / 180;
  const cosLat = Math.cos(midLatRad);

  const pointsWithDist = validPts.map((p) => {
    const dLat = (p.lat - medianLat) * 111.32; // km
    const dLng = (p.lng - medianLng) * 111.32 * cosLat; // km
    const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
    return { p, distKm };
  });

  pointsWithDist.sort((a, b) => a.distKm - b.distKm);

  // Regional threshold: retain all points within normal travel radius (e.g. 500km or 4x median),
  // only pruning extreme isolated global anomalies.
  const medianDist = pointsWithDist[Math.floor(pointsWithDist.length / 2)].distKm;
  const maxReasonableRadius = Math.max(500, medianDist * 4);

  const filteredPts = pointsWithDist
    .filter((item) => item.distKm <= maxReasonableRadius)
    .map((item) => item.p);

  const targetPts = filteredPts.length > 0 ? filteredPts : validPts;

  let minLat = targetPts[0].lat;
  let maxLat = targetPts[0].lat;
  let minLng = targetPts[0].lng;
  let maxLng = targetPts[0].lng;

  targetPts.forEach((p) => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  });

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const maxSpan = Math.max(maxLat - minLat, (maxLng - minLng) * Math.abs(cosLat));

  let z = 12;
  if (maxSpan > 15) z = 4;
  else if (maxSpan > 8) z = 6;
  else if (maxSpan > 3.5) z = 8;
  else if (maxSpan > 1.2) z = 10;
  else if (maxSpan > 0.5) z = 11;
  else if (maxSpan > 0.15) z = 12;
  else if (maxSpan > 0.04) z = 12;
  else z = 13;

  return { center: { lat: centerLat, lng: centerLng }, zoom: z };
}

export interface HotelProximityMetrics {
  hasCoordinates: boolean;
  avgDistanceKm: number;
  minDistanceKm: number;
  centerDistanceKm: number;
  closestPlaceTitle?: string;
}

export function calculateHotelProximity(
  hotel: PlannerTripPlace,
  scheduledPlaces: PlannerScheduledPlace[],
): HotelProximityMetrics {
  const hotelCoords = extractPlaceCoordinates(hotel);
  if (!hotelCoords) {
    return { hasCoordinates: false, avgDistanceKm: 0, minDistanceKm: 0, centerDistanceKm: 0 };
  }

  const validStops = scheduledPlaces
    .map((p) => ({ place: p, coords: extractPlaceCoordinates(p) }))
    .filter((item): item is { place: PlannerScheduledPlace; coords: { lat: number; lng: number } } => item.coords !== null && item.place.kind !== 'stay');

  if (validStops.length === 0) {
    return { hasCoordinates: true, avgDistanceKm: 0, minDistanceKm: 0, centerDistanceKm: 0 };
  }

  let totalDist = 0;
  let minDist = Infinity;
  let closestTitle = '';
  let sumLat = 0;
  let sumLng = 0;

  validStops.forEach(({ place, coords }) => {
    const d = haversineDistanceKm(hotelCoords, coords);
    totalDist += d;
    if (d < minDist) {
      minDist = d;
      closestTitle = place.title;
    }
    sumLat += coords.lat;
    sumLng += coords.lng;
  });

  const centerLat = sumLat / validStops.length;
  const centerLng = sumLng / validStops.length;
  const centerDist = haversineDistanceKm(hotelCoords, { lat: centerLat, lng: centerLng });

  return {
    hasCoordinates: true,
    avgDistanceKm: Math.round((totalDist / validStops.length) * 100) / 100,
    minDistanceKm: Math.round(minDist * 100) / 100,
    closestPlaceTitle: closestTitle,
    centerDistanceKm: centerDist,
  };
}

export interface MultiDayHotelProximityResult {
  hasCoordinates: boolean;
  combinedAvgKm: number;
  dayDetails: Array<{
    date: string;
    dayIndex: number;
    avgKm: number;
    centerKm: number;
    spotCount: number;
  }>;
}

export function calculateMultiDayHotelProximity(
  hotel: PlannerTripPlace,
  placesByDate: Record<string, PlannerScheduledPlace[]>,
  stayDates: string[],
): MultiDayHotelProximityResult {
  const hotelCoords = extractPlaceCoordinates(hotel);
  if (!hotelCoords) {
    return {
      hasCoordinates: false,
      combinedAvgKm: 0,
      dayDetails: stayDates.map((date, index) => ({
        date,
        dayIndex: index,
        avgKm: 0,
        centerKm: 0,
        spotCount: 0,
      })),
    };
  }

  let totalDistSum = 0;
  let totalValidSpots = 0;

  const dayDetails = stayDates.map((date, index) => {
    const dayPlaces = placesByDate[date] || [];
    const validSpots = dayPlaces
      .map((p) => ({ place: p, coords: extractPlaceCoordinates(p) }))
      .filter(
        (item): item is { place: PlannerScheduledPlace; coords: { lat: number; lng: number } } =>
          item.coords !== null && item.place.kind !== 'stay',
      );

    if (validSpots.length === 0) {
      return {
        date,
        dayIndex: index,
        avgKm: 0,
        centerKm: 0,
        spotCount: 0,
      };
    }

    let dayDist = 0;
    let sumLat = 0;
    let sumLng = 0;

    validSpots.forEach(({ coords }) => {
      const d = haversineDistanceKm(hotelCoords, coords);
      dayDist += d;
      sumLat += coords.lat;
      sumLng += coords.lng;
    });

    totalDistSum += dayDist;
    totalValidSpots += validSpots.length;

    const centerLat = sumLat / validSpots.length;
    const centerLng = sumLng / validSpots.length;
    const centerDist = haversineDistanceKm(hotelCoords, { lat: centerLat, lng: centerLng });

    return {
      date,
      dayIndex: index,
      avgKm: Math.round((dayDist / validSpots.length) * 10) / 10,
      centerKm: Math.round(centerDist * 10) / 10,
      spotCount: validSpots.length,
    };
  });

  const combinedAvgKm =
    totalValidSpots > 0 ? Math.round((totalDistSum / totalValidSpots) * 10) / 10 : 0;

  return {
    hasCoordinates: true,
    combinedAvgKm,
    dayDetails,
  };
}

export interface DayHotelTransferInfo {
  date: string;
  dayIndex: number;
  isTransferDay: boolean;
  checkoutHotel?: PlannerScheduledPlace;
  checkinHotel?: PlannerScheduledPlace;
  stayHotel?: PlannerScheduledPlace;
  stayNightIndex?: number;
  totalStayNights?: number;
}

export function detectHotelTransferDays(
  tripPlaces: PlannerScheduledPlace[],
  tripDates: string[],
): Record<string, DayHotelTransferInfo> {
  const result: Record<string, DayHotelTransferInfo> = {};
  if (tripDates.length === 0) return result;

  const stayByDate: Record<string, PlannerScheduledPlace | undefined> = {};
  tripDates.forEach((date) => {
    const stays = tripPlaces.filter(
      (p) =>
        p.scheduled_date === date &&
        (p.kind === 'stay' || (p.is_anchor && p.anchor_type === 'stay_checkin')),
    );
    stayByDate[date] = stays[0];
  });

  tripDates.forEach((date, index) => {
    const todayStay = stayByDate[date];
    const prevDate = index > 0 ? tripDates[index - 1] : null;
    const prevStay = prevDate ? stayByDate[prevDate] : null;

    if (
      prevStay &&
      todayStay &&
      normalizePlaceIdentity(prevStay.source_url || prevStay.title) !==
        normalizePlaceIdentity(todayStay.source_url || todayStay.title)
    ) {
      const baseId = normalizePlaceIdentity(todayStay.source_url || todayStay.title);
      let end = index;
      while (
        end < tripDates.length - 1 &&
        stayByDate[tripDates[end + 1]] &&
        normalizePlaceIdentity(
          stayByDate[tripDates[end + 1]]!.source_url || stayByDate[tripDates[end + 1]]!.title,
        ) === baseId
      ) {
        end++;
      }
      const totalNights = end - index + 1;

      result[date] = {
        date,
        dayIndex: index,
        isTransferDay: true,
        checkoutHotel: prevStay,
        checkinHotel: todayStay,
        stayHotel: todayStay,
        stayNightIndex: 1,
        totalStayNights: totalNights,
      };
    } else {
      let nightIndex = 1;
      let totalNights = 1;

      if (todayStay) {
        const baseId = normalizePlaceIdentity(todayStay.source_url || todayStay.title);
        let start = index;
        while (
          start > 0 &&
          stayByDate[tripDates[start - 1]] &&
          normalizePlaceIdentity(
            stayByDate[tripDates[start - 1]]!.source_url || stayByDate[tripDates[start - 1]]!.title,
          ) === baseId
        ) {
          start--;
        }
        nightIndex = index - start + 1;

        let end = index;
        while (
          end < tripDates.length - 1 &&
          stayByDate[tripDates[end + 1]] &&
          normalizePlaceIdentity(
            stayByDate[tripDates[end + 1]]!.source_url || stayByDate[tripDates[end + 1]]!.title,
          ) === baseId
        ) {
          end++;
        }
        totalNights = end - start + 1;
      }

      result[date] = {
        date,
        dayIndex: index,
        isTransferDay: false,
        stayHotel: todayStay,
        stayNightIndex: todayStay ? nightIndex : undefined,
        totalStayNights: todayStay ? totalNights : undefined,
      };
    }
  });

  return result;
}

export type TripExpenseCategory = 'stay' | 'food' | 'transit' | 'ticket' | 'shopping' | 'other';

export interface TripExpenseItem {
  id: string;
  trip_id: string;
  title: string;
  category: TripExpenseCategory;
  amount: number;
  currency: string;
  date?: string;
  paid_by: string;
  split_members: string[];
  notes?: string;
  confirmation?: string;
  created_at: string;
}

export interface MemberBalance {
  member: string;
  paidTotal: number;
  shareTotal: number;
  netBalance: number;
}

export interface CashFlowTransfer {
  from: string;
  to: string;
  amount: number;
}

export interface TripSettlementResult {
  totalExpense: number;
  memberBalances: MemberBalance[];
  transfers: CashFlowTransfer[];
  summaryText: string;
}

const SYMBOL_TO_CODE: Record<string, string> = {
  '¥': 'CNY', '￥': 'CNY', 'JP¥': 'JPY', 'JP￥': 'JPY', 'CN¥': 'CNY', 'CN￥': 'CNY', '円': 'JPY', '日元': 'JPY', '日币': 'JPY', '元': 'CNY', '块': 'CNY', '人民币': 'CNY',
  '$': 'USD', '€': 'EUR', '£': 'GBP', '฿': 'THB', '铢': 'THB', '泰铢': 'THB', 'บาท': 'THB', '.-': 'THB', '.–': 'THB', '₩': 'KRW', '원': 'KRW', '韩元': 'KRW',
  'S$': 'SGD', 'SG$': 'SGD', 'HK$': 'HKD', 'NT$': 'TWD', 'US$': 'USD', 'A$': 'AUD', 'AU$': 'AUD', 'C$': 'CAD', 'CA$': 'CAD', 'NZ$': 'NZD',
  '₫': 'VND', '₹': 'INR', 'RM': 'MYR', 'CHF': 'CHF', 'MOP$': 'MOP', 'R$': 'BRL', 'RP': 'IDR', 'ZL': 'PLN', 'zł': 'PLN',
};

/**
 * Approximate reference rates used when a trip defines no explicit override:
 * value = how many USD one unit of the currency is worth. Editable defaults,
 * never a live market feed (local-first: no network, no API keys).
 */
export const DEFAULT_USD_PIVOT: Record<string, number> = {
  USD: 1, CNY: 0.14, JPY: 0.0067, THB: 0.027, HKD: 0.128, TWD: 0.031,
  KRW: 0.00073, SGD: 0.74, MYR: 0.21, EUR: 1.08, GBP: 1.27, AUD: 0.66,
  CAD: 0.73, CHF: 1.12, INR: 0.012, VND: 0.00004, NZD: 0.61, PHP: 0.018,
  IDR: 0.000062, AED: 0.27, TRY: 0.029, SEK: 0.093, NOK: 0.091, DKK: 0.145,
  PLN: 0.25, BRL: 0.18, SAR: 0.27, MOP: 0.124, EGP: 0.021, ZAR: 0.055,
};

export interface FxSettings {
  /** Trip base currency (ISO code). */
  base: string;
  /** Explicit user overrides: overrides[from] = how many BASE per 1 FROM. */
  overrides?: Record<string, number>;
  /** Pivot exchange rates against USD: pivot[code] = USD value of 1 unit of currency. */
  usdPivots?: Record<string, number>;
}

/** Effective multiplier converting 1 FROM into BASE, or null when unknown. */
export function effectiveFxRate(
  from: string | null | undefined,
  fx: FxSettings,
): number | null {
  const code = from?.trim().toUpperCase() || null;
  if (!code) return null;
  const base = fx.base.toUpperCase();
  if (code === base) return 1;

  // Direct override: how many BASE per 1 FROM
  const directOverride = fx.overrides?.[code];
  // Guard: if overrides contains 'USD: 1', it is a USD-pivot table rather than direct BASE multiplier
  const isUsdPivotTable = fx.overrides?.USD === 1 && base !== 'USD';
  if (!isUsdPivotTable && typeof directOverride === 'number' && Number.isFinite(directOverride) && directOverride > 0) {
    return directOverride;
  }

  const pivots = isUsdPivotTable ? fx.overrides : (fx.usdPivots || DEFAULT_USD_PIVOT);
  const fromUsd = pivots?.[code] ?? DEFAULT_USD_PIVOT[code];
  const baseUsd = pivots?.[base] ?? DEFAULT_USD_PIVOT[base];

  if (fromUsd && baseUsd && baseUsd > 0) {
    return fromUsd / baseUsd;
  }
  return null;
}

/** Extracts a normalized ISO-ish currency marker from a free-text price string. */
export function extractPriceCurrency(raw?: string | null): string | null {
  if (!raw) return null;
  const symbolMatch = /(?:JP[¥￥]|CN[¥￥]|S\$|SG\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$|MOP\$|R\$|zł|\bZL\b|\bRM\b|\bRP\b|新台币|人民币|日元|日币|泰铢|韩元|新币|新加坡元|港币|港元|澳币|澳元|加币|加元|纽币|欧元|英镑|比索|印尼盾|迪拉姆|里拉|克朗|澳门币|葡币|雷亚尔|\.-|\.–)/i.exec(raw);
  if (symbolMatch) {
    const marker = symbolMatch[0].toUpperCase();
    return SYMBOL_TO_CODE[marker] ?? SYMBOL_TO_CODE[symbolMatch[0]] ?? marker.replace(/\$$/, '');
  }

  const isoMatch = /\b(SGD|HKD|TWD|USD|THB|JPY|EUR|GBP|CNY|RMB|AUD|CAD|NZD|KRW|MYR|VND|CHF|INR|PHP|IDR|AED|TRY|SEK|NOK|DKK|PLN|BRL|SAR|MOP)\b/i.exec(raw);
  if (isoMatch) {
    return isoMatch[1].toUpperCase();
  }

  const singleMatch = /(?:[¥￥฿$€£₩₫₹円铢元块원])/i.exec(raw);
  if (singleMatch) {
    const marker = singleMatch[0];
    return SYMBOL_TO_CODE[marker] ?? null;
  }

  return null;
}

export interface TripBudgetEstimation {
  totalEstimated: number;
  perPersonEstimated: number;
  travelerCount: number;
  categoryBreakdown: {
    stay: number;
    food: number;
    ticket: number;
    other: number;
  };
  detectedCurrency: string;
  /** Distinct currency markers found across observed prices; >1 means mixed and unconverted. */
  currencies: string[];
}

const CODE_TO_SYMBOL: Record<string, string> = {
  CNY: '¥', JPY: '¥', USD: '$', EUR: '€', GBP: '£', THB: '฿', KRW: '₩',
  SGD: 'S$', HKD: 'HK$', TWD: 'NT$', AUD: 'A$', CAD: 'C$', CHF: 'CHF ', INR: '₹',
  MYR: 'RM', VND: '₫', NZD: 'NZ$', PHP: '₱', IDR: 'Rp ', AED: 'AED ', TRY: '₺',
  SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', PLN: 'zł', MOP: 'MOP$ ', BRL: 'R$ ', SAR: 'SAR ',
};

/** Renders an ISO code (or raw symbol) as a display symbol for ledger summaries. */
export function currencySymbolFor(code?: string | null): string {
  if (!code) return '¥';
  const trimmed = code.trim().toUpperCase();
  if (CODE_TO_SYMBOL[trimmed]) return CODE_TO_SYMBOL[trimmed];
  return `${trimmed} `;
}

/** Standard minor unit decimal places per ISO 4217. */
export const CURRENCY_DECIMAL_DIGITS: Record<string, number> = {
  // 0 decimal currencies (no sub-units in common circulation)
  JPY: 0, KRW: 0, VND: 0, IDR: 0, CLP: 0, PYG: 0, HUF: 0, ISK: 0, UGX: 0, TWD: 0,
  // 3 decimal currencies
  BHD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3,
};

export function getCurrencyDecimals(code?: string | null): number {
  if (!code) return 2;
  const upper = code.trim().toUpperCase();
  return CURRENCY_DECIMAL_DIGITS[upper] ?? 2;
}

/**
 * Formats a place's price for display in Planner UI:
 * - If the price currency matches the trip base currency, returns the raw observed_price.
 * - If the currency is different (e.g. THB vs trip CNY), converts the amount using effectiveFxRate
 *   and outputs a dual-currency format: e.g. "约 ¥42 (฿200)" or "约 ¥41–83 (฿200–400)".
 */
export function formatPlacePriceInTripCurrency(
  place: {
    observed_price?: string;
    price_currency?: string;
    price_min?: number;
    price_max?: number;
  },
  tripCurrency = 'CNY',
  fxOverrides?: Record<string, number>,
): string {
  const raw = place.observed_price?.trim();
  if (!raw && typeof place.price_min !== 'number' && typeof place.price_max !== 'number') {
    return '';
  }

  const base = (tripCurrency || 'CNY').trim().toUpperCase();
  const sourceCurrency = (place.price_currency || extractPriceCurrency(raw) || '').trim().toUpperCase();

  // If no currency is identifiable or it matches the trip base currency, display raw price
  if (!sourceCurrency || sourceCurrency === base) {
    return raw || (typeof place.price_min === 'number' ? `${currencySymbolFor(base)}${place.price_min}` : '');
  }

  const rate = effectiveFxRate(sourceCurrency, { base, overrides: fxOverrides });
  if (rate === null || rate <= 0) {
    return raw || '';
  }

  const baseSymbol = currencySymbolFor(base);

  // If price_min and price_max are available
  if (typeof place.price_min === 'number' && typeof place.price_max === 'number') {
    const minConverted = Math.round(place.price_min * rate);
    const maxConverted = Math.round(place.price_max * rate);
    const convertedStr = minConverted === maxConverted ? `${baseSymbol}${minConverted}` : `${baseSymbol}${minConverted}–${maxConverted}`;
    return raw ? `约 ${convertedStr} (${raw})` : `约 ${convertedStr}`;
  }

  if (typeof place.price_min === 'number') {
    const minConverted = Math.round(place.price_min * rate);
    return raw ? `约 ${baseSymbol}${minConverted} (${raw})` : `约 ${baseSymbol}${minConverted}`;
  }

  // Parse numeric ranges from raw observed_price (e.g. "฿200–400", "฿150/晚")
  const matchRange = /(\d[\d.,]*)\s*[-–—〜~至到]\s*(\d[\d.,]*)/.exec(raw || '');
  if (matchRange) {
    const n1 = parseFloat(matchRange[1].replace(/,/g, ''));
    const n2 = parseFloat(matchRange[2].replace(/,/g, ''));
    if (Number.isFinite(n1) && Number.isFinite(n2)) {
      const c1 = Math.round(n1 * rate);
      const c2 = Math.round(n2 * rate);
      return `约 ${baseSymbol}${c1}–${c2} (${raw})`;
    }
  }

  const matchSingle = /(\d[\d.,]*)/.exec(raw || '');
  if (matchSingle) {
    const n = parseFloat(matchSingle[1].replace(/,/g, ''));
    if (Number.isFinite(n)) {
      const c = Math.round(n * rate);
      return `约 ${baseSymbol}${c} (${raw})`;
    }
  }

  return raw || '';
}

/**
 * Returns a normalized numeric representation ({ min, max, avg }) converted to target trip currency.
 * Used for accurate multi-currency price comparison and sorting in HotelComparisonModal.
 */
export function getPlaceConvertedNumericPrice(
  place: {
    observed_price?: string;
    price_currency?: string;
    price_min?: number;
    price_max?: number;
  },
  tripCurrency = 'CNY',
  fxOverrides?: Record<string, number>,
): { min?: number; max?: number; avg?: number } | null {
  const raw = place.observed_price?.trim();
  const base = (tripCurrency || 'CNY').trim().toUpperCase();
  const sourceCurrency = (place.price_currency || (raw ? extractPriceCurrency(raw) : null) || base).trim().toUpperCase();

  const rate = sourceCurrency === base ? 1 : effectiveFxRate(sourceCurrency, { base, overrides: fxOverrides });
  if (rate === null || rate <= 0) return null;

  if (typeof place.price_min === 'number' || typeof place.price_max === 'number') {
    const minVal = place.price_min ?? place.price_max;
    const maxVal = place.price_max ?? place.price_min;
    if (minVal !== undefined && maxVal !== undefined) {
      const minConverted = Math.round(minVal * rate * 100) / 100;
      const maxConverted = Math.round(maxVal * rate * 100) / 100;
      return { min: minConverted, max: maxConverted, avg: (minConverted + maxConverted) / 2 };
    }
  }

  if (raw) {
    const matchRange = /(\d[\d.,]*)\s*[-–—〜~至到]\s*(\d[\d.,]*)/.exec(raw);
    if (matchRange) {
      const n1 = parseFloat(matchRange[1].replace(/,/g, ''));
      const n2 = parseFloat(matchRange[2].replace(/,/g, ''));
      if (Number.isFinite(n1) && Number.isFinite(n2)) {
        const minConverted = Math.round(n1 * rate * 100) / 100;
        const maxConverted = Math.round(n2 * rate * 100) / 100;
        return { min: minConverted, max: maxConverted, avg: (minConverted + maxConverted) / 2 };
      }
    }
    const matchSingle = /(\d[\d.,]*)/.exec(raw);
    if (matchSingle) {
      const n = parseFloat(matchSingle[1].replace(/,/g, ''));
      if (Number.isFinite(n)) {
        const converted = Math.round(n * rate * 100) / 100;
        return { min: converted, max: converted, avg: converted };
      }
    }
  }

  return null;
}

/**
 * Infers a place's city or main destination from its area, address, or title.
 * Checks against known trip destinations first, then common world cities,
 * and falls back to area or '未分类城市'.
 */
export function inferPlaceCity(
  place: { area?: string; address?: string; title?: string },
  knownDestinations: string[] = [],
): string {
  const text = `${place.area || ''} ${place.address || ''} ${place.title || ''}`.toLowerCase();

  // 1. Match against trip destinations if provided
  for (const dest of knownDestinations) {
    const trimmed = dest.trim();
    if (trimmed && text.includes(trimmed.toLowerCase())) {
      return trimmed;
    }
  }

  // 2. Common tourist destinations matcher
  const CITY_MATCHERS: Array<{ name: string; regex: RegExp }> = [
    { name: '曼谷 (Bangkok)', regex: /bangkok|曼谷|krung thep/i },
    { name: '芭提雅 (Pattaya)', regex: /pattaya|芭提雅|芭达雅|chon buri/i },
    { name: '清迈 (Chiang Mai)', regex: /chiang mai|清迈|chiangmai/i },
    { name: '普吉岛 (Phuket)', regex: /phuket|普吉/i },
    { name: '苏梅岛 (Koh Samui)', regex: /samui|苏梅/i },
    { name: '甲米 (Krabi)', regex: /krabi|甲米/i },
    { name: '华欣 (Hua Hin)', regex: /hua hin|华欣/i },
    { name: '东京 (Tokyo)', regex: /tokyo|东京|東京都/i },
    { name: '京都 (Kyoto)', regex: /kyoto|京都/i },
    { name: '大阪 (Osaka)', regex: /osaka|大阪/i },
    { name: '北海道 (Hokkaido)', regex: /hokkaido|北海道|sapporo|札幌/i },
    { name: '冲绳 (Okinawa)', regex: /okinawa|冲绳|那霸/i },
    { name: '首尔 (Seoul)', regex: /seoul|首尔/i },
    { name: '釜山 (Busan)', regex: /busan|釜山/i },
    { name: '济州岛 (Jeju)', regex: /jeju|济州/i },
    { name: '新加坡 (Singapore)', regex: /singapore|新加坡/i },
    { name: '吉隆坡 (Kuala Lumpur)', regex: /kuala lumpur|吉隆坡/i },
    { name: '槟城 (Penang)', regex: /penang|槟城/i },
    { name: '香港 (Hong Kong)', regex: /hong kong|香港/i },
    { name: '澳门 (Macau)', regex: /macau|macao|澳门/i },
    { name: '台北 (Taipei)', regex: /taipei|台北/i },
    { name: '伦敦 (London)', regex: /london|伦敦/i },
    { name: '巴黎 (Paris)', regex: /paris|巴黎/i },
    { name: '罗马 (Rome)', regex: /rome|roma|罗马/i },
    { name: '米兰 (Milan)', regex: /milan|milano|米兰/i },
    { name: '纽约 (New York)', regex: /new york|纽约/i },
    { name: '旧金山 (San Francisco)', regex: /san francisco|旧金山/i },
    { name: '洛杉矶 (Los Angeles)', regex: /los angeles|洛杉矶/i },
  ];

  for (const item of CITY_MATCHERS) {
    if (item.regex.test(text)) {
      // If a known destination also matches this same city matcher regex, prefer the user's destination label!
      const matchedDest = knownDestinations.find((d) => item.regex.test(d));
      if (matchedDest) {
        return matchedDest.trim();
      }
      return item.name;
    }
  }

  if (place.area?.trim()) {
    return place.area.trim();
  }

  return '未分类城市';
}

export const PLANNER_KIND_ICONS: Record<PlannerPlaceKind, string> = {
  attraction: '🏰',
  food: '🍜',
  cafe: '☕',
  stay: '🏨',
  shopping: '🛍️',
  transit: '🚇',
  experience: '🧗',
  service: '🔧',
  other: '📍',
};

export const PLANNER_KIND_LABELS: Record<PlannerPlaceKind, { zh: string; en: string }> = {
  stay: { zh: '住宿', en: 'Stay' },
  food: { zh: '美食', en: 'Food' },
  cafe: { zh: '咖啡', en: 'Cafe' },
  attraction: { zh: '景点', en: 'Attraction' },
  experience: { zh: '体验', en: 'Experience' },
  shopping: { zh: '购物', en: 'Shopping' },
  transit: { zh: '交通', en: 'Transit' },
  service: { zh: '服务', en: 'Service' },
  other: { zh: '其它', en: 'Other' },
};

export function getPlannerKindLabel(kind: PlannerPlaceKind, lang: 'zh' | 'en' = 'zh'): string {
  return PLANNER_KIND_LABELS[kind]?.[lang] || (lang === 'zh' ? '其它' : 'Other');
}

export function ensurePlaceKindTag(
  tags: string[] = [],
  kind: PlannerPlaceKind = 'other',
  language: 'zh' | 'en' = 'zh',
): string[] {
  const kindZh = PLANNER_KIND_LABELS[kind]?.zh || '其它';
  const kindEn = PLANNER_KIND_LABELS[kind]?.en || 'Other';
  const targetTag = language === 'en' ? kindEn : kindZh;

  const rawTags = (tags || []).map((t) => (t || '').trim()).filter(Boolean);

  const isMatchThisKind = (t: string) => {
    const lower = t.toLowerCase();
    if (lower === kindZh.toLowerCase() || lower === kindEn.toLowerCase()) return true;
    if (kind === 'stay' && (lower === '酒店' || lower === '酒店住宿' || lower === 'hotel' || lower === 'stay')) return true;
    if (kind === 'food' && (lower === '餐厅' || lower === '餐厅美食' || lower === '美食' || lower === 'food' || lower === 'dining')) return true;
    if (kind === 'cafe' && (lower === '咖啡馆' || lower === '咖啡甜品' || lower === '咖啡' || lower === 'cafe' || lower === 'coffee')) return true;
    if (kind === 'attraction' && (lower === '观光景点' || lower === '景点' || lower === 'attraction' || lower === 'sightseeing')) return true;
    if (kind === 'shopping' && (lower === '购物商场' || lower === '购物' || lower === 'shopping' || lower === 'mall')) return true;
    if (kind === 'transit' && (lower === '交通中转' || lower === '交通' || lower === 'transit' || lower === 'station')) return true;
    if (kind === 'experience' && (lower === '体验活动' || lower === '体验' || lower === 'experience' || lower === 'activity')) return true;
    if (kind === 'other' && (lower === '其他' || lower === '其它' || lower === 'other')) return true;
    return false;
  };

  const hasKindTag = rawTags.some(isMatchThisKind);

  const seen = new Set<string>();
  const result: string[] = [];

  if (!hasKindTag) {
    seen.add(targetTag.toLowerCase());
    result.push(targetTag);
  }

  for (const tag of rawTags) {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(tag);
    }
  }

  return result;
}

export function isPlausibleCustomTag(
  tag: string,
  excludedNames: Set<string> = new Set(),
): boolean {
  const trimmed = (tag || '').trim();
  if (!trimmed || trimmed.length < 1 || trimmed.length > 25) return false;
  const lower = trimmed.toLowerCase();
  if (excludedNames.has(lower)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^\d+([-\s]\d+)*$/.test(trimmed)) return false;
  if (/[0-9]+[街路巷弄号]/.test(trimmed)) return false;
  if (/^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/.test(trimmed)) return false;
  return true;
}

/** Maps Google taxonomy types onto our place kinds; more specific wins. */
const TYPE_KIND_RULES: Array<[RegExp, PlannerPlaceKind]> = [
  [/lodging|hotel|motel|hostel|guest_house|bed_and_breakfast|ryokan|resort|accommodation|serviced_apartment|villa|extended_stay/i, 'stay'],
  [/cafe|coffee_shop|tea_house|dessert|bakery|ice_cream/i, 'cafe'],
  [/restaurant|bar\b|pub|food|meal_takeaway|meal_delivery|ramen|sushi|izakaya|bistro|steak_house/i, 'food'],
  [/transit_station|subway_station|bus_station|airport|train_station|ferry_terminal|light_rail_station/i, 'transit'],
  [/shopping_mall|department_store|store|market|bazaar|outlet|supermarket|clothing_store/i, 'shopping'],
  [/spa|gym|fitness|bowling|amusement_park|water_park|night_club|experience|diving|ski_resort|hot_spring/i, 'experience'],
  [/museum|art_gallery|tourist_attraction|place_of_worship|historical|castle|park\b|zoo|aquarium|viewpoint|beach|point_of_interest|landmark/i, 'attraction'],
];

export function inferKindFromTypes(types?: string[]): PlannerPlaceKind | null {
  if (!types || types.length === 0) return null;
  for (const [pattern, kind] of TYPE_KIND_RULES) {
    if (types.some((t) => pattern.test(t))) return kind;
  }
  return null;
}

export interface ParsedPriceDetail {
  raw: string;
  currency: string | null;
  minAmount: number;
  maxAmount: number;
  isRange: boolean;
}

export interface ConvertedPriceResult {
  sourceRaw: string;
  sourceCurrency: string | null;
  targetCurrency: string;
  rate: number;
  convertedMin: number;
  convertedMax: number;
  isRange: boolean;
  formattedTarget: string;
  rateDescription: string;
}

export function parseDetailedPrice(raw?: string | null): ParsedPriceDetail | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  // Disallow invalid alphanumeric fragments like "2b-", "3x", "4a"
  if (/^\d+[a-zA-Z]+-?$/i.test(text)) return null;
  // Disallow trailing unescaped hyphens like "12-"
  if (/(?<!\.)[-–—〜~]$/.test(text)) return null;

  const currency = extractPriceCurrency(text);
  
  // Range check: e.g. "฿400–1,000", "¥1000 - 2000", "400 ~ 1000", "400 to 1000"
  const rangeMatch = /(\d[\d,]*(?:\.\d+)?)\s*[-–—〜~至到|/]\s*(\d[\d,]*(?:\.\d+)?)/.exec(text);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (Number.isFinite(min) && Number.isFinite(max) && (min > 0 || max > 0)) {
      return {
        raw: text,
        currency,
        minAmount: min,
        maxAmount: max,
        isRange: min !== max,
      };
    }
  }

  // Single number check: e.g. "฿500", "JPY 2500", "$120.50"
  const singleMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(text);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1].replace(/,/g, ''));
    if (Number.isFinite(val) && val > 0) {
      return {
        raw: text,
        currency,
        minAmount: val,
        maxAmount: val,
        isRange: false,
      };
    }
  }

  return null;
}

export interface NormalizedObservedPrice {
  currency?: string;
  min?: number;
  max?: number;
  unit: PlannerPriceUnit;
  level?: number;
}

/**
 * Turns a captured price label into comparable facts while retaining the raw
 * source text separately on PlannerTripPlace.observed_price.
 *
 * Ambiguous bare symbols use the page-currency detector as the authority:
 * "$" can therefore become SGD/HKD/AUD/etc. and "¥" can become JPY/CNY.
 */
export function normalizeObservedPrice(
  raw?: string | null,
  detectedCurrency?: string | null,
): NormalizedObservedPrice | null {
  const text = raw?.trim();
  if (!text) return null;

  const levelMatch = /^([$€£¥￥฿₩])\1{0,3}$/.exec(text);
  if (levelMatch) {
    return { unit: 'level', level: Math.min(4, text.length) };
  }

  const parsed = parseDetailedPrice(text);
  if (!parsed) return null;

  const hint = detectedCurrency?.trim().toUpperCase() || undefined;
  let currency = parsed.currency || hint;

  const hasBareDollar = text.includes('$')
    && !/(?:S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$|MOP\$|R\$)/i.test(text);
  if (hasBareDollar && hint && ['USD', 'SGD', 'HKD', 'AUD', 'CAD', 'NZD', 'TWD'].includes(hint)) {
    currency = hint;
  }

  const hasBareYen = /[¥￥]/.test(text) && !/(?:JPY|CNY|RMB|円|日元|人民币)/i.test(text);
  if (hasBareYen && hint && ['JPY', 'CNY'].includes(hint)) {
    currency = hint;
  }

  let unit: PlannerPriceUnit = 'unknown';
  if (/(?:人均|每人|per\s*person|\/\s*person\b|\bpp\b)/i.test(text)) unit = 'person';
  else if (/(?:每晚|per\s*night|\/\s*night\b|nightly|\bnight\b|晚\/)/i.test(text)) unit = 'night';
  else if (/(?:每件|per\s*item|\/\s*item\b|\beach\b)/i.test(text)) unit = 'item';

  return {
    currency: currency || undefined,
    min: parsed.minAmount,
    max: parsed.maxAmount,
    unit,
  };
}

export function convertPriceRange(
  raw: string,
  targetCurrency = 'CNY',
  fxOverridesOrPivots?: Record<string, number> | { overrides?: Record<string, number>; usdPivots?: Record<string, number> },
  fallbackSourceCurrency?: string,
): ConvertedPriceResult | null {
  const parsed = parseDetailedPrice(raw);
  if (!parsed) return null;

  let fromCurr: string | null = parsed.currency;
  const fallback = fallbackSourceCurrency?.trim().toUpperCase();

  // Strict disambiguation:
  if (raw.includes('¥') || raw.includes('￥')) {
    if (raw.includes('円') || raw.includes('日元') || /JPY/i.test(raw) || fallback === 'JPY') {
      fromCurr = 'JPY';
    } else {
      fromCurr = 'CNY';
    }
  } else if (raw.includes('$') && !/S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$/i.test(raw)) {
    const validDollarCurrencies = ['SGD', 'HKD', 'AUD', 'CAD', 'NZD', 'USD', 'TWD'];
    if (fallback && validDollarCurrencies.includes(fallback)) {
      fromCurr = fallback;
    } else {
      fromCurr = 'USD';
    }
  } else if (!fromCurr) {
    fromCurr = fallback || null;
  }

  if (!fromCurr) return null;

  const target = targetCurrency.trim().toUpperCase();
  const from = fromCurr.trim().toUpperCase();

  let fx: FxSettings;
  if (fxOverridesOrPivots && typeof fxOverridesOrPivots === 'object' && ('overrides' in fxOverridesOrPivots || 'usdPivots' in fxOverridesOrPivots)) {
    const config = fxOverridesOrPivots as { overrides?: Record<string, number>; usdPivots?: Record<string, number> };
    fx = {
      base: target,
      overrides: config.overrides,
      usdPivots: config.usdPivots,
    };
  } else {
    const map = fxOverridesOrPivots as Record<string, number> | undefined;
    if (map && map.USD === 1 && target !== 'USD') {
      fx = {
        base: target,
        usdPivots: map,
      };
    } else {
      fx = {
        base: target,
        overrides: map,
      };
    }
  }

  const rate = effectiveFxRate(from, fx);
  if (!rate || rate <= 0) return null;

  const decimals = getCurrencyDecimals(target);
  const factor = Math.pow(10, decimals);
  const convertedMin = Math.round(parsed.minAmount * rate * factor) / factor;
  const convertedMax = Math.round(parsed.maxAmount * rate * factor) / factor;
  const targetSymbol = currencySymbolFor(target);

  const formatAmount = (num: number) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals === 0 ? 0 : (num % 1 === 0 ? 0 : decimals),
      maximumFractionDigits: decimals,
    });
  };

  const formattedTarget = parsed.isRange
    ? `${targetSymbol}${formatAmount(convertedMin)} – ${formatAmount(convertedMax)}`
    : `${targetSymbol}${formatAmount(convertedMin)}`;

  const formatRate = (r: number) => {
    if (r >= 100) return r % 1 === 0 ? r.toLocaleString() : r.toFixed(2);
    if (r >= 1) return r.toFixed(2);
    if (r >= 0.01) return r.toFixed(4);
    return r.toFixed(6);
  };

  const rateDescription = `1 ${from} ≈ ${formatRate(rate)} ${target}`;

  return {
    sourceRaw: raw,
    sourceCurrency: from,
    targetCurrency: target,
    rate,
    convertedMin,
    convertedMax,
    isRange: parsed.isRange,
    formattedTarget,
    rateDescription,
  };
}

export function parseNumericPrice(raw?: string | null): number {  if (!raw) return 0;
  // Handle ranges like "฿200-400" or "¥1,000–2,000" -> average
  const rangeMatch = /(\d[\d,]*)\s*[-–—〜~至]\s*(\d[\d,]*)/.exec(raw);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return Math.round((min + max) / 2);
    }
  }
  // Single number
  const singleMatch = /(\d[\d,]*)/.exec(raw);
  if (singleMatch) {
    const num = parseFloat(singleMatch[1].replace(/,/g, ''));
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

export function estimateTripBudget(
  scheduledPlaces: Array<PlannerTripPlace | PlannerScheduledPlace>,
  travelerCount = 1,
  fx?: FxSettings,
): TripBudgetEstimation {
  const base = fx?.base?.trim().toUpperCase() || 'CNY';
  let stayTotal = 0;
  let foodTotal = 0;
  let ticketTotal = 0;
  let otherTotal = 0;
  let currency = '';
  const foundCurrencies = new Set<string>();

  const validTravelers = Math.max(1, travelerCount);

  scheduledPlaces.forEach((place) => {
    let price = 0;
    if (typeof place.price_min === 'number' && typeof place.price_max === 'number') {
      price = (place.price_min + place.price_max) / 2;
    } else if (typeof place.price_min === 'number') {
      price = place.price_min;
    } else if (typeof place.price_max === 'number') {
      price = place.price_max;
    } else {
      price = parseNumericPrice(place.observed_price);
    }

    let marker: string | null = null;
    if (place.price_currency?.trim()) {
      marker = place.price_currency.trim().toUpperCase();
      foundCurrencies.add(marker);
      if (!currency) currency = marker;
    } else if (place.observed_price) {
      marker = extractPriceCurrency(place.observed_price);
      if (marker) {
        foundCurrencies.add(marker);
        if (!currency) currency = marker;
      }
    }

    // Convert the amount into the trip base currency when a rate is known.
    // Bare numbers (no marker) are assumed to already be in base currency.
    const from = marker ?? base;
    const rate = effectiveFxRate(from, { base, overrides: fx?.overrides });
    const converted = rate !== null ? Math.round(price * rate * 100) / 100 : price;

    if (place.kind === 'stay') {
      stayTotal += converted > 0 ? converted : 0;
    } else if (place.kind === 'food' || place.kind === 'cafe') {
      foodTotal += (converted > 0 ? converted : 0) * validTravelers;
    } else if (place.kind === 'attraction' || place.kind === 'experience') {
      ticketTotal += (converted > 0 ? converted : 0) * validTravelers;
    } else {
      otherTotal += (converted > 0 ? converted : 0) * validTravelers;
    }
  });

  const totalEstimated = stayTotal + foodTotal + ticketTotal + otherTotal;
  const perPersonEstimated = Math.round(totalEstimated / validTravelers);

  return {
    totalEstimated,
    perPersonEstimated,
    travelerCount: validTravelers,
    categoryBreakdown: {
      stay: stayTotal,
      food: foodTotal,
      ticket: ticketTotal,
      other: otherTotal,
    },
    detectedCurrency: currency || base,
    currencies: [...foundCurrencies],
  };
}

export function calculateTripSettlement(
  expenses: TripExpenseItem[],
  allMembers: string[] = [],
  fx?: FxSettings,
): TripSettlementResult {
  const toBase = (amount: number, from?: string): number => {
    if (!fx) return amount;
    const rate = effectiveFxRate(from, fx);
    return rate === null ? amount : Math.round(amount * rate * 100) / 100;
  };

  const memberSet = new Set<string>(allMembers);
  expenses.forEach((exp) => {
    if (exp.paid_by?.trim()) memberSet.add(exp.paid_by.trim());
    (exp.split_members || []).forEach((m) => {
      if (m?.trim()) memberSet.add(m.trim());
    });
  });

  const members = Array.from(memberSet).filter(Boolean);
  if (members.length === 0 || expenses.length === 0) {
    return {
      totalExpense: 0,
      memberBalances: [],
      transfers: [],
      summaryText: '暂无账目流水记录。',
    };
  }

  const paidMap: Record<string, number> = {};
  const shareMap: Record<string, number> = {};
  members.forEach((m) => {
    paidMap[m] = 0;
    shareMap[m] = 0;
  });

  let totalExpense = 0;

  expenses.forEach((exp) => {
    const amt = toBase(exp.amount, exp.currency);
    totalExpense += amt;
    const payer = exp.paid_by?.trim() || members[0];
    if (paidMap[payer] !== undefined) {
      paidMap[payer] += amt;
    } else {
      paidMap[payer] = amt;
    }

    const rawSplits = (exp.split_members || []).map((m) => m?.trim()).filter(Boolean) as string[];
    const splits = rawSplits.length > 0 ? rawSplits : members;
    const perShare = splits.length > 0 ? amt / splits.length : 0;
    splits.forEach((sm) => {
      if (shareMap[sm] !== undefined) {
        shareMap[sm] += perShare;
      } else {
        shareMap[sm] = perShare;
      }
    });
  });

  const memberBalances: MemberBalance[] = members.map((m) => {
    const paid = Math.round((paidMap[m] || 0) * 100) / 100;
    const share = Math.round((shareMap[m] || 0) * 100) / 100;
    const net = Math.round((paid - share) * 100) / 100;
    return {
      member: m,
      paidTotal: paid,
      shareTotal: share,
      netBalance: net,
    };
  });

  // Greedy Balance Matching (Minimum Cash Flow)
  const balances: Record<string, number> = {};
  memberBalances.forEach((mb) => {
    balances[mb.member] = mb.netBalance;
  });

  const transfers: CashFlowTransfer[] = [];

  while (true) {
    let maxCreditor: string | null = null;
    let maxCredit = 0.01;
    let maxDebtor: string | null = null;
    let maxDebt = -0.01;

    for (const [member, balance] of Object.entries(balances)) {
      if (balance > maxCredit) {
        maxCredit = balance;
        maxCreditor = member;
      }
      if (balance < maxDebt) {
        maxDebt = balance;
        maxDebtor = member;
      }
    }

    if (!maxCreditor || !maxDebtor) break;

    const transferAmount = Math.round(Math.min(maxCredit, -maxDebt) * 100) / 100;
    if (transferAmount <= 0.01) break;

    transfers.push({
      from: maxDebtor,
      to: maxCreditor,
      amount: transferAmount,
    });

    balances[maxCreditor] = Math.round((balances[maxCreditor] - transferAmount) * 100) / 100;
    balances[maxDebtor] = Math.round((balances[maxDebtor] + transferAmount) * 100) / 100;
  }

  // Build WeChat-friendly summary text
  const baseCurrency = fx?.base?.trim().toUpperCase();
  const currencySymbol = currencySymbolFor(baseCurrency ?? expenses[0]?.currency);
  const lines: string[] = [
    `✈️ 旅行费用 AA 清算账单`,
    `💰 总支出: ${currencySymbol}${totalExpense} (共 ${members.length} 人)`,
    `------------------------------`,
  ];

  if (transfers.length === 0) {
    lines.push('🎉 全员账目已完全持平，无需任何转账！');
  } else {
    transfers.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.from} 👉 微信转账给 ${t.to}: ${currencySymbol}${t.amount}`);
    });
    const evenMembers = memberBalances.filter((mb) => Math.abs(mb.netBalance) <= 0.01).map((mb) => mb.member);
    if (evenMembers.length > 0) {
      lines.push(`------------------------------`);
      lines.push(`• ${evenMembers.join('、')} 账目持平，无需转账。`);
    }
  }

  return {
    totalExpense: Math.round(totalExpense * 100) / 100,
    memberBalances,
    transfers,
    summaryText: lines.join('\n'),
  };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((c) => c.replace(/^["']|["']$/g, '').trim());
}

export function parseImportPayload(rawText: string, tripId: string): PlannerTripPlace[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const results: PlannerTripPlace[] = [];
  const now = new Date().toISOString();

  const makePlace = (partial: Partial<PlannerTripPlace> & { title: string; category?: string }): PlannerTripPlace => {
    const allowedKinds: PlannerPlaceKind[] = ['attraction', 'food', 'cafe', 'stay', 'shopping', 'transit', 'experience', 'other'];
    const explicitKind = allowedKinds.includes(partial.kind as PlannerPlaceKind) ? partial.kind : undefined;
    const kind = explicitKind
      || (partial.category ? inferPlaceKind(partial.category) : undefined)
      || (partial.source_category ? inferPlaceKind(partial.source_category) : undefined)
      || inferPlaceKind(partial.title);
    const allowedProviders: PlannerPlaceSourceProvider[] = ['google_maps', 'google_travel', 'tabelog', 'xiaohongshu', 'booking', 'other'];
    const sourceProvider = allowedProviders.includes(partial.source_provider as PlannerPlaceSourceProvider)
      ? partial.source_provider as PlannerPlaceSourceProvider
      : (partial.source_url ? inferSourceProvider(partial.source_url) : 'other');
    const priority: PlannerPlacePriority = ['must', 'want', 'optional'].includes(partial.priority as string)
      ? partial.priority as PlannerPlacePriority
      : 'want';
    const normalizedPrice = normalizeObservedPrice(partial.observed_price, partial.price_currency);
    const explicitPriceUnit = ['person', 'night', 'item', 'level', 'unknown'].includes(partial.price_unit as string)
      ? partial.price_unit as PlannerPriceUnit
      : undefined;
    const tags = Array.isArray(partial.tags) ? partial.tags.filter((value): value is string => typeof value === 'string') : [];
    const signals = Array.isArray(partial.signals) ? partial.signals.filter((value): value is string => typeof value === 'string') : [];
    const risks = Array.isArray(partial.risks) ? partial.risks.filter((value): value is string => typeof value === 'string') : [];
    const reviewTopics = Array.isArray(partial.review_topics) ? partial.review_topics.filter((value): value is string => typeof value === 'string') : undefined;
    const types = Array.isArray(partial.types) ? partial.types.filter((value): value is string => typeof value === 'string') : undefined;
    const coordinates = partial.coordinates
      && Number.isFinite(partial.coordinates.lat)
      && Number.isFinite(partial.coordinates.lng)
      && partial.coordinates.lat >= -90
      && partial.coordinates.lat <= 90
      && partial.coordinates.lng >= -180
      && partial.coordinates.lng <= 180
      ? partial.coordinates
      : undefined;
    return {
      schema_version: '0.1',
      type: 'trip_place',
      id: partial.id || crypto.randomUUID(),
      trip_id: tripId,
      title: partial.title.trim(),
      source_provider: sourceProvider,
      source_url: partial.source_url || '',
      source_place_id: partial.source_place_id,
      kind,
      area: partial.area?.trim() || undefined,
      priority,
      tags: ensurePlaceKindTag(tags, kind),
      why: partial.why?.trim() || undefined,
      signals,
      risks,
      notes: partial.notes?.trim() || undefined,
      source_category: partial.source_category?.trim() || partial.category?.trim() || undefined,
      observed_rating: typeof partial.observed_rating === 'number' && Number.isFinite(partial.observed_rating) ? partial.observed_rating : undefined,
      observed_review_count: typeof partial.observed_review_count === 'number' && Number.isFinite(partial.observed_review_count) && partial.observed_review_count >= 0
        ? Math.round(partial.observed_review_count)
        : undefined,
      observed_price: partial.observed_price?.trim() || undefined,
      price_currency: partial.price_currency?.trim().toUpperCase() || normalizedPrice?.currency,
      price_min: typeof partial.price_min === 'number' && Number.isFinite(partial.price_min) ? partial.price_min : normalizedPrice?.min,
      price_max: typeof partial.price_max === 'number' && Number.isFinite(partial.price_max) ? partial.price_max : normalizedPrice?.max,
      price_unit: explicitPriceUnit || normalizedPrice?.unit,
      price_level: typeof partial.price_level === 'number' && Number.isFinite(partial.price_level) ? partial.price_level : normalizedPrice?.level,
      observed_at: partial.observed_at,
      preferred_window: partial.preferred_window,
      duration_minutes: typeof partial.duration_minutes === 'number' && Number.isFinite(partial.duration_minutes) && partial.duration_minutes > 0
        ? partial.duration_minutes
        : undefined,
      open_hours: partial.open_hours?.trim() || undefined,
      address: partial.address?.trim() || undefined,
      coordinates,
      phone: partial.phone?.trim() || undefined,
      plus_code: partial.plus_code?.trim() || undefined,
      menu_url: partial.menu_url?.trim() || undefined,
      reservation_url: partial.reservation_url?.trim() || undefined,
      reservation_status: partial.reservation_status || 'none',
      review_topics: reviewTopics,
      types,
      hotel_facts: partial.hotel_facts,
      state: 'candidate',
      created_at: partial.created_at || now,
      updated_at: partial.updated_at || now,
    };
  };

  // 1. Try JSON
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (typeof item === 'object' && item !== null) {
          const title = String(item.title || item.name || item.placeName || '').trim();
          if (!title) continue;
          const coords = item.coordinates || (
            typeof item.lat === 'number' && typeof item.lng === 'number'
              ? { lat: item.lat, lng: item.lng }
              : undefined
          );
          results.push(makePlace({
            ...item,
            title,
            coordinates: coords,
          }));
        }
      }
      if (results.length > 0) return results;
    } catch {}
  }

  // 2. Try KML
  if (trimmed.includes('<Placemark') || trimmed.includes('<kml')) {
    const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/gi;
    let match: RegExpExecArray | null;
    while ((match = placemarkRegex.exec(trimmed)) !== null) {
      const chunk = match[0];
      const nameMatch = /<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/i.exec(chunk);
      const title = nameMatch ? nameMatch[1].trim() : '';
      if (!title) continue;

      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(chunk);
      const addressMatch = /<address>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/address>/i.exec(chunk);
      const coordMatch = /<coordinates>\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(chunk);

      let coordinates: { lat: number; lng: number } | undefined;
      if (coordMatch) {
        const lng = parseFloat(coordMatch[1]);
        const lat = parseFloat(coordMatch[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          coordinates = { lat, lng };
        }
      }

      results.push(makePlace({
        title: title.replace(/^\d+\.\s*/, ''),
        notes: descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : undefined,
        address: addressMatch ? addressMatch[1].trim() : undefined,
        coordinates,
      }));
    }
    if (results.length > 0) return results;
  }

  // 3. Try CSV
  if (trimmed.includes(',') && trimmed.includes('\n')) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const headerLine = lines[0].toLowerCase();
      if (headerLine.includes('title') || headerLine.includes('kind') || headerLine.includes('name') || headerLine.includes('order')) {
        const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
        const titleIdx = headers.findIndex((h) => h === 'title' || h === 'name');
        const kindIdx = headers.findIndex((h) => h === 'kind' || h === 'category');
        const addrIdx = headers.findIndex((h) => h === 'address');
        const priceIdx = headers.findIndex((h) => h === 'price' || h === 'observed_price');
        const ratingIdx = headers.findIndex((h) => h === 'rating' || h === 'observed_rating');
        const notesIdx = headers.findIndex((h) => h === 'notes' || h === 'why');
        const urlIdx = headers.findIndex((h) => h.includes('url') || h.includes('link'));

        if (titleIdx !== -1) {
          for (let i = 1; i < lines.length; i++) {
            const cells = splitCsvLine(lines[i]);
            const title = cells[titleIdx];
            if (!title) continue;
            results.push(makePlace({
              title,
              kind: kindIdx !== -1 && cells[kindIdx] ? inferPlaceKind(cells[kindIdx]) : undefined,
              address: addrIdx !== -1 ? cells[addrIdx] : undefined,
              observed_price: priceIdx !== -1 ? cells[priceIdx] : undefined,
              observed_rating: ratingIdx !== -1 && !isNaN(Number(cells[ratingIdx])) ? Number(cells[ratingIdx]) : undefined,
              notes: notesIdx !== -1 ? cells[notesIdx] : undefined,
              source_url: urlIdx !== -1 ? cells[urlIdx] : undefined,
            }));
          }
          if (results.length > 0) return results;
        }
      }
    }
  }

  // 4. Line-by-line / text & Google Maps links fallback
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) {
      const coords = extractPlaceCoordinates(line);
      let title = 'Saved Place';
      const placeMatch = /\/maps\/place\/([^/@?]+)/.exec(line);
      if (placeMatch?.[1]) {
        try { title = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')); } catch { title = placeMatch[1]; }
      }
      results.push(makePlace({
        title,
        source_url: line,
        coordinates: coords ?? undefined,
      }));
    } else {
      const cleanTitle = line.replace(/^[-*•\d+.)\]\s]+/, '').trim();
      if (cleanTitle.length > 0) {
        results.push(makePlace({
          title: cleanTitle,
        }));
      }
    }
  }

  return results;
}

export interface PlaceExpenseEstimate {
  title: string;
  amount: number;
  minAmount: number;
  maxAmount: number;
  currency: string;
  unit: PlannerPriceUnit;
  category: TripExpenseCategory;
}

export function parsePlaceExpenseEstimate(
  place: PlannerTripPlace | PlannerScheduledPlace,
  fallbackCurrency = 'USD',
): PlaceExpenseEstimate | null {
  const normalized = normalizeObservedPrice(
    place.observed_price,
    place.price_currency || fallbackCurrency,
  );
  const minAmount = typeof place.price_min === 'number' && Number.isFinite(place.price_min)
    ? place.price_min
    : normalized?.min;
  const maxAmount = typeof place.price_max === 'number' && Number.isFinite(place.price_max)
    ? place.price_max
    : normalized?.max;
  const unit = place.price_unit || normalized?.unit || 'unknown';
  if (unit === 'level' || minAmount === undefined || maxAmount === undefined || minAmount < 0 || maxAmount < 0) return null;

  const currency = (place.price_currency || normalized?.currency || fallbackCurrency).trim().toUpperCase();
  if (!currency) return null;
  const amount = (minAmount + maxAmount) / 2;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let category: TripExpenseCategory = 'other';
  switch (place.kind) {
    case 'stay': category = 'stay'; break;
    case 'food':
    case 'cafe': category = 'food'; break;
    case 'attraction':
    case 'experience': category = 'ticket'; break;
    case 'shopping': category = 'shopping'; break;
    case 'transit': category = 'transit'; break;
    default: category = 'other';
  }

  return {
    title: place.title,
    amount,
    minAmount,
    maxAmount,
    currency,
    unit,
    category,
  };
}

export function exportTripToMarkdown(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  scheduledPlaces: PlannerScheduledPlace[],
  expenses: TripExpenseItem[] = [],
  language: 'en' | 'zh' = 'zh',
): string {
  const zh = language === 'zh';
  const tripPlaces = places.filter((p) => p.trip_id === trip.id && p.state !== 'dropped');
  const dates = listTripDates(trip.start_date, trip.end_date);

  const lines: string[] = [
    `# ✈️ ${trip.title}`,
    ``,
    `> 📅 **${zh ? '行程日期' : 'Dates'}:** ${trip.start_date} ~ ${trip.end_date}  `,
    `> 📍 **${zh ? '目的地' : 'Destinations'}:** ${(trip.destinations || []).join(', ') || (zh ? '未设定' : 'None')}  `,
    `> 💰 **${zh ? '基础币种' : 'Currency'}:** ${trip.currency || 'USD'}  `,
    `> 👥 **${zh ? '出行成员' : 'Members'}:** ${(trip.members || [zh ? '我' : 'Me']).join(', ')}  `,
    ``,
    `---`,
    ``,
    `## 📋 ${zh ? '每日日程安排' : 'Daily Itinerary'}`,
    ``,
  ];

  dates.forEach((date, dayIdx) => {
    const dayPlaces = sortPlannerScheduledPlaces(scheduledPlaces.filter((p) => p.trip_id === trip.id && p.scheduled_date === date));
    lines.push(`### Day ${dayIdx + 1} (${date})`);

    if (dayPlaces.length === 0) {
      lines.push(`*${zh ? '暂未安排地点' : 'No places scheduled for this day.'}*\n`);
      return;
    }

    const routeUrl = buildGoogleMapsRouteUrl(dayPlaces, trip.transport_mode);
    if (routeUrl) {
      lines.push(`🔗 [${zh ? 'Google Maps 路线导航' : 'Google Maps Directions'}](${routeUrl})\n`);
    }

    dayPlaces.forEach((p, idx) => {
      const icon = PLANNER_KIND_ICONS[p.kind] || '📍';
      const kindLabel = getPlannerKindLabel(p.kind, language);
      const metaParts = [
        p.scheduled_start ? (zh ? `时间: ${p.scheduled_start}` : `Time: ${p.scheduled_start}`) : null,
        kindLabel,
        p.area,
        p.preferred_window ? (zh ? `时段: ${p.preferred_window}` : `Window: ${p.preferred_window}`) : null,
        p.duration_minutes ? (zh ? `${p.duration_minutes} 分钟` : `${p.duration_minutes} min`) : null,
        p.observed_rating ? `★ ${p.observed_rating}` : null,
        p.observed_price ? (zh ? `预估: ${p.observed_price}` : `Est: ${p.observed_price}`) : null,
      ].filter(Boolean);

      lines.push(`${idx + 1}. **${icon} ${p.title}** (${metaParts.join(' · ')})`);
      if (p.address) lines.push(`   - 📍 ${zh ? '地址' : 'Address'}: ${p.address}`);
      if (p.open_hours) lines.push(`   - ⏰ ${zh ? '营业时间' : 'Hours'}: ${p.open_hours}`);
      if (p.phone) lines.push(`   - 📞 ${zh ? '电话' : 'Phone'}: ${p.phone}`);
      if (p.why) lines.push(`   - 💡 ${zh ? '理由' : 'Why'}: ${p.why}`);
      if (p.notes) lines.push(`   - 📝 ${zh ? '备注' : 'Notes'}: ${p.notes}`);
      if (p.source_url) lines.push(`   - 🔗 [${zh ? '地点链接' : 'Place Link'}](${p.source_url})`);
    });

    lines.push(``);
  });

  const candidates = tripPlaces.filter((p) => p.state === 'candidate');
  if (candidates.length > 0) {
    lines.push(`---`, ``, `## 💡 ${zh ? '待选研究灵感池' : 'Candidate Research Pool'} (${candidates.length})`, ``);
    candidates.forEach((c) => {
      const icon = PLANNER_KIND_ICONS[c.kind] || '📍';
      lines.push(`- **${icon} ${c.title}** (${getPlannerKindLabel(c.kind, language)}${c.area ? ` · ${c.area}` : ''}${c.observed_price ? ` · ${c.observed_price}` : ''})`);
      if (c.why || c.notes) lines.push(`  *${c.why || c.notes}*`);
    });
    lines.push(``);
  }

  const tripExpenses = expenses.filter((e) => e.trip_id === trip.id);
  if (tripExpenses.length > 0) {
    lines.push(`---`, ``, `## 💰 ${zh ? '费用账本汇总' : 'Expense Summary'}`, ``);
    const baseCurrency = (trip.currency || 'USD').toUpperCase();
    const fx: FxSettings = { base: baseCurrency, overrides: trip.fx_rates };
    let total = 0;
    let unconverted = 0;
    tripExpenses.forEach((e) => {
      const rate = effectiveFxRate(e.currency, fx);
      if (rate === null) unconverted += 1;
      else total += e.amount * rate;
      lines.push(`- **${e.date || '-'}** | ${e.title} (${e.category}): ${e.currency} ${e.amount} (${zh ? '付款人' : 'Paid by'}: ${e.paid_by})`);
    });
    const totalText = `${currencySymbolFor(baseCurrency)}${total.toFixed(getCurrencyDecimals(baseCurrency))} ${baseCurrency}`;
    lines.push(``, `**${zh ? '总支出笔数' : 'Total Entries'}:** ${tripExpenses.length} | **${zh ? '已折算总额' : 'Converted Total'}:** ${totalText}`);
    if (unconverted > 0) {
      lines.push(`> ⚠️ ${zh ? `${unconverted} 笔支出缺少可用汇率，未计入折算总额。` : `${unconverted} expense(s) had no usable FX rate and were excluded from the converted total.`}`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

