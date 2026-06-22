import type { WYQDStoredEntity } from '@/core/repository';
import type { AccountSnapshot } from '@/domain/types';
import type { WYQDTranslationKey } from '@/core/i18n';

export interface AccountsHistoryProps {
  disabled?: boolean;
  isSaving: boolean;
  sorted: {
    fileName: string;
    body: string;
    entity: AccountSnapshot;
  }[];
  startEditingSnapshot: (stored: WYQDStoredEntity<AccountSnapshot>) => void;
  deletingFileName: string | null;
  setDeletingFileName: (value: string | null) => void;
  onDeleteSnapshot: (fileName: string) => Promise<void>;
  editingFileName: string | null;
  cancelEditing: () => void;
  confirm: (options: { title: string; message: string; destructive?: boolean }) => Promise<boolean>;
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (val: number | null | undefined, fallback?: string) => string;
}

export function AccountsHistory({
  disabled,
  isSaving,
  sorted,
  startEditingSnapshot,
  deletingFileName,
  setDeletingFileName,
  onDeleteSnapshot,
  editingFileName,
  cancelEditing,
  confirm,
  t,
  formatMoney,
}: AccountsHistoryProps) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('historySnapshots')}</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {t('recentN').replace('{count}', String(Math.min(sorted.length, 6)))}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
          {sorted.length}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
          {t('noSnapshots')}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sorted.slice(0, 6).map((stored) => (
            <article
              key={stored.entity.id}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      {stored.entity.is_month_end ? t('monthEndSnapshot') : t('normalSnapshot')}
                    </span>
                    <p className="truncate text-sm font-semibold text-stone-950">
                      {stored.entity.snapshot_at}
                    </p>
                  </div>
                  <p className="mt-1 font-mono text-xs font-medium text-stone-500">
                    {formatMoney(stored.entity.net_worth)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={disabled || isSaving}
                    onClick={() => startEditingSnapshot(stored)}
                    className="min-h-10 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    {t('edit')}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || deletingFileName === stored.fileName}
                    onClick={() => void (async () => {
                      const confirmed = await confirm({
                        title: t('delete'),
                        message: t('deleteConfirm').replace('{title}', stored.entity.snapshot_at),
                        destructive: true,
                      });
                      if (!confirmed) return;
                      setDeletingFileName(stored.fileName);
                      try {
                        await onDeleteSnapshot(stored.fileName);
                        if (editingFileName === stored.fileName) cancelEditing();
                      } finally {
                        setDeletingFileName(null);
                      }
                    })()}
                    className="min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deletingFileName === stored.fileName ? '…' : t('delete')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
