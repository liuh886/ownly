import { describe, expect, it } from 'vitest';
import { getTerminologyOverride } from './terminology';

describe('Ownly cost terminology', () => {
  it('uses usage cost language for physical objects', () => {
    expect(getTerminologyOverride('zh', 'dailyCostAvg')).toBe('日均使用成本');
    expect(getTerminologyOverride('zh', 'highestDailyCost')).toBe('最高日使用成本');
    expect(getTerminologyOverride('en', 'dailyCostAvg')).toBe('Average daily usage cost');
  });

  it('uses subscription cost language for recurring subscriptions', () => {
    expect(getTerminologyOverride('zh', 'monthlyFixedCostAvg')).toBe('月均订阅成本');
    expect(getTerminologyOverride('zh', 'fixedCostTemplate')).toBe('订阅成本模板');
    expect(getTerminologyOverride('en', 'monthlyFixedCostAvg')).toBe('Average monthly subscription cost');
  });

  it('labels recurring objects as subscriptions rather than fixed costs', () => {
    expect(getTerminologyOverride('zh', 'fixedCost')).toBe('订阅');
    expect(getTerminologyOverride('zh', 'typeRecurringCost')).toBe('订阅');
    expect(getTerminologyOverride('en', 'fixedCost')).toBe('Subscriptions');
  });
});
