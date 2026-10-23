import { describe, expect, it } from 'vitest';
import { recordCurrency, matchesCurrency } from './currency';
import { calculateHomeMetrics, calculateNetWorth } from './calculations';
import { createObjectDraft, updateObjectDraft } from '@/components/objects/composerDraftFactory';
import { formatMoney } from '@/lib/format';
import { getDetailRows } from '@/components/objects/ObjectListUtils';
import type { AccountSnapshot, WYQDObject } from './types';

describe('money retains its source unit', () => {
  it('creates subscriptions in the chosen currency and preserves it across a type conversion', () => {
    const source = createObjectDraft({ title: 'Membership', objectType: 'recurring_cost', amount: 9.99, currency: 'USD' });
    expect(source).toMatchObject({ currency: 'USD', billing_currency: 'USD', billing_amount: 9.99 });
    expect(updateObjectDraft(source, { title: source.title, objectType: 'physical', amount: 9.99 })).toMatchObject({ id: source.id, currency: 'USD', total_acquisition_cost: 9.99 });
  });
  it('never adds CNY and USD into one ownership total', () => {
    const cny = createObjectDraft({ title: 'CNY', objectType: 'physical', status: 'observing', amount: 1000, currency: 'CNY' });
    const usd = createObjectDraft({ title: 'USD', objectType: 'physical', status: 'observing', amount: 30, currency: 'USD' });
    expect(calculateHomeMetrics([cny, usd], [], 'CNY')).toMatchObject({ observingDesireAmount: 1000 });
    expect(calculateHomeMetrics([cny, usd], [], 'USD')).toMatchObject({ observingDesireAmount: 30 });
  });
  it('calculates a snapshot only in its declared base unit while retaining foreign balances', () => {
    const source: AccountSnapshot = { schema_version: '0.1', id: 'snap', type: 'snapshot', snapshot_type: 'net_worth', title: 'Snapshot', created_at: '2026-10-04', snapshot_at: '2026-10-04', currency: 'CNY', asset_balances: [{ account_id: 'cny', account: 'Cash CNY', amount: 1000 }, { account_id: 'usd', account: 'Cash USD', amount: 30, currency: 'USD' }], liability_balances: [] };
    expect(calculateNetWorth(source)).toMatchObject({ net_worth: 1000, asset_balances: source.asset_balances });
  });
  it('does not label unsupported source currencies as USD or round away cents on a record', () => {
    expect(formatMoney(99.99, undefined, 'en', 'USD', 2)).toBe('$99.99');
    expect(formatMoney(1000, undefined, 'en', 'THB', 2)).toBe('THB 1,000');
    const object = { ...createObjectDraft({ title: 'Trip', objectType: 'one_time_experience', amount: 1000, currency: 'THB' }), actual_total: 0 } as WYQDObject;
    expect(getDetailRows(object, (key) => key).find((row) => row.label === 'budget')?.value).toBe('THB 1,000');
  });
  it('uses the billing unit for a recurring amount and CNY for legacy missing units', () => {
    expect(recordCurrency({ object_type: 'recurring_cost', currency: 'CNY', billing_currency: 'USD' })).toBe('USD');
    expect(recordCurrency({})).toBe('CNY');
    expect(matchesCurrency({ currency: 'USD' }, 'CNY')).toBe(false);
  });
});
