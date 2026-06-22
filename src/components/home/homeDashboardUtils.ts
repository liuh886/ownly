import {
  calculatePhysicalDailyCost,
  calculateRecurringMonthlyCost,
  isActiveRecurringCost,
  calculateNextBillingDate,
} from '@/domain/calculations';
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

export function getUpcomingRecurringCosts(objects: WYQDObject[]) {
  const today = new Date().toISOString().split('T')[0];
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
