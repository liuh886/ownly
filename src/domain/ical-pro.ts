import {
  buildGoogleMapsRouteUrl,
  checkOpeningHoursCollision,
  ensurePlaceKindTag,
  extractPlaceCoordinates,
  getPlannerKindLabel,
  haversineDistanceKm,
  inferPlaceKind,
  inferSourceProvider,
  listTripDates,
  sortPlannerPlaces,
  PLANNER_KIND_ICONS,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from './planner';

export const ICAL_PRO_PRIORITY_MAP: Record<PlannerPlacePriority, string> = {
  must: '⏫',
  want: '🔼',
  optional: '🔽',
};

export const REVERSE_PRIORITY_MAP: Record<string, PlannerPlacePriority> = {
  '⏫': 'must',
  '🔼': 'want',
  '🔽': 'optional',
};

export interface ICalProExportOptions {
  includeAlarm?: boolean;
  alarmMinutes?: number;
  useDayPlannerHeadings?: boolean;
  language?: 'zh' | 'en';
  defaultStartTime?: string; // e.g. "09:00"
  transitBufferMinutes?: number; // e.g. 30
}

function formatMinutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Calculates a sequence of realistic start and end times for scheduled places on a single day.
 */
export function calculateDayTimeSlots(
  places: PlannerTripPlace[],
  options: { defaultStartTime?: string; transitBufferMinutes?: number } = {},
): Array<{ placeId: string; startTime: string; endTime: string; durationMinutes: number }> {
  const { defaultStartTime = '09:00', transitBufferMinutes = 30 } = options;
  let currentMinutes = parseTimeToMinutes(defaultStartTime) ?? 9 * 60;

  return places.map((place) => {
    // Window-based start time hints if first or matching window
    if (place.preferred_window) {
      const w = place.preferred_window.toLowerCase();
      if ((w === 'afternoon' || w === '下午') && currentMinutes < 13 * 60) {
        currentMinutes = 13 * 60;
      } else if ((w === 'evening' || w === '傍晚') && currentMinutes < 17 * 60) {
        currentMinutes = 17 * 60;
      } else if ((w === 'night' || w === '夜间' || w === '晚上') && currentMinutes < 19 * 60) {
        currentMinutes = 19 * 60;
      }
    }

    let duration = place.duration_minutes || (place.kind === 'food' || place.kind === 'cafe' ? 75 : place.kind === 'stay' ? 45 : 90);
    if (duration <= 0) duration = 60;

    const start = formatMinutesToTime(currentMinutes);
    const endMinutes = currentMinutes + duration;
    const end = formatMinutesToTime(endMinutes);

    currentMinutes = endMinutes + transitBufferMinutes;

    return {
      placeId: place.id,
      startTime: start,
      endTime: end,
      durationMinutes: duration,
    };
  });
}

/**
 * Exports a trip into standard Markdown syntax compliant with `obsidian-ical-plugin-pro`.
 * Supported syntax:
 * - Timed events: `- [ ] YYYY-MM-DD HH:mm-HH:mm Task Title [Emoji] [Priority] [Alarm]`
 * - Indented metadata: Address, Why, Notes, Phone, Price, Link (mapped to iCal DESCRIPTION)
 */
export function exportTripToICalProMarkdown(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  options: ICalProExportOptions = {},
): string {
  const {
    includeAlarm = true,
    alarmMinutes = 15,
    useDayPlannerHeadings = true,
    language = 'zh',
    defaultStartTime = '09:00',
    transitBufferMinutes = 30,
  } = options;
  const zh = language === 'zh';

  const tripPlaces = places.filter((p) => p.trip_id === trip.id && p.state !== 'dropped');
  const dates = listTripDates(trip.start_date, trip.end_date);

  const lines: string[] = [
    `---`,
    `title: ${JSON.stringify(trip.title)}`,
    `type: trip_itinerary`,
    `trip_id: ${JSON.stringify(trip.id)}`,
    `start_date: ${JSON.stringify(trip.start_date)}`,
    `end_date: ${JSON.stringify(trip.end_date)}`,
    `destinations: ${JSON.stringify(trip.destinations || [])}`,
    `currency: ${JSON.stringify(trip.currency || 'USD')}`,
    `generator: ownly-ai-planner-ical-pro`,
    `updated_at: ${JSON.stringify(new Date().toISOString())}`,
    `---`,
    ``,
    `# ✈️ ${trip.title}`,
    ``,
    `> 📅 **${zh ? '行程日期' : 'Dates'}:** ${trip.start_date} ~ ${trip.end_date} | 📍 **${zh ? '目的地' : 'Destinations'}:** ${(trip.destinations || []).join(', ') || (zh ? '未设定' : 'None')}`,
    `> 💡 **iCal Pro ${zh ? '日历同步说明' : 'Sync Info'}:** ${zh ? '此文件遵循 obsidian-ical-plugin-pro 语法规范，可通过插件自动暴露为 iCalendar 订阅源并同步至 Google Calendar / Apple Calendar。' : 'Compatible with obsidian-ical-plugin-pro for automatic Google Calendar sync.'}`,
    ``,
  ];

  dates.forEach((date, dayIdx) => {
    const dayPlaces = sortPlannerPlaces(
      tripPlaces.filter((p) => p.scheduled_date === date && p.state === 'scheduled'),
    );

    if (useDayPlannerHeadings) {
      lines.push(`## Day ${dayIdx + 1} · ${date}`);
    } else {
      lines.push(`### ${date}`);
    }

    if (dayPlaces.length === 0) {
      lines.push(`- [ ] ${date} ${zh ? '自由活动 / 待排期' : 'Free Day / Unscheduled'}\n`);
      return;
    }

    const routeUrl = buildGoogleMapsRouteUrl(dayPlaces, trip.transport_mode);
    if (routeUrl) {
      lines.push(`🗺️ [${zh ? '当天 Google Maps 路线导航' : 'Day Route Directions'}](${routeUrl})\n`);
    }

    const slots = calculateDayTimeSlots(dayPlaces, { defaultStartTime, transitBufferMinutes });
    const slotMap = new Map(slots.map((s) => [s.placeId, s] as const));

    dayPlaces.forEach((place) => {
      const slot = slotMap.get(place.id);
      const startTime = slot?.startTime || '09:00';
      const endTime = slot?.endTime || '10:30';
      const icon = PLANNER_KIND_ICONS[place.kind] || '📍';
      const priorityIcon = place.priority ? ICAL_PRO_PRIORITY_MAP[place.priority] || '🔼' : '🔼';
      const alarmTag = includeAlarm && place.priority === 'must' ? ` ⏰ ${alarmMinutes}` : '';

      // Main task line (RFC 5545 VEVENT trigger)
      lines.push(
        `- [ ] ${date} ${startTime}-${endTime} ${icon} ${place.title} ${priorityIcon}${alarmTag}`,
      );

      // Indented description details (mapped into VEVENT DESCRIPTION)
      const kindLabel = getPlannerKindLabel(place.kind, language);
      lines.push(`    - 🏷️ ${zh ? '类别' : 'Category'}: ${kindLabel}${place.area ? ` · ${place.area}` : ''}`);
      if (place.address) lines.push(`    - 📍 ${zh ? '地址' : 'Address'}: ${place.address}`);
      if (place.open_hours) lines.push(`    - ⏰ ${zh ? '营业时间' : 'Hours'}: ${place.open_hours}`);
      if (place.observed_price) lines.push(`    - 💰 ${zh ? '参考人均' : 'Price'}: ${place.observed_price}`);
      if (place.observed_rating) lines.push(`    - ⭐ ${zh ? '评分' : 'Rating'}: ★ ${place.observed_rating}`);
      if (place.phone) lines.push(`    - 📞 ${zh ? '电话' : 'Phone'}: ${place.phone}`);
      if (place.why) lines.push(`    - 💡 ${zh ? '理由' : 'Why'}: ${place.why}`);
      if (place.notes) lines.push(`    - 📝 ${zh ? '备注' : 'Notes'}: ${place.notes}`);
      if (place.source_url) lines.push(`    - 🔗 ${zh ? '链接' : 'Link'}: ${place.source_url}`);
    });

    lines.push(``);
  });

  const candidates = tripPlaces.filter((p) => p.state === 'candidate');
  if (candidates.length > 0) {
    lines.push(`---`, ``, `## 💡 ${zh ? '备选研究灵感池' : 'Candidate Pool'} (VTODO)`);
    candidates.forEach((c) => {
      const icon = PLANNER_KIND_ICONS[c.kind] || '📍';
      const priorityIcon = c.priority ? ICAL_PRO_PRIORITY_MAP[c.priority] || '🔼' : '🔼';
      lines.push(`- [ ] ${icon} ${c.title} ${priorityIcon}`);
      if (c.why || c.notes) lines.push(`    - ${c.why || c.notes}`);
      if (c.address) lines.push(`    - 📍 ${c.address}`);
    });
    lines.push(``);
  }

  return lines.join('\n');
}

export interface ParsedICalProTask {
  title: string;
  kind: PlannerTripPlace['kind'];
  date?: string;
  startTime?: string;
  endTime?: string;
  priority?: PlannerPlacePriority;
  address?: string;
  notes?: string;
  why?: string;
  openHours?: string;
  phone?: string;
  price?: string;
  sourceUrl?: string;
}

/**
 * Parses an iCal Pro formatted Markdown document back into structured places.
 */
export function parseICalProMarkdown(markdown: string, tripId: string): PlannerTripPlace[] {
  const lines = markdown.split(/\r?\n/);
  const places: PlannerTripPlace[] = [];
  let currentDate = '';
  let currentPlace: Partial<PlannerTripPlace> | null = null;
  const now = new Date().toISOString();

  const commitPlace = () => {
    if (!currentPlace || !currentPlace.title) return;
    const title = currentPlace.title.trim();
    if (!title) return;
    const kind = currentPlace.kind || inferPlaceKind(title);
    const place: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: currentPlace.id || crypto.randomUUID(),
      trip_id: tripId,
      title,
      source_provider: currentPlace.source_provider || (currentPlace.source_url ? inferSourceProvider(currentPlace.source_url) : 'other'),
      source_url: currentPlace.source_url || '',
      kind,
      priority: currentPlace.priority || 'want',
      tags: ensurePlaceKindTag(currentPlace.tags || [], kind),
      area: currentPlace.area,
      why: currentPlace.why,
      notes: currentPlace.notes,
      address: currentPlace.address,
      open_hours: currentPlace.open_hours,
      phone: currentPlace.phone,
      observed_price: currentPlace.observed_price,
      duration_minutes: currentPlace.duration_minutes,
      reservation_status: 'none',
      state: currentPlace.scheduled_date ? 'scheduled' : 'candidate',
      scheduled_date: currentPlace.scheduled_date,
      sort_order: currentPlace.sort_order,
      locked: Boolean(currentPlace.scheduled_date),
      created_at: currentPlace.created_at || now,
      updated_at: now,
      signals: [],
      risks: [],
    };
    places.push(place);
    currentPlace = null;
  };

  const taskRegex = /^\s*-\s*\[([ x/])] *(?:(\d{4}-\d{2}-\d{2})\s+)?(?:(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+)?([^\n]+)/;
  const headingDateRegex = /^#+\s+(?:Day\s+\d+\s+[·-]\s+)?(\d{4}-\d{2}-\d{2})/;
  const generalHeadingRegex = /^#+\s+.+/;

  let currentSortOrder = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = headingDateRegex.exec(trimmed);
    if (headingMatch) {
      commitPlace();
      currentDate = headingMatch[1];
      currentSortOrder = 0;
      continue;
    } else if (generalHeadingRegex.test(trimmed)) {
      commitPlace();
      currentDate = '';
      currentSortOrder = 0;
      continue;
    }

    const taskMatch = taskRegex.exec(line);
    if (taskMatch) {
      commitPlace();
      const explicitDate = taskMatch[2] || currentDate || undefined;
      const startTime = taskMatch[3];
      const endTime = taskMatch[4];
      let rawTitle = taskMatch[5].trim();

      // Extract priority
      let priority: PlannerPlacePriority = 'want';
      if (rawTitle.includes('⏫')) {
        priority = 'must';
        rawTitle = rawTitle.replace(/⏫/g, '');
      } else if (rawTitle.includes('🔽')) {
        priority = 'optional';
        rawTitle = rawTitle.replace(/🔽/g, '');
      } else if (rawTitle.includes('🔼')) {
        priority = 'want';
        rawTitle = rawTitle.replace(/🔼/g, '');
      }

      // Remove alarm notation (⏰ 15)
      rawTitle = rawTitle.replace(/⏰\s*\d+/g, '');

      // Detect icon / kind
      let kind = inferPlaceKind(rawTitle);
      for (const [k, icon] of Object.entries(PLANNER_KIND_ICONS)) {
        if (rawTitle.includes(icon)) {
          kind = k as PlannerTripPlace['kind'];
          rawTitle = rawTitle.replace(icon, '');
          break;
        }
      }

      const cleanTitle = rawTitle.trim();

      currentPlace = {
        title: cleanTitle,
        kind,
        priority,
        scheduled_date: explicitDate,
        sort_order: explicitDate ? currentSortOrder++ : undefined,
      };

      if (startTime && endTime) {
        const sMin = parseTimeToMinutes(startTime);
        const eMin = parseTimeToMinutes(endTime);
        if (sMin !== null && eMin !== null && eMin > sMin) {
          currentPlace.duration_minutes = eMin - sMin;
        }
      }
      continue;
    }

    // Indented metadata lines under currentPlace
    if (currentPlace && /^\s{2,}/.test(line)) {
      const trimmed = line.trim().replace(/^[-*•]\s*/, '');
      if (/📍|地址|address:/i.test(trimmed)) {
        currentPlace.address = trimmed.replace(/^.*?[:：]\s*/, '').trim();
      } else if (/💡|理由|why:/i.test(trimmed)) {
        currentPlace.why = trimmed.replace(/^.*?[:：]\s*/, '').trim();
      } else if (/📝|备注|notes:/i.test(trimmed)) {
        currentPlace.notes = trimmed.replace(/^.*?[:：]\s*/, '').trim();
      } else if (/⏰|营业时间|hours:/i.test(trimmed)) {
        currentPlace.open_hours = trimmed.replace(/^.*?[:：]\s*/, '').trim();
      } else if (/📞|电话|phone:/i.test(trimmed)) {
        currentPlace.phone = trimmed.replace(/^.*?[:：]\s*/, '').trim();
      } else if (/💰|价格|人均|price:/i.test(trimmed)) {
        currentPlace.observed_price = trimmed.replace(/^.*?[:：]\s*/, '').trim();
      } else if (/🔗|链接|link:/i.test(trimmed)) {
        currentPlace.source_url = trimmed.replace(/^.*?[:：]\s*/, '').trim();
      }
    }
  }

  commitPlace();
  return places;
}

