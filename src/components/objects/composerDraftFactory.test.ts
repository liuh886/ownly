import { afterEach, describe, expect, it, vi } from 'vitest';
import { createObjectDraft, getInitialAmount, todayISO, updateObjectDraft } from './composerDraftFactory';

afterEach(() => vi.useRealTimers());

describe('object composer values', () => {
  it('preserves identity, creation time, references and source metadata when changing type', () => {
    const existing = { ...createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100 }), id: 'stable', created_at: '2024-01-01', currency: 'USD', tags: ['personal'], notes: 'Keep this', review_ref: 'review-1', vendor_field: 'forward-compatible' };
    const updated = updateObjectDraft(existing, { title: 'Camera rental', objectType: 'recurring_cost', amount: 10 });
    expect(updated).toMatchObject({ id: 'stable', created_at: '2024-01-01', currency: 'USD', tags: ['personal'], notes: 'Keep this', review_ref: 'review-1', vendor_field: 'forward-compatible' });
    expect(updated).not.toHaveProperty('purchase_price');
  });

  it('clears optional sale price and experience end date when the fields are emptied', () => {
    const physical = createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100, salePrice: 50 });
    expect(updateObjectDraft(physical, { title: 'Camera', objectType: 'physical', amount: 100 })).toHaveProperty('sale_price', undefined);
    const experience = createObjectDraft({ title: 'Outing', objectType: 'one_time_experience', amount: 100, endedAt: '2026-09-01' });
    expect(updateObjectDraft(experience, { title: 'Outing', objectType: 'one_time_experience', amount: 100, endedAt: '' })).toHaveProperty('ended_at', undefined);
  });

  it('does not rewrite an unexposed purchase price while editing total cost', () => {
    const physical = createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100 });
    if (physical.object_type !== 'physical') throw new Error('Expected physical');
    const updated = updateObjectDraft({ ...physical, purchase_price: 80, purchase_tax: 20 }, { title: 'Renamed camera', objectType: 'physical', amount: 120 });
    expect(updated).toMatchObject({ purchase_price: 80, purchase_tax: 20, total_acquisition_cost: 120 });
  });

  it('preserves custom yearly cost unless an explicit new yearly cost is supplied', () => {
    const recurring = createObjectDraft({ title: 'Custom', objectType: 'recurring_cost', amount: 20, billingCycle: 'custom', annualizedCost: 300 });
    expect(updateObjectDraft(recurring, { title: 'Renamed', objectType: 'recurring_cost', amount: 20, billingCycle: 'custom' })).toMatchObject({ annualized_cost: 300 });
    expect(updateObjectDraft(recurring, { title: 'Renamed', objectType: 'recurring_cost', amount: 20, billingCycle: 'custom', annualizedCost: 240 })).toMatchObject({ annualized_cost: 240 });
  });
  it('keeps zero acquisition cost when editing a purchased object', () => {
    const object = createObjectDraft({ title: 'Gift', objectType: 'physical', amount: 100 });
    if (object.object_type !== 'physical') throw new Error('Expected physical object');
    expect(getInitialAmount({ ...object, total_acquisition_cost: 0 })).toBe('0');
  });

  it('keeps zero recurring amounts and experience budgets', () => {
    expect(getInitialAmount(createObjectDraft({ title: 'Free subscription', objectType: 'recurring_cost', amount: 0 }))).toBe('0');
    expect(getInitialAmount(createObjectDraft({ title: 'Free outing', objectType: 'one_time_experience', amount: 0, actualAmount: 20 }))).toBe('0');
  });

  it('can explicitly change a resale price to zero', () => {
    const object = createObjectDraft({ title: 'Gift', objectType: 'physical', amount: 100, salePrice: 50 });
    const updated = updateObjectDraft(object, { title: 'Gift', objectType: 'physical', amount: 100, salePrice: 0 });
    expect(updated.object_type === 'physical' && updated.sale_price).toBe(0);
  });

  it('uses the local calendar day for default dates and newly created objects', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 1));
    const object = createObjectDraft({ title: 'Today', objectType: 'physical', amount: 1 });
    expect(todayISO()).toBe('2026-10-03');
    expect(object.created_at).toBe('2026-10-03');
  });
});
