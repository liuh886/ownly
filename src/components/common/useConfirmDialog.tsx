'use client';

import { useState, useCallback } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PromptOptions extends ConfirmOptions {
  inputLabel: string;
  defaultValue?: string;
}

export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    options: ConfirmOptions | PromptOptions;
    resolve: (value: boolean | string | null) => void;
    inputValue?: string;
    isPrompt?: boolean;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({ open: true, options, resolve: (v) => resolve(v === true), isPrompt: false });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setDialogState({
        open: true,
        options,
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
        inputValue: options.defaultValue ?? '',
        isPrompt: true,
      });
    });
  }, []);

  const handleConfirm = useCallback((inputValue?: string) => {
    if (!dialogState) return;
    dialogState.resolve(dialogState.isPrompt ? (inputValue ?? '') : true);
    setDialogState(null);
  }, [dialogState]);

  const handleCancel = useCallback(() => {
    if (!dialogState) return;
    dialogState.resolve(dialogState.isPrompt ? null : false);
    setDialogState(null);
  }, [dialogState]);

  const dialog = dialogState ? (
    <ConfirmDialog
      open={dialogState.open}
      title={dialogState.options.title}
      message={dialogState.options.message}
      confirmLabel={dialogState.options.confirmLabel}
      cancelLabel={dialogState.options.cancelLabel}
      destructive={dialogState.options.destructive}
      inputLabel={dialogState.isPrompt ? (dialogState.options as PromptOptions).inputLabel : undefined}
      inputValue={dialogState.inputValue}
      onInputChange={dialogState.isPrompt ? (v) => setDialogState((s) => s ? { ...s, inputValue: v } : s) : undefined}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, prompt, dialog };
}
