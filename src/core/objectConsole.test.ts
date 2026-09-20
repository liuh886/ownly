import { describe, expect, it } from 'vitest';
import { createObjectConsoleModel, getObjectDecisionBucket } from './objectConsole';
import type { WYQDObject } from '@/domain/types';

function object(overrides: Partial<WYQDObject> = {}): WYQDObject {
  return {
    schema_version: '0.1',
    id: 'obj-1',
    type: 'object',
    object_type: 'physical',
    title: 'Camera',
    status: 'using',
    created_at: '2026-01-01',
    ...overrides,
  } as WYQDObject;
}

describe('getObjectDecisionBucket', () => {
  it('buckets physical objects by lifecycle status', () => {
    expect(getObjectDecisionBucket(object({ status: 'observing' }))).toBe('pending');
    expect(getObjectDecisionBucket(object({ status: 'using' }))).toBe('active');
    expect(getObjectDecisionBucket(object({ status: 'discarded' }))).toBe('closed');
  });

  it('buckets recurring costs by lifecycle status', () => {
    expect(getObjectDecisionBucket(object({ object_type: 'recurring_cost', status: 'paused' }))).toBe('pending');
    expect(getObjectDecisionBucket(object({ object_type: 'recurring_cost', status: 'active' }))).toBe('active');
    expect(getObjectDecisionBucket(object({ object_type: 'recurring_cost', status: 'cancelled' }))).toBe('closed');
  });

  it('buckets one-time experiences by completion status', () => {
    expect(getObjectDecisionBucket(object({ object_type: 'one_time_experience', status: 'planned' }))).toBe('pending');
    expect(getObjectDecisionBucket(object({ object_type: 'one_time_experience', status: 'completed' }))).toBe('review');
    expect(getObjectDecisionBucket(object({ object_type: 'one_time_experience', status: 'reviewed' }))).toBe('closed');
  });
});

describe('createObjectConsoleModel', () => {
  it('summarizes buckets and object types', () => {
    const model = createObjectConsoleModel([
      object({ id: 'p1', status: 'using' }),
      object({ id: 'p2', status: 'observing' }),
      object({ id: 'r1', object_type: 'recurring_cost', status: 'active' }),
      object({ id: 'e1', object_type: 'one_time_experience', status: 'completed' }),
    ]);
    expect(model.summary).toMatchObject({
      total: 4,
      pending: 1,
      active: 2,
      review: 1,
      closed: 0,
      physical: 2,
      recurringCost: 1,
      oneTimeExperience: 1,
    });
  });

  it('prioritizes review, then pending, then active, then closed', () => {
    const model = createObjectConsoleModel([
      object({ id: 'closed', status: 'discarded' }),
      object({ id: 'active', status: 'using' }),
      object({ id: 'pending', status: 'observing' }),
      object({ id: 'review', object_type: 'one_time_experience', status: 'completed' }),
    ]);
    expect(model.priorityItems.map((item) => item.id)).toEqual(['review', 'pending', 'active', 'closed']);
  });

  it('caps priority items at six and breaks ties by most recently updated', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      object({ id: `o${index}`, status: 'using', updated_at: `2026-01-0${index + 1}` }),
    );
    const model = createObjectConsoleModel(many);
    expect(model.priorityItems).toHaveLength(6);
    expect(model.priorityItems[0].id).toBe('o7');
  });
});
