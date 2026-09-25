import { describe, expect, it } from 'vitest';
import {
  LIABILITY_DUE_WINDOW_DAYS,
  bucketLiabilityDues,
  collectLiabilityDues,
  summarizeLiabilityDues,
} from './liability-due';
import type { AccountSnapshot, AccountBalance } from './types';

function snapshot(liabilityBalances: AccountBalance[]): AccountSnapshot {
  return {
    schema_version: '0.1',
    id: 'snap-1',
    type: 'snapshot',
    title: 'Snapshot',
    created_at: '2026-01-01',
    snapshot_type: 'net_worth',
    snapshot_at: '2026-01-01',
    asset_balances: [],
    liability_balances: liabilityBalances,
  };
}

describe('collectLiabilityDues', () => {
  it('returns an empty list without a snapshot', () => {
    expect(collectLiabilityDues(null, '2026-01-01')).toEqual([]);
    expect(collectLiabilityDues(undefined, '2026-01-01')).toEqual([]);
  });

  it('collects dated liabilities sorted by due date and computes days', () => {
    const dues = collectLiabilityDues(
      snapshot([
        { account: 'B', account_id: 'b', amount: 200, due_date: '2026-03-01' },
        { account: 'A', account_id: 'a', amount: 100, due_date: '2026-01-15' },
        { account: 'C', account_id: 'c', amount: 300 },
      ]),
      '2026-01-01',
    );

    expect(dues.map((due) => due.account)).toEqual(['A', 'B']);
    expect(dues[0]).toMatchObject({ due_date: '2026-01-15', days_until: 14, amount: 100 });
  });

  it('ignores malformed dates and paid-off balances', () => {
    const dues = collectLiabilityDues(
      snapshot([
        { account: 'Bad', account_id: 'bad', amount: 100, due_date: '2026-13-01' },
        { account: 'Paid', account_id: 'paid', amount: 0, due_date: '2026-02-01' },
        { account: 'Good', account_id: 'good', amount: 50, due_date: '2026-02-01' },
      ]),
      '2026-01-01',
    );

    expect(dues.map((due) => due.account)).toEqual(['Good']);
  });
});

describe('bucketLiabilityDues', () => {
  it('splits overdue, within-window and later around the 180-day boundary', () => {
    const dues = collectLiabilityDues(
      snapshot([
        { account: 'Overdue', account_id: 'o', amount: 10, due_date: '2025-12-31' },
        { account: 'Edge', account_id: 'e', amount: 20, due_date: '2026-06-30' },
        { account: 'Later', account_id: 'l', amount: 30, due_date: '2026-07-01' },
      ]),
      '2026-01-01',
    );
    const buckets = bucketLiabilityDues(dues);

    expect(buckets.overdue.map((due) => due.account)).toEqual(['Overdue']);
    expect(buckets.withinWindow.map((due) => due.account)).toEqual(['Edge']);
    expect(buckets.later.map((due) => due.account)).toEqual(['Later']);
    expect(buckets.withinWindow[0].days_until).toBe(LIABILITY_DUE_WINDOW_DAYS);
  });

  it('treats today as within the window', () => {
    const dues = collectLiabilityDues(
      snapshot([{ account: 'Today', account_id: 't', amount: 10, due_date: '2026-01-01' }]),
      '2026-01-01',
    );
    const buckets = bucketLiabilityDues(dues);

    expect(buckets.withinWindow).toHaveLength(1);
    expect(buckets.withinWindow[0].days_until).toBe(0);
  });
});

describe('summarizeLiabilityDues', () => {
  it('totals overdue and within-window dues', () => {
    const dues = collectLiabilityDues(
      snapshot([
        { account: 'Overdue', account_id: 'o', amount: 10, due_date: '2025-12-31' },
        { account: 'Soon', account_id: 's', amount: 20, due_date: '2026-02-01' },
        { account: 'Later', account_id: 'l', amount: 30, due_date: '2027-01-01' },
      ]),
      '2026-01-01',
    );

    expect(summarizeLiabilityDues(bucketLiabilityDues(dues))).toEqual({
      overdueTotal: 10,
      overdueCount: 1,
      withinWindowTotal: 20,
      withinWindowCount: 1,
      laterCount: 1,
    });
  });
});
