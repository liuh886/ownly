import { useI18n } from '@/core/i18n-context';

interface ObjectPaginationProps {
  hiddenCount: number;
  onShowAll: () => void;
  label: string;
}

export function ObjectPagination({ hiddenCount, onShowAll, label }: ObjectPaginationProps) {
  const { t } = useI18n();

  if (hiddenCount <= 0) return null;

  return (
    <button
      type="button"
      onClick={onShowAll}
      className="flex w-full items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 py-3 text-sm font-medium text-stone-500 transition hover:border-stone-400 hover:bg-stone-100 hover:text-stone-900"
    >
      {t('showMore')} ({hiddenCount})
      {label ? ` ${label}` : ''}
    </button>
  );
}
