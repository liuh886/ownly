'use client';

import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import type { TravelSummary } from '@/domain/travel';

export function TravelStatsStrip({ summary }: { summary: TravelSummary }) {
  const { t } = useI18n();
  const { formatMoney } = useFormatMoney();

  const stats = [
    { label: t('travelCountriesVisited'), value: String(summary.countriesVisited) },
    { label: t('travelCitiesVisited'), value: String(summary.citiesVisited) },
    { label: t('travelTotalSpend'), value: formatMoney(summary.totalSpend) },
    { label: t('travelAvgSpend'), value: formatMoney(summary.avgSpendPerTrip) },
    { label: t('travelAvgFood'), value: formatRank(summary.avgFoodRank) },
    { label: t('travelAvgScenery'), value: formatRank(summary.avgSceneryRank) },
    { label: t('travelAvgExperience'), value: formatRank(summary.avgExperienceRank) },
    { label: t('travelReviewed'), value: String(summary.reviewedCount) },
  ];

  return (
    <div className="wyqd-travel-stats mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-stone-500">
            {stat.label}
          </div>
          <div className="mt-2 font-mono text-lg font-semibold tracking-tight text-stone-950">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRank(value: number | null) {
  if (value == null) return '-';
  return value.toFixed(1);
}
