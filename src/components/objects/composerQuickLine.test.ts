import { describe, it, expect } from 'vitest';
import { applyQuickLine, parseQuickLine, parseObjectType, QL_FIELD } from './composerQuickLine';
import type { BillingCycle, OneTimeExperienceStatus, PhysicalStatus, RecurringCostStatus, WYQDObjectType } from '@/domain/types';

function makeSetters() {
  const calls: Record<string, unknown> = {};
  return {
    calls,
    setters: {
      setTitle: (next: string) => { calls.title = next; },
      setAmount: (next: string) => { calls.amount = next; },
      setPurchasedAt: (next: string) => { calls.purchasedAt = next; },
      setEndedAt: (next: string) => { calls.endedAt = next; },
      setCategory: (next: string) => { calls.category = next; },
      setPhysicalStatus: (next: PhysicalStatus) => { calls.physicalStatus = next; },
      setRecurringStatus: (next: RecurringCostStatus) => { calls.recurringStatus = next; },
      setBillingCycle: (next: BillingCycle) => { calls.billingCycle = next; },
      setBillingDay: (next: string) => { calls.billingDay = next; },
      setPaymentAccount: (next: string) => { calls.paymentAccount = next; },
      setRecurringStartedAt: (next: string) => { calls.recurringStartedAt = next; },
      setExperienceStatus: (next: OneTimeExperienceStatus) => { calls.experienceStatus = next; },
      setActualAmount: (next: string) => { calls.actualAmount = next; },
      setObjectType: (next: WYQDObjectType) => { calls.objectType = next; },
      setExperienceSubtype: (next: string) => { calls.experienceSubtype = next; },
      setLocationCountry: (next: string) => { calls.locationCountry = next; },
      setLocationCountryCode: (next: string) => { calls.locationCountryCode = next; },
      setLocationCity: (next: string) => { calls.locationCity = next; },
      setLocationLatitude: (next: string) => { calls.locationLatitude = next; },
      setLocationLongitude: (next: string) => { calls.locationLongitude = next; },
    },
  };
}

