import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import { IconButton } from '@/components/common/ui-primitives';
import { ObjectComposer } from './ObjectComposer';
import { ObjectDetailPanel } from './ObjectDetailPanel';
import { getSupportingVisuals, getSupportingActionLabel, getSupportingActionIcon, canCancelRecurringCost, getSupportingMeta, getPrimaryAmount, getStatusLabel, transitionSupportingObject, type TranslateFn } from './ObjectListUtils';
import type { WYQDStoredEntity } from '@/core/repository';
import type { WYQDObject, RecurringCostObject, ReviewEntry } from '@/domain/types';
import { calculateNextBillingDate } from '@/domain/calculations';
import { parseScore, formatDueLabel, todayISO } from '@/lib/format';

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

export function ObjectCardSupporting({
  stored,
  reviews,
  isEditing,
  isDetailing,
  isReviewing,
  disabled,
  openActionMenuFileName,
  exitingFileName,
  deletingFileName,
  reviewSummary,
  reviewFoodScore,
  reviewSceneryScore,
  reviewExperienceScore,
  onUpdate,
  onDelete,
  onCreateObjectReview,
  setEditingFileName,
  setSelectedFileName,
  setReviewingFileName,
  setOpenActionMenuFileName,
  setExitingFileName,
  setDeletingFileName,
  setReviewSummary,
  setReviewFoodScore,
  setReviewSceneryScore,
  setReviewExperienceScore,
  cancelObjectReview,
  confirm,
  prompt,
  menuItemClass,
}: {
  stored: WYQDStoredEntity<WYQDObject>;
  reviews: WYQDStoredEntity<ReviewEntry>[];
  isEditing: boolean;
  isDetailing: boolean;
  isReviewing: boolean;
  disabled?: boolean;
  openActionMenuFileName: string | null;
  exitingFileName: string | null;
  deletingFileName: string | null;
  reviewSummary: string;
  reviewFoodScore: string;
  reviewSceneryScore: string;
  reviewExperienceScore: string;
  onUpdate: (fileName: string, object: WYQDObject, body: string) => Promise<void>;
  onDelete: (fileName: string) => Promise<void>;
  onCreateObjectReview: (
    fileName: string,
    object: WYQDObject,
    summary: string,
    rankings: {
      foodScore: number | null;
      sceneryScore: number | null;
      experienceScore: number | null;
    },
    body: string,
  ) => Promise<void>;
  setEditingFileName: (name: string | null) => void;
  setSelectedFileName: (name: string | null) => void;
  setReviewingFileName: (name: string | null) => void;
  setOpenActionMenuFileName: (name: string | null | ((current: string | null) => string | null)) => void;
  setExitingFileName: (name: string | null) => void;
  setDeletingFileName: (name: string | null) => void;
  setReviewSummary: (val: string) => void;
  setReviewFoodScore: (val: string) => void;
  setReviewSceneryScore: (val: string) => void;
  setReviewExperienceScore: (val: string) => void;
  cancelObjectReview: () => void;
  confirm: (options: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }) => Promise<boolean>;
  prompt: (options: { title: string; message: string; inputLabel: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; defaultValue?: string }) => Promise<string | null>;
  menuItemClass: string;
}) {
  const { t } = useI18n();
  const { formatMoney } = useFormatMoney();
  const object = stored.entity;
  
  if (object.object_type === 'physical') {
    return null;
  }

  const supportingVisuals = getSupportingVisuals(t);
  const visual =
    object.object_type === 'recurring_cost'
      ? supportingVisuals.recurring_cost
      : supportingVisuals.one_time_experience;
  const nextBillingDate =
    object.object_type === 'recurring_cost' && object.status === 'active'
      ? calculateNextBillingDate(object)
      : null;
  const supportingActionLabel = getSupportingActionLabel(object, t);

  const isArchived = 
    (object.object_type === 'recurring_cost' && (object.status === 'cancelled' || object.status === 'paused')) ||
    (object.object_type === 'one_time_experience' && (object.status === 'completed' || object.status === 'reviewed'));

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
            stored={stored}
            onClose={() => setSelectedFileName(null)}
            onSave={async (updatedObject, body) => {
              await onUpdate(stored.fileName, updatedObject, body);
            }}
            disabled={disabled}
          />
        </div>
      ) : (
        <div
          className={`flex cursor-pointer flex-col p-3 transition-colors hover:bg-stone-50 focus:bg-stone-50 aria-disabled:opacity-50 ${
            isArchived ? 'opacity-60 grayscale' : ''
          }`}
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
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${visual.badgeClass}`}>
                  {getStatusLabel(object, t)}
                </span>
                <h3 className="truncate text-[13px] font-medium text-stone-900">
                  {object.title}
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs text-stone-500">
                <span>{getSupportingMeta(object, nextBillingDate, t)}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400">{visual.amountLabel}</div>
                <div className="mt-0.5 font-mono text-[13px] font-medium text-stone-900">
                  {formatMoney(getPrimaryAmount(object))}
                </div>
                {nextBillingDate ? (
                  <div className="mt-0.5 text-[10px] text-sky-700">
                    {formatDueLabel(nextBillingDate, t)}
                  </div>
                ) : null}
              </div>
              
              {supportingActionLabel ? (
                <div 
                  className="z-10 ml-2" 
                  onClick={(e) => e.stopPropagation()} 
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      void (async () => {
                        if (
                          object.object_type === 'one_time_experience' &&
                          (object.status === 'completed' || object.status === 'reviewed')
                        ) {
                          setOpenActionMenuFileName(null);
                          const existingReview = reviews.find(
                            (r) => r.entity.target_id === object.id,
                          );
                          if (existingReview) {
                            setReviewSummary(existingReview.entity.summary || '');
                            setReviewFoodScore(existingReview.entity.food_score ? String(existingReview.entity.food_score) : '');
                            setReviewSceneryScore(existingReview.entity.scenery_score ? String(existingReview.entity.scenery_score) : '');
                            setReviewExperienceScore(existingReview.entity.experience_score ? String(existingReview.entity.experience_score) : '');
                          } else {
                            setReviewSummary('');
                            setReviewFoodScore('');
                            setReviewSceneryScore('');
                            setReviewExperienceScore('');
                          }
                          setReviewingFileName(stored.fileName);
                          return;
                        }

                        setOpenActionMenuFileName(null);
                        setExitingFileName(stored.fileName);
                        try {
                          await onUpdate(
                            stored.fileName,
                            transitionSupportingObject(object),
                            stored.body,
                          );
                        } finally {
                          setExitingFileName(null);
                        }
                      })();
                    }}
                    aria-label={`${supportingActionLabel} - ${object.title}`}
                    title={supportingActionLabel}
                    className="border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-700 hover:bg-amber-50"
                    disabled={disabled || exitingFileName === stored.fileName}
                  >
                    <span aria-hidden="true">
                      {exitingFileName === stored.fileName
                        ? '…'
                        : getSupportingActionIcon(object)}
                    </span>
                  </IconButton>
                </div>
              ) : null}
              
              <div 
                className="relative z-10 ml-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <MoreActionsButton
                  objectTitle={object.title}
                  menuId={`object-actions-${stored.fileName}`}
                  open={openActionMenuFileName === stored.fileName}
                  onToggle={() =>
                    setOpenActionMenuFileName((current) =>
                      current === stored.fileName ? null : stored.fileName,
                    )
                  }
                  t={t}
                />
                {openActionMenuFileName === stored.fileName ? (
                  <div id={`object-actions-${stored.fileName}`} role="menu" className="absolute right-0 top-11 z-20 w-40 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                    {canCancelRecurringCost(object) ? (
                      <button
                        type="button" role="menuitem"
                        onClick={() => void (async () => {
                          const reason = await prompt({
                            title: t('cancelSubscription'),
                            message: t('cancelReasonPrompt').replace('{title}', object.title),
                            inputLabel: t('cancelReasonPrompt').replace('{title}', ''),
                            destructive: true,
                          });
                          if (reason === null) return;

                          const next: RecurringCostObject = {
                            ...object,
                            status: 'cancelled',
                            cancelled_at: todayISO(),
                            cancel_reason: reason.trim() || t('notRecorded'),
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
                        className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                        disabled={disabled || exitingFileName === stored.fileName}
                      >
                        <span>{t('cancelSubscription')}</span>
                        <span aria-hidden="true">🚫</span>
                      </button>
                    ) : null}
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

              {!supportingActionLabel ? (
                <div className="text-stone-300 ml-1">
                  <span aria-hidden="true">→</span>
                </div>
              ) : null}
            </div>
          </div>

            {isReviewing ? (
              <form
                className="mt-4 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
                onSubmit={(event) => void (async () => {
                  event.preventDefault();
                  const summary = reviewSummary.trim();
                  if (!summary) return;

                  setExitingFileName(stored.fileName);
                  try {
                    await onCreateObjectReview(
                      stored.fileName,
                      object,
                      summary,
                      {
                        foodScore: parseScore(reviewFoodScore),
                        sceneryScore: parseScore(reviewSceneryScore),
                        experienceScore: parseScore(reviewExperienceScore),
                      },
                      stored.body,
                    );
                    cancelObjectReview();
                  } finally {
                    setExitingFileName(null);
                  }
                })()}
              >
                <div>
                  <label className="block text-xs font-medium text-stone-500">
                    {t('experienceReview')}
                  </label>
                  <textarea
                    value={reviewSummary}
                    onChange={(event) => setReviewSummary(event.target.value)}
                    rows={3}
                    placeholder={t('reviewSummaryPlaceholder')}
                    className="mt-1.5 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 disabled:cursor-not-allowed disabled:bg-stone-100"
                    disabled={disabled || exitingFileName === stored.fileName}
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-stone-500">{t('rankingLabel')}</div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <input
                      value={reviewFoodScore}
                      onChange={(event) => setReviewFoodScore(event.target.value)}
                      type="number"
                      min="0"
                      max="100"
                      inputMode="numeric"
                      placeholder={t('foodRank')}
                      aria-label={t('foodRank')}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={disabled || exitingFileName === stored.fileName}
                    />
                    <input
                      value={reviewSceneryScore}
                      onChange={(event) => setReviewSceneryScore(event.target.value)}
                      type="number"
                      min="0"
                      max="100"
                      inputMode="numeric"
                      placeholder={t('sceneryRank')}
                      aria-label={t('sceneryRank')}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={disabled || exitingFileName === stored.fileName}
                    />
                    <input
                      value={reviewExperienceScore}
                      onChange={(event) => setReviewExperienceScore(event.target.value)}
                      type="number"
                      min="0"
                      max="100"
                      inputMode="numeric"
                      placeholder={t('experienceRank')}
                      aria-label={t('experienceRank')}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={disabled || exitingFileName === stored.fileName}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={cancelObjectReview}
                    className="rounded-md border border-stone-200 bg-white px-2 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950"
                    disabled={exitingFileName === stored.fileName}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                    disabled={
                      disabled ||
                      exitingFileName === stored.fileName ||
                      reviewSummary.trim().length === 0
                    }
                  >
                    {exitingFileName === stored.fileName ? t('writing') : t('writeInReview')}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
      )}
    </article>
  );
}
