export type PlannerTripStatus = 'planning' | 'active' | 'completed';
export type PlannerPlaceState = 'candidate' | 'scheduled' | 'done' | 'dropped';
export type PlannerPlacePriority = 'must' | 'want' | 'optional';
export type PlannerReservationStatus = 'none' | 'needed' | 'booked';
export type PlannerPlaceKind =
  | 'attraction'
  | 'food'
  | 'cafe'
  | 'stay'
  | 'shopping'
  | 'transit'
  | 'experience'
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
  transport_mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  travel_preferences?: string[];
  created_at: string;
  updated_at?: string;
}

export type PlannerPlaceSourceProvider =
  | 'google_maps'
  | 'tabelog'
  | 'xiaohongshu'
  | 'booking'
  | 'other';

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
  priority: PlannerPlacePriority;
  tags: string[];
  why?: string;
  signals: string[];
  risks: string[];
  notes?: string;
  observed_rating?: number;
  observed_price?: string;
  observed_at?: string;
  preferred_window?: string;
  duration_minutes?: number;
  reservation_status: PlannerReservationStatus;
  state: PlannerPlaceState;
  scheduled_date?: string;
  sort_order?: number;
  locked?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PlannerTripBooking {
  schema_version: '0.1';
  type: 'trip_booking';
  id: string;
  trip_id: string;
  title: string;
  kind: 'stay' | 'flight' | 'rail' | 'ticket' | 'restaurant' | 'other';
  starts_at: string;
  ends_at?: string;
  place_id?: string;
  confirmation?: string;
  amount?: number;
  currency?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface OwnlyCaptureState {
  version: 1;
  trips: PlannerTrip[];
  activeTripId: string | null;
  pendingPlaces: PlannerTripPlace[];
  knownPlaceIds: Record<string, string>;
}

export const EMPTY_CAPTURE_STATE: OwnlyCaptureState = {
  version: 1,
  trips: [],
  activeTripId: null,
  pendingPlaces: [],
  knownPlaceIds: {},
};

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

export function sortPlannerPlaces(places: PlannerTripPlace[]): PlannerTripPlace[] {
  return [...places].sort((left, right) => {
    const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.title.localeCompare(right.title);
  });
}

export function mergeCapturedPlaceResearch(
  existing: PlannerTripPlace,
  captured: PlannerTripPlace,
): PlannerTripPlace {
  return {
    ...existing,
    title: captured.title,
    source_provider: captured.source_provider,
    source_url: captured.source_url,
    source_place_id: captured.source_place_id,
    kind: captured.kind,
    area: captured.area,
    priority: captured.priority,
    tags: captured.tags,
    why: captured.why,
    signals: captured.signals,
    risks: captured.risks,
    notes: captured.notes,
    observed_rating: captured.observed_rating,
    observed_price: captured.observed_price,
    observed_at: captured.observed_at,
    preferred_window: captured.preferred_window,
    duration_minutes: captured.duration_minutes,
    updated_at: captured.updated_at,
  };
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

function directionsUrl(stops: PlannerTripPlace[], travelMode: PlannerTrip['transport_mode']): string {
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
  places: PlannerTripPlace[],
  travelMode: PlannerTrip['transport_mode'] = 'transit',
): string[] {
  const scheduled = sortPlannerPlaces(places).filter((place) => place.state === 'scheduled');
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
  if (!category) return 'attraction';
  const lower = category.toLowerCase();
  if (/restaurant|food|diner|ramen|sushi|izakaya|bar|pub|bistro|steak|grill|noodle|bakery|dessert|cafe|coffee|tea|餐厅|饭店|美食|料理|小吃|拉面|火锅|烤肉|甜品|面包|咖啡|酒吧|居酒屋/.test(lower)) {
    if (/cafe|coffee|tea|dessert|bakery|咖啡|甜品|面包|茶/.test(lower)) return 'cafe';
    return 'food';
  }
  if (/hotel|resort|hostel|inn|ryokan|stay|motel|guesthouse|酒店|旅馆|民宿|饭店|度假村/.test(lower)) {
    return 'stay';
  }
  if (/store|mall|market|shopping|bazaar|outlet|plaza|商场|超市|购物|市场|商店|奥特莱斯/.test(lower)) {
    return 'shopping';
  }
  if (/station|subway|bus|airport|terminal|ferry|transit|车站|地铁|机场|码头|交通/.test(lower)) {
    return 'transit';
  }
  if (/museum|temple|shrine|park|attraction|landmark|castle|garden|tower|tourist|historic|gallery|beach|viewpoint|景点|寺|神社|博物馆|公园|观光|古迹|城堡|塔|美术馆|沙滩|观景台/.test(lower)) {
    return 'attraction';
  }
  return 'experience';
}

export function inferSourceProvider(url: string): PlannerPlaceSourceProvider {
  if (/google\.[a-z.]+\/maps|maps\.google\./i.test(url)) return 'google_maps';
  if (/tabelog\.com/i.test(url)) return 'tabelog';
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'xiaohongshu';
  if (/booking\.com/i.test(url)) return 'booking';
  return 'other';
}
