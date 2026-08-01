import { describe, expect, it } from 'vitest';
import { calculateHomeMetrics } from '@/domain/calculations';
import { validateEntity } from '@/domain/schema';
import type {
  Account,
  AccountSnapshot,
  ObjectLogEntry,
  ReviewEntry,
  WYQDObject,
} from '@/domain/types';
import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import { runWYQDDoctor } from './doctor';
import {
  createOwnlyBackup,
  migrateOwnlyBackup,
  validateOwnlyBackup,
  type OwnlyTextFileAdapter,
} from './data-portability';
import type { WYQDStoredEntity } from './repository';
import {
  OWNLY_DATA_BEHAVIOR_CONTRACT,
  OWNLY_PRODUCT_SURFACES,
  OWNLY_RUNTIME_CAPABILITY_MATRIX,
  dataBehaviorSignature,
  type OwnlyProductSurface,
} from './runtime-capabilities';
import { WYQD_RUNTIME_TARGETS } from './runtime';

const physical: WYQDObject = {
  schema_version: '0.1',
  id: 'object-camera',
  type: 'object',
  object_type: 'physical',
  title: 'Camera',
  status: 'using',
  created_at: '2026-01-01T00:00:00.000Z',
  purchased_at: '2026-01-10',
  purchase_price: 1200,
  total_acquisition_cost: 1250,
  review_ref: 'review-camera',
  currency: 'USD',
};

const recurring: WYQDObject = {
  schema_version: '0.1',
  id: 'object-cloud',
  type: 'object',
  object_type: 'recurring_cost',
  title: 'Cloud storage',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  started_at: '2026-01-01',
  billing_cycle: 'annual',
  billing_amount: 120,
  currency: 'USD',
};

const experience: WYQDObject = {
  schema_version: '0.1',
  id: 'object-trip',
  type: 'object',
  object_type: 'one_time_experience',
  title: 'Kyoto weekend',
  status: 'completed',
  created_at: '2026-02-01T00:00:00.000Z',
  started_at: '2026-02-10',
  ended_at: '2026-02-12',
  budget_total: 500,
  actual_total: 480,
  currency: 'USD',
};

const account: Account = {
  schema_version: '0.1',
  id: 'account-cash',
  type: 'account',
  title: 'Cash',
  account_type: 'asset',
  status: 'active',
  include_in_net_worth: true,
  created_at: '2026-01-01T00:00:00.000Z',
  currency: 'USD',
};

const snapshot: AccountSnapshot = {
  schema_version: '0.1',
  id: 'snapshot-2026-07',
  type: 'snapshot',
  title: 'July snapshot',
  snapshot_type: 'net_worth',
  snapshot_at: '2026-07-31',
  is_month_end: true,
  asset_balances: [{ account: 'Cash', account_id: account.id, amount: 10000, currency: 'USD' }],
  liability_balances: [],
  created_at: '2026-07-31T00:00:00.000Z',
  currency: 'USD',
};

const review: ReviewEntry = {
  schema_version: '0.1',
  id: 'review-camera',
  type: 'review',
  title: 'Camera review',
  review_type: 'object_review',
  target: physical.title,
  target_id: physical.id,
  target_type: 'physical',
  reviewed_at: '2026-07-01',
  created_at: '2026-07-01T00:00:00.000Z',
};

const objectLog: ObjectLogEntry = {
  schema_version: '0.1',
  id: 'log-camera-usage',
  type: 'object_log',
  title: 'Camera usage',
  target_id: physical.id,
  event_type: 'usage',
  occurred_at: '2026-07-15',
  summary: 'Used for a weekend trip.',
  created_at: '2026-07-15T00:00:00.000Z',
};

const objects = [physical, recurring, experience];
const allEntities = [...objects, account, snapshot, review, objectLog];

function stored<T extends { id: string }>(entity: T, folder: string): WYQDStoredEntity<T & { schema_version: '0.1'; type: never; title: string; created_at: string }> {
  return {
    fileName: `${entity.id}.md`,
    path: `Ownly/${folder}/${entity.id}.md`,
    entity: entity as T & { schema_version: '0.1'; type: never; title: string; created_at: string },
    body: '',
  };
}

class MemoryTextAdapter implements OwnlyTextFileAdapter {
  constructor(private readonly files = new Map<string, string>()) {}

  async listFiles(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`Missing fixture file: ${path}`);
    return content;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async deleteText(path: string): Promise<void> {
    this.files.delete(path);
  }
}

function createLifecycleHarness() {
  const active = new Map(objects.map((entity) => [entity.id, entity]));
  const archived = new Map<string, WYQDObject>();
  return {
    archive(id: string) {
      const entity = active.get(id);
      if (!entity) throw new Error(`Missing active entity: ${id}`);
      active.delete(id);
      archived.set(id, entity);
    },
    restore(id: string) {
      const entity = archived.get(id);
      if (!entity) throw new Error(`Missing archived entity: ${id}`);
      archived.delete(id);
      active.set(id, entity);
    },
    facts() {
      return {
        active: [...active.keys()].sort(),
        archived: [...archived.keys()].sort(),
      };
    },
  };
}

