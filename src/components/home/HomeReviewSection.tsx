import { useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import type { WYQDObject } from '@/domain/types';
import { getUpcomingRecurringCosts, getPendingExperienceReviews } from './homeDashboardUtils';

export function HomeReviewSection({
  objects,
  itemVariants,
}: {
  objects: WYQDObject[];
  itemVariants: Variants;
}) {
  const { t } = useI18n();

  const upcomingRecurringCosts = useMemo(() => getUpcomingRecurringCosts(objects), [objects]);
  const pendingExperienceReviews = useMemo(() => getPendingExperienceReviews(objects), [objects]);
  const actionCount = upcomingRecurringCosts.length + pendingExperienceReviews.length;

  const pendingDecisionCount = useMemo(
    () => objects.filter((o) => ['seeded', 'observing', 'planned'].includes(o.status)).length,
    [objects],
  );
  const exitedNotReviewedCount = useMemo(
    () => objects.filter(
      (o) => o.object_type === 'one_time_experience' && o.status === 'completed' && !o.review_ref,
    ).length,
    [objects],
  );

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('reviewGroup')}</h3>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 items-stretch">
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('todayActions')}</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{actionCount}</div>
          <div className="mt-0.5 text-[11px] text-stone-400">{t('todayActionsDesc')}</div>
        </div>
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('pendingReviews')}</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{pendingExperienceReviews.length}</div>
        </div>
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('pendingDecisions')}</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{pendingDecisionCount}</div>
        </div>
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('exitedNotReviewed')}</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{exitedNotReviewedCount}</div>
        </div>
      </div>
    </motion.section>
  );
}
