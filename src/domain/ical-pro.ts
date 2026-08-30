import {
  buildGoogleMapsRouteUrl,
  getPlannerKindLabel,
  listTripDates,
  PLANNER_KIND_ICONS,
  type PlannerPlacePriority,
  type PlannerTrip,
  type PlannerTripPlace,
} from './planner';
import {
  materializePlannerScheduledPlaces,
  sortPlannerScheduledPlaces,
  type PlannerTripVisit,
} from './planner-visits';
import { getScheduledEndTime } from './planner-schedule';

export const ICAL_PRO_PRIORITY_MAP: Record<PlannerPlacePriority, string> = {
  must: '⏫',
  want: '🔼',
  optional: '🔽',
};

export interface ICalProExportOptions {
  includeAlarm?: boolean;
  alarmMinutes?: number;
  useDayPlannerHeadings?: boolean;
  language?: 'zh' | 'en';
}

export function exportTripToICalProMarkdown(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  options: ICalProExportOptions = {},
): string {
  const {
    includeAlarm = true,
    alarmMinutes = 15,
    useDayPlannerHeadings = true,
    language = 'zh',
  } = options;
  const zh = language === 'zh';
  const tripPlaces = places.filter((place) => place.trip_id === trip.id && place.state !== 'dropped');
  const scheduled = materializePlannerScheduledPlaces(tripPlaces, visits.filter((visit) => visit.trip_id === trip.id));
  const dates = listTripDates(trip.start_date, trip.end_date);
  const lines: string[] = [
    '---',
    `title: ${JSON.stringify(trip.title)}`,
    'type: trip_itinerary',
    `trip_id: ${JSON.stringify(trip.id)}`,
    `start_date: ${JSON.stringify(trip.start_date)}`,
    `end_date: ${JSON.stringify(trip.end_date)}`,
    `destinations: ${JSON.stringify(trip.destinations || [])}`,
    `currency: ${JSON.stringify(trip.currency || 'USD')}`,
    'generator: ownly-planner-ical-pro',
    `updated_at: ${JSON.stringify(new Date().toISOString())}`,
    '---',
    '',
    `# ✈️ ${trip.title}`,
    '',
    `> 📅 **${zh ? '行程日期' : 'Dates'}:** ${trip.start_date} ~ ${trip.end_date}`,
    `> ${zh ? '此文件是 Planner/Vault 的单向日历投影；编辑此文件不会反写 Planner。' : 'This file is a one-way calendar projection of Planner/Vault; editing it does not write back to Planner.'}`,
    '',
  ];

  dates.forEach((date, dayIndex) => {
    const dayPlaces = sortPlannerScheduledPlaces(scheduled.filter((place) => place.scheduled_date === date));
    lines.push(useDayPlannerHeadings ? `## Day ${dayIndex + 1} · ${date}` : `### ${date}`);

    if (dayPlaces.length === 0) {
      lines.push(`- [ ] ${date} ${zh ? '自由活动 / 待排期' : 'Free Day / Unscheduled'}`, '');
      return;
    }

    const routeUrl = buildGoogleMapsRouteUrl(dayPlaces, trip.transport_mode);
    if (routeUrl) lines.push(`🗺️ [${zh ? '当天 Google Maps 路线导航' : 'Day Route Directions'}](${routeUrl})`, '');

    dayPlaces.forEach((place) => {
      const icon = PLANNER_KIND_ICONS[place.kind] || '📍';
      const priorityIcon = place.priority ? ICAL_PRO_PRIORITY_MAP[place.priority] : '🔼';
      const alarmTag = includeAlarm && place.priority === 'must' ? ` ⏰ ${alarmMinutes}` : '';
      const endTime = getScheduledEndTime(place.scheduled_start, place.duration_minutes);
      const timing = place.scheduled_start && endTime ? `${date} ${place.scheduled_start}-${endTime}` : date;
      lines.push(`- [ ] ${timing} ${icon} ${place.title} ${priorityIcon}${alarmTag}`);
      const kindLabel = getPlannerKindLabel(place.kind, language);
      lines.push(`    - 🏷️ ${zh ? '类别' : 'Category'}: ${kindLabel}${place.area ? ` · ${place.area}` : ''}`);
      if (place.address) lines.push(`    - 📍 ${zh ? '地址' : 'Address'}: ${place.address}`);
      if (place.open_hours) lines.push(`    - ⏰ ${zh ? '营业时间' : 'Hours'}: ${place.open_hours}`);
      if (place.observed_price) lines.push(`    - 💰 ${zh ? '参考价格' : 'Price'}: ${place.observed_price}`);
      if (place.observed_rating) lines.push(`    - ⭐ ${zh ? '评分' : 'Rating'}: ${place.observed_rating}`);
      if (place.phone) lines.push(`    - 📞 ${zh ? '电话' : 'Phone'}: ${place.phone}`);
      if (place.why) lines.push(`    - 💡 ${zh ? '理由' : 'Why'}: ${place.why}`);
      if (place.notes) lines.push(`    - 📝 ${zh ? '备注' : 'Notes'}: ${place.notes}`);
      if (place.source_url) lines.push(`    - 🔗 ${zh ? '链接' : 'Link'}: ${place.source_url}`);
    });
    lines.push('');
  });

  if (tripPlaces.length > 0) {
    lines.push('---', '', `## 💡 ${zh ? '研究地点池' : 'Research Pool'} (VTODO)`);
    tripPlaces.forEach((place) => {
      const icon = PLANNER_KIND_ICONS[place.kind] || '📍';
      const priorityIcon = place.priority ? ICAL_PRO_PRIORITY_MAP[place.priority] : '🔼';
      const occurrenceCount = visits.filter((visit) => visit.place_id === place.id && visit.trip_id === trip.id).length;
      lines.push(`- [ ] ${icon} ${place.title} ${priorityIcon}${occurrenceCount ? ` · ${zh ? `已安排 ${occurrenceCount} 次` : `${occurrenceCount} visits`}` : ''}`);
      if (place.why || place.notes) lines.push(`    - ${place.why || place.notes}`);
      if (place.address) lines.push(`    - 📍 ${place.address}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
