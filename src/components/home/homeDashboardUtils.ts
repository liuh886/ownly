import {
  calculatePhysicalAcquisitionCost,
  calculatePhysicalDailyCost,
  calculateRecurringMonthlyCost,
  isActiveRecurringCost,
  calculateNextBillingDate,
} from '@/domain/calculations';
import { calendarDaysBetween, isValidISODate, todayLocalISO } from '@/domain/date';
import type { WYQDObject } from '@/domain/types';

export function getHighestDailyCostObject(objects: WYQDObject[]) {
  return objects
    .filter((object) => object.object_type === 'physical')
    .map((object) => ({
      object,
      dailyCost: calculatePhysicalDailyCost(object),
    }))
    .filter((item): item is { object: Extract<WYQDObject, { object_type: 'physical' }>; dailyCost: number } =>
      item.dailyCost !== null,
    )
    .sort((a, b) => b.dailyCost - a.dailyCost)[0] || null;
}

export function getLargestActiveRecurringCost(objects: WYQDObject[]) {
  return objects
    .filter(isActiveRecurringCost)
    .map((object) => ({
      object,
      monthlyCost: calculateRecurringMonthlyCost(object),
    }))
    .sort((a, b) => b.monthlyCost - a.monthlyCost)[0] || null;
}

export function buildDualLinePoints(values: number[], max: number, offsetX = 0, min = 0): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `${offsetX},24 ${offsetX + 100},24`;
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = offsetX + (i / (values.length - 1)) * 100;
      const y = 44 - ((v - min) / range) * 40;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function calculateDailyCostAt(objects: WYQDObject[], date: string): number {
  if (!isValidISODate(date)) return 0;

  return objects.reduce((sum, object) => {
    if (object.object_type !== 'physical') return sum;
    if (!object.purchased_at) return sum;

    const heldDays = calendarDaysBetween(object.purchased_at, date);
    if (heldDays === null || heldDays < 0) return sum;

    if (object.ended_at) {
      const endedDays = calendarDaysBetween(object.ended_at, date);
      if (endedDays !== null && endedDays > 0) return sum;
    }

    const cost = calculatePhysicalAcquisitionCost(object) / (heldDays + 1);
    return cost > 0 ? sum + cost : sum;
  }, 0);
}

export function buildDailyCostTrend(objects: WYQDObject[], dates: string[]): number[] {
  return dates.map((date) => calculateDailyCostAt(objects, date));
}

export function getUpcomingRecurringCosts(objects: WYQDObject[]) {
  const today = todayLocalISO();
  return objects
    .filter(isActiveRecurringCost)
    .map((object) => ({
      object,
      nextDate: calculateNextBillingDate(object),
    }))
    .filter((item): item is { object: Extract<WYQDObject, { object_type: 'recurring_cost' }>; nextDate: string } =>
      item.nextDate !== null && item.nextDate >= today,
    )
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3);
}

export function getPendingExperienceReviews(objects: WYQDObject[]) {
  return objects.filter(
    (o) => o.object_type === 'one_time_experience' && o.status === 'completed',
  );
}
