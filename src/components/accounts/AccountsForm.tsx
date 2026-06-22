import { FIELD_CLASS } from '@/lib/ui-constants';
import type { WYQDTranslationKey } from '@/core/i18n';
import type { AccountBalance, AccountSnapshot } from '@/domain/types';
import { sumBalances } from './accountsUtils';

export interface AccountsFormProps {
  disabled?: boolean;
  isSaving: boolean;
  editingFileName: string | null;
  snapshotAt: string;
  setSnapshotAt: (value: string) => void;
  displayedAssetBalancesText: string;
  setAssetBalancesText: (value: string) => void;
  displayedLiabilityBalancesText: string;
  setLiabilityBalancesText: (value: string) => void;
  setHasTouchedSnapshotForm: (value: boolean) => void;
  parsedAssetBalances: AccountBalance[];
  hasInvalidAssetLines: boolean;
  parsedLiabilityBalances: AccountBalance[];
  hasInvalidLiabilityLines: boolean;
  latest: AccountSnapshot | null;
  isUsingLatestSnapshotPrefill: boolean;
  refillFromLatestSnapshot: () => void;
  isMonthEnd: boolean;
  setIsMonthEnd: (value: boolean) => void;
  cancelEditing: () => void;
  canSubmit: boolean;
  handleSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (val: number | null | undefined, fallback?: string) => string;
}

export function AccountsForm({
  disabled,
  isSaving,
  editingFileName,
  snapshotAt,
  setSnapshotAt,
  displayedAssetBalancesText,
  setAssetBalancesText,
  displayedLiabilityBalancesText,
  setLiabilityBalancesText,
  setHasTouchedSnapshotForm,
  parsedAssetBalances,
  hasInvalidAssetLines,
  parsedLiabilityBalances,
  hasInvalidLiabilityLines,
  latest,
  isUsingLatestSnapshotPrefill,
  refillFromLatestSnapshot,
  isMonthEnd,
  setIsMonthEnd,
  cancelEditing,
  canSubmit,
  handleSubmit,
  t,
  formatMoney,
}: AccountsFormProps) {
  const fieldClass = FIELD_CLASS;

  return (
    <form
      onSubmit={handleSubmit}
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
  );
}
