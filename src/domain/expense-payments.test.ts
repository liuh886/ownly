import { describe, expect, it } from 'vitest';
import {
  calculateTripSettlementWithPayments,
  resolveExpensePayments,
  type TripExpenseWithPayments,
} from './expense-payments';

function expense(overrides: Partial<TripExpenseWithPayments> = {}): TripExpenseWithPayments {
  return {
    id: 'exp-1',
    trip_id: 'trip-1',
    title: 'Dinner',
    category: 'food',
    amount: 300,
    currency: 'CNY',
    paid_by: 'Alice',
    split_members: ['Alice', 'Bob'],
    created_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('expense payment contributions', () => {
  it('keeps legacy one-payer expenses working', () => {
    const result = calculateTripSettlementWithPayments([expense()], ['Alice', 'Bob']);
    expect(result.transfers).toEqual([{ from: 'Bob', to: 'Alice', amount: 150 }]);
  });

  it('treats explicit equal contributions as already settled', () => {
    const result = calculateTripSettlementWithPayments([
      expense({ payments: [{ member: 'Alice', amount: 150 }, { member: 'Bob', amount: 150 }] }),
    ], ['Alice', 'Bob']);
    expect(result.transfers).toEqual([]);
    expect(result.memberBalances).toEqual([
      expect.objectContaining({ member: 'Alice', paidTotal: 150, shareTotal: 150, netBalance: 0 }),
      expect.objectContaining({ member: 'Bob', paidTotal: 150, shareTotal: 150, netBalance: 0 }),
    ]);
  });

  it('assigns an omitted remainder to the primary payer', () => {
    const item = expense({ payments: [{ member: 'Bob', amount: 100 }] });
    expect(resolveExpensePayments(item)).toEqual([
      { member: 'Bob', amount: 100 },
      { member: 'Alice', amount: 200 },
    ]);
    const result = calculateTripSettlementWithPayments([item], ['Alice', 'Bob']);
    expect(result.transfers).toEqual([{ from: 'Bob', to: 'Alice', amount: 50 }]);
  });

  it('maps the previous settled flag to equal historical contributions', () => {
    const result = calculateTripSettlementWithPayments([
      expense({ confirmation: 'settled' }),
    ], ['Alice', 'Bob']);
    expect(result.transfers).toEqual([]);
  });
});
