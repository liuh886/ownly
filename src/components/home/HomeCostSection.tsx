import { useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import type { HomeMetrics, WYQDObject, PhysicalObject } from '@/domain/types';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import { InsightCard } from './InsightCard';
import {
  calculatePhysicalDailyCost,
} from '@/domain/calculations';

import {
  getHighestDailyCostObject,
  getLargestActiveRecurringCost,
} from './homeDashboardUtils';

export function HomeCostSection({
  metrics,
  objects,
  itemVariants,
  onOpenObjects,
}: {
  metrics: HomeMetrics;
  objects: WYQDObject[];
  itemVariants: Variants;
  onOpenObjects: (focus: Omit<ObjectListFocus, 'token'> & {
    quickEntryTemplateType?: 'physical' | 'recurring_cost' | 'travel';
    focusTarget?: 'quickLine' | 'title';
  }) => void;
}) {
  const { t } = useI18n();
  const { formatMoney, formatDailyMoney } = useFormatMoney();

  const highestDailyCost = useMemo(() => getHighestDailyCostObject(objects), [objects]);
  const largestRecurringCost = useMemo(() => getLargestActiveRecurringCost(objects), [objects]);

  const avgDailyCost = useMemo(() => {
    const ownedPhysicals = objects.filter((o): o is PhysicalObject => o.object_type === 'physical' && (o.status === 'purchased' || o.status === 'using'));
    const costs = ownedPhysicals.map((o) => calculatePhysicalDailyCost(o)).filter((c): c is number => c !== null && c > 0);
    return costs.length > 0 ? costs.reduce((s, c) => s + c, 0) : 0;
  }, [objects]);

  const pendingDecisionCount = useMemo(
    () => objects.filter((o) => ['seeded', 'observing', 'planned'].includes(o.status)).length,
    [objects],
  );

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('costGroup')}</h3>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 items-stretch">
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('dailyCostAvg')}（{metrics.ownedPhysicalCount}）</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{avgDailyCost > 0 ? formatDailyMoney(avgDailyCost) : t('noData')}</div>
          <div className="mt-0.5 text-[11px] text-stone-400">{t('physicalAsset')}</div>
        </div>
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('monthlyFixedCostAvg')}（{metrics.activeSubscriptionCount}）</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{formatMoney(metrics.monthlyFixedCost, t('noData'))}</div>
          <div className="mt-0.5 text-[11px] text-stone-400">{t('subscriptionService')}</div>
        </div>
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('observeAmount')}（{pendingDecisionCount}）</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{formatMoney(metrics.observingDesireAmount, t('noData'))}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 items-stretch">
        <InsightCard
          label={t('highestDailyCost')}
          title={highestDailyCost?.object.title || t('noCalculablePhysical')}
          value={highestDailyCost ? formatMoney(highestDailyCost.dailyCost) : t('noData')}
          detail={highestDailyCost ? t('clickToViewPhysical') : t('enterPurchaseDateHint')}
          onSelect={highestDailyCost ? () => onOpenObjects({ typeFilter: 'physical', statusGroupFilter: 'using' }) : undefined}
        />
        <InsightCard
          label={t('largestMonthlyFixedCost')}
          title={largestRecurringCost?.object.title || t('noSubscriptionCost')}
          value={largestRecurringCost ? formatMoney(largestRecurringCost.monthlyCost) : t('noData')}
          detail={largestRecurringCost ? t('clickToViewSubscription') : t('enterFixedCostHint')}
          onSelect={largestRecurringCost ? () => onOpenObjects({ typeFilter: 'recurring_cost', statusGroupFilter: 'using' }) : undefined}
        />
        <div className="flex flex-col rounded-xl border border-dashed border-stone-200 bg-transparent p-4">
          <div className="text-xs font-medium text-stone-500">{t('quickEntry')}</div>
          <div className="mt-1 flex-1 text-xs text-stone-400">{t('quickEntryDesc')}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'physical', quickEntryTemplateType: 'physical', focusTarget: 'quickLine' })}
              className="rounded-md bg-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:bg-stone-200"
            >
              {t('physicalTemplate')}
            </button>
            <button
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'recurring_cost', quickEntryTemplateType: 'recurring_cost', focusTarget: 'quickLine' })}
              className="rounded-md bg-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:bg-stone-200"
            >
              {t('fixedCostTemplate')}
            </button>
            <button
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'one_time_experience', quickEntryTemplateType: 'travel', focusTarget: 'quickLine' })}
              className="rounded-md bg-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:bg-stone-200"
            >
              {t('experienceTemplate')}
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
