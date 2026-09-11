'use client';

interface ConfirmDialogProps {
  zh: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ zh, title, message, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div
        className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="text-sm font-bold text-stone-900">{title}</h2>
        <p className="text-xs leading-relaxed text-stone-600">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
