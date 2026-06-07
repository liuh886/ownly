'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import type {
  AccountBalance,
  AccountSnapshot,
  PhysicalObject,
  RecurringCostObject,
  WYQDObject,
} from '@/domain/types';
import {
  calculateNetWorth,
  calculateNextBillingDate,
  calculateRecurringMonthlyCost,
  calculateResidualValue,
  calculateDesireAmount,
  findLatestSnapshot,
} from '@/domain/calculations';
import type { WYQDStoredEntity } from '@/core/repository';
import { buildSparklinePoints, todayISO } from '@/lib/format';
import { useFormatMoney } from '@/lib/use-format';
import { FIELD_CLASS } from '@/lib/ui-constants';

function slugifyAccountName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseBalanceLine(line: string, prefix: 'asset' | 'liability', index: number): AccountBalance | null {
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

function parseBalanceLines(value: string, prefix: 'asset' | 'liability'): AccountBalance[] {
  return value
    .split('\n')
    .map((line, index) => parseBalanceLine(line, prefix, index))
    .filter((balance): balance is AccountBalance => Boolean(balance));
}

function hasInvalidBalanceLines(value: string, prefix: 'asset' | 'liability'): boolean {
  return value
    .split('\n')
    .some((line, index) => line.trim() && !parseBalanceLine(line, prefix, index));
}

function serializeBalanceLines(balances: AccountBalance[]): string {
  return balances.map((balance) => `${balance.account} ${balance.amount}`).join('\n');
}

function sumBalances(balances: AccountBalance[]): number {
  return balances.reduce((sum, balance) => sum + (balance.amount || 0), 0);
}

function getPaymentAccount(object: RecurringCostObject, fallback?: string, t?: (key: WYQDTranslationKey) => string): string {
  return object.payment_account?.trim() || fallback || (t ? t('unspecifiedAccount') : 'Unspecified account');
}

function groupRecurringCostsByAccount(objects: WYQDObject[], fallback?: string, t?: (key: WYQDTranslationKey) => string) {
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

function createSnapshotDraft({
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

export function AccountsOverview({
  disabled,
  snapshots,
  objects,
  onCreateSnapshot,
  onUpdateSnapshot,
  onDeleteSnapshot,
}: {
  disabled?: boolean;
  snapshots: WYQDStoredEntity<AccountSnapshot>[];
  objects: WYQDObject[];
  onCreateSnapshot: (snapshot: AccountSnapshot, body: string) => Promise<void>;
  onUpdateSnapshot: (fileName: string, snapshot: AccountSnapshot, body: string) => Promise<void>;
  onDeleteSnapshot: (fileName: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { formatMoney, formatCompactMoney } = useFormatMoney();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const calculatedSnapshots = snapshots.map((stored) => ({
    ...stored,
    entity: calculateNetWorth(stored.entity),
  }));
  const snapshotEntities = calculatedSnapshots.map((stored) => stored.entity);
  const latest = findLatestSnapshot(snapshotEntities);
  const latestAssetBalancesText = latest ? serializeBalanceLines(latest.asset_balances) : '';
  const latestLiabilityBalancesText = latest ? serializeBalanceLines(latest.liability_balances) : '';
  const recurringAccountGroups = groupRecurringCostsByAccount(objects, t('noData'), t);
  const totalMonthlyFixedCost = recurringAccountGroups.reduce(
    (sum, group) => sum + group.monthlyCost,
    0,
  );
  const accountCount = latest
    ? latest.asset_balances.length + latest.liability_balances.length
    : 0;
  const annualFixedCost = totalMonthlyFixedCost * 12;
  const sorted = [...calculatedSnapshots].sort((a, b) =>
    b.entity.snapshot_at.localeCompare(a.entity.snapshot_at),
  );
  const [snapshotAt, setSnapshotAt] = useState(todayISO());
  const [assetBalancesText, setAssetBalancesText] = useState('');
  const [liabilityBalancesText, setLiabilityBalancesText] = useState('');
  const [hasTouchedSnapshotForm, setHasTouchedSnapshotForm] = useState(false);
  const [isMonthEnd, setIsMonthEnd] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const isUsingLatestSnapshotPrefill =
    Boolean(latest) && !editingFileName && !hasTouchedSnapshotForm;
  const displayedAssetBalancesText = isUsingLatestSnapshotPrefill
    ? latestAssetBalancesText
    : assetBalancesText;
  const displayedLiabilityBalancesText = isUsingLatestSnapshotPrefill
    ? latestLiabilityBalancesText
    : liabilityBalancesText;
  const parsedAssetBalances = parseBalanceLines(displayedAssetBalancesText, 'asset');
  const parsedLiabilityBalances = parseBalanceLines(displayedLiabilityBalancesText, 'liability');
  const hasInvalidAssetLines = hasInvalidBalanceLines(displayedAssetBalancesText, 'asset');
  const hasInvalidLiabilityLines = hasInvalidBalanceLines(displayedLiabilityBalancesText, 'liability');
  const trendSnapshots = [...calculatedSnapshots]
    .sort((a, b) => a.entity.snapshot_at.localeCompare(b.entity.snapshot_at))
    .slice(-12)
    .map((stored) => stored.entity);
  const trendValues = trendSnapshots.map((snapshot) => snapshot.net_worth || 0);
  const trendPoints = buildSparklinePoints(trendValues);

  const fixedCostTrendValues = trendSnapshots.map(
    (snapshot) => snapshot.monthly_fixed_cost ?? totalMonthlyFixedCost,
  );
  const fixedCostTrendPoints = buildSparklinePoints(fixedCostTrendValues);
  const latestFixedCost = fixedCostTrendValues[fixedCostTrendValues.length - 1] ?? totalMonthlyFixedCost;
  const canSubmit =
    !disabled &&
    parsedAssetBalances.length > 0 &&
    !hasInvalidAssetLines &&
    !hasInvalidLiabilityLines &&
    !isSaving;
  const fieldClass = FIELD_CLASS;

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    try {
      const editing = editingFileName
        ? snapshots.find((stored) => stored.fileName === editingFileName)
        : null;
      const draft = createSnapshotDraft({
        snapshotAt,
        assetBalances: parsedAssetBalances,
        liabilityBalances: parsedLiabilityBalances,
        isMonthEnd,
        objects,
        t,
      });
      const snapshot = editing
        ? {
            ...editing.entity,
            ...draft,
            id: editing.entity.id,
            title: editing.entity.title || draft.title,
            created_at: editing.entity.created_at,
            updated_at: new Date().toISOString(),
          }
        : draft;

      if (editing) {
        await onUpdateSnapshot(editing.fileName, snapshot, editing.body);
      } else {
        await onCreateSnapshot(
          snapshot,
          `## ${t('snapshotNoteSection')}\n\n${t('snapshotNoteBody')}\n`,
        );
      }
      setAssetBalancesText('');
      setLiabilityBalancesText('');
      setHasTouchedSnapshotForm(false);
      setIsMonthEnd(false);
      setSnapshotAt(todayISO());
      setEditingFileName(null);
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingSnapshot(stored: WYQDStoredEntity<AccountSnapshot>) {
    const calculated = calculateNetWorth(stored.entity);
    setEditingFileName(stored.fileName);
    setSnapshotAt(calculated.snapshot_at);
    setAssetBalancesText(serializeBalanceLines(calculated.asset_balances));
    setLiabilityBalancesText(serializeBalanceLines(calculated.liability_balances));
    setHasTouchedSnapshotForm(true);
    setIsMonthEnd(Boolean(calculated.is_month_end));
  }

  function cancelEditing() {
    setEditingFileName(null);
    setSnapshotAt(todayISO());
    setAssetBalancesText('');
    setLiabilityBalancesText('');
    setHasTouchedSnapshotForm(false);
    setIsMonthEnd(false);
  }

  function refillFromLatestSnapshot() {
    if (!latest) return;
    setAssetBalancesText(latestAssetBalancesText);
    setLiabilityBalancesText(latestLiabilityBalancesText);
    setHasTouchedSnapshotForm(true);
  }

  return (
    <>
    <section className="space-y-5">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('accountConsole')}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {t('accountConsoleDesc')}
            </p>
          </div>
          <span className="w-fit rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {latest ? t('latestSnapshot').replace('{date}', latest.snapshot_at) : t('waitingFirstSnapshot')}
          </span>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-stone-200 bg-stone-950 px-3 py-3 text-white">
            <div className="text-xs font-medium text-stone-300">{t('netWorth')}</div>
            <div className="mt-2 font-mono text-xl font-semibold tracking-tight">
              {formatMoney(latest?.net_worth, t('noData'))}
            </div>
            <div className="mt-1 text-xs text-stone-400">{t('latestAccountFact')}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-xs font-medium text-stone-500">{t('accountCount')}</div>
            <div className="mt-2 font-mono text-xl font-semibold text-stone-950">
              {accountCount}
            </div>
            <div className="mt-1 text-xs text-stone-500">{t('assetAndLiabilityAccounts')}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-xs font-medium text-stone-500">{t('fixedCostPressure')}</div>
            <div className="mt-2 font-mono text-xl font-semibold text-stone-950">
              {formatMoney(totalMonthlyFixedCost)}
            </div>
            <div className="mt-1 text-xs text-stone-500">{t('monthlyDeductionPressure')}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-xs font-medium text-stone-500">{t('annualCommitment')}</div>
            <div className="mt-2 font-mono text-xl font-semibold text-stone-950">
              {formatMoney(annualFixedCost)}
            </div>
            <div className="mt-1 text-xs text-stone-500">{t('subscriptionAndFixedInertia')}</div>
          </div>
        </div>

        <div className="mt-5 border-t border-stone-100 pt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold tracking-tight text-stone-950">{t('accountList')}</h3>
            <span className="text-xs text-stone-400">
              {latest ? t('snapshotDateLabel').replace('{date}', latest.snapshot_at) : t('notRecordedYet')}
            </span>
          </div>

        {latest ? (
          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight text-stone-950">{t('assetAccounts')}</h2>
                <span className="text-xs text-stone-400">{formatMoney(latest.total_assets)}</span>
              </div>
              <div className="space-y-2">
                {latest.asset_balances.map((balance) => (
                  <div
                    key={balance.account_id || balance.account}
                    className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2"
                  >
                    <div className="min-w-0 truncate text-sm font-medium text-stone-800">
                      {balance.account}
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-stone-950">
                      {formatMoney(balance.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {latest.liability_balances.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-stone-950">{t('liabilityAccounts')}</h2>
                  <span className="text-xs text-stone-400">
                    {formatMoney(latest.total_liabilities)}
                  </span>
                </div>
                <div className="space-y-2">
                  {latest.liability_balances.map((balance) => (
                    <div
                      key={balance.account_id || balance.account}
                      className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2"
                    >
                      <div className="min-w-0 truncate text-sm font-medium text-red-900">
                        {balance.account}
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-red-900">
                        {formatMoney(balance.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
            {t('recordFirstSnapshot')}
          </p>
        )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('netWorthHistory')}</h2>
            <p className="mt-1 text-xs text-stone-400">
              {t('recentSnapshotsN').replace('{count}', String(trendSnapshots.length))}
            </p>
          </div>
          {trendValues.length > 0 ? (
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-stone-950">
                {formatCompactMoney(trendValues[trendValues.length - 1] || 0)}
              </div>
              <div className="text-xs text-stone-400">{t('latestNetWorth')}</div>
            </div>
          ) : null}
        </div>
        {trendSnapshots.length > 0 ? (
          <div className="mt-4">
            <svg viewBox="0 0 100 48" role="img" aria-label={t('netWorthChartAriaLabel')} className="h-28 w-full">
              <motion.polyline
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
                fill="none"
                points={trendPoints}
                stroke="rgb(28 25 23)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              {trendValues.map((value, index) => {
                const [x, y] = trendPoints.split(' ')[index].split(',').map(Number);
                const date = trendSnapshots[index]?.snapshot_at || '';
                const formattedValue = formatCompactMoney(value);
                return (
                  <motion.circle
                    key={`${trendSnapshots[index].id}-${value}`}
                    cx={x}
                    cy={y}
                    fill="white"
                    r="2.5"
                    stroke="rgb(28 25 23)"
                    strokeWidth="1.5"
                    className="cursor-pointer"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.06 }}
                  >
                    <title>{`${date} · ${formattedValue}`}</title>
                  </motion.circle>
                );
              })}
            </svg>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-400">
              <span>{trendSnapshots[0]?.snapshot_at}</span>
              <span>{trendSnapshots[trendSnapshots.length - 1]?.snapshot_at}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
            {t('multipleSnapshotsForTrend')}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('fixedCostHistory')}</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {t('fixedCostAccountPressureDesc')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-stone-950">
              {formatMoney(latestFixedCost)}
            </div>
            <div className="text-xs text-stone-400">{t('monthlyDeduction')}</div>
          </div>
        </div>

        {trendSnapshots.length > 1 ? (
          <div className="mt-4">
            <svg
              viewBox="0 0 100 48"
              role="img"
              aria-label={t('fixedCostHistory')}
              className="h-28 w-full"
            >
              <motion.polyline
                points={fixedCostTrendPoints}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              />
              {fixedCostTrendPoints.split(' ').map((point, index) => {
                const [cx, cy] = point.split(',').map(Number);
                const date = trendSnapshots[index]?.snapshot_at || '';
                const value = formatMoney(fixedCostTrendValues[index] || 0);
                return (
                  <motion.circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r="2.5"
                    fill="white"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    className="cursor-pointer"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.08 }}
                  >
                    <title>{`${date} · ${value}`}</title>
                  </motion.circle>
                );
              })}
            </svg>
            <div className="mt-2 flex justify-between text-[11px] text-stone-400">
              <span>{trendSnapshots[0]?.snapshot_at}</span>
              <span>{trendSnapshots[trendSnapshots.length - 1]?.snapshot_at}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
            {t('multipleSnapshotsForTrend')}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">
              {editingFileName ? t('editSnapshot') : t('recordSnapshot')}
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {t('snapshotFormatHint')}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {t('currency')}
          </span>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('date')}</span>
            <input
              type="date"
              value={snapshotAt}
              onChange={(event) => setSnapshotAt(event.target.value)}
              className={fieldClass}
              disabled={disabled || isSaving}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('assetAccountsLabel')}</span>
            <textarea
              value={displayedAssetBalancesText}
              onChange={(event) => {
                setHasTouchedSnapshotForm(true);
                setAssetBalancesText(event.target.value);
              }}
              placeholder={t('snapshotAssetPlaceholder')}
              rows={4}
              className={`${fieldClass} resize-none`}
              disabled={disabled || isSaving}
            />
            {parsedAssetBalances.length > 0 && !hasInvalidAssetLines ? (
              <p className="mt-1 text-xs text-stone-400">
                {t('snapshotParsedPreview').replace('{count}', String(parsedAssetBalances.length)).replace('{total}', formatMoney(sumBalances(parsedAssetBalances)) ?? '')}
              </p>
            ) : null}
            {hasInvalidAssetLines ? (
              <span className="mt-1 block text-xs text-red-600">
                {t('invalidAssetLine')}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('liabilityAccountsLabel')}</span>
            <textarea
              value={displayedLiabilityBalancesText}
              onChange={(event) => {
                setHasTouchedSnapshotForm(true);
                setLiabilityBalancesText(event.target.value);
              }}
              placeholder={t('snapshotLiabilityPlaceholder')}
              rows={3}
              className={`${fieldClass} resize-none`}
              disabled={disabled || isSaving}
            />
            {parsedLiabilityBalances.length > 0 && !hasInvalidLiabilityLines ? (
              <p className="mt-1 text-xs text-stone-400">
                {t('snapshotParsedPreview').replace('{count}', String(parsedLiabilityBalances.length)).replace('{total}', formatMoney(sumBalances(parsedLiabilityBalances)) ?? '')}
              </p>
            ) : null}
            {hasInvalidLiabilityLines ? (
              <span className="mt-1 block text-xs text-red-600">
                {t('invalidLiabilityLine')}
              </span>
            ) : null}
          </label>

          {!editingFileName && latest ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
              <span>
                {isUsingLatestSnapshotPrefill
                  ? t('prefilledFromSnapshot').replace('{date}', latest.snapshot_at)
                  : t('canReuseSnapshot').replace('{date}', latest.snapshot_at)}
              </span>
              <button
                type="button"
                onClick={refillFromLatestSnapshot}
                className="rounded-md border border-stone-200 bg-white px-2 py-1 font-medium text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
                disabled={disabled || isSaving}
              >
                {t('reuseLastSnapshot')}
              </button>
            </div>
          ) : null}

          <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={isMonthEnd}
              onChange={(event) => setIsMonthEnd(event.target.checked)}
              className="h-4 w-4 rounded border-stone-300 accent-stone-950"
              disabled={disabled || isSaving}
            />
            {t('monthEndSnapshot')}
          </label>

          <div className="flex gap-2">
            {editingFileName ? (
              <button
                type="button"
                onClick={cancelEditing}
                className="w-24 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
                disabled={isSaving}
              >
                {t('cancel')}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-w-0 flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {disabled
                ? t('connectVaultToWrite')
                : isSaving
                  ? t('saving')
                  : editingFileName
                    ? t('saveChanges')
                    : t('saveSnapshot')}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('historySnapshots')}</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {t('recentN').replace('{count}', String(Math.min(sorted.length, 6)))}
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {sorted.length}
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
            {t('noSnapshots')}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {sorted.slice(0, 6).map((stored) => (
              <article
                key={stored.entity.id}
                className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600">
                        {stored.entity.is_month_end ? t('monthEndSnapshot') : t('normalSnapshot')}
                      </span>
                      <p className="truncate text-sm font-semibold text-stone-950">
                        {stored.entity.snapshot_at}
                      </p>
                    </div>
                    <p className="mt-1 font-mono text-xs font-medium text-stone-500">
                      {formatMoney(stored.entity.net_worth)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={disabled || isSaving}
                      onClick={() => startEditingSnapshot(stored)}
                      className="min-h-10 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                    >
                      {t('edit')}
                    </button>
                    <button
                      type="button"
                      disabled={disabled || deletingFileName === stored.fileName}
                      onClick={() => void (async () => {
                        const confirmed = await confirm({
                          title: t('delete'),
                          message: t('deleteConfirm').replace('{title}', stored.entity.snapshot_at),
                          destructive: true,
                        });
                        if (!confirmed) return;
                        setDeletingFileName(stored.fileName);
                        try {
                          await onDeleteSnapshot(stored.fileName);
                          if (editingFileName === stored.fileName) cancelEditing();
                        } finally {
                          setDeletingFileName(null);
                        }
                      })()}
                      className="min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deletingFileName === stored.fileName ? '…' : t('delete')}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
    {confirmDialog}
    </>
  );
}
