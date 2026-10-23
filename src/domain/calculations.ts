import type {
  AccountSnapshot,
  HomeMetrics,
  OneTimeExperienceObject,
  PhysicalObject,
  RecurringCostObject,
  WYQDObject,
} from './types';
import { calculateInclusiveDays, parseLocalDate } from './date';
import { matchesCurrency, recordCurrency } from './currency';

export function sumAmounts(items: { amount?: number }[]): number {
  return items.reduce((total, item) => total + (item.amount || 0), 0);
}

export function calculateNetWorth(snapshot: AccountSnapshot): AccountSnapshot {
  const currency = recordCurrency(snapshot);
  const inCurrency = (balance: { currency?: string }) => (balance.currency || currency).toUpperCase() === currency;
  const total_assets = sumAmounts(snapshot.asset_balances.filter(inCurrency));
  const total_liabilities = sumAmounts(snapshot.liability_balances.filter(inCurrency));

  return {
    ...snapshot,
    total_assets,
    total_liabilities,
    net_worth: total_assets - total_liabilities,
  };
}

/** Oldest first: snapshot date, then original creation time, then stable ID.
 * Editing a historical record must not reorder same-day observations.
 */
export function compareSnapshots(a: AccountSnapshot, b: AccountSnapshot): number {
  const day = a.snapshot_at.localeCompare(b.snapshot_at);
  if (day) return day;
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export function findLatestSnapshot(snapshots: AccountSnapshot[]): AccountSnapshot | null {
  return [...snapshots].sort((a, b) => compareSnapshots(b, a))[0] || null;
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
      .sort((a, b) => compareSnapshots(b, a))[0] || null
  );
}

export function calculateHoldingDays(object: PhysicalObject, today = new Date()): number | null {
  return calculateInclusiveDays(object.purchased_at, object.ended_at, today);
}

export function calculatePhysicalExperienceCost(object: PhysicalObject): number {
  const total = calculatePhysicalAcquisitionCost(object);

  if (object.status === 'transferred') {
    const saleProceeds = object.sale_price ?? 0;
    return total - saleProceeds + (object.transfer_fee || 0);
  }

  return object.realized_experience_cost ?? total;
}

export function calculatePhysicalAcquisitionCost(object: PhysicalObject): number {
  return object.total_acquisition_cost ?? object.purchase_price ?? 0;
}

export function calculateExperienceCost(object: OneTimeExperienceObject): number {
  return object.actual_total ?? object.budget_total ?? 0;
}

export function calculatePhysicalDailyCost(object: PhysicalObject, today = new Date()): number | null {
  const holdingDays = calculateHoldingDays(object, today);
  if (!holdingDays) return null;

  return calculatePhysicalExperienceCost(object) / holdingDays;
}

// Residual value is intentionally 0 for active items (no ended_at).
// This models default depreciation to zero — only items with an explicit
// end/disposal date have a non-zero residual value.
export function calculateResidualValue(object: PhysicalObject, today = new Date()): number {
  const price = calculatePhysicalAcquisitionCost(object);
  if (!object.ended_at || !object.purchased_at) return 0;

  const totalDays = calculateInclusiveDays(object.purchased_at, object.ended_at, today);
  const elapsedDays = calculateInclusiveDays(object.purchased_at, undefined, today);
  if (!totalDays || !elapsedDays || totalDays <= 0) return 0;

  const remainingDays = Math.max(0, totalDays - elapsedDays);
  return price * remainingDays / totalDays;
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

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function billingDateForMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay));
}

export function calculateNextBillingDate(
  object: RecurringCostObject,
  today = new Date(),
): string | null {
  if (object.status !== 'active') return null;
  if (object.billing_cycle === 'custom') return null;

  const start = parseLocalDate(object.started_at || object.created_at) || today;
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const billingDay =
    object.billing_day && object.billing_day >= 1 && object.billing_day <= 31
      ? object.billing_day
      : start.getDate();

  if (object.billing_cycle === 'weekly') {
    const next = new Date(start);
    while (next < normalizedToday) {
      next.setDate(next.getDate() + 7);
    }
    return formatDate(next);
  }

  if (object.billing_cycle === 'annual') {
    const monthIndex = start.getMonth();
    let next = billingDateForMonth(normalizedToday.getFullYear(), monthIndex, billingDay);
    if (next < normalizedToday) {
      next = billingDateForMonth(normalizedToday.getFullYear() + 1, monthIndex, billingDay);
    }
    return formatDate(next);
  }

  const interval = object.billing_cycle === 'quarterly' ? 3 : 1;
  let year = start.getFullYear();
  let monthIndex = start.getMonth();
  let next = billingDateForMonth(year, monthIndex, billingDay);
  while (next < normalizedToday) {
    monthIndex += interval;
    year += Math.floor(monthIndex / 12);
    monthIndex %= 12;
    next = billingDateForMonth(year, monthIndex, billingDay);
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
  const isObserving =
    object.status === 'seeded' ||
    object.status === 'observing' ||
    object.status === 'planned';
  if (!isObserving) return 0;

  if (object.object_type === 'physical') {
    return calculatePhysicalAcquisitionCost(object);
  }
  if (object.object_type === 'recurring_cost') {
    return calculateRecurringMonthlyCost(object);
  }
  if (object.object_type === 'one_time_experience') {
    return object.budget_total || 0;
  }
  return 0;
}

export function calculateHomeMetrics(
  objects: WYQDObject[],
  snapshots: AccountSnapshot[],
  currency?: string,
): HomeMetrics {
  const moneyCurrency = currency ?? recordCurrency(findLatestSnapshot(snapshots) ?? objects[0] ?? {});
  const moneyObjects = objects.filter((object) => matchesCurrency(object, moneyCurrency));
  const calculatedSnapshots = snapshots.filter((snapshot) => matchesCurrency(snapshot, moneyCurrency)).map(calculateNetWorth);
  const latestSnapshot = findLatestSnapshot(calculatedSnapshots);
  const previousMonthEnd = findPreviousMonthEndSnapshot(calculatedSnapshots, latestSnapshot);

  const activeRecurringCosts = moneyObjects.filter(isActiveRecurringCost);

  const monthlyFixedCost = activeRecurringCosts.reduce(
    (total, object) => total + calculateRecurringMonthlyCost(object),
    0,
  );

  const ownedPhysicalObjects = moneyObjects.filter(isOwnedPhysicalObject);
  const ownedPhysicalCount = ownedPhysicalObjects.length;
  const physicalResidualValue = ownedPhysicalObjects.reduce(
    (total, object) => total + calculateResidualValue(object),
    0,
  );

  const observingDesireAmount = moneyObjects
    .filter((object) => object.status === 'seeded' || object.status === 'observing' || object.status === 'planned')
    .reduce((total, object) => total + calculateDesireAmount(object), 0);

  return {
    netWorth: latestSnapshot?.net_worth ?? null,
    netWorthDeltaFromPreviousMonth:
      latestSnapshot && previousMonthEnd
        ? (latestSnapshot.net_worth || 0) - (previousMonthEnd.net_worth || 0)
        : null,
    monthlyFixedCost,
    ownedPhysicalCount,
    physicalResidualValue,
    activeSubscriptionCount: activeRecurringCosts.length,
    observingDesireAmount,
  };
}
