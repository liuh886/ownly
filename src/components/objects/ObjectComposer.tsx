'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/core/i18n-context';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import type { WYQDTranslationKey } from '@/core/i18n';
import { CitySearchInput } from '@/components/common/CitySearchInput';
import { COUNTRY_NAMES } from '@/domain/travel';
import { FIELD_CLASS } from '@/lib/ui-constants';
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
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
}

function getPhysicalCategories(t: (key: WYQDTranslationKey) => string): string[] {
  return [
    t('categoryElectronics'),
    t('categoryCamera'),
    t('categoryClothing'),
    t('categoryHome'),
    t('categoryTransport'),
    t('categoryOther'),
  ];
}
function getPhysicalStatusOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: PhysicalStatus; label: string }> {
  return [
    { value: 'observing', label: t('statusObserving') },
    { value: 'purchased', label: t('statusPurchased') },
    { value: 'using', label: t('statusUsing') },
    { value: 'idle', label: t('statusIdle') },
    { value: 'transferred', label: t('statusTransferred') },
    { value: 'discarded', label: t('statusDiscarded') },
  ];
}
function getRecurringStatusOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: RecurringCostStatus; label: string }> {
  return [
    { value: 'seeded', label: t('statusSeeded') },
    { value: 'active', label: t('statusActive') },
    { value: 'paused', label: t('statusPaused') },
    { value: 'cancelled', label: t('statusCancelled') },
  ];
}
function getBillingCycleOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: BillingCycle; label: string }> {
  return [
    { value: 'weekly', label: t('billingCycleWeekly') },
    { value: 'monthly', label: t('billingCycleMonthly') },
    { value: 'quarterly', label: t('billingCycleQuarterly') },
    { value: 'annual', label: t('billingCycleAnnual') },
    { value: 'custom', label: t('billingCycleCustom') },
  ];
}
function getExperienceStatusOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: OneTimeExperienceStatus; label: string }> {
  return [
    { value: 'planned', label: t('statusPlanned') },
    { value: 'in_progress', label: t('statusInProgress') },
    { value: 'completed', label: t('statusCompleted') },
    { value: 'reviewed', label: t('statusReviewed') },
  ];
}
function getQuickLineTemplates(t: (key: WYQDTranslationKey) => string, lang: string): Array<{ label: string; value: string }> {
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
    travel: 'one_time_experience',
    旅行: 'one_time_experience',
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
    setExperienceSubtype?: (next: string) => void;
    setLocationCountry?: (next: string) => void;
    setLocationCountryCode?: (next: string) => void;
    setLocationCity?: (next: string) => void;
    setLocationLatitude?: (next: string) => void;
    setLocationLongitude?: (next: string) => void;
  },
) {
  const parts = value
    .split(/[／，,|]/)
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
  salePrice,
  experienceSubtype,
  location,
  locations,
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
  salePrice?: number;
  experienceSubtype?: string;
  location?: { country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number };
  locations?: Array<{ country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number }>;
}): WYQDObject {
  const today = new Date().toISOString().split('T')[0];
  const id = `obj_${today.replaceAll('-', '')}_${Date.now()}`;
  const base = {
    schema_version: WYQD_SCHEMA_VERSION,
    id,
    type: 'object' as const,
    title,
    currency: 'CNY',
    tags: ['ownly'],
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
      sale_price: salePrice || undefined,
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
    experience_subtype: experienceSubtype || undefined,
    budget_total: amount,
    actual_total: actualAmount,
    ended_at: endedAt || undefined,
    location: location && (
      location.country ||
      location.region ||
      location.city ||
      location.country_code ||
      location.latitude != null ||
      location.longitude != null
    ) ? location : undefined,
    locations: locations && locations.length > 0 ? locations : undefined,
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
  autoFocus,
  onAutoFocusHandled,
}: ObjectComposerProps) {
  const { t, language } = useI18n();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && nameInputRef.current) {
      const timer = window.setTimeout(() => {
        nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInputRef.current?.focus();
        onAutoFocusHandled?.();
      }, 300);
      return () => window.clearTimeout(timer);
    }
  }, [autoFocus, onAutoFocusHandled]);

  const physicalCategories = getPhysicalCategories(t);
  const physicalStatusOptions = getPhysicalStatusOptions(t);
  const recurringStatusOptions = getRecurringStatusOptions(t);
  const billingCycleOptions = getBillingCycleOptions(t);
  const experienceStatusOptions = getExperienceStatusOptions(t);
  const quickLineTemplates = getQuickLineTemplates(t, language);

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
  const [salePrice, setSalePrice] = useState(
    initialObject?.object_type === 'physical' && initialObject.sale_price !== undefined
      ? String(initialObject.sale_price)
      : '',
  );
  const [quickLine, setQuickLine] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [experienceSubtype, setExperienceSubtype] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.experience_subtype || '' : '',
  );
  const [locationCountry, setLocationCountry] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.country || '' : '',
  );
  const [locationRegion, setLocationRegion] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.region || '' : '',
  );
  const [locationCity, setLocationCity] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.city || '' : '',
  );
  const [locationCountryCode, setLocationCountryCode] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.country_code || '' : '',
  );
  const [locationLatitude, setLocationLatitude] = useState(
    initialObject?.object_type === 'one_time_experience' && initialObject.location?.latitude != null
      ? String(initialObject.location.latitude) : '',
  );
  const [locationLongitude, setLocationLongitude] = useState(
    initialObject?.object_type === 'one_time_experience' && initialObject.location?.longitude != null
      ? String(initialObject.location.longitude) : '',
  );
  const [extraLocations, setExtraLocations] = useState<Array<{
    city: string; country: string; countryCode: string; lat: string; lng: string;
  }>>(
    initialObject?.object_type === 'one_time_experience' && initialObject.locations
      ? initialObject.locations.map((loc) => ({
          city: loc.city || '',
          country: loc.country || '',
          countryCode: loc.country_code || '',
          lat: loc.latitude != null ? String(loc.latitude) : '',
          lng: loc.longitude != null ? String(loc.longitude) : '',
        }))
      : [],
  );

  const parsedBillingDay = Number(billingDay);
  const isBillingDayValid =
    objectType !== 'recurring_cost' ||
    !billingDay.trim() ||
    (Number.isInteger(parsedBillingDay) && parsedBillingDay >= 1 && parsedBillingDay <= 31);
  const canSubmit =
    !disabled && title.trim() && amount.trim() && Number(amount) >= 0 && isBillingDayValid && !isSaving;
  const fieldClass = FIELD_CLASS;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.name = t('validationTitleRequired')
    if (amount !== undefined && amount.trim() && Number(amount) < 0) e.amount = t('validationAmountPositive')
    if (objectType === 'recurring_cost' && billingDay !== undefined && billingDay !== null && billingDay.trim() !== '' && (Number(billingDay) < 1 || Number(billingDay) > 31)) {
      e.billingDay = t('validationBillingDayRange')
    }
    return e
  }

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
      setExperienceSubtype,
      setLocationCountry,
      setLocationCountryCode,
      setLocationCity,
      setLocationLatitude,
      setLocationLongitude,
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
        void handleSubmit(event as unknown as React.SyntheticEvent<HTMLFormElement>);
      }
    }
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = validate();
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }
    setErrors({});
    if (!canSubmit) return;

    setIsSaving(true);
    try {
      const travelLocation = (locationCountry || locationRegion || locationCity || locationCountryCode || locationLatitude || locationLongitude)
        ? {
            country: locationCountry || undefined,
            region: locationRegion || undefined,
            city: locationCity || undefined,
            country_code: locationCountryCode || undefined,
            latitude: locationLatitude ? Number(locationLatitude) : undefined,
            longitude: locationLongitude ? Number(locationLongitude) : undefined,
          }
        : undefined;
      const parsedExtraLocations = extraLocations
        .filter((loc) => loc.city || loc.lat || loc.lng)
        .map((loc) => ({
          city: loc.city || undefined,
          country: loc.country || undefined,
          country_code: loc.countryCode || undefined,
          latitude: loc.lat ? Number(loc.lat) : undefined,
          longitude: loc.lng ? Number(loc.lng) : undefined,
        }));

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
            salePrice: salePrice.trim() ? Number(salePrice) : undefined,
            experienceSubtype: experienceSubtype || undefined,
            location: travelLocation,
            locations: parsedExtraLocations.length > 0 ? parsedExtraLocations : undefined,
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
            salePrice: salePrice.trim() ? Number(salePrice) : undefined,
            experienceSubtype: experienceSubtype || undefined,
            location: travelLocation,
            locations: parsedExtraLocations.length > 0 ? parsedExtraLocations : undefined,
          });
      const bodyTemplate = objectType === 'one_time_experience'
        ? `## ${t('experienceReview')}\n\n## ${t('reviewRankingSection')}\n`
        : `## ${t('purchaseReason')}\n\n## ${t('usageLog')}\n\n## ${t('reviewAndRanking')}\n`;
      await onSubmit(object, bodyTemplate);
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
        setExperienceSubtype('');
        setLocationCountry('');
        setLocationRegion('');
        setLocationCity('');
        setLocationCountryCode('');
        setLocationLatitude('');
        setLocationLongitude('');
        setQuickLine('');
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-950">
            {initialObject ? t('editObject') : t('quickEntry')}
          </h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {initialObject ? t('editObjectDesc') : t('quickEntryDesc')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
          {objectType === 'physical' ? t('typePhysical') : objectType === 'recurring_cost' ? t('typeRecurringCost') : t('typeExperience')}
        </span>
      </div>

      <div className="space-y-4">
        {!initialObject ? (
          <div className="space-y-2">
            <label className="block">
              <div className="flex items-center gap-1.5">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('pasteLine')}</span>
                <span className="relative group mb-1.5">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-stone-200 text-stone-500 text-[10px] cursor-help">?</span>
                  <span className="invisible group-hover:visible absolute left-6 top-0 z-50 w-64 p-3 bg-stone-900 text-white text-xs rounded-lg shadow-lg leading-relaxed">
                    {t('pasteLineFormatHelp')}
                  </span>
                </span>
              </div>
              <input
                value={quickLine}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuickLine(next);
                  applyQuickLineToForm(next);
                }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder={t('pasteLinePlaceholder')}
                className={`${fieldClass} bg-stone-50 focus:bg-white`}
                disabled={disabled || isSaving}
              />
              <p className="text-[11px] text-stone-400 mt-1">{t('pasteLineHint')}</p>
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
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('name')}</span>
          <input
            ref={nameInputRef}
            value={title}
            onChange={(event) => { setTitle(event.target.value); if (errors.name) setErrors(prev => ({ ...prev, name: '' })) }}
            placeholder={t('namePlaceholder')}
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}

        <div className="grid grid-cols-1 gap-3">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('type')}</span>
            <select
              value={objectType}
              onChange={(event) => setObjectType(event.target.value as WYQDObjectType)}
              className={fieldClass}
              disabled={disabled || isSaving}
            >
              <option value="physical">{t('typePhysical')}</option>
              <option value="recurring_cost">{t('typeRecurringCost')}</option>
              <option value="one_time_experience">{t('typeExperience')}</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('amount')}</span>
            <input
              value={amount}
              onChange={(event) => { setAmount(event.target.value); if (errors.amount) setErrors(prev => ({ ...prev, amount: '' })) }}
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="5843"
              className={fieldClass}
              disabled={disabled || isSaving}
            />
          </label>
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
        </div>

        {objectType === 'physical' ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('purchaseDate')}</span>
                <input
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                  type="date"
                  aria-label={t('purchaseDateAria')}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('endDate')}</span>
                <input
                  value={endedAt}
                  onChange={(event) => setEndedAt(event.target.value)}
                  type="date"
                  aria-label={t('retireDateAria')}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('categoryLabel')}</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                >
                  <option value="">{t('uncategorized')}</option>
                  {physicalCategories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('status')}</span>
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

            {physicalStatus === 'transferred' ? (
              <div className="grid grid-cols-1 gap-3">
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('salePrice')}</span>
                  <input
                    value={salePrice}
                    onChange={(event) => setSalePrice(event.target.value)}
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    className={fieldClass}
                    disabled={disabled || isSaving}
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {objectType === 'recurring_cost' ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('billingCycle')}</span>
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
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('status')}</span>
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
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('startDate')}</span>
                <input
                  value={recurringStartedAt}
                  onChange={(event) => setRecurringStartedAt(event.target.value)}
                  type="date"
                  aria-label={t('startDate')}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('billingDay')}</span>
                <input
                  value={billingDay}
                  onChange={(event) => { setBillingDay(event.target.value); if (errors.billingDay) setErrors(prev => ({ ...prev, billingDay: '' })) }}
                  type="number"
                  min="1"
                  max="31"
                  inputMode="numeric"
                  placeholder={t('billingDayPlaceholder')}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              {errors.billingDay && <p className="text-xs text-red-500 mt-1">{errors.billingDay}</p>}
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('paymentAccount')}</span>
                <input
                  value={paymentAccount}
                  onChange={(event) => setPaymentAccount(event.target.value)}
                  placeholder={t('paymentAccountPlaceholder')}
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
              <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('actualAmount')}</span>
              <input
                value={actualAmount}
                onChange={(event) => setActualAmount(event.target.value)}
                type="number"
                min="0"
                inputMode="decimal"
                placeholder={t('optional')}
                className={fieldClass}
                disabled={disabled || isSaving}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('endDate')}</span>
              <input
                value={endedAt}
                onChange={(event) => setEndedAt(event.target.value)}
                type="date"
                aria-label={t('experienceEndDateAria')}
                className={fieldClass}
                disabled={disabled || isSaving}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('status')}</span>
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
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('travelSubtype')}</span>
              <select
                value={experienceSubtype}
                onChange={(event) => setExperienceSubtype(event.target.value)}
                className={fieldClass}
                disabled={disabled || isSaving}
              >
                <option value="">{t('typeExperience')}</option>
                <option value="travel_worldview">{t('travelSubtype')}</option>
              </select>
            </label>
            {experienceSubtype === 'travel_worldview' ? (
              <div className="space-y-3">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('travelCity')}</span>
                  <CitySearchInput
                    initialValue={locationCity || undefined}
                    onSelect={(city) => {
                      setLocationCity(city.name);
                      setLocationCountry(city.country);
                      setLocationCountryCode(city.countryCode);
                      setLocationLatitude(String(city.latitude));
                      setLocationLongitude(String(city.longitude));
                    }}
                    disabled={disabled || isSaving}
                  />
                </div>
                {locationCity ? (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                    {[locationCity, locationCountry, locationCountryCode].filter(Boolean).join(', ')}
                    {locationLatitude && locationLongitude
                      ? ` (${locationLatitude}, ${locationLongitude})`
                      : ''}
                  </div>
                ) : null}
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('travelRegion')}</span>
                  <input
                    value={locationRegion}
                    onChange={(event) => setLocationRegion(event.target.value)}
                    placeholder={t('optional')}
                    className={fieldClass}
                    disabled={disabled || isSaving}
                  />
                </label>

                {/* Additional stops */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-stone-500">{t('additionalStops')}</span>
                    <button
                      type="button"
                      onClick={() => setExtraLocations([...extraLocations, { city: '', country: '', countryCode: '', lat: '', lng: '' }])}
                      className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
                      disabled={disabled || isSaving}
                    >
                      + {t('addStop')}
                    </button>
                  </div>
                  {extraLocations.map((loc, idx) => (
                    <div key={idx} className="mb-2 rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-stone-400">{t('stopN').replace('{n}', String(idx + 2))}</span>
                        <button
                          type="button"
                          onClick={() => setExtraLocations(extraLocations.filter((_, i) => i !== idx))}
                          className="text-[11px] text-stone-400 hover:text-red-600 transition"
                          disabled={disabled || isSaving}
                        >
                          ✕
                        </button>
                      </div>
                      <CitySearchInput
                        initialValue={loc.city || undefined}
                        onSelect={(city) => {
                          const updated = [...extraLocations];
                          updated[idx] = {
                            city: city.name,
                            country: city.country,
                            countryCode: city.countryCode,
                            lat: String(city.latitude),
                            lng: String(city.longitude),
                          };
                          setExtraLocations(updated);
                        }}
                        disabled={disabled || isSaving}
                      />
                      {loc.city ? (
                        <div className="rounded-md bg-white px-2 py-1 text-[11px] text-stone-500">
                          {[loc.city, loc.country, loc.countryCode].filter(Boolean).join(', ')}
                          {loc.lat && loc.lng ? ` (${loc.lat}, ${loc.lng})` : ''}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
              {t('cancel')}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-w-0 flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {disabled ? t('connectVaultToWrite') : isSaving ? t('saving') : submitLabel || t('save')}
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
    salePrice?: number;
    experienceSubtype?: string;
    location?: { country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number };
    locations?: Array<{ country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number }>;
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
      sale_price: values.salePrice || existing.sale_price,
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
    experience_subtype: values.experienceSubtype || (existing as { experience_subtype?: string }).experience_subtype,
    budget_total: values.amount,
    actual_total: values.actualAmount,
    ended_at: values.endedAt || existing.ended_at,
    location: values.location || (existing as { location?: typeof values.location }).location,
    locations: values.locations !== undefined
      ? values.locations
      : (existing as { locations?: typeof values.locations }).locations,
  };
}