export interface AiPlanOptions {
  startTime?: string;
  endTime?: string;
  maxPlacesPerDay?: number;
  preferCategoryBalance?: boolean;
}

export interface AiItineraryResult {
  plannedPlaces: PlannerTripPlace[];
  icalProMarkdown: string;
  scheduledCount: number;
  unscheduledCount: number;
  warnings: string[];
}

/**
 * Deterministic AI Planner engine:
 * 1. Collects candidates sorted by priority (`must` > `want` > `optional`).
 * 2. Identifies already locked/scheduled places and stay anchors to treat as hard fixtures.
 * 3. Clusters candidate stops geographically to minimize transit.
 * 4. Checks opening hours collisions for each date.
 * 5. Allocates realistic time windows (`09:00-11:30`, `12:00-13:30` lunch, `14:00-17:00`, `18:00-20:00` dinner).
 * 6. Generates full iCal Pro compatible Markdown for Google Calendar sync.
 */
export function generateAiItineraryPlan(
  places: PlannerTripPlace[],
  trip: PlannerTrip,
  options: AiPlanOptions = {},
): AiItineraryResult {
  const { maxPlacesPerDay = 4, startTime = '09:00' } = options;
  const dates = listTripDates(trip.start_date, trip.end_date);
  const warnings: string[] = [];

  if (dates.length === 0) {
    return {
      plannedPlaces: places,
      icalProMarkdown: exportTripToICalProMarkdown(trip, places),
      scheduledCount: 0,
      unscheduledCount: places.length,
      warnings: ['Trip dates are invalid or empty.'],
    };
  }

  // Separate locked/scheduled anchors vs movable candidates
  const lockedPlaces: PlannerTripPlace[] = [];
  const candidates: PlannerTripPlace[] = [];

  for (const place of places) {
    if (place.trip_id !== trip.id || place.state === 'dropped') continue;
    if (place.locked && place.scheduled_date && dates.includes(place.scheduled_date)) {
      lockedPlaces.push(place);
    } else {
      candidates.push({ ...place, state: 'candidate', scheduled_date: undefined, sort_order: undefined });
    }
  }

  // Sort candidates by Priority (must > want > optional), then by rating/presence of coordinates
  const priorityWeight: Record<PlannerPlacePriority, number> = { must: 3, want: 2, optional: 1 };
  candidates.sort((a, b) => {
    const pA = priorityWeight[a.priority || 'want'];
    const pB = priorityWeight[b.priority || 'want'];
    if (pA !== pB) return pB - pA;
    return (b.observed_rating ?? 0) - (a.observed_rating ?? 0);
  });

  const dayBuckets: Record<string, PlannerTripPlace[]> = {};
  dates.forEach((d) => {
    dayBuckets[d] = lockedPlaces.filter((p) => p.scheduled_date === d);
  });

  // Assign remaining candidates to dates
  const remainingCandidates: PlannerTripPlace[] = [];

  for (const candidate of candidates) {
    // Find best date bucket
    let bestDate: string | null = null;
    let minDistanceSum = Number.MAX_SAFE_INTEGER;

    for (const date of dates) {
      const bucket = dayBuckets[date];
      if (bucket.length >= maxPlacesPerDay) continue;

      // Check opening hours collision
      const collision = checkOpeningHoursCollision(candidate.open_hours, date, candidate.preferred_window);
      if (collision.isCollision) continue;

      // Distance score to places already in that day
      const candCoords = extractPlaceCoordinates(candidate);
      if (candCoords && bucket.length > 0) {
        let distSum = 0;
        let coordsCount = 0;
        for (const existing of bucket) {
          const eCoords = extractPlaceCoordinates(existing);
          if (eCoords) {
            distSum += haversineDistanceKm(candCoords, eCoords);
            coordsCount += 1;
          }
        }
        const avgDist = coordsCount > 0 ? distSum / coordsCount : 10;
        if (avgDist < minDistanceSum) {
          minDistanceSum = avgDist;
          bestDate = date;
        }
      } else if (!bestDate) {
        bestDate = date;
      }
    }

    if (bestDate) {
      const scheduledPlace: PlannerTripPlace = {
        ...candidate,
        state: 'scheduled',
        scheduled_date: bestDate,
        sort_order: dayBuckets[bestDate].length,
        locked: true,
      };
      dayBuckets[bestDate].push(scheduledPlace);
    } else {
      remainingCandidates.push(candidate);
    }
  }

  // Flatten and sort places
  const plannedPlaces: PlannerTripPlace[] = [];
  dates.forEach((date) => {
    const bucket = dayBuckets[date];
    bucket.forEach((p, idx) => {
      plannedPlaces.push({ ...p, sort_order: idx });
    });
  });
  plannedPlaces.push(...remainingCandidates);

  const icalProMarkdown = exportTripToICalProMarkdown(trip, plannedPlaces, {
    defaultStartTime: startTime,
    language: 'zh',
  });

  const scheduledCount = plannedPlaces.filter((p) => p.state === 'scheduled').length;

  return {
    plannedPlaces,
    icalProMarkdown,
    scheduledCount,
    unscheduledCount: remainingCandidates.length,
    warnings,
  };
}
