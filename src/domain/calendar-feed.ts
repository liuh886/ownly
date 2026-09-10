import {
  getPlannerKindLabel,
  PLANNER_KIND_ICONS,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
  type PlannerTripCalendarFeed,
} from './planner';
import {
  materializePlannerScheduledPlaces,
  sortPlannerScheduledPlaces,
  type PlannerTripVisit,
  type PlannerScheduledPlace,
} from './planner-visits';
import { getScheduledEndTime } from './planner-schedule';

export const ICS_PRIORITY_MAP: Record<PlannerPlacePriority, number> = {
  must: 1,
  want: 5,
  optional: 9,
};

export interface CalendarExportOptions {
  includeAlarms?: boolean;
  alarmMinutes?: number;
  language?: 'zh' | 'en';
  /** Custom base URL for feed links, defaults to https://calendar.ownly.app */
  feedBaseUrl?: string;
  /**
   * Reference "today" for the one-year ICS window. Accepts a Date or a
   * YYYY-MM-DD string. Defaults to the actual current date.
   * Tests should pass an explicit value to stay deterministic.
   */
  now?: Date | string;
  /** Prefix prepended to every event SUMMARY (e.g. account feeds tag the trip title). */
  summaryPrefix?: string;
}

/**
 * Sentinel trip_id for the account-level aggregate feed row: one subscription
 * per account covering every trip, instead of one feed per trip.
 */
export const ACCOUNT_FEED_TRIP_ID = '*';

export interface AccountCalendarFeedMeta {
  feed_token: string;
  updated_at: string;
  enabled: boolean;
}

function accountFeedStorageKey(userId: string): string {
  return `ownly:account-calendar-feed:${userId}`;
}

/**
 * Loads the account feed token metadata persisted on this device.
 * The raw bearer token never leaves the device except inside subscription URLs
 * the user copies; only its SHA-256 is stored server-side.
 */
export function loadAccountFeedMeta(userId: string): AccountCalendarFeedMeta | null {
  try {
    if (typeof window === 'undefined' || !userId) return null;
    const raw = window.localStorage.getItem(accountFeedStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountCalendarFeedMeta>;
    if (typeof parsed.feed_token !== 'string' || !parsed.feed_token) return null;
    return {
      feed_token: parsed.feed_token,
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : '',
      enabled: parsed.enabled !== false,
    };
  } catch {
    return null;
  }
}

export function saveAccountFeedMeta(userId: string, meta: AccountCalendarFeedMeta): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(accountFeedStorageKey(userId), JSON.stringify(meta));
  } catch {
    // Storage full or blocked: feed still works, token just won't persist.
  }
}

export function clearAccountFeedMeta(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(accountFeedStorageKey(userId));
  } catch {
    // ignore
  }
}

const VISIT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Earliest visit date (inclusive, YYYY-MM-DD) kept in ICS output:
 * exactly one calendar year before the reference date.
 * Older occurrences are skipped to bound feed length.
 */
