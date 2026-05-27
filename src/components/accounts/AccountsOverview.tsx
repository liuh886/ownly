'use client';

import { useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type {
  AccountBalance,
  AccountSnapshot,
  RecurringCostObject,
  WYQDObject,
} from '@/domain/types';
import {
  calculateNetWorth,
  calculateNextBillingDate,
  calculateRecurringMonthlyCost,
  findLatestSnapshot,
} from '@/domain/calculations';
import type { WYQDStoredEntity } from '@/core/repository';
import { formatMoney, formatCompactMoney, buildSparklinePoints, todayISO } from '@/lib/format';

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

function getPaymentAccount(object: RecurringCostObject, fallback?: string): string {
  return object.payment_account?.trim() || fallback || '未指定支付账户';
}

function groupRecurringCostsByAccount(objects: WYQDObject[], fallback?: string) {
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

    const account = getPaymentAccount(object, fallback);
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
}: {
  snapshotAt: string;
  assetBalances: AccountBalance[];
  liabilityBalances: AccountBalance[];
  isMonthEnd: boolean;
}): AccountSnapshot {
  const now = new Date().toISOString();
  const totalAssets = sumBalances(assetBalances);
  const totalLiabilities = sumBalances(liabilityBalances);

  return {
    schema_version: '0.1',
    id: `snap_${snapshotAt.replaceAll('-', '')}_${Date.now()}`,
    type: 'snapshot',
    snapshot_type: 'net_worth',
    title: `账户快照 ${snapshotAt}`,
    snapshot_at: snapshotAt,
    is_month_end: isMonthEnd,
    currency: 'CNY',
    asset_balances: assetBalances,
    liability_balances: liabilityBalances,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
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
  const calculatedSnapshots = snapshots.map((stored) => ({
    ...stored,
    entity: calculateNetWorth(stored.entity),
  }));
  const snapshotEntities = calculatedSnapshots.map((stored) => stored.entity);
  const latest = findLatestSnapshot(snapshotEntities);
  const latestAssetBalancesText = latest ? serializeBalanceLines(latest.asset_balances) : '';
  const latestLiabilityBalancesText = latest ? serializeBalanceLines(latest.liability_balances) : '';
  const recurringAccountGroups = groupRecurringCostsByAccount(objects, t('noData'));
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
  const canSubmit =
    !disabled &&
    parsedAssetBalances.length > 0 &&
    !hasInvalidAssetLines &&
    !hasInvalidLiabilityLines &&
    !isSaving;
  const fieldClass =
    'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400';

  async function handleSubmit(event: React.FormEvent) {
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
          '## 快照说明\n\n只记录金融资产与负债的阶段性估值，不记录日常流水。\n',
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
    <section className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-950">{t('accountConsole')}</h2>
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

        <div className="mt-5 border-t border-stone-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-stone-950">{t('accountList')}</h3>
            <span className="text-xs text-stone-400">
              {latest ? t('snapshotDateLabel').replace('{date}', latest.snapshot_at) : t('notRecordedYet')}
            </span>
          </div>

        {latest ? (
          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-stone-950">{t('assetAccounts')}</h2>
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
                  <h2 className="text-sm font-semibold text-stone-950">{t('liabilityAccounts')}</h2>
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

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-200/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-950">{t('netWorthHistory')}</h2>
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
            <svg viewBox="0 0 100 48" role="img" aria-label="账户净资产历史折线图" className="h-28 w-full">
              <polyline
                fill="none"
                points={trendPoints}
                stroke="rgb(28 25 23)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              {trendValues.map((value, index) => {
                const [x, y] = trendPoints.split(' ')[index].split(',').map(Number);
                return (
                  <circle
                    key={`${trendSnapshots[index].id}-${value}`}
                    cx={x}
                    cy={y}
                    fill="white"
                    r="2.8"
                    stroke="rgb(28 25 23)"
                    strokeWidth="1.6"
                  />
                );
              })}
            </svg>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-400">
              <span>{trendSnapshots[0]?.snapshot_at}</span>
              <span>{trendSnapshots[trendSnapshots.length - 1]?.snapshot_at}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-stone-200 px-3 py-4 text-sm text-stone-500">
            {t('multipleSnapshotsForTrend')}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-200/40">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-950">{t('fixedCostAccountPressure')}</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {t('fixedCostAccountPressureDesc')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-stone-950">
              {formatMoney(totalMonthlyFixedCost)}
            </div>
            <div className="text-xs text-stone-400">{t('monthlyDeduction')}</div>
          </div>
        </div>

        {recurringAccountGroups.length > 0 ? (
          <div className="mt-4 space-y-2">
            {recurringAccountGroups.map((group) => (
              <div key={group.account} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-950">
                      {group.account}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {t('countFixedCostItems').replace('{count}', String(group.count))}
                      {group.nextBillingDate ? ` · ${t('nextPayment').replace('{date}', group.nextBillingDate)}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-stone-950">
                      {formatMoney(group.monthlyCost)}
                    </div>
                    <div className="text-xs text-stone-400">/月</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.items.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full bg-white px-2 py-1 text-[11px] text-stone-500 ring-1 ring-stone-200"
                    >
                      {item.title}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-stone-200 px-3 py-4 text-sm text-stone-500">
            {t('noActiveFixedCost')}
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm shadow-stone-200/40 sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-950">
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
              placeholder={t('assetAccountsPlaceholder')}
              rows={4}
              className={`${fieldClass} resize-none`}
              disabled={disabled || isSaving}
            />
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
              placeholder={t('liabilityAccountsPlaceholder')}
              rows={3}
              className={`${fieldClass} resize-none`}
              disabled={disabled || isSaving}
            />
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-stone-950">{t('historySnapshots')}</h2>
          <span className="text-xs text-stone-400">{t('recentN').replace('{count}', String(Math.min(sorted.length, 6)))}</span>
        </div>
        <div className="mt-3 space-y-3">
          {sorted.slice(0, 6).map((stored) => (
            <div
              key={stored.entity.id}
              className="border-t border-stone-100 pt-3"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-950">
                    {stored.entity.snapshot_at}
                  </div>
                  <div className="text-xs text-stone-400">
                    {stored.entity.is_month_end ? t('monthEndSnapshot') : t('normalSnapshot')}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-stone-950">
                  {formatMoney(stored.entity.net_worth)}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => startEditingSnapshot(stored)}
                  className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
                  disabled={disabled || isSaving}
                >
                  {t('edit')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const confirmed = window.confirm(t('deleteConfirm').replace('{title}', stored.entity.snapshot_at));
                    if (!confirmed) return;
                    setDeletingFileName(stored.fileName);
                    try {
                      await onDeleteSnapshot(stored.fileName);
                      if (editingFileName === stored.fileName) cancelEditing();
                    } finally {
                      setDeletingFileName(null);
                    }
                  }}
                  className="rounded-md border border-red-100 bg-white px-2 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-600 disabled:cursor-not-allowed disabled:text-stone-300"
                  disabled={disabled || deletingFileName === stored.fileName}
                >
                  {deletingFileName === stored.fileName ? t('saving') : t('delete')}
                </button>
              </div>
            </div>
          ))}
          {snapshotEntities.length === 0 ? <p className="text-sm text-stone-500">{t('noSnapshots')}</p> : null}
        </div>
      </div>
    </section>
  );
}
