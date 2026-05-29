import { useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  calculateNextBillingDate,
  calculateNetWorth,
  calculatePhysicalAcquisitionCost,
  calculatePhysicalDailyCost,
  calculateRecurringMonthlyCost,
  isActiveRecurringCost,
} from '@/domain/calculations';
import type { AccountSnapshot, HomeMetrics, RecurringCostObject, WYQDObject } from '@/domain/types';
import type { AppTab } from '@/components/app-shell/BottomNav';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import type { WYQDTranslationKey } from '@/core/i18n';
import { useI18n } from '@/core/i18n-context';
import { MetricCard } from './MetricCard';
import { clampPercent, buildSparklinePoints, formatDueLabel } from '@/lib/format';
import { useFormatMoney } from '@/lib/use-format';

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

function getSnapshotTrend(snapshots: AccountSnapshot[]) {
  return snapshots
    .map(calculateNetWorth)
    .sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at))
    .slice(-6);
}

function getCostBreakdown(objects: WYQDObject[], t: (key: WYQDTranslationKey) => string) {
  const activePhysicalObjects = objects
    .filter((object) => object.object_type === 'physical')
    .filter((object) => object.status === 'purchased' || object.status === 'using');

  const activePhysicalValue = activePhysicalObjects.reduce(
    (total, object) => total + calculatePhysicalAcquisitionCost(object),
    0,
  );

  const activeRecurringCosts = objects.filter(isActiveRecurringCost);

  const monthlyFixedCost = activeRecurringCosts
    .reduce((total, object) => total + calculateRecurringMonthlyCost(object), 0);

  const experienceObjects = objects.filter((object) => object.object_type === 'one_time_experience');
  const experienceCost = experienceObjects
    .reduce((total, object) => {
      if (object.object_type !== 'one_time_experience') return total;
      return total + (object.actual_total || object.budget_total || 0);
    }, 0);

  const breakdown: Array<{
    label: string;
    value: number;
    count: number;
    tone: string;
    focus: Omit<ObjectListFocus, 'token'>;
  }> = [
    {
      label: t('activePhysicalN').replace('{count}', String(activePhysicalObjects.length)),
      value: activePhysicalValue,
      count: activePhysicalObjects.length,
      tone: 'bg-stone-900',
      focus: { typeFilter: 'physical', physicalFilter: 'active', statusGroupFilter: 'using' },
    },
    {
      label: t('monthlyFixedCostN').replace('{count}', String(activeRecurringCosts.length)),
      value: monthlyFixedCost,
      count: activeRecurringCosts.length,
      tone: 'bg-sky-700',
      focus: { typeFilter: 'recurring_cost', statusGroupFilter: 'using' },
    },
    {
      label: t('oneTimeExperienceN').replace('{count}', String(experienceObjects.length)),
      value: experienceCost,
      count: experienceObjects.length,
      tone: 'bg-emerald-700',
      focus: { typeFilter: 'one_time_experience' },
    },
  ];

  return breakdown;
}

function getObjectStatusDistribution(objects: WYQDObject[], t: (key: WYQDTranslationKey) => string) {
  const distribution: Array<{
    label: string;
    count: number;
    tone: string;
    focus: Omit<ObjectListFocus, 'token'>;
  }> = [
    {
      label: t('observing'),
      count: objects.filter((object) => object.status === 'seeded' || object.status === 'observing')
        .length,
      tone: 'bg-amber-600',
      focus: { statusGroupFilter: 'observing' },
    },
    {
      label: t('inUse'),
      count: objects.filter((object) =>
        ['purchased', 'using', 'active', 'in_progress'].includes(object.status),
      ).length,
      tone: 'bg-stone-900',
      focus: { statusGroupFilter: 'using' },
    },
    {
      label: t('exited'),
      count: objects.filter((object) =>
        ['idle', 'transferred', 'discarded', 'cancelled', 'completed', 'reviewed'].includes(
          object.status,
        ),
      ).length,
      tone: 'bg-zinc-500',
      focus: { statusGroupFilter: 'exited' },
    },
  ];

  return distribution;
}

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

