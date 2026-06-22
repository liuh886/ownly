import { useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import { MetricCard } from './MetricCard';
import { useFormatMoney } from '@/lib/use-format';
import { useI18n } from '@/core/i18n-context';
import type { HomeMetrics, AccountSnapshot } from '@/domain/types';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import { calculateNetWorth } from '@/domain/calculations';

import { buildDualLinePoints } from './homeDashboardUtils';

export function HomeOwnSection({
  metrics,
  snapshots,
  itemVariants,
}: {
  metrics: HomeMetrics;
  snapshots: AccountSnapshot[];
  itemVariants: Variants;
}) {
  const { t } = useI18n();
  const { formatMoney, formatCompactMoney, formatDelta } = useFormatMoney();

  const latestSnapshot = useMemo(() => {
    return [...snapshots]
      .map(calculateNetWorth)
      .sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))[0] || null;
  }, [snapshots]);

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

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('ownGroup')}</h3>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={CARD_CLASS}>
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
          <div className={CARD_CLASS}>
            <svg viewBox="-2 0 124 52" role="img" aria-label={`${t('netWorthTrend')} / ${t('fixedCostTrend')}`} className="h-24 w-full overflow-visible">
              <text x="7" y="7" textAnchor="end" fontSize="5" fill="#a8a29e" fontFamily="ui-monospace, monospace">
                {formatCompactMoney(netWorthMax)}
              </text>
              <text x="7" y="46" textAnchor="end" fontSize="5" fill="#a8a29e" fontFamily="ui-monospace, monospace">
                {formatCompactMoney(netWorthMin)}
              </text>
              <text x="115" y="7" textAnchor="start" fontSize="5" fill="#f59e0b" fontFamily="ui-monospace, monospace">
                {formatMoney(fixedCostMax)}
              </text>
              <text x="115" y="46" textAnchor="start" fontSize="5" fill="#f59e0b" fontFamily="ui-monospace, monospace">
                {formatMoney(fixedCostMin)}
              </text>
              <line x1="10" y1="4" x2="110" y2="4" stroke="#e7e5e4" strokeWidth="0.3" />
              <line x1="10" y1="24" x2="110" y2="24" stroke="#e7e5e4" strokeWidth="0.3" />
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
              {netWorthPoints.split(' ').map((point, i) => {
                const [cx, cy] = point.split(',').map(Number);
                const date = trendSnapshots[i]?.snapshot_at || '';
                const value = formatCompactMoney(netWorthTrendValues[i] || 0);
                const isMonthEnd = Boolean(trendSnapshots[i]?.is_month_end);
                return (
                  <motion.circle
                    key={`nw-${i}`}
                    cx={cx}
                    cy={cy}
                    r={isMonthEnd ? '3.5' : '2.5'}
                    fill={isMonthEnd ? '#1c1917' : 'white'}
                    stroke="#1c1917"
                    strokeWidth="1.5"
                    className="cursor-pointer"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6 + i * 0.06 }}
                  >
                    <title>{`${date} · ${t('accountNetWorth')}: ${value}${isMonthEnd ? ` · ${t('monthEndSnapshot')}` : ''}`}</title>
                  </motion.circle>
                );
              })}
              {fixedCostPoints.split(' ').map((point, i) => {
                const [cx, cy] = point.split(',').map(Number);
                const date = trendSnapshots[i]?.snapshot_at || '';
                const value = formatMoney(fixedCostTrendValues[i] || 0);
                const isMonthEnd = Boolean(trendSnapshots[i]?.is_month_end);
                return (
                  <motion.circle
                    key={`fc-${i}`}
                    cx={cx}
                    cy={cy}
                    r={isMonthEnd ? '3' : '2'}
                    fill={isMonthEnd ? '#f59e0b' : 'white'}
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    className="cursor-pointer"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.9 + i * 0.06 }}
                  >
                    <title>{`${date} · ${t('fixedCostTrend')}: ${value}${isMonthEnd ? ` · ${t('monthEndSnapshot')}` : ''}`}</title>
                  </motion.circle>
                );
              })}
            </svg>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 items-stretch">
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('physicalAsset')}（{metrics.ownedPhysicalCount}）</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">
            {formatMoney(metrics.physicalResidualValue)}
          </div>
        </div>
        <div className={CARD_CLASS}>
          <div className="text-xs font-medium text-stone-500">{t('subscriptionService')}</div>
          <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-stone-950">{metrics.activeSubscriptionCount}</div>
        </div>
        <div className={CARD_CLASS}>
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
  );
}
