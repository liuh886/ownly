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
 * Formats a single scheduled place into a VEVENT string block.
 */
function buildVEvent(
  place: PlannerScheduledPlace,
  options: CalendarExportOptions,
  nowTimestamp: string,
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

  // Stable UID directly derived from Visit ID (Occurrence Authority)
  const uid = place.visit_id ? `visit:${place.visit_id}@ownly` : `place:${place.id}@ownly`;
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${nowTimestamp}`);

  if (place.scheduled_start) {
    const startTime = place.scheduled_start;
    const endTime = getScheduledEndTime(startTime, place.duration_minutes || 60) || '23:59';
    lines.push(`DTSTART:${toIcsDateTimeString(place.scheduled_date, startTime)}`);
    lines.push(`DTEND:${toIcsDateTimeString(place.scheduled_date, endTime)}`);
  } else {
    // Untimed all-day event
    lines.push(`DTSTART;VALUE=DATE:${toIcsDateString(place.scheduled_date)}`);
    lines.push(`DTEND;VALUE=DATE:${getNextDayDateString(place.scheduled_date)}`);
  }

  // Summary
  lines.push(`SUMMARY:${escapeIcsText(`${icon} ${place.title}`)}`);

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
  const scheduled = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(tripPlaces, tripVisits));

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
    rawLines.push(...buildVEvent(place, options, nowTimestamp));
  });

  rawLines.push('END:VCALENDAR');

  return rawLines.map(foldIcsLine).join('\r\n') + '\r\n';
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
  const scheduled = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(tripPlaces, dayVisits));

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
    rawLines.push(...buildVEvent(place, options, nowTimestamp));
  });

  rawLines.push('END:VCALENDAR');

  return rawLines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Calendar Feed (PRO) Token & Subscription URL Utilities
// ---------------------------------------------------------------------------

/**
 * Generates a high-entropy 32-character bearer token for the feed URL.
 */
export function generateCalendarFeedToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Returns the public subscription URL for a given feed token.
 */
export function getCalendarFeedUrl(feedToken: string, host = 'https://calendar.ownly.app'): string {
  const cleanHost = host.replace(/\/+$/, '');
  return `${cleanHost}/f/${feedToken}.ics`;
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
