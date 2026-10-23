import { describe, expect, it } from 'vitest';
import { compareObjects } from './useObjectFilterSort';
import { createObjectDraft } from './composerDraftFactory';
import { getDetailRows } from './ObjectListUtils';

describe('object price sorting', () => {
  it('distinguishes an actually free experience from an unrecorded amount in details', () => {
    const free = createObjectDraft({ title: 'Free outing', objectType: 'one_time_experience', amount: 500, actualAmount: 0 });
    const unknown = createObjectDraft({ title: 'Unknown spending', objectType: 'one_time_experience', amount: 500 });
    const actualRow = (object: typeof free) => getDetailRows(object, (key) => key).find((row) => row.label === 'actualAmount')?.value;
    expect(actualRow(free)).toBe('¥0');
    expect(actualRow(unknown)).toBe('notRecorded');
  });
  it('sorts physical objects by recorded acquisition cost, including zero', () => {
    const expensive = createObjectDraft({ title: 'Gift', objectType: 'physical', amount: 1000 });
    if (expensive.object_type !== 'physical') throw new Error('Expected physical object');
    const gift = { ...expensive, total_acquisition_cost: 0 };
    const paid = createObjectDraft({ title: 'Paid', objectType: 'physical', amount: 10 });
    expect(compareObjects(gift, paid, 'price_asc')).toBeLessThan(0);
  });

  it('sorts experiences by actual spending when it is recorded', () => {
    const free = createObjectDraft({ title: 'Free outing', objectType: 'one_time_experience', amount: 500, actualAmount: 0 });
    const paid = createObjectDraft({ title: 'Paid outing', objectType: 'one_time_experience', amount: 10 });
    expect(compareObjects(free, paid, 'price_asc')).toBeLessThan(0);
  });
});
