import { useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import { SECTION_TITLE_CLASS, MUTED_TEXT_CLASS } from '@/lib/ui-constants';
import type { HomeMetrics, WYQDObject, AccountSnapshot, PhysicalObject, OneTimeExperienceObject } from '@/domain/types';

export function HomeDataScaleSection({
  metrics,
  objects,
  snapshots,
  itemVariants,
}: {
  metrics: HomeMetrics;
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  itemVariants: Variants;
}) {
  const { t } = useI18n();
  const { formatCompactMoney } = useFormatMoney();

  const physicalCount = useMemo(() => objects.filter((object) => object.object_type === 'physical').length, [objects]);
  const recurringCount = useMemo(() => objects.filter((object) => object.object_type === 'recurring_cost').length, [objects]);
  const experienceCount = useMemo(() => objects.filter((object) => object.object_type === 'one_time_experience').length, [objects]);

  const totalAcquisitionCost = useMemo(
    () => objects
      .filter((o): o is PhysicalObject => o.object_type === 'physical')
      .reduce((sum, o) => sum + (o.purchase_price || 0), 0),
    [objects],
  );
  const totalExperienceCost = useMemo(
    () => objects
      .filter((o): o is OneTimeExperienceObject => o.object_type === 'one_time_experience')
      .reduce((sum, o) => sum + (o.actual_total || o.budget_total || 0), 0),
    [objects],
  );
  const fixedCostCoverage = useMemo(
    () => metrics.netWorth && metrics.monthlyFixedCost > 0
      ? Math.floor(metrics.netWorth / metrics.monthlyFixedCost)
      : null,
    [metrics.netWorth, metrics.monthlyFixedCost],
  );

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('dataScale')}</h3>
        <span className={MUTED_TEXT_CLASS}>
          {t('objectsCount').replace('{count}', String(objects.length))}
        </span>
      </div>
      <div className="rounded-xl bg-stone-50/50 p-6">
        <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <div className="text-xs font-medium text-stone-500">{t('physical')}</div>
            <div className="mt-1 font-mono text-xl tracking-tight text-stone-900">{physicalCount}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-stone-500">{t('fixedCost')}</div>
            <div className="mt-1 font-mono text-xl tracking-tight text-stone-900">{recurringCount}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-stone-500">{t('experience')}</div>
            <div className="mt-1 font-mono text-xl tracking-tight text-stone-900">{experienceCount}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-stone-500">{t('accountSnapshot')}</div>
            <div className="mt-1 font-mono text-xl tracking-tight text-stone-900">{snapshots.length}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-stone-500">{t('totalAcquisitionCost')}</div>
            <div className="mt-1 font-mono text-xl tracking-tight text-stone-900">{formatCompactMoney(totalAcquisitionCost)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-stone-500">{t('totalExperienceCost')}</div>
            <div className="mt-1 font-mono text-xl tracking-tight text-stone-900">{formatCompactMoney(totalExperienceCost)}</div>
          </div>
          {fixedCostCoverage !== null ? (
            <div>
              <div className="text-xs font-medium text-stone-500">{t('fixedCostCoverage')}</div>
              <div className="mt-1 font-mono text-xl tracking-tight text-stone-900">
                {fixedCostCoverage} <span className="text-xs font-medium text-stone-400">{t('monthsUnit')}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