export function getIcsWindowCutoffDate(now: Date | string = new Date()): string {
  const ref = typeof now === 'string' ? new Date(`${now}T00:00:00Z`) : now;
  const base = Number.isNaN(ref.getTime()) ? new Date() : ref;
  const cutoff = new Date(Date.UTC(base.getUTCFullYear() - 1, base.getUTCMonth(), base.getUTCDate()));
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Keeps visits inside the one-year ICS window. Malformed dates fail open
 * (preserved, as before) so a bad string can never silently drop a visit.
 */
export function isVisitInIcsWindow(date: string | undefined, cutoff: string): boolean {
  if (!date || !VISIT_DATE_PATTERN.test(date)) return true;
  return date >= cutoff;
}

/**
 * Escapes characters per RFC 5545 Section 3.3.11 (TEXT).
 * Backslashes, semicolons, commas, and newlines must be escaped.
 */
export function escapeIcsText(str?: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * Folds lines to max 75 octets per RFC 5545 Section 3.1.
 * UTF-8 characters are safely folded without cutting multi-byte code points.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let currentBytes: number[] = [];
  let lineLimit = 75;

  for (const char of line) {
    const charBytes = Array.from(encoder.encode(char));
    if (currentBytes.length + charBytes.length > lineLimit) {
      chunks.push(new TextDecoder().decode(new Uint8Array(currentBytes)));
      currentBytes = [...charBytes];
      lineLimit = 74; // Subsequent lines have 1 leading space (1 byte)
    } else {
      currentBytes.push(...charBytes);
    }
  }

  if (currentBytes.length > 0) {
    chunks.push(new TextDecoder().decode(new Uint8Array(currentBytes)));
  }

  return chunks.join('\r\n ');
}

/**
 * Converts 'YYYY-MM-DD' to 'YYYYMMDD' for VALUE=DATE.
 */
export function toIcsDateString(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Returns the non-inclusive next day in 'YYYYMMDD' format for all-day DTEND.
 */
export function getNextDayDateString(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Converts 'YYYY-MM-DD' and 'HH:mm' to 'YYYYMMDDTHHmm00'.
 */
export function toIcsDateTimeString(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return `${cleanDate}T${cleanTime}`;
}

/**
 * Curated IANA zones for the trip timezone picker. Timeline wall-clock times
 * are interpreted in the trip zone and emitted as UTC for calendar export.
 */
export const COMMON_TIMEZONES = [
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Ho_Chi_Minh',
  'Asia/Kuala_Lumpur',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Taipei',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Moscow',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Vancouver',
  'UTC',
];

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Interprets a destination wall-clock time ('YYYY-MM-DD' + 'HH:mm') in the
 * given IANA zone and returns the UTC epoch millis. Iterative Intl-based
 * resolution, so DST offsets are honored without bundled tzdata.
 * Returns null for malformed input or unknown zones (caller falls back to
 * floating local time). A wall time inside a DST gap resolves to the nearest
 * valid instant on the forward side.
 */
export function zonedWallTimeToUtcMs(dateStr: string, timeStr: string, timeZone: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dm || !tm || !isValidIanaTimeZone(timeZone)) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;

  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  let utc = wallAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = fmt.formatToParts(new Date(utc));
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    const asUtc = Date.UTC(
      Number(get('year')),
      Number(get('month')) - 1,
      Number(get('day')),
      Number(get('hour')),
      Number(get('minute')),
      Number(get('second')),
    );
    const next = utc + (wallAsUtc - asUtc);
    if (next === utc) break;
    utc = next;
  }
  return utc;
}

/**
 * Formats epoch millis as an RFC 5545 UTC timestamp ('YYYYMMDDTHHmmSSZ').
 */
export function toIcsUtcString(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/**
 * Resolves the effective IANA zone for one event date: per-day override wins,
 * then the trip-level zone. Returns undefined when neither is set (caller
 * falls back to floating local time).
 */
export function resolveTripTimeZoneForDate(trip: PlannerTrip, date: string): string | undefined {
  const dayZone = trip.day_timezones?.[date]?.trim();
  if (dayZone) return dayZone;
  const tripZone = trip.timezone?.trim();
  return tripZone ? tripZone : undefined;
}

/**
 * Formats a single scheduled place into a VEVENT string block.
 */
function buildVEvent(
  place: PlannerScheduledPlace,
  options: CalendarExportOptions,
  nowTimestamp: string,
  timeZone?: string,
): string[] {
  const {
    includeAlarms = true,
    alarmMinutes = 15,
    language = 'zh',
  } = options;
  const zh = language === 'zh';
  const icon = PLANNER_KIND_ICONS[place.kind] || '📍';
  const kindLabel = getPlannerKindLabel(place.kind, language);

  const lines: string[] = ['BEGIN:VEVENT'];

  // Stable UID directly derived from Visit ID (Occurrence Authority).
  // visit_id already carries the `visit:` prefix; do not stack another one.
  const uid = place.visit_id ? `${place.visit_id}@ownly` : `place:${place.id}@ownly`;
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${nowTimestamp}`);

  if (place.scheduled_start) {
    const startTime = place.scheduled_start;
    const durationMinutes =
      place.duration_minutes && place.duration_minutes > 0 ? place.duration_minutes : 60;
    const startUtcMs = timeZone ? zonedWallTimeToUtcMs(place.scheduled_date, startTime, timeZone) : null;
    if (startUtcMs !== null) {
      // Trip timezone set: emit absolute UTC so subscriber calendars render the
      // same instant in any display zone. End is start + duration, so midnight
      // rollover lands on the next day instead of wrapping to 23:59.
      lines.push(`DTSTART:${toIcsUtcString(startUtcMs)}`);
      lines.push(`DTEND:${toIcsUtcString(startUtcMs + durationMinutes * 60000)}`);
    } else {
      // No (or invalid) trip timezone: legacy floating local time.
      const endTime = getScheduledEndTime(startTime, place.duration_minutes || 60) || '23:59';
      lines.push(`DTSTART:${toIcsDateTimeString(place.scheduled_date, startTime)}`);
      lines.push(`DTEND:${toIcsDateTimeString(place.scheduled_date, endTime)}`);
    }
  } else {
    // Untimed all-day event
    lines.push(`DTSTART;VALUE=DATE:${toIcsDateString(place.scheduled_date)}`);
    lines.push(`DTEND;VALUE=DATE:${getNextDayDateString(place.scheduled_date)}`);
  }

  // Summary (account feeds prefix the trip title so one subscription can
  // carry many trips without ambiguity).
  const prefix = options.summaryPrefix ? `${options.summaryPrefix} ` : '';
  lines.push(`SUMMARY:${escapeIcsText(`${prefix}${icon} ${place.title}`)}`);

  // Location
  if (place.address) {
    lines.push(`LOCATION:${escapeIcsText(place.address)}`);
  }

  // Description
  const descParts: string[] = [];
  descParts.push(`🏷️ ${zh ? '类别' : 'Category'}: ${kindLabel}${place.area ? ` · ${place.area}` : ''}`);
  if (place.observed_rating) {
    descParts.push(`⭐ ${zh ? '评分' : 'Rating'}: ${place.observed_rating}`);
  }
  if (place.observed_price) {
    descParts.push(`💰 ${zh ? '参考价格' : 'Price'}: ${place.observed_price}`);
  }
  if (place.phone) {
    descParts.push(`📞 ${zh ? '电话' : 'Phone'}: ${place.phone}`);
  }
  if (place.why) {
    descParts.push(`💡 ${zh ? '理由' : 'Why'}: ${place.why}`);
  }
  if (place.notes) {
    descParts.push(`📝 ${zh ? '备注' : 'Notes'}: ${place.notes}`);
  }
  if (place.source_url) {
    descParts.push(`🔗 ${zh ? '地点链接' : 'Place Link'}: ${place.source_url}`);
  }

  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
  }

  if (place.source_url) {
    lines.push(`URL:${escapeIcsText(place.source_url)}`);
  }

  // Categories & Priority
  lines.push(`CATEGORIES:${escapeIcsText(`${kindLabel},Travel,Ownly`)}`);
  if (place.priority && ICS_PRIORITY_MAP[place.priority]) {
    lines.push(`PRIORITY:${ICS_PRIORITY_MAP[place.priority]}`);
  }

  lines.push('STATUS:CONFIRMED');

  // Alarm reminder for 'must' visits
  if (includeAlarms && place.priority === 'must') {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`${icon} ${place.title}`)}`,
      `TRIGGER:-PT${alarmMinutes}M`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

/**
 * Builds a deterministic RFC 5545 iCalendar string (.ics) for a trip.
 */
export function buildTripCalendarIcs(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  options: CalendarExportOptions = {},
): string {
  const tripPlaces = places.filter((place) => place.trip_id === trip.id && place.state !== 'dropped');
  const tripVisits = visits.filter((visit) => visit.trip_id === trip.id);
  const cutoff = getIcsWindowCutoffDate(options.now);
  const windowedVisits = tripVisits.filter((visit) => isVisitInIcsWindow(visit.date, cutoff));
  const scheduled = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(tripPlaces, windowedVisits));

  const nowTimestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const rawLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ownly//Planner Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(trip.title)}`,
    `X-WR-CALDESC:${escapeIcsText(`Ownly travel itinerary for ${trip.title}`)}`,
    'X-PUBLISHED-TTL:PT60M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT60M',
  ];

  scheduled.forEach((place) => {
    rawLines.push(...buildVEvent(place, options, nowTimestamp, resolveTripTimeZoneForDate(trip, place.scheduled_date)));
  });

  rawLines.push('END:VCALENDAR');

  return rawLines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Builds one deterministic RFC 5545 feed aggregating every trip of an account.
 * Each event SUMMARY is prefixed with its trip title (`【TH26】 …`) so the
 * single subscription stays readable; per-trip timezones keep applying, and
 * UIDs stay globally stable (`visit:<id>@ownly`) across re-publishes.
 */
export function buildAccountCalendarIcs(
  trips: PlannerTrip[],
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  options: CalendarExportOptions = {},
): { ics: string; tripCount: number; eventCount: number } {
  const nowTimestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const cutoff = getIcsWindowCutoffDate(options.now);
  const orderedTrips = [...trips].sort((a, b) =>
    a.start_date === b.start_date ? (a.id < b.id ? -1 : 1) : (a.start_date < b.start_date ? -1 : 1),
  );

  const rawLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ownly//Planner Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Ownly',
    `X-WR-CALDESC:${escapeIcsText(`Ownly travel itineraries (${orderedTrips.length} trips)`)}`,
    'X-PUBLISHED-TTL:PT60M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT60M',
  ];

  let tripCount = 0;
  let eventCount = 0;
  for (const trip of orderedTrips) {
    const tripPlaces = places.filter((place) => place.trip_id === trip.id && place.state !== 'dropped');
    const windowedVisits = visits.filter(
      (visit) => visit.trip_id === trip.id && isVisitInIcsWindow(visit.date, cutoff),
    );
    if (windowedVisits.length === 0) continue;
    const scheduled = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(tripPlaces, windowedVisits));
    if (scheduled.length === 0) continue;
    tripCount += 1;
    const tripOptions: CalendarExportOptions = { ...options, summaryPrefix: `【${trip.title}】` };
    scheduled.forEach((place) => {
      rawLines.push(...buildVEvent(place, tripOptions, nowTimestamp, resolveTripTimeZoneForDate(trip, place.scheduled_date)));
    });
    eventCount += scheduled.length;
  }

  rawLines.push('END:VCALENDAR');

  return { ics: rawLines.map(foldIcsLine).join('\r\n') + '\r\n', tripCount, eventCount };
}

