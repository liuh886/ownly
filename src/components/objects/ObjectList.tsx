'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { StoredEntity } from '@/services/MarkdownEntityRepository';
import type {
  OneTimeExperienceObject,
  PhysicalObject,
  PhysicalStatus,
  RecurringCostObject,
  WYQDObject,
} from '@/domain/types';
import {
  calculateHoldingDays,
  calculatePhysicalAcquisitionCost,
  calculatePhysicalDailyCost,
  calculateNextBillingDate,
  calculateRecurringMonthlyCost,
} from '@/domain/calculations';
import { ObjectComposer } from './ObjectComposer';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';

type TranslateFn = (key: WYQDTranslationKey) => string;

function getTypeLabels(t: TranslateFn): Record<WYQDObject['object_type'], string> {
  return {
    physical: t('typePhysical'),
    recurring_cost: t('typeRecurringCost'),
    one_time_experience: t('typeExperience'),
  };
}

function getPhysicalStatusLabels(t: TranslateFn): Record<PhysicalStatus, string> {
  return {
    seeded: t('statusSeeded'),
    observing: t('statusObserving'),
    purchased: t('statusPurchased'),
    using: t('statusUsing'),
    idle: t('statusIdle'),
    transferred: t('statusTransferred'),
    discarded: t('statusDiscarded'),
  };
}

function getRecurringStatusLabels(t: TranslateFn): Record<string, string> {
  return {
    seeded: t('statusSeeded'),
    active: t('statusActive'),
    paused: t('statusPaused'),
    cancelled: t('statusCancelled'),
  };
}

function getExperienceStatusLabels(t: TranslateFn): Record<string, string> {
  return {
    planned: t('statusPlanned'),
    in_progress: t('statusInProgress'),
    completed: t('statusCompleted'),
    reviewed: t('statusReviewed'),
  };
}

function getBillingCycleLabels(t: TranslateFn): Record<string, string> {
  return {
    weekly: t('billingCycleWeekly'),
    monthly: t('billingCycleMonthly'),
    quarterly: t('billingCycleQuarterly'),
    annual: t('billingCycleAnnual'),
    custom: t('billingCycleCustom'),
  };
}

function getSupportingVisuals(
  t: TranslateFn,
): Record<
  Exclude<WYQDObject['object_type'], 'physical'>,
  {
    label: string;
    shortLabel: string;
    accentClass: string;
    badgeClass: string;
    dotClass: string;
    amountLabel: string;
  }
> {
  return {
    recurring_cost: {
      label: t('typeRecurringCost'),
      shortLabel: t('filterRecurringCost'),
      accentClass: 'bg-sky-500',
      badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
      dotClass: 'bg-sky-500',
      amountLabel: '周期金额',
    },
    one_time_experience: {
      label: t('typeExperience'),
      shortLabel: t('filterExperience'),
      accentClass: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      dotClass: 'bg-emerald-500',
      amountLabel: '预算/实际',
    },
  };
}

function getPrimaryAmount(object: WYQDObject): number {
  if (object.object_type === 'physical') {
    return calculatePhysicalAcquisitionCost(object);
  }
  if (object.object_type === 'recurring_cost') {
    return object.billing_amount || 0;
  }
  return object.budget_total || object.actual_total || 0;
}

function formatMoney(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function formatOptional(value: string | number | null | undefined, t: TranslateFn): string {
  if (value === null || value === undefined || value === '') return t('notRecorded');
  return String(value);
}

function parseRank(value: string): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1) return null;
  return Math.floor(numberValue);
}

