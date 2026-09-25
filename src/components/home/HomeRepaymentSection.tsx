import { useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import type { AccountSnapshot } from '@/domain/types';
import { findLatestSnapshot } from '@/domain/calculations';
import {
  LIABILITY_DUE_WINDOW_MONTHS,
  bucketLiabilityDues,
  collectLiabilityDues,
  summarizeLiabilityDues,
} from '@/domain/liability-due';
import { todayISO } from '@/lib/format';
import { LiabilityDueList } from '@/components/accounts/LiabilityDueList';

export function HomeRepaymentSection({
  snapshots,
  itemVariants,
  onOpenAccounts,
}: {
  snapshots: AccountSnapshot[];
  itemVariants: Variants;
  onOpenAccounts?: () => void;
}) {
  const { t } = useI18n();
  const { formatMoney } = useFormatMoney();
  const dues = useMemo(
    () => collectLiabilityDues(findLatestSnapshot(snapshots), todayISO()),
    [snapshots],
  );
  const buckets = useMemo(() => bucketLiabilityDues(dues), [dues]);
  const summary = useMemo(() => summarizeLiabilityDues(buckets), [buckets]);
  const upcoming = [...buckets.overdue, ...buckets.withinWindow];

  if (upcoming.length === 0) return null;

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('repaymentReminders')}</h3>
      </div>
      <div className={CARD_CLASS}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {summary.withinWindowCount > 0 ? (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
              {t('dueWithinWindow')
                .replace('{months}', String(LIABILITY_DUE_WINDOW_MONTHS))
                .replace('{amount}', formatMoney(summary.withinWindowTotal) ?? '')
                .replace('{count}', String(summary.withinWindowCount))}
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
        <LiabilityDueList dues={upcoming} t={t} formatMoney={formatMoney} onSelect={onOpenAccounts} />
        {summary.laterCount > 0 ? (
          <p className="mt-3 text-xs text-stone-400">
            {t('laterDuesCount').replace('{count}', String(summary.laterCount))}
          </p>
        ) : null}
      </div>
    </motion.section>
  );
}
