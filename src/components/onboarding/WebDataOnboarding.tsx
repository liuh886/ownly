'use client';

/**
 * The folder panel.
 *
 * One decision, three answers: create a folder, open one you already have, or
 * look at the demo. Everything else here used to share the same screen and made
 * that decision harder than it is — a gradient hero, two storage-location cards,
 * three full-height feature cards and a closing reassurance box, all visible at
 * once, for a choice the OS folder picker is actually going to make. So the panel
 * now spends its weight on the three actions and folds the storage guidance into
 * a disclosure: it is still one tap away and still says the same thing, but it
 * no longer competes with the buttons.
 *
 * Three things this dialog has to get right, all of them learned the hard way:
 *
 *  1. **Escape must not choose for you.** It used to be wired to the demo
 *     handler, so the fastest way out silently entered demo mode and marked
 *     onboarding handled — a state change the user never asked for, with no
 *     second prompt. It now calls a neutral `onDismiss`, and so does the
 *     backdrop.
 *  2. **Demo mode is a choice, not an escape hatch.** It was a `text-xs`
 *     underline below a warning box, which reads as "back out" rather than
 *     "start here". It is now a peer row with the same weight as create/open.
 *  3. **No control that does not do something.** The storage-location radiogroup
 *     only toggled a helper paragraph, while looking fully interactive. It is
 *     now a plain disclosure, because there is no meaningful way to act on it
 *     before the OS folder picker opens.
 *
 * The demo-discard warning stays visible (not folded away) when the user has
 * already seen the demo: connecting ends the session and throws away anything
 * they typed into it, which is a real, unrecoverable loss.
 */
import { useRef, useState } from 'react';
import { useDialogA11y } from '@/components/common/useDialogA11y';
import { useI18n } from '@/core/i18n-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';

type PendingAction = 'create' | 'open' | 'demo';

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
  const [pending, setPending] = useState<PendingAction | null>(null);

  useDialogA11y({ open, onClose: onDismiss, panelRef, dismissible: !isLoading });

  if (!open) return null;

  // Only the pressed button reports progress. Showing "connecting" on all three
  // at once tells the user nothing about which action actually started. Gating on
  // `isLoading` is what clears it, so no reset effect is needed.
  const actions = ([
    {
      key: 'create' as const,
      title: copy.onboarding.createTitle,
      description: copy.onboarding.createDescription,
      label: copy.onboarding.createButton,
      run: onCreate,
      rowClass: 'border-stone-200 bg-white',
      buttonClass: 'bg-stone-950 text-white hover:bg-stone-800',
    },
    {
      key: 'open' as const,
      title: copy.onboarding.openTitle,
      description: copy.onboarding.openDescription,
      label: copy.onboarding.openButton,
      run: onOpen,
      rowClass: 'border-stone-200 bg-white',
      buttonClass: 'border border-stone-300 bg-white text-stone-800 hover:border-stone-900 hover:text-stone-950',
    },
    {
      key: 'demo' as const,
      title: copy.onboarding.demoTitle,
      description: copy.onboarding.demoDescription,
      label: copy.onboarding.demoButton,
      run: onContinueDemo,
      rowClass: 'border-amber-200 bg-amber-50/60',
      buttonClass: 'border border-amber-300 bg-white text-amber-900 hover:bg-amber-50',
    },
  ] as const).map((action) => ({
    ...action,
    isPending: pending === action.key && isLoading,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-4 backdrop-blur-sm"
      onClick={(event) => {
        // Only the backdrop itself, never a click that bubbled out of the panel.
        if (event.target === event.currentTarget && !isLoading) onDismiss();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownly-onboarding-title"
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl"
      >
        <h2 id="ownly-onboarding-title" className="text-base font-semibold tracking-tight text-stone-950">
          {copy.onboarding.title}
        </h2>
        <p className="mt-1.5 text-xs leading-5 text-stone-600">{copy.onboarding.description}</p>

        <div className="mt-4 grid gap-2">
          {actions.map((action) => (
            <div
              key={action.key}
              className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${action.rowClass}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-950">{action.title}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-500">{action.description}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPending(action.key);
                  action.run();
                }}
                disabled={isLoading}
                className={`min-h-9 shrink-0 touch-manipulation whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 ${action.buttonClass}`}
              >
                {action.isPending ? copy.connecting : action.label}
              </button>
            </div>
          ))}
        </div>

        {hasSeenDemo ? (
          <p className="mt-3 text-[11px] leading-5 text-amber-800">{copy.onboarding.connectDiscardsDemo}</p>
        ) : null}

        {/* Guidance, not a control: picking a storage location is the OS folder
            dialog's job. It stays in the panel because it is a promise the app
            makes about where data lives — just not something that has to be read
            before choosing a folder. */}
        <details className="mt-3 rounded-lg bg-stone-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-stone-600 marker:text-stone-400">
            {copy.onboarding.storageQuestion}
          </summary>
          <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-stone-600">
            <p>
              <span className="font-medium text-stone-900">{copy.onboarding.localTitle}</span>
              {' — '}
              {copy.onboarding.localDescription}
            </p>
            <p>
              <span className="font-medium text-stone-900">{copy.onboarding.cloudTitle}</span>
              {' — '}
              {copy.onboarding.cloudDescription}
            </p>
            <p className="text-stone-500">{copy.onboarding.cloudNote}</p>
            <p className="font-medium text-stone-700">{copy.onboarding.cloudRule}</p>
            <p className="border-t border-stone-200 pt-1.5 text-stone-500">
              <span className="font-medium text-stone-900">{copy.onboarding.recommendationTitle}</span>
              {' — '}
              {copy.onboarding.recommendation}
            </p>
          </div>
        </details>

        {error ? (
          <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isLoading}
            className="min-h-9 touch-manipulation rounded-lg px-2 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
          >
            {copy.onboarding.dismiss}
          </button>
        </div>
      </section>
    </div>
  );
}
