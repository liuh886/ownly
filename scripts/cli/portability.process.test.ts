import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseOwnlyBackup,
  validateOwnlyBackup,
} from '../../src/core/data-portability';

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];
const tsxCli = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliEntry = join(process.cwd(), 'scripts', 'wyqd-cli.ts');

function temporaryRoot(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `ownly-${label}-`));
  roots.push(root);
  return root;
}

function runCli(root: string, args: string[]): CliResult {
  const result = spawnSync(
    process.execPath,
    [tsxCli, cliEntry, '--vault', root, ...args],
    { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, OWNLY_VAULT: '' } },
  );
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function legacyMetadata(): string {
  return `${JSON.stringify({
    kind: 'ownly-dataset',
    schema_version: '0.0',
    initialized_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-01-01T00:00:00.000Z',
  }, null, 2)}\n`;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Ownly CLI data portability process contract', { timeout: 30000 }, () => {
  it('creates and validates a complete backup file', async () => {
    const source = temporaryRoot('backup-source');
    const output = join(source, 'exports', 'backup.json');
    expect(runCli(source, [
      'object', 'add', '--title', 'Travel Camera', '--amount', '12000', '--json',
    ]).status).toBe(0);
    write(join(source, 'Ownly', 'Logs', 'agent_operations.log'), '{"event":"test"}\n');

    const created = runCli(source, ['backup', 'create', '--output', output, '--json']);
    expect(created.status).toBe(0);
    expect(created.stderr).toBe('');
    expect(JSON.parse(created.stdout)).toMatchObject({
      created: true,
      output,
      backup_format_version: '1.0',
      dataset_schema_version: '0.1',
      sha256_verified: true,
    });
    expect(existsSync(output)).toBe(true);

    const bundle = parseOwnlyBackup(readFileSync(output, 'utf8'));
    expect((await validateOwnlyBackup(bundle)).valid).toBe(true);
    expect(bundle.files.some((file) => file.path.startsWith('Ownly/Objects/'))).toBe(true);
    expect(bundle.files.some((file) => file.path === 'Ownly/Logs/agent_operations.log')).toBe(true);

    const validated = runCli(source, ['backup', 'validate', '--input', output, '--json']);
    expect(validated.status).toBe(0);
    expect(JSON.parse(validated.stdout)).toMatchObject({
      validation: { valid: true },
    });
  });

  it('preflights and restores a backup into a clean target', () => {
    const source = temporaryRoot('restore-source');
    const target = temporaryRoot('restore-target');
    const output = join(source, 'backup.json');
    expect(runCli(source, [
      'object', 'add', '--title', 'Bicycle', '--amount', '3000', '--json',
    ]).status).toBe(0);
    expect(runCli(source, ['backup', 'create', '--output', output, '--json']).status).toBe(0);

    const preflight = runCli(target, [
      'backup', 'preflight', '--input', output, '--target', target, '--json',
    ]);
    expect(preflight.status).toBe(0);
    expect(JSON.parse(preflight.stdout)).toMatchObject({
      can_apply: true,
      conflicts: 0,
    });

    const restored = runCli(target, [
      'backup', 'restore', '--input', output, '--target', target, '--json',
    ]);
    expect(restored.status).toBe(0);
    expect(JSON.parse(restored.stdout)).toMatchObject({
      restored: true,
      target,
      rolled_back: false,
    });

    const summary = runCli(target, ['summary', '--json']);
    expect(summary.status).toBe(0);
    expect(JSON.parse(summary.stdout)).toMatchObject({ total_objects: 1, physical: 1 });
  });

  it('rejects conflicts by default and requires explicit confirmation for overwrite', () => {
    const source = temporaryRoot('conflict-source');
    const target = temporaryRoot('conflict-target');
    const output = join(source, 'backup.json');
    const sourceObject = runCli(source, [
      'object', 'add', '--title', 'Camera', '--amount', '12000', '--json',
    ]);
    const sourceFile = (JSON.parse(sourceObject.stdout) as { fileName: string }).fileName;
    expect(runCli(source, ['backup', 'create', '--output', output, '--json']).status).toBe(0);
    write(
      join(target, 'Ownly', 'Objects', sourceFile),
      readFileSync(join(source, 'Ownly', 'Objects', sourceFile), 'utf8').replace('12000', '999'),
    );

    const rejected = runCli(target, [
      'backup', 'restore', '--input', output, '--target', target, '--json',
    ]);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stderr)).toMatchObject({ code: 'INVALID_INPUT' });

    const unconfirmed = runCli(target, [
      'backup', 'restore', '--input', output, '--target', target,
      '--collision', 'overwrite', '--json',
    ]);
    expect(unconfirmed.status).toBe(1);
    expect(JSON.parse(unconfirmed.stderr)).toMatchObject({ code: 'MISSING_OPTION' });

    const safety = join(target, 'safety.json');
    const overwritten = runCli(target, [
      'backup', 'restore', '--input', output, '--target', target,
      '--collision', 'overwrite', '--yes', '--safety-output', safety, '--json',
    ]);
    expect(overwritten.status).toBe(0);
    expect(JSON.parse(overwritten.stdout)).toMatchObject({
      restored: true,
      safety_backup: safety,
    });
    expect(existsSync(safety)).toBe(true);
    expect(readFileSync(join(target, 'Ownly', 'Objects', sourceFile), 'utf8')).toContain('12000');
  });

  it('previews and applies a rollback-safe legacy migration', () => {
    const root = temporaryRoot('migration');
    write(join(root, 'Ownly', '.ownly-dataset.json'), legacyMetadata());
    write(join(root, 'Ownly', 'Objects', 'legacy.md'), `---
id: legacy-object
type: object
object_type: physical_asset
title: Legacy Camera
status: observing
created_at: 2020-01-01
custom_field: preserve-me
---

Legacy body.
`);

    const preview = runCli(root, ['migrate', '--dry-run', '--json']);
    expect(preview.status).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      dry_run: true,
      from_version: '0.0',
      to_version: '0.1',
      applied_steps: ['dataset-0.0-to-0.1'],
      migrated: false,
    });

    const backupOutput = join(root, 'pre-migration.json');
    const migrated = runCli(root, [
      'migrate', '--yes', '--backup-output', backupOutput, '--json',
    ]);
    expect(migrated.status).toBe(0);
    expect(JSON.parse(migrated.stdout)).toMatchObject({
      from_version: '0.0',
      to_version: '0.1',
      backup_written: backupOutput,
      migrated: true,
      rolled_back: false,
    });
    expect(existsSync(backupOutput)).toBe(true);

    const content = readFileSync(join(root, 'Ownly', 'Objects', 'legacy.md'), 'utf8');
    expect(content).toContain('schema_version: "0.1"');
    expect(content).toContain('object_type: physical');
    expect(content).toContain('custom_field: preserve-me');
    expect(content).toContain('Legacy body.');

    const second = runCli(root, ['migrate', '--dry-run', '--json']);
    expect(second.status).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({
      from_version: '0.1',
      to_version: '0.1',
      applied_steps: [],
    });
  });
});
