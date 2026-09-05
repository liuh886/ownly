import { describe, it, expect } from 'vitest';
import { validateEntity } from './schema';
import type { PhysicalObject, RecurringCostObject, OneTimeExperienceObject, ReviewEntry } from './types';

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

  it('validates monthly review without target_id', () => {
    const review: ReviewEntry = {
      ...baseEntity,
      type: 'review',
      review_type: 'monthly',
      year: 2023,
      period: '01'
    };
    const result = validateEntity(review);
    expect(result.valid).toBe(true);
  });

  it('validates annual review without target_id', () => {
    const review: ReviewEntry = {
      ...baseEntity,
      type: 'review',
      review_type: 'annual',
      year: 2023
    };
    const result = validateEntity(review);
    expect(result.valid).toBe(true);
  });

  it('rejects object_review without target_id', () => {
    const review: ReviewEntry = {
      ...baseEntity,
      type: 'review',
      review_type: 'object_review'
    };
    const result = validateEntity(review);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'target_id', severity: 'error' })
      ])
    );
  });

  it('rejects exit_record without target_id', () => {
    const review: ReviewEntry = {
      ...baseEntity,
      type: 'review',
      review_type: 'exit_record'
    };
    const result = validateEntity(review);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'target_id', severity: 'error' })
      ])
    );
  });

  it('rejects missing schema_version', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const review: any = {
      ...baseEntity,
      type: 'review',
      review_type: 'monthly',
      schema_version: undefined
    };
    const result = validateEntity(review);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'schema_version', severity: 'error' })
      ])
    );
  });

  it('validates a valid planner trip', () => {
    const trip = {
      ...baseEntity,
      type: 'trip',
      status: 'planning',
      start_date: '2026-10-01',
      end_date: '2026-10-10',
      destinations: ['Bangkok', 'Pattaya'],
    };
    const result = validateEntity(trip);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects planner trip with end_date before start_date', () => {
    const trip = {
      ...baseEntity,
      type: 'trip',
      status: 'planning',
      start_date: '2026-10-10',
      end_date: '2026-10-01',
      destinations: ['Bangkok'],
    };
    const result = validateEntity(trip);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'end_date')).toBe(true);
  });

  it('validates a valid planner trip place', () => {
    const place = {
      ...baseEntity,
      type: 'trip_place',
      trip_id: 'trip-1',
      kind: 'food',
      source_provider: 'google_maps',
      source_url: 'https://maps.google.com/?cid=123',
      state: 'candidate',
      tags: ['food'],
    };
    const result = validateEntity(place);
    expect(result.valid).toBe(true);
  });

  it('rejects planner trip place with missing trip_id', () => {
    const place = {
      ...baseEntity,
      type: 'trip_place',
      kind: 'food',
      source_provider: 'google_maps',
      source_url: 'https://maps.google.com/?cid=123',
    };
    const result = validateEntity(place);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'trip_id')).toBe(true);
  });

  it('validates a valid planner trip visit', () => {
    const visit = {
      id: 'visit-1',
      schema_version: '0.1',
      type: 'trip_visit',
      trip_id: 'trip-1',
      place_id: 'place-1',
      date: '2026-10-02',
      sort_order: 0,
      duration_minutes: 60,
      created_at: '2026-09-01T00:00:00Z',
    };
    const result = validateEntity(visit);
    expect(result.valid).toBe(true);
  });

  it('rejects planner trip visit with negative sort_order or invalid date', () => {
    const visit = {
      id: 'visit-1',
      schema_version: '0.1',
      type: 'trip_visit',
      trip_id: 'trip-1',
      place_id: 'place-1',
      date: 'invalid-date',
      sort_order: -1,
      created_at: '2026-09-01T00:00:00Z',
    };
    const result = validateEntity(visit);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'date')).toBe(true);
    expect(result.issues.some((i) => i.field === 'sort_order')).toBe(true);
  });

  it('validates a valid planner trip leg', () => {
    const leg = {
      id: 'leg-1',
      schema_version: '0.1',
      type: 'trip_leg',
      trip_id: 'trip-1',
      from_place_id: 'place-1',
      to_place_id: 'place-2',
      mode: 'driving',
      duration_minutes: 15,
      source: 'heuristic',
      created_at: '2026-09-01T00:00:00Z',
    };
    const result = validateEntity(leg);
    expect(result.valid).toBe(true);
  });

  it('rejects planner trip leg with missing mode', () => {
    const leg = {
      id: 'leg-1',
      schema_version: '0.1',
      type: 'trip_leg',
      trip_id: 'trip-1',
      from_place_id: 'place-1',
      to_place_id: 'place-2',
      duration_minutes: 15,
      created_at: '2026-09-01T00:00:00Z',
    };
    const result = validateEntity(leg);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'mode')).toBe(true);
  });

  it('rejects planner trip with unknown status', () => {
    const trip = {
      ...baseEntity,
      type: 'trip',
      status: 'archived',
      start_date: '2026-10-01',
      end_date: '2026-10-10',
      destinations: ['Bangkok'],
    };
    const result = validateEntity(trip);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'status')).toBe(true);
  });

  it('rejects unknown schema version with error severity', () => {
    const trip = {
      ...baseEntity,
      schema_version: '9.9',
      type: 'trip',
      status: 'planning',
      start_date: '2026-10-01',
      end_date: '2026-10-10',
      destinations: ['Bangkok'],
    };
    const result = validateEntity(trip);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'schema_version' && i.severity === 'error')).toBe(true);
  });

  it('validates a valid planner trip expense', () => {
    const expense = {
      id: 'exp-1',
      schema_version: '0.1',
      type: 'trip_expense',
      trip_id: 'trip-1',
      title: 'Dinner at Somtum Der',
      amount: 1500,
      currency: 'THB',
      category: 'food',
      paid_by: 'Alice',
      created_at: '2026-09-01T00:00:00Z',
    };
    const result = validateEntity(expense);
    expect(result.valid).toBe(true);
  });

  it('validates a trip expense bound to a place_id', () => {
    const expense = {
      id: 'exp-2',
      schema_version: '0.1',
      type: 'trip_expense',
      trip_id: 'trip-1',
      place_id: 'place-somtum-der',
      title: 'Somtum Der Lunch',
      amount: 850,
      currency: 'THB',
      category: 'food',
      date: '2026-10-05',
      paid_by: 'Bob',
      created_at: '2026-09-01T00:00:00Z',
    };
    const result = validateEntity(expense);
    expect(result.valid).toBe(true);
  });

  it('rejects a trip expense with invalid non-string place_id', () => {
    const expense = {
      id: 'exp-3',
      schema_version: '0.1',
      type: 'trip_expense',
      trip_id: 'trip-1',
      place_id: 12345 as unknown as string,
      title: 'Invalid place expense',
      amount: 100,
      currency: 'THB',
      category: 'food',
      paid_by: 'Bob',
      created_at: '2026-09-01T00:00:00Z',
    };
    const result = validateEntity(expense);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('Invalid place_id'))).toBe(true);
  });
});
