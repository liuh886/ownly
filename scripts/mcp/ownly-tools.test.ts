import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeMarkdownEntity } from '../../src/data/frontmatter';
import type {
  ObjectLogEntry,
  RecurringCostObject,
  ReviewEntry,
  WYQDObject,
} from '../../src/domain/types';
import {
  getOwnlyDoctor,
  getOwnlyObjectHistory,
  getOwnlyRecurringByAccount,
  getOwnlyRecurringDue,
  getOwnlyReviewNeeded,
  getOwnlySummary,
  resolveOwnlyDataLocation,
  searchOwnly,
} from './ownly-tools';

const temporaryRoots: string[] = [];

function createDataLocation(): string {
  const container = mkdtempSync(join(tmpdir(), 'ownly-mcp-'));
  temporaryRoots.push(container);
  const root = join(container, 'Ownly');
  for (const relative of [
    'Objects',
    'Snapshots',
    'Reviews',
    'Logs/Object Experiences',
  ]) {
    mkdirSync(join(root, relative), { recursive: true });
  }
  return root;
}

function writeEntity(root: string, relativePath: string, entity: object, body = ''): void {
  const filePath = join(root, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, serializeMarkdownEntity(entity, body), 'utf8');
}

function recurring(
  id: string,
  title: string,
  overrides: Partial<RecurringCostObject> = {},
): RecurringCostObject {
  return {
    schema_version: '0.1',
    id,
    type: 'object',
    object_type: 'recurring_cost',
    title,
    status: 'active',
    currency: 'USD',
    category: 'Software',
    created_at: '2026-08-01',
    started_at: '2026-08-01',
    billing_cycle: 'monthly',
    billing_amount: 20,
    billing_currency: 'USD',
    billing_day: 20,
    annualized_cost: 240,
    payment_account: 'Visa',
    ...overrides,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Ownly MCP local evidence adapter', () => {
  it('requires an explicit valid local Ownly data location', () => {
    expect(() => resolveOwnlyDataLocation(undefined)).toThrow(/OWNLY_DATA_DIR|--data-dir/);

    const root = mkdtempSync(join(tmpdir(), 'ownly-mcp-invalid-'));
    temporaryRoots.push(root);
    expect(() => resolveOwnlyDataLocation(root)).toThrow(/not an Ownly data root/);

    const valid = createDataLocation();
    expect(resolveOwnlyDataLocation(valid)).toBe(valid);
    expect(resolveOwnlyDataLocation(join(valid, '..'))).toBe(valid);

    const customRoot = mkdtempSync(join(tmpdir(), 'ownly-mcp-custom-'));
    temporaryRoots.push(customRoot);
    mkdirSync(join(customRoot, 'Objects'));
    expect(resolveOwnlyDataLocation(customRoot)).toBe(customRoot);
  });

  it('returns bounded summary, search and upcoming recurring-cost facts', () => {
    const root = createDataLocation();
    writeEntity(root, 'Objects/chatgpt.md', recurring('sub_chatgpt', 'ChatGPT Plus'));
    writeEntity(root, 'Objects/storage.md', recurring('sub_storage', 'Cloud Storage', {
      billing_amount: 12,
      annualized_cost: 144,
      billing_day: 28,
    }), 'Used for family backups.');

    expect(getOwnlySummary(root)).toMatchObject({
      total_objects: 2,
      physical: 0,
      active_recurring_costs: 2,
      one_time_experiences: 0,
      needs_review_count: 0,
      health: { valid: true, entities_checked: 2, error_count: 0 },
    });

    expect(searchOwnly(root, 'family')).toEqual([
      expect.objectContaining({ id: 'sub_storage', title: 'Cloud Storage', object_type: 'recurring_cost' }),
    ]);

    const due = getOwnlyRecurringDue(root, 30, new Date(2026, 7, 13));
    expect(due).toEqual([
      expect.objectContaining({
        id: 'sub_chatgpt',
        next_billing_date: '2026-08-20',
        days_until: 7,
      }),
      expect.objectContaining({
        id: 'sub_storage',
        next_billing_date: '2026-08-28',
        days_until: 15,
      }),
    ]);
    expect(JSON.stringify(due)).not.toContain(root);
  });

  it('preserves evidence history without returning raw filenames or local paths', () => {
    const root = createDataLocation();
    const object: WYQDObject = recurring('sub_adobe', 'Adobe Creative Cloud', {
      status: 'cancelled',
      cancelled_at: '2026-08-05',
      cancel_reason: 'Low recent usage',
    });
    const review: ReviewEntry = {
      schema_version: '0.1',
      id: 'review_adobe',
      type: 'review',
      title: 'Adobe exit review',
      review_type: 'exit_record',
      target_id: 'sub_adobe',
      target_type: 'recurring_cost',
      reviewed_at: '2026-08-05',
      exit_type: 'cancelled',
      regret_score: 4,
      summary: 'Too expensive for current usage.',
      created_at: '2026-08-05',
    };
    const log: ObjectLogEntry = {
      schema_version: '0.1',
      id: 'log_adobe',
      type: 'object_log',
      title: 'Used once this month',
      target_id: 'sub_adobe',
      event_type: 'usage',
      occurred_at: '2026-07-20',
      summary: 'Used once this month',
      lesson: 'Need is occasional.',
      source: 'user',
      created_at: '2026-07-20',
    };
    writeEntity(root, 'Objects/adobe.md', object);
    writeEntity(root, 'Reviews/adobe-review.md', review);
    writeEntity(root, 'Logs/Object Experiences/adobe-log.md', log);

    const history = getOwnlyObjectHistory(root, 'sub_adobe');
    expect(history).toMatchObject({
      object: {
        id: 'sub_adobe',
        status: 'cancelled',
        cancel_reason: 'Low recent usage',
      },
      reviews: [{ id: 'review_adobe', regret_score: 4, summary: 'Too expensive for current usage.' }],
      logs: [{ id: 'log_adobe', event_type: 'usage', source: 'user' }],
    });
    const serialized = JSON.stringify(history);
    expect(serialized).not.toContain('adobe-review.md');
    expect(serialized).not.toContain(root);

    expect(getOwnlyReviewNeeded(root)).toEqual([
      expect.objectContaining({ id: 'sub_adobe', needs_review: true }),
    ]);
  });

  it('never silently combines recurring-cost totals across currencies', () => {
    const root = createDataLocation();
    writeEntity(root, 'Objects/usd.md', recurring('sub_usd', 'US Service'));
    writeEntity(root, 'Objects/cny.md', recurring('sub_cny', 'CN Service', {
      currency: 'CNY',
      billing_currency: 'CNY',
      billing_amount: 100,
      annualized_cost: 1200,
    }));

    expect(getOwnlyRecurringByAccount(root, new Date(2026, 7, 13))).toEqual([
      expect.objectContaining({
        account: 'Visa',
        recurring_count: 2,
        monthly_costs: [
          { currency: 'CNY', monthly_cost: 100, annualized_cost: 1200 },
          { currency: 'USD', monthly_cost: 20, annualized_cost: 240 },
        ],
      }),
    ]);
  });

  it('Doctor is read-only and reports missing directories instead of creating them', () => {
    const root = mkdtempSync(join(tmpdir(), 'ownly-mcp-readonly-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'Objects'), { recursive: true });
    writeEntity(root, 'Objects/chatgpt.md', recurring('sub_chatgpt', 'ChatGPT Plus'));

    const result = getOwnlyDoctor(root);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.message).join('\n')).toContain('Snapshots');
    expect(existsSync(join(root, 'Snapshots'))).toBe(false);
    expect(existsSync(join(root, 'Reviews'))).toBe(false);
    expect(existsSync(join(root, 'Logs/Object Experiences'))).toBe(false);
  });
});
