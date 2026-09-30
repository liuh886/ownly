'use client';

/**
 * First-run guide.
 *
 * One dialog, two steps, in the order a new user actually needs them:
 *
 *   1. the mental model — Capture → Collection → Planner, in one sentence;
 *   2. the first real record — or a Sample Trip, if reading a finished
 *      itinerary teaches more than filling in a form.
 *
 * This replaces two dialogs that used to open on the same empty state. The
 * storage step is deliberately not here: it belongs to the shell, which owns the
 * directory picker and the privacy copy.
 */
import { useRef, useState } from 'react';
import { useDialogA11y } from '@/components/common/useDialogA11y';
import { useI18n } from '@/core/i18n-context';
import { getFirstRunCopy } from '@/core/first-run-copy';
import type { FirstRunStep } from '@/core/first-run';
import { allSampleTrips, type SampleTripId } from '@/data/sample-trips/registry';
import { trackFirstEver, trackOwnlyEvent } from '@/lib/analytics';
import { loadSampleTrip } from '@/services/loadSampleTrip';

export interface FirstRunGuideProps {
  open: boolean;
  /** First step to land on. `null` while closed. */
  step: FirstRunStep | null;
  onChoose: (choice: 'physical' | 'recurring_cost' | 'experience') => void;
  onSampleLoaded: () => void;
  onDismiss: () => void;
}

export function FirstRunGuide({ open, step, onChoose, onSampleLoaded, onDismiss }: FirstRunGuideProps) {
  const { language } = useI18n();
  const copy = getFirstRunCopy(language);
  const panelRef = useRef<HTMLElement>(null);

  const [internalStep, setInternalStep] = useState<FirstRunStep>(step ?? 'model');
  const [busyId, setBusyId] = useState<SampleTripId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDialogA11y({ open, onClose: onDismiss, panelRef });

  if (!open || !step) return null;
  // The orchestrator owns the entry step. `model` always wins, so re-opening
  // for a user who never advanced replays the lesson rather than stranding them.
  const active: FirstRunStep = step === 'model' ? 'model' : internalStep;

  const handleSample = async (id: SampleTripId) => {
    setBusyId(id);
    setError(null);
    try {
      await loadSampleTrip(id);
      trackOwnlyEvent('sample_trip_loaded', { id });
      trackFirstEver('first_trip', 'first_trip_created', { source: 'sample' });
      onSampleLoaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-4 backdrop-blur-sm sm:py-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        ref={panelRef}
        tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl sm:max-h-[calc(100vh-4rem)]"
      >
        <div className="border-b border-stone-100 bg-gradient-to-br from-stone-50 to-emerald-50/40 px-6 py-6 sm:px-8">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {active === 'model' ? copy.eyebrowModel : copy.eyebrowRecord}
            </p>
            <ol className="ml-auto flex items-center gap-1.5" aria-label={copy.progressLabel}>
              <li aria-hidden="true" className={`h-1.5 w-6 rounded-full ${active === 'model' ? 'bg-emerald-600' : 'bg-stone-200'}`} />
              <li aria-hidden="true" className={`h-1.5 w-6 rounded-full ${active === 'first-record' ? 'bg-emerald-600' : 'bg-stone-200'}`} />
            </ol>
          </div>
          <h2 id="first-run-title" className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
            {active === 'model' ? copy.modelTitle : copy.recordTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {active === 'model' ? copy.modelDescription : copy.recordDescription}
          </p>
        </div>

        {active === 'model' ? (
          <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8">
            {copy.model.map((card) => (
              <div key={card.title} className="flex min-h-44 flex-col rounded-xl border border-stone-200 bg-white p-5">
                <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-lg">
                  {card.icon}
                </span>
                <span className="mt-4 text-sm font-semibold text-stone-950">{card.title}</span>
                <span className="mt-2 text-xs leading-5 text-stone-600">{card.body}</span>
                <span className="mt-auto pt-4 text-[11px] text-stone-500">{card.example}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(copy.choices) as Array<'physical' | 'recurring_cost' | 'experience'>).map((choice) => {
                const item = copy.choices[choice];
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => onChoose(choice)}
                    className="group flex min-h-44 flex-col rounded-xl border border-stone-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md"
                  >
                    <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-lg font-semibold text-stone-700 transition group-hover:bg-emerald-600 group-hover:text-white">
                      {copy.choiceIcons[choice]}
                    </span>
                    <span className="mt-4 text-sm font-semibold text-stone-950">{item.title}</span>
                    <span className="mt-2 text-xs leading-5 text-stone-600">{item.description}</span>
                    <span className="mt-auto pt-4 text-[11px] text-stone-500">{item.example}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
              <p className="text-xs font-semibold text-stone-900">{copy.sampleTitle}</p>
              <p className="mt-1 text-[11px] leading-5 text-stone-600">{copy.sampleBody}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {allSampleTrips().map((summary) => (
                  <button
                    key={summary.id}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void handleSample(summary.id)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-900 hover:text-stone-950 disabled:opacity-50"
                  >
                    <span aria-hidden="true">{summary.emoji}</span>
                    {busyId === summary.id ? copy.loading : summary.title}
                  </button>
                ))}
              </div>
              {error ? <p role="alert" className="mt-2 text-[11px] text-rose-700">⚠️ {copy.error} {error}</p> : null}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-5 sm:px-8">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900"
          >
            {copy.dismiss}
          </button>
          {active === 'model' ? (
            <button
              type="button"
              onClick={() => setInternalStep('first-record')}
              className="min-h-11 rounded-lg bg-stone-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              {copy.modelNext}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
