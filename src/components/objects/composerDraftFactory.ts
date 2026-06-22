import type { WYQDTranslationKey } from '@/core/i18n';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import type {
  BillingCycle,
  OneTimeExperienceStatus,
  PhysicalObject,
  PhysicalStatus,
  RecurringCostStatus,
  WYQDObject,
  WYQDObjectType,
} from '@/domain/types';

export function getPhysicalCategories(t: (key: WYQDTranslationKey) => string): string[] {
  return [
    t('categoryElectronics'),
    t('categoryCamera'),
    t('categoryClothing'),
    t('categoryHome'),
    t('categoryTransport'),
    t('categoryOther'),
  ];
}

export function getPhysicalStatusOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: PhysicalStatus; label: string }> {
  return [
    { value: 'observing', label: t('statusObserving') },
    { value: 'purchased', label: t('statusPurchased') },
    { value: 'using', label: t('statusUsing') },
    { value: 'idle', label: t('statusIdle') },
    { value: 'transferred', label: t('statusTransferred') },
    { value: 'discarded', label: t('statusDiscarded') },
  ];
}

export function getRecurringStatusOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: RecurringCostStatus; label: string }> {
  return [
    { value: 'seeded', label: t('statusSeeded') },
    { value: 'active', label: t('statusActive') },
    { value: 'paused', label: t('statusPaused') },
    { value: 'cancelled', label: t('statusCancelled') },
  ];
}

export function getBillingCycleOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: BillingCycle; label: string }> {
  return [
    { value: 'weekly', label: t('billingCycleWeekly') },
    { value: 'monthly', label: t('billingCycleMonthly') },
    { value: 'quarterly', label: t('billingCycleQuarterly') },
    { value: 'annual', label: t('billingCycleAnnual') },
    { value: 'custom', label: t('billingCycleCustom') },
  ];
}

export function getExperienceStatusOptions(t: (key: WYQDTranslationKey) => string): Array<{ value: OneTimeExperienceStatus; label: string }> {
  return [
    { value: 'planned', label: t('statusPlanned') },
    { value: 'in_progress', label: t('statusInProgress') },
    { value: 'completed', label: t('statusCompleted') },
    { value: 'reviewed', label: t('statusReviewed') },
  ];
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function createObjectDraft({
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
    currency: 'CNY' as const,
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

export function getInitialAmount(object?: WYQDObject): string {
  if (!object) return '';
  if (object.object_type === 'physical') {
    return String(object.total_acquisition_cost || object.purchase_price || '');
  }
  if (object.object_type === 'recurring_cost') {
    return String(object.billing_amount || '');
  }
  return String(object.budget_total || object.actual_total || '');
}

export function updateObjectDraft(
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
