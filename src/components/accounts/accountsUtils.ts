import type { WYQDTranslationKey } from '@/core/i18n';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import type {
  AccountBalance,
  AccountSnapshot,
  PhysicalObject,
  RecurringCostObject,
  WYQDObject,
} from '@/domain/types';
import {
  calculateNextBillingDate,
  calculateRecurringMonthlyCost,
  calculateResidualValue,
  calculateDesireAmount,
} from '@/domain/calculations';

export function slugifyAccountName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseBalanceLine(line: string, prefix: 'asset' | 'liability', index: number): AccountBalance | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.+?)[,，\s:：]+(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const account = match[1].trim();
  const amount = Number(match[2]);
  if (!account || !Number.isFinite(amount)) return null;

  return {
    account,
    account_id: `${prefix}_${slugifyAccountName(account) || index + 1}`,
    amount,
    currency: 'CNY',
  };
}

export function parseBalanceLines(value: string, prefix: 'asset' | 'liability'): AccountBalance[] {
  return value
    .split('\n')
    .map((line, index) => parseBalanceLine(line, prefix, index))
    .filter((balance): balance is AccountBalance => Boolean(balance));
}

export function hasInvalidBalanceLines(value: string, prefix: 'asset' | 'liability'): boolean {
  return value
    .split('\n')
    .some((line, index) => line.trim() && !parseBalanceLine(line, prefix, index));
}

export function serializeBalanceLines(balances: AccountBalance[]): string {
  return balances.map((balance) => `${balance.account} ${balance.amount}`).join('\n');
}

export function sumBalances(balances: AccountBalance[]): number {
  return balances.reduce((sum, balance) => sum + (balance.amount || 0), 0);
}

export function getPaymentAccount(object: RecurringCostObject, fallback?: string, t?: (key: WYQDTranslationKey) => string): string {
  return object.payment_account?.trim() || fallback || (t ? t('unspecifiedAccount') : 'Unspecified account');
}

export function groupRecurringCostsByAccount(objects: WYQDObject[], fallback?: string, t?: (key: WYQDTranslationKey) => string) {
  const groups = new Map<
    string,
    {
      account: string;
      monthlyCost: number;
      count: number;
      nextBillingDate: string | null;
      items: RecurringCostObject[];
    }
  >();

  for (const object of objects) {
    if (object.object_type !== 'recurring_cost' || object.status !== 'active') continue;

    const account = getPaymentAccount(object, fallback, t);
    const current = groups.get(account) || {
      account,
      monthlyCost: 0,
      count: 0,
      nextBillingDate: null,
      items: [],
    };
    const nextBillingDate = calculateNextBillingDate(object);

    current.monthlyCost += calculateRecurringMonthlyCost(object);
    current.count += 1;
    current.items.push(object);
    current.nextBillingDate =
      current.nextBillingDate && nextBillingDate
        ? current.nextBillingDate < nextBillingDate
          ? current.nextBillingDate
          : nextBillingDate
        : nextBillingDate || current.nextBillingDate;

    groups.set(account, current);
  }

  return [...groups.values()].sort((a, b) => b.monthlyCost - a.monthlyCost);
}

export function createSnapshotDraft({
  snapshotAt,
  assetBalances,
  liabilityBalances,
  isMonthEnd,
  objects,
  t,
}: {
  snapshotAt: string;
  assetBalances: AccountBalance[];
  liabilityBalances: AccountBalance[];
  isMonthEnd: boolean;
  objects: WYQDObject[];
  t?: (key: WYQDTranslationKey) => string;
}): AccountSnapshot {
  const now = new Date().toISOString();
  const totalAssets = sumBalances(assetBalances);
  const totalLiabilities = sumBalances(liabilityBalances);
  const activeRecurringCosts = objects.filter((o) => o.object_type === 'recurring_cost' && o.status === 'active');
  const monthlyFixedCost = activeRecurringCosts.reduce(
    (sum, o) => sum + calculateRecurringMonthlyCost(o as RecurringCostObject), 0,
  );
  const ownedPhysicalObjects = objects.filter((o) => o.object_type === 'physical' && (o.status === 'using' || o.status === 'purchased'));
  const physicalResidualValue = ownedPhysicalObjects.reduce(
    (sum, o) => sum + calculateResidualValue(o as PhysicalObject), 0,
  );
  const observingDesireAmount = objects
    .filter((o) => o.status === 'seeded' || o.status === 'observing' || o.status === 'planned')
    .reduce((sum, o) => sum + calculateDesireAmount(o), 0);

  return {
    schema_version: WYQD_SCHEMA_VERSION,
    id: `snap_${snapshotAt.replaceAll('-', '')}_${Date.now()}`,
    type: 'snapshot',
    snapshot_type: 'net_worth',
    title: `${t ? t('snapshotTitlePrefix') : 'Account snapshot'} ${snapshotAt}`,
    snapshot_at: snapshotAt,
    is_month_end: isMonthEnd,
    currency: 'CNY',
    asset_balances: assetBalances,
    liability_balances: liabilityBalances,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
    monthly_fixed_cost: monthlyFixedCost,
    owned_physical_count: ownedPhysicalObjects.length,
    physical_residual_value: physicalResidualValue,
    active_subscription_count: activeRecurringCosts.length,
    observing_desire_amount: observingDesireAmount,
    created_at: now,
    updated_at: now,
  };
}