function DataBar({
  label,
  value,
  max,
  tone,
  valueLabel,
  onSelect,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
  valueLabel: string;
  onSelect?: () => void;
}) {
  const width = max > 0 ? clampPercent((value / max) * 100) : 0;
  const content = (
    <>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-stone-600">{label}</span>
        <span className="shrink-0 font-medium text-stone-950">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="block w-full space-y-1.5 rounded-lg p-1 text-left transition hover:bg-stone-50"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      {content}
    </div>
  );
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

function ActionCard({
  label,
  title,
  detail,
  onSelect,
}: {
  label: string;
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="wyqd-card-action group flex flex-col rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:border-stone-300/70 hover:bg-stone-50/60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
          {label}
        </span>
        <span
          className="text-sm text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-700"
          aria-hidden="true"
        >
          →
        </span>
      </div>
      <div className="mt-4 text-base font-semibold leading-snug text-stone-950">{title}</div>
      <div className="mt-1 flex-1 text-xs leading-5 text-stone-500">{detail}</div>
    </button>
  );
}

export function HomeDashboard({
  metrics,
  objects,
  snapshots,
  onOpenObjects,
  onNavigate,
}: {
  metrics: HomeMetrics;
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  onOpenObjects: (focus: Omit<ObjectListFocus, 'token'>) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const { t } = useI18n();
  const { formatMoney, formatDailyMoney, formatCompactMoney, formatDelta } = useFormatMoney();

  const trendSnapshots = useMemo(() => getSnapshotTrend(snapshots), [snapshots]);
  const trendValues = useMemo(() => trendSnapshots.map((snapshot) => snapshot.net_worth || 0), [trendSnapshots]);
  const trendPoints = useMemo(() => buildSparklinePoints(trendValues), [trendValues]);
  const costBreakdown = useMemo(() => getCostBreakdown(objects, t), [objects, t]);
  const maxCost = useMemo(() => Math.max(...costBreakdown.map((item) => item.value), 0), [costBreakdown]);
  const statusDistribution = useMemo(() => getObjectStatusDistribution(objects, t), [objects, t]);
  const maxStatusCount = useMemo(() => Math.max(...statusDistribution.map((item) => item.count), 0), [statusDistribution]);
  const upcomingRecurringCosts = useMemo(() => getUpcomingRecurringCosts(objects), [objects]);
  const pendingExperienceReviews = useMemo(() => getPendingExperienceReviews(objects), [objects]);
  const highestDailyCost = useMemo(() => getHighestDailyCostObject(objects), [objects]);
  const largestRecurringCost = useMemo(() => getLargestActiveRecurringCost(objects), [objects]);
  const latestSnapshot = useMemo(() => getLatestSnapshot(snapshots), [snapshots]);
  const physicalCount = useMemo(() => objects.filter((object) => object.object_type === 'physical').length, [objects]);
  const recurringCount = useMemo(() => objects.filter((object) => object.object_type === 'recurring_cost').length, [objects]);
  const experienceCount = useMemo(() => objects.filter((object) => object.object_type === 'one_time_experience').length, [objects]);
  const actionCount = upcomingRecurringCosts.length + pendingExperienceReviews.length;
  const dailyFixedCost = metrics.monthlyFixedCost / 30.44;
  const annualFixedCost = metrics.monthlyFixedCost * 12;
  const fixedCostHint = `${formatDailyMoney(dailyFixedCost)} · ${formatMoney(annualFixedCost)}${t('perYear')}`;

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      <motion.section variants={itemVariants} className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 items-stretch">
        <div className="wyqd-card-action wyqd-card-action--dark flex flex-col rounded-xl bg-stone-200 p-5 text-left">
          <div className="wyqd-card-action__label text-xs font-medium text-stone-500">{t('todayActions')}</div>
          <div className="wyqd-card-action__count mt-3 font-mono text-3xl font-semibold text-stone-950">
            {actionCount}
          </div>
          <div className="wyqd-card-action__hint mt-1 text-xs text-stone-500">
            {t('todayActionsDesc')}
          </div>
        </div>
        <ActionCard
          label={t('tabAccounts')}
          title={t('actionRecordSnapshot')}
          detail={t('actionSnapshotHint').replace('{count}', String(snapshots.length))}
          onSelect={() => onNavigate('accounts')}
        />
        <ActionCard
          label={t('tabObjects')}
          title={t('actionCaptureObject')}
          detail={t('actionObjectHint').replace('{count}', String(objects.length))}
          onSelect={() => onNavigate('objects')}
        />
        <ActionCard
          label={t('tabReviews')}
          title={t('actionOrganizeReviews')}
          detail={t('actionReviewHint').replace('{count}', String(pendingExperienceReviews.length))}
          onSelect={() => onNavigate('reviews')}
        />
      </motion.section>

      {/* 核心指标区块 */}
      <motion.section
        variants={itemVariants}
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6 items-center">
          <div>
            <MetricCard
              label={t('assetNetWorthEstimate')}
              value={formatMoney(metrics.netWorth, t('noData'))}
              hint={formatDelta(metrics.netWorthDeltaFromPreviousMonth, t)}
              featured
            />
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-stone-950">{t('netWorthTrend')}</h2>
                <p className="mt-1 text-xs text-stone-500">
                  {t('recentSnapshotsCount').replace('{count}', String(trendSnapshots.length))}
                </p>
              </div>
              {trendSnapshots.length > 0 ? (
                <span className="shrink-0 font-mono text-xs font-semibold text-stone-900">
                  {formatCompactMoney(trendValues[trendValues.length - 1] || 0)}
                </span>
              ) : null}
            </div>
            {trendSnapshots.length > 0 ? (
              <div className="mt-4">
                <svg viewBox="0 0 100 48" role="img" aria-label={t('netWorthTrend')} className="h-24 w-full overflow-visible">
                  <motion.polyline
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                    fill="none"
                    points={trendPoints}
                    stroke="#1c1917"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                  />
                  {trendValues.map((value, index) => {
                    const [x, y] = trendPoints.split(' ')[index].split(',').map(Number);
                    return (
                      <motion.circle
                        key={`${trendSnapshots[index].id}-${value}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.6 + index * 0.08 }}
                        cx={x}
                        cy={y}
                        fill="white"
                        r="3"
                        stroke="#1c1917"
                        strokeWidth="2"
                      />
                    );
                  })}
                </svg>
              </div>
            ) : (
              <p className="mt-4 text-xs text-stone-400 italic">{t('connectVaultForTrend')}</p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 items-start">
          <MetricCard
            label={t('monthlyFixedCostAvg')}
            value={formatMoney(metrics.monthlyFixedCost, t('noData'))}
            hint={fixedCostHint}
          />
          <MetricCard label={t('physicalAsset')} value={t('itemCount').replace('{count}', String(metrics.ownedPhysicalCount))} />
          <MetricCard label={t('subscriptionService')} value={t('serviceCount').replace('{count}', String(metrics.activeSubscriptionCount))} />
          <MetricCard label={t('observeAmount')} value={formatMoney(metrics.observingDesireAmount, t('noData'))} />
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 items-stretch">
        <InsightCard
          label={t('highestDailyCost')}
          title={highestDailyCost?.object.title || t('noCalculablePhysical')}
          value={highestDailyCost ? formatMoney(highestDailyCost.dailyCost) : t('noData')}
          detail={highestDailyCost ? t('clickToViewPhysical') : t('enterPurchaseDateHint')}
          onSelect={
            highestDailyCost
              ? () => onOpenObjects({ typeFilter: 'physical', statusGroupFilter: 'using' })
              : undefined
          }
        />
        <InsightCard
          label={t('largestMonthlyFixedCost')}
          title={largestRecurringCost?.object.title || t('noSubscriptionCost')}
          value={largestRecurringCost ? formatMoney(largestRecurringCost.monthlyCost) : t('noData')}
          detail={largestRecurringCost ? t('clickToViewSubscription') : t('enterFixedCostHint')}
          onSelect={
            largestRecurringCost
              ? () => onOpenObjects({ typeFilter: 'recurring_cost', statusGroupFilter: 'using' })
              : undefined
          }
        />
        <InsightCard
          label={t('latestAccountSnapshot')}
          title={latestSnapshot?.snapshot_at || t('noAccountSnapshot')}
          value={latestSnapshot ? formatMoney(latestSnapshot.net_worth ?? null, t('noData')) : t('noData')}
          detail={latestSnapshot ? t('netWorth') : t('goToAccountsHint')}
        />
      </motion.section>

      {/* 近期关注 (Action Center) - 回归克制风格 */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold tracking-tight text-stone-950">{t('recentFocus')}</h2>
          <span className="text-xs text-stone-500">
            {t('itemsCount').replace('{count}', String(upcomingRecurringCosts.length + pendingExperienceReviews.length))}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {upcomingRecurringCosts.map(({ object, nextBillingDate }) => (
            <button
              key={object.id}
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'recurring_cost', statusGroupFilter: 'using' })}
              className="wyqd-card-watchlist group relative flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <div className="text-sm font-semibold text-stone-950">{object.title}</div>
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  {t('nextBilling').replace('{date}', nextBillingDate)} · {formatDueLabel(nextBillingDate, t)}
                </div>
              </div>
              <div className="shrink-0 font-mono text-xs font-semibold text-stone-950">
                {formatCompactMoney(object.billing_amount || 0)}
              </div>
            </button>
          ))}
          {pendingExperienceReviews.map((object) => (
            <button
              key={object.id}
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'one_time_experience', statusGroupFilter: 'exited' })}
              className="wyqd-card-watchlist group relative flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <div className="text-sm font-semibold text-stone-950">{object.title}</div>
                </div>
                <div className="mt-1 text-xs text-stone-500">{t('pendingReviewBadge')}</div>
              </div>
              <div className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-600">{t('reviewAction')}</div>
            </button>
          ))}
          {upcomingRecurringCosts.length === 0 && pendingExperienceReviews.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 py-10 text-center sm:col-span-2">
              <p className="text-xs font-medium text-stone-500">{t('noRecentItems')}</p>
            </div>
          ) : null}
        </div>
      </motion.section>

      {/* 数据规模 (Data Scale) */}
      <motion.section variants={itemVariants} className="space-y-4 pt-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold tracking-tight text-stone-950">{t('dataScale')}</h2>
          <span className="text-xs text-stone-500">
            {t('objectsCount').replace('{count}', String(objects.length))}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 items-start">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-stone-500">{t('accountSnapshot')}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{snapshots.length}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-stone-500">{t('physical')}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{physicalCount}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-stone-500">{t('fixedCost')}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{recurringCount}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-stone-500">{t('experience')}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{experienceCount}</div>
          </div>
        </div>
      </motion.section>

      {/* 次要数据区 - 采用 Surface-less 布局 */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        <motion.section variants={itemVariants}>
          <h2 className="px-1 text-sm font-semibold tracking-tight text-stone-950">{t('statusDistribution')}</h2>
          <div className="mt-6 space-y-6 px-1">
            {statusDistribution.map((item) => (
              <DataBar
                key={item.label}
                label={item.label}
                value={item.count}
                max={maxStatusCount}
                tone={item.tone}
                valueLabel={t('itemCount').replace('{count}', String(item.count))}
                onSelect={() => onOpenObjects(item.focus)}
              />
            ))}
          </div>
        </motion.section>

        <motion.section variants={itemVariants}>
          <h2 className="px-1 text-sm font-semibold tracking-tight text-stone-950">{t('costStructure')}</h2>
          <div className="mt-6 space-y-6 px-1">
            {costBreakdown.map((item) => (
              <DataBar
                key={item.label}
                label={item.label}
                value={item.value}
                max={maxCost}
                tone={item.tone}
                valueLabel={formatCompactMoney(item.value)}
                onSelect={() => onOpenObjects(item.focus)}
              />
            ))}
          </div>
        </motion.section>
      </div>
    </motion.section>
  );
}