async function evaluateSurface(surface: OwnlyProductSurface) {
  const markdown = allEntities.map((entity) => {
    const content = serializeMarkdownEntity(entity, `# ${entity.title}\n`);
    const parsed = parseMarkdownEntity<typeof entity>(content);
    return {
      id: parsed.frontmatter.id,
      type: parsed.frontmatter.type,
      body: parsed.body,
      valid: validateEntity(parsed.frontmatter).valid,
    };
  });

  const objectRecords = objects.map((entity) => stored(entity, 'Objects'));
  const accountRecords = [stored(account, 'Accounts')];
  const snapshotRecords = [stored(snapshot, 'Snapshots')];
  const reviewRecords = [stored(review, 'Reviews')];
  const logRecords = [stored(objectLog, 'Logs/Object Experiences')];

  const doctor = await runWYQDDoctor({
    listObjects: async () => objectRecords,
    listAccounts: async () => accountRecords,
    listSnapshots: async () => snapshotRecords,
    listReviews: async () => reviewRecords,
    listObjectLogs: async () => logRecords,
    getDataFolderPath: () => 'Ownly',
  }, '2026-08-01T00:00:00.000Z');

  const lifecycle = createLifecycleHarness();
  lifecycle.archive(physical.id);
  const archived = lifecycle.facts();
  lifecycle.restore(physical.id);
  const restored = lifecycle.facts();

  const textAdapter = new MemoryTextAdapter(new Map(
    allEntities.map((entity) => [
      `Ownly/${entity.type === 'object' ? 'Objects' : entity.type === 'account' ? 'Accounts' : entity.type === 'snapshot' ? 'Snapshots' : entity.type === 'review' ? 'Reviews' : 'Logs/Object Experiences'}/${entity.id}.md`,
      serializeMarkdownEntity(entity),
    ]),
  ));
  const backup = await createOwnlyBackup(
    textAdapter,
    { runtime: surface, ownly_version: '1.1.0' },
    new Date('2026-08-01T00:00:00.000Z'),
  );
  const validation = await validateOwnlyBackup(backup);
  const migration = await migrateOwnlyBackup(backup);

  return {
    surface,
    contract: OWNLY_RUNTIME_CAPABILITY_MATRIX[surface].dataBehaviorContract,
    markdown,
    metrics: calculateHomeMetrics(objects, [snapshot]),
    lifecycle: { archived, restored },
    doctor: doctor.findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      entityId: finding.entityId ?? null,
      path: finding.path ?? null,
    })),
    backup: {
      valid: validation.valid,
      files: backup.files.map((file) => ({ path: file.path, sha256: file.sha256, size: file.size })),
      datasetSchema: backup.dataset_schema_version,
    },
    migration: {
      from: migration.from_version,
      to: migration.to_version,
      steps: migration.applied_steps,
      changes: migration.changes,
    },
  };
}

describe('Ownly runtime parity contract', () => {
  it('keeps hosted Web and installed PWA on one data runtime', () => {
    expect(WYQD_RUNTIME_TARGETS).toEqual(['web', 'obsidian']);
    expect(OWNLY_RUNTIME_CAPABILITY_MATRIX.web.dataRuntime).toBe('browser');
    expect(OWNLY_RUNTIME_CAPABILITY_MATRIX.pwa.dataRuntime).toBe('browser');
    expect(dataBehaviorSignature(OWNLY_RUNTIME_CAPABILITY_MATRIX.pwa))
      .toBe(dataBehaviorSignature(OWNLY_RUNTIME_CAPABILITY_MATRIX.web));
  });

  it('publishes one explicit data contract with complete shared support', () => {
    for (const surface of OWNLY_PRODUCT_SURFACES) {
      const capabilities = OWNLY_RUNTIME_CAPABILITY_MATRIX[surface];
      expect(capabilities.dataBehaviorContract).toBe(OWNLY_DATA_BEHAVIOR_CONTRACT);
      expect(Object.values(capabilities.operations).every(Boolean)).toBe(true);
      expect(Object.values(capabilities.records).every(Boolean)).toBe(true);
      expect(capabilities.firstObjectOnboarding).toBe(true);
      expect(capabilities.backupRestoreMigration).toBe(true);
      expect(capabilities.doctor).toBe(true);
      expect(capabilities.intentionalExceptions.length).toBeGreaterThan(0);
    }
  });

  it('produces equivalent facts, lifecycle outcomes, Doctor findings, and backups', async () => {
    const results = await Promise.all(OWNLY_PRODUCT_SURFACES.map(evaluateSurface));
    const normalized = results.map(({ surface: _surface, ...result }) => result);
    expect(normalized[1]).toEqual(normalized[0]);
    expect(normalized[2]).toEqual(normalized[0]);
  });
});
