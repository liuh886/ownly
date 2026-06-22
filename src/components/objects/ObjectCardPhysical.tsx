import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import { IconButton } from '@/components/common/ui-primitives';
import { ObjectComposer } from './ObjectComposer';
import { ObjectDetailPanel } from './ObjectDetailPanel';
import { getDailyCost, getServiceDaysInfo, getPhysicalAccentClasses, getObjectIcon, getStatusLabel, formatDateRange, translateCategory, type TranslateFn } from './ObjectListUtils';
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
  const serviceDaysInfo = getServiceDaysInfo(object);
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
          className="flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-stone-50 focus:bg-stone-50 disabled:opacity-50"
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
              <h3 className="truncate text-sm font-semibold text-stone-950">
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
              <div className="mt-0.5 font-mono text-sm font-medium text-stone-900">
                {object.purchase_price ? formatMoney(object.purchase_price) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400">{t('dailyCostAvg')}</div>
              <div className="mt-0.5 font-mono text-sm font-medium text-stone-900">
                {dailyCost ? formatMoney(dailyCost) : '—'}
              </div>
            </div>
            <div className="text-stone-300">
              <span aria-hidden="true">→</span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
