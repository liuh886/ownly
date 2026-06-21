import { describe, it, expect } from 'vitest';
import { validateEntity } from './schema';
import type { PhysicalObject, RecurringCostObject, OneTimeExperienceObject, Account, AccountSnapshot, ReviewEntry } from './types';

describe('schema validation', () => {
  const baseEntity = {
    id: 'test_1',
    title: 'Test',
    created_at: '2023-01-01',
    schema_version: '0.1' as const
  };

  it('validates a correct physical object', () => {
    const obj: PhysicalObject = {
      ...baseEntity,
      type: 'object',
      object_type: 'physical',
      status: 'using',
      purchased_at: '2023-01-01',
      total_acquisition_cost: 100,
      residual_value: 0
    };
    const result = validateEntity(obj);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects physical object missing purchased_at when using', () => {
    const obj: PhysicalObject = {
      ...baseEntity,
      type: 'object',
      object_type: 'physical',
      status: 'using',
      total_acquisition_cost: 100,
      residual_value: 0
    };
    const result = validateEntity(obj);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'purchased_at', severity: 'error' })
      ])
    );
  });

  it('warns when sale_price is suspiciously high', () => {
    const obj: PhysicalObject = {
      ...baseEntity,
      type: 'object',
      object_type: 'physical',
      status: 'idle',
      ended_at: '2024-01-01',
      total_acquisition_cost: 100,
      sale_price: 200,
      residual_value: 0
    };
    const result = validateEntity(obj);
    expect(result.valid).toBe(true); // Warnings don't make it invalid
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'sale_price', severity: 'warning' })
      ])
    );
  });

  it('rejects recurring cost missing billing info', () => {
    const obj: RecurringCostObject = {
      ...baseEntity,
      type: 'object',
      object_type: 'recurring_cost',
      status: 'active'
    };
    const result = validateEntity(obj);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('validates a correct recurring cost', () => {
    const obj: RecurringCostObject = {
      ...baseEntity,
      type: 'object',
      object_type: 'recurring_cost',
      status: 'active',
      started_at: '2023-01-01',
      billing_amount: 50,
      billing_cycle: 'monthly',
      billing_day: 15
    };
    const result = validateEntity(obj);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid billing day', () => {
    const obj: RecurringCostObject = {
      ...baseEntity,
      type: 'object',
      object_type: 'recurring_cost',
      status: 'active',
      started_at: '2023-01-01',
      billing_amount: 50,
      billing_cycle: 'monthly',
      billing_day: 32
    };
    const result = validateEntity(obj);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'billing_day', severity: 'error' })
      ])
    );
  });

  it('validates travel experience missing location', () => {
    const obj: OneTimeExperienceObject = {
      ...baseEntity,
      type: 'object',
      object_type: 'one_time_experience',
      status: 'planned',
      experience_subtype: 'travel_worldview'
    };
    const result = validateEntity(obj);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'location', severity: 'error' })
      ])
    );
  });

  it('validates a correct review', () => {
    const review: ReviewEntry = {
      ...baseEntity,
      type: 'review',
      review_type: 'object_review',
      target_id: 'obj_1'
    };
    const result = validateEntity(review);
    expect(result.valid).toBe(true);
  });
});
