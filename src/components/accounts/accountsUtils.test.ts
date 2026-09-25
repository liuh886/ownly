import { describe, expect, it } from 'vitest';
import {
  hasInvalidBalanceLines,
  hasInvalidDueDateLines,
  normalizeDueDate,
  parseBalanceLine,
  parseBalanceLines,
  serializeBalanceLines,
} from './accountsUtils';

describe('parseBalanceLine liability due dates', () => {
  it('parses a trailing ISO due date', () => {
    const balance = parseBalanceLine('信用卡 4200 2027-10-01', 'liability', 0);
    expect(balance).toMatchObject({ account: '信用卡', amount: 4200, due_date: '2027-10-01' });
  });

  it('normalizes slash, dot and localized date forms', () => {
    expect(parseBalanceLine('信用卡 4200 2027/10/1', 'liability', 0)?.due_date).toBe('2027-10-01');
    expect(parseBalanceLine('信用卡 4200 2027.10.01', 'liability', 0)?.due_date).toBe('2027-10-01');
    expect(parseBalanceLine('信用卡 4200 2027年10月1日', 'liability', 0)?.due_date).toBe('2027-10-01');
  });

  it('keeps lines without a due date valid', () => {
    const balance = parseBalanceLine('花呗 800', 'liability', 0);
    expect(balance).toMatchObject({ account: '花呗', amount: 800 });
    expect(balance?.due_date).toBeUndefined();
  });

  it('treats an impossible calendar date as an invalid line', () => {
    expect(parseBalanceLine('信用卡 4200 2027-13-01', 'liability', 0)).toBeNull();
    expect(parseBalanceLine('信用卡 4200 2027-02-29', 'liability', 0)).toBeNull();
    expect(hasInvalidDueDateLines('信用卡 4200 2027-13-01')).toBe(true);
    expect(hasInvalidBalanceLines('信用卡 4200 2027-13-01', 'liability')).toBe(true);
  });

  it('accepts a leap-day due date', () => {
    expect(parseBalanceLine('信用卡 4200 2028-02-29', 'liability', 0)?.due_date).toBe('2028-02-29');
  });

  it('keeps date-like account names when they are not trailing', () => {
    expect(parseBalanceLine('基金-2026/01 500', 'liability', 0)).toMatchObject({
      account: '基金-2026/01',
      amount: 500,
    });
  });

  it('does not accept due dates on asset lines', () => {
    expect(parseBalanceLine('招商银行 32000 2027-10-01', 'asset', 0)).toBeNull();
  });
});

describe('serializeBalanceLines', () => {
  it('round-trips liability balances with due dates', () => {
    const text = '信用卡 4200 2027-10-01\n花呗 800';
    expect(serializeBalanceLines(parseBalanceLines(text, 'liability'))).toBe(text);
  });

  it('omits the due date when absent', () => {
    expect(serializeBalanceLines([{ account: '花呗', account_id: 'liability_1', amount: 800 }])).toBe('花呗 800');
  });
});

describe('normalizeDueDate', () => {
  it('pads month and day and rejects impossible dates', () => {
    expect(normalizeDueDate('2027', '1', '2')).toBe('2027-01-02');
    expect(normalizeDueDate('2027', '2', '30')).toBeNull();
  });
});
