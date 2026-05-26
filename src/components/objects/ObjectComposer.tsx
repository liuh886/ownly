'use client';

import { useState } from 'react';
import type {
  BillingCycle,
  OneTimeExperienceStatus,
  PhysicalObject,
  PhysicalStatus,
  RecurringCostStatus,
  WYQDObject,
  WYQDObjectType,
} from '@/domain/types';

interface ObjectComposerProps {
  disabled?: boolean;
  initialObject?: WYQDObject;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (object: WYQDObject, body: string) => Promise<void>;
}

const physicalCategories = ['电子产品', '摄影器材', '衣物配饰', '家居', '交通', '其他'];
const physicalStatusOptions: Array<{ value: PhysicalStatus; label: string }> = [
  { value: 'observing', label: '观察中' },
  { value: 'purchased', label: '已购买' },
  { value: 'using', label: '服役中' },
  { value: 'idle', label: '已退役' },
  { value: 'transferred', label: '已卖出' },
  { value: 'discarded', label: '已丢弃' },
];
const recurringStatusOptions: Array<{ value: RecurringCostStatus; label: string }> = [
  { value: 'seeded', label: '种草' },
  { value: 'active', label: '订阅中' },
  { value: 'paused', label: '已暂停' },
  { value: 'cancelled', label: '已取消' },
];
const billingCycleOptions: Array<{ value: BillingCycle; label: string }> = [
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季度' },
  { value: 'annual', label: '每年' },
  { value: 'custom', label: '自定义' },
];
const experienceStatusOptions: Array<{ value: OneTimeExperienceStatus; label: string }> = [
  { value: 'planned', label: '计划中' },
  { value: 'in_progress', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'reviewed', label: '已复盘' },
];
const quickLineTemplates: Array<{ label: string; value: string }> = [
  {
    label: '实物模板',
    value: '小米13U / physical / 5843 / 2023-06-07 / 2025-09-20 / 电子产品 / 已退役',
  },
  {
    label: '固定成本模板',
    value: 'ChatGPT Plus / fixed / 145 / monthly / 20 / 招行信用卡 / 2026-05-01 / 订阅中 / AI工具',
  },
  {
    label: '体验模板',
    value: '香港周末旅行 / experience / 3000 / 2680 / 2026-05-18 / 旅行 / 已完成',
  },
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function parsePhysicalStatus(value: string): PhysicalStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const statusMap: Record<string, PhysicalStatus> = {
    观察: 'observing',
    观察中: 'observing',
    想买: 'observing',
    已购买: 'purchased',
    使用中: 'using',
    服役中: 'using',
    在用: 'using',
    闲置: 'idle',
    退役: 'idle',
    已退役: 'idle',
    卖出: 'transferred',
    已卖出: 'transferred',
    转让: 'transferred',
    已转让: 'transferred',
    丢弃: 'discarded',
    已丢弃: 'discarded',
    observing: 'observing',
    purchased: 'purchased',
    using: 'using',
    idle: 'idle',
    transferred: 'transferred',
    discarded: 'discarded',
  };

  return statusMap[normalized] || null;
}

function parseRecurringStatus(value: string): RecurringCostStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const statusMap: Record<string, RecurringCostStatus> = {
    种草: 'seeded',
    订阅中: 'active',
    使用中: 'active',
    active: 'active',
    seeded: 'seeded',
    paused: 'paused',
    暂停: 'paused',
    已暂停: 'paused',
    cancelled: 'cancelled',
    取消: 'cancelled',
    已取消: 'cancelled',
  };

  return statusMap[normalized] || null;
}

function parseExperienceStatus(value: string): OneTimeExperienceStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const statusMap: Record<string, OneTimeExperienceStatus> = {
    planned: 'planned',
    计划中: 'planned',
    in_progress: 'in_progress',
    执行中: 'in_progress',
    进行中: 'in_progress',
    completed: 'completed',
    已完成: 'completed',
    完成: 'completed',
    reviewed: 'reviewed',
    已复盘: 'reviewed',
    复盘: 'reviewed',
  };

  return statusMap[normalized] || null;
}

function parseBillingCycle(value: string): BillingCycle | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const cycleMap: Record<string, BillingCycle> = {
    weekly: 'weekly',
    每周: 'weekly',
    monthly: 'monthly',
    每月: 'monthly',
    月: 'monthly',
    quarterly: 'quarterly',
    每季度: 'quarterly',
    annual: 'annual',
    yearly: 'annual',
    每年: 'annual',
    年: 'annual',
    custom: 'custom',
    自定义: 'custom',
  };

  return cycleMap[normalized] || null;
}

