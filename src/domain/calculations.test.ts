import { describe, expect, it } from 'vitest';
import {
  calculateHomeMetrics,
  calculateNetWorth,
  calculateNextBillingDate,
  calculatePhysicalDailyCost,
  calculatePhysicalExperienceCost,
  calculateRecurringMonthlyCost,
  calculateResidualValue,
  findLatestSnapshot,
  findPreviousMonthEndSnapshot,
  isActiveRecurringCost,
  isOwnedPhysicalObject,
  sumAmounts,
} from './calculations';
import type {
  AccountSnapshot,
  PhysicalObject,
  RecurringCostObject,
  WYQDObject,
} from './types';

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    schema_version: '0.1',
    id: 'snap-1',
    type: 'snapshot',
    title: 'Snapshot',
    created_at: '2026-01-31',
    snapshot_type: 'net_worth',
    snapshot_at: '2026-01-31',
    asset_balances: [],
    liability_balances: [],
    ...overrides,
  };
}

function physical(overrides: Partial<PhysicalObject> = {}): PhysicalObject {
  return {
    schema_version: '0.1',
    id: 'obj-1',
    type: 'object',
    object_type: 'physical',
    title: 'Camera',
    status: 'using',
    created_at: '2026-01-01',
    ...overrides,
  };
}

function recurring(overrides: Partial<RecurringCostObject> = {}): RecurringCostObject {
  return {
    schema_version: '0.1',
    id: 'sub-1',
    type: 'object',
    object_type: 'recurring_cost',
    title: 'Cloud',
    status: 'active',
    created_at: '2026-01-01',
    ...overrides,
  };
}

describe('sumAmounts / calculateNetWorth', () => {
  it('sums present amounts and ignores missing ones', () => {
    expect(sumAmounts([{ amount: 10 }, {}, { amount: 5 }])).toBe(15);
  });

  it('derives net worth from assets minus liabilities', () => {
    const result = calculateNetWorth(
      snapshot({ asset_balances: [{ amount: 1000 }, { amount: 500 }], liability_balances: [{ amount: 200 }] }),
    );
    expect(result.total_assets).toBe(1500);
    expect(result.total_liabilities).toBe(200);
    expect(result.net_worth).toBe(1300);
  });
});

describe('snapshot selection', () => {
  it('finds the latest snapshot by date', () => {
    const latest = findLatestSnapshot([
      snapshot({ id: 'a', snapshot_at: '2026-01-31' }),
      snapshot({ id: 'b', snapshot_at: '2026-03-31' }),
    ]);
    expect(latest?.id).toBe('b');
    expect(findLatestSnapshot([])).toBeNull();
  });

  it('finds the previous month-end snapshot before the latest', () => {
    const snapshots = [
      snapshot({ id: 'jan', snapshot_at: '2026-01-31', is_month_end: true }),
      snapshot({ id: 'feb', snapshot_at: '2026-02-28', is_month_end: true }),
      snapshot({ id: 'mid', snapshot_at: '2026-03-15' }),
      snapshot({ id: 'mar', snapshot_at: '2026-03-31' }),
    ];
    const previous = findPreviousMonthEndSnapshot(snapshots, snapshots[3]);
    expect(previous?.id).toBe('feb');
    expect(findPreviousMonthEndSnapshot(snapshots, null)).toBeNull();
  });
});

describe('physical object costs', () => {
  const today = new Date(2026, 0, 11); // 10 inclusive days after 2026-01-01

  it('computes experience cost, netting sale proceeds for transferred items', () => {
    expect(calculatePhysicalExperienceCost(physical({ purchase_price: 1000 }))).toBe(1000);
    expect(
      calculatePhysicalExperienceCost(physical({ status: 'transferred', purchase_price: 1000, sale_price: 300, transfer_fee: 50 })),
    ).toBe(750);
    expect(calculatePhysicalExperienceCost(physical({ realized_experience_cost: 42, purchase_price: 1000 }))).toBe(42);
  });

  it('computes daily cost over holding days', () => {
    expect(calculatePhysicalDailyCost(physical({ purchase_price: 1000, purchased_at: '2026-01-01' }), today)).toBeCloseTo(1000 / 11, 5);
    expect(calculatePhysicalDailyCost(physical({}), today)).toBeNull();
  });

  it('models residual value as zero for items without an end date', () => {
    expect(calculateResidualValue(physical({ purchase_price: 1000, purchased_at: '2026-01-01' }), today)).toBe(0);
  });

  it('depreciates residual value linearly when an end date exists', () => {
    const value = calculateResidualValue(
      physical({ purchase_price: 1000, purchased_at: '2026-01-01', ended_at: '2026-01-21' }),
      new Date(2026, 0, 11),
    );
    // 21-day life, 11 inclusive elapsed days → 10/21 of price remains.
    expect(value).toBeCloseTo((1000 * 10) / 21, 5);
  });
});

