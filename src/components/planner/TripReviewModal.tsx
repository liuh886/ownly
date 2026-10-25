'use client';

import { useMemo, useRef, useState } from 'react';
import { useDialogA11y } from '@/components/common/useDialogA11y';
import { dialogBackdropProps } from '@/components/common/use-dialog-dismiss';
import { parseScore } from '@/lib/format';
import {
  buildTripReviewDraft,
  buildTripReviewStats,
  type TripReviewDraft,
} from '@/domain/trip-review';
import type {
  PlannerTrip,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseItem,
} from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
import type { WYQDStoredEntity } from '@/core/repository';
import type { OneTimeExperienceObject, ReviewEntry } from '@/domain/types';

const COPY = {
  en: {
    title: 'Trip retrospective draft',
    intro: 'Save this trip’s summary and ratings to Reviews. Nothing is saved until you confirm.',
    summaryLabel: 'Review notes (editable)',
    scoresTitle: 'Trip ratings (optional)',
    scoresDesc: 'Optional scores (0–100), shared with Reviews.',
    foodScore: 'Food (0-100)',
    sceneryScore: 'Scenery (0-100)',
    experienceScore: 'Experience (0-100)',
    invalidScore: 'Scores must be between 0 and 100.',
    confirm: 'Confirm & save',
    cancel: 'Cancel',
    saving: 'Saving…',
    actualTotal: 'Actual total',
    noSpend: 'No converted spend',
    destinations: 'Destinations',
    dates: 'Dates',
  },
  zh: {
    title: '行程复盘草稿',
    intro: '总结与评分将保存到这趟旅行的复盘，已有旅行笔记与预算会保留。',
    summaryLabel: '复盘正文（可编辑）',
    scoresTitle: '行程评分评估（可选）',
    scoresDesc: '评分可选；总结与评分在 Planner 和复盘页共用。',
    foodScore: '美食评分 (0-100)',
    sceneryScore: '风景评分 (0-100)',
    experienceScore: '体验评分 (0-100)',
    invalidScore: '评分必须在 0 到 100 之间。',
    confirm: '确认并保存',
    cancel: '取消',
    saving: '保存中…',
    actualTotal: '实际总花费',
    noSpend: '无可折算花费',
    destinations: '目的地',
    dates: '日期',
  },
} as const;