describe('parseQuickLine', () => {
  // ── Physical format ────────────────────────────────
  it('parses full 7-field physical format', () => {
    const result = parseQuickLine('Sony A7C / physical / 12000 / 2026-05-01 / 2026-05-17 / Camera / using');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('physical');
    expect(result.fields[QL_FIELD.TITLE]).toBe('Sony A7C');
    expect(result.fields[QL_FIELD.AMOUNT]).toBe('12000');
    expect(result.fields[QL_FIELD.PURCHASED_AT]).toBe('2026-05-01');
    expect(result.fields[QL_FIELD.ENDED_AT]).toBe('2026-05-17');
    expect(result.fields[QL_FIELD.CATEGORY]).toBe('Camera');
    expect(result.fields[QL_FIELD.PHYSICAL_STATUS]).toBe('using');
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('parses minimal physical format', () => {
    const result = parseQuickLine('MacBook / physical / 15000');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('physical');
    expect(result.fields[QL_FIELD.TITLE]).toBe('MacBook');
    expect(result.fields[QL_FIELD.AMOUNT]).toBe('15000');
    expect(result.errors).toHaveLength(0);
  });

  // ── Recurring format ───────────────────────────────
  it('parses full 9-field recurring format', () => {
    const result = parseQuickLine('ChatGPT Plus / recurring_cost / 20 / monthly / 1 / Credit Card / 2026-01-01 / active / AI Tools');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('recurring_cost');
    expect(result.fields[QL_FIELD.TITLE]).toBe('ChatGPT Plus');
    expect(result.fields[QL_FIELD.AMOUNT]).toBe('20');
    expect(result.fields[QL_FIELD.CYCLE]).toBe('monthly');
    expect(result.fields[QL_FIELD.DAY]).toBe('1');
    expect(result.fields[QL_FIELD.ACCOUNT]).toBe('Credit Card');
    expect(result.fields[QL_FIELD.STARTED_AT]).toBe('2026-01-01');
    expect(result.fields[QL_FIELD.RECURRING_STATUS]).toBe('active');
    expect(result.fields[QL_FIELD.CATEGORY]).toBe('AI Tools');
    expect(result.warnings).toHaveLength(0);
  });

  it('parses "fixed" alias as recurring_cost', () => {
    const result = parseQuickLine('Spotify / fixed / 9.99 / monthly / 15 / Visa / 2025-01-01 / active / Music');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('recurring_cost');
    expect(result.fields[QL_FIELD.TITLE]).toBe('Spotify');
    expect(result.fields[QL_FIELD.AMOUNT]).toBe('9.99');
  });

  // ── Travel format ──────────────────────────────────
  it('parses full 11-field travel format with city', () => {
    const result = parseQuickLine('Tokyo trip / travel / 18000 / 16500 / 2026-05-04 / Travel / completed / JP / Tokyo / 35.6762 / 139.6503');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('one_time_experience');
    expect(result.fields[QL_FIELD.TITLE]).toBe('Tokyo trip');
    expect(result.fields[QL_FIELD.BUDGET]).toBe('18000');
    expect(result.fields[QL_FIELD.ACTUAL]).toBe('16500');
    expect(result.fields[QL_FIELD.ENDED_AT]).toBe('2026-05-04');
    expect(result.fields[QL_FIELD.EXPERIENCE_STATUS]).toBe('completed');
    expect(result.fields[QL_FIELD.SUBTYPE]).toBe('travel_worldview');
    expect(result.fields[QL_FIELD.COUNTRY_CODE]).toBe('JP');
    expect(result.fields[QL_FIELD.CITY]).toBe('Tokyo');
    expect(result.fields[QL_FIELD.LAT]).toBe('35.6762');
    expect(result.fields[QL_FIELD.LNG]).toBe('139.6503');
    expect(result.warnings).toHaveLength(0);
  });

  it('parses legacy 10-field travel format (no city)', () => {
    const result = parseQuickLine('Tokyo / travel / 18000 / 16500 / 2026-05-04 / Travel / completed / JP / 35.6762 / 139.6503');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('one_time_experience');
    expect(result.fields[QL_FIELD.TITLE]).toBe('Tokyo');
    // Legacy: city defaults to title
    expect(result.fields[QL_FIELD.CITY]).toBe('Tokyo');
    expect(result.fields[QL_FIELD.COUNTRY_CODE]).toBe('JP');
    expect(result.fields[QL_FIELD.LAT]).toBe('35.6762');
    expect(result.fields[QL_FIELD.LNG]).toBe('139.6503');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.toLowerCase().includes('legacy') || w.includes('city'))).toBe(true);
  });

  it('parses travel with experience keyword as subtype', () => {
    const result = parseQuickLine('Qingdao / experience / 5000 / 4500 / 2026-06-21 / completed / CN');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('one_time_experience');
    expect(result.fields[QL_FIELD.SUBTYPE]).toBe('travel_worldview');
  });

  // ── Backward compat ────────────────────────────────
  it('parses Chinese physical keyword 实物', () => {
    const result = parseQuickLine('小米13U / 实物 / 5843 / 2023-06-07 / 2025-09-20 / 电子产品 / 已退役');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('physical');
    expect(result.fields[QL_FIELD.TITLE]).toBe('小米13U');
  });

  it('parses Chinese travel keyword 旅行', () => {
    const result = parseQuickLine('东京 / 旅行 / 18000 / 16500 / 2026-05-04 / 旅行体验 / 已完成 / JP / 35.6762 / 139.6503');
    expect(result.ok).toBe(true);
    expect(result.objectType).toBe('one_time_experience');
    expect(result.fields[QL_FIELD.SUBTYPE]).toBe('travel_worldview');
  });

  // ── Separators ─────────────────────────────────────
  it('supports Chinese comma separator', () => {
    const result = parseQuickLine('MacBook，physical，15000');
    expect(result.ok).toBe(true);
    expect(result.fields[QL_FIELD.TITLE]).toBe('MacBook');
    expect(result.fields[QL_FIELD.AMOUNT]).toBe('15000');
  });

  it('supports full-width slash separator', () => {
    const result = parseQuickLine('MacBook ／ physical ／ 15000');
    expect(result.ok).toBe(true);
    expect(result.fields[QL_FIELD.TITLE]).toBe('MacBook');
  });

  it('supports pipe separator', () => {
    const result = parseQuickLine('MacBook | physical | 15000');
    expect(result.ok).toBe(true);
    expect(result.fields[QL_FIELD.TITLE]).toBe('MacBook');
  });

  // ── Errors ─────────────────────────────────────────
  it('rejects unknown object type', () => {
    const result = parseQuickLine('Something / unknown_type / 100');
    expect(result.ok).toBe(false);
    expect(result.objectType).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects too few fields', () => {
    const result = parseQuickLine('OnlyTwo / physical');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns ok=false for empty string', () => {
    const result = parseQuickLine('');
    expect(result.ok).toBe(false);
    expect(result.objectType).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns ok=false for whitespace-only', () => {
    const result = parseQuickLine('   ');
    expect(result.ok).toBe(false);
    expect(result.objectType).toBeNull();
  });

  // ── Warnings (non-fatal) ───────────────────────────
  it('warns on non-numeric amount', () => {
    const result = parseQuickLine('Item / physical / abc / 2026-01-01');
    expect(result.ok).toBe(true); // still ok, just warns
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.fields[QL_FIELD.AMOUNT]).toBe('abc');
  });

  it('warns on non-date date field', () => {
    const result = parseQuickLine('Item / physical / 100 / not-a-date');
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.toLowerCase().includes('date'))).toBe(true);
  });
});

