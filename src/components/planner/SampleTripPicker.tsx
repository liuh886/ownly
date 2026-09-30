'use client';

/**
 * Sample Trip picker.
 *
 * Rendered on the Planner's empty state. Its whole job is to replace an
 * abstract form with something a new user can read in five seconds, so the
 * cards state exactly what will arrive (days, stops, research-pool size) and
 * say up front that nothing is written until a click.
 *
 * Governance: loading is always deliberate. There is no auto-seed path, and a
 * loaded trip carries the `sample` tag plus a one-tap delete in Trip management.
 */
import { useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import { getSampleTripCopy } from '@/core/sample-trip-copy';
import { localizeSampleTrip, type SampleTripId, type SampleTripSummary } from '@/data/sample-trips/registry';
import { trackFirstEver, trackOwnlyEvent } from '@/lib/analytics';
import { loadSampleTrip } from '@/services/loadSampleTrip';

export interface SampleTripPickerProps {
  summaries: SampleTripSummary[];
  onLoaded: (tripId: string) => void;
  onDismiss: () => void;
  /** Renders a compact single-link variant for use inside a sheet. */
  variant?: 'cards' | 'compact';
}

export function SampleTripPicker({ summaries, onLoaded, onDismiss, variant = 'cards' }: SampleTripPickerProps) {
  const { language } = useI18n();
  const copy = getSampleTripCopy(language);
  const [busyId, setBusyId] = useState<SampleTripId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async (id: SampleTripId) => {
    setBusyId(id);
    setError(null);
    try {
      const result = await loadSampleTrip(id);
      trackOwnlyEvent('sample_trip_loaded', { id });
      trackFirstEver('first_trip', 'first_trip_created', { source: 'sample' });
      onLoaded(result.trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setBusyId(null);
    }
  };

  if (variant === 'compact') {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
        <p className="text-xs leading-5 text-stone-600">{copy.lede}</p>
        <button
          type="button"
          onClick={() => void handleLoad(summaries[0]?.id ?? 'sample-thailand-6d')}
          disabled={busyId !== null}
          className="mt-3 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 transition hover:border-stone-900 hover:text-stone-950 disabled:opacity-50"
        >
          {busyId ? copy.loading : `${summaries[0]?.emoji ?? '🧭'} ${copy.compactLink}`}
        </button>
        {error ? <p role="alert" className="mt-2 text-[11px] text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <section aria-labelledby="sample-trip-headline" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="sample-trip-headline" className="text-lg font-semibold tracking-tight text-stone-950">
        {copy.headline}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-stone-600">{copy.lede}</p>

      <ol className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {copy.orientation.map((step) => (
          <li key={step.title} className="rounded-xl bg-stone-50 px-3.5 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-900">
              <span aria-hidden="true" className="text-sm">{step.icon}</span>
              {step.title}
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-stone-600">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {summaries.map((summary) => {
          const text = localizeSampleTrip(summary, language);
          const busy = busyId === summary.id;
          return (
            <article key={summary.id} className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 transition hover:border-stone-300">
              <div className="flex items-start justify-between gap-2">
                <span aria-hidden="true" className="text-2xl leading-none">{summary.emoji}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                  {text.eyebrow}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-stone-950">{text.title}</h3>
              <p className="mt-1 text-[11px] font-medium text-stone-500">{text.route}</p>

              <ul className="mt-3 space-y-1.5">
                {text.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-1.5 text-[11px] leading-4 text-stone-600">
                    <span aria-hidden="true" className="text-stone-400">·</span>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-stone-500">
                <span className="rounded-full bg-stone-100 px-2 py-0.5">📅 {summary.days} {copy.daysLabel}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5">📍 {summary.stops} {copy.stopsLabel}</span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">🗂️ {summary.poolSize} {copy.poolLabel}</span>
              </div>

              <button
                type="button"
                onClick={() => void handleLoad(summary.id)}
                disabled={busyId !== null}
                className="mt-4 min-h-11 w-full touch-manipulation rounded-lg bg-stone-950 px-4 py-2 text-xs font-bold text-white transition duration-150 hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? copy.loading : copy.cardCta}
              </button>
            </article>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          ⚠️ {copy.error} {error}
        </p>
      ) : null}

      <p className="mt-4 rounded-xl bg-emerald-50/70 px-3.5 py-2.5 text-[11px] leading-5 text-emerald-900 ring-1 ring-emerald-100">
        {copy.noWriteYet}
      </p>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900"
        >
          {copy.dismiss}
        </button>
      </div>
    </section>
  );
}

