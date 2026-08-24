import { beforeEach, describe, expect, it } from 'vitest';
import type { TripExpenseItem } from '@/domain/planner';
import { serializeMarkdownEntity } from '@/data/frontmatter';
import { PlannerRepository, type PlannerFileStore } from './PlannerRepository';

class InMemoryStore implements PlannerFileStore {
  private readonly directories = new Map<string, Map<string, string>>();

  async getDataFolder(): Promise<string> {
    return '';
  }

  async readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]> {
    const files = this.directories.get(directory);
    if (!files) return [];
    return [...files.entries()].map(([fileName, content]) => ({ fileName, content }));
  }

  async writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void> {
    const files = this.directories.get(directory) ?? new Map<string, string>();
    files.set(fileName, content);
    this.directories.set(directory, files);
  }

  async deleteMarkdownFile(directory: string, fileName: string): Promise<void> {
    if (!this.directories.get(directory)?.delete(fileName)) {
      throw new Error(`Missing Markdown file: ${directory}/${fileName}`);
    }
  }

  seed(directory: string, fileName: string, content: string): void {
    const files = this.directories.get(directory) ?? new Map<string, string>();
    files.set(fileName, content);
    this.directories.set(directory, files);
  }
}

function expense(id: string, overrides: Partial<TripExpenseItem> = {}): TripExpenseItem {
  return {
    id,
    trip_id: 'trip-1',
    title: `Dinner ${id}`,
    category: 'food',
    amount: 1200,
    currency: 'JPY',
    date: '2026-10-07',
    paid_by: 'Alice',
    split_members: ['Alice', 'Bob'],
    created_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

let store: InMemoryStore;
let repo: PlannerRepository;

beforeEach(() => {
  store = new InMemoryStore();
  repo = new PlannerRepository(store);
});

describe('PlannerRepository expenses', () => {
  it('round-trips an expense through frontmatter with fields preserved', async () => {
    await repo.upsertExpense(expense('exp_1', { notes: '含服务费' }));

    const listed = await repo.listExpenses();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 'exp_1',
      trip_id: 'trip-1',
      category: 'food',
      amount: 1200,
      currency: 'JPY',
      paid_by: 'Alice',
      split_members: ['Alice', 'Bob'],
      notes: '含服务费',
    });
    expect((listed[0] as unknown as Record<string, unknown>).type).toBeUndefined();
  });

  it('sanitizes risky ids into safe filenames', async () => {
    await repo.upsertExpense(expense('../evil id/1'));
    const files = await store.readMarkdownFiles('Trip Expenses');
    expect(files[0].fileName).toBe('expense--evil-id-1.md');
    expect(files[0].fileName).not.toContain('..');
  });

  it('ignores foreign entity files and deletes by id', async () => {
    await repo.upsertExpense(expense('exp_keep'));
    store.seed(
      'Trip Expenses',
      'trip--fake.md',
      serializeMarkdownEntity({ schema_version: '0.1', type: 'trip', id: 'fake' } as never, ''),
    );
    store.seed('Trip Expenses', 'broken.md', 'not-frontmatter');

    let listed = await repo.listExpenses();
    expect(listed.map((e) => e.id)).toEqual(['exp_keep']);

    await repo.deleteExpense('exp_keep');
    listed = await repo.listExpenses();
    expect(listed).toHaveLength(0);
  });
});
