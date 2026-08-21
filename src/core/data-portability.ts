import YAML from 'yaml';

export const OWNLY_BACKUP_KIND = 'ownly-backup' as const;
export const OWNLY_BACKUP_FORMAT_VERSION = '1.0' as const;
export const OWNLY_DATASET_METADATA_PATH = 'Ownly/.ownly-dataset.json' as const;
export const OWNLY_DATASET_SCHEMA_VERSION = '0.1' as const;

export interface OwnlyDatasetMetadata {
  kind: 'ownly-dataset';
  schema_version: string;
  initialized_at: string;
  updated_at: string;
}

export interface OwnlyBackupSource {
  runtime: 'cli' | 'mcp' | 'web' | 'pwa' | 'obsidian' | 'test' | 'restore-safety';
  ownly_version: string;
}

export interface OwnlyBackupFile {
  path: string;
  sha256: string;
  size: number;
  content: string;
}

export interface OwnlyBackupBundle {
  kind: typeof OWNLY_BACKUP_KIND;
  backup_format_version: typeof OWNLY_BACKUP_FORMAT_VERSION;
  dataset_schema_version: string;
  created_at: string;
  source: OwnlyBackupSource;
  files: OwnlyBackupFile[];
}

export interface OwnlyTextFileAdapter {
  listFiles(): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  deleteText(path: string): Promise<void>;
}

export interface BackupValidationIssue {
  path?: string;
  code:
    | 'INVALID_BUNDLE'
    | 'UNSUPPORTED_FORMAT'
    | 'UNSUPPORTED_SCHEMA'
    | 'INVALID_PATH'
    | 'DUPLICATE_PATH'
    | 'HASH_MISMATCH'
    | 'SIZE_MISMATCH';
  message: string;
}

export interface BackupValidationResult {
  valid: boolean;
  issues: BackupValidationIssue[];
  file_count: number;
  total_size: number;
}

export type RestoreCollisionPolicy = 'reject' | 'skip' | 'overwrite';
export type RestoreAction = 'create' | 'skip_identical' | 'skip_conflict' | 'overwrite';

export interface RestorePlanItem {
  path: string;
  action: RestoreAction;
  backup_sha256: string;
  existing_sha256?: string;
}

export interface RestorePlan {
  valid: boolean;
  can_apply: boolean;
  collision_policy: RestoreCollisionPolicy;
  validation: BackupValidationResult;
  items: RestorePlanItem[];
  creates: number;
  identical: number;
  conflicts: number;
  overwrites: number;
  skipped_conflicts: number;
}

export interface RestoreOptions {
  collisionPolicy?: RestoreCollisionPolicy;
  dryRun?: boolean;
  safetyBackup?: OwnlyBackupBundle;
}

export interface RestoreResult {
  plan: RestorePlan;
  applied: boolean;
  written: string[];
  skipped: string[];
  verified: string[];
  safety_backup?: OwnlyBackupBundle;
  rolled_back: boolean;
}

export interface MigrationChange {
  path: string;
  description: string;
}

export interface MigrationReport {
  from_version: string;
  to_version: string;
  applied_steps: string[];
  changes: MigrationChange[];
  warnings: string[];
  migrated_bundle: OwnlyBackupBundle;
}

export interface LiveMigrationResult {
  dry_run: boolean;
  original_backup: OwnlyBackupBundle;
  migration: MigrationReport;
  restore?: RestoreResult;
}

interface MigrationStep {
  id: string;
  from: string;
  to: string;
  apply(bundle: OwnlyBackupBundle): Promise<{
    files: OwnlyBackupFile[];
    changes: MigrationChange[];
    warnings: string[];
  }>;
}

