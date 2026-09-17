'use client';

/**
 * Props for a fixed dialog backdrop wrapper: a click on the backdrop itself
 * (not on the panel) closes the dialog. Escape and focus handling live in
 * `useDialogA11y`, so this only covers pointer dismissal.
 */
export function dialogBackdropProps(onClose: () => void) {
  return {
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
  };
}
