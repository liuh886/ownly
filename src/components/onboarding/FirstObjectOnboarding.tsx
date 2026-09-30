'use client';

/**
 * The chooser dialog itself moved to `FirstRunGuide`, which merges the retired
 * Capture explainer with the first-record prompt so only one first-run dialog
 * can open. What stays here is the persistent empty-folder banner, which has no
 * equivalent in the guide because it must remain reachable after dismissal.
 */
import { useI18n } from '@/core/i18n-context';
import { getFirstObjectCopy } from '@/core/first-object-copy';

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
