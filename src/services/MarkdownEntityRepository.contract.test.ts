import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import type {
  AccountSnapshot,
  ObjectLogEntry,
  PhysicalObject,
  RecurringCostObject,
  ReviewEntry,
  OneTimeExperienceObject,
} from '@/domain/types';
import {
  MarkdownEntityRepository,
  type MarkdownFileStore,
} from './MarkdownEntityRepository';

class InMemoryMarkdownStore implements MarkdownFileStore {
  private readonly directories = new Map<string, Map<string, string>>();
  private failWrite = false;

  constructor(private readonly dataFolder = '') {}

  async getDataFolder(): Promise<string> {
    return this.dataFolder;
  }

  async readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]> {
    const files = this.directories.get(directory);
    if (!files) return [];
    return [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([fileName, content]) => ({ fileName, content }));
  }

  async writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void> {
    if (this.failWrite) {
      this.failWrite = false;
      throw new Error(`Simulated write failure: ${directory}/${fileName}`);
    }
    const files = this.directories.get(directory) ?? new Map<string, string>();
    files.set(fileName, content);
    this.directories.set(directory, files);
  }

  async deleteMarkdownFile(directory: string, fileName: string): Promise<void> {
    const files = this.directories.get(directory);
    if (!files?.delete(fileName)) {
      throw new Error(`Missing Markdown file: ${directory}/${fileName}`);
    }
  }

  seed(directory: string, fileName: string, content: string): void {
    const files = this.directories.get(directory) ?? new Map<string, string>();
    files.set(fileName, content);
    this.directories.set(directory, files);
  }

  read(directory: string, fileName: string): string | undefined {
    return this.directories.get(directory)?.get(fileName);
  }

  has(directory: string, fileName: string): boolean {
    return this.directories.get(directory)?.has(fileName) ?? false;
  }

  failNextWrite(): void {
    this.failWrite = true;
  }
}

const FIXED_NOW = new Date('2026-08-01T12:34:56.789Z');
const clock = () => new Date(FIXED_NOW);

function physical(overrides: Partial<PhysicalObject> = {}): PhysicalObject {
  return {
    schema_version: '0.1',
    id: 'object-physical-1',
    type: 'object',
    object_type: 'physical',
    title: 'Travel Camera',
    status: 'observing',
    created_at: '2026-08-01',
    purchase_price: 12000,
    ...overrides,
  };
}

function recurring(overrides: Partial<RecurringCostObject> = {}): RecurringCostObject {
  return {
    schema_version: '0.1',
    id: 'object-recurring-1',
    type: 'object',
    object_type: 'recurring_cost',
    title: 'Cloud Storage',
    status: 'active',
    created_at: '2026-08-01',
    billing_cycle: 'monthly',
    billing_amount: 20,
    ...overrides,
  };
}

function experience(overrides: Partial<OneTimeExperienceObject> = {}): OneTimeExperienceObject {
  return {
    schema_version: '0.1',
    id: 'object-experience-1',
    type: 'object',
    object_type: 'one_time_experience',
    title: 'Weekend Hike',
    status: 'planned',
    created_at: '2026-08-01',
    budget_total: 600,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    schema_version: '0.1',
    id: 'snapshot-1',
    type: 'snapshot',
    title: 'August net worth',
    created_at: '2026-08-01T08:09:10Z',
    snapshot_type: 'net_worth',
    snapshot_at: '2026-08-01',
    asset_balances: [],
    liability_balances: [],
    net_worth: 100000,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    schema_version: '0.1',
    id: 'review-1',
    type: 'review',
    title: 'Travel Camera review',
    created_at: '2026-08-01',
    reviewed_at: '2026-08-01',
    review_type: 'object_review',
    target_id: 'object-physical-1',
    target_type: 'physical',
    summary: 'Useful when travelling.',
    ...overrides,
  };
}

