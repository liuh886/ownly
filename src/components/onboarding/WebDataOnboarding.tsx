'use client';

/**
 * The folder panel.
 *
 * Three things this dialog has to get right, all of them learned the hard way:
 *
 *  1. **Escape must not choose for you.** It used to be wired to the demo
 *     handler, so the fastest way out silently entered demo mode and marked
 *     onboarding handled — a state change the user never asked for, with no
 *     second prompt. It now calls a neutral `onDismiss`.
 *  2. **Demo mode is a choice, not an escape hatch.** It was a `text-xs`
 *     underline below a warning box, which reads as "back out" rather than
 *     "start here". It is now a peer card with the same weight as create/open.
 *  3. **No control that does not do something.** The storage-location radiogroup
 *     only toggled a helper paragraph, while looking fully interactive. It is
 *     now static guidance, because there is no meaningful way to act on it
 *     before the OS folder picker opens.
 *
 * Both folder cards state that connecting ends the demo session. That is a real,
 * unrecoverable loss of anything typed in demo, and it was previously mentioned
 * only in a code comment.
 */
import { useRef } from 'react';
import { useDialogA11y } from '@/components/common/useDialogA11y';
import { useI18n } from '@/core/i18n-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';

export function WebDataOnboarding({
  open,
  isLoading,
  error,
  hasSeenDemo,
  onCreate,
  onOpen,
  onContinueDemo,
  onDismiss,
}: {
  open: boolean;
  isLoading: boolean;
  error: string | null;
  /** True when re-opened from demo mode, so the loss warning is worth showing. */
  hasSeenDemo: boolean;
  onCreate: () => void;
  onOpen: () => void;
  onContinueDemo: () => void;
  onDismiss: () => void;
}) {
  const { language } = useI18n();
  const copy = getOwnlyLocalDataCopy(language);
  const panelRef = useRef<HTMLElement>(null);

  useDialogA11y({ open, onClose: onDismiss, panelRef, dismissible: !isLoading });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-4 backdrop-blur-sm sm:py-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownly-onboarding-title"
        ref={panelRef}
        tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl sm:max-h-[calc(100vh-4rem)]"
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

        <div className="px-6 pt-6 sm:px-8 sm:pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {copy.onboarding.storageQuestion}
          </p>
          {/* Guidance, not a control: picking a storage location is the OS
              folder dialog's job, and this used to be a radiogroup that only
              toggled the note below it. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ['local', copy.onboarding.localTitle, copy.onboarding.localDescription, '⌂'],
              ['cloud', copy.onboarding.cloudTitle, copy.onboarding.cloudDescription, '☁'],
            ] as const).map(([key, title, description, icon]) => (
              <div key={key} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-base text-stone-600 ring-1 ring-stone-200"
                >
                  {icon}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-stone-950">{title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-stone-600">{description}</p>
                {key === 'cloud' ? (
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-5 text-sky-900">
                    <p>{copy.onboarding.cloudNote}</p>
                    <p className="mt-1 font-semibold">{copy.onboarding.cloudRule}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
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

          <article className="flex flex-col rounded-xl border border-amber-200 bg-amber-50/50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-lg font-bold text-white">◐</div>
            <h3 className="mt-4 text-base font-semibold text-stone-950">{copy.onboarding.demoTitle}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-600">
              {copy.onboarding.demoDescription}
            </p>
            <button
              type="button"
              onClick={onContinueDemo}
              disabled={isLoading}
              className="mt-5 min-h-11 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
            >
              {isLoading ? copy.connecting : copy.onboarding.demoButton}
            </button>
          </article>
        </div>

        {hasSeenDemo ? (
          <div className="mx-6 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:mx-8">
            <p className="text-xs leading-5 text-amber-900">{copy.onboarding.connectDiscardsDemo}</p>
          </div>
        ) : null}

        <div className="mx-6 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 sm:mx-8">
          <p className="text-xs font-semibold text-stone-900">{copy.onboarding.recommendationTitle}</p>
          <p className="mt-1 text-xs leading-5 text-stone-600">{copy.onboarding.recommendation}</p>
        </div>

        {error ? (
          <div role="alert" className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 sm:mx-8">
            {error}
          </div>
        ) : null}

        <div className="flex justify-center px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isLoading}
            className="text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
          >
            {copy.onboarding.dismiss}
          </button>
        </div>
      </section>
    </div>
  );
}
