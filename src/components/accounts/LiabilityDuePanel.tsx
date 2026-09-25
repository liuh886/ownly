import type { AccountSnapshot } from '@/domain/types';
import type { WYQDTranslationKey } from '@/core/i18n';
import { CARD_CLASS } from '@/lib/ui-constants';
import {
  LIABILITY_DUE_WINDOW_MONTHS,
  bucketLiabilityDues,
  collectLiabilityDues,
  summarizeLiabilityDues,
} from '@/domain/liability-due';
import { todayISO } from '@/lib/format';
import { LiabilityDueList } from './LiabilityDueList';

export interface LiabilityDuePanelProps {
  latest: AccountSnapshot | null;
  onEditLatest?: () => void;
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (val: number | null | undefined, fallback?: string) => string;
}

export function LiabilityDuePanel({
  latest,
  onEditLatest,
  t,
  formatMoney,
}: LiabilityDuePanelProps) {
  const dues = collectLiabilityDues(latest, todayISO());
  const buckets = bucketLiabilityDues(dues);
  const summary = summarizeLiabilityDues(buckets);
  const upcoming = [...buckets.overdue, ...buckets.withinWindow];
  const coverage =
    latest && latest.total_assets && latest.total_assets > 0 && summary.withinWindowTotal > 0
      ? Math.round((summary.withinWindowTotal / latest.total_assets) * 100)
      : null;

  return (
    <div className={CARD_CLASS}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('repaymentReminders')}</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">{t('repaymentRemindersDesc')}</p>
        </div>
        {latest && onEditLatest ? (
          <button
            type="button"
            onClick={onEditLatest}
            className="min-h-10 shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-stone-900"
          >
            {t('updateDueDates')}
          </button>
        ) : null}
      </div>

      {dues.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
          {t('noDatedLiabilities')}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {summary.overdueCount > 0 || summary.withinWindowCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {summary.withinWindowCount > 0 ? (
                <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                  {t('dueWithinWindow')
                    .replace('{months}', String(LIABILITY_DUE_WINDOW_MONTHS))
                    .replace('{amount}', formatMoney(summary.withinWindowTotal) ?? '')
                    .replace('{count}', String(summary.withinWindowCount))}
                </span>
              ) : null}
              {coverage !== null ? (
                <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-600">
                  {t('ofAssets').replace('{percent}', `${coverage}%`)}
                </span>
              ) : null}
              {summary.overdueCount > 0 ? (
                <span className="rounded-full bg-red-600 px-2.5 py-1 font-medium text-white">
                  {t('overdueSummary')
                    .replace('{amount}', formatMoney(summary.overdueTotal) ?? '')
                    .replace('{count}', String(summary.overdueCount))}
                </span>
              ) : null}
            </div>
          ) : null}

          {upcoming.length > 0 ? (
            <LiabilityDueList dues={upcoming} t={t} formatMoney={formatMoney} />
          ) : null}

          {summary.laterCount > 0 ? (
            <p className="text-xs text-stone-400">
              {t('laterDuesCount').replace('{count}', String(summary.laterCount))}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