/**
 * Builds a deterministic RFC 5545 iCalendar string (.ics) for a single day of a trip.
 */
export function buildDayCalendarIcs(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  date: string,
  options: CalendarExportOptions = {},
): string {
  const tripPlaces = places.filter((place) => place.trip_id === trip.id && place.state !== 'dropped');
  const dayVisits = visits.filter((visit) => visit.trip_id === trip.id && visit.date === date);
  const cutoff = getIcsWindowCutoffDate(options.now);
  const windowedVisits = dayVisits.filter((visit) => isVisitInIcsWindow(visit.date, cutoff));
  const scheduled = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(tripPlaces, windowedVisits));

  const nowTimestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const rawLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ownly//Planner Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${trip.title} · ${date}`)}`,
    `X-WR-CALDESC:${escapeIcsText(`Ownly daily schedule for ${trip.title} on ${date}`)}`,
    'X-PUBLISHED-TTL:PT60M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT60M',
  ];

  scheduled.forEach((place) => {
    rawLines.push(...buildVEvent(place, options, nowTimestamp, resolveTripTimeZoneForDate(trip, place.scheduled_date)));
  });

  rawLines.push('END:VCALENDAR');

  return rawLines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Calendar Feed (PRO) Token & Subscription URL Utilities
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically secure 32-character bearer token (CSPRNG).
 */
