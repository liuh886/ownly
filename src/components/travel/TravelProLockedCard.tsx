'use client';

import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { useFormatMoney } from '@/lib/use-format';
import type { TravelSummary } from '@/domain/travel';

export function TravelProLockedCard({ summary }: { summary: TravelSummary }) {
  const { t } = useI18n();
  const { openLicenseModal } = useOwnlyWorkspace();
  const { formatMoney } = useFormatMoney();

  return (
    <div className="wyqd-pro-entry rounded-xl border border-stone-200 bg-white p-5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-stone-950">{t('travelProLockedTitle')}</div>
        <p className="mt-1 text-xs text-stone-500">{t('travelProLockedDesc')}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-600">
          <span>{summary.countriesVisited} {t('travelCountriesVisited').toLowerCase()}</span>
          <span>{summary.totalTrips} {t('travelTotalTrips').toLowerCase()}</span>
          <span>{formatMoney(summary.totalSpend)} {t('travelTotalSpend').toLowerCase()}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={openLicenseModal}
        className="wyqd-bar-btn mt-3 shrink-0 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white sm:mt-0"
      >
        {t('travelProLockedCta')}
      </button>
    </div>
  );
}
