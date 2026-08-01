import { describe, expect, it } from 'vitest';
import {
  OWNLY_BACKUP_FORMAT_VERSION,
  OWNLY_DATASET_METADATA_PATH,
  OWNLY_DATASET_SCHEMA_VERSION,
  createOwnlyBackup,
  migrateOwnlyBackup,
  parseOwnlyBackup,
  planOwnlyRestore,
  restoreOwnlyBackup,
  serializeOwnlyBackup,
  sha256Text,
  validateOwnlyBackup,
  type OwnlyBackupBundle,
  type OwnlyTextFileAdapter,
} from './data-portability';

class MemoryAdapter implements OwnlyTextFileAdapter {
  readonly files = new Map<string, string>();
  private failPath: string | null = null;

  constructor(seed: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(seed)) this.files.set(path, content);
  }

  async listFiles(): Promise<string[]> {
    return [...this.files.keys()];
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`Missing file: ${path}`);
    return content;
  }

  async writeText(path: string, content: string): Promise<void> {
    if (this.failPath === path) {
      this.failPath = null;
      throw new Error(`Simulated write failure: ${path}`);
    }
    this.files.set(path, content);
  }

  async deleteText(path: string): Promise<void> {
    this.files.delete(path);
  }

  failNextWrite(path: string): void {
    this.failPath = path;
  }
}

const SOURCE = { runtime: 'test' as const, ownly_version: '1.1.0' };
const NOW = new Date('2026-08-01T10:00:00.000Z');
const metadata = (version: string = OWNLY_DATASET_SCHEMA_VERSION) => `${JSON.stringify({
  kind: 'ownly-dataset',
  schema_version: version,
  initialized_at: '2026-08-01T09:00:00.000Z',
  updated_at: '2026-08-01T09:00:00.000Z',
}, null, 2)}\n`;

const objectMarkdown = (title: string, objectType = 'physical') => `---
schema_version: "0.1"
id: obj-${title.toLowerCase().replaceAll(' ', '-')}
type: object
object_type: ${objectType}
title: ${title}
status: observing
created_at: 2026-08-01
---

## Notes
`;

