export type CurrencyCode = 'CNY' | 'USD' | 'EUR' | 'HKD' | string;

export type WYQDEntityType = 'object' | 'account' | 'snapshot' | 'review';

export type WYQDObjectType = 'physical' | 'recurring_cost' | 'one_time_experience';

export type PhysicalStatus =
  | 'seeded'
  | 'observing'
  | 'purchased'
  | 'using'
  | 'idle'
  | 'transferred'
  | 'discarded';

export type RecurringCostStatus = 'seeded' | 'active' | 'paused' | 'cancelled';

export type OneTimeExperienceStatus = 'planned' | 'in_progress' | 'completed' | 'reviewed';

export type WYQDObjectStatus = PhysicalStatus | RecurringCostStatus | OneTimeExperienceStatus;

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';

export type AmortizationMode = 'none' | 'fixed_term';

export interface BaseEntity {
  schema_version: '0.1';
  id: string;
  type: WYQDEntityType;
  title: string;
  created_at: string;
  updated_at?: string;
  archived_at?: string;
  archived_from?: string;
  original_file_name?: string;
  currency?: CurrencyCode;
  tags?: string[];
  notes?: string;
}

export interface BaseWYQDObject extends BaseEntity {
  type: 'object';
  object_type: WYQDObjectType;
  status: WYQDObjectStatus;
  category?: string;
  regret_score?: number | null;
  review_ref?: string | null;
}

export interface PhysicalObject extends BaseWYQDObject {
  object_type: 'physical';
  status: PhysicalStatus;
  brand?: string;
  model?: string;
  seeded_at?: string;
  observed_at?: string;
  purchased_at?: string;
  first_used_at?: string;
  ended_at?: string | null;
  purchase_price?: number;
  purchase_tax?: number;
  shipping_fee?: number;
  accessory_cost?: number;
  total_acquisition_cost?: number;
  sale_price?: number;
  transfer_fee?: number;
  realized_experience_cost?: number | null;
  amortization_mode?: AmortizationMode;
  amortization_days?: number | null;
  residual_value?: number;
  include_in_net_worth?: false;
  default_depreciates_to_zero?: true;
  condition?: string;
  location?: string;
}

export interface RecurringCostObject extends BaseWYQDObject {
  object_type: 'recurring_cost';
  status: RecurringCostStatus;
  provider?: string;
  plan?: string;
  started_at?: string;
  paused_at?: string | null;
  cancelled_at?: string | null;
  billing_cycle?: BillingCycle;
  billing_amount?: number;
  billing_currency?: CurrencyCode;
  billing_day?: number;
  annualized_cost?: number;
  payment_account?: string | null;
  is_essential?: boolean;
  replacement?: string | null;
  cancel_reason?: string | null;
}

export interface TravelLocation {
  country?: string;
  region?: string;
  city?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
}

export interface OneTimeExperienceObject extends BaseWYQDObject {
  object_type: 'one_time_experience';
  status: OneTimeExperienceStatus;
  experience_subtype?: 'travel_worldview' | string;
  planned_at?: string;
  started_at?: string;
  ended_at?: string;
  reviewed_at?: string | null;
  location?: TravelLocation;
  locations?: TravelLocation[];
  budget_total?: number;
  actual_total?: number;
  expense_items?: ExperienceExpenseItem[];
  worldview_tags?: string[];
}

export interface ExperienceExpenseItem {
  name: string;
  amount: number;
  currency?: CurrencyCode;
  category?: string;
}

export type WYQDObject = PhysicalObject | RecurringCostObject | OneTimeExperienceObject;

export type AccountType = 'asset' | 'liability';
export type AssetCategory = 'cash' | 'brokerage' | 'retirement' | 'crypto' | 'other';
export type LiabilityType = 'credit_card' | 'mortgage_or_auto' | 'long_term_debt' | 'loan';

export interface Account extends BaseEntity {
  type: 'account';
  account_type: AccountType;
  provider?: string;
  account_name?: string;
  status: 'active' | 'closed';
  opened_at?: string | null;
  closed_at?: string | null;
  include_in_net_worth: boolean;
  asset_category?: AssetCategory;
  liability_type?: LiabilityType;
}

export interface AccountBalance {
  account: string;
  account_id: string;
  amount: number;
  currency?: CurrencyCode;
}

export interface AccountSnapshot extends BaseEntity {
  type: 'snapshot';
  snapshot_type: 'net_worth';
  snapshot_at: string;
  is_month_end?: boolean;
  asset_balances: AccountBalance[];
  liability_balances: AccountBalance[];
  total_assets?: number;
  total_liabilities?: number;
  net_worth?: number;
  monthly_fixed_cost?: number;
  owned_physical_count?: number;
  physical_residual_value?: number;
  active_subscription_count?: number;
  observing_desire_amount?: number;
}

export type ReviewType = 'object_review' | 'exit_record' | 'monthly' | 'annual';
export type ExitType = 'idle' | 'transferred' | 'discarded' | 'paused' | 'cancelled' | 'completed';

export interface ReviewEntry extends BaseEntity {
  type: 'review';
  review_type: ReviewType;
  target?: string;
  target_id?: string;
  target_type?: WYQDObjectType;
  reviewed_at?: string;
  exited_at?: string;
  exit_type?: ExitType;
  sale_price?: number;
  transfer_fee?: number;
  realized_experience_cost?: number;
  food_rank?: number | null;
  scenery_rank?: number | null;
  experience_rank?: number | null;
  food_score?: number | null;
  scenery_score?: number | null;
  experience_score?: number | null;
  regret_score?: number | null;
  summary?: string;
  period?: string;
  year?: number;
}

export interface HomeMetrics {
  netWorth: number | null;
  netWorthDeltaFromPreviousMonth: number | null;
  monthlyFixedCost: number;
  ownedPhysicalCount: number;
  physicalResidualValue: number;
  activeSubscriptionCount: number;
  observingDesireAmount: number;
}
