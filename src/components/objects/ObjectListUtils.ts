import type { WYQDObject, PhysicalObject, RecurringCostObject, OneTimeExperienceObject, PhysicalStatus } from '@/domain/types';
import type { ObjectStatusGroupFilter, ObjectTypeFilter } from './useObjectFilterSort';
import { calculatePhysicalAcquisitionCost, calculatePhysicalDailyCost, calculateRecurringMonthlyCost } from '@/domain/calculations';
import { calculateInclusiveDays, todayLocalDate } from '@/domain/date';
import type { WYQDTranslationKey } from '@/core/i18n';
import { formatMoney, formatOptional, todayISO } from '@/lib/format';


export type TranslateFn = (key: WYQDTranslationKey) => string;

export function getTypeLabels(t: TranslateFn): Record<WYQDObject['object_type'], string> {
  return {
    physical: t('typePhysical'),
    recurring_cost: t('typeRecurringCost'),
    one_time_experience: t('typeExperience'),
  };
}

export function getPhysicalStatusLabels(t: TranslateFn): Record<PhysicalStatus, string> {
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

export function getRecurringStatusLabels(t: TranslateFn): Record<string, string> {
  return {
    seeded: t('statusSeeded'),
    active: t('statusActive'),
    paused: t('statusPaused'),
    cancelled: t('statusCancelled'),
  };
}

export function getExperienceStatusLabels(t: TranslateFn): Record<string, string> {
  return {
    planned: t('statusPlanned'),
    in_progress: t('statusInProgress'),
    completed: t('statusCompleted'),
    reviewed: t('statusReviewed'),
  };
}

export function getBillingCycleLabels(t: TranslateFn): Record<string, string> {
  return {
    weekly: t('billingCycleWeekly'),
    monthly: t('billingCycleMonthly'),
    quarterly: t('billingCycleQuarterly'),
    annual: t('billingCycleAnnual'),
    custom: t('billingCycleCustom'),
  };
}

export function getObjectIcon(object: WYQDObject): string {
  if (object.object_type === 'physical') {
    const cat = (object.category || '').toLowerCase();
    if (cat.includes('电子') || cat.includes('electronics') || cat.includes('tech')) return '💻';
    if (cat.includes('摄影') || cat.includes('camera') || cat.includes('photo')) return '📷';
    if (cat.includes('衣') || cat.includes('cloth') || cat.includes('fashion')) return '👔';
    if (cat.includes('家居') || cat.includes('home') || cat.includes('house')) return '🏠';
    if (cat.includes('交通') || cat.includes('transport') || cat.includes('car') || cat.includes('auto')) return '🚗';
    if (cat.includes('运动') || cat.includes('sport') || cat.includes('fitness')) return '⚽';
    if (cat.includes('书') || cat.includes('book')) return '📚';
    if (cat.includes('food') || cat.includes('厨房') || cat.includes('kitchen')) return '🍳';
    return '📦';
  }

  if (object.object_type === 'recurring_cost') {
    const title = (object.title || '').toLowerCase();
    if (title.includes('chatgpt') || title.includes('openai') || title.includes('claude') || title.includes('ai')) return '🤖';
    if (title.includes('netflix') || title.includes('disney') || title.includes('hbo') || title.includes('video')) return '🎬';
    if (title.includes('spotify') || title.includes('music') || title.includes('apple music')) return '🎵';
    if (title.includes('icloud') || title.includes('google') || title.includes('dropbox') || title.includes('storage')) return '☁️';
    if (title.includes('github') || title.includes('code') || title.includes('dev')) return '⌨️';
    if (title.includes('gym') || title.includes('fitness') || title.includes('sport')) return '💪';
    if (title.includes('insurance') || title.includes('保险')) return '🛡️';
    if (title.includes('rent') || title.includes('房租') || title.includes('mortgage')) return '🏡';
    if (title.includes('phone') || title.includes('mobile') || title.includes('phone') || title.includes('手机')) return '📱';
    if (title.includes('internet') || title.includes('broadband') || title.includes('宽带')) return '🌐';
    return '🔄';
  }

  const title = (object.title || '').toLowerCase();
  if (title.includes('trip') || title.includes('travel') || title.includes('旅行') || title.includes('tour')) return '✈️';
  if (title.includes('food') || title.includes('restaurant') || title.includes('美食') || title.includes('餐')) return '🍽️';
  if (title.includes('concert') || title.includes('show') || title.includes('演出') || title.includes('音乐')) return '🎵';
  if (title.includes('museum') || title.includes('gallery') || title.includes('博物馆') || title.includes('展览')) return '🏛️';
  if (title.includes('hiking') || title.includes('camp') || title.includes('户外') || title.includes('徒步')) return '🥾';
  if (title.includes('beach') || title.includes('sea') || title.includes('海') || title.includes('beach')) return '🏖️';
  if (title.includes('ski') || title.includes('snow') || title.includes('滑雪')) return '⛷️';
  return '🌍';
}

export function translateCategory(category: string | undefined, t: TranslateFn): string {
  if (!category) return '';
  const cat = category.toLowerCase();
  if (cat.includes('电子') || cat.includes('electronics')) return t('categoryElectronics');
  if (cat.includes('摄影') || cat.includes('camera')) return t('categoryCamera');
  if (cat.includes('衣') || cat.includes('cloth')) return t('categoryClothing');
  if (cat.includes('家居') || cat.includes('home')) return t('categoryHome');
  if (cat.includes('交通') || cat.includes('transport')) return t('categoryTransport');
  if (cat.includes('其他') || cat.includes('other')) return t('categoryOther');
  return category;
}

export function getSupportingVisuals(
  t: TranslateFn,
): Record<
  Exclude<WYQDObject['object_type'], 'physical'>,
  {
    label: string;
    accentClass: string;
    badgeClass: string;
    dotClass: string;
    amountLabel: string;
  }
> {
  return {
    recurring_cost: {
      label: t('typeRecurringCost'),
      accentClass: 'bg-sky-500',
      badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
      dotClass: 'bg-sky-500',
      amountLabel: t('billingAmount'),
    },
    one_time_experience: {
      label: t('typeExperience'),
      accentClass: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      dotClass: 'bg-emerald-500',
      amountLabel: t('budgetVsActual'),
    },
  };
}

export function getPrimaryAmount(object: WYQDObject): number {
  if (object.object_type === 'physical') {
    return calculatePhysicalAcquisitionCost(object);
  }
  if (object.object_type === 'recurring_cost') {
    return object.billing_amount || 0;
  }
  return object.budget_total || object.actual_total || 0;
}

export function getDailyCost(object: WYQDObject): number | null {
  if (object.object_type !== 'physical') return null;
  return calculatePhysicalDailyCost(object);
}

export function getServiceDaysInfo(object: WYQDObject): { elapsed: number; total: number | null } | null {
  if (object.object_type !== 'physical') return null;
  const today = todayLocalDate();
  const endDate = object.ended_at ? object.ended_at : undefined;
  const elapsedToToday = calculateInclusiveDays(object.purchased_at, undefined, today);
  if (!elapsedToToday) return null;
  if (endDate) {
    const total = calculateInclusiveDays(object.purchased_at, endDate, today);
    if (!total) return null;
    const elapsed = Math.min(elapsedToToday, total);
    return { elapsed, total };
  }
  return { elapsed: elapsedToToday, total: null };
}

export function formatDateRange(object: WYQDObject, t: TranslateFn): string {
  if (object.object_type === 'physical') {
    const start = object.purchased_at || object.created_at;
    const end = object.ended_at || t('endDateLabel');
    return `${start} - ${end}`;
  }
  if (object.object_type === 'recurring_cost') {
    return object.started_at || object.created_at;
  }
  return object.ended_at || object.reviewed_at || object.started_at || object.planned_at || object.created_at;
}

export function getSupportingTimeLabel(object: WYQDObject, t: TranslateFn): string {
  if (object.object_type === 'recurring_cost') return t('startTime');
  if (object.object_type === 'one_time_experience') return t('completionTime');
  return t('timeLabel');
}

export function getFilterLabels(t: TranslateFn): Record<string, string> {
  return {
    all: t('filterAll'),
    active: t('statusUsing'),
    retired: t('statusIdle'),
    sold: t('statusTransferred'),
  };
}

export function getObjectTypeFilterLabels(t: TranslateFn): Record<string, string> {
  return {
    all: t('filterAllTypes'),
    physical: t('typePhysical'),
    recurring_cost: t('typeRecurringCost'),
    one_time_experience: t('typeExperience'),
  };
}

export function getSortLabels(t: TranslateFn): Record<string, string> {
  return {
    date_desc: t('sortDateDesc'),
    date_asc: t('sortDateAsc'),
    price_desc: t('sortPriceDesc'),
    price_asc: t('sortPriceAsc'),
    title_asc: t('sortTitleAsc'),
  };
}

export function getObjectStatusGroupLabels(t: TranslateFn): Record<string, string> {
  return {
    all: t('filterAll'),
    observing: t('observing'),
    using: t('inUse'),
    pendingReview: t('pendingReview'),
    exited: t('exited'),
  };
}

export function getObjectControlLabels(
  t: TranslateFn,
): Record<
  string,
  { title: string; description: string; statusGroup: ObjectStatusGroupFilter; typeFilter: ObjectTypeFilter }
> {
  return {
    attention: {
      title: t('pendingDecisions'),
      description: t('bucketAttentionDesc'),
      statusGroup: 'observing',
      typeFilter: 'all',
    },
    active: {
      title: t('inUse'),
      description: t('bucketActiveDesc'),
      statusGroup: 'using',
      typeFilter: 'all',
    },
    review: {
      title: t('pendingReview'),
      description: t('bucketReviewDesc'),
      statusGroup: 'pendingReview',
      typeFilter: 'all',
    },
    closed: {
      title: t('exited'),
      description: t('bucketClosedDesc'),
      statusGroup: 'exited',
      typeFilter: 'all',
    },
  };
}

export function isPhysicalObject(object: WYQDObject): object is PhysicalObject {
  return object.object_type === 'physical';
}

export function getStatusLabel(object: WYQDObject, t: TranslateFn): string {
  if (object.object_type === 'physical') return getPhysicalStatusLabels(t)[object.status];
  if (object.object_type === 'recurring_cost') {
    return getRecurringStatusLabels(t)[object.status] || String(object.status);
  }
  return getExperienceStatusLabels(t)[object.status] || String(object.status);
}



export function getSupportingActionLabel(object: WYQDObject, t: TranslateFn): string | null {
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

export function getSupportingActionIcon(object: WYQDObject): string {
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

export function canCancelRecurringCost(object: WYQDObject): object is RecurringCostObject {
  return (
    object.object_type === 'recurring_cost' &&
    (object.status === 'active' || object.status === 'paused' || object.status === 'seeded')
  );
}

export function getSupportingMeta(object: WYQDObject, nextBillingDate: string | null, t: TranslateFn): string {
  if (object.object_type === 'recurring_cost') {
    const cycle = getBillingCycleLabels(t)[object.billing_cycle || 'monthly'] || t('billingCycleMonthly');
    const account = object.payment_account ? ` · ${object.payment_account}` : '';
    const next = nextBillingDate ? ` · ${t('nextBilling').replace('{date}', nextBillingDate)}` : '';
    return `${cycle}${account}${next}`;
  }
  return `${getSupportingTimeLabel(object, t)}：${formatDateRange(object, t)}`;
}

export function getPhysicalAccentClasses(bucket: string): {
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

export function transitionSupportingObject(object: WYQDObject): WYQDObject {
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

export function getDetailRows(object: WYQDObject, t: TranslateFn): Array<{ label: string; value: string }> {
  if (object.object_type === 'physical') {
    const dailyCost = calculatePhysicalDailyCost(object);
    return [
      { label: t('type'), value: getTypeLabels(t)[object.object_type] },
      { label: t('status'), value: getStatusLabel(object, t) },
      { label: t('categoryLabel'), value: object.category ? translateCategory(object.category, t) : formatOptional(object.category, t) },
      { label: t('totalAcquisitionCost'), value: formatMoney(calculatePhysicalAcquisitionCost(object)) },
      { label: t('dailyExperienceCost'), value: dailyCost ? `${formatMoney(dailyCost)}${t('perDay')}` : t('noFormed') },
      { label: t('purchaseDate'), value: formatOptional(object.purchased_at, t) },
      { label: t('endDate'), value: formatOptional(object.ended_at, t) },
      { label: t('salePrice'), value: formatMoney(object.sale_price || 0) },
    ];
  }
  if (object.object_type === 'recurring_cost') {
    const monthlyCost = calculateRecurringMonthlyCost(object);
    return [
      { label: t('type'), value: getTypeLabels(t)[object.object_type] },
      { label: t('status'), value: getStatusLabel(object, t) },
      { label: t('categoryLabel'), value: object.category ? translateCategory(object.category, t) : formatOptional(object.category, t) },
      { label: t('billingCycle'), value: getBillingCycleLabels(t)[object.billing_cycle || 'monthly'] || t('billingCycleMonthly') },
      { label: t('billingAmount'), value: formatMoney(object.billing_amount || 0) },
      { label: t('monthlyEquivalent'), value: formatMoney(monthlyCost) },
      { label: t('annualCost'), value: formatMoney(object.annualized_cost || monthlyCost * 12) },
      { label: t('startDate'), value: formatOptional(object.started_at, t) },
      { label: t('billingDay'), value: object.billing_day ? `${object.billing_day}` : t('notRecorded') },
      { label: t('paymentAccount'), value: formatOptional(object.payment_account, t) },
      { label: t('pausedDate'), value: formatOptional(object.paused_at, t) },
      { label: t('cancelledDate'), value: formatOptional(object.cancelled_at, t) },
    ];
  }
  return [
    { label: t('type'), value: getTypeLabels(t)[object.object_type] },
    { label: t('status'), value: getStatusLabel(object, t) },
    { label: t('categoryLabel'), value: object.category ? translateCategory(object.category, t) : formatOptional(object.category, t) },
    { label: t('budget'), value: formatMoney(object.budget_total || 0) },
    { label: t('actualAmount'), value: object.actual_total ? formatMoney(object.actual_total) : t('notRecorded') },
    { label: t('plannedDate'), value: formatOptional(object.planned_at, t) },
    { label: t('startDate'), value: formatOptional(object.started_at, t) },
    { label: t('endDate'), value: formatOptional(object.ended_at, t) },
    { label: t('reviewedDate'), value: formatOptional(object.reviewed_at, t) },
  ];
}

export function getTimelineRows(object: WYQDObject, t: TranslateFn): Array<{ label: string; value?: string | null }> {
  if (object.object_type === 'physical') {
    return [
      { label: t('createdAt'), value: object.created_at },
      { label: t('purchaseDate'), value: object.purchased_at },
      { label: t('exitedAt'), value: object.ended_at },
      { label: t('updated'), value: object.updated_at },
    ];
  }
  if (object.object_type === 'recurring_cost') {
    return [
      { label: t('createdAt'), value: object.created_at },
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