const SUPPORTED_DATASET_VERSIONS = new Set<string>([
  '0.0',
  OWNLY_DATASET_SCHEMA_VERSION,
]);
const textEncoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeOwnlyBackupPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  const parts = normalized.split('/');
  if (
    normalized.startsWith('/')
    || normalized.length === 0
    || parts.some((part) => !part || part === '.' || part === '..')
    || parts[0] !== 'Ownly'
  ) {
    throw new Error(`Unsafe or non-canonical Ownly path: ${path}`);
  }
  return parts.join('/');
}

export async function sha256Text(content: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SHA-256 is unavailable in this runtime.');
  const digest = await subtle.digest('SHA-256', textEncoder.encode(content));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function backupFile(path: string, content: string): Promise<OwnlyBackupFile> {
  return {
    path: normalizeOwnlyBackupPath(path),
    sha256: await sha256Text(content),
    size: textEncoder.encode(content).byteLength,
    content,
  };
}

function parseDatasetMetadata(content: string): OwnlyDatasetMetadata | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      !isRecord(parsed)
      || parsed.kind !== 'ownly-dataset'
      || typeof parsed.schema_version !== 'string'
      || typeof parsed.initialized_at !== 'string'
      || typeof parsed.updated_at !== 'string'
    ) return null;
    return parsed as unknown as OwnlyDatasetMetadata;
  } catch {
    return null;
  }
}

export async function readDatasetSchemaVersion(
  adapter: OwnlyTextFileAdapter,
): Promise<string> {
  if (!(await adapter.exists(OWNLY_DATASET_METADATA_PATH))) {
    return OWNLY_DATASET_SCHEMA_VERSION;
  }
  const metadata = parseDatasetMetadata(
    await adapter.readText(OWNLY_DATASET_METADATA_PATH),
  );
  if (!metadata) throw new Error('Ownly dataset metadata is malformed.');
  return metadata.schema_version;
}

