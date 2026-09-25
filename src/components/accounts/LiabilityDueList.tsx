import type { LiabilityDue } from '@/domain/liability-due';
import type { WYQDTranslationKey } from '@/core/i18n';
import { formatDueLabel } from '@/lib/format';

function rowToneClass(days: number): string {
  if (days < 0) return 'border-red-200 bg-red-50';
  if (days <= 30) return 'border-amber-200 bg-amber-50';
  return 'border-stone-200 bg-stone-50';
}

function chipToneClass(days: number): string {
  if (days < 0) return 'bg-red-600 text-white';
  if (days <= 30) return 'bg-amber-500 text-white';
  return 'bg-white text-stone-600';
}

function DueRowContent({
  due,
  t,
  formatMoney,
}: {
  due: LiabilityDue;
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (val: number | null | undefined, fallback?: string) => string;
}) {
  return (
    <>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-stone-900">{due.account}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${chipToneClass(due.days_until)}`}>
            {formatDueLabel(due.due_date, t)}
          </span>
          <span className="text-[11px] text-stone-500">{due.due_date.replaceAll('-', '/')}</span>
        </div>
      </div>
      <div className="shrink-0 text-sm font-semibold text-stone-950">
        {formatMoney(due.amount)}
      </div>
    </>
  );
}

export function LiabilityDueList({
  dues,
  t,
  formatMoney,
  onSelect,
}: {
  dues: LiabilityDue[];
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (val: number | null | undefined, fallback?: string) => string;
  onSelect?: () => void;
}) {
  return (
    <div className="space-y-2">
      {dues.map((due) => {
        const key = due.account_id || `${due.account}-${due.due_date}`;
        const rowClass = `flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left ${rowToneClass(due.days_until)}`;

        if (!onSelect) {
          return (
            <div key={key} className={rowClass}>
              <DueRowContent due={due} t={t} formatMoney={formatMoney} />
            </div>
          );
        }

        return (
          <button
            key={key}
            type="button"
            onClick={onSelect}
            className={`${rowClass} transition hover:border-stone-400`}
          >
            <DueRowContent due={due} t={t} formatMoney={formatMoney} />
          </button>
        );
      })}
    </div>
  );
}
