'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

/** Shared across stacked dialogs so closing one never unlocks the page early. */
let scrollLockCount = 0;

function lockBodyScroll() {
  scrollLockCount += 1;
  if (scrollLockCount === 1 && typeof window.document !== 'undefined') {
    window.document.body.classList.add('ownly-scroll-locked');
  }
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0 && typeof window.document !== 'undefined') {
    window.document.body.classList.remove('ownly-scroll-locked');
  }
}

export interface DialogA11yOptions {
  open: boolean;
  onClose: () => void;
  /** The dialog panel element that receives focus and traps Tab. */
  panelRef: RefObject<HTMLElement | null>;
  /** When false, Escape is ignored (e.g. while submitting). */
  dismissible?: boolean;
  /** Selector for the element focused on open; falls back to the panel itself. */
  initialFocusSelector?: string;
  /** Set false for non-modal surfaces (e.g. menus) that should keep page scrolling. */
  lockScroll?: boolean;
}

/**
 * Keyboard/AT contract for hand-rolled overlays: Escape, Tab trap, focus
 * restore, scroll lock, initial focus. Use inside any `role="dialog"` panel.
 */
export function useDialogA11y({
  open,
  onClose,
  panelRef,
  dismissible = true,
  initialFocusSelector = 'input, select, textarea, [data-autofocus]',
  lockScroll = true,
}: DialogA11yOptions) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    const doc = window.document;
    const previousFocus =
      doc.activeElement instanceof HTMLElement ? doc.activeElement : null;

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
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    doc.addEventListener('keydown', handleKeyDown);
    if (lockScroll) lockBodyScroll();
    const focusTimer = window.setTimeout(() => {
      const firstField = panelRef.current?.querySelector<HTMLElement>(initialFocusSelector);
      if (firstField && !firstField.hasAttribute('disabled')) {
        firstField.focus();
      } else {
        panelRef.current?.focus();
      }
    }, 0);

    return () => {
      doc.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
      if (lockScroll) unlockBodyScroll();
      previousFocus?.focus();
    };
  }, [dismissible, initialFocusSelector, lockScroll, open, panelRef]);
}
