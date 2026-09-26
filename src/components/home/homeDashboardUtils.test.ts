import { describe, expect, it } from 'vitest';
import type { PhysicalObject } from '@/domain/types';
import { buildDailyCostTrend, calculateDailyCostAt } from './homeDashboardUtils';

function physical(overrides: Partial<PhysicalObject> = {}): PhysicalObject {
  return {
    schema_version: '0.1',
    id: 'obj-1',
    type: 'object',
    object_type: 'physical',
    title: 'Camera',
    status: 'using',
    created_at: '2026-01-01',
    purchased_at: '2026-01-01',
    purchase_price: 1100,
    ...overrides,
  };
}

describe('calculateDailyCostAt', () => {
  it('spreads the acquisition cost across holding days as of the date', () => {
    expect(calculateDailyCostAt([physical()], '2026-01-11')).toBeCloseTo(1100 / 11);
  });

  it('aggregates every item held on the date', () => {
    const second = physical({ id: 'obj-2', purchase_price: 550 });
    expect(calculateDailyCostAt([physical(), second], '2026-01-11')).toBeCloseTo(1100 / 11 + 550 / 11);
  });

  it('includes items held in that period even if they are no longer held today', () => {
    const sold = physical({ id: 'sold', status: 'transferred', ended_at: '2026-03-01' });
    expect(calculateDailyCostAt([sold], '2026-01-11')).toBeCloseTo(1100 / 11);
  });

  it('excludes items purchased later or already ended by that date', () => {
    const later = physical({ id: 'later', created_at: '2026-02-01', purchased_at: '2026-02-01' });
    const ended = physical({ id: 'ended', status: 'discarded', ended_at: '2026-01-05' });

    expect(calculateDailyCostAt([later], '2026-01-11')).toBe(0);
    expect(calculateDailyCostAt([ended], '2026-01-11')).toBe(0);
  });

  it('ignores items without a purchase date, matching the headline figure', () => {
    const legacy = physical({ id: 'legacy', purchased_at: undefined });
    expect(calculateDailyCostAt([legacy], '2026-01-11')).toBe(0);
  });
});

describe('buildDailyCostTrend', () => {
  it('returns one point per snapshot date', () => {
    const values = buildDailyCostTrend([physical()], ['2026-01-06', '2026-01-11']);

    expect(values).toHaveLength(2);
    expect(values[0]).toBeCloseTo(1100 / 6);
    expect(values[1]).toBeCloseTo(1100 / 11);
  });

  it('returns an empty trend without dates', () => {
    expect(buildDailyCostTrend([physical()], [])).toEqual([]);
  });
});
