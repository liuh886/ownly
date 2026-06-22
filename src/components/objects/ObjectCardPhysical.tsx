import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import { IconButton } from '@/components/common/ui-primitives';
import { ObjectComposer } from './ObjectComposer';
import { ObjectDetailPanel } from './ObjectDetailPanel';
import { getDailyCost, getPhysicalAccentClasses, getStatusLabel, formatDateRange, type TranslateFn } from './ObjectListUtils';
import { getPhysicalBucket } from './useObjectFilterSort';
import type { WYQDStoredEntity } from '@/core/repository';
import type { PhysicalObject, WYQDObject } from '@/domain/types';
import { todayISO } from '@/lib/format';

function MoreActionsButton({
  objectTitle,
  menuId,
  open,
  onToggle,
  t,
}: {
  objectTitle: string;
  menuId: string;
  open: boolean;
  onToggle: () => void;
  t: TranslateFn;
}) {
  return (
    <IconButton
      onClick={onToggle}
      aria-label={`${t('moreActions')} - ${objectTitle}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      title={t('more')}
    >
      <span aria-hidden="true">⋯</span>
    </IconButton>
  );
}

export function ObjectCardPhysical({
  stored,
  isEditing,
  isDetailing,
  disabled,
  openActionMenuFileName,
  exitingFileName,
  deletingFileName,
  onUpdate,
  onDelete,
  setEditingFileName,
  setSelectedFileName,
  setOpenActionMenuFileName,
  setExitingFileName,
  setDeletingFileName,
  confirm,
  menuItemClass,
}: {
  stored: WYQDStoredEntity<WYQDObject>;
  isEditing: boolean;
  isDetailing: boolean;
  disabled?: boolean;
  openActionMenuFileName: string | null;
  exitingFileName: string | null;
  deletingFileName: string | null;
  onUpdate: (fileName: string, object: WYQDObject, body: string) => Promise<void>;
  onDelete: (fileName: string) => Promise<void>;
  setEditingFileName: (name: string | null) => void;
  setSelectedFileName: (name: string | null) => void;
  setOpenActionMenuFileName: (name: string | null | ((current: string | null) => string | null)) => void;
  setExitingFileName: (name: string | null) => void;
  setDeletingFileName: (name: string | null) => void;
  confirm: (options: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }) => Promise<boolean>;
  menuItemClass: string;
}) {
  const { t } = useI18n();
  const { formatMoney } = useFormatMoney();
  const object = stored.entity as PhysicalObject;

  const dailyCost = getDailyCost(object);
  const bucket = getPhysicalBucket(object.status);
  const accent = getPhysicalAccentClasses(bucket);

  return (
    <article className="overflow-visible rounded-xl border border-stone-200 bg-white shadow-sm transition hover:border-stone-300">
      {isEditing ? (
        <div className="p-5">
          <ObjectComposer
            disabled={disabled}
            initialObject={object}
            submitLabel={t('saveChanges')}
            onCancel={() => setEditingFileName(null)}
            onSubmit={async (updatedObject, body) => {
              await onUpdate(stored.fileName, updatedObject, stored.body || body);
              setEditingFileName(null);
            }}
          />
        </div>
      ) : isDetailing ? (
        <div className="p-1">
          <ObjectDetailPanel
            stored={stored as WYQDStoredEntity<WYQDObject>}
            onClose={() => setSelectedFileName(null)}
            onSave={async (updatedObject, body) => {
              await onUpdate(stored.fileName, updatedObject, body);
            }}
            disabled={disabled}
          />
        </div>
      ) : (
        <div
          className="flex cursor-pointer items-center justify-between p-3 transition-colors hover:bg-stone-50 focus:bg-stone-50 disabled:opacity-50"
          onClick={() => setSelectedFileName(stored.fileName)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedFileName(stored.fileName);
            }
          }}
          tabIndex={disabled ? -1 : 0}
          role="button"
          aria-disabled={disabled}
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${accent.badge}`}>
                {getStatusLabel(object, t)}
              </span>
              <h3 className="truncate text-[13px] font-medium text-stone-900">
                {object.title}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-500">
              <span>{formatDateRange(object, t)}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4 text-right">
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-wider text-stone-400">{t('totalAcquisitionCost')}</div>
              <div className="mt-0.5 font-mono text-[13px] font-medium text-stone-900">
                {object.purchase_price ? formatMoney(object.purchase_price) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400">{t('dailyCostAvg')}</div>
              <div className="mt-0.5 font-mono text-[13px] font-medium text-stone-900">
                {dailyCost ? formatMoney(dailyCost) : '—'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="relative z-10"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <MoreActionsButton
                  objectTitle={object.title}
                  menuId={`object-actions-${stored.fileName}`}
                  open={openActionMenuFileName === stored.fileName}
                  onToggle={() =>
                    setOpenActionMenuFileName((current: string | null) =>
                      current === stored.fileName ? null : stored.fileName,
                    )
                  }
                  t={t}
                />
                {openActionMenuFileName === stored.fileName ? (
                  <div id={`object-actions-${stored.fileName}`} role="menu" className="absolute right-0 top-11 z-20 w-36 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                    <button
                      type="button" role="menuitem"
                      onClick={() => void (async () => {
                        const next: PhysicalObject = {
                          ...object,
                          status: 'idle',
                          ended_at: object.ended_at || todayISO(),
                          updated_at: todayISO(),
                        };
                        setOpenActionMenuFileName(null);
                        setExitingFileName(stored.fileName);
                        try {
                          await onUpdate(stored.fileName, next, stored.body);
                        } finally {
                          setExitingFileName(null);
                        }
                      })()}
                      className={menuItemClass}
                      disabled={
                        disabled || exitingFileName === stored.fileName || bucket !== 'active'
                      }
                    >
                      <span>{t('retire')}</span>
                      <span aria-hidden="true">📦</span>
                    </button>
                    <button
                      type="button" role="menuitem"
                      onClick={() => void (async () => {
                        const confirmed = await confirm({
                          title: t('delete'),
                          message: t('deleteConfirm').replace('{title}', object.title),
                          destructive: true,
                        });
                        if (!confirmed) return;
                        setOpenActionMenuFileName(null);
                        setDeletingFileName(stored.fileName);
                        try {
                          await onDelete(stored.fileName);
                        } finally {
                          setDeletingFileName(null);
                        }
                      })()}
                      className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                      disabled={disabled || deletingFileName === stored.fileName}
                    >
                      <span>{t('delete')}</span>
                      <span aria-hidden="true">
                        {deletingFileName === stored.fileName ? '…' : '🗑️'}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="text-stone-300">
                <span aria-hidden="true">→</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
