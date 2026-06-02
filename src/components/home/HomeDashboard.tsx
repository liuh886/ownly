import { useMemo, useState, useCallback } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  calculateNextBillingDate,
  calculateNetWorth,
  calculatePhysicalDailyCost,
  calculateRecurringMonthlyCost,
  isActiveRecurringCost,
} from '@/domain/calculations';
import type { AccountSnapshot, HomeMetrics, PhysicalObject, RecurringCostObject, WYQDObject } from '@/domain/types';
import type { WYQDDoctorReport } from '@/core/doctor';
import { runWYQDDoctor } from '@/core/doctor';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import { useI18n } from '@/core/i18n-context';
import { MetricCard } from './MetricCard';
import { useFormatMoney } from '@/lib/use-format';
import { CARD_CLASS } from '@/lib/ui-constants';

function buildDualLinePoints(values: number[], max: number, offsetX = 0, min = 0): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `${offsetX},24 ${offsetX + 100},24`;
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = offsetX + (i / (values.length - 1)) * 100;
      const y = 44 - ((v - min) / range) * 40;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springTransition,
  },
};

function getUpcomingRecurringCosts(objects: WYQDObject[]) {
  return objects
    .filter((object): object is RecurringCostObject =>
      object.object_type === 'recurring_cost' && object.status === 'active',
    )
    .map((object) => ({
      object,
      nextBillingDate: calculateNextBillingDate(object),
    }))
    .filter((item): item is { object: RecurringCostObject; nextBillingDate: string } =>
      Boolean(item.nextBillingDate),
    )
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate))
    .slice(0, 3);
}

function getPendingExperienceReviews(objects: WYQDObject[]) {
  return objects
    .filter((object) => object.object_type === 'one_time_experience' && object.status === 'completed')
    .slice(0, 3);
}

function getHighestDailyCostObject(objects: WYQDObject[]) {
  return objects
    .filter((object) => object.object_type === 'physical')
    .map((object) => ({
      object,
      dailyCost: calculatePhysicalDailyCost(object),
    }))
    .filter((item): item is { object: Extract<WYQDObject, { object_type: 'physical' }>; dailyCost: number } =>
      item.dailyCost !== null,
    )
    .sort((a, b) => b.dailyCost - a.dailyCost)[0] || null;
}

function getLargestActiveRecurringCost(objects: WYQDObject[]) {
  return objects
    .filter(isActiveRecurringCost)
    .map((object) => ({
      object,
      monthlyCost: calculateRecurringMonthlyCost(object),
    }))
    .sort((a, b) => b.monthlyCost - a.monthlyCost)[0] || null;
}

function getLatestSnapshot(snapshots: AccountSnapshot[]) {
  return [...snapshots]
    .map(calculateNetWorth)
    .sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))[0] || null;
}

