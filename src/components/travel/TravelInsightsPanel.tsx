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

export function TravelInsightsPanel({
  objects,
  reviews,
  membership,
}: {
  objects: WYQDObject[];
  reviews: ReviewEntry[];
  membership: WYQDMembershipState;
}) {
  const { t } = useI18n();
  const isPro = canUseWYQDProFeature(membership);
  const travelExperiences = getTravelExperiences(objects);

  if (travelExperiences.length === 0) return null;

  const summary = buildTravelSummary(travelExperiences, reviews);

  if (!isPro) {
    return <TravelProLockedCard summary={summary} />;
  }

  return (
    <section className="wyqd-travel-panel rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-stone-950">
          {t('travelInsights')}
        </h2>
        <span className="text-xs text-stone-400">{t('travelInsightsDesc')}</span>
      </div>
      <TravelStatsStrip summary={summary} />
      <TravelWorldMap experiences={travelExperiences} />
      <TravelTimeline experiences={travelExperiences} reviews={reviews} />
    </section>
  );
}
