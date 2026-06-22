import { useI18n } from '@/core/i18n-context';
import { useFormatMoney } from '@/lib/use-format';
import { FilterChip } from '@/components/common/ui-primitives';
import type { ObjectControlBucket, ObjectStatusGroupFilter, ObjectTypeFilter, PhysicalFilter, SortOption } from './useObjectFilterSort';
import type { TranslateFn } from './ObjectListUtils';

interface ObjectConsoleProps {
  objectsCount: number;
  allPhysicalObjectsCount: number;
  totalCost: number;
  ownedPhysicalObjectsCount: number;
  totalResidualValue: number;
  averageDailyCost: number;
  observingObjectsCount: number;
  observingAmount: number;
  controlCounts: Record<ObjectControlBucket, number>;
  controlBucketFilter: ObjectControlBucket | null;
  applyControlBucket: (bucket: ObjectControlBucket | null) => void;
  query: string;
  setQuery: (query: string) => void;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  typeFilter: ObjectTypeFilter;
  setTypeFilter: (filter: ObjectTypeFilter) => void;
  statusGroupFilter: ObjectStatusGroupFilter;
  setStatusGroupFilter: (group: ObjectStatusGroupFilter) => void;
  filter: PhysicalFilter;
  setFilter: (filter: PhysicalFilter) => void;
  closeInlinePanels: () => void;
  getSortLabels: (t: TranslateFn) => Record<SortOption, string>;
  objectTypeFilterLabels: Record<ObjectTypeFilter, string>;
  getObjectTypeFilterCount: (type: ObjectTypeFilter) => number;
  objectStatusGroupLabels: Record<ObjectStatusGroupFilter, string>;
  getObjectStatusGroupCount: (group: ObjectStatusGroupFilter) => number;
  filterLabels: Record<PhysicalFilter, string>;
  visiblePhysicalFilterCounts: Record<PhysicalFilter, number>;
  objectControlLabels: Record<ObjectControlBucket, { title: string; description: string; statusGroup: ObjectStatusGroupFilter; typeFilter: ObjectTypeFilter }>;
  hasPhysicalObjects: boolean;
}

export function ObjectConsole({
  objectsCount,
  allPhysicalObjectsCount,
  totalCost,
  ownedPhysicalObjectsCount,
  totalResidualValue,
  averageDailyCost,
  observingObjectsCount,
  observingAmount,
  controlCounts,
  controlBucketFilter,
  applyControlBucket,
  query,
  setQuery,
  sortBy,
  setSortBy,
  typeFilter,
  setTypeFilter,
  statusGroupFilter,
  setStatusGroupFilter,
  filter,
  setFilter,
  closeInlinePanels,
  getSortLabels,
  objectTypeFilterLabels,
  getObjectTypeFilterCount,
  objectStatusGroupLabels,
  getObjectStatusGroupCount,
  filterLabels,
  visiblePhysicalFilterCounts,
  objectControlLabels,
  hasPhysicalObjects,
}: ObjectConsoleProps) {
  const { t } = useI18n();
  const { formatMoney } = useFormatMoney();

  return (
    <>
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold tracking-tight text-stone-950">{t('physicalAssets')}</h2>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-stone-500">{t('totalAcquisitionCost')}（{allPhysicalObjectsCount}）</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">
              {formatMoney(totalCost)}
            </div>
          </div>
          <div>
            <div className="text-xs text-stone-500">{t('physicalAssetValue')}（{ownedPhysicalObjectsCount}）</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">
              {formatMoney(totalResidualValue)}
            </div>
          </div>
          <div>
            <div className="text-xs text-stone-500">{t('dailyCostAvg')}（{ownedPhysicalObjectsCount}）</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">
              {formatMoney(averageDailyCost)}
              <span className="ml-1 text-xs font-medium text-stone-400">{t('perDay')}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-stone-500">{t('observeAmount')}（{observingObjectsCount}）</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">
              {formatMoney(observingAmount)}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('objectConsoleTitle')}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {t('objectConsoleSubtitle')}
            </p>
          </div>
          <span className="w-fit rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {t('objectsCount').replace('{count}', String(objectsCount))}
          </span>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(objectControlLabels) as ObjectControlBucket[]).map((bucket) => {
            const item = objectControlLabels[bucket];
            const isActive = controlBucketFilter === bucket;

            return (
              <button
                key={bucket}
                type="button"
                onClick={() => applyControlBucket(bucket)}
                aria-pressed={isActive}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  isActive
                    ? 'border-stone-950 bg-stone-950 text-white'
                    : 'border-stone-200 bg-stone-50 hover:border-stone-400'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`text-xs font-medium ${isActive ? 'text-stone-300' : 'text-stone-500'}`}
                  >
                    {item.title}
                  </span>
                  <span className="font-mono text-lg font-semibold">{controlCounts[bucket]}</span>
                </div>
                <div className={`mt-2 text-xs ${isActive ? 'text-stone-300' : 'text-stone-500'}`}>
                  {item.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          <label className="min-w-0 flex-1">
            <input
              value={query}
              onChange={(event) => {
                closeInlinePanels();
                setQuery(event.target.value);
                applyControlBucket(null);
              }}
              placeholder={t('searchByNameCategoryStatus')}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50"
            />
          </label>
          <label className="shrink-0">
            <span className="sr-only">{t('sortBy')}</span>
            <select
              value={sortBy}
              onChange={(event) => {
                closeInlinePanels();
                setSortBy(event.target.value as SortOption);
              }}
              className="h-full cursor-pointer rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs font-medium text-stone-700 outline-none transition hover:border-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50"
            >
              {(Object.keys(getSortLabels(t)) as SortOption[]).map((option) => (
                <option key={option} value={option}>
                  {getSortLabels(t)[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={t('filterByType')}>
          {(Object.keys(objectTypeFilterLabels) as ObjectTypeFilter[]).map((item) => (
              <FilterChip
                key={item}
                onClick={() => {
                  closeInlinePanels();
                  setTypeFilter(item);
                  applyControlBucket(null);
              }}
                active={typeFilter === item}
              >
                {objectTypeFilterLabels[item]} ({getObjectTypeFilterCount(item)})
              </FilterChip>
          ))}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={t('filterByStatus')}>
          {(Object.keys(objectStatusGroupLabels) as ObjectStatusGroupFilter[]).map((item) => (
              <FilterChip
                key={item}
                onClick={() => {
                  closeInlinePanels();
                  setStatusGroupFilter(item);
                  applyControlBucket(null);
              }}
                active={statusGroupFilter === item}
              >
                {objectStatusGroupLabels[item]} ({getObjectStatusGroupCount(item)})
              </FilterChip>
          ))}
        </div>
        {hasPhysicalObjects ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={t('filterByPhysicalStatus')}>
            {(Object.keys(filterLabels) as PhysicalFilter[]).map((item) => (
              <FilterChip
                key={item}
                onClick={() => {
                  closeInlinePanels();
                  setFilter(item);
                  applyControlBucket(null);
                }}
                active={filter === item}
              >
                {filterLabels[item]} ({visiblePhysicalFilterCounts[item]})
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