function parseObjectType(value: string): WYQDObjectType | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const typeMap: Record<string, WYQDObjectType> = {
    physical: 'physical',
    实物: 'physical',
    固定成本: 'recurring_cost',
    订阅: 'recurring_cost',
    recurring: 'recurring_cost',
    fixed: 'recurring_cost',
    recurring_cost: 'recurring_cost',
    体验: 'one_time_experience',
    一次性体验: 'one_time_experience',
    experience: 'one_time_experience',
    one_time_experience: 'one_time_experience',
  };

  return typeMap[normalized] || null;
}

function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function applyQuickLine(
  value: string,
  setters: {
    setTitle: (next: string) => void;
    setAmount: (next: string) => void;
    setPurchasedAt: (next: string) => void;
    setEndedAt: (next: string) => void;
    setCategory: (next: string) => void;
    setPhysicalStatus: (next: PhysicalStatus) => void;
    setRecurringStatus: (next: RecurringCostStatus) => void;
    setBillingCycle: (next: BillingCycle) => void;
    setBillingDay: (next: string) => void;
    setPaymentAccount: (next: string) => void;
    setRecurringStartedAt: (next: string) => void;
    setExperienceStatus: (next: OneTimeExperienceStatus) => void;
    setActualAmount: (next: string) => void;
    setObjectType: (next: WYQDObjectType) => void;
  },
) {
  const parts = value
    .split(/[\/，,|]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return;

  const parsedType = parseObjectType(parts[1] || '');

  if (parsedType === 'recurring_cost') {
    const [name, , price, cycle, day, account, startedAt, status, maybeCategory] = parts;
    setters.setObjectType('recurring_cost');
    if (name) setters.setTitle(name);
    if (price && /^\d+(\.\d+)?$/.test(price)) setters.setAmount(price);
    const parsedCycle = parseBillingCycle(cycle || '');
    if (parsedCycle) setters.setBillingCycle(parsedCycle);
    if (day && /^\d{1,2}$/.test(day)) setters.setBillingDay(day);
    if (account) setters.setPaymentAccount(account);
    if (startedAt && isDateLike(startedAt)) setters.setRecurringStartedAt(startedAt);
    const parsedStatus = parseRecurringStatus(status || '');
    if (parsedStatus) setters.setRecurringStatus(parsedStatus);
    if (maybeCategory) setters.setCategory(maybeCategory);
    return;
  }

  if (parsedType === 'one_time_experience') {
    const [name, , budget, actual, endedAt, maybeCategory, status] = parts;
    setters.setObjectType('one_time_experience');
    if (name) setters.setTitle(name);
    if (budget && /^\d+(\.\d+)?$/.test(budget)) setters.setAmount(budget);
    if (actual && /^\d+(\.\d+)?$/.test(actual)) setters.setActualAmount(actual);
    if (endedAt && isDateLike(endedAt)) setters.setEndedAt(endedAt);
    if (maybeCategory) setters.setCategory(maybeCategory);
    const parsedStatus = parseExperienceStatus(status || '');
    if (parsedStatus) setters.setExperienceStatus(parsedStatus);
    return;
  }

  const hasExplicitPhysicalType = parsedType === 'physical';
  const [name, priceOrType, firstDateOrPrice, secondDateOrFirstDate, maybeCategory, maybeStatus] = parts;
  const price = hasExplicitPhysicalType ? firstDateOrPrice : priceOrType;
  const firstDate = hasExplicitPhysicalType ? secondDateOrFirstDate : firstDateOrPrice;
  const secondDate = hasExplicitPhysicalType ? maybeCategory : secondDateOrFirstDate;
  const category = hasExplicitPhysicalType ? maybeStatus : maybeCategory;
  const status = hasExplicitPhysicalType ? parts[6] : maybeStatus;

  setters.setObjectType('physical');
  if (name) setters.setTitle(name);
  if (price && /^\d+(\.\d+)?$/.test(price)) setters.setAmount(price);
  if (firstDate && isDateLike(firstDate)) setters.setPurchasedAt(firstDate);
  if (secondDate && isDateLike(secondDate)) setters.setEndedAt(secondDate);
  if (category) setters.setCategory(category);

  const parsedStatus = parsePhysicalStatus(status || category || '');
  if (parsedStatus) setters.setPhysicalStatus(parsedStatus);
}

function createObjectDraft({
  title,
  objectType,
  amount,
  category,
  purchasedAt,
  endedAt,
  status,
  recurringStatus,
  billingCycle,
  billingDay,
  paymentAccount,
  recurringStartedAt,
  experienceStatus,
  actualAmount,
}: {
  title: string;
  objectType: WYQDObjectType;
  amount: number;
  category?: string;
  purchasedAt?: string;
  endedAt?: string;
  status?: PhysicalStatus;
  recurringStatus?: RecurringCostStatus;
  billingCycle?: BillingCycle;
  billingDay?: number;
  paymentAccount?: string;
  recurringStartedAt?: string;
  experienceStatus?: OneTimeExperienceStatus;
  actualAmount?: number;
}): WYQDObject {
  const today = new Date().toISOString().split('T')[0];
  const id = `obj_${today.replaceAll('-', '')}_${Date.now()}`;
  const base = {
    schema_version: '0.1' as const,
    id,
    type: 'object' as const,
    title,
    currency: 'CNY',
    tags: ['wyqd'],
    created_at: today,
    updated_at: today,
    category: category || undefined,
  };

  if (objectType === 'physical') {
    return {
      ...base,
      object_type: 'physical',
      status: status || (endedAt ? 'idle' : purchasedAt ? 'using' : 'observing'),
      purchased_at: purchasedAt || undefined,
      ended_at: endedAt || null,
      purchase_price: amount,
      total_acquisition_cost: amount,
      amortization_mode: 'none',
      include_in_net_worth: false,
      default_depreciates_to_zero: true,
    };
  }

  if (objectType === 'recurring_cost') {
    const cycle = billingCycle || 'monthly';
    const annualizedCost =
      cycle === 'weekly'
        ? amount * 52
        : cycle === 'quarterly'
          ? amount * 4
          : cycle === 'annual'
            ? amount
            : cycle === 'custom'
              ? amount
              : amount * 12;

    return {
      ...base,
      object_type: 'recurring_cost',
      status: recurringStatus || 'active',
      billing_cycle: cycle,
      billing_amount: amount,
      billing_currency: 'CNY',
      billing_day: billingDay,
      payment_account: paymentAccount || null,
      started_at: recurringStartedAt || today,
      annualized_cost: annualizedCost,
    };
  }

  return {
    ...base,
    object_type: 'one_time_experience',
    status: experienceStatus || 'planned',
    budget_total: amount,
    actual_total: actualAmount,
    ended_at: endedAt || undefined,
  };
}

function getInitialAmount(object?: WYQDObject): string {
  if (!object) return '';
  if (object.object_type === 'physical') {
    return String(object.total_acquisition_cost || object.purchase_price || '');
  }
  if (object.object_type === 'recurring_cost') {
    return String(object.billing_amount || '');
  }
  return String(object.budget_total || object.actual_total || '');
}

export function ObjectComposer({
  disabled,
  initialObject,
  submitLabel,
  onCancel,
  onSubmit,
}: ObjectComposerProps) {
  const [title, setTitle] = useState(initialObject?.title || '');
  const [objectType, setObjectType] = useState<WYQDObjectType>(
    initialObject?.object_type || 'physical',
  );
  const [amount, setAmount] = useState(getInitialAmount(initialObject));
  const [category, setCategory] = useState(initialObject?.category || '');
  const [purchasedAt, setPurchasedAt] = useState(
    initialObject?.object_type === 'physical' ? initialObject.purchased_at || '' : '',
  );
  const [endedAt, setEndedAt] = useState(
    initialObject?.object_type === 'physical' ? initialObject.ended_at || '' : '',
  );
  const [physicalStatus, setPhysicalStatus] = useState<PhysicalStatus>(
    initialObject?.object_type === 'physical' ? initialObject.status : 'observing',
  );
  const [recurringStatus, setRecurringStatus] = useState<RecurringCostStatus>(
    initialObject?.object_type === 'recurring_cost' ? initialObject.status : 'active',
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    initialObject?.object_type === 'recurring_cost' ? initialObject.billing_cycle || 'monthly' : 'monthly',
  );
  const [billingDay, setBillingDay] = useState(
    initialObject?.object_type === 'recurring_cost' && initialObject.billing_day
      ? String(initialObject.billing_day)
      : '',
  );
  const [paymentAccount, setPaymentAccount] = useState(
    initialObject?.object_type === 'recurring_cost' ? initialObject.payment_account || '' : '',
  );
  const [recurringStartedAt, setRecurringStartedAt] = useState(
    initialObject?.object_type === 'recurring_cost' ? initialObject.started_at || '' : '',
  );
  const [experienceStatus, setExperienceStatus] = useState<OneTimeExperienceStatus>(
    initialObject?.object_type === 'one_time_experience' ? initialObject.status : 'planned',
  );
  const [actualAmount, setActualAmount] = useState(
    initialObject?.object_type === 'one_time_experience' && initialObject.actual_total !== undefined
      ? String(initialObject.actual_total)
      : '',
  );
  const [quickLine, setQuickLine] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const parsedBillingDay = Number(billingDay);
  const isBillingDayValid =
    objectType !== 'recurring_cost' ||
    !billingDay.trim() ||
    (Number.isInteger(parsedBillingDay) && parsedBillingDay >= 1 && parsedBillingDay <= 31);
  const canSubmit =
    !disabled && title.trim() && amount.trim() && Number(amount) >= 0 && isBillingDayValid && !isSaving;
  const fieldClass =
    'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400';

  function applyQuickLineToForm(next: string) {
    applyQuickLine(next, {
      setTitle,
      setAmount,
      setPurchasedAt,
      setEndedAt,
      setCategory,
      setPhysicalStatus,
      setRecurringStatus,
      setBillingCycle,
      setBillingDay,
      setPaymentAccount,
      setRecurringStartedAt,
      setExperienceStatus,
      setActualAmount,
      setObjectType,
    });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (canSubmit) {
        handleSubmit(event as unknown as React.FormEvent);
      }
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    try {
      const object = initialObject
        ? updateObjectDraft(initialObject, {
            title: title.trim(),
            objectType,
            amount: Number(amount),
            category,
            purchasedAt,
            endedAt,
            status: physicalStatus,
            recurringStatus,
            billingCycle,
            billingDay: billingDay.trim() ? Number(billingDay) : undefined,
            paymentAccount,
            recurringStartedAt,
            experienceStatus,
            actualAmount: actualAmount.trim() ? Number(actualAmount) : undefined,
          })
        : createObjectDraft({
            title: title.trim(),
            objectType,
            amount: Number(amount),
            category,
            purchasedAt,
            endedAt,
            status: physicalStatus,
            recurringStatus,
            billingCycle,
            billingDay: billingDay.trim() ? Number(billingDay) : undefined,
            paymentAccount,
            recurringStartedAt,
            experienceStatus,
            actualAmount: actualAmount.trim() ? Number(actualAmount) : undefined,
          });
      await onSubmit(object, '## 购买理由\n\n## 使用记录\n\n## 复盘与排行\n');
      if (!initialObject) {
        setTitle('');
        setAmount('');
        setCategory('');
        setPurchasedAt('');
        setEndedAt('');
        setPhysicalStatus('observing');
        setRecurringStatus('active');
        setBillingCycle('monthly');
        setBillingDay('');
        setPaymentAccount('');
        setRecurringStartedAt('');
        setExperienceStatus('planned');
        setActualAmount('');
        setObjectType('physical');
        setQuickLine('');
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={handleSubmit}
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm shadow-stone-200/40 sm:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-950">
            {initialObject ? '编辑对象' : '快速录入'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {initialObject ? '只修改结构化字段，正文记录会保留。' : '捕获值得观察的成本对象，不记录日常流水。'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
          {objectType === 'physical' ? '实物' : objectType === 'recurring_cost' ? '固定成本' : '体验'}
        </span>
      </div>

      <div className="space-y-4">
        {!initialObject ? (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-stone-500">整行粘贴</span>
              <input
                value={quickLine}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuickLine(next);
                  applyQuickLineToForm(next);
                }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="选择模板，或粘贴一整行对象信息"
                className={`${fieldClass} bg-stone-50 focus:bg-white`}
                disabled={disabled || isSaving}
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {quickLineTemplates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => {
                    setQuickLine(template.value);
                    applyQuickLineToForm(template.value);
                  }}
                  className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
                  disabled={disabled || isSaving}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">名称</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：小米13U"
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>

        <div className="grid grid-cols-1 gap-3">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">类型</span>
            <select
              value={objectType}
              onChange={(event) => setObjectType(event.target.value as WYQDObjectType)}
              className={fieldClass}
              disabled={disabled || isSaving}
            >
              <option value="physical">实物</option>
              <option value="recurring_cost">固定成本</option>
              <option value="one_time_experience">一次性体验</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">金额</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="5843"
              className={fieldClass}
              disabled={disabled || isSaving}
            />
          </label>
        </div>

        {objectType === 'physical' ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">购买日</span>
                <input
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                  type="date"
                  aria-label="购买日期"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">结束日</span>
                <input
                  value={endedAt}
                  onChange={(event) => setEndedAt(event.target.value)}
                  type="date"
                  aria-label="退役日期"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">品类</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                >
                  <option value="">未分类</option>
                  {physicalCategories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">状态</span>
                <select
                  value={physicalStatus}
                  onChange={(event) => setPhysicalStatus(event.target.value as PhysicalStatus)}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                >
                  {physicalStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : null}

        {objectType === 'recurring_cost' ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">周期</span>
                <select
                  value={billingCycle}
                  onChange={(event) => setBillingCycle(event.target.value as BillingCycle)}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                >
                  {billingCycleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">状态</span>
                <select
                  value={recurringStatus}
                  onChange={(event) => setRecurringStatus(event.target.value as RecurringCostStatus)}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                >
                  {recurringStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">开始日</span>
                <input
                  value={recurringStartedAt}
                  onChange={(event) => setRecurringStartedAt(event.target.value)}
                  type="date"
                  aria-label="固定成本开始日期"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">扣费日</span>
                <input
                  value={billingDay}
                  onChange={(event) => setBillingDay(event.target.value)}
                  type="number"
                  min="1"
                  max="31"
                  inputMode="numeric"
                  placeholder="如 15"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">支付账户</span>
                <input
                  value={paymentAccount}
                  onChange={(event) => setPaymentAccount(event.target.value)}
                  placeholder="如 招行信用卡"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
            </div>
          </>
        ) : null}

        {objectType === 'one_time_experience' ? (
          <div className="grid grid-cols-1 gap-3">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-stone-500">实际金额</span>
              <input
                value={actualAmount}
                onChange={(event) => setActualAmount(event.target.value)}
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="可选"
                className={fieldClass}
                disabled={disabled || isSaving}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-stone-500">结束日</span>
              <input
                value={endedAt}
                onChange={(event) => setEndedAt(event.target.value)}
                type="date"
                aria-label="体验结束日期"
                className={fieldClass}
                disabled={disabled || isSaving}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-stone-500">状态</span>
              <select
                value={experienceStatus}
                onChange={(event) =>
                  setExperienceStatus(event.target.value as OneTimeExperienceStatus)
                }
                className={fieldClass}
                disabled={disabled || isSaving}
              >
                {experienceStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="w-24 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
              disabled={isSaving}
            >
              取消
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-w-0 flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {disabled ? '连接 Vault 后写入 Obsidian' : isSaving ? '保存中...' : submitLabel || '保存'}
          </button>
        </div>
      </div>
    </form>
  );
}

function updateObjectDraft(
  existing: WYQDObject,
  values: {
    title: string;
    objectType: WYQDObjectType;
    amount: number;
    category?: string;
    purchasedAt?: string;
    endedAt?: string;
    status?: PhysicalStatus;
    recurringStatus?: RecurringCostStatus;
    billingCycle?: BillingCycle;
    billingDay?: number;
    paymentAccount?: string;
    recurringStartedAt?: string;
    experienceStatus?: OneTimeExperienceStatus;
    actualAmount?: number;
  },
): WYQDObject {
  const updatedAt = todayISO();

  if (values.objectType !== existing.object_type) {
    return createObjectDraft(values);
  }

  if (existing.object_type === 'physical') {
    return {
      ...existing,
      title: values.title,
      updated_at: updatedAt,
      category: values.category || undefined,
      status: values.status || existing.status,
      purchased_at: values.purchasedAt || undefined,
      ended_at: values.endedAt || null,
      purchase_price: values.amount,
      total_acquisition_cost: values.amount,
    } satisfies PhysicalObject;
  }

  if (existing.object_type === 'recurring_cost') {
    return {
      ...existing,
      title: values.title,
      updated_at: updatedAt,
      category: values.category || undefined,
      status: values.recurringStatus || existing.status,
      billing_cycle: values.billingCycle || existing.billing_cycle || 'monthly',
      billing_amount: values.amount,
      billing_day: values.billingDay,
      payment_account: values.paymentAccount || null,
      started_at: values.recurringStartedAt || existing.started_at,
      annualized_cost:
        values.billingCycle === 'weekly'
          ? values.amount * 52
          : values.billingCycle === 'quarterly'
            ? values.amount * 4
            : values.billingCycle === 'annual' || values.billingCycle === 'custom'
              ? values.amount
              : values.amount * 12,
    };
  }

  return {
    ...existing,
    title: values.title,
    updated_at: updatedAt,
    category: values.category || undefined,
    status: values.experienceStatus || existing.status,
    budget_total: values.amount,
    actual_total: values.actualAmount,
    ended_at: values.endedAt || existing.ended_at,
  };
}
