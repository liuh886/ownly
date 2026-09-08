import type { PlannerTripPlace } from '@/domain/planner';
import { PLANNER_KIND_LABELS } from '@/domain/planner';
import { type PlannerScheduledPlace } from '@/domain/planner-visits';

export function formatDay(date: string, language: 'en' | 'zh'): string {
  const [, month, day] = date.split('-');
  return language === 'zh' ? `${Number(month)}月${Number(day)}日` : `${month}/${day}`;
}

export function placeMeta(place: PlannerTripPlace | PlannerScheduledPlace, language: 'en' | 'zh' = 'zh'): string {
  const durationLabel = place.duration_minutes
    ? (language === 'zh' ? `${place.duration_minutes} 分钟` : `${place.duration_minutes} min`)
    : null;
  const windowMap: Record<string, { zh: string; en: string }> = {
    morning: { zh: '上午', en: 'Morning' },
    afternoon: { zh: '下午', en: 'Afternoon' },
    evening: { zh: '傍晚', en: 'Evening' },
    night: { zh: '夜间', en: 'Night' },
  };
  const windowLabel = place.preferred_window
    ? (windowMap[place.preferred_window.toLowerCase()]?.[language] || place.preferred_window)
    : null;

  return [
    place.area,
    durationLabel,
    windowLabel,
  ].filter(Boolean).join(' · ');
}

export function formatDistanceBadge(distKm: number, zh: boolean): string {
  if (!Number.isFinite(distKm)) return '';
  if (distKm < 1) {
    return zh ? `距上一站 ${Math.round(distKm * 1000)} m` : `${Math.round(distKm * 1000)}m from last stop`;
  }
  return zh ? `距上一站 ${distKm.toFixed(1)} km` : `${distKm.toFixed(1)}km from last stop`;
}

/** Kind classification tags injected by ensurePlaceKindTag — used for filtering, not shown on cards. */
const KNOWN_KIND_TAGS = new Set([
  ...Object.values(PLANNER_KIND_LABELS).flatMap((l) => [l.zh.toLowerCase(), l.en.toLowerCase()]),
  '观光景点', '餐厅美食', '咖啡甜品', '酒店住宿', '购物商场', '交通中转', '体验活动',
  '景点', '美食', '咖啡', '住宿', '购物', '交通', '体验', '其它', '其他',
  'stay', 'food', 'cafe', 'attraction', 'experience', 'shopping', 'transit', 'other',
  'hotel', 'dining', 'coffee', 'sightseeing', 'mall', 'station', 'activity',
].map((s) => s.toLowerCase()));

/** Returns tags suitable for card display — excludes kind classification tags. */
export function getDisplayTags(tags: string[]): string[] {
  return tags.filter((t) => !KNOWN_KIND_TAGS.has(t.trim().toLowerCase()));
}
