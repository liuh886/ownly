import { describe, expect, it } from 'vitest';
import { getTerminologyOverride } from './terminology';

const zhSubscriptionKeys = [
  'fixedCost',
  'monthlyFixedCost',
  'monthlyFixedCostAvg',
  'largestMonthlyFixedCost',
  'fixedCostCoverage',
  'fixedCostHistory',
  'filterRecurringCost',
  'typeRecurringCost',
  'recurringCostAndExperience',
  'fixedCostTrend',
  'fixedCostTemplate',
  'fixedCostPressure',
  'subscriptionAndFixedInertia',
  'fixedCostAccountPressure',
  'fixedCostAccountPressureDesc',
  'countFixedCostItems',
  'noActiveFixedCost',
] as const;

describe('Ownly cost terminology', () => {
  it('uses usage cost language for physical objects', () => {
    expect(getTerminologyOverride('zh', 'dailyCost')).toBe('日均使用成本');
    expect(getTerminologyOverride('zh', 'dailyCostAvg')).toBe('日均使用成本');
    expect(getTerminologyOverride('zh', 'highestDailyCost')).toBe('最高日使用成本');
    expect(getTerminologyOverride('en', 'dailyCostAvg')).toBe('Average daily usage cost');
  });

  it('uses subscription cost language for subscriptions', () => {
    expect(getTerminologyOverride('zh', 'monthlyFixedCostAvg')).toBe('月均订阅成本');
    expect(getTerminologyOverride('zh', 'fixedCostTemplate')).toBe('订阅成本模板');
    expect(getTerminologyOverride('en', 'monthlyFixedCostAvg')).toBe('Average monthly subscription cost');
  });

  it('does not expose legacy fixed-cost wording in subscription labels', () => {
    for (const key of zhSubscriptionKeys) {
      const value = getTerminologyOverride('zh', key);
      expect(value, `missing terminology override for ${key}`).toBeDefined();
      expect(value).not.toContain('固定成本');
    }
  });

  it('labels recurring objects as subscriptions rather than fixed costs', () => {
    expect(getTerminologyOverride('zh', 'fixedCost')).toBe('订阅');
    expect(getTerminologyOverride('zh', 'typeRecurringCost')).toBe('订阅');
    expect(getTerminologyOverride('en', 'fixedCost')).toBe('Subscriptions');
  });
});