describe('calculateRecurringMonthlyCost', () => {
  it('normalizes every billing cycle to a monthly figure', () => {
    expect(calculateRecurringMonthlyCost(recurring({ billing_amount: 12, billing_cycle: 'monthly' }))).toBe(12);
    expect(calculateRecurringMonthlyCost(recurring({ billing_amount: 12, billing_cycle: 'annual' }))).toBe(1);
    expect(calculateRecurringMonthlyCost(recurring({ billing_amount: 12, billing_cycle: 'quarterly' }))).toBe(4);
    expect(calculateRecurringMonthlyCost(recurring({ billing_amount: 12, billing_cycle: 'weekly' }))).toBeCloseTo(52, 5);
    expect(calculateRecurringMonthlyCost(recurring({ billing_cycle: 'custom', annualized_cost: 120 }))).toBe(10);
  });
});

describe('calculateNextBillingDate', () => {
  const today = new Date(2026, 2, 15); // 2026-03-15

  it('returns null for non-active or custom cycles', () => {
    expect(calculateNextBillingDate(recurring({ status: 'cancelled' }), today)).toBeNull();
    expect(calculateNextBillingDate(recurring({ billing_cycle: 'custom' }), today)).toBeNull();
  });

  it('rolls a monthly cycle forward to the next billing day', () => {
    expect(
      calculateNextBillingDate(
        recurring({ billing_cycle: 'monthly', billing_amount: 10, started_at: '2026-01-10', billing_day: 10 }),
        today,
      ),
    ).toBe('2026-04-10');
  });

  it('clamps the billing day to the month length', () => {
    expect(
      calculateNextBillingDate(
        recurring({ billing_cycle: 'monthly', billing_amount: 10, started_at: '2026-01-31', billing_day: 31 }),
        today,
      ),
    ).toBe('2026-03-31');
  });

  it('advances weekly cycles to the next due date, inclusive of today', () => {
    expect(
      calculateNextBillingDate(
        recurring({ billing_cycle: 'weekly', billing_amount: 10, started_at: '2026-03-01' }),
        today,
      ),
    ).toBe('2026-03-15');
  });
});

describe('object type guards and desire amount', () => {
  it('identifies owned physical and active recurring objects', () => {
    expect(isOwnedPhysicalObject(physical({ status: 'purchased' }))).toBe(true);
    expect(isOwnedPhysicalObject(physical({ status: 'observing' }))).toBe(false);
    expect(isActiveRecurringCost(recurring())).toBe(true);
    expect(isActiveRecurringCost(recurring({ status: 'cancelled' }))).toBe(false);
  });

  it('only counts desire amount while observing or planning', () => {
    expect(calculateHomeMetrics([physical({ status: 'using', purchase_price: 1000 })], []).observingDesireAmount).toBe(0);
    const observing: WYQDObject[] = [physical({ status: 'observing', purchase_price: 1000 })];
    expect(calculateHomeMetrics(observing, []).observingDesireAmount).toBe(1000);
  });
});

describe('calculateHomeMetrics', () => {
  it('aggregates net worth, fixed cost, owned count, and desire', () => {
    const objects: WYQDObject[] = [
      physical({ id: 'p1', status: 'using', purchase_price: 1000 }),
      recurring({ id: 'r1', status: 'active', billing_amount: 12, billing_cycle: 'monthly' }),
      physical({ id: 'p2', status: 'observing', purchase_price: 300 }),
    ];
    const metrics = calculateHomeMetrics(objects, [
      snapshot({ id: 'jan', snapshot_at: '2026-01-31', is_month_end: true, asset_balances: [{ amount: 100 }] }),
      snapshot({ id: 'feb', snapshot_at: '2026-02-28', is_month_end: true, asset_balances: [{ amount: 150 }] }),
    ]);
    expect(metrics.netWorth).toBe(150);
    expect(metrics.netWorthDeltaFromPreviousMonth).toBe(50);
    expect(metrics.monthlyFixedCost).toBe(12);
    expect(metrics.ownedPhysicalCount).toBe(1);
    expect(metrics.activeSubscriptionCount).toBe(1);
    expect(metrics.observingDesireAmount).toBe(300);
  });

  it('reports null net worth when there are no snapshots', () => {
    const metrics = calculateHomeMetrics([], []);
    expect(metrics.netWorth).toBeNull();
    expect(metrics.netWorthDeltaFromPreviousMonth).toBeNull();
  });
});
