'use client';

import { useI18n } from '@/core/i18n-context';
import type { WYQDArchivedStoredEntity, WYQDArchiveEntityType } from '@/core/repository';

function archiveTypeLabels(t: ReturnType<typeof useI18n>['t']): Record<WYQDArchiveEntityType, string> {
  return {
    object: t('objects'),
    account: t('accounts'),
    snapshot: t('snapshots'),
    review: t('reviews'),
  };
}

function formatArchiveDate(value: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (typeof value !== 'string' || !value) return t('unknownTime');
  return value.slice(0, 10);
}

export function ArchivePanel({
  disabled,
  archivedEntities,
  onRestore,
}: {
  disabled?: boolean;
  archivedEntities: WYQDArchivedStoredEntity[];
  onRestore: (archiveType: WYQDArchiveEntityType, archiveFileName: string) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-950">{t('archiveBox')}</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {t('archiveBoxDesc')}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
          {archivedEntities.length}
        </span>
      </div>

      {archivedEntities.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-stone-200 px-3 py-4 text-sm text-stone-500">
          {t('noArchivedData')}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {archivedEntities.map((item) => (
            <article
              key={`${item.archiveType}:${item.fileName}`}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      {archiveTypeLabels(t)[item.archiveType]}
                    </span>
                    <p className="truncate text-sm font-semibold text-stone-950">
                      {item.entity.title}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {t('archivedAt').replace('{date}', formatArchiveDate(item.entity.archived_at, t))}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRestore(item.archiveType, item.fileName)}
                  className="min-h-10 shrink-0 rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {t('restore')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
