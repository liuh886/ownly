import type {
  AccountSnapshot,
  HomeMetrics,
  PhysicalObject,
  RecurringCostObject,
  WYQDObject,
} from './types';
import { calculateInclusiveDays } from './date';

export function sumAmounts(items: { amount?: number }[]): number {
  return items.reduce((total, item) => total + (item.amount || 0), 0);
}

export function calculateNetWorth(snapshot: AccountSnapshot): AccountSnapshot {
  const total_assets = sumAmounts(snapshot.asset_balances);
  const total_liabilities = sumAmounts(snapshot.liability_balances);

  return {
    ...snapshot,
    total_assets,
    total_liabilities,
    net_worth: total_assets - total_liabilities,
  };
}

export function findLatestSnapshot(snapshots: AccountSnapshot[]): AccountSnapshot | null {
  return [...snapshots].sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))[0] || null;
}

export function findPreviousMonthEndSnapshot(
  snapshots: AccountSnapshot[],
  latest: AccountSnapshot | null,
): AccountSnapshot | null {
  if (!latest) return null;

  const latestMonth = latest.snapshot_at.slice(0, 7);
  return (
    [...snapshots]
      .filter((snapshot) => snapshot.is_month_end && snapshot.snapshot_at.slice(0, 7) < latestMonth)
      .sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))[0] || null
  );
}

export function calculateHoldingDays(object: PhysicalObject, today = new Date()): number | null {
  return calculateInclusiveDays(object.purchased_at, object.ended_at, today);
}

export function calculatePhysicalExperienceCost(object: PhysicalObject): number {
  const total = object.total_acquisition_cost || object.purchase_price || 0;

  if (object.status === 'transferred') {
    return total - (object.recovered_amount || 0) + (object.transfer_fee || 0);
  }

  return object.realized_experience_cost ?? total;
}

export function calculatePhysicalAcquisitionCost(object: PhysicalObject): number {
  return object.total_acquisition_cost || object.purchase_price || 0;
}

export function calculatePhysicalDailyCost(object: PhysicalObject, today = new Date()): number | null {
  const holdingDays = calculateHoldingDays(object, today);
  if (!holdingDays) return null;

  return calculatePhysicalExperienceCost(object) / holdingDays;
}

export function calculateRecurringMonthlyCost(object: RecurringCostObject): number {
  const amount = object.billing_amount || 0;

  switch (object.billing_cycle) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'quarterly':
      return amount / 3;
    case 'annual':
      return amount / 12;
    case 'custom':
      return (object.annualized_cost || 0) / 12;
    case 'monthly':
    default:
      return amount;
  }
}

function clampDay(year: number, monthIndex: number, day: number): number {
  return Math.min(day, new Date(year, monthIndex + 1, 0).getDate());
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseLocalDate(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function calculateNextBillingDate(
  object: RecurringCostObject,
  today = new Date(),
): string | null {
  if (object.status !== 'active') return null;
  if (object.billing_cycle === 'custom') return null;

  const start = parseLocalDate(object.started_at || object.created_at) || today;
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (object.billing_cycle === 'weekly') {
    const next = new Date(start);
    while (next < normalizedToday) {
      next.setDate(next.getDate() + 7);
    }
    return formatDate(next);
  }

  const day = object.billing_day || start.getDate();

  if (object.billing_cycle === 'annual') {
    const monthIndex = start.getMonth();
    let next = new Date(
      normalizedToday.getFullYear(),
      monthIndex,
      clampDay(normalizedToday.getFullYear(), monthIndex, day),
    );
    if (next < normalizedToday) {
      next = new Date(
        normalizedToday.getFullYear() + 1,
        monthIndex,
        clampDay(normalizedToday.getFullYear() + 1, monthIndex, day),
      );
    }
    return formatDate(next);
  }

  const interval = object.billing_cycle === 'quarterly' ? 3 : 1;
  let next = new Date(start.getFullYear(), start.getMonth(), clampDay(start.getFullYear(), start.getMonth(), day));
  while (next < normalizedToday) {
    const advanced = addMonths(next, interval);
    next = new Date(
      advanced.getFullYear(),
      advanced.getMonth(),
      clampDay(advanced.getFullYear(), advanced.getMonth(), day),
    );
  }

  return formatDate(next);
}

export function isOwnedPhysicalObject(object: WYQDObject): object is PhysicalObject {
  return (
    object.object_type === 'physical' &&
    (object.status === 'purchased' || object.status === 'using')
  );
}

export function isActiveRecurringCost(object: WYQDObject): object is RecurringCostObject {
  return object.object_type === 'recurring_cost' && object.status === 'active';
}

export function calculateDesireAmount(object: WYQDObject): number {
  if (object.status !== 'seeded' && object.status !== 'observing') return 0;

  if (object.object_type === 'physical') {
    return calculatePhysicalAcquisitionCost(object);
  }
  if (object.object_type === 'recurring_cost') {
    return calculateRecurringMonthlyCost(object);
  }
  return 0;
}

export function calculateHomeMetrics(
  objects: WYQDObject[],
  snapshots: AccountSnapshot[],
): HomeMetrics {
  const calculatedSnapshots = snapshots.map(calculateNetWorth);
  const latestSnapshot = findLatestSnapshot(calculatedSnapshots);
  const previousMonthEnd = findPreviousMonthEndSnapshot(calculatedSnapshots, latestSnapshot);

  const activeRecurringCosts = objects.filter(isActiveRecurringCost);

  const monthlyFixedCost = activeRecurringCosts.reduce(
    (total, object) => total + calculateRecurringMonthlyCost(object),
    0,
  );

  const ownedPhysicalCount = objects.filter(isOwnedPhysicalObject).length;

  const observingDesireAmount = objects
    .filter((object) => object.status === 'seeded' || object.status === 'observing')
    .reduce((total, object) => total + calculateDesireAmount(object), 0);

  return {
    netWorth: latestSnapshot?.net_worth ?? null,
    netWorthDeltaFromPreviousMonth:
      latestSnapshot && previousMonthEnd
        ? (latestSnapshot.net_worth || 0) - (previousMonthEnd.net_worth || 0)
        : null,
    monthlyFixedCost,
    ownedPhysicalCount,
    activeSubscriptionCount: activeRecurringCosts.length,
    observingDesireAmount,
  };
}
