import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import type { WYQDStoredEntity } from '@/core/repository';
import type { ObjectLogEntry, ObjectLogEventType, WYQDObject } from '@/domain/types';
import { ObjectComposer } from './ObjectComposer';
import { getDetailRows, getTimelineRows, getTypeLabels, type TranslateFn } from './ObjectListUtils';

function getEventBadge(eventType: ObjectLogEventType, t: TranslateFn) {
  switch (eventType) {
    case 'usage':
      return {
        label: t('logEventUsage'),
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        dotClass: 'bg-emerald-500',
      };
    case 'maintenance':
      return {
        label: t('logEventMaintenance'),
        className: 'bg-blue-50 text-blue-700 border-blue-200/80',
        dotClass: 'bg-blue-500',
      };
    case 'issue':
      return {
        label: t('logEventIssue'),
        className: 'bg-amber-50 text-amber-700 border-amber-200/80',
        dotClass: 'bg-amber-500',
      };
    case 'regret':
      return {
        label: t('logEventRegret'),
        className: 'bg-rose-50 text-rose-700 border-rose-200/80',
        dotClass: 'bg-rose-500',
      };
    case 'lesson':
      return {
        label: t('logEventLesson'),
        className: 'bg-purple-50 text-purple-700 border-purple-200/80',
        dotClass: 'bg-purple-500',
      };
    case 'exit_note':
      return {
        label: t('logEventExitNote'),
        className: 'bg-stone-100 text-stone-700 border-stone-300',
        dotClass: 'bg-stone-500',
      };
    case 'comparison':
      return {
        label: t('logEventComparison'),
        className: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
        dotClass: 'bg-indigo-500',
      };
    default:
      return {
        label: eventType,
        className: 'bg-stone-50 text-stone-600 border-stone-200',
        dotClass: 'bg-stone-400',
      };
  }
}

export function ObjectDetailPanel({
  stored,
  logs,
  onClose,
  onSave,
  onDelete,
  deleting,
  disabled,
}: {
  stored: WYQDStoredEntity<WYQDObject>;
  logs?: WYQDStoredEntity<ObjectLogEntry>[];
  onClose: () => void;
  onSave?: (updatedObject: WYQDObject, body: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  deleting?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState('');
  const object = stored.entity;
  const detailRows = getDetailRows(object, t);
  const timelineRows = getTimelineRows(object, t).filter((row) => row.value);
  const body = stored.body.trim();

  const objectLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    const validTargets = new Set(
      [
        object.id,
        stored.fileName,
        stored.fileName.replace(/\.md$/, ''),
      ].filter((id): id is string => Boolean(id))
    );
    return logs
      .filter((l) => validTargets.has(l.entity.target_id))
      .sort((a, b) => {
        const dateA = a.entity.occurred_at || a.entity.created_at || '';
        const dateB = b.entity.occurred_at || b.entity.created_at || '';
        return dateB.localeCompare(dateA);
      });
  }, [logs, object.id, stored.fileName]);

  const handleStartEdit = () => {
    setBodyDraft(body);
    setIsEditing(true);
  };

  const handleComposerSubmit = async (updatedObject: WYQDObject) => {
    if (!onSave) return;
    await onSave(updatedObject, bodyDraft);
    setIsEditing(false);
  };

  if (isEditing && onSave) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <ObjectComposer
          disabled={disabled}
          initialObject={object}
          submitLabel={t('saveChanges')}
          onCancel={() => setIsEditing(false)}
          onSubmit={handleComposerSubmit}
        />

        <div className="mt-4 border-t border-stone-200 pt-4">
          <label className="text-xs font-medium text-stone-500">{t('markdownBody')}</label>
          <textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            rows={6}
            className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2.5 font-mono text-xs leading-5 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50"
            disabled={disabled}
          />
          <p className="mt-1 text-[11px] text-stone-400">{t('markdownBodyLabel')}</p>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500">{getTypeLabels(t)[object.object_type]}</div>
          <h2 className="mt-1 break-words text-xl font-semibold tracking-tight text-stone-950">{object.title}</h2>
          <p className="mt-1 break-all text-xs text-stone-400">{stored.fileName}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {onSave ? (
            <button
              type="button"
              onClick={handleStartEdit}
              className="h-10 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800"
              disabled={disabled || deleting}
            >
              {t('edit')}
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || deleting}
            >
              {deleting ? '…' : t('delete')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deleting}
          >
            {t('close')}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {detailRows.map((row) => (
          <div key={row.label} className="rounded-lg bg-stone-50 px-3 py-2">
            <div className="text-xs text-stone-400">{row.label}</div>
            <div className="mt-1 break-words text-sm font-medium text-stone-900">{row.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-stone-950">{t('lifecycle')}</h3>
        {timelineRows.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {timelineRows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="flex items-center gap-3 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                <span className="text-stone-500">{row.label}</span>
                <span className="font-medium text-stone-900">{row.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-500">{t('noDisplayableRecords')}</p>
        )}
      </div>

      {/* Experience & Lifecycle Logs */}
      <div className="mt-6 border-t border-stone-100 pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-950 flex items-center gap-2">
            <span>{t('objectExperienceLogs')}</span>
            {objectLogs.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                {objectLogs.length}
              </span>
            )}
          </h3>
        </div>

        {objectLogs.length > 0 ? (
          <div className="mt-4 space-y-3">
            {objectLogs.map((logStored) => {
              const log = logStored.entity;
              const badge = getEventBadge(log.event_type, t);
              const date = log.occurred_at || log.created_at;
              const logBody = logStored.body.trim();

              return (
                <div
                  key={logStored.fileName || log.id}
                  className="rounded-lg border border-stone-200/70 bg-stone-50/60 p-3.5 text-xs transition hover:border-stone-300"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                        {badge.label}
                      </span>
                      {date && (
                        <span className="text-stone-400">
                          {date}
                        </span>
                      )}
                    </div>
                    {log.source && (
                      <span className="text-[10px] text-stone-400 font-mono">
                        {log.source}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs font-medium leading-relaxed text-stone-900">
                    {log.summary}
                  </p>

                  {log.lesson && (
                    <div className="mt-2 rounded-md bg-white border border-stone-200/60 p-2 text-[11px] text-stone-700">
                      <span className="font-medium text-stone-900">{t('logLessonTitle')}: </span>
                      {log.lesson}
                    </div>
                  )}

                  {logBody && logBody !== log.summary && (
                    <div className="mt-2 text-[11px] leading-relaxed text-stone-500 whitespace-pre-wrap font-mono">
                      {logBody}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs text-stone-400 leading-relaxed">
            {t('objectExperienceLogsEmpty')}
          </p>
        )}
      </div>

      <div className="mt-6 border-t border-stone-100 pt-6">
        <h3 className="text-sm font-semibold text-stone-950">{t('markdownBody')}</h3>
        <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-4 text-sm leading-relaxed text-stone-600">
          {body || t('noBody')}
        </div>
      </div>
    </motion.section>
  );
}
