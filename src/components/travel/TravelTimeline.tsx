'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';
import { useFormatMoney } from '@/lib/use-format';
import { formatLocalizedDate } from '@/lib/format';
import { countryCodeToFlag, calculateDaysBetween } from '@/domain/travel';
import type { OneTimeExperienceObject, ReviewEntry } from '@/domain/types';

/* ── Status → node color ───────────────────────────────── */

const NODE_COLORS: Record<string, string> = {
  planned: 'bg-blue-400',
  in_progress: 'bg-amber-400',
  completed: 'bg-emerald-400',
  reviewed: 'bg-stone-400',
};

const BADGE_STYLES: Record<string, string> = {
  planned: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  reviewed: 'bg-stone-100 text-stone-600 ring-1 ring-stone-200',
};

function getStatusLabel(status: string, t: (key: WYQDTranslationKey) => string): string {
  switch (status) {
    case 'planned': return t('statusPlanned');
    case 'in_progress': return t('statusInProgress');
    case 'completed': return t('statusCompleted');
    case 'reviewed': return t('statusReviewed');
    default: return status;
  }
}

/* ── Score bar ──────────────────────────────────────────── */

function ScoreBar({ label, score, color }: { label: string; score: number | null; color: string }) {
  if (score == null) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-stone-500">{label}</span>
        <span className="text-[10px] font-mono font-medium text-stone-600">{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */

export function TravelTimeline({
  experiences,
  reviews,
}: {
  experiences: OneTimeExperienceObject[];
  reviews: ReviewEntry[];
}) {
  const { t, language } = useI18n();
  const { formatMoney } = useFormatMoney();

  /* Group by year, sorted newest-first */
  const grouped = useMemo(() => {
    const sorted = [...experiences].sort((a, b) => {
      const dateA = a.ended_at || a.started_at || a.created_at || '';
      const dateB = b.ended_at || b.started_at || b.created_at || '';
      return dateB.localeCompare(dateA);
    });

    const map = new Map<number, OneTimeExperienceObject[]>();
    for (const exp of sorted) {
      const raw = exp.ended_at || exp.started_at || exp.created_at || '';
      const year = raw.length >= 4 ? Number(raw.slice(0, 4)) : 0;
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(exp);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [experiences]);

  const reviewMap = useMemo(() => {
    const m = new Map<string, ReviewEntry>();
    for (const r of reviews) {
      if (r.target_id) m.set(r.target_id, r);
    }
    return m;
  }, [reviews]);

  return (
    <div className="wyqd-travel-timeline mt-5">
      <h3 className="text-sm font-semibold tracking-tight text-stone-950">
        {t('travelTimeline')}
      </h3>

      <div className="relative mt-4 ml-3">
        {/* Vertical timeline spine */}
        <div className="absolute left-[7px] top-0 bottom-0 w-px bg-stone-200" />

        {grouped.map(([year, items]) => (
          <div key={year} className="relative">
            {/* Year divider */}
            {year > 0 && (
              <div className="relative flex items-center gap-3 pb-4">
                <div className="absolute left-0 z-10 h-[15px] w-[15px] rounded-full border-2 border-stone-300 bg-white" />
                <span className="ml-6 text-xs font-semibold text-stone-400 tracking-wide">
                  {year}
                </span>
              </div>
            )}

            {/* Experience cards */}
            {items.map((exp, i) => {
              const review = reviewMap.get(exp.id);
              const flag = countryCodeToFlag(exp.location?.country_code);
              const cityCountry = [exp.location?.city, exp.location?.country]
                .filter(Boolean)
                .join(', ');
              const days = calculateDaysBetween(exp.started_at, exp.ended_at);
              const budget = exp.budget_total || 0;
              const actual = exp.actual_total || 0;
              const hasBudgetData = budget > 0 || actual > 0;
              const tags = exp.worldview_tags || [];

              return (
                <motion.div
                  key={exp.id}
                  className="relative pl-6 pb-4"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                >
                  {/* Node dot */}
                  <div
                    className={`absolute left-0 top-3.5 z-10 h-[15px] w-[15px] rounded-full border-[3px] border-white ${NODE_COLORS[exp.status] || 'bg-stone-300'}`}
                  />

                  {/* Card */}
                  <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {flag && <span className="text-lg leading-none">{flag}</span>}
                          <span className="text-sm font-semibold text-stone-950 truncate">
                            {exp.title}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE_STYLES[exp.status] || 'bg-stone-100 text-stone-500'}`}
                          >
                            {getStatusLabel(exp.status, t)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
                          {cityCountry && <span>{cityCountry}</span>}
                          {days != null && (
                            <>
                              <span className="text-stone-300">·</span>
                              <span>{t('travelDays').replace('{count}', String(days))}</span>
                            </>
                          )}
                          {exp.ended_at && (
                            <>
                              <span className="text-stone-300">·</span>
                              <span>{formatLocalizedDate(exp.ended_at, language)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Amount */}
                      {(actual > 0 || budget > 0) && (
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-sm font-semibold text-stone-950">
                            {formatMoney(actual || budget)}
                          </div>
                          {hasBudgetData && actual > 0 && budget > 0 && (
                            <div className="text-[10px] text-stone-400">
                              {t('travelBudgetVsActual')
                                .replace('{actual}', formatMoney(actual) || '')
                                .replace('{budget}', formatMoney(budget) || '')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Score bars (only if reviewed) */}
                    {review && (
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <ScoreBar
                          label={t('travelAvgFood')}
                          score={review.food_score ?? null}
                          color="bg-orange-400"
                        />
                        <ScoreBar
                          label={t('travelAvgScenery')}
                          score={review.scenery_score ?? null}
                          color="bg-sky-400"
                        />
                        <ScoreBar
                          label={t('travelAvgExperience')}
                          score={review.experience_score ?? null}
                          color="bg-violet-400"
                        />
                      </div>
                    )}

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}

        {/* Empty state */}
        {grouped.length === 0 && (
          <div className="pl-6 text-sm text-stone-400">{t('travelNoExperiences')}</div>
        )}
      </div>
    </div>
  );
}
