'use client';

import { useI18n } from '@/core/i18n-context';
import type { ReviewEntry, WYQDObject } from '@/domain/types';
import type { WYQDMembershipState } from '@/core/membership';
import { canUseWYQDProFeature } from '@/core/membership';
import { getTravelExperiences, buildTravelSummary } from '@/domain/travel';
import { TravelStatsStrip } from './TravelStatsStrip';
import { TravelWorldMap } from './TravelWorldMap';
import { TravelTimeline } from './TravelTimeline';
import { TravelProLockedCard } from './TravelProLockedCard';
import { Panel } from '../common/ui-primitives';

export function TravelInsightsPanel({
  objects,
  reviews,
  membership,
  onSelectReview,
  onSelectExperience,
}: {
  objects: WYQDObject[];
  reviews: ReviewEntry[];
  membership: WYQDMembershipState;
  onSelectReview?: (reviewId: string) => void;
  onSelectExperience?: (expId: string) => void;
}) {
  const { t } = useI18n();
  const isPro = canUseWYQDProFeature(membership);
  const travelExperiences = getTravelExperiences(objects);

  if (!isPro) {
    if (travelExperiences.length === 0) {
      return (
        <Panel className="border-dashed border-stone-300">
          <div className="text-center py-6">
            <div className="text-2xl mb-2">🌍</div>
            <h3 className="font-semibold text-stone-900 text-sm">{t('travelDiscoveryTitle')}</h3>
            <p className="text-xs text-stone-500 mt-1">{t('travelDiscoveryDesc')}</p>
          </div>
        </Panel>
      );
    }
    const summary = buildTravelSummary(travelExperiences, reviews);
    return <TravelProLockedCard summary={summary} />;
  }

  if (travelExperiences.length === 0) {
    return (
      <section className="wyqd-travel-panel rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-stone-950">
            {t('travelInsights')}
          </h2>
          <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-semibold text-white">PRO</span>
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center">
          <p className="text-sm text-stone-500">{t('travelNoExperiences')}</p>
          <p className="mt-1 text-xs text-stone-400">{t('travelDiscoveryDesc')}</p>
        </div>
      </section>
    );
  }

  const summary = buildTravelSummary(travelExperiences, reviews);

  return (
    <section className="wyqd-travel-panel rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-stone-950">
          {t('travelInsights')}
        </h2>
        <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-semibold text-white">PRO</span>
      </div>
      <TravelStatsStrip summary={summary} />
      {summary.countries.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-stone-500 hover:text-stone-700">
            {t('travelVisitedCountries')} ({summary.countries.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.countries.map((country) => (
              <span key={country} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                {country}
              </span>
            ))}
          </div>
        </details>
      ) : null}
      <TravelWorldMap experiences={travelExperiences} />
      <TravelTimeline
        experiences={travelExperiences}
        reviews={reviews}
        onSelectReview={onSelectReview}
        onSelectExperience={onSelectExperience}
      />
    </section>
  );
}
