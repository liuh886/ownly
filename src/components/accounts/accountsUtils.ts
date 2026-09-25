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

interface DueDateSplit {
  body: string;
  dueDate: string | null;
  invalidDueDate: boolean;
}

export function normalizeDueDate(
  year: string | number,
  month: string | number,
  day: string | number,
): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;

  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function splitTrailingDueDate(input: string): DueDateSplit {
  const numeric = input.match(/^(.*?)[,，\s:：]+(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const localized = input.match(/^(.*?)[,，\s:：]+(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  const match = numeric ?? localized;
  if (!match) return { body: input, dueDate: null, invalidDueDate: false };

  const dueDate = normalizeDueDate(match[2], match[3], match[4]);
  return { body: match[1].trim(), dueDate, invalidDueDate: dueDate === null };
}

export function parseBalanceLine(line: string, prefix: 'asset' | 'liability', index: number): AccountBalance | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let body = trimmed;
  let dueDate: string | undefined;
  if (prefix === 'liability') {
    const split = splitTrailingDueDate(trimmed);
    if (split.invalidDueDate) return null;
    body = split.body;
    dueDate = split.dueDate ?? undefined;
  }

  const match = body.match(/^(.+?)[,，\s:：]+(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const account = match[1].trim();
  const amount = Number(match[2]);
  if (!account || !Number.isFinite(amount)) return null;

  const balance: AccountBalance = {
    account,
    account_id: `${prefix}_${slugifyAccountName(account) || index + 1}`,
    amount,
    currency: 'CNY',
  };
  if (dueDate) balance.due_date = dueDate;
  return balance;
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

export function hasInvalidDueDateLines(value: string): boolean {
  return value
    .split('\n')
    .some((line) => line.trim() && splitTrailingDueDate(line.trim()).invalidDueDate);
}

export function serializeBalanceLines(balances: AccountBalance[]): string {
  return balances
    .map((balance) => `${balance.account} ${balance.amount}${balance.due_date ? ` ${balance.due_date}` : ''}`)
    .join('\n');
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
