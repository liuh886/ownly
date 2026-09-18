'use client';

import { useEffect, useRef, type ReactNode } from 'react';

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

const FOCUSABLE_SELECTOR =
  'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Shared mobile-first dialog primitive.
 *
 * - <sm: bottom sheet (slide up, drag handle, sticky footer, dvh sizing).
 * - sm+: centered dialog (same role/a11y contract, desktop visuals unchanged).
 *
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
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const doc = typeof window !== 'undefined' ? window.document : undefined;
    previousFocusRef.current =
      doc?.activeElement instanceof HTMLElement ? doc.activeElement : null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (dismissible) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((item) => !item.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && doc?.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc?.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    doc?.addEventListener('keydown', handleKeyDown);
    // Focus the first field when present, otherwise the panel itself so
    // keyboard and screen-reader users land inside the sheet.
    window.setTimeout(() => {
      const firstField = panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea',
      );
      if (firstField && !firstField.hasAttribute('disabled')) {
        firstField.focus();
      } else {
        panelRef.current?.focus();
      }
    }, 0);

    return () => {
      doc?.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [dismissible, open]);

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
        aria-label={title}
        tabIndex={-1}
        className={`ownly-sheet-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-white shadow-2xl sm:mx-auto sm:max-h-[calc(100vh-4rem)] sm:rounded-2xl ${SIZE_CLASS[size]}`}
      >
        <button
          type="button"
          onClick={() => {
            if (dismissible) onClose();
          }}
          aria-label={title}
          tabIndex={-1}
          className="mx-auto shrink-0 touch-manipulation px-8 pb-1 pt-2.5 sm:hidden"
        >
          <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-stone-300" />
        </button>
        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6 sm:pt-5">
          <h2 className="text-base font-semibold tracking-tight text-stone-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-stone-500">{description}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-stone-100 bg-white/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