function daysUntil(date: string): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(`${date}T00:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

function formatDueLabel(date: string, t: TranslateFn): string {
  const days = daysUntil(date);
  if (days === 0) return t('dueToday');
  if (days === 1) return t('dueTomorrow');
  if (days > 1) return t('daysLater').replace('{count}', String(days));
  return t('daysPast').replace('{count}', String(Math.abs(days)));
}

function getDailyCost(object: WYQDObject): number | null {
  if (object.object_type !== 'physical') return null;
  return calculatePhysicalDailyCost(object);
}

function getServiceDays(object: WYQDObject): number | null {
  if (object.object_type !== 'physical') return null;
  return calculateHoldingDays(object);
}

function formatDateRange(object: WYQDObject): string {
  if (object.object_type === 'physical') {
    const start = object.purchased_at || object.created_at;
    const end = object.ended_at || '至今';
    return `${start} - ${end}`;
  }
  if (object.object_type === 'recurring_cost') {
    return object.started_at || object.created_at;
  }
  return object.ended_at || object.reviewed_at || object.started_at || object.planned_at || object.created_at;
}

function getSupportingTimeLabel(object: WYQDObject): string {
  if (object.object_type === 'recurring_cost') return '开始时间';
  if (object.object_type === 'one_time_experience') return '完成时间';
  return '时间';
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

type PhysicalFilter = 'all' | 'active' | 'retired' | 'sold';
type ObjectTypeFilter = 'all' | WYQDObject['object_type'];
type ObjectStatusGroupFilter = 'all' | 'observing' | 'using' | 'exited';
type ObjectControlBucket = 'attention' | 'active' | 'review' | 'closed';

export interface ObjectListFocus {
  token: number;
  query?: string;
  typeFilter?: ObjectTypeFilter;
  physicalFilter?: PhysicalFilter;
  statusGroupFilter?: ObjectStatusGroupFilter;
}

function getFilterLabels(t: TranslateFn): Record<PhysicalFilter, string> {
  return {
    all: t('filterAll'),
    active: t('statusUsing'),
    retired: t('statusIdle'),
    sold: t('statusTransferred'),
  };
}

function getObjectTypeFilterLabels(t: TranslateFn): Record<ObjectTypeFilter, string> {
  return {
    all: t('filterAllTypes'),
    physical: t('typePhysical'),
    recurring_cost: t('typeRecurringCost'),
    one_time_experience: t('typeExperience'),
  };
}

function getObjectStatusGroupLabels(t: TranslateFn): Record<ObjectStatusGroupFilter, string> {
  return {
    all: t('filterAll'),
    observing: t('observing'),
    using: t('inUse'),
    exited: t('exited'),
  };
}

function getObjectControlLabels(
  t: TranslateFn,
): Record<
  ObjectControlBucket,
  { title: string; description: string; statusGroup: ObjectStatusGroupFilter; typeFilter: ObjectTypeFilter }
> {
  return {
    attention: {
      title: t('pendingDecisions'),
      description: '种草、观察、计划中的对象',
      statusGroup: 'observing',
      typeFilter: 'all',
    },
    active: {
      title: t('inUse'),
      description: '正在消耗价值或成本',
      statusGroup: 'using',
      typeFilter: 'all',
    },
    review: {
      title: t('pendingReview'),
      description: '已完成但未进入排行榜',
      statusGroup: 'exited',
      typeFilter: 'one_time_experience',
    },
    closed: {
      title: t('exited'),
      description: '已退役、取消或完成',
      statusGroup: 'exited',
      typeFilter: 'all',
    },
  };
}

function isPhysicalObject(object: WYQDObject): object is PhysicalObject {
  return object.object_type === 'physical';
}

function getPhysicalBucket(status: PhysicalStatus): Exclude<PhysicalFilter, 'all'> {
  if (status === 'transferred') return 'sold';
  if (status === 'idle' || status === 'discarded') return 'retired';
  return 'active';
}

function getStatusLabel(object: WYQDObject, t: TranslateFn): string {
  if (object.object_type === 'physical') return getPhysicalStatusLabels(t)[object.status];
  if (object.object_type === 'recurring_cost') {
    return getRecurringStatusLabels(t)[object.status] || String(object.status);
  }
  return getExperienceStatusLabels(t)[object.status] || String(object.status);
}

function matchesQuery(object: WYQDObject, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [object.title, object.category, object.status, object.object_type]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function matchesStatusGroup(object: WYQDObject, group: ObjectStatusGroupFilter): boolean {
  if (group === 'all') return true;
  if (group === 'observing') {
    return ['seeded', 'observing', 'planned'].includes(object.status);
  }
  if (group === 'using') {
    return ['purchased', 'using', 'active', 'in_progress'].includes(object.status);
  }
  return ['idle', 'transferred', 'discarded', 'cancelled', 'completed', 'reviewed'].includes(
    object.status,
  );
}

function getObjectTypeFilterCount(
  objects: StoredEntity<WYQDObject>[],
  typeFilter: ObjectTypeFilter,
  statusGroupFilter: ObjectStatusGroupFilter,
  query: string,
): number {
  return objects.filter((stored) => {
    const object = stored.entity;
    return (
      (typeFilter === 'all' || object.object_type === typeFilter) &&
      matchesStatusGroup(object, statusGroupFilter) &&
      matchesQuery(object, query)
    );
  }).length;
}

function getObjectStatusGroupCount(
  objects: StoredEntity<WYQDObject>[],
  statusGroupFilter: ObjectStatusGroupFilter,
  typeFilter: ObjectTypeFilter,
  query: string,
): number {
  return objects.filter((stored) => {
    const object = stored.entity;
    return (
      matchesStatusGroup(object, statusGroupFilter) &&
      (typeFilter === 'all' || object.object_type === typeFilter) &&
      matchesQuery(object, query)
    );
  }).length;
}

function getSupportingActionLabel(object: WYQDObject, t: TranslateFn): string | null {
  if (object.object_type === 'recurring_cost') {
    if (object.status === 'active') return t('pause');
    if (object.status === 'paused' || object.status === 'seeded') return t('resume');
    return null;
  }
  if (object.object_type === 'one_time_experience') {
    if (object.status === 'planned') return t('start');
    if (object.status === 'in_progress') return t('complete');
    if (object.status === 'completed') return t('reviewAction');
  }
  return null;
}

function getSupportingActionIcon(object: WYQDObject): string {
  if (object.object_type === 'recurring_cost') {
    return object.status === 'active' ? '⏸️' : '▶️';
  }
  if (object.object_type === 'one_time_experience') {
    if (object.status === 'planned') return '▶️';
    if (object.status === 'in_progress') return '✅';
    if (object.status === 'completed') return '📝';
  }
  return '▶️';
}

function canCancelRecurringCost(object: WYQDObject): object is RecurringCostObject {
  return (
    object.object_type === 'recurring_cost' &&
    (object.status === 'active' || object.status === 'paused' || object.status === 'seeded')
  );
}

function getSupportingMeta(object: WYQDObject, nextBillingDate: string | null, t: TranslateFn): string {
  if (object.object_type === 'recurring_cost') {
    const cycle = getBillingCycleLabels(t)[object.billing_cycle || 'monthly'] || t('billingCycleMonthly');
    const account = object.payment_account ? ` · ${object.payment_account}` : '';
    const next = nextBillingDate ? ` · ${t('nextBilling').replace('{date}', nextBillingDate)}` : '';
    return `${cycle}${account}${next}`;
  }

  return `${getSupportingTimeLabel(object)}：${formatDateRange(object)}`;
}

function getPhysicalAccentClasses(bucket: Exclude<PhysicalFilter, 'all'>): {
  stripe: string;
  badge: string;
  dot: string;
} {
  if (bucket === 'active') {
    return {
      stripe: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      dot: 'bg-emerald-500',
    };
  }
  if (bucket === 'retired') {
    return {
      stripe: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-700 ring-amber-200',
      dot: 'bg-amber-500',
    };
  }
  return {
    stripe: 'bg-stone-400',
    badge: 'bg-stone-50 text-stone-600 ring-stone-200',
    dot: 'bg-stone-400',
  };
}

function getObjectControlBucket(object: WYQDObject): ObjectControlBucket {
  if (object.object_type === 'one_time_experience' && object.status === 'completed') {
    return 'review';
  }
  if (['seeded', 'observing', 'planned'].includes(object.status)) return 'attention';
  if (['purchased', 'using', 'active', 'in_progress'].includes(object.status)) return 'active';
  return 'closed';
}

function getPriorityReason(object: WYQDObject, t: TranslateFn): string {
  if (object.object_type === 'one_time_experience' && object.status === 'completed') {
    return '待写入复盘与排行榜';
  }
  if (object.object_type === 'recurring_cost' && object.status === 'active') {
    const nextBillingDate = calculateNextBillingDate(object);
    return nextBillingDate ? `${t('nextBilling').replace('{date}', formatDueLabel(nextBillingDate, t))}` : '订阅中，建议定期复核';
  }
  if (object.object_type === 'physical' && ['seeded', 'observing'].includes(object.status)) {
    return '还在观察，等待买入/放弃决策';
  }
  if (object.object_type === 'one_time_experience' && object.status === 'planned') {
    return '计划中，等待开始或调整';
  }
  if (object.object_type === 'recurring_cost' && object.status === 'seeded') {
    return '候选订阅，等待开通决策';
  }
  return `${getTypeLabels(t)[object.object_type]} · ${getStatusLabel(object, t)}`;
}

function getPriorityScore(object: WYQDObject): number {
  if (object.object_type === 'one_time_experience' && object.status === 'completed') return 0;
  if (object.object_type === 'recurring_cost' && object.status === 'active') {
    const nextBillingDate = calculateNextBillingDate(object);
    if (!nextBillingDate) return 2;
    const days = daysUntil(nextBillingDate);
    if (days <= 3) return 0.5;
    if (days <= 14) return 1;
    return 2;
  }
  if (['seeded', 'observing', 'planned'].includes(object.status)) return 3;
  if (object.object_type === 'one_time_experience' && object.status === 'in_progress') return 4;
  return 9;
}

function transitionSupportingObject(object: WYQDObject): WYQDObject {
  const updatedAt = todayISO();
  if (object.object_type === 'recurring_cost') {
    const nextStatus = object.status === 'active' ? 'paused' : 'active';
    const next: RecurringCostObject = {
      ...object,
      status: nextStatus,
      updated_at: updatedAt,
      paused_at: nextStatus === 'paused' ? updatedAt : null,
    };
    return next;
  }
  if (object.object_type === 'one_time_experience') {
    const nextStatus =
      object.status === 'planned'
        ? 'in_progress'
        : object.status === 'in_progress'
          ? 'completed'
          : 'reviewed';
    const next: OneTimeExperienceObject = {
      ...object,
      status: nextStatus,
      updated_at: updatedAt,
      started_at: object.started_at || (nextStatus === 'in_progress' ? updatedAt : undefined),
      ended_at: object.ended_at || (nextStatus === 'completed' ? updatedAt : object.ended_at),
      reviewed_at: nextStatus === 'reviewed' ? updatedAt : object.reviewed_at,
    };
    return next;
  }
  return object;
}

function getDetailRows(object: WYQDObject, t: TranslateFn): Array<{ label: string; value: string }> {
  if (object.object_type === 'physical') {
    const dailyCost = calculatePhysicalDailyCost(object);
    return [
      { label: t('type'), value: getTypeLabels(t)[object.object_type] },
      { label: t('status'), value: getStatusLabel(object, t) },
      { label: t('categoryLabel'), value: formatOptional(object.category, t) },
      { label: t('totalAcquisitionCost'), value: formatMoney(calculatePhysicalAcquisitionCost(object)) },
      { label: '日均体验成本', value: dailyCost ? `${formatMoney(dailyCost)}/天` : t('noFormed') },
      { label: t('purchaseDate'), value: formatOptional(object.purchased_at, t) },
      { label: t('endDate'), value: formatOptional(object.ended_at, t) },
      { label: '回收金额', value: formatMoney(object.recovered_amount || 0) },
    ];
  }
  if (object.object_type === 'recurring_cost') {
    const monthlyCost = calculateRecurringMonthlyCost(object);
    return [
      { label: t('type'), value: getTypeLabels(t)[object.object_type] },
      { label: t('status'), value: getStatusLabel(object, t) },
      { label: t('categoryLabel'), value: formatOptional(object.category, t) },
      { label: t('billingCycle'), value: getBillingCycleLabels(t)[object.billing_cycle || 'monthly'] || t('billingCycleMonthly') },
      { label: '周期金额', value: formatMoney(object.billing_amount || 0) },
      { label: '折算月成本', value: formatMoney(monthlyCost) },
      { label: t('annualCost'), value: formatMoney(object.annualized_cost || monthlyCost * 12) },
      { label: t('startDate'), value: formatOptional(object.started_at, t) },
      { label: t('billingDay'), value: object.billing_day ? `每期 ${object.billing_day} 日` : t('notRecorded') },
      { label: t('paymentAccount'), value: formatOptional(object.payment_account, t) },
      { label: '暂停日期', value: formatOptional(object.paused_at, t) },
      { label: '取消日期', value: formatOptional(object.cancelled_at, t) },
    ];
  }
  return [
    { label: t('type'), value: getTypeLabels(t)[object.object_type] },
    { label: t('status'), value: getStatusLabel(object, t) },
    { label: t('categoryLabel'), value: formatOptional(object.category, t) },
    { label: '预算', value: formatMoney(object.budget_total || 0) },
    { label: t('actualAmount'), value: object.actual_total ? formatMoney(object.actual_total) : t('notRecorded') },
    { label: '计划日期', value: formatOptional(object.planned_at, t) },
    { label: t('startDate'), value: formatOptional(object.started_at, t) },
    { label: t('endDate'), value: formatOptional(object.ended_at, t) },
    { label: '复盘日期', value: formatOptional(object.reviewed_at, t) },
  ];
}

function getTimelineRows(object: WYQDObject, t: TranslateFn): Array<{ label: string; value?: string | null }> {
  if (object.object_type === 'physical') {
    return [
      { label: '创建', value: object.created_at },
      { label: t('purchaseDate'), value: object.purchased_at },
      { label: '退出', value: object.ended_at },
      { label: t('updated'), value: object.updated_at },
    ];
  }
  if (object.object_type === 'recurring_cost') {
    return [
      { label: '创建', value: object.created_at },
      { label: t('startDate'), value: object.started_at },
      { label: t('pause'), value: object.paused_at },
      { label: t('cancel'), value: object.cancelled_at },
      { label: t('updated'), value: object.updated_at },
    ];
  }
  return [
    { label: t('plan'), value: object.planned_at },
    { label: t('startDate'), value: object.started_at },
    { label: t('complete'), value: object.ended_at },
    { label: t('reviewAction'), value: object.reviewed_at },
    { label: t('updated'), value: object.updated_at },
  ];
}

function ObjectDetailPanel({
  stored,
  onClose,
}: {
  stored: StoredEntity<WYQDObject>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const object = stored.entity;
  const detailRows = getDetailRows(object, t);
  const timelineRows = getTimelineRows(object, t).filter((row) => row.value);
  const body = stored.body.trim();

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500">{getTypeLabels(t)[object.object_type]}</div>
          <h2 className="mt-1 break-words text-xl font-semibold tracking-tight text-stone-950">{object.title}</h2>
          <p className="mt-1 break-all text-xs text-stone-400">{stored.fileName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-10 shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950"
        >
          {t('close')}
        </button>
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

      <div className="mt-6 border-t border-stone-100 pt-5">
        <h3 className="text-sm font-semibold text-stone-950">{t('markdownBody')}</h3>
        <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-4 text-sm leading-relaxed text-stone-600">
          {body || t('noBody')}
        </div>
      </div>
    </motion.section>
  );
}

interface ObjectListProps {
  objects: StoredEntity<WYQDObject>[];
  focus?: ObjectListFocus | null;
  disabled?: boolean;
  onUpdate: (fileName: string, object: WYQDObject, body: string) => Promise<void>;
  onDelete: (fileName: string) => Promise<void>;
  onCreateObjectReview: (
    fileName: string,
    object: WYQDObject,
    summary: string,
    rankings: {
      foodRank: number | null;
      sceneryRank: number | null;
      experienceRank: number | null;
    },
    body: string,
  ) => Promise<void>;
}

type PhysicalStoredEntity = StoredEntity<PhysicalObject>;
function isPhysicalStoredEntity(stored: StoredEntity<WYQDObject>): stored is PhysicalStoredEntity {
  return isPhysicalObject(stored.entity);
}

export function ObjectList({
  objects,
  focus,
  disabled,
  onUpdate,
  onDelete,
  onCreateObjectReview,
}: ObjectListProps) {
  const { t } = useI18n();
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [exitingFileName, setExitingFileName] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [reviewingFileName, setReviewingFileName] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState('');
  const [reviewFoodRank, setReviewFoodRank] = useState('');
  const [reviewSceneryRank, setReviewSceneryRank] = useState('');
  const [reviewExperienceRank, setReviewExperienceRank] = useState('');
  const [query, setQuery] = useState(focus?.query || '');
  const [typeFilter, setTypeFilter] = useState<ObjectTypeFilter>(focus?.typeFilter || 'all');
  const [statusGroupFilter, setStatusGroupFilter] = useState<ObjectStatusGroupFilter>(
    focus?.statusGroupFilter || 'all',
  );
  const [filter, setFilter] = useState<PhysicalFilter>(focus?.physicalFilter || 'all');
  const [controlBucketFilter, setControlBucketFilter] = useState<ObjectControlBucket | null>(null);
  const [openActionMenuFileName, setOpenActionMenuFileName] = useState<string | null>(null);

  const typeLabels = getTypeLabels(t);
  const filterLabels = getFilterLabels(t);
  const objectTypeFilterLabels = getObjectTypeFilterLabels(t);
  const objectStatusGroupLabels = getObjectStatusGroupLabels(t);
  const objectControlLabels = getObjectControlLabels(t);
  const supportingVisuals = getSupportingVisuals(t);

  const visibleObjects = objects.filter((stored) => {
    const object = stored.entity;
    return (
      (controlBucketFilter === null || getObjectControlBucket(object) === controlBucketFilter) &&
      (typeFilter === 'all' || object.object_type === typeFilter) &&
      matchesStatusGroup(object, statusGroupFilter) &&
      matchesQuery(object, query)
    );
  });

  const allPhysicalObjects = objects.filter(isPhysicalStoredEntity);
  const physicalObjects = visibleObjects.filter(isPhysicalStoredEntity);
  const supportingObjects = visibleObjects.filter((stored) => !isPhysicalObject(stored.entity));

  const filteredObjects =
    filter === 'all'
      ? physicalObjects
      : physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === filter);
  const visiblePhysicalFilterCounts: Record<PhysicalFilter, number> = {
    all: physicalObjects.length,
    active: physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === 'active')
      .length,
    retired: physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === 'retired')
      .length,
    sold: physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === 'sold')
      .length,
  };
  const controlCounts = objects.reduce<Record<ObjectControlBucket, number>>(
    (counts, stored) => {
      counts[getObjectControlBucket(stored.entity)] += 1;
      return counts;
    },
    { attention: 0, active: 0, review: 0, closed: 0 },
  );
  const priorityObjects = objects
    .filter((stored) => getPriorityScore(stored.entity) < 5)
    .sort((first, second) => getPriorityScore(first.entity) - getPriorityScore(second.entity))
    .slice(0, 3);

  const totalCost = allPhysicalObjects.reduce((sum, stored) => sum + getPrimaryAmount(stored.entity), 0);
  const dailyCosts = allPhysicalObjects
    .map((stored) => getDailyCost(stored.entity))
    .filter((value): value is number => value !== null);
  const averageDailyCost =
    dailyCosts.length > 0 ? dailyCosts.reduce((sum, value) => sum + value, 0) : 0;

  const selectedStored = selectedFileName
    ? objects.find((stored) => stored.fileName === selectedFileName) || null
    : null;
  const iconButtonClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40';
  const menuItemClass =
    'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40';

  function cancelObjectReview() {
    setReviewingFileName(null);
    setReviewSummary('');
    setReviewFoodRank('');
    setReviewSceneryRank('');
    setReviewExperienceRank('');
  }

  function applyControlBucket(bucket: ObjectControlBucket) {
    const target = objectControlLabels[bucket];
    setQuery('');
    setFilter('all');
    setTypeFilter(target.typeFilter);
    setStatusGroupFilter(target.statusGroup);
    setControlBucketFilter(bucket);
    setOpenActionMenuFileName(null);
  }

  if (objects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-stone-900">{t('noObjectsYet')}</h2>
        <p className="mt-2 text-sm text-stone-500">{t('connectVaultFirst')}</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-950">{t('objectConsoleTitle')}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {t('objectConsoleSubtitle')}
            </p>
          </div>
          <span className="w-fit rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {t('objectsCount').replace('{count}', String(objects.length))}
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

        <div className="mt-5 border-t border-stone-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-stone-950">{t('priorityProcess')}</h3>
            {controlBucketFilter ? (
              <button
                type="button"
                onClick={() => {
                  setControlBucketFilter(null);
                  setTypeFilter('all');
                  setStatusGroupFilter('all');
                  setFilter('all');
                }}
                className="text-xs font-medium text-stone-500 transition hover:text-stone-950"
              >
                {t('viewAll')}
              </button>
            ) : null}
          </div>
          {priorityObjects.length > 0 ? (
            <div className="mt-3 divide-y divide-stone-100">
              {priorityObjects.map((stored) => {
                const object = stored.entity;
                const isReviewTarget =
                  object.object_type === 'one_time_experience' && object.status === 'completed';

                return (
                  <div
                    key={stored.fileName}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                          {typeLabels[object.object_type]}
                        </span>
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                          {getStatusLabel(object, t)}
                        </span>
                      </div>
                      <div className="mt-1.5 truncate text-sm font-semibold text-stone-950">
                        {object.title}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">{getPriorityReason(object, t)}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="font-mono text-sm font-semibold text-stone-950">
                        {formatMoney(getPrimaryAmount(object))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setControlBucketFilter(null);
                          setTypeFilter('all');
                          setStatusGroupFilter('all');
                          setFilter('all');
                          setSelectedFileName(stored.fileName);
                          if (isReviewTarget) setReviewingFileName(stored.fileName);
                          setOpenActionMenuFileName(null);
                        }}
                        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-950"
                      >
                        {isReviewTarget ? t('reviewAction') : t('detail')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-500">
              {t('noPriorityObjects')}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-stone-950">{t('physicalAssets')}</h2>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {allPhysicalObjects.length} 件
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-stone-500">{t('totalAcquisitionCost')}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">
              {formatMoney(totalCost)}
            </div>
          </div>
          <div>
            <div className="text-xs text-stone-500">{t('dailyCostAvg')}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-stone-950">
              {formatMoney(averageDailyCost)}
              <span className="ml-1 text-xs font-medium text-stone-400">{t('perDay')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <label className="block">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setControlBucketFilter(null);
            }}
            placeholder={t('searchByNameCategoryStatus')}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="对象类型筛选">
          {(Object.keys(objectTypeFilterLabels) as ObjectTypeFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setTypeFilter(item);
                setControlBucketFilter(null);
              }}
              aria-pressed={typeFilter === item}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                typeFilter === item
                  ? 'bg-stone-950 text-white'
                  : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200 hover:text-stone-900'
              }`}
            >
              {objectTypeFilterLabels[item]}（
              {getObjectTypeFilterCount(objects, item, statusGroupFilter, query)}）
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="对象状态筛选">
          {(Object.keys(objectStatusGroupLabels) as ObjectStatusGroupFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStatusGroupFilter(item);
                setControlBucketFilter(null);
              }}
              aria-pressed={statusGroupFilter === item}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                statusGroupFilter === item
                  ? 'bg-stone-950 text-white'
                  : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200 hover:text-stone-900'
              }`}
            >
              {objectStatusGroupLabels[item]}（
              {getObjectStatusGroupCount(objects, item, typeFilter, query)}）
            </button>
          ))}
        </div>
        {physicalObjects.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="实物状态筛选">
            {(Object.keys(filterLabels) as PhysicalFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setFilter(item);
                  setControlBucketFilter(null);
                }}
                aria-pressed={filter === item}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filter === item
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200 hover:text-stone-900'
                }`}
              >
                {filterLabels[item]}（{visiblePhysicalFilterCounts[item]}）
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* 列表主体 */}
      <div className="space-y-4">
        {filteredObjects.map((stored) => {
          const object = stored.entity;
          const isEditing = editingFileName === stored.fileName;
	          const dailyCost = getDailyCost(object);
	          const serviceDays = getServiceDays(object);
	          const bucket = getPhysicalBucket(object.status);
	          const accent = getPhysicalAccentClasses(bucket);

	          return (
	            <article
	              key={stored.fileName}
	              className="overflow-visible rounded-xl border border-stone-200 bg-white shadow-sm transition hover:border-stone-300"
	            >
	              {isEditing ? (
	                <div className="p-4">
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
	              ) : (
	                <div className="flex">
	                  <div className={`w-1.5 shrink-0 ${accent.stripe}`} aria-hidden="true" />
	                  <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:flex-row md:items-center">
	                    <div
	                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-50 text-sm font-semibold text-stone-700 ring-1 ring-stone-200"
	                      aria-hidden="true"
	                    >
	                      {t('typePhysical')}
	                    </div>

	                    <div className="min-w-0 flex-1">
	                      <div className="flex flex-wrap items-center gap-2">
	                        <h3 className="min-w-0 break-words text-base font-semibold leading-snug text-stone-950">
	                          {object.title}
	                        </h3>
	                        <span
	                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${accent.badge}`}
	                        >
	                          {getStatusLabel(object, t)}
	                        </span>
	                      </div>
	                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
	                        <span className="flex items-center gap-1.5">
	                          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
	                          {serviceDays ? t('daysUsed').replace('{count}', String(serviceDays)) : t('notStarted')}
	                        </span>
	                        <span>{formatDateRange(object)}</span>
	                        {object.category ? <span>{object.category}</span> : null}
	                      </div>
	                    </div>

	                    <div className="flex items-center justify-between gap-3 md:w-72 md:shrink-0 md:justify-end">
	                      <div className="min-w-[7rem] rounded-lg bg-stone-50 px-3 py-2 text-right">
	                        <div className="text-xs text-stone-400">{t('dailyCostAvg')}</div>
	                        <div className="mt-0.5 font-mono text-base font-semibold leading-none text-stone-950">
	                          {dailyCost ? `¥${Math.round(dailyCost)}` : '—'}
	                        </div>
	                      </div>

	                    <div className="relative flex gap-1.5 overflow-visible pb-0.5">
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setSelectedFileName(stored.fileName);
	                          setOpenActionMenuFileName(null);
	                        }}
	                        aria-label={`查看「${object.title}」详情`}
	                        className={iconButtonClass}
	                        title={t('detail')}
	                      >
	                        <span aria-hidden="true">🔎</span>
	                      </button>
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setEditingFileName(stored.fileName);
	                          setOpenActionMenuFileName(null);
	                        }}
	                        aria-label={`修改「${object.title}」`}
	                        className={iconButtonClass}
	                        disabled={disabled}
	                        title={t('edit')}
	                      >
	                        <span aria-hidden="true">✏️</span>
	                      </button>
	                      <button
	                        type="button"
	                        onClick={() =>
	                          setOpenActionMenuFileName((current) =>
	                            current === stored.fileName ? null : stored.fileName,
	                          )
	                        }
	                        aria-label={`更多操作「${object.title}」`}
	                        className={iconButtonClass}
	                        title={t('more')}
	                      >
	                        <span aria-hidden="true">⋯</span>
	                      </button>
	                      {openActionMenuFileName === stored.fileName ? (
	                        <div className="absolute right-0 top-11 z-20 w-36 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
	                          <button
	                            type="button"
	                            onClick={async () => {
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
	                            }}
	                            className={menuItemClass}
	                            disabled={
	                              disabled || exitingFileName === stored.fileName || bucket !== 'active'
	                            }
	                          >
	                            <span>{t('retire')}</span>
	                            <span aria-hidden="true">📦</span>
	                          </button>
	                          <button
	                            type="button"
	                            onClick={async () => {
	                              const confirmed = window.confirm(t('deleteConfirm').replace('{title}', object.title));
	                              if (!confirmed) return;
	                              setOpenActionMenuFileName(null);
	                              setDeletingFileName(stored.fileName);
	                              try {
	                                await onDelete(stored.fileName);
	                              } finally {
	                                setDeletingFileName(null);
	                              }
	                            }}
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
	                    </div>
	                  </div>
	                </div>
	              )}
            </article>
          );
        })}
      </div>

      {selectedStored ? (
        <ObjectDetailPanel
          stored={selectedStored}
          onClose={() => setSelectedFileName(null)}
        />
      ) : null}

      {supportingObjects.length > 0 ? (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-semibold text-stone-950">{t('recurringCostAndExperience')}</h2>
              <p className="mt-0.5 text-xs text-stone-500">{t('subscriptionServiceUnified')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
              {t('itemsCount').replace('{count}', String(supportingObjects.length))}
            </span>
          </div>
          <div className="space-y-2.5">
            {supportingObjects.map((stored) => {
              const object = stored.entity;
              const isEditing = editingFileName === stored.fileName;
              const isReviewing = reviewingFileName === stored.fileName;
              const visual =
                object.object_type === 'recurring_cost'
                  ? supportingVisuals.recurring_cost
                  : supportingVisuals.one_time_experience;
              const nextBillingDate =
                object.object_type === 'recurring_cost' && object.status === 'active'
                  ? calculateNextBillingDate(object)
                  : null;
              const supportingActionLabel = getSupportingActionLabel(object, t);

              return isEditing ? (
                <div
                  key={stored.fileName}
                  className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                >
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
              ) : (
	                <article
	                  key={stored.fileName}
	                  className="overflow-visible rounded-xl border border-stone-200 bg-white shadow-sm transition hover:border-stone-300"
	                >
                  <div className="flex">
                    <div className={`w-1.5 shrink-0 ${visual.accentClass}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 flex-1 gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ring-1 ${visual.badgeClass}`}
                            aria-hidden="true"
                          >
                            {visual.shortLabel}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 break-words text-base font-semibold leading-snug text-stone-950">
                                {object.title}
                              </h3>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${visual.badgeClass}`}
                              >
                                {getStatusLabel(object, t)}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                              <span className="flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${visual.dotClass}`} />
                                {visual.label}
                              </span>
                              <span>{getSupportingMeta(object, nextBillingDate, t)}</span>
                              {object.category ? <span>{object.category}</span> : null}
                            </div>
                          </div>
                        </div>

	                        <div className="flex items-center justify-between gap-3 sm:w-72 sm:shrink-0 sm:justify-end">
	                          <div className="rounded-lg bg-stone-50 px-3 py-2 sm:text-right">
	                            <div className="text-xs text-stone-400">{visual.amountLabel}</div>
	                            <div className="mt-0.5 font-mono text-base font-semibold text-stone-950">
	                              {formatMoney(getPrimaryAmount(object))}
	                            </div>
	                            {nextBillingDate ? (
	                              <div className="mt-0.5 text-[11px] text-sky-700">
	                                {formatDueLabel(nextBillingDate, t)}
	                              </div>
	                            ) : null}
	                          </div>

	                          <div className="relative flex gap-1.5 overflow-visible pb-0.5">
	                            <button
	                              type="button"
	                              onClick={() => {
	                                setSelectedFileName(stored.fileName);
	                                setOpenActionMenuFileName(null);
	                              }}
	                              aria-label={`查看「${object.title}」详情`}
	                              title={t('detail')}
	                              className={iconButtonClass}
	                            >
	                              <span aria-hidden="true">🔎</span>
	                            </button>
	                            <button
	                              type="button"
	                              onClick={() => {
	                                setEditingFileName(stored.fileName);
	                                setOpenActionMenuFileName(null);
	                              }}
	                              aria-label={`修改「${object.title}」`}
	                              title={t('edit')}
	                              className={iconButtonClass}
	                              disabled={disabled}
	                            >
	                              <span aria-hidden="true">✏️</span>
	                            </button>
	                            {supportingActionLabel ? (
	                              <button
	                                type="button"
	                                onClick={async () => {
	                                  if (
	                                    object.object_type === 'one_time_experience' &&
	                                    object.status === 'completed'
	                                  ) {
	                                    setOpenActionMenuFileName(null);
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
	                                }}
	                                aria-label={`${supportingActionLabel}「${object.title}」`}
	                                title={supportingActionLabel}
	                                className={`${iconButtonClass} border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-700 hover:bg-amber-50`}
	                                disabled={disabled || exitingFileName === stored.fileName}
	                              >
	                                <span aria-hidden="true">
	                                  {exitingFileName === stored.fileName
	                                    ? '…'
	                                    : getSupportingActionIcon(object)}
	                                </span>
	                              </button>
	                            ) : null}
	                            <button
	                              type="button"
	                              onClick={() =>
	                                setOpenActionMenuFileName((current) =>
	                                  current === stored.fileName ? null : stored.fileName,
	                                )
	                              }
	                              aria-label={`更多操作「${object.title}」`}
	                              title={t('more')}
	                              className={iconButtonClass}
	                            >
	                              <span aria-hidden="true">⋯</span>
	                            </button>
	                            {openActionMenuFileName === stored.fileName ? (
	                              <div className="absolute right-0 top-11 z-20 w-40 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
	                                {canCancelRecurringCost(object) ? (
	                                  <button
	                                    type="button"
	                                    onClick={async () => {
	                                      const reason = window.prompt(`取消「${object.title}」的原因？`);
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
	                                    }}
	                                    className={`${menuItemClass} text-red-600 hover:bg-red-50`}
	                                    disabled={disabled || exitingFileName === stored.fileName}
	                                  >
	                                    <span>{t('cancelSubscription')}</span>
	                                    <span aria-hidden="true">🚫</span>
	                                  </button>
	                                ) : null}
	                                <button
	                                  type="button"
	                                  onClick={async () => {
	                                    const confirmed = window.confirm(t('deleteConfirm').replace('{title}', object.title));
	                                    if (!confirmed) return;
	                                    setOpenActionMenuFileName(null);
	                                    setDeletingFileName(stored.fileName);
	                                    try {
	                                      await onDelete(stored.fileName);
	                                    } finally {
	                                      setDeletingFileName(null);
	                                    }
	                                  }}
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
	                        </div>
                      </div>

                      {isReviewing ? (
                        <form
                          className="mt-4 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
                          onSubmit={async (event) => {
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
                                  foodRank: parseRank(reviewFoodRank),
                                  sceneryRank: parseRank(reviewSceneryRank),
                                  experienceRank: parseRank(reviewExperienceRank),
                                },
                                stored.body,
                              );
                              cancelObjectReview();
                            } finally {
                              setExitingFileName(null);
                            }
                          }}
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
                              className="mt-1.5 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-100"
                              disabled={disabled || exitingFileName === stored.fileName}
                            />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-stone-500">{t('rankingLabel')}</div>
                            <div className="mt-1.5 grid grid-cols-3 gap-2">
                              <input
                                value={reviewFoodRank}
                                onChange={(event) => setReviewFoodRank(event.target.value)}
                                type="number"
                                min="1"
                                inputMode="numeric"
                                placeholder={t('foodRank')}
                                aria-label={t('foodRank')}
                                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-100"
                                disabled={disabled || exitingFileName === stored.fileName}
                              />
                              <input
                                value={reviewSceneryRank}
                                onChange={(event) => setReviewSceneryRank(event.target.value)}
                                type="number"
                                min="1"
                                inputMode="numeric"
                                placeholder={t('sceneryRank')}
                                aria-label={t('sceneryRank')}
                                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-100"
                                disabled={disabled || exitingFileName === stored.fileName}
                              />
                              <input
                                value={reviewExperienceRank}
                                onChange={(event) => setReviewExperienceRank(event.target.value)}
                                type="number"
                                min="1"
                                inputMode="numeric"
                                placeholder={t('experienceRank')}
                                aria-label={t('experienceRank')}
                                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-100"
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
                              className="rounded-md bg-stone-950 px-2 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
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
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
