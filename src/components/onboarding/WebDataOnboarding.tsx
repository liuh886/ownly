'use client';

import { useEffect } from 'react';
import { useI18n } from '@/core/i18n-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';

export function WebDataOnboarding({
  open,
  isLoading,
  error,
  onCreate,
  onOpen,
  onContinueDemo,
}: {
  open: boolean;
  isLoading: boolean;
  error: string | null;
  onCreate: () => void;
  onOpen: () => void;
  onContinueDemo: () => void;
}) {
  const { language } = useI18n();
  const copy = getOwnlyLocalDataCopy(language);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onContinueDemo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isLoading, onContinueDemo]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownly-onboarding-title"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        <div className="border-b border-stone-100 bg-gradient-to-br from-stone-50 to-emerald-50/40 px-6 py-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {copy.onboarding.eyebrow}
          </p>
          <h2 id="ownly-onboarding-title" className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
            {copy.onboarding.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {copy.onboarding.description}
          </p>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <article className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">+</div>
            <h3 className="mt-4 text-base font-semibold text-stone-950">{copy.onboarding.createTitle}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-600">
              {copy.onboarding.createDescription}
            </p>
            <button
              type="button"
              onClick={onCreate}
              disabled={isLoading}
              className="mt-5 min-h-11 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {isLoading ? copy.connecting : copy.onboarding.createButton}
            </button>
          </article>

          <article className="flex flex-col rounded-xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-bold text-stone-700 ring-1 ring-stone-200">↗</div>
            <h3 className="mt-4 text-base font-semibold text-stone-950">{copy.onboarding.openTitle}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-600">
              {copy.onboarding.openDescription}
            </p>
            <button
              type="button"
              onClick={onOpen}
              disabled={isLoading}
              className="mt-5 min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
            >
              {isLoading ? copy.connecting : copy.onboarding.openButton}
            </button>
          </article>
        </div>

        <div className="mx-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:mx-8">
          <p className="text-xs font-semibold text-amber-900">{copy.onboarding.recommendationTitle}</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{copy.onboarding.recommendation}</p>
        </div>

        {error ? (
          <div role="alert" className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 sm:mx-8">
            {error}
          </div>
        ) : null}

        <div className="flex justify-center px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={onContinueDemo}
            disabled={isLoading}
            className="text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
          >
            {copy.onboarding.demo}
          </button>
        </div>
      </section>
    </div>
  );
}
