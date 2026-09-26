import { calendarDaysBetween, isValidISODate } from './date';
import type { AccountSnapshot } from './types';

export const LIABILITY_DUE_WINDOW_DAYS = 180;
export const LIABILITY_DUE_WINDOW_MONTHS = 6;

export interface LiabilityDue {
  account: string;
  account_id: string;
  amount: number;
  due_date: string;
  days_until: number;
}

export interface LiabilityDueBuckets {
  overdue: LiabilityDue[];
  withinWindow: LiabilityDue[];
  later: LiabilityDue[];
}

export interface LiabilityDueSummary {
  overdueTotal: number;
  overdueCount: number;
  withinWindowTotal: number;
  withinWindowCount: number;
  laterCount: number;
}

export function collectLiabilityDues(
  snapshot: AccountSnapshot | null | undefined,
  today: string,
): LiabilityDue[] {
  const balances = snapshot?.liability_balances ?? [];
  const dues: LiabilityDue[] = [];

  for (const balance of balances) {
    if (!isValidISODate(balance.due_date)) continue;
    if (!Number.isFinite(balance.amount) || balance.amount <= 0) continue;

    const daysUntil = calendarDaysBetween(today, balance.due_date);
    if (daysUntil === null) continue;

    dues.push({
      account: balance.account,
      account_id: balance.account_id,
      amount: balance.amount,
      due_date: balance.due_date,
      days_until: daysUntil,
    });
  }

  return dues.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function bucketLiabilityDues(
  dues: LiabilityDue[],
  windowDays: number = LIABILITY_DUE_WINDOW_DAYS,
): LiabilityDueBuckets {
  const buckets: LiabilityDueBuckets = { overdue: [], withinWindow: [], later: [] };

  for (const due of dues) {
    if (due.days_until < 0) buckets.overdue.push(due);
    else if (due.days_until <= windowDays) buckets.withinWindow.push(due);
    else buckets.later.push(due);
  }

  return buckets;
}

function sumDues(dues: LiabilityDue[]): number {
  return dues.reduce((total, due) => total + due.amount, 0);
}

export function summarizeLiabilityDues(buckets: LiabilityDueBuckets): LiabilityDueSummary {
  return {
    overdueTotal: sumDues(buckets.overdue),
    overdueCount: buckets.overdue.length,
    withinWindowTotal: sumDues(buckets.withinWindow),
    withinWindowCount: buckets.withinWindow.length,
    laterCount: buckets.later.length,
  };
}