export async function ensureDatasetMetadata(
  adapter: OwnlyTextFileAdapter,
  now = new Date(),
): Promise<OwnlyDatasetMetadata> {
  const timestamp = now.toISOString();
  let initializedAt = timestamp;
  if (await adapter.exists(OWNLY_DATASET_METADATA_PATH)) {
    const existing = parseDatasetMetadata(
      await adapter.readText(OWNLY_DATASET_METADATA_PATH),
    );
    if (existing) initializedAt = existing.initialized_at;
  }
  const metadata: OwnlyDatasetMetadata = {
    kind: 'ownly-dataset',
    schema_version: OWNLY_DATASET_SCHEMA_VERSION,
    initialized_at: initializedAt,
    updated_at: timestamp,
  };
  await adapter.writeText(
    OWNLY_DATASET_METADATA_PATH,
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

export async function createOwnlyBackup(
  adapter: OwnlyTextFileAdapter,
  source: OwnlyBackupSource,
  now = new Date(),
): Promise<OwnlyBackupBundle> {
  const paths = [...new Set((await adapter.listFiles()).map(normalizeOwnlyBackupPath))]
    .sort((left, right) => left.localeCompare(right));
  const files: OwnlyBackupFile[] = [];
  for (const path of paths) {
    files.push(await backupFile(path, await adapter.readText(path)));
  }

  return {
    kind: OWNLY_BACKUP_KIND,
    backup_format_version: OWNLY_BACKUP_FORMAT_VERSION,
    dataset_schema_version: await readDatasetSchemaVersion(adapter),
    created_at: now.toISOString(),
    source,
    files,
  };
}

export function parseOwnlyBackup(input: string): OwnlyBackupBundle {
  const parsed: unknown = JSON.parse(input);
  if (!isRecord(parsed) || parsed.kind !== OWNLY_BACKUP_KIND || !Array.isArray(parsed.files)) {
    throw new Error('File is not an Ownly backup bundle.');
  }
  return parsed as unknown as OwnlyBackupBundle;
}

export function serializeOwnlyBackup(bundle: OwnlyBackupBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export async function validateOwnlyBackup(
  bundle: OwnlyBackupBundle,
): Promise<BackupValidationResult> {
  const issues: BackupValidationIssue[] = [];
  if (bundle.kind !== OWNLY_BACKUP_KIND || !Array.isArray(bundle.files)) {
    issues.push({ code: 'INVALID_BUNDLE', message: 'Invalid Ownly backup structure.' });
    return { valid: false, issues, file_count: 0, total_size: 0 };
  }
  if (bundle.backup_format_version !== OWNLY_BACKUP_FORMAT_VERSION) {
    issues.push({
      code: 'UNSUPPORTED_FORMAT',
      message: `Unsupported backup format version: ${String(bundle.backup_format_version)}`,
    });
  }
  if (!SUPPORTED_DATASET_VERSIONS.has(bundle.dataset_schema_version)) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA',
      message: `Unsupported dataset schema version: ${bundle.dataset_schema_version}`,
    });
  }

  const seen = new Set<string>();
  let totalSize = 0;
  for (const file of bundle.files) {
    let path: string;
    try {
      path = normalizeOwnlyBackupPath(file.path);
    } catch (error) {
      issues.push({
        path: file.path,
        code: 'INVALID_PATH',
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (seen.has(path)) {
      issues.push({ path, code: 'DUPLICATE_PATH', message: `Duplicate file path: ${path}` });
      continue;
    }
    seen.add(path);
    const actualSize = textEncoder.encode(file.content).byteLength;
    totalSize += actualSize;
    if (actualSize !== file.size) {
      issues.push({
        path,
        code: 'SIZE_MISMATCH',
        message: `Size mismatch for ${path}: expected ${file.size}, received ${actualSize}`,
      });
    }
    const actualHash = await sha256Text(file.content);
    if (actualHash !== file.sha256) {
      issues.push({
        path,
        code: 'HASH_MISMATCH',
        message: `SHA-256 mismatch for ${path}`,
      });
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    file_count: bundle.files.length,
    total_size: totalSize,
  };
}

export async function planOwnlyRestore(
  bundle: OwnlyBackupBundle,
  target: OwnlyTextFileAdapter,
  collisionPolicy: RestoreCollisionPolicy = 'reject',
): Promise<RestorePlan> {
  const validation = await validateOwnlyBackup(bundle);
  const items: RestorePlanItem[] = [];
  let creates = 0;
  let identical = 0;
  let conflicts = 0;
  let overwrites = 0;
  let skippedConflicts = 0;

  if (validation.valid) {
    for (const file of [...bundle.files].sort((a, b) => a.path.localeCompare(b.path))) {
      if (!(await target.exists(file.path))) {
        creates += 1;
        items.push({ path: file.path, action: 'create', backup_sha256: file.sha256 });
        continue;
      }
      const existingHash = await sha256Text(await target.readText(file.path));
      if (existingHash === file.sha256) {
        identical += 1;
        items.push({
          path: file.path,
          action: 'skip_identical',
          backup_sha256: file.sha256,
          existing_sha256: existingHash,
        });
        continue;
      }
      conflicts += 1;
      if (collisionPolicy === 'overwrite') overwrites += 1;
      if (collisionPolicy === 'skip') skippedConflicts += 1;
      items.push({
        path: file.path,
        action: collisionPolicy === 'overwrite'
          ? 'overwrite'
          : 'skip_conflict',
        backup_sha256: file.sha256,
        existing_sha256: existingHash,
      });
    }
  }

  return {
    valid: validation.valid,
    can_apply: validation.valid && (collisionPolicy !== 'reject' || conflicts === 0),
    collision_policy: collisionPolicy,
    validation,
    items,
    creates,
    identical,
    conflicts,
    overwrites,
    skipped_conflicts: skippedConflicts,
  };
}

async function restoreBundleWithoutSafety(
  bundle: OwnlyBackupBundle,
  target: OwnlyTextFileAdapter,
): Promise<void> {
  for (const file of bundle.files) {
    await target.writeText(file.path, file.content);
  }
}

export async function restoreOwnlyBackup(
  bundle: OwnlyBackupBundle,
  target: OwnlyTextFileAdapter,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const collisionPolicy = options.collisionPolicy ?? 'reject';
  const plan = await planOwnlyRestore(bundle, target, collisionPolicy);
  if (!plan.valid) throw new Error('Backup validation failed.');
  if (!plan.can_apply) {
    throw new Error(`Restore refused because ${plan.conflicts} conflicting files exist.`);
  }
  if (options.dryRun) {
    return {
      plan,
      applied: false,
      written: [],
      skipped: plan.items.filter((item) => item.action.startsWith('skip')).map((item) => item.path),
      verified: [],
      rolled_back: false,
    };
  }

  const shouldCreateSafety = plan.overwrites > 0;
  const safetyBackup = shouldCreateSafety
    ? options.safetyBackup ?? await createOwnlyBackup(
      target,
      { runtime: 'restore-safety', ownly_version: bundle.source.ownly_version },
    )
    : undefined;
  const createdPaths = plan.items
    .filter((item) => item.action === 'create')
    .map((item) => item.path);
  const written: string[] = [];
  const skipped = plan.items
    .filter((item) => item.action === 'skip_identical' || item.action === 'skip_conflict')
    .map((item) => item.path);

  try {
    for (const item of plan.items) {
      if (item.action !== 'create' && item.action !== 'overwrite') continue;
      const file = bundle.files.find((candidate) => candidate.path === item.path);
      if (!file) throw new Error(`Backup inventory is missing ${item.path}`);
      await target.writeText(item.path, file.content);
      written.push(item.path);
    }

    const verified: string[] = [];
    for (const path of written) {
      const expected = bundle.files.find((file) => file.path === path);
      if (!expected) throw new Error(`Backup inventory is missing ${path}`);
      const actualHash = await sha256Text(await target.readText(path));
      if (actualHash !== expected.sha256) {
        throw new Error(`Post-restore verification failed for ${path}`);
      }
      verified.push(path);
    }

    return {
      plan,
      applied: true,
      written,
      skipped,
      verified,
      safety_backup: safetyBackup,
      rolled_back: false,
    };
  } catch (error) {
    try {
      if (safetyBackup) await restoreBundleWithoutSafety(safetyBackup, target);
      for (const path of createdPaths) {
        if (!safetyBackup?.files.some((file) => file.path === path) && await target.exists(path)) {
          await target.deleteText(path);
        }
      }
    } catch (rollbackError) {
      throw new Error(
        `Restore failed and rollback also failed: ${String(error)}; rollback: ${String(rollbackError)}`,
      );
    }
    throw new Error(`Restore failed; original data was rolled back: ${String(error)}`);
  }
}

function replaceOrAddFile(
  files: OwnlyBackupFile[],
  file: OwnlyBackupFile,
): OwnlyBackupFile[] {
  return [...files.filter((candidate) => candidate.path !== file.path), file]
    .sort((left, right) => left.path.localeCompare(right.path));
}

async function migrateLegacyMarkdownFile(file: OwnlyBackupFile): Promise<{
  file: OwnlyBackupFile;
  changes: string[];
}> {
  if (!file.path.endsWith('.md')) return { file, changes: [] };
  const match = file.content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { file, changes: [] };
  const parsed: unknown = YAML.parse(match[1] || '{}');
  if (!isRecord(parsed)) return { file, changes: [] };

  const next = { ...parsed };
  const changes: string[] = [];
  if (next.schema_version !== OWNLY_DATASET_SCHEMA_VERSION) {
    next.schema_version = OWNLY_DATASET_SCHEMA_VERSION;
    changes.push('set schema_version to 0.1');
  }
  if (next.object_type === 'physical_asset') {
    next.object_type = 'physical';
    changes.push('rename legacy object_type physical_asset to physical');
  }
  if (changes.length === 0) return { file, changes };

  const yaml = YAML.stringify(next).trimEnd();
  const body = file.content.slice(match[0].length);
  const content = `---\n${yaml}\n---\n${body.startsWith('\n') || body.length === 0 ? body : `\n${body}`}`;
  return { file: await backupFile(file.path, content), changes };
}

const MIGRATIONS: MigrationStep[] = [
  {
    id: 'dataset-0.0-to-0.1',
    from: '0.0',
    to: '0.1',
    async apply(bundle) {
      let files: OwnlyBackupFile[] = [];
      const changes: MigrationChange[] = [];
      const warnings: string[] = [];
      for (const file of bundle.files) {
        try {
          const migrated = await migrateLegacyMarkdownFile(file);
          files.push(migrated.file);
          for (const description of migrated.changes) {
            changes.push({ path: file.path, description });
          }
        } catch (error) {
          files.push(file);
          warnings.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const timestamp = bundle.created_at;
      const metadata: OwnlyDatasetMetadata = {
        kind: 'ownly-dataset',
        schema_version: OWNLY_DATASET_SCHEMA_VERSION,
        initialized_at: timestamp,
        updated_at: timestamp,
      };
      const metadataFile = await backupFile(
        OWNLY_DATASET_METADATA_PATH,
        `${JSON.stringify(metadata, null, 2)}\n`,
      );
      files = replaceOrAddFile(files, metadataFile);
      changes.push({
        path: OWNLY_DATASET_METADATA_PATH,
        description: 'write explicit Ownly dataset metadata',
      });
      return { files, changes, warnings };
    },
  },
];

export async function migrateOwnlyBackup(
  bundle: OwnlyBackupBundle,
  targetVersion: string = OWNLY_DATASET_SCHEMA_VERSION,
): Promise<MigrationReport> {
  const validation = await validateOwnlyBackup(bundle);
  if (!validation.valid) throw new Error('Cannot migrate an invalid backup bundle.');
  if (!SUPPORTED_DATASET_VERSIONS.has(targetVersion)) {
    throw new Error(`Unsupported migration target: ${targetVersion}`);
  }

  const fromVersion = bundle.dataset_schema_version;
  let current = { ...bundle, files: [...bundle.files] };
  const appliedSteps: string[] = [];
  const changes: MigrationChange[] = [];
  const warnings: string[] = [];

  while (current.dataset_schema_version !== targetVersion) {
    const step = MIGRATIONS.find((candidate) => candidate.from === current.dataset_schema_version);
    if (!step) {
      throw new Error(
        `No migration path from ${current.dataset_schema_version} to ${targetVersion}`,
      );
    }
    const result = await step.apply(current);
    current = {
      ...current,
      dataset_schema_version: step.to,
      files: result.files,
    };
    appliedSteps.push(step.id);
    changes.push(...result.changes);
    warnings.push(...result.warnings);
  }

  return {
    from_version: fromVersion,
    to_version: targetVersion,
    applied_steps: appliedSteps,
    changes,
    warnings,
    migrated_bundle: current,
  };
}

export async function migrateOwnlyDataset(
  adapter: OwnlyTextFileAdapter,
  source: OwnlyBackupSource,
  options: { targetVersion?: string; dryRun?: boolean; now?: Date } = {},
): Promise<LiveMigrationResult> {
  const now = options.now ?? new Date();
  const originalBackup = await createOwnlyBackup(adapter, source, now);
  const migration = await migrateOwnlyBackup(
    originalBackup,
    options.targetVersion ?? OWNLY_DATASET_SCHEMA_VERSION,
  );
  if (options.dryRun || migration.applied_steps.length === 0) {
    return { dry_run: Boolean(options.dryRun), original_backup: originalBackup, migration };
  }
  const restore = await restoreOwnlyBackup(migration.migrated_bundle, adapter, {
    collisionPolicy: 'overwrite',
    safetyBackup: originalBackup,
  });
  return { dry_run: false, original_backup: originalBackup, migration, restore };
}