describe('applyQuickLine', () => {
  it('parses "MacBook / physical / 15000" correctly', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('MacBook / physical / 15000', setters);

    expect(calls.title).toBe('MacBook');
    expect(calls.objectType).toBe('physical');
    expect(calls.amount).toBe('15000');
  });

  it('parses full physical with all fields', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('Sony A7C / physical / 12000 / 2026-05-01 / 2026-05-17 / Camera / using', setters);

    expect(calls.title).toBe('Sony A7C');
    expect(calls.objectType).toBe('physical');
    expect(calls.amount).toBe('12000');
    expect(calls.purchasedAt).toBe('2026-05-01');
    expect(calls.endedAt).toBe('2026-05-17');
    expect(calls.category).toBe('Camera');
    expect(calls.physicalStatus).toBe('using');
  });

  it('parses with Chinese comma delimiter', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('MacBook，physical，15000', setters);

    expect(calls.title).toBe('MacBook');
    expect(calls.objectType).toBe('physical');
    expect(calls.amount).toBe('15000');
  });

  it('parses with full-width slash delimiter', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('MacBook ／ physical ／ 15000', setters);

    expect(calls.title).toBe('MacBook');
    expect(calls.objectType).toBe('physical');
    expect(calls.amount).toBe('15000');
  });

  it('parses with pipe delimiter', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('MacBook | physical | 15000', setters);

    expect(calls.title).toBe('MacBook');
    expect(calls.objectType).toBe('physical');
    expect(calls.amount).toBe('15000');
  });

  it('parses travel experience with city', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('Tokyo trip / travel / 18000 / 16500 / 2026-05-04 / Travel / completed / JP / Tokyo / 35.6762 / 139.6503', setters);

    expect(calls.title).toBe('Tokyo trip');
    expect(calls.objectType).toBe('one_time_experience');
    expect(calls.amount).toBe('18000');
    expect(calls.actualAmount).toBe('16500');
    expect(calls.endedAt).toBe('2026-05-04');
    expect(calls.experienceStatus).toBe('completed');
    expect(calls.experienceSubtype).toBe('travel_worldview');
    expect(calls.locationCountryCode).toBe('JP');
    expect(calls.locationCity).toBe('Tokyo');
    expect(calls.locationLatitude).toBe('35.6762');
    expect(calls.locationLongitude).toBe('139.6503');
  });

  it('parses legacy travel line (10-field, no city) with city fallback', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('Tokyo / travel / 18000 / 16500 / 2026-05-04 / Travel / completed / JP / 35.6762 / 139.6503', setters);

    expect(calls.title).toBe('Tokyo');
    expect(calls.objectType).toBe('one_time_experience');
    expect(calls.experienceSubtype).toBe('travel_worldview');
    expect(calls.locationCountryCode).toBe('JP');
    expect(calls.locationCity).toBe('Tokyo'); // fallback
  });

  it('parses travel experience with "experience" keyword as subtype', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('Qingdao / experience / 5000 / 4500 / 2026-06-21 / completed / CN', setters);

    expect(calls.title).toBe('Qingdao');
    expect(calls.objectType).toBe('one_time_experience');
    expect(calls.experienceSubtype).toBe('travel_worldview');
  });

  it('parses travel experience with "体验" keyword as subtype', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('青岛 / 体验 / 5000 / 4500 / 2026-06-21 / completed / CN', setters);

    expect(calls.title).toBe('青岛');
    expect(calls.objectType).toBe('one_time_experience');
    expect(calls.experienceSubtype).toBe('travel_worldview');
  });

  it('parses recurring cost line', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('ChatGPT Plus / fixed / 145 / monthly / 20 / 招行信用卡 / 2026-01-01 / 订阅中 / AI工具', setters);

    expect(calls.title).toBe('ChatGPT Plus');
    expect(calls.objectType).toBe('recurring_cost');
    expect(calls.amount).toBe('145');
    expect(calls.billingCycle).toBe('monthly');
    expect(calls.billingDay).toBe('20');
    expect(calls.paymentAccount).toBe('招行信用卡');
    expect(calls.recurringStatus).toBe('active');
  });

  it('handles empty string gracefully', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('', setters);
    expect(Object.keys(calls).length).toBe(0);
  });

  it('handles whitespace-only string gracefully', () => {
    const { setters, calls } = makeSetters();
    applyQuickLine('   ', setters);
    expect(Object.keys(calls).length).toBe(0);
  });
});

describe('parseObjectType', () => {
  it('maps "physical" to physical', () => {
    expect(parseObjectType('physical')).toBe('physical');
  });

  it('maps "实物" to physical', () => {
    expect(parseObjectType('实物')).toBe('physical');
  });

  it('maps "fixed" to recurring_cost', () => {
    expect(parseObjectType('fixed')).toBe('recurring_cost');
  });

  it('maps "travel" to one_time_experience', () => {
    expect(parseObjectType('travel')).toBe('one_time_experience');
  });

  it('maps "旅行" to one_time_experience', () => {
    expect(parseObjectType('旅行')).toBe('one_time_experience');
  });

  it('maps "experience" to one_time_experience', () => {
    expect(parseObjectType('experience')).toBe('one_time_experience');
  });

  it('returns null for unknown type', () => {
    expect(parseObjectType('unknown')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseObjectType('')).toBeNull();
  });
});
