import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  OWNLY_DATASET_SCHEMA_VERSION,
  createOwnlyBackup,
  migrateOwnlyBackup,
  parseOwnlyBackup,
  planOwnlyRestore,
  restoreOwnlyBackup,
  serializeOwnlyBackup,
  validateOwnlyBackup,
  type OwnlyBackupBundle,
  type RestoreCollisionPolicy,
} from '../../src/core/data-portability';
import { hasFlag, optionalString, requiredString } from './args';
import type { CommandContext } from './commands';
import { NodeOwnlyTextFileAdapter } from './node-portability-adapter';
import { CliError } from './types';

function printJson(context: CommandContext, value: unknown): void {
  context.io.stdout(JSON.stringify(value, null, 2));
}

function timestampToken(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function readBundle(path: string): OwnlyBackupBundle {
  try {
    return parseOwnlyBackup(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    throw new CliError(
      `Could not read Ownly backup ${path}: ${error instanceof Error ? error.message : String(error)}`,
      'INVALID_INPUT',
    );
  }
}

function writeBundle(path: string, bundle: OwnlyBackupBundle): string {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, serializeOwnlyBackup(bundle), 'utf8');
  return absolute;
}

function collisionPolicy(context: CommandContext): RestoreCollisionPolicy {
  const value = optionalString(context.options, 'collision') ?? 'reject';
  if (!['reject', 'skip', 'overwrite'].includes(value)) {
    throw new CliError(
      `Invalid collision policy: ${value}. Allowed: reject, skip, overwrite`,
      'INVALID_INPUT',
    );
  }
  return value as RestoreCollisionPolicy;
}

function compactPlan(plan: Awaited<ReturnType<typeof planOwnlyRestore>>) {
  return {
    valid: plan.valid,
    can_apply: plan.can_apply,
    collision_policy: plan.collision_policy,
    creates: plan.creates,
    identical: plan.identical,
    conflicts: plan.conflicts,
    overwrites: plan.overwrites,
    skipped_conflicts: plan.skipped_conflicts,
    validation: plan.validation,
    items: plan.items,
  };
}

export async function backupCommand(
  context: CommandContext,
  command: string,
): Promise<void> {
  if (command === 'create') {
    const adapter = new NodeOwnlyTextFileAdapter(context.dataLocation);
    const bundle = await createOwnlyBackup(
      adapter,
      { runtime: 'cli', ownly_version: '1.1.0' },
      context.now,
    );
    const output = optionalString(context.options, 'output')
      ?? join(context.dataLocation, `ownly-backup-${timestampToken(context.now)}.json`);
    const absoluteOutput = writeBundle(output, bundle);
    printJson(context, {
      created: true,
      output: absoluteOutput,
      backup_format_version: bundle.backup_format_version,
      dataset_schema_version: bundle.dataset_schema_version,
      file_count: bundle.files.length,
      total_size: bundle.files.reduce((sum, file) => sum + file.size, 0),
      sha256_verified: true,
    });
    return;
  }

  if (command === 'inspect' || command === 'validate') {
    const input = requiredString(context.options, 'input');
    const bundle = readBundle(input);
    const validation = await validateOwnlyBackup(bundle);
    printJson(context, {
      input: resolve(input),
      kind: bundle.kind,
      backup_format_version: bundle.backup_format_version,
      dataset_schema_version: bundle.dataset_schema_version,
      created_at: bundle.created_at,
      source: bundle.source,
      validation,
      files: command === 'inspect'
        ? bundle.files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256 }))
        : undefined,
    });
    if (!validation.valid) {
      throw new CliError('Backup validation failed.', 'INVALID_INPUT');
    }
    return;
  }

  if (command === 'preflight') {
    const input = requiredString(context.options, 'input');
    const targetPath = optionalString(context.options, 'target') ?? context.dataLocation;
    const bundle = readBundle(input);
    const target = new NodeOwnlyTextFileAdapter(targetPath);
    const plan = await planOwnlyRestore(bundle, target, collisionPolicy(context));
    printJson(context, compactPlan(plan));
    if (!plan.valid) throw new CliError('Backup validation failed.', 'INVALID_INPUT');
    return;
  }

  if (command === 'restore') {
    const input = requiredString(context.options, 'input');
    const targetPath = optionalString(context.options, 'target') ?? context.dataLocation;
    const policy = collisionPolicy(context);
    if (policy === 'overwrite' && !hasFlag(context.options, 'yes')) {
      throw new CliError(
        'Overwrite restore requires --yes after reviewing backup preflight.',
        'MISSING_OPTION',
      );
    }

    const bundle = readBundle(input);
    const target = new NodeOwnlyTextFileAdapter(targetPath);
    const plan = await planOwnlyRestore(bundle, target, policy);
    if (!plan.valid) throw new CliError('Backup validation failed.', 'INVALID_INPUT');
    if (!plan.can_apply) {
      printJson(context, compactPlan(plan));
      throw new CliError(
        `Restore refused because ${plan.conflicts} conflicting files exist.`,
        'INVALID_INPUT',
      );
    }

    let safetyBackup: OwnlyBackupBundle | undefined;
    let safetyOutput: string | undefined;
    if (policy === 'overwrite' && plan.overwrites > 0) {
      safetyBackup = await createOwnlyBackup(
        target,
        { runtime: 'restore-safety', ownly_version: '1.1.0' },
        context.now,
      );
      safetyOutput = writeBundle(
        optionalString(context.options, 'safety_output')
          ?? join(targetPath, `ownly-safety-backup-${timestampToken(context.now)}.json`),
        safetyBackup,
      );
    }

    const result = await restoreOwnlyBackup(bundle, target, {
      collisionPolicy: policy,
      dryRun: hasFlag(context.options, 'dry_run'),
      safetyBackup,
    });
    printJson(context, {
      restored: result.applied,
      dry_run: !result.applied,
      target: resolve(targetPath),
      safety_backup: safetyOutput,
      plan: compactPlan(result.plan),
      written: result.written,
      skipped: result.skipped,
      verified: result.verified,
      rolled_back: result.rolled_back,
    });
    return;
  }

  throw new CliError(`Unknown backup command: ${command}`);
}

