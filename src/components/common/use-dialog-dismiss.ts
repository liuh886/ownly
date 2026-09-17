'use client';

import { useEffect } from 'react';

/**
 * Shared dialog dismissal behavior: Escape closes the dialog while it is
 * mounted. Backdrop-click is handled per dialog via `dialogBackdropProps`.
 * Matches ConfirmDialog semantics (Escape → onCancel).
 */
export function useDialogDismiss(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, onClose]);
}

/** Props for the fixed backdrop wrapper: click on the backdrop itself closes. */
export function dialogBackdropProps(onClose: () => void) {
  return {
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
  };
}
