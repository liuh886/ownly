import { useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import type { WYQDStoredEntity } from '@/core/repository';
import type { WYQDObject } from '@/domain/types';
import { ObjectComposer } from './ObjectComposer';
import { getDetailRows, getTimelineRows, getTypeLabels } from './ObjectListUtils';

export function ObjectDetailPanel({
  stored,
  onClose,
  onSave,
  disabled,
}: {
  stored: WYQDStoredEntity<WYQDObject>;
  onClose: () => void;
  onSave?: (updatedObject: WYQDObject, body: string) => Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState('');
  const object = stored.entity;
  const detailRows = getDetailRows(object, t);
  const timelineRows = getTimelineRows(object, t).filter((row) => row.value);
  const body = stored.body.trim();

  // Enter edit mode: initialize body draft
  const handleStartEdit = () => {
    setBodyDraft(body);
    setIsEditing(true);
  };

  // Save structured fields via ObjectComposer, then save body
  const handleComposerSubmit = async (updatedObject: WYQDObject) => {
    if (!onSave) return;
    // Save structured fields + user-edited body
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

        {/* Markdown body — editable alongside structured fields */}
        <div className="mt-4 border-t border-stone-200 pt-4">
          <label className="text-xs font-medium text-stone-500">{t('markdownBody')}</label>
          <textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            rows={6}
            className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs leading-5 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 resize-none font-mono"
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
        <div className="flex shrink-0 gap-2">
          {onSave ? (
            <button
              type="button"
              onClick={handleStartEdit}
              className="h-10 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800"
            >
              {t('edit')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950"
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

      <div className="mt-6 border-t border-stone-100 pt-6">
        <h3 className="text-sm font-semibold text-stone-950">{t('markdownBody')}</h3>
        <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-4 text-sm leading-relaxed text-stone-600">
          {body || t('noBody')}
        </div>
      </div>
    </motion.section>
  );
}
