'use client';

import type { ArchivedStoredEntity, ArchiveEntityType } from '@/services/MarkdownEntityRepository';

const archiveTypeLabels: Record<ArchiveEntityType, string> = {
  object: '对象',
  snapshot: '账户快照',
  review: '复盘',
};

function formatArchiveDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '未知时间';
  return value.slice(0, 10);
}

export function ArchivePanel({
  disabled,
  archivedEntities,
  onRestore,
}: {
  disabled?: boolean;
  archivedEntities: ArchivedStoredEntity[];
  onRestore: (archiveType: ArchiveEntityType, archiveFileName: string) => Promise<void>;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white/90 p-4 shadow-sm shadow-stone-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-950">归档箱</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            删除后的对象、账户快照和复盘会先进入归档箱，可恢复到原目录。
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
          {archivedEntities.length}
        </span>
      </div>

      {archivedEntities.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-stone-200 px-3 py-4 text-sm text-stone-500">
          暂无归档数据。
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
                      {archiveTypeLabels[item.archiveType]}
                    </span>
                    <p className="truncate text-sm font-semibold text-stone-950">
                      {item.entity.title}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    归档于 {formatArchiveDate(item.entity.archived_at)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRestore(item.archiveType, item.fileName)}
                  className="min-h-10 shrink-0 rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  恢复
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
