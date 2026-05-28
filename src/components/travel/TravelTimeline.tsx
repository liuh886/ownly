'use client';

import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';
import { useFormatMoney } from '@/lib/use-format';
import type { OneTimeExperienceObject, ReviewEntry } from '@/domain/types';

function getStatusBadge(status: string, t: (key: WYQDTranslationKey) => string): { label: string; className: string } {
  switch (status) {
    case 'planned':
      return { label: t('statusPlanned'), className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' };
    case 'in_progress':
      return { label: t('statusInProgress'), className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
    case 'completed':
      return { label: t('statusCompleted'), className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
    case 'reviewed':
      return { label: t('statusReviewed'), className: 'bg-stone-100 text-stone-600 ring-1 ring-stone-200' };
    default:
      return { label: status, className: 'bg-stone-100 text-stone-500 ring-1 ring-stone-200' };
  }
}

export function TravelTimeline({
  experiences,
  reviews,
}: {
  experiences: OneTimeExperienceObject[];
  reviews: ReviewEntry[];
}) {
  const { t } = useI18n();
  const { formatMoney } = useFormatMoney();

  const sorted = [...experiences].sort((a, b) => {
    const dateA = a.ended_at || a.started_at || a.created_at || '';
    const dateB = b.ended_at || b.started_at || b.created_at || '';
    return dateB.localeCompare(dateA);
  });

  const reviewMap = new Map<string, ReviewEntry>();
  for (const review of reviews) {
    if (review.target_id) reviewMap.set(review.target_id, review);
  }

  return (
    <div className="wyqd-travel-timeline mt-5">
      <h3 className="text-sm font-semibold tracking-tight text-stone-950">{t('travelTimeline')}</h3>
      <div className="mt-3 space-y-2">
        {sorted.map((exp) => {
          const review = reviewMap.get(exp.id);
          const location = [exp.location?.city, exp.location?.country].filter(Boolean).join(', ');
          const date = exp.ended_at || exp.started_at || '';
          const amount = exp.actual_total || exp.budget_total || 0;
          const badge = getStatusBadge(exp.status, t);

          return (
            <div
              key={exp.id}
              className="wyqd-travel-timeline-entry flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-950 truncate">{exp.title}</span>
                  <span className={`wyqd-status-badge wyqd-status-badge--${exp.status} shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  {location ? <span>{location}</span> : null}
                  {date ? <span>{date}</span> : null}
                </div>
                {review ? (
                  <div className="mt-1 flex gap-2 text-[11px] text-stone-500">
                    {review.food_rank != null ? <span>{t('travelAvgFood')} {review.food_rank}</span> : null}
                    {review.scenery_rank != null ? <span>{t('travelAvgScenery')} {review.scenery_rank}</span> : null}
                    {review.experience_rank != null ? <span>{t('travelAvgExperience')} {review.experience_rank}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 font-mono text-sm font-semibold text-stone-950">
                {formatMoney(amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
