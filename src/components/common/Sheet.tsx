'use client';

import { useId, useRef, type ReactNode } from 'react';
import { useDialogA11y } from './useDialogA11y';

export type SheetSize = 'sm' | 'md' | 'lg';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: SheetSize;
  /** When false, backdrop click and Escape are ignored (e.g. while submitting). */
  dismissible?: boolean;
}

const SIZE_CLASS: Record<SheetSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-xl',
};

/**
 * Shared mobile-first dialog primitive.
 *
 * - <sm: bottom sheet (slide up, drag handle, sticky footer, dvh sizing).
 * - sm+: centered dialog (same role/a11y contract, desktop visuals unchanged).
 *
 * Behaviour: Escape, Tab trap, focus restore, body scroll lock.
 * Form-type modals should migrate here; small confirm dialogs stay on the
 * lightweight ConfirmDialog primitives.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogA11y({ open, onClose, panelRef, dismissible });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 backdrop-blur-sm sm:items-center sm:px-5 sm:py-8"
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`ownly-sheet-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:mx-auto sm:max-h-[calc(100vh-4rem)] sm:rounded-2xl ${SIZE_CLASS[size]}`}
      >
        <button
          type="button"
          onClick={() => {
            if (dismissible) onClose();
          }}
          aria-hidden="true"
          tabIndex={-1}
          className="mx-auto shrink-0 touch-manipulation px-8 pb-1 pt-2.5 sm:hidden"
        >
          <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-surface-sunken" />
        </button>
        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6 sm:pt-5">
          <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-line bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
