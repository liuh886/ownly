'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '@/core/i18n-context';

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

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    if (inputRef.current) inputRef.current.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBtnClass = destructive
    ? 'flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700'
    : 'flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-lg"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="text-base font-semibold tracking-tight text-stone-950">{title}</h2>
        <p className="mt-1 text-sm text-stone-500">{message}</p>

        {inputLabel && onInputChange ? (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-stone-500">{inputLabel}</label>
            <input
              ref={inputRef}
              type="text"
              value={inputValue ?? ''}
              onChange={(e) => onInputChange(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50"
            />
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900"
          >
            {cancelLabel ?? t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(inputValue)}
            className={confirmBtnClass}
          >
            {confirmLabel ?? t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
