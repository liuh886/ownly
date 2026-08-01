'use client';

import { useEffect } from 'react';
import { useI18n } from '@/core/i18n-context';
import { getFirstObjectCopy, type FirstObjectChoice } from '@/core/first-object-copy';

const CHOICE_ICON: Record<FirstObjectChoice, string> = {
  physical: '□',
  recurring_cost: '↻',
  experience: '◇',
};

export function FirstObjectOnboarding({
  open,
  onChoose,
  onDismiss,
}: {
  open: boolean;
  onChoose: (choice: FirstObjectChoice) => void;
  onDismiss: () => void;
}) {
  const { language } = useI18n();
  const copy = getFirstObjectCopy(language);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-object-title"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        <div className="border-b border-stone-100 bg-gradient-to-br from-stone-50 to-emerald-50/40 px-6 py-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {copy.eyebrow}
          </p>
          <h2 id="first-object-title" className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
            {copy.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{copy.description}</p>
        </div>

        <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8">
          {(Object.keys(copy.choices) as FirstObjectChoice[]).map((choice) => {
            const item = copy.choices[choice];
            return (
              <button
                key={choice}
                type="button"
                onClick={() => onChoose(choice)}
                className="group flex min-h-48 flex-col rounded-xl border border-stone-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-lg font-semibold text-stone-700 transition group-hover:bg-emerald-600 group-hover:text-white">
                  {CHOICE_ICON[choice]}
                </span>
                <span className="mt-4 text-sm font-semibold text-stone-950">{item.title}</span>
                <span className="mt-2 text-xs leading-5 text-stone-600">{item.description}</span>
                <span className="mt-auto pt-4 text-[11px] text-stone-400">{item.example}</span>
              </button>
            );
          })}
        </div>

        <div className="mx-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900 sm:mx-8">
          {copy.localNote}
        </div>

        <div className="flex justify-center px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900"
          >
            {copy.dismiss}
          </button>
        </div>
      </section>
    </div>
  );
}

export function EmptyOwnlyDataBanner({ onCreate }: { onCreate: () => void }) {
  const { language } = useI18n();
  const copy = getFirstObjectCopy(language);

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-stone-950">{copy.emptyTitle}</h2>
        <p className="mt-1 text-xs leading-5 text-stone-600">{copy.emptyDescription}</p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="min-h-10 shrink-0 rounded-lg bg-stone-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-800"
      >
        {copy.reopen}
      </button>
    </section>
  );
}
