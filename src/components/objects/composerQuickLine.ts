import type { WYQDTranslationKey } from '@/core/i18n';
import { COUNTRY_NAMES } from '@/domain/travel';
import type {
  BillingCycle,
  OneTimeExperienceStatus,
  PhysicalStatus,
  RecurringCostStatus,
  WYQDObjectType,
} from '@/domain/types';

export function getQuickLineTemplates(t: (key: WYQDTranslationKey) => string, lang: string): Array<{ label: string; value: string }> {
  const isZh = lang !== 'en';
  const travelCategory = isZh ? '旅行体验' : 'Travel experience';
  const aiCategory = isZh ? 'AI工具' : 'AI Tools';
  return [
    {
      label: t('physicalTemplate'),
      value: isZh
        ? `Sony A7C / physical / 12000 / 2026-05-01 / 2026-05-17 / ${t('categoryElectronics')} / 使用中`
        : `Sony A7C / physical / 12000 / 2026-05-01 / 2026-05-17 / ${t('categoryElectronics')} / using`,
    },
    {
      label: t('fixedCostTemplate'),
      value: isZh
        ? `ChatGPT Plus / fixed / 145 / monthly / 20 / 招行信用卡 / 2026-05-01 / 订阅中 / ${aiCategory}`
        : `ChatGPT Plus / fixed / 20 / monthly / 1 / Credit Card / 2026-01-01 / active / ${aiCategory}`,
    },
    {
      label: t('experienceTemplate'),
      value: isZh
        ? `东京 / travel / 18000 / 16500 / 2026-05-04 / ${travelCategory} / 已完成 / JP / 35.6762 / 139.6503`
        : `Tokyo / travel / 18000 / 16500 / 2026-05-04 / ${travelCategory} / completed / JP / 35.6762 / 139.6503`,
    },
  ];
}

export function parsePhysicalStatus(value: string): PhysicalStatus | null {
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

export function parseRecurringStatus(value: string): RecurringCostStatus | null {
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

export function parseExperienceStatus(value: string): OneTimeExperienceStatus | null {
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

export function parseBillingCycle(value: string): BillingCycle | null {
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

export function parseObjectType(value: string): WYQDObjectType | null {
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
    travel: 'one_time_experience',
    旅行: 'one_time_experience',
  };

  return typeMap[normalized] || null;
}

export function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function applyQuickLine(
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
    setExperienceSubtype?: (next: string) => void;
    setLocationCountry?: (next: string) => void;
    setLocationCountryCode?: (next: string) => void;
    setLocationCity?: (next: string) => void;
    setLocationLatitude?: (next: string) => void;
    setLocationLongitude?: (next: string) => void;
  },
) {
  const parts = value
    .split(/[\/／，,|]/)
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
    const [name, typeOrSubtype, budget, actual, endedAt, maybeCategory, status, countryCode, lat, lng] = parts;
    setters.setObjectType('one_time_experience');
    if (name) setters.setTitle(name);
    if (budget && /^\d+(\.\d+)?$/.test(budget)) setters.setAmount(budget);
    if (actual && /^\d+(\.\d+)?$/.test(actual)) setters.setActualAmount(actual);
    if (endedAt && isDateLike(endedAt)) setters.setEndedAt(endedAt);
    if (maybeCategory) setters.setCategory(maybeCategory);
    const parsedStatus = parseExperienceStatus(status || '');
    if (parsedStatus) setters.setExperienceStatus(parsedStatus);
    const subtypeKeywords = ['travel', '旅行', '旅行体验', 'travel_worldview'];
    if (
      subtypeKeywords.includes((typeOrSubtype || '').toLowerCase()) ||
      subtypeKeywords.includes((maybeCategory || '').toLowerCase())
    ) {
      setters.setExperienceSubtype?.('travel_worldview');
    }
    if (countryCode) {
      setters.setLocationCountryCode?.(countryCode);
      setters.setLocationCountry?.(COUNTRY_NAMES[countryCode.toUpperCase()] || countryCode);
    }
    if (lat && /^-?\d+(\.\d+)?$/.test(lat)) setters.setLocationLatitude?.(lat);
    if (lng && /^-?\d+(\.\d+)?$/.test(lng)) setters.setLocationLongitude?.(lng);
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
