import type {
  BillingCycle,
  ObjectLogEventType,
  PhysicalStatus,
  RecurringCostObject,
  ReviewEntry,
  WYQDObject,
} from '../../src/domain/types';
import { CliError, type AgentObjectRow, type ObjectEntry, type ReviewEntryFile } from './types';

const PHYSICAL_STATUS_ALIASES: Record<string, PhysicalStatus> = {
  seeded: 'seeded',
  observing: 'observing',
  purchased: 'purchased',
  using: 'using',
  idle: 'idle',
  transferred: 'transferred',
  discarded: 'discarded',
  '种草': 'seeded',
  '观察中': 'observing',
  '观望': 'observing',
  '已购买': 'purchased',
  '服役中': 'using',
  '使用中': 'using',
  '已退役': 'idle',
  '已卖出': 'transferred',
  '已转让': 'transferred',
  '已丢弃': 'discarded',
};

export function todayISO(now = new Date()): string {
  return now.toISOString().split('T')[0];
}

export function nowId(now = new Date()): string {
  return `${todayISO(now).replaceAll('-', '')}_${now.getTime()}`;
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

export function normalizePhysicalStatus(value: string | undefined): PhysicalStatus | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const status = PHYSICAL_STATUS_ALIASES[normalized];
  if (!status) {
    throw new CliError(`Invalid physical status: ${value}`, 'INVALID_INPUT');
  }
  return status;
}

export function isBillingCycle(value: string): value is BillingCycle {
  return ['weekly', 'monthly', 'quarterly', 'annual', 'custom'].includes(value);
}

export function requireBillingCycle(value: string | undefined, fallback: BillingCycle): BillingCycle {
  if (!value) return fallback;
  if (!isBillingCycle(value)) {
    throw new CliError(
      `Invalid billing cycle: ${value}. Allowed: weekly, monthly, quarterly, annual, custom`,
      'INVALID_INPUT',
    );
  }
  return value;
}

export function calculateAnnualizedCost(amount: number, cycle: BillingCycle): number {
  if (cycle === 'weekly') return amount * 52;
  if (cycle === 'quarterly') return amount * 4;
  if (cycle === 'annual' || cycle === 'custom') return amount;
  return amount * 12;
}

export function calculateMonthlyCost(recurring: RecurringCostObject): number {
  const amount = recurring.billing_amount ?? 0;
  if (recurring.billing_cycle === 'weekly') return (amount * 52) / 12;
  if (recurring.billing_cycle === 'quarterly') return amount / 3;
  if (recurring.billing_cycle === 'annual') return amount / 12;
  if (recurring.billing_cycle === 'custom') return (recurring.annualized_cost ?? 0) / 12;
  return amount;
}

function parseLocalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function clampDay(year: number, monthIndex: number, day: number): number {
  return Math.min(day, new Date(year, monthIndex + 1, 0).getDate());
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function calculateNextBillingDate(
  recurring: RecurringCostObject,
  today = new Date(),
): string | undefined {
  if (recurring.status !== 'active' || recurring.billing_cycle === 'custom') return undefined;

  const start = parseLocalDate(recurring.started_at ?? recurring.created_at) ?? today;
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (recurring.billing_cycle === 'weekly') {
    const next = new Date(start);
    while (next < normalizedToday) next.setDate(next.getDate() + 7);
    return formatDate(next);
  }

  const day = recurring.billing_day ?? start.getDate();
  if (recurring.billing_cycle === 'annual') {
    const monthIndex = start.getMonth();
    let next = new Date(
      normalizedToday.getFullYear(),
      monthIndex,
      clampDay(normalizedToday.getFullYear(), monthIndex, day),
    );
    if (next < normalizedToday) {
      next = new Date(
        normalizedToday.getFullYear() + 1,
        monthIndex,
        clampDay(normalizedToday.getFullYear() + 1, monthIndex, day),
      );
    }
    return formatDate(next);
  }

  const interval = recurring.billing_cycle === 'quarterly' ? 3 : 1;
  let next = new Date(
    start.getFullYear(),
    start.getMonth(),
    clampDay(start.getFullYear(), start.getMonth(), day),
  );
  while (next < normalizedToday) {
    const advanced = addMonths(next, interval);
    next = new Date(
      advanced.getFullYear(),
      advanced.getMonth(),
      clampDay(advanced.getFullYear(), advanced.getMonth(), day),
    );
  }
  return formatDate(next);
}

export function daysBetween(fromDate: Date, toDate: string): number {
  const start = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  ).getTime();
  const end = new Date(`${toDate}T00:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function formatAgentRow(
  entry: ObjectEntry,
  reviews: readonly ReviewEntryFile[],
): AgentObjectRow {
  const object = entry.frontmatter;
  const hasReview = Boolean(object.review_ref)
    || reviews.some((review) => review.frontmatter.target_id === object.id);
  const needsReview =
    (object.object_type === 'physical'
      && ['idle', 'transferred', 'discarded'].includes(object.status))
    || (object.object_type === 'recurring_cost' && object.status === 'cancelled')
    || (object.object_type === 'one_time_experience'
      && object.status === 'completed'
      && !hasReview);

  const row: AgentObjectRow = {
    id: object.id,
    title: object.title,
    object_type: object.object_type,
    status: object.status,
    category: object.category,
    fileName: entry.fileName,
    created_at: object.created_at,
    updated_at: object.updated_at,
    review_ref: object.review_ref ?? null,
    has_review: hasReview,
    needs_review: needsReview,
  };

  if (object.object_type === 'physical') {
    row.purchase_price = object.purchase_price;
    row.total_acquisition_cost = object.total_acquisition_cost;
    row.sale_price = object.sale_price;
    row.purchased_at = object.purchased_at;
    row.ended_at = object.ended_at;
  } else if (object.object_type === 'recurring_cost') {
    row.billing_amount = object.billing_amount;
    row.billing_cycle = object.billing_cycle;
    row.annualized_cost = object.annualized_cost;
    row.payment_account = object.payment_account;
    row.started_at = object.started_at;
  } else {
    row.budget_total = object.budget_total;
    row.actual_total = object.actual_total;
    row.experience_subtype = object.experience_subtype;
    row.ended_at = object.ended_at;
    if (object.location) {
      row.location = {
        city: object.location.city,
        country: object.location.country,
        country_code: object.location.country_code,
      };
    }
  }

  return stripUndefined(row);
}

export function reviewJsonRow(entry: ReviewEntryFile): {
  id: string;
  title: string;
  review_type: string;
  target_id?: string;
  fileName: string;
} {
  return stripUndefined({
    id: entry.frontmatter.id,
    title: entry.frontmatter.title,
    review_type: entry.frontmatter.review_type,
    target_id: entry.frontmatter.target_id,
    fileName: entry.fileName,
  });
}

export function stripUndefined<T extends object>(value: T): T {
  const result = { ...value } as T & Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

export function isObjectLogEventType(value: string): value is ObjectLogEventType {
  return ['usage', 'issue', 'maintenance', 'regret', 'lesson', 'comparison', 'exit_note']
    .includes(value);
}

export function objectNeedsReview(
  object: WYQDObject,
  reviews: readonly ReviewEntry[],
): boolean {
  const hasReview = Boolean(object.review_ref)
    || reviews.some((review) => review.target_id === object.id);
  return (
    (object.object_type === 'physical'
      && ['idle', 'transferred', 'discarded'].includes(object.status))
    || (object.object_type === 'recurring_cost' && object.status === 'cancelled')
    || (object.object_type === 'one_time_experience'
      && object.status === 'completed'
      && !hasReview)
  );
}