function InsightCard({
  label,
  title,
  value,
  detail,
  onSelect,
}: {
  label: string;
  title: string;
  value: string;
  detail: string;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className="mt-2 min-h-10 text-sm font-semibold leading-snug text-stone-950">{title}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="font-mono text-lg font-semibold tracking-tight text-stone-950">{value}</span>
        <span className="text-right text-xs text-stone-500">{detail}</span>
      </div>
    </>
  );

  if (!onSelect) {
    return (
      <div className="wyqd-card-insight flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="wyqd-card-insight wyqd-card-insight--clickable flex flex-col rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:border-stone-300/70 hover:bg-stone-50/60"
    >
      {content}
    </button>
  );
}

export function HomeDashboard({
  metrics,
  objects,
  snapshots,
  onOpenObjects,
}: {
  metrics: HomeMetrics;
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  onOpenObjects: (focus: Omit<ObjectListFocus, 'token'>) => void;
}) {
  const { t } = useI18n();
  const { formatMoney, formatDailyMoney, formatCompactMoney, formatDelta } = useFormatMoney();
  const { repository } = useOwnlyWorkspace();
  const [doctorReport, setDoctorReport] = useState<WYQDDoctorReport | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);

  const runDoctor = useCallback(async () => {
    setDoctorLoading(true);
    try {
      const report = await runWYQDDoctor(repository, undefined, t);
      setDoctorReport(report);
    } catch {
      setDoctorReport(null);
    } finally {
      setDoctorLoading(false);
    }
  }, [repository, t]);

  const upcomingRecurringCosts = useMemo(() => getUpcomingRecurringCosts(objects), [objects]);
  const pendingExperienceReviews = useMemo(() => getPendingExperienceReviews(objects), [objects]);
  const highestDailyCost = useMemo(() => getHighestDailyCostObject(objects), [objects]);
  const largestRecurringCost = useMemo(() => getLargestActiveRecurringCost(objects), [objects]);
  const latestSnapshot = useMemo(() => getLatestSnapshot(snapshots), [snapshots]);

  const trendSnapshots = useMemo(() =>
    [...snapshots]
      .map(calculateNetWorth)
      .sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at))
      .slice(-12),
    [snapshots],
  );
  const netWorthTrendValues = useMemo(
    () => trendSnapshots.map((s) => s.net_worth ?? 0),
    [trendSnapshots],
  );
  const fixedCostTrendValues = useMemo(
    () => trendSnapshots.map((s, i) =>
      i === trendSnapshots.length - 1
        ? metrics.monthlyFixedCost
        : (s.monthly_fixed_cost ?? metrics.monthlyFixedCost)
    ),
    [trendSnapshots, metrics.monthlyFixedCost],
  );
  const netWorthMin = useMemo(
    () => Math.min(...netWorthTrendValues),
    [netWorthTrendValues],
  );
  const netWorthMax = useMemo(
    () => Math.max(...netWorthTrendValues),
    [netWorthTrendValues],
  );
  const fixedCostMin = useMemo(
    () => Math.min(...fixedCostTrendValues),
    [fixedCostTrendValues],
  );
  const fixedCostMax = useMemo(
    () => Math.max(...fixedCostTrendValues),
    [fixedCostTrendValues],
  );
  const netWorthPoints = useMemo(
    () => buildDualLinePoints(netWorthTrendValues, netWorthMax, 10, netWorthMin),
    [netWorthTrendValues, netWorthMax, netWorthMin],
  );
  const fixedCostPoints = useMemo(
    () => buildDualLinePoints(fixedCostTrendValues, fixedCostMax, 10, fixedCostMin),
    [fixedCostTrendValues, fixedCostMax, fixedCostMin],
  );
  const physicalCount = useMemo(() => objects.filter((object) => object.object_type === 'physical').length, [objects]);
  const recurringCount = useMemo(() => objects.filter((object) => object.object_type === 'recurring_cost').length, [objects]);
  const avgDailyCost = useMemo(() => {
    const ownedPhysicals = objects.filter((o): o is PhysicalObject => o.object_type === 'physical' && (o.status === 'purchased' || o.status === 'using'));
    const costs = ownedPhysicals.map((o) => calculatePhysicalDailyCost(o)).filter((c): c is number => c !== null && c > 0);
    return costs.length > 0 ? costs.reduce((s, c) => s + c, 0) : 0;
  }, [objects]);
  const experienceCount = useMemo(() => objects.filter((object) => object.object_type === 'one_time_experience').length, [objects]);
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
  const totalAcquisitionCost = useMemo(
    () => objects
      .filter((o) => o.object_type === 'physical')
      .reduce((sum, o) => sum + (o.purchase_price || 0), 0),
    [objects],
  );
  const totalExperienceCost = useMemo(
    () => objects
      .filter((o) => o.object_type === 'one_time_experience')
      .reduce((sum, o) => sum + (o.actual_total || o.budget_total || 0), 0),
    [objects],
  );
  const fixedCostCoverage = useMemo(
    () => metrics.netWorth && metrics.monthlyFixedCost > 0
      ? Math.floor(metrics.netWorth / metrics.monthlyFixedCost)
      : null,
    [metrics.netWorth, metrics.monthlyFixedCost],
  );

  const cardClass = CARD_CLASS;

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      {/* A. Own */}
      <motion.section variants={itemVariants}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-stone-950">{t('ownGroup')}</h3>
        </div>

        {/* Hero row: Net worth left + Chart right */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className={cardClass}>
            <MetricCard
              label={t('assetNetWorthEstimate')}
              value={formatMoney(
                (metrics.netWorth ?? 0) + metrics.physicalResidualValue,
                t('noData'),
              )}
              hint={formatDelta(metrics.netWorthDeltaFromPreviousMonth)}
              featured
            />
          </div>

          {trendSnapshots.length > 1 ? (
            <div className={cardClass}>
              <svg viewBox="-2 0 124 52" role="img" aria-label={`${t('netWorthTrend')} / ${t('fixedCostTrend')}`} className="h-24 w-full overflow-visible">
                {/* Left Y-axis labels (net worth) */}
                <text x="7" y="7" textAnchor="end" fontSize="5" fill="#a8a29e" fontFamily="ui-monospace, monospace">
                  {formatCompactMoney(netWorthMax)}
                </text>
                <text x="7" y="46" textAnchor="end" fontSize="5" fill="#a8a29e" fontFamily="ui-monospace, monospace">
                  {formatCompactMoney(netWorthMin)}
                </text>
                {/* Right Y-axis labels (fixed cost) */}
                <text x="115" y="7" textAnchor="start" fontSize="5" fill="#f59e0b" fontFamily="ui-monospace, monospace">
                  {formatMoney(fixedCostMax)}
                </text>
                <text x="115" y="46" textAnchor="start" fontSize="5" fill="#f59e0b" fontFamily="ui-monospace, monospace">
                  {formatMoney(fixedCostMin)}
                </text>
                {/* Grid lines */}
                <line x1="10" y1="4" x2="110" y2="4" stroke="#e7e5e4" strokeWidth="0.3" />
                <line x1="10" y1="24" x2="110" y2="24" stroke="#e7e5e4" strokeWidth="0.3" />
                {/* Net worth line — black */}
                <motion.polyline
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.5, ease: 'easeInOut' }}
                  fill="none"
                  points={netWorthPoints}
                  stroke="#1c1917"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                />
                {/* Fixed cost line — orange */}
                <motion.polyline
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.3 }}
                  fill="none"
                  points={fixedCostPoints}
                  stroke="#f59e0b"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
                {/* Net worth markers with tooltip */}
                {netWorthPoints.split(' ').map((point, i) => {
                  const [cx, cy] = point.split(',').map(Number);
                  const date = trendSnapshots[i]?.snapshot_at || '';
                  const value = formatCompactMoney(netWorthTrendValues[i] || 0);
                  return (
                    <motion.circle
                      key={`nw-${i}`}
                      cx={cx}
                      cy={cy}
                      r="3"
                      fill="white"
                      stroke="#1c1917"
                      strokeWidth="1.5"
                      className="cursor-pointer"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.6 + i * 0.06 }}
                    >
                      <title>{`${date} · ${t('netWorthTrend')}: ${value}`}</title>
                    </motion.circle>
                  );
                })}
                {/* Fixed cost markers with tooltip */}
                {fixedCostPoints.split(' ').map((point, i) => {
                  const [cx, cy] = point.split(',').map(Number);
                  const date = trendSnapshots[i]?.snapshot_at || '';
                  const value = formatMoney(fixedCostTrendValues[i] || 0);
                  return (
                    <motion.circle
                      key={`fc-${i}`}
                      cx={cx}
                      cy={cy}
                      r="2.5"
                      fill="white"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      className="cursor-pointer"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.9 + i * 0.06 }}
                    >
                      <title>{`${date} · ${t('fixedCostTrend')}: ${value}`}</title>
                    </motion.circle>
                  );
                })}
              </svg>
            </div>
          ) : null}
        </div>

        {/* Metric grid */}
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 items-stretch">
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('physicalAsset')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">
              {formatMoney(metrics.physicalResidualValue)}
            </div>
            <div className="mt-0.5 text-[11px] text-stone-400">{metrics.ownedPhysicalCount} {t('items')}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('subscriptionService')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{metrics.activeSubscriptionCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('latestAccountSnapshot')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">
              {latestSnapshot ? formatCompactMoney(latestSnapshot.net_worth ?? 0) : '—'}
            </div>
            {latestSnapshot?.snapshot_at ? (
              <div className="mt-0.5 text-[11px] text-stone-400">{latestSnapshot.snapshot_at}</div>
            ) : null}
          </div>
        </div>
      </motion.section>

      {/* B. Cost + Quick Entry */}
      <motion.section variants={itemVariants}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-stone-950">{t('costGroup')}</h3>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 items-stretch">
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('dailyCostAvg')}（{metrics.ownedPhysicalCount}）</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{avgDailyCost > 0 ? formatDailyMoney(avgDailyCost) : t('noData')}</div>
            <div className="mt-0.5 text-[11px] text-stone-400">{t('physicalAsset')}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('monthlyFixedCostAvg')}（{metrics.activeSubscriptionCount}）</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{formatMoney(metrics.monthlyFixedCost, t('noData'))}</div>
            <div className="mt-0.5 text-[11px] text-stone-400">{t('subscriptionService')}</div>
          </div>
          <div className={cardClass}>
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
          <div className="flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium text-stone-500">{t('quickEntry')}</div>
            <div className="mt-2 flex-1 text-xs text-stone-500">{t('quickEntryDesc')}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onOpenObjects({ typeFilter: 'physical' })}
                className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:bg-white"
              >
                {t('physicalTemplate')}
              </button>
              <button
                type="button"
                onClick={() => onOpenObjects({ typeFilter: 'recurring_cost' })}
                className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:bg-white"
              >
                {t('fixedCostTemplate')}
              </button>
              <button
                type="button"
                onClick={() => onOpenObjects({ typeFilter: 'one_time_experience' })}
                className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:bg-white"
              >
                {t('experienceTemplate')}
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* C. Review */}
      <motion.section variants={itemVariants}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-stone-950">{t('reviewGroup')}</h3>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 items-stretch">
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('todayActions')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{actionCount}</div>
            <div className="mt-0.5 text-[11px] text-stone-400">{t('todayActionsDesc')}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('pendingReviews')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{pendingExperienceReviews.length}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('pendingDecisions')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{pendingDecisionCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('exitedNotReviewed')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{exitedNotReviewedCount}</div>
          </div>
        </div>
      </motion.section>

      {/* Data Scale */}
      <motion.section variants={itemVariants}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-stone-950">{t('dataScale')}</h3>
          <span className="text-xs text-stone-500">
            {t('objectsCount').replace('{count}', String(objects.length))}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 items-stretch">
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('physical')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{physicalCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('fixedCost')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{recurringCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('experience')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{experienceCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('accountSnapshot')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{snapshots.length}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('totalAcquisitionCost')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{formatCompactMoney(totalAcquisitionCost)}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs font-medium text-stone-500">{t('totalExperienceCost')}</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{formatCompactMoney(totalExperienceCost)}</div>
          </div>
          {fixedCostCoverage !== null ? (
            <div className={cardClass}>
              <div className="text-xs font-medium text-stone-500">{t('fixedCostCoverage')}</div>
              <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">
                {fixedCostCoverage} <span className="text-xs font-medium text-stone-400">{t('monthsUnit')}</span>
              </div>
            </div>
          ) : null}
        </div>
      </motion.section>

      {/* Doctor */}
      <motion.section variants={itemVariants}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-stone-950">{t('doctor')}</h3>
          <button
            type="button"
            onClick={runDoctor}
            disabled={doctorLoading}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {doctorLoading ? t('doctorRunning') : t('runDoctor')}
          </button>
        </div>
        {doctorReport ? (
          <div className={cardClass}>
            <div className="flex items-center gap-3">
              <span className={`h-2 w-2 rounded-full ${doctorReport.summary.error > 0 ? 'bg-red-500' : doctorReport.summary.warning > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span className="text-sm font-medium text-stone-950">
                {doctorReport.summary.error === 0 && doctorReport.summary.warning === 0
                  ? t('doctorPassed')
                  : `${doctorReport.summary.error} ${t('errors')}, ${doctorReport.summary.warning} ${t('warnings')}, ${doctorReport.summary.info} ${t('info')}`}
              </span>
            </div>
            {doctorReport.findings.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {doctorReport.findings.map((finding, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${finding.severity === 'error' ? 'bg-red-500' : finding.severity === 'warning' ? 'bg-amber-500' : 'bg-stone-300'}`} />
                    <span className="text-stone-600">{finding.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </motion.section>
    </motion.section>
  );
}
