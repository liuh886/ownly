import { motion, type Variants } from 'framer-motion';
import {
  calculateNextBillingDate,
  calculateNetWorth,
  calculatePhysicalAcquisitionCost,
  calculateRecurringMonthlyCost,
  isActiveRecurringCost,
} from '@/domain/calculations';
import type { AccountSnapshot, HomeMetrics, RecurringCostObject, WYQDObject } from '@/domain/types';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import { MetricCard } from './MetricCard';

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


function formatMoney(value: number | null): string {
  if (value === null) return '暂无';
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function formatCompactMoney(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 10000) return `¥${(rounded / 10000).toFixed(1)}万`;
  return `¥${rounded.toLocaleString('zh-CN')}`;
}

function formatDelta(value: number | null): string {
  if (value === null) return '暂无上月末对比';
  const sign = value >= 0 ? '+' : '-';
  return `较上月末 ${sign}¥${Math.abs(Math.round(value)).toLocaleString('zh-CN')}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function buildSparklinePoints(values: number[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `0,24 100,24`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 42 - ((value - min) / range) * 36;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function getSnapshotTrend(snapshots: AccountSnapshot[]) {
  return snapshots
    .map(calculateNetWorth)
    .sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at))
    .slice(-6);
}

function getCostBreakdown(objects: WYQDObject[]) {
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
      label: `服役实物 (${activePhysicalObjects.length})`,
      value: activePhysicalValue,
      count: activePhysicalObjects.length,
      tone: 'bg-stone-900',
      focus: { typeFilter: 'physical', physicalFilter: 'active', statusGroupFilter: 'using' },
    },
    {
      label: `月固定成本 (${activeRecurringCosts.length})`,
      value: monthlyFixedCost,
      count: activeRecurringCosts.length,
      tone: 'bg-sky-700',
      focus: { typeFilter: 'recurring_cost', statusGroupFilter: 'using' },
    },
    {
      label: `一次性体验 (${experienceObjects.length})`,
      value: experienceCost,
      count: experienceObjects.length,
      tone: 'bg-emerald-700',
      focus: { typeFilter: 'one_time_experience' },
    },
  ];

  return breakdown;
}

function getObjectStatusDistribution(objects: WYQDObject[]) {
  const distribution: Array<{
    label: string;
    count: number;
    tone: string;
    focus: Omit<ObjectListFocus, 'token'>;
  }> = [
    {
      label: '观察中',
      count: objects.filter((object) => object.status === 'seeded' || object.status === 'observing')
        .length,
      tone: 'bg-amber-600',
      focus: { statusGroupFilter: 'observing' },
    },
    {
      label: '使用中',
      count: objects.filter((object) =>
        ['purchased', 'using', 'active', 'in_progress'].includes(object.status),
      ).length,
      tone: 'bg-stone-900',
      focus: { statusGroupFilter: 'using' },
    },
    {
      label: '已退出',
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

function daysUntil(date: string): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(`${date}T00:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

function formatDueLabel(date: string): string {
  const days = daysUntil(date);
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days > 1) return `${days} 天后`;
  return `已过 ${Math.abs(days)} 天`;
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
        <span className="shrink-0 font-medium text-stone-900">{valueLabel}</span>
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
  const trendSnapshots = getSnapshotTrend(snapshots);
  const trendValues = trendSnapshots.map((snapshot) => snapshot.net_worth || 0);
  const trendPoints = buildSparklinePoints(trendValues);
  const costBreakdown = getCostBreakdown(objects);
  const maxCost = Math.max(...costBreakdown.map((item) => item.value), 0);
  const statusDistribution = getObjectStatusDistribution(objects);
  const maxStatusCount = Math.max(...statusDistribution.map((item) => item.count), 0);
  const upcomingRecurringCosts = getUpcomingRecurringCosts(objects);
  const pendingExperienceReviews = getPendingExperienceReviews(objects);
  const physicalCount = objects.filter((object) => object.object_type === 'physical').length;
  const recurringCount = objects.filter((object) => object.object_type === 'recurring_cost').length;
  const experienceCount = objects.filter((object) => object.object_type === 'one_time_experience').length;

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* 核心指标区块 */}
      <motion.section
        variants={itemVariants}
        className="rounded-3xl bg-white p-6 shadow-premium ring-1 ring-stone-100"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <MetricCard
              label="资产净值估值"
              value={formatMoney(metrics.netWorth)}
              hint={formatDelta(metrics.netWorthDeltaFromPreviousMonth)}
              featured
            />
          </div>
          <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[10px] font-black tracking-widest text-stone-900 uppercase">Trend</h2>
                <p className="mt-1 text-[10px] font-bold text-stone-400">
                  最近 {trendSnapshots.length} 次快照
                </p>
              </div>
              {trendSnapshots.length > 0 ? (
                <span className="shrink-0 text-xs font-black text-stone-900">
                  {formatCompactMoney(trendValues[trendValues.length - 1] || 0)}
                </span>
              ) : null}
            </div>
            {trendSnapshots.length > 0 ? (
              <div className="mt-4">
                <svg viewBox="0 0 100 48" role="img" aria-label="净资产趋势图" className="h-24 w-full overflow-visible">
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
              <p className="mt-4 text-xs text-stone-400 italic">连接 Vault 后开启趋势分析。</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="固定成本" value={formatMoney(metrics.monthlyFixedCost)} />
          <MetricCard label="实物资产" value={`${metrics.ownedPhysicalCount} 件`} />
          <MetricCard label="订阅服务" value={`${metrics.activeSubscriptionCount} 个`} />
          <MetricCard label="观察金额" value={formatMoney(metrics.observingDesireAmount)} />
        </div>
      </motion.section>

      {/* 近期关注 (Action Center) - 回归克制风格 */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">Attention</h2>
          <span className="text-[10px] font-bold text-stone-300">
            {upcomingRecurringCosts.length + pendingExperienceReviews.length} Tasks
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {upcomingRecurringCosts.map(({ object, nextBillingDate }) => (
            <button
              key={object.id}
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'recurring_cost', statusGroupFilter: 'using' })}
              className="group relative flex items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-premium transition-all hover:shadow-active ring-1 ring-stone-100"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <div className="text-sm font-bold text-stone-900">{object.title}</div>
                </div>
                <div className="mt-1 text-[10px] font-bold text-stone-400 uppercase tracking-tight">
                  Next: {nextBillingDate} · {formatDueLabel(nextBillingDate)}
                </div>
              </div>
              <div className="shrink-0 text-xs font-black text-stone-900 tracking-tighter">
                {formatCompactMoney(object.billing_amount || 0)}
              </div>
            </button>
          ))}
          {pendingExperienceReviews.map((object) => (
            <button
              key={object.id}
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'one_time_experience', statusGroupFilter: 'exited' })}
              className="group relative flex items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-premium transition-all hover:shadow-active ring-1 ring-stone-100"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <div className="text-sm font-bold text-stone-900">{object.title}</div>
                </div>
                <div className="mt-1 text-[10px] font-bold text-stone-400 uppercase tracking-tight">Pending Review</div>
              </div>
              <div className="shrink-0 rounded-full border border-stone-100 bg-stone-50 px-2 py-0.5 text-[10px] font-black text-stone-600 uppercase">Review</div>
            </button>
          ))}
          {upcomingRecurringCosts.length === 0 && pendingExperienceReviews.length === 0 ? (
            <div className="sm:col-span-2 rounded-2xl border border-stone-200/60 bg-stone-50/30 py-8 text-center">
              <p className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.2em]">All settled</p>
            </div>
          ) : null}
        </div>
      </motion.section>

      {/* 数据规模 (Data Scale) */}
      <motion.section variants={itemVariants} className="space-y-4 pt-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">Data Scale</h2>
          <span className="text-[10px] font-bold text-stone-300">
            {objects.length} Objects Total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Vault Snapshots</div>
            <div className="mt-1 text-2xl font-black tracking-tighter text-stone-950">{snapshots.length}</div>
          </div>
          <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Physical</div>
            <div className="mt-1 text-2xl font-black tracking-tighter text-stone-950">{physicalCount}</div>
          </div>
          <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Recurring</div>
            <div className="mt-1 text-2xl font-black tracking-tighter text-stone-950">{recurringCount}</div>
          </div>
          <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Experiences</div>
            <div className="mt-1 text-2xl font-black tracking-tighter text-stone-950">{experienceCount}</div>
          </div>
        </div>
      </motion.section>

      {/* 次要数据区 - 采用 Surface-less 布局 */}
      <div className="grid gap-10 lg:grid-cols-2 pt-4">
        <motion.section variants={itemVariants}>
          <h2 className="px-1 text-xs font-black tracking-widest text-stone-400 uppercase">Distribution</h2>
          <div className="mt-6 space-y-6 px-1">
            {statusDistribution.map((item) => (
              <DataBar
                key={item.label}
                label={item.label}
                value={item.count}
                max={maxStatusCount}
                tone={item.tone}
                valueLabel={`${item.count} 个`}
                onSelect={() => onOpenObjects(item.focus)}
              />
            ))}
          </div>
        </motion.section>

        <motion.section variants={itemVariants}>
          <h2 className="px-1 text-xs font-black tracking-widest text-stone-400 uppercase">Structure</h2>
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
