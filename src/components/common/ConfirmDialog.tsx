'use client';

import { useId, useRef } from 'react';
import { useI18n } from '@/core/i18n-context';
import { useDialogA11y } from './useDialogA11y';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  inputLabel?: string;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  inputLabel,
  inputValue,
  onInputChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const titleId = useId();

  useDialogA11y({
    open,
    onClose: onCancel,
    panelRef: dialogRef,
    initialFocusSelector: 'input, select, textarea, [data-confirm-default]',
  });

  if (!open) return null;

  const confirmBtnClass = destructive
    ? 'min-h-11 flex-1 touch-manipulation rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition duration-150 active:scale-[0.98] hover:bg-red-700'
    : 'min-h-11 flex-1 touch-manipulation rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition duration-150 active:scale-[0.98] hover:bg-primary-hover';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-lg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{message}</p>

        {inputLabel && onInputChange ? (
          <div className="mt-3">
            <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-ink-muted">{inputLabel}</label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={inputValue ?? ''}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onConfirm(inputValue);
                }
              }}
              autoComplete="off"
              enterKeyHint="done"
              className="min-h-11 w-full touch-manipulation rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-ink-muted focus:border-line-strong focus:ring-2 focus:ring-line sm:text-sm"
            />
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-confirm-default={destructive ? '' : undefined}
            className="min-h-11 flex-1 touch-manipulation rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary transition duration-150 active:scale-[0.98] hover:border-ink"
          >
            {cancelLabel ?? t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(inputValue)}
            data-confirm-default={destructive ? undefined : ''}
            className={confirmBtnClass}
          >
            {confirmLabel ?? t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