async function setup(dataFolder = '') {
  const store = new InMemoryMarkdownStore(dataFolder);
  const repository = new MarkdownEntityRepository(store, clock);
  await repository.initialize();
  return { store, repository };
}

describe('MarkdownEntityRepository persisted mutation contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates all object types without overwriting same-day filename collisions', async () => {
    const { store, repository } = await setup();

    const physicalFile = await repository.saveObject(physical(), 'Physical body');
    const recurringFile = await repository.saveObject(
      recurring({ title: 'Travel Camera' }),
      'Recurring body',
    );
    const experienceFile = await repository.saveObject(experience(), 'Experience body');

    expect(physicalFile).toBe('2026-08-01--travel-camera.md');
    expect(recurringFile).toBe('2026-08-01--travel-camera--2.md');
    expect(experienceFile).toBe('2026-08-01--weekend-hike.md');

    const listed = await repository.listObjects();
    expect(listed).toHaveLength(3);
    expect(listed.map((entry) => entry.entity.object_type).sort()).toEqual([
      'one_time_experience',
      'physical',
      'recurring_cost',
    ]);

    const persisted = store.read('Objects', physicalFile);
    expect(persisted).toBeDefined();
    const parsed = parseMarkdownEntity<PhysicalObject>(persisted!);
    expect(parsed.frontmatter.id).toBe('object-physical-1');
    expect(parsed.body).toContain('Physical body');
  });

  it('updates an object and reloads the persisted Markdown through a new repository instance', async () => {
    const { store, repository } = await setup();
    const fileName = await repository.saveObject(physical(), 'Initial body');

    await repository.updateObject(
      fileName,
      physical({ status: 'using', updated_at: '2026-08-02', purchased_at: '2026-08-02' }),
      'Updated body',
    );

    const reloadedRepository = new MarkdownEntityRepository(store, clock);
    await reloadedRepository.initialize();
    const reloaded = await reloadedRepository.listObjects();

    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].entity.status).toBe('using');
    expect(reloaded[0].entity.updated_at).toBe('2026-08-02');
    expect(reloaded[0].body).toContain('Updated body');
  });

  it('archives, restores with a collision-safe filename, and permanently deletes an object', async () => {
    const { store, repository } = await setup();
    const originalFileName = await repository.saveObject(physical(), 'Keep this body');
    const archiveFileName = await repository.archiveObject(originalFileName);

    expect(store.has('Objects', originalFileName)).toBe(false);
    expect(store.has('Archive/Objects', archiveFileName)).toBe(true);

    const archivedContent = store.read('Archive/Objects', archiveFileName)!;
    const archived = parseMarkdownEntity<Record<string, unknown>>(archivedContent);
    expect(archived.frontmatter.archived_from).toBe('Objects');
    expect(archived.frontmatter.original_file_name).toBe(originalFileName);

    await repository.saveObject(
      physical({ id: 'object-physical-replacement' }),
      'A new active record using the original filename',
    );
    const restoredFileName = await repository.restoreObject(archiveFileName);

    expect(restoredFileName).toMatch(/^restored-2026-08-01T12-34-56-789Z--/);
    expect(store.has('Archive/Objects', archiveFileName)).toBe(false);
    const restored = (await repository.listObjects()).find(
      (entry) => entry.entity.id === 'object-physical-1',
    );
    expect(restored?.fileName).toBe(restoredFileName);
    expect(restored?.body).toContain('Keep this body');
    expect(restored?.entity.archived_at).toBeUndefined();
    expect(restored?.entity.original_file_name).toBeUndefined();

    const secondArchive = await repository.archiveObject(restoredFileName);
    await repository.permanentlyDeleteArchivedEntity('object', secondArchive);
    expect(store.has('Archive/Objects', secondArchive)).toBe(false);
  });

  it('uses unique archive names when two operations share the same timestamp', async () => {
    const { repository } = await setup();
    const first = await repository.saveObject(physical({ id: 'object-1', title: 'First' }));
    const second = await repository.saveObject(physical({ id: 'object-2', title: 'Second' }));

    const firstArchive = await repository.archiveObject(first);
    const restoredFirst = await repository.restoreObject(firstArchive);
    const secondArchiveForFirst = await repository.archiveObject(restoredFirst);
    const secondArchive = await repository.archiveObject(second);

    expect(secondArchiveForFirst).not.toBe(secondArchive);
    expect(secondArchiveForFirst).toContain('2026-08-01T12-34-56-789Z');
    expect(secondArchive).toContain('2026-08-01T12-34-56-789Z');
  });

  it('round-trips snapshot and review records through update, archive, and restore', async () => {
    const { repository } = await setup();

    const snapshotFile = await repository.saveSnapshot(snapshot(), 'Snapshot body');
    await repository.updateSnapshot(
      snapshotFile,
      snapshot({ net_worth: 110000, updated_at: '2026-08-02' }),
      'Updated snapshot body',
    );
    const snapshotArchive = await repository.archiveSnapshot(snapshotFile);
    const restoredSnapshotFile = await repository.restoreSnapshot(snapshotArchive);

    const snapshots = await repository.listSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].fileName).toBe(restoredSnapshotFile);
    expect(snapshots[0].entity.net_worth).toBe(110000);
    expect(snapshots[0].body).toContain('Updated snapshot body');

    const reviewFile = await repository.saveReview(review(), 'Review body');
    await repository.updateReview(
      reviewFile,
      review({ experience_score: 9, updated_at: '2026-08-02' }),
      'Updated review body',
    );
    const reviewArchive = await repository.archiveReview(reviewFile);
    const restoredReviewFile = await repository.restoreReview(reviewArchive);

    const reviews = await repository.listReviews();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].fileName).toBe(restoredReviewFile);
    expect(reviews[0].entity.target_id).toBe('object-physical-1');
    expect(reviews[0].entity.experience_score).toBe(9);
    expect(reviews[0].body).toContain('Updated review body');
  });

  it('reads object experience logs and skips malformed Markdown without hiding valid records', async () => {
    const { store, repository } = await setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log: ObjectLogEntry = {
      schema_version: '0.1',
      id: 'log-1',
      type: 'object_log',
      title: 'Camera usage',
      created_at: '2026-08-01',
      target_id: 'object-physical-1',
      event_type: 'usage',
      occurred_at: '2026-08-01',
      summary: 'Used throughout a weekend trip.',
      lesson: 'Compact size matters.',
      source: 'test',
    };

    store.seed(
      'Logs/Object Experiences',
      'log--2026-08-01--camera-usage.md',
      serializeMarkdownEntity(log, 'Log body'),
    );
    store.seed('Objects', 'broken.md', 'not valid frontmatter');
    await repository.saveObject(physical());

    const logs = await repository.listObjectLogs();
    const objects = await repository.listObjects();

    expect(logs).toHaveLength(1);
    expect(logs[0].entity.target_id).toBe('object-physical-1');
    expect(logs[0].entity.lesson).toBe('Compact size matters.');
    expect(objects).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      'Skipping invalid Ownly object file:',
      'broken.md',
    );
  });

  it('keeps the active source when writing the archive copy fails', async () => {
    const { store, repository } = await setup();
    const fileName = await repository.saveObject(physical(), 'Source must survive');
    store.failNextWrite();

    await expect(repository.archiveObject(fileName)).rejects.toThrow('Simulated write failure');
    expect(store.has('Objects', fileName)).toBe(true);
    expect(await repository.listArchivedEntities()).toHaveLength(0);
  });

  it('supports an Ownly child folder as the configured data root', async () => {
    const { store, repository } = await setup('Ownly');
    const fileName = await repository.saveObject(physical());

    expect(repository.getDataFolderPath()).toBe('Ownly');
    expect(store.has('Ownly/Objects', fileName)).toBe(true);
    expect(await repository.listObjects()).toHaveLength(1);
  });
});
