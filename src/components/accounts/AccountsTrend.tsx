import { motion } from 'framer-motion';
import type { AccountSnapshot } from '@/domain/types';
import type { WYQDTranslationKey } from '@/core/i18n';

export interface AccountsTrendProps {
  trendSnapshots: AccountSnapshot[];
  trendValues: number[];
  trendPoints: string;
  fixedCostTrendValues: number[];
  fixedCostTrendPoints: string;
  latestFixedCost: number;
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (val: number | null | undefined, fallback?: string) => string;
  formatCompactMoney: (val: number) => string;
}

export function AccountsTrend({
  trendSnapshots,
  trendValues,
  trendPoints,
  fixedCostTrendValues,
  fixedCostTrendPoints,
  latestFixedCost,
  t,
  formatMoney,
  formatCompactMoney,
}: AccountsTrendProps) {
  return (
    <>
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('netWorthHistory')}</h2>
            <p className="mt-1 text-xs text-stone-400">
              {t('recentSnapshotsN').replace('{count}', String(trendSnapshots.length))}
            </p>
          </div>
          {trendValues.length > 0 ? (
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-stone-950">
                {formatCompactMoney(trendValues[trendValues.length - 1] || 0)}
              </div>
              <div className="text-xs text-stone-400">{t('latestNetWorth')}</div>
            </div>
          ) : null}
        </div>
        {trendSnapshots.length > 0 ? (
          <div className="mt-4">
            <svg viewBox="0 0 100 48" role="img" aria-label={t('netWorthChartAriaLabel')} className="h-28 w-full">
              <motion.polyline
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
                fill="none"
                points={trendPoints}
                stroke="rgb(28 25 23)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              {trendValues.map((value, index) => {
                const [x, y] = trendPoints.split(' ')[index].split(',').map(Number);
                const date = trendSnapshots[index]?.snapshot_at || '';
                const formattedValue = formatCompactMoney(value);
                return (
                  <motion.circle
                    key={`${trendSnapshots[index].id}-${value}`}
                    cx={x}
                    cy={y}
                    fill="white"
                    r="2.5"
                    stroke="rgb(28 25 23)"
                    strokeWidth="1.5"
                    className="cursor-pointer"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.06 }}
                  >
                    <title>{`${date} · ${formattedValue}`}</title>
                  </motion.circle>
                );
              })}
            </svg>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-400">
              <span>{trendSnapshots[0]?.snapshot_at}</span>
              <span>{trendSnapshots[trendSnapshots.length - 1]?.snapshot_at}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
            {t('multipleSnapshotsForTrend')}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('fixedCostHistory')}</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {t('fixedCostAccountPressureDesc')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-stone-950">
              {formatMoney(latestFixedCost)}
            </div>
            <div className="text-xs text-stone-400">{t('monthlyDeduction')}</div>
          </div>
        </div>

        {trendSnapshots.length > 1 ? (
          <div className="mt-4">
            <svg
              viewBox="0 0 100 48"
              role="img"
              aria-label={t('fixedCostHistory')}
              className="h-28 w-full"
            >
              <motion.polyline
                points={fixedCostTrendPoints}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              />
              {fixedCostTrendPoints.split(' ').map((point, index) => {
                const [cx, cy] = point.split(',').map(Number);
                const date = trendSnapshots[index]?.snapshot_at || '';
                const value = formatMoney(fixedCostTrendValues[index] || 0);
                return (
                  <motion.circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r="2.5"
                    fill="white"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    className="cursor-pointer"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.08 }}
                  >
                    <title>{`${date} · ${value}`}</title>
                  </motion.circle>
                );
              })}
            </svg>
            <div className="mt-2 flex justify-between text-[11px] text-stone-400">
              <span>{trendSnapshots[0]?.snapshot_at}</span>
              <span>{trendSnapshots[trendSnapshots.length - 1]?.snapshot_at}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
            {t('multipleSnapshotsForTrend')}
          </p>
        )}
      </div>
    </>
  );
}
