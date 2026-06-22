import type { AccountSnapshot } from '@/domain/types';
import type { WYQDTranslationKey } from '@/core/i18n';

export interface AccountsConsoleProps {
  latest: AccountSnapshot | null;
  accountCount: number;
  totalMonthlyFixedCost: number;
  annualFixedCost: number;
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (val: number | null | undefined, fallback?: string) => string;
}

export function AccountsConsole({
  latest,
  accountCount,
  totalMonthlyFixedCost,
  annualFixedCost,
  t,
  formatMoney,
}: AccountsConsoleProps) {
  return (
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
  );
}