export async function migrateCommand(context: CommandContext): Promise<void> {
  const targetVersion = optionalString(context.options, 'target_version')
    ?? OWNLY_DATASET_SCHEMA_VERSION;
  const adapter = new NodeOwnlyTextFileAdapter(context.dataLocation);
  const original = await createOwnlyBackup(
    adapter,
    { runtime: 'cli', ownly_version: '1.1.0' },
    context.now,
  );
  const migration = await migrateOwnlyBackup(original, targetVersion);
  const dryRun = hasFlag(context.options, 'dry_run');

  if (dryRun || migration.applied_steps.length === 0) {
    printJson(context, {
      dry_run: dryRun,
      from_version: migration.from_version,
      to_version: migration.to_version,
      applied_steps: migration.applied_steps,
      changes: migration.changes,
      warnings: migration.warnings,
      backup_written: null,
      migrated: false,
    });
    return;
  }

  if (!hasFlag(context.options, 'yes')) {
    throw new CliError(
      'Migration requires --yes after reviewing --dry-run output.',
      'MISSING_OPTION',
    );
  }

  const backupOutput = writeBundle(
    optionalString(context.options, 'backup_output')
      ?? join(context.dataLocation, `ownly-pre-migration-${timestampToken(context.now)}.json`),
    original,
  );
  const restore = await restoreOwnlyBackup(migration.migrated_bundle, adapter, {
    collisionPolicy: 'overwrite',
    safetyBackup: original,
  });

  printJson(context, {
    dry_run: false,
    from_version: migration.from_version,
    to_version: migration.to_version,
    applied_steps: migration.applied_steps,
    changes: migration.changes,
    warnings: migration.warnings,
    backup_written: backupOutput,
    migrated: restore.applied,
    verified: restore.verified,
    rolled_back: restore.rolled_back,
  });
}