export function TripReviewModal({
  trip,
  places,
  visits,
  legs,
  expenses,
  language,
  busy,
  error,
  onClose,
  onConfirm,
  existingObject,
  existingReview,
}: {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
  expenses: TripExpenseItem[];
  language: 'zh' | 'en';
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (draft: TripReviewDraft) => void;
  existingObject?: WYQDStoredEntity<OneTimeExperienceObject>;
  existingReview?: WYQDStoredEntity<ReviewEntry>;
}) {
  const copy = COPY[language];
  const stats = useMemo(() => buildTripReviewStats(trip, places, visits, legs, expenses), [trip, places, visits, legs, expenses]);
  const draft = useMemo<TripReviewDraft>(
    () => buildTripReviewDraft(trip, stats, { language, budgetTotal: existingObject?.entity.budget_total }),
    [trip, stats, language, existingObject?.entity.budget_total],
  );
  const [baseline] = useState(() => existingObject ? { object: existingObject, review: existingReview } : undefined);
  const actualTotal = (stats.unconvertible.length ? undefined : draft.object.actual_total) ?? baseline?.object.entity.actual_total;
  const [body, setBody] = useState(existingReview?.body ?? [existingObject?.body.trim(), draft.body].filter(Boolean).join('\n\n'));
  const [summary, setSummary] = useState(existingReview?.entity.summary ?? '');
  const [foodScore, setFoodScore] = useState(existingReview?.entity.food_score?.toString() ?? '');
  const [sceneryScore, setSceneryScore] = useState(existingReview?.entity.scenery_score?.toString() ?? '');
  const [experienceScore, setExperienceScore] = useState(existingReview?.entity.experience_score?.toString() ?? '');
  const panelRef = useRef<HTMLElement>(null);

  useDialogA11y({ open: true, onClose, panelRef });

  const invalidScore = [foodScore, sceneryScore, experienceScore].some(
    (value) =>
      value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100),
  );
  const scoreError = invalidScore ? copy.invalidScore : null;

  const handleConfirm = () => {
    if (invalidScore || busy) return;
    const parsedFood = foodScore.trim() === '' ? null : parseScore(foodScore);
    const parsedScenery = sceneryScore.trim() === '' ? null : parseScore(sceneryScore);
    const parsedExperience = experienceScore.trim() === '' ? null : parseScore(experienceScore);
    const hasAnyScore = parsedFood != null || parsedScenery != null || parsedExperience != null;

    onConfirm({
      language,
      object: {
        ...draft.object,
        actual_total: stats.unconvertible.length ? undefined : draft.object.actual_total,
      },
      body,
      baseline,
      scores: hasAnyScore || baseline
        ? {
            foodScore: parsedFood,
            sceneryScore: parsedScenery,
            experienceScore: parsedExperience,
            ...(baseline ? { summary } : {}),
          }
        : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm" {...dialogBackdropProps(onClose)}>
      <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={copy.title} className="max-h-[calc(100vh-4rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{copy.title} — {trip.title}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{copy.intro}</p>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}

        <dl className="mt-4 space-y-1 text-xs text-stone-600">
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-stone-800">{copy.dates}</dt>
            <dd>{trip.start_date} → {trip.end_date}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-stone-800">{copy.destinations}</dt>
            <dd>{(trip.destinations ?? []).join(', ') || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-stone-800">{copy.actualTotal}</dt>
            <dd>
              {actualTotal !== undefined
                ? `${trip.currency || 'CNY'} ${actualTotal}`
                : copy.noSpend}
            </dd>
          </div>
        </dl>

        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <label className="text-xs font-semibold text-stone-900">{copy.scoresTitle}</label>
            <span className="text-[11px] text-stone-500">{copy.scoresDesc}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="trip-food-score" className="block text-[11px] font-medium text-stone-600 mb-1">{copy.foodScore}</label>
              <input
                id="trip-food-score"
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={foodScore}
                onChange={(e) => setFoodScore(e.target.value)}
                placeholder="0-100"
                disabled={busy}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900"
              />
            </div>
            <div>
              <label htmlFor="trip-scenery-score" className="block text-[11px] font-medium text-stone-600 mb-1">{copy.sceneryScore}</label>
              <input
                id="trip-scenery-score"
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={sceneryScore}
                onChange={(e) => setSceneryScore(e.target.value)}
                placeholder="0-100"
                disabled={busy}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900"
              />
            </div>
            <div>
              <label htmlFor="trip-experience-score" className="block text-[11px] font-medium text-stone-600 mb-1">{copy.experienceScore}</label>
              <input
                id="trip-experience-score"
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={experienceScore}
                onChange={(e) => setExperienceScore(e.target.value)}
                placeholder="0-100"
                disabled={busy}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900"
              />
            </div>
          </div>
          {scoreError ? <p role="alert" className="mt-2 text-xs text-red-600">{scoreError}</p> : null}
        </div>

        {baseline ? (
          <div className="mt-4">
            <label htmlFor="trip-review-summary" className="block text-xs font-medium text-stone-800">{language === 'zh' ? '一句话总结' : 'Summary'}</label>
            <input id="trip-review-summary" value={summary} onChange={(event) => setSummary(event.target.value)} disabled={busy}
              className="mt-1 min-h-10 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
          </div>
        ) : null}
        <label className="mt-4 block text-xs font-medium text-stone-800" htmlFor="trip-review-body">
          {copy.summaryLabel}
        </label>
        <textarea
          id="trip-review-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={12}
          disabled={busy}
          className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50/60 p-3 font-mono text-base leading-5 text-stone-800 outline-none focus:border-stone-900 focus:bg-white disabled:opacity-60 sm:text-xs"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs font-medium text-stone-500 hover:text-stone-900 disabled:opacity-40"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || invalidScore}
            className="min-h-10 rounded-lg bg-stone-950 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:bg-stone-300"
          >
            {busy ? copy.saving : copy.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
