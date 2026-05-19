'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

const typeLabels: Record<WYQDObject['object_type'], string> = {
  physical: '实物',
  recurring_cost: '固定成本',
  one_time_experience: '一次性体验',
};

const physicalStatusLabels: Record<PhysicalStatus, string> = {
  seeded: '种草',
  observing: '观察中',
  purchased: '已购买',
  using: '服役中',
  idle: '已退役',
  transferred: '已卖出',
  discarded: '已丢弃',
};

const recurringStatusLabels: Record<string, string> = {
  seeded: '种草',
  active: '订阅中',
  paused: '已暂停',
  cancelled: '已取消',
};

const experienceStatusLabels: Record<string, string> = {
  planned: '计划中',
  in_progress: '执行中',
  completed: '已完成',
  reviewed: '已复盘',
};

const billingCycleLabels: Record<string, string> = {
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  annual: '每年',
  custom: '自定义',
};

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

function formatCompactMoney(value: number): string {
  if (value >= 10000) {
    return `¥${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  }
  return formatMoney(value);
}

function formatOptional(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '未记录';
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

function formatDueLabel(date: string): string {
  const days = daysUntil(date);
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days > 1) return `${days} 天后`;
  return `已过 ${Math.abs(days)} 天`;
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

export interface ObjectListFocus {
  token: number;
  query?: string;
  typeFilter?: ObjectTypeFilter;
  physicalFilter?: PhysicalFilter;
  statusGroupFilter?: ObjectStatusGroupFilter;
}

const filterLabels: Record<PhysicalFilter, string> = {
  all: '全部',
  active: '服役中',
  retired: '已退役',
  sold: '已卖出',
};

const objectTypeFilterLabels: Record<ObjectTypeFilter, string> = {
  all: '全部类型',
  physical: '实物',
  recurring_cost: '固定成本',
  one_time_experience: '一次性体验',
};

const objectStatusGroupLabels: Record<ObjectStatusGroupFilter, string> = {
  all: '全部状态',
  observing: '观察中',
  using: '使用中',
  exited: '已退出',
};

function isPhysicalObject(object: WYQDObject): object is PhysicalObject {
  return object.object_type === 'physical';
}

function getPhysicalBucket(status: PhysicalStatus): Exclude<PhysicalFilter, 'all'> {
  if (status === 'transferred') return 'sold';
  if (status === 'idle' || status === 'discarded') return 'retired';
  return 'active';
}

function getStatusLabel(object: WYQDObject): string {
  if (object.object_type === 'physical') return physicalStatusLabels[object.status];
  if (object.object_type === 'recurring_cost') {
    return recurringStatusLabels[object.status] || String(object.status);
  }
  return experienceStatusLabels[object.status] || String(object.status);
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

function getSupportingActionLabel(object: WYQDObject): string | null {
  if (object.object_type === 'recurring_cost') {
    if (object.status === 'active') return '暂停';
    if (object.status === 'paused' || object.status === 'seeded') return '恢复';
    return null;
  }
  if (object.object_type === 'one_time_experience') {
    if (object.status === 'planned') return '开始';
    if (object.status === 'in_progress') return '完成';
    if (object.status === 'completed') return '复盘';
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

function getDetailRows(object: WYQDObject): Array<{ label: string; value: string }> {
  if (object.object_type === 'physical') {
    const dailyCost = calculatePhysicalDailyCost(object);
    return [
      { label: '对象类型', value: typeLabels[object.object_type] },
      { label: '状态', value: getStatusLabel(object) },
      { label: '品类', value: formatOptional(object.category) },
      { label: '总取得成本', value: formatMoney(calculatePhysicalAcquisitionCost(object)) },
      { label: '日均体验成本', value: dailyCost ? `${formatMoney(dailyCost)}/天` : '未形成' },
      { label: '购买日期', value: formatOptional(object.purchased_at) },
      { label: '结束日期', value: formatOptional(object.ended_at) },
      { label: '回收金额', value: formatMoney(object.recovered_amount || 0) },
    ];
  }
  if (object.object_type === 'recurring_cost') {
    const monthlyCost = calculateRecurringMonthlyCost(object);
    return [
      { label: '对象类型', value: typeLabels[object.object_type] },
      { label: '状态', value: getStatusLabel(object) },
      { label: '品类', value: formatOptional(object.category) },
      { label: '周期', value: billingCycleLabels[object.billing_cycle || 'monthly'] || '每月' },
      { label: '周期金额', value: formatMoney(object.billing_amount || 0) },
      { label: '折算月成本', value: formatMoney(monthlyCost) },
      { label: '年化成本', value: formatMoney(object.annualized_cost || monthlyCost * 12) },
      { label: '开始日期', value: formatOptional(object.started_at) },
      { label: '扣费日', value: object.billing_day ? `每期 ${object.billing_day} 日` : '未记录' },
      { label: '支付账户', value: formatOptional(object.payment_account) },
      { label: '暂停日期', value: formatOptional(object.paused_at) },
      { label: '取消日期', value: formatOptional(object.cancelled_at) },
    ];
  }
  return [
    { label: '对象类型', value: typeLabels[object.object_type] },
    { label: '状态', value: getStatusLabel(object) },
    { label: '品类', value: formatOptional(object.category) },
    { label: '预算', value: formatMoney(object.budget_total || 0) },
    { label: '实际金额', value: object.actual_total ? formatMoney(object.actual_total) : '未记录' },
    { label: '计划日期', value: formatOptional(object.planned_at) },
    { label: '开始日期', value: formatOptional(object.started_at) },
    { label: '结束日期', value: formatOptional(object.ended_at) },
    { label: '复盘日期', value: formatOptional(object.reviewed_at) },
  ];
}

function getTimelineRows(object: WYQDObject): Array<{ label: string; value?: string | null }> {
  if (object.object_type === 'physical') {
    return [
      { label: '创建', value: object.created_at },
      { label: '购买', value: object.purchased_at },
      { label: '退出', value: object.ended_at },
      { label: '更新', value: object.updated_at },
    ];
  }
  if (object.object_type === 'recurring_cost') {
    return [
      { label: '创建', value: object.created_at },
      { label: '开始', value: object.started_at },
      { label: '暂停', value: object.paused_at },
      { label: '取消', value: object.cancelled_at },
      { label: '更新', value: object.updated_at },
    ];
  }
  return [
    { label: '计划', value: object.planned_at },
    { label: '开始', value: object.started_at },
    { label: '完成', value: object.ended_at },
    { label: '复盘', value: object.reviewed_at },
    { label: '更新', value: object.updated_at },
  ];
}

function ObjectDetailPanel({
  stored,
  onClose,
}: {
  stored: StoredEntity<WYQDObject>;
  onClose: () => void;
}) {
  const object = stored.entity;
  const detailRows = getDetailRows(object);
  const timelineRows = getTimelineRows(object).filter((row) => row.value);
  const body = stored.body.trim();

  return (
    <motion.section 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-stone-200 bg-white p-6 shadow-premium sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">{typeLabels[object.object_type]}</div>
          <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-stone-950">{object.title}</h2>
          <p className="mt-1 break-all text-[10px] font-bold text-stone-300 uppercase">{stored.fileName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-10 shrink-0 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-bold text-stone-600 transition hover:bg-stone-950 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {detailRows.map((row) => (
          <div key={row.label} className="rounded-2xl bg-stone-50/50 p-4 ring-1 ring-stone-100">
            <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">{row.label}</div>
            <div className="mt-1 break-words text-sm font-bold text-stone-900">{row.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-xs font-black tracking-widest text-stone-900 uppercase">Lifecycle</h3>
        {timelineRows.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {timelineRows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="flex items-center gap-3 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                <span className="font-bold text-stone-400 uppercase tracking-tight">{row.label}</span>
                <span className="font-black text-stone-900">{row.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-400 font-medium italic">暂无可展示的记录。</p>
        )}
      </div>

      <div className="mt-8 pt-8 border-t border-stone-100">
        <h3 className="text-xs font-black tracking-widest text-stone-900 uppercase">Notes</h3>
        <div className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-stone-50/30 p-5 text-sm leading-relaxed text-stone-600 font-medium">
          {body || '暂无正文内容。'}
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

  const visibleObjects = objects.filter((stored) => {
    const object = stored.entity;
    return (
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

  const totalCost = allPhysicalObjects.reduce((sum, stored) => sum + getPrimaryAmount(stored.entity), 0);
  const dailyCosts = allPhysicalObjects
    .map((stored) => getDailyCost(stored.entity))
    .filter((value): value is number => value !== null);
  const averageDailyCost =
    dailyCosts.length > 0 ? dailyCosts.reduce((sum, value) => sum + value, 0) : 0;

  const selectedStored = selectedFileName
    ? objects.find((stored) => stored.fileName === selectedFileName) || null
    : null;

  function cancelObjectReview() {
    setReviewingFileName(null);
    setReviewSummary('');
    setReviewFoodRank('');
    setReviewSceneryRank('');
    setReviewExperienceRank('');
  }

  if (objects.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-stone-200 bg-white p-12 text-center">
        <h2 className="text-base font-bold text-stone-900 uppercase tracking-widest">No Records Found</h2>
        <p className="mt-2 text-sm text-stone-400 font-medium italic">连接 Vault 后，先捕获一个值得观察的物欲。</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* 资产统计卡片 - 采用首页一致的 Rounded-3xl 风格 */}
      <div className="rounded-3xl bg-white p-6 shadow-premium ring-1 ring-stone-100">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">Physical Assets</h2>
          <span className="text-[10px] font-bold text-stone-300">{allPhysicalObjects.length} Total</span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Total Value</div>
            <div className="mt-1 text-3xl font-black tracking-tighter text-stone-950">{formatMoney(totalCost)}</div>
          </div>
          <div>
            <div className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Daily Weighted</div>
            <div className="mt-1 text-3xl font-black tracking-tighter text-stone-950">{formatMoney(averageDailyCost)}<span className="text-sm font-bold text-stone-300">/D</span></div>
          </div>
        </div>
      </div>

      {/* 搜索与过滤区 - 去盒子化，更加轻盈 */}
      <div className="space-y-4 px-1">
        <label className="block">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, category, or status..."
            className="w-full rounded-2xl border border-stone-200 bg-white px-5 py-4 text-sm font-medium text-stone-950 outline-none transition-all placeholder:text-stone-300 focus:border-stone-950 focus:shadow-premium shadow-sm"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {(Object.keys(objectTypeFilterLabels) as ObjectTypeFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTypeFilter(item)}
              className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                typeFilter === item
                  ? 'bg-stone-950 text-white shadow-md'
                  : 'bg-white text-stone-400 ring-1 ring-stone-200 hover:text-stone-900'
              }`}
            >
              {objectTypeFilterLabels[item]}
            </button>
          ))}
        </div>
      </div>

      {/* 列表主体 */}
      <div className="space-y-4">
        {filteredObjects.map((stored) => {
          const object = stored.entity;
          const isEditing = editingFileName === stored.fileName;
          const dailyCost = getDailyCost(object);
          const serviceDays = getServiceDays(object);
          const bucket = getPhysicalBucket(object.status);

          return (
            <article
              key={stored.fileName}
              className="group relative rounded-3xl bg-white p-5 shadow-premium transition-all hover:shadow-active ring-1 ring-stone-100"
            >
              {isEditing ? (
                <ObjectComposer
                  disabled={disabled}
                  initialObject={object}
                  submitLabel="保存修改"
                  onCancel={() => setEditingFileName(null)}
                  onSubmit={async (updatedObject, body) => {
                    await onUpdate(stored.fileName, updatedObject, stored.body || body);
                    setEditingFileName(null);
                  }}
                />
              ) : (
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex shrink-0 items-start justify-between gap-3 sm:w-28 sm:flex-col sm:justify-start">
                    <span className="text-[10px] font-black tracking-widest text-stone-300 uppercase">
                      {typeLabels[object.object_type]}
                    </span>
                    <span
                      className={`min-w-0 max-w-full rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tight ring-1 ${
                        bucket === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : bucket === 'retired'
                          ? 'bg-amber-50 text-amber-700 ring-amber-200'
                          : 'bg-stone-50 text-stone-500 ring-stone-200'
                      }`}
                    >
                      {getStatusLabel(object)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 break-words text-lg font-bold tracking-tight text-stone-950 leading-tight">
                      {object.title}
                    </h3>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-stone-300" />
                        {serviceDays ? `${serviceDays} Days` : 'Planned'}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-stone-300" />
                        {formatDateRange(object)}
                      </div>
                      {object.category ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-1 w-1 rounded-full bg-stone-300" />
                          {object.category}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-6 sm:justify-end sm:shrink-0 sm:w-64">
                    <div className="text-right">
                      <div className="text-[10px] font-black tracking-widest text-stone-300 uppercase">Daily Cost</div>
                      <div className="mt-1 text-xl font-black text-stone-950 tracking-tighter leading-none">
                        {dailyCost ? `¥${Math.round(dailyCost)}` : '—'}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedFileName(stored.fileName)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-50 text-stone-600 transition hover:bg-stone-950 hover:text-white ring-1 ring-stone-200"
                        title="详情"
                      >
                        <span className="text-xs">👁️</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingFileName(stored.fileName)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-50 text-stone-600 transition hover:bg-stone-950 hover:text-white ring-1 ring-stone-200"
                        disabled={disabled}
                        title="修改"
                      >
                        <span className="text-xs">✏️</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const next: PhysicalObject = {
                            ...object,
                            status: 'idle',
                            ended_at: object.ended_at || todayISO(),
                            updated_at: todayISO(),
                          };
                          setExitingFileName(stored.fileName);
                          try {
                            await onUpdate(stored.fileName, next, stored.body);
                          } finally {
                            setExitingFileName(null);
                          }
                        }}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl transition ring-1 ${
                          bucket === 'active' 
                            ? 'bg-amber-50 text-amber-600 ring-amber-200 hover:bg-amber-600 hover:text-white' 
                            : 'opacity-20 grayscale cursor-not-allowed'
                        }`}
                        disabled={disabled || exitingFileName === stored.fileName || bucket !== 'active'}
                        title="退役"
                      >
                        <span className="text-xs">📦</span>
                      </button>
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

      {/* 固定成本与体验 - 重构为更加紧凑的 Action Center 风格 */}
      {supportingObjects.length > 0 ? (
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">Fixed Costs & Experiences</h2>
            <span className="text-[10px] font-bold text-stone-300">{supportingObjects.length} Active</span>
          </div>
          <div className="space-y-4">
            {supportingObjects.map((stored) => {
              const object = stored.entity;
              const isEditing = editingFileName === stored.fileName;
              const nextBillingDate =
                object.object_type === 'recurring_cost' && object.status === 'active'
                  ? calculateNextBillingDate(object)
                  : null;

              return isEditing ? (
                <ObjectComposer
                  key={stored.fileName}
                  disabled={disabled}
                  initialObject={object}
                  submitLabel="保存修改"
                  onCancel={() => setEditingFileName(null)}
                  onSubmit={async (updatedObject, body) => {
                    await onUpdate(stored.fileName, updatedObject, stored.body || body);
                    setEditingFileName(null);
                  }}
                />
              ) : (
                <article
                  key={stored.fileName}
                  className="group relative rounded-3xl bg-white p-5 shadow-premium transition-all hover:shadow-active ring-1 ring-stone-100"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex shrink-0 items-start justify-between gap-3 sm:w-28 sm:flex-col sm:justify-start">
                      <span className="text-[10px] font-black tracking-widest text-stone-300 uppercase">
                        {typeLabels[object.object_type]}
                      </span>
                      <span className="min-w-0 max-w-full rounded-full bg-stone-50 px-2 py-0.5 text-[9px] font-black text-stone-500 uppercase tracking-tight ring-1 ring-stone-200">
                        {getStatusLabel(object)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 break-words text-lg font-bold tracking-tight text-stone-950 leading-tight">
                        {object.title}
                      </h3>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        {nextBillingDate ? (
                          <div className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-stone-300" />
                            Next: {nextBillingDate}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-stone-300" />
                            {formatDateRange(object)}
                          </div>
                        )}
                        {object.category ? (
                          <div className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-stone-300" />
                            {object.category}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-6 sm:justify-end sm:shrink-0 sm:w-64">
                      <div className="text-right">
                        <div className="text-[10px] font-black tracking-widest text-stone-300 uppercase">Amount</div>
                        <div className="mt-1 text-xl font-black text-stone-950 tracking-tighter leading-none">
                          {formatMoney(getPrimaryAmount(object))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedFileName(stored.fileName)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-50 text-stone-600 transition hover:bg-stone-950 hover:text-white ring-1 ring-stone-200"
                          title="详情"
                        >
                          <span className="text-xs">👁️</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFileName(stored.fileName)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-50 text-stone-600 transition hover:bg-stone-950 hover:text-white ring-1 ring-stone-200"
                          disabled={disabled}
                          title="修改"
                        >
                          <span className="text-xs">✏️</span>
                        </button>
                      </div>
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