describe('Ownly data portability core', () => {
  it('creates a deterministic versioned backup and round-trips JSON', async () => {
    const adapter = new MemoryAdapter({
      'Ownly/Objects/camera.md': objectMarkdown('Camera'),
      [OWNLY_DATASET_METADATA_PATH]: metadata(),
      'Ownly/Archive/Reviews/old.md': 'archived review\n',
    });

    const backup = await createOwnlyBackup(adapter, SOURCE, NOW);

    expect(backup.kind).toBe('ownly-backup');
    expect(backup.backup_format_version).toBe(OWNLY_BACKUP_FORMAT_VERSION);
    expect(backup.dataset_schema_version).toBe(OWNLY_DATASET_SCHEMA_VERSION);
    expect(backup.created_at).toBe(NOW.toISOString());
    expect(backup.files.map((file) => file.path)).toEqual([
      'Ownly/.ownly-dataset.json',
      'Ownly/Archive/Reviews/old.md',
      'Ownly/Objects/camera.md',
    ]);
    for (const file of backup.files) {
      expect(file.sha256).toBe(await sha256Text(file.content));
      expect(file.size).toBe(new TextEncoder().encode(file.content).byteLength);
    }

    const serialized = serializeOwnlyBackup(backup);
    expect(parseOwnlyBackup(serialized)).toEqual(backup);
    expect((await validateOwnlyBackup(backup)).valid).toBe(true);
  });

  it('detects content tampering, duplicate paths, and unsafe paths', async () => {
    const adapter = new MemoryAdapter({
      'Ownly/Objects/camera.md': objectMarkdown('Camera'),
    });
    const backup = await createOwnlyBackup(adapter, SOURCE, NOW);
    const tampered: OwnlyBackupBundle = {
      ...backup,
      files: [
        { ...backup.files[0], content: `${backup.files[0].content}tampered` },
        { ...backup.files[0] },
        { ...backup.files[0], path: '../outside.md' },
      ],
    };

    const validation = await validateOwnlyBackup(tampered);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'HASH_MISMATCH',
      'SIZE_MISMATCH',
      'DUPLICATE_PATH',
      'INVALID_PATH',
    ]));
  });

  it('preflights create, identical, and conflict actions without writing', async () => {
    const source = new MemoryAdapter({
      'Ownly/Objects/a.md': 'same\n',
      'Ownly/Objects/b.md': 'backup version\n',
      'Ownly/Objects/c.md': 'new\n',
    });
    const target = new MemoryAdapter({
      'Ownly/Objects/a.md': 'same\n',
      'Ownly/Objects/b.md': 'local version\n',
    });
    const backup = await createOwnlyBackup(source, SOURCE, NOW);

    const rejectPlan = await planOwnlyRestore(backup, target, 'reject');
    expect(rejectPlan.can_apply).toBe(false);
    expect(rejectPlan.identical).toBe(1);
    expect(rejectPlan.conflicts).toBe(1);
    expect(rejectPlan.creates).toBe(1);

    const overwritePlan = await planOwnlyRestore(backup, target, 'overwrite');
    expect(overwritePlan.can_apply).toBe(true);
    expect(overwritePlan.overwrites).toBe(1);
    expect(target.files.get('Ownly/Objects/b.md')).toBe('local version\n');
  });

  it('restores with explicit overwrite and returns a complete safety backup', async () => {
    const source = new MemoryAdapter({
      'Ownly/Objects/a.md': 'new a\n',
      'Ownly/Objects/b.md': 'new b\n',
    });
    const target = new MemoryAdapter({
      'Ownly/Objects/a.md': 'old a\n',
      'Ownly/Reviews/local.md': 'local only\n',
    });
    const backup = await createOwnlyBackup(source, SOURCE, NOW);

    const result = await restoreOwnlyBackup(backup, target, {
      collisionPolicy: 'overwrite',
    });

    expect(result.applied).toBe(true);
    expect(result.rolled_back).toBe(false);
    expect(result.verified).toEqual([
      'Ownly/Objects/a.md',
      'Ownly/Objects/b.md',
    ]);
    expect(result.safety_backup?.files.map((file) => file.path)).toEqual([
      'Ownly/Objects/a.md',
      'Ownly/Reviews/local.md',
    ]);
    expect(target.files.get('Ownly/Objects/a.md')).toBe('new a\n');
    expect(target.files.get('Ownly/Objects/b.md')).toBe('new b\n');
    expect(target.files.get('Ownly/Reviews/local.md')).toBe('local only\n');
  });

  it('rolls back overwritten files and removes new files after a failed restore', async () => {
    const source = new MemoryAdapter({
      'Ownly/Objects/a.md': 'new a\n',
      'Ownly/Objects/b.md': 'new b\n',
    });
    const target = new MemoryAdapter({
      'Ownly/Objects/a.md': 'old a\n',
    });
    target.failNextWrite('Ownly/Objects/b.md');
    const backup = await createOwnlyBackup(source, SOURCE, NOW);

    await expect(restoreOwnlyBackup(backup, target, {
      collisionPolicy: 'overwrite',
    })).rejects.toThrow('original data was rolled back');

    expect(target.files.get('Ownly/Objects/a.md')).toBe('old a\n');
    expect(target.files.has('Ownly/Objects/b.md')).toBe(false);
  });

  it('migrates a legacy 0.0 fixture to 0.1, preserves unknown fields, and is idempotent', async () => {
    const legacyMarkdown = `---
id: legacy-camera
type: object
object_type: physical_asset
title: Legacy Camera
status: observing
created_at: 2020-01-01
custom_future_field: keep-me
---

Legacy body stays intact.
`;
    const adapter = new MemoryAdapter({
      [OWNLY_DATASET_METADATA_PATH]: metadata('0.0'),
      'Ownly/Objects/legacy-camera.md': legacyMarkdown,
    });
    const backup = await createOwnlyBackup(adapter, SOURCE, NOW);

    const migration = await migrateOwnlyBackup(backup);

    expect(migration.from_version).toBe('0.0');
    expect(migration.to_version).toBe('0.1');
    expect(migration.applied_steps).toEqual(['dataset-0.0-to-0.1']);
    const migratedMarkdown = migration.migrated_bundle.files.find(
      (file) => file.path === 'Ownly/Objects/legacy-camera.md',
    )?.content;
    expect(migratedMarkdown).toContain('schema_version: "0.1"');
    expect(migratedMarkdown).toContain('object_type: physical');
    expect(migratedMarkdown).toContain('custom_future_field: keep-me');
    expect(migratedMarkdown).toContain('Legacy body stays intact.');

    const second = await migrateOwnlyBackup(migration.migrated_bundle);
    expect(second.applied_steps).toEqual([]);
    expect(second.changes).toEqual([]);
    expect(second.migrated_bundle).toEqual(migration.migrated_bundle);
  });

  it('refuses unsupported newer dataset versions', async () => {
    const adapter = new MemoryAdapter({
      [OWNLY_DATASET_METADATA_PATH]: metadata('9.0'),
    });
    const backup = await createOwnlyBackup(adapter, SOURCE, NOW);
    expect((await validateOwnlyBackup(backup)).valid).toBe(false);
    await expect(migrateOwnlyBackup(backup)).rejects.toThrow('invalid backup bundle');
  });
});
