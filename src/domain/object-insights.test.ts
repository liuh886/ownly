import { describe, expect, it } from 'vitest';
import {
  annualizeSubscription,
  buildNetWorthTrend,
  getSubscriptionRanking,
  getUnusedObjects,
} from './object-insights';
import type {
  AccountSnapshot,
  ObjectLogEntry,
  RecurringCostObject,
  WYQDObject,
} from './types';

function subscription(overrides: Partial<RecurringCostObject> = {}): RecurringCostObject {
  return {
    schema_version: '0.1',
    id: 'sub-1',
    type: 'object',
    object_type: 'recurring_cost',
    status: 'active',
    title: 'Cloud Drive',
    created_at: '2026-01-01',
    ...overrides,
  };
}

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    schema_version: '0.1',
    id: 'snap-1',
    type: 'snapshot',
    snapshot_type: 'net_worth',
    title: 'Snapshot',
    snapshot_at: '2026-01-31',
    asset_balances: [],
    liability_balances: [],
    created_at: '2026-01-31',
    ...overrides,
  };
}

describe('annualizeSubscription (WS-4)', () => {
  it('annualizes standard billing cycles', () => {
    expect(annualizeSubscription(subscription({ billing_amount: 10, billing_cycle: 'monthly' }))).toBe(120);
    expect(annualizeSubscription(subscription({ billing_amount: 10, billing_cycle: 'weekly' }))).toBe(520);
    expect(annualizeSubscription(subscription({ billing_amount: 10, billing_cycle: 'quarterly' }))).toBe(40);
    expect(annualizeSubscription(subscription({ billing_amount: 10, billing_cycle: 'annual' }))).toBe(10);
  });

  it('prefers an explicit annualized_cost and bails on custom cycles', () => {
    expect(annualizeSubscription(subscription({ billing_amount: 10, billing_cycle: 'monthly', annualized_cost: 100 }))).toBe(100);
    expect(annualizeSubscription(subscription({ billing_amount: 10, billing_cycle: 'custom' }))).toBeNull();
    expect(annualizeSubscription(subscription({}))).toBeNull();
  });
});

describe('getSubscriptionRanking (WS-4)', () => {
  it('ranks active subscriptions per currency without mixing currencies', () => {
    const objects: WYQDObject[] = [
      subscription({ id: 'a', title: 'Cheap', billing_amount: 5, billing_cycle: 'monthly', billing_currency: 'CNY' }),
      subscription({ id: 'b', title: 'Pricey', billing_amount: 20, billing_cycle: 'monthly', billing_currency: 'CNY' }),
      subscription({ id: 'c', title: 'US One', billing_amount: 8, billing_cycle: 'monthly', billing_currency: 'USD' }),
      subscription({ id: 'd', title: 'Cancelled', status: 'cancelled', billing_amount: 99, billing_cycle: 'monthly', billing_currency: 'CNY' }),
    ];
    const groups = getSubscriptionRanking(objects);
    expect(groups.map((group) => group.currency)).toEqual(['CNY', 'USD']);
    const cny = groups[0];
    expect(cny.rows.map((row) => row.id)).toEqual(['b', 'a']);
    expect(cny.total).toBe(300);
    expect(groups[1].total).toBe(96);
  });

  it('returns an empty ranking for object graphs without subscriptions', () => {
    expect(getSubscriptionRanking([])).toEqual([]);
  });
});

describe('buildNetWorthTrend (WS-4)', () => {
  it('orders snapshots oldest-first and tolerates missing values', () => {
    const trend = buildNetWorthTrend([
      snapshot({ id: 's2', snapshot_at: '2026-03-31', net_worth: 120 }),
      snapshot({ id: 's1', snapshot_at: '2026-01-31', net_worth: 100 }),
      snapshot({ id: 's3', snapshot_at: '2026-06-30' }),
    ]);
    expect(trend).toEqual([
      { date: '2026-01-31', netWorth: 100 },
      { date: '2026-03-31', netWorth: 120 },
      { date: '2026-06-30', netWorth: null },
    ]);
  });
});

describe('getUnusedObjects (WS-4)', () => {
  const NOW = new Date('2026-09-08T00:00:00.000Z');

  function physical(overrides: Partial<Extract<WYQDObject, { object_type: 'physical' }>> = {}) {
    return {
      schema_version: '0.1' as const,
      id: 'obj-1',
      type: 'object' as const,
      object_type: 'physical' as const,
      status: 'using' as const,
      title: 'Old Camera',
      purchased_at: '2025-01-01',
      created_at: '2025-01-01',
      ...overrides,
    };
  }

  it('flags objects unused beyond the threshold, most-stale first', () => {
    const objects = [
      physical({ id: 'old', purchased_at: '2024-01-01' }),
      physical({ id: 'new', purchased_at: '2026-08-01' }),
    ];
    const rows = getUnusedObjects(objects, [], NOW, 90);
    expect(rows.map((row) => row.id)).toEqual(['old']);
    expect(rows[0].daysUnused).toBeGreaterThan(500);
  });

  it('prefers the latest usage log over purchase dates', () => {
    const objects = [physical({ id: 'cam', purchased_at: '2020-01-01' })];
    const logs: ObjectLogEntry[] = [
      {
        schema_version: '0.1',
        id: 'log-1',
        type: 'object_log',
        title: 'Log 1',
        target_id: 'cam',
        event_type: 'usage',
        occurred_at: '2026-08-20',
        summary: 'used',
        created_at: '2026-08-20',
      },
    ];
    expect(getUnusedObjects(objects, logs, NOW, 90)).toEqual([]);
    expect(getUnusedObjects(objects, logs, NOW, 10)).toEqual([
      { id: 'cam', title: 'Old Camera', daysUnused: 19, lastEvidence: '2026-08-20' },
    ]);
  });

  it('ignores non-held statuses and non-usage log events', () => {
    const objects = [physical({ id: 'gone', status: 'discarded', purchased_at: '2020-01-01' })];
    const logs: ObjectLogEntry[] = [
      {
        schema_version: '0.1',
        id: 'log-2',
        type: 'object_log',
        title: 'Log 2',
        target_id: 'gone',
        event_type: 'issue',
        occurred_at: '2026-09-01',
        summary: 'broken',
        created_at: '2026-09-01',
      },
    ];
    expect(getUnusedObjects(objects, logs, NOW, 1)).toEqual([]);
  });
});
