'use client';

import { useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import type {
  AccountSnapshot,
  WYQDObject,
} from '@/domain/types';
import {
  calculateNetWorth,
  findLatestSnapshot,
} from '@/domain/calculations';
import type { WYQDStoredEntity } from '@/core/repository';
import { buildSparklinePoints, todayISO } from '@/lib/format';
import { useFormatMoney } from '@/lib/use-format';
import {
  parseBalanceLines,
  hasInvalidBalanceLines,
  serializeBalanceLines,
  groupRecurringCostsByAccount,
  createSnapshotDraft,
} from './accountsUtils';
import { AccountsConsole } from './AccountsConsole';
import { AccountsTrend } from './AccountsTrend';
import { AccountsForm } from './AccountsForm';
import { AccountsHistory } from './AccountsHistory';

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
      <AccountsConsole
        latest={latest ?? null}
        accountCount={accountCount}
        totalMonthlyFixedCost={totalMonthlyFixedCost}
        annualFixedCost={annualFixedCost}
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
        snapshotAt={snapshotAt}
        setSnapshotAt={setSnapshotAt}
        displayedAssetBalancesText={displayedAssetBalancesText}
        setAssetBalancesText={setAssetBalancesText}
        displayedLiabilityBalancesText={displayedLiabilityBalancesText}
        setLiabilityBalancesText={setLiabilityBalancesText}
        setHasTouchedSnapshotForm={setHasTouchedSnapshotForm}
        parsedAssetBalances={parsedAssetBalances}
        hasInvalidAssetLines={hasInvalidAssetLines}
        parsedLiabilityBalances={parsedLiabilityBalances}
        hasInvalidLiabilityLines={hasInvalidLiabilityLines}
        latest={latest ?? null}
        isUsingLatestSnapshotPrefill={isUsingLatestSnapshotPrefill}
        refillFromLatestSnapshot={refillFromLatestSnapshot}
        isMonthEnd={isMonthEnd}
        setIsMonthEnd={setIsMonthEnd}
        cancelEditing={cancelEditing}
        canSubmit={canSubmit}
        handleSubmit={(e) => void handleSubmit(e)}
        t={t}
        formatMoney={formatMoney}
      />

      <AccountsHistory
        disabled={disabled}
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
