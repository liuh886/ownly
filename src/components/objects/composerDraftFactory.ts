import type { WYQDTranslationKey } from '@/core/i18n';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import { todayLocalISO } from '@/domain/date';
import { recordCurrency } from '@/domain/currency';
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
  return todayLocalISO();
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
  annualizedCost: customAnnualizedCost,
  experienceSubtype,
  location,
  locations,
  currency = 'CNY',
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
  annualizedCost?: number;
  currency?: string;
  experienceSubtype?: string;
  location?: { country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number };
  locations?: Array<{ country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number }>;
}): WYQDObject {
  const today = todayLocalISO();
  const id = `obj_${today.replaceAll('-', '')}_${Date.now()}`;
  const base = {
    schema_version: WYQD_SCHEMA_VERSION,
    id,
    type: 'object' as const,
    title,
    currency,
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
      sale_price: salePrice,
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
              ? customAnnualizedCost ?? amount
              : amount * 12;

    return {
      ...base,
      object_type: 'recurring_cost',
      status: recurringStatus || 'active',
      billing_cycle: cycle,
      billing_amount: amount,
      billing_currency: currency,
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
    return String(object.total_acquisition_cost ?? object.purchase_price ?? '');
  }
  if (object.object_type === 'recurring_cost') {
    return String(object.billing_amount ?? '');
  }
  return String(object.budget_total ?? object.actual_total ?? '');
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
    annualizedCost?: number;
    experienceSubtype?: string;
    location?: { country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number };
    locations?: Array<{ country?: string; region?: string; city?: string; country_code?: string; latitude?: number; longitude?: number }>;
  },
): WYQDObject {
  const updatedAt = todayISO();

  if (values.objectType !== existing.object_type) {
    const draft = createObjectDraft({ ...values, currency: recordCurrency(existing) });
    const fields = {
      physical: ['brand', 'model', 'in_use_since', 'unused_since', 'seeded_at', 'observed_at', 'purchased_at', 'first_used_at', 'ended_at', 'purchase_price', 'purchase_tax', 'shipping_fee', 'accessory_cost', 'total_acquisition_cost', 'sale_price', 'transfer_fee', 'realized_experience_cost', 'amortization_mode', 'amortization_days', 'residual_value', 'include_in_net_worth', 'default_depreciates_to_zero', 'condition', 'location'],
      recurring_cost: ['provider', 'plan', 'started_at', 'paused_at', 'cancelled_at', 'billing_cycle', 'billing_amount', 'billing_currency', 'billing_day', 'annualized_cost', 'payment_account', 'is_essential', 'replacement', 'cancel_reason'],
      one_time_experience: ['experience_subtype', 'planned_at', 'started_at', 'ended_at', 'reviewed_at', 'location', 'locations', 'budget_total', 'actual_total', 'expense_items', 'worldview_tags'],
    };
    const converted = { ...existing, ...draft } as unknown as Record<string, unknown>;
    for (const field of fields[existing.object_type]) {
      if (!fields[values.objectType].includes(field)) delete converted[field];
    }
    // Editing changes classification, not the identity or source metadata.
    return { ...converted, id: existing.id, created_at: existing.created_at, currency: recordCurrency(existing), tags: existing.tags ?? draft.tags } as unknown as WYQDObject;
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
      purchase_price: existing.purchase_price,
      total_acquisition_cost: values.amount,
      sale_price: values.salePrice,
    } satisfies PhysicalObject;
  }

  if (existing.object_type === 'recurring_cost') {
    const cycle = values.billingCycle || existing.billing_cycle || 'monthly';
    return {
      ...existing,
      title: values.title,
      updated_at: updatedAt,
      category: values.category || undefined,
      status: values.recurringStatus || existing.status,
      billing_cycle: cycle,
      billing_amount: values.amount,
      billing_day: values.billingDay,
      payment_account: values.paymentAccount || null,
      started_at: values.recurringStartedAt || undefined,
      annualized_cost:
        cycle === 'weekly'
          ? values.amount * 52
          : cycle === 'quarterly'
            ? values.amount * 4
            : cycle === 'custom'
              ? values.annualizedCost ?? existing.annualized_cost ?? values.amount
            : cycle === 'annual'
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
    experience_subtype: values.experienceSubtype || undefined,
    budget_total: values.amount,
    actual_total: values.actualAmount,
    ended_at: values.endedAt || undefined,
    location: values.location,
    locations: values.locations,
  };
}
