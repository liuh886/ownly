'use client';

import { useMemo, useState } from 'react';
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

const COPY = {
  en: {
    title: 'Trip retrospective draft',
    intro: 'This draft creates a travel experience object. Nothing is saved until you confirm.',
    summaryLabel: 'Summary (editable)',
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
    intro: '该草稿将生成一条旅行经历对象。确认之前不会写入任何数据。',
    summaryLabel: '摘要（可编辑）',
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
  onClose,
  onConfirm,
}: {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
  expenses: TripExpenseItem[];
  language: 'zh' | 'en';
  busy: boolean;
  onClose: () => void;
  onConfirm: (draft: TripReviewDraft) => void;
}) {
  const copy = COPY[language];
  const draft = useMemo<TripReviewDraft>(
    () => buildTripReviewDraft(trip, buildTripReviewStats(trip, places, visits, legs, expenses), { language }),
    [trip, places, visits, legs, expenses, language],
  );
  const [body, setBody] = useState(draft.body);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-label={copy.title} className="max-h-[calc(100vh-4rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-stone-950">{copy.title} — {trip.title}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{copy.intro}</p>

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
              {draft.object.actual_total !== undefined
                ? `${trip.currency || 'CNY'} ${draft.object.actual_total}`
                : copy.noSpend}
            </dd>
          </div>
        </dl>

        <label className="mt-4 block text-xs font-medium text-stone-800" htmlFor="trip-review-body">
          {copy.summaryLabel}
        </label>
        <textarea
          id="trip-review-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={14}
          disabled={busy}
          className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50/60 p-3 font-mono text-xs leading-5 text-stone-800 outline-none focus:border-stone-900 focus:bg-white disabled:opacity-60"
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
            onClick={() => onConfirm({ object: draft.object, body })}
            disabled={busy}
            className="min-h-10 rounded-lg bg-stone-950 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:bg-stone-300"
          >
            {busy ? copy.saving : copy.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
