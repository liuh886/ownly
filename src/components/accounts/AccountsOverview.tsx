'use client';

import { matchesCurrency, recordCurrency } from '@/domain/currency';

import { useMemo, useRef, useState } from 'react';
import { isValidISODate } from '@/domain/date';
import { useI18n } from '@/core/i18n-context';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import type {
  AccountSnapshot,
  WYQDObject,
} from '@/domain/types';
import {
  calculateNetWorth,
  findLatestSnapshot,
  compareSnapshots,
} from '@/domain/calculations';
import type { WYQDStoredEntity } from '@/core/repository';
import { buildSparklinePoints, todayISO } from '@/lib/format';
import { useFormatMoney } from '@/lib/use-format';
import {
  parseBalanceLinesWithIssues,
  serializeBalanceLines,
  groupRecurringCostsByAccount,
  createSnapshotDraft,
  preserveBalanceMetadata,
} from './accountsUtils';
import { AccountsConsole } from './AccountsConsole';
import { AccountsTrend } from './AccountsTrend';
import { AccountsForm } from './AccountsForm';
import { AccountsHistory } from './AccountsHistory';
import { LiabilityDuePanel } from './LiabilityDuePanel';

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
  const { t, language, currency } = useI18n();
  const { formatMoney, formatCompactMoney } = useFormatMoney();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const calculatedSnapshots = useMemo(
    () => snapshots.map((stored) => ({
      ...stored,
      entity: calculateNetWorth(stored.entity),
    })),
    [snapshots],
  );
  const latest = useMemo(
    () => findLatestSnapshot(calculatedSnapshots.filter((stored) => matchesCurrency(stored.entity, currency)).map((stored) => stored.entity)),
    [calculatedSnapshots, currency],
  );
  const latestAssetBalancesText = latest ? serializeBalanceLines(latest.asset_balances.filter((balance) => !balance.currency || matchesCurrency(balance, currency))) : '';
  const latestLiabilityBalancesText = latest ? serializeBalanceLines(latest.liability_balances.filter((balance) => !balance.currency || matchesCurrency(balance, currency))) : '';
  const recurringAccountGroups = groupRecurringCostsByAccount(objects.filter((object) => matchesCurrency(object, currency)), t('noData'), t);
  const totalMonthlyFixedCost = recurringAccountGroups.reduce(
    (sum, group) => sum + group.monthlyCost,
    0,
  );
  const accountCount = latest
    ? latest.asset_balances.length + latest.liability_balances.length
    : 0;
  const annualFixedCost = totalMonthlyFixedCost * 12;
  const sorted = useMemo(
    () => [...calculatedSnapshots].sort((a, b) =>
      compareSnapshots(b.entity, a.entity),
    ),
    [calculatedSnapshots],
  );
  const scopedSorted = sorted.filter((stored) => matchesCurrency(stored.entity, currency));
  const previousNetWorthDelta =
    scopedSorted.length > 1
      ? (scopedSorted[0].entity.net_worth ?? 0) - (scopedSorted[1].entity.net_worth ?? 0)
      : null;
  const [snapshotAt, setSnapshotAt] = useState(todayISO());
  const [assetBalancesText, setAssetBalancesText] = useState('');
  const [liabilityBalancesText, setLiabilityBalancesText] = useState('');
  const [hasTouchedSnapshotForm, setHasTouchedSnapshotForm] = useState(false);
  const [isMonthEnd, setIsMonthEnd] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const editingSnapshot = snapshots.find((stored) => stored.fileName === editingFileName);
  const formCurrency = editingSnapshot ? recordCurrency(editingSnapshot.entity) : currency;
  const { formatMoney: formatFormMoney } = useFormatMoney(formCurrency);
  const isUsingLatestSnapshotPrefill =
    Boolean(latest) && !editingFileName && !hasTouchedSnapshotForm;
  const displayedAssetBalancesText = isUsingLatestSnapshotPrefill
    ? latestAssetBalancesText
    : assetBalancesText;
  const displayedLiabilityBalancesText = isUsingLatestSnapshotPrefill
    ? latestLiabilityBalancesText
    : liabilityBalancesText;
  const assetLineParse = parseBalanceLinesWithIssues(displayedAssetBalancesText, 'asset', formCurrency);
  const liabilityLineParse = parseBalanceLinesWithIssues(displayedLiabilityBalancesText, 'liability', formCurrency);
  const parsedAssetBalances = preserveBalanceMetadata(assetLineParse.balances, editingSnapshot?.entity.asset_balances, formCurrency);
  const parsedLiabilityBalances = preserveBalanceMetadata(liabilityLineParse.balances, editingSnapshot?.entity.liability_balances, formCurrency);
  const hasInvalidAssetLines = assetLineParse.hasInvalidLines;
  const hasInvalidLiabilityLines = liabilityLineParse.hasInvalidLines;
  const hasInvalidLiabilityDate = liabilityLineParse.hasInvalidDueDate;
  const trendSnapshots = useMemo(
    () => calculatedSnapshots.filter((stored) => matchesCurrency(stored.entity, currency))
      .sort((a, b) => compareSnapshots(a.entity, b.entity))
      .slice(-12)
      .map((stored) => stored.entity),
    [calculatedSnapshots, currency],
  );
  const trendValues = trendSnapshots.map((snapshot) => snapshot.net_worth || 0);
  const trendPoints = buildSparklinePoints(trendValues);

  const fixedCostTrendValues = trendSnapshots.map(
    (snapshot) => snapshot.monthly_fixed_cost ?? totalMonthlyFixedCost,
  );
  const fixedCostTrendPoints = buildSparklinePoints(fixedCostTrendValues);
  const latestFixedCost = fixedCostTrendValues[fixedCostTrendValues.length - 1] ?? totalMonthlyFixedCost;
  const snapshotDateValid = isValidISODate(snapshotAt);
  const canSubmit =
    !disabled &&
    snapshotDateValid &&
    parsedAssetBalances.length > 0 &&
    !hasInvalidAssetLines &&
    !hasInvalidLiabilityLines &&
    !isSaving;

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || savingRef.current) return;

    savingRef.current = true;
    setIsSaving(true);
    try {
      const editing = editingFileName
        ? snapshots.find((stored) => stored.fileName === editingFileName)
        : null;
      const draft = createSnapshotDraft({
        snapshotAt,
        assetBalances: parsedAssetBalances,
        liabilityBalances: parsedLiabilityBalances,
        currency: formCurrency,
        isMonthEnd,
        objects,
        t,
      });
      const snapshot = editing
        ? {
            ...editing.entity,
            snapshot_at: draft.snapshot_at,
            is_month_end: draft.is_month_end,
            asset_balances: draft.asset_balances,
            liability_balances: draft.liability_balances,
            total_assets: draft.total_assets,
            total_liabilities: draft.total_liabilities,
            net_worth: draft.net_worth,
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
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function startEditingSnapshot(stored: WYQDStoredEntity<AccountSnapshot>) {
    if (savingRef.current) return;
    const calculated = calculateNetWorth(stored.entity);
    setEditingFileName(stored.fileName);
    setSnapshotAt(calculated.snapshot_at);
    setAssetBalancesText(serializeBalanceLines(calculated.asset_balances, true));
    setLiabilityBalancesText(serializeBalanceLines(calculated.liability_balances, true));
    setHasTouchedSnapshotForm(true);
    setIsMonthEnd(Boolean(calculated.is_month_end));
  }

  function cancelEditing() {
    if (savingRef.current) return;
    setEditingFileName(null);
    setSnapshotAt(todayISO());
    setAssetBalancesText('');
    setLiabilityBalancesText('');
    setHasTouchedSnapshotForm(false);
    setIsMonthEnd(false);
  }

  function changeBalanceText(kind: 'asset' | 'liability', value: string) {
    if (savingRef.current) return;
    // Materialize both visible prefilled sides before leaving prefill mode.
    setAssetBalancesText(kind === 'asset' ? value : displayedAssetBalancesText);
    setLiabilityBalancesText(kind === 'liability' ? value : displayedLiabilityBalancesText);
    setHasTouchedSnapshotForm(true);
  }

  function refillFromLatestSnapshot() {
    if (!latest || savingRef.current) return;
    setAssetBalancesText(latestAssetBalancesText);
    setLiabilityBalancesText(latestLiabilityBalancesText);
    setHasTouchedSnapshotForm(true);
  }

  return (
    <>
    <section className="space-y-5">
      <p className="text-xs text-stone-500">{t('financialCurrencyScope').replace('{currency}', currency)}</p>
      <AccountsConsole
        latest={latest ?? null}
        accountCount={accountCount}
        totalMonthlyFixedCost={totalMonthlyFixedCost}
        annualFixedCost={annualFixedCost}
        previousNetWorthDelta={previousNetWorthDelta}
        t={t}
        formatMoney={formatMoney}
      />

      <LiabilityDuePanel
        latest={latest ?? null}
        onEditLatest={scopedSorted.length > 0 ? () => startEditingSnapshot(scopedSorted[0]) : undefined}
        t={t}
        formatMoney={formatMoney}
      />

      <AccountsTrend
        trendSnapshots={trendSnapshots}
        trendValues={trendValues}
        trendPoints={trendPoints}
        fixedCostTrendValues={fixedCostTrendValues}
        fixedCostTrendPoints={fixedCostTrendPoints}
        latestFixedCost={latestFixedCost}
        t={t}
        formatMoney={formatMoney}
        formatCompactMoney={formatCompactMoney}
      />

      <AccountsForm
        disabled={disabled}
        isSaving={isSaving}
        editingFileName={editingFileName}
        currency={formCurrency}
        snapshotAt={snapshotAt}
        snapshotDateError={snapshotDateValid ? undefined : language === 'zh' ? '请选择有效的快照日期。' : 'Choose a valid snapshot date.'}
        setSnapshotAt={setSnapshotAt}
        displayedAssetBalancesText={displayedAssetBalancesText}
        setAssetBalancesText={(value) => changeBalanceText('asset', value)}
        displayedLiabilityBalancesText={displayedLiabilityBalancesText}
        setLiabilityBalancesText={(value) => changeBalanceText('liability', value)}
        setHasTouchedSnapshotForm={setHasTouchedSnapshotForm}
        parsedAssetBalances={parsedAssetBalances}
        hasInvalidAssetLines={hasInvalidAssetLines}
        parsedLiabilityBalances={parsedLiabilityBalances}
        hasInvalidLiabilityLines={hasInvalidLiabilityLines}
        hasInvalidLiabilityDate={hasInvalidLiabilityDate}
        latest={latest ?? null}
        isUsingLatestSnapshotPrefill={isUsingLatestSnapshotPrefill}
        refillFromLatestSnapshot={refillFromLatestSnapshot}
        isMonthEnd={isMonthEnd}
        setIsMonthEnd={setIsMonthEnd}
        cancelEditing={cancelEditing}
        canSubmit={canSubmit}
        handleSubmit={(e) => void handleSubmit(e).catch(() => { /* Action reports failure; keep draft. */ })}
        t={t}
        formatMoney={formatFormMoney}
      />

      <AccountsHistory
        disabled={disabled || isSaving}
        isSaving={isSaving}
        sorted={sorted}
        startEditingSnapshot={startEditingSnapshot}
        deletingFileName={deletingFileName}
        setDeletingFileName={setDeletingFileName}
        onDeleteSnapshot={onDeleteSnapshot}
        editingFileName={editingFileName}
        cancelEditing={cancelEditing}
        confirm={confirm}
        t={t}
        formatMoney={formatMoney}
      />
    </section>
    {confirmDialog}
    </>
  );
}