export function generateCalendarFeedToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 32;
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    let token = '';
    for (let i = 0; i < length; i++) {
      token += chars[bytes[i] % chars.length];
    }
    return token;
  }
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Computes SHA-256 hash of the bearer token for secure database storage & lookup (token_hash).
 */
export async function hashFeedToken(token: string): Promise<string> {
  const clean = token.trim();
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(clean);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createHash('sha256').update(clean).digest('hex');
  } catch {
    throw new Error('Cryptographic environment (crypto.subtle or node:crypto) is required for secure token hashing.');
  }
}

/**
 * Production Supabase project hosting the calendar-feed Edge Function.
 * calendar.ownly.app is currently a domain-parking page, so feeds resolve
 * directly against the function URL until a reverse proxy is configured.
 */
const DEFAULT_SUPABASE_URL = 'https://blgwlycfcwvsupmqyqwn.supabase.co';

function getDefaultFeedHost(): string {
  const base =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
    DEFAULT_SUPABASE_URL;
  return `${base.replace(/\/+$/, '')}/functions/v1/calendar-feed`;
}

/**
 * Returns the public subscription URL for a given feed token.
 * Path-style (`/functions/v1/calendar-feed/<token>.ics`) is matched by the
 * Edge Function's extractToken pattern, same as the legacy `/f/` prefix.
 */
export function getCalendarFeedUrl(feedToken: string, host?: string): string {
  const cleanHost = (host || getDefaultFeedHost()).replace(/\/+$/, '');
  // Legacy short host keeps the /f/ prefix; the direct function host is
  // already scoped to /functions/v1/calendar-feed.
  const needsPrefix = !/\/functions\/v1\/calendar-feed$/.test(cleanHost);
  return needsPrefix ? `${cleanHost}/f/${feedToken}.ics` : `${cleanHost}/${feedToken}.ics`;
}

/**
 * Creates initial Calendar Feed metadata for a trip.
 */
export function createTripCalendarFeed(tripId: string): PlannerTripCalendarFeed {
  const now = new Date().toISOString();
  return {
    feed_token: generateCalendarFeedToken(),
    trip_id: tripId,
    created_at: now,
    updated_at: now,
    enabled: true,
  };
}

/**
 * Rotates the bearer token of an existing Calendar Feed.
 */
export function rotateTripCalendarFeed(feed: PlannerTripCalendarFeed): PlannerTripCalendarFeed {
  return {
    ...feed,
    feed_token: generateCalendarFeedToken(),
    updated_at: new Date().toISOString(),
    enabled: true,
  };
}
