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

function formatDailyMoney(value: number): string {
  if (!Number.isFinite(value)) return '¥0/日';
  if (value > 0 && value < 1) return `¥${value.toFixed(2)}/日`;
  return `${formatMoney(value)}/日`;
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
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
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
      className="group rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
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
      <div className="mt-1 text-xs leading-5 text-stone-500">{detail}</div>
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
  const trendSnapshots = getSnapshotTrend(snapshots);
  const trendValues = trendSnapshots.map((snapshot) => snapshot.net_worth || 0);
  const trendPoints = buildSparklinePoints(trendValues);
  const costBreakdown = getCostBreakdown(objects);
  const maxCost = Math.max(...costBreakdown.map((item) => item.value), 0);
  const statusDistribution = getObjectStatusDistribution(objects);
  const maxStatusCount = Math.max(...statusDistribution.map((item) => item.count), 0);
  const upcomingRecurringCosts = getUpcomingRecurringCosts(objects);
  const pendingExperienceReviews = getPendingExperienceReviews(objects);
  const highestDailyCost = getHighestDailyCostObject(objects);
  const largestRecurringCost = getLargestActiveRecurringCost(objects);
  const latestSnapshot = getLatestSnapshot(snapshots);
  const physicalCount = objects.filter((object) => object.object_type === 'physical').length;
  const recurringCount = objects.filter((object) => object.object_type === 'recurring_cost').length;
  const experienceCount = objects.filter((object) => object.object_type === 'one_time_experience').length;
  const actionCount = upcomingRecurringCosts.length + pendingExperienceReviews.length;
  const dailyFixedCost = metrics.monthlyFixedCost / 30.44;
  const annualFixedCost = metrics.monthlyFixedCost * 12;
  const fixedCostHint = `${formatDailyMoney(dailyFixedCost)} · ${formatMoney(annualFixedCost)}/年`;

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.section variants={itemVariants} className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-stone-950 p-4 text-white shadow-sm lg:col-span-1">
          <div className="text-xs font-medium text-stone-400">今日行动</div>
          <div className="mt-3 font-mono text-3xl font-semibold tracking-tight">
            {actionCount}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-400">
            需要关注的扣费与复盘事项
          </div>
        </div>
        <ActionCard
          label="账户"
          title="记录账户快照"
          detail={`${snapshots.length} 次历史快照，继续补齐净资产曲线`}
          onSelect={() => onNavigate('accounts')}
        />
        <ActionCard
          label="物欲"
          title="捕获新对象"
          detail={`${objects.length} 个对象已入库，继续沉淀实物、订阅和体验`}
          onSelect={() => onNavigate('objects')}
        />
        <ActionCard
          label="复盘"
          title="整理体验排行"
          detail={`${pendingExperienceReviews.length} 个体验待复盘，更新美食、风景、体验排位`}
          onSelect={() => onNavigate('reviews')}
        />
      </motion.section>

      {/* 核心指标区块 */}
      <motion.section
        variants={itemVariants}
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
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
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-950">净资产趋势</h2>
                <p className="mt-1 text-xs text-stone-500">
                  最近 {trendSnapshots.length} 次快照
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

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="月均固定成本"
            value={formatMoney(metrics.monthlyFixedCost)}
            hint={fixedCostHint}
          />
          <MetricCard label="实物资产" value={`${metrics.ownedPhysicalCount} 件`} />
          <MetricCard label="订阅服务" value={`${metrics.activeSubscriptionCount} 个`} />
          <MetricCard label="观察金额" value={formatMoney(metrics.observingDesireAmount)} />
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="grid gap-3 md:grid-cols-3">
        <InsightCard
          label="最高日均成本"
          title={highestDailyCost?.object.title || '暂无可计算实物'}
          value={highestDailyCost ? formatMoney(highestDailyCost.dailyCost) : '暂无'}
          detail={highestDailyCost ? '点击查看实物' : '录入购买日期后生成'}
          onSelect={
            highestDailyCost
              ? () => onOpenObjects({ typeFilter: 'physical', statusGroupFilter: 'using' })
              : undefined
          }
        />
        <InsightCard
          label="最大月固定成本"
          title={largestRecurringCost?.object.title || '暂无订阅成本'}
          value={largestRecurringCost ? formatMoney(largestRecurringCost.monthlyCost) : '暂无'}
          detail={largestRecurringCost ? '点击查看订阅' : '录入固定成本后生成'}
          onSelect={
            largestRecurringCost
              ? () => onOpenObjects({ typeFilter: 'recurring_cost', statusGroupFilter: 'using' })
              : undefined
          }
        />
        <InsightCard
          label="最新账户快照"
          title={latestSnapshot?.snapshot_at || '暂无账户快照'}
          value={latestSnapshot ? formatMoney(latestSnapshot.net_worth ?? null) : '暂无'}
          detail={latestSnapshot ? '净资产' : '到账户页记录'}
        />
      </motion.section>

      {/* 近期关注 (Action Center) - 回归克制风格 */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-stone-950">近期关注</h2>
          <span className="text-xs text-stone-500">
            {upcomingRecurringCosts.length + pendingExperienceReviews.length} 项
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {upcomingRecurringCosts.map(({ object, nextBillingDate }) => (
            <button
              key={object.id}
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'recurring_cost', statusGroupFilter: 'using' })}
              className="group relative flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <div className="text-sm font-bold text-stone-900">{object.title}</div>
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  下次 {nextBillingDate} · {formatDueLabel(nextBillingDate)}
                </div>
              </div>
              <div className="shrink-0 font-mono text-xs font-semibold text-stone-900">
                {formatCompactMoney(object.billing_amount || 0)}
              </div>
            </button>
          ))}
          {pendingExperienceReviews.map((object) => (
            <button
              key={object.id}
              type="button"
              onClick={() => onOpenObjects({ typeFilter: 'one_time_experience', statusGroupFilter: 'exited' })}
              className="group relative flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <div className="text-sm font-bold text-stone-900">{object.title}</div>
                </div>
                <div className="mt-1 text-xs text-stone-500">待复盘</div>
              </div>
              <div className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-600">复盘</div>
            </button>
          ))}
          {upcomingRecurringCosts.length === 0 && pendingExperienceReviews.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 py-8 text-center sm:col-span-2">
              <p className="text-xs font-medium text-stone-500">暂无近期待处理事项</p>
            </div>
          ) : null}
        </div>
      </motion.section>

      {/* 数据规模 (Data Scale) */}
      <motion.section variants={itemVariants} className="space-y-4 pt-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-stone-950">数据规模</h2>
          <span className="text-xs text-stone-500">
            {objects.length} 个对象
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-stone-500">账户快照</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{snapshots.length}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-stone-500">实物</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{physicalCount}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-stone-500">固定成本</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{recurringCount}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-stone-500">体验</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">{experienceCount}</div>
          </div>
        </div>
      </motion.section>

      {/* 次要数据区 - 采用 Surface-less 布局 */}
      <div className="grid gap-10 lg:grid-cols-2 pt-4">
        <motion.section variants={itemVariants}>
          <h2 className="px-1 text-sm font-semibold text-stone-950">状态分布</h2>
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
          <h2 className="px-1 text-sm font-semibold text-stone-950">成本结构</h2>
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
