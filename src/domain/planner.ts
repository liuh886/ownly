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
  open_hours?: string;
  is_anchor?: boolean;
  anchor_type?: 'flight' | 'stay_checkin' | 'stay_checkout' | 'transit' | 'reservation';
  address?: string;
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

export function checkOpeningHoursCollision(openHours?: string, scheduledDate?: string): { isCollision: boolean; reason?: string } {
  if (!openHours || !scheduledDate) return { isCollision: false };
  const date = parseDateOnly(scheduledDate);
  if (!date) return { isCollision: false };

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

  return { isCollision: false };
}

export function buildGoogleMapsRouteUrl(
  stops: PlannerTripPlace[],
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

export function exportPlacesToKML(tripTitle: string, dateOrDay: string, places: PlannerTripPlace[]): string {
  const placemarks = places.map((place, index) => `
    <Placemark>
      <name>${index + 1}. ${escapeXml(place.title)}</name>
      <description><![CDATA[
        <p><b>类别:</b> ${place.kind}</p>
        ${place.observed_rating ? `<p><b>评分:</b> ★ ${place.observed_rating}</p>` : ''}
        ${place.observed_price ? `<p><b>人均:</b> ${place.observed_price}</p>` : ''}
        ${place.why ? `<p><b>理由:</b> ${place.why}</p>` : ''}
        ${place.notes ? `<p><b>备注:</b> ${place.notes}</p>` : ''}
        ${place.address ? `<p><b>地址:</b> ${place.address}</p>` : ''}
        ${place.source_url ? `<p><a href="${place.source_url}">Google Maps 链接</a></p>` : ''}
      ]]></description>
      ${place.address ? `<address>${escapeXml(place.address)}</address>` : ''}
    </Placemark>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(tripTitle)} - ${escapeXml(dateOrDay)}</name>
    <description>Ownly Travel Planner Route Export</description>
    ${placemarks}
  </Document>
</kml>`;
}

export function exportPlacesToCSV(places: PlannerTripPlace[]): string {
  const headers = ['Order', 'Title', 'Kind', 'Rating', 'Price', 'Address', 'Why', 'Notes', 'Tags', 'Google_Maps_URL'];
  const rows = places.map((p, i) => [
    i + 1,
    `"${(p.title || '').replace(/"/g, '""')}"`,
    `"${p.kind}"`,
    p.observed_rating ?? '',
    `"${(p.observed_price || '').replace(/"/g, '""')}"`,
    `"${(p.address || '').replace(/"/g, '""')}"`,
    `"${(p.why || '').replace(/"/g, '""')}"`,
    `"${(p.notes || '').replace(/"/g, '""')}"`,
    `"${(p.tags || []).join(';')}"`,
    `"${p.source_url || ''}"`,
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
