import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const temporaryRoots: string[] = [];
const tsxCli = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliEntry = join(process.cwd(), 'scripts', 'wyqd-cli.ts');

function createDataLocation(): string {
  const root = mkdtempSync(join(tmpdir(), 'ownly-cli-'));
  temporaryRoots.push(root);
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

function parseFrontmatter(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Missing frontmatter in ${filePath}`);
  const parsed: unknown = YAML.parse(match[1]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid frontmatter in ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Ownly CLI process contract', { timeout: 30000 }, () => {
  it('uses a custom data root directly when it already contains Objects', () => {
    const root = createDataLocation();
    mkdirSync(join(root, 'Objects'));
    const add = runCli(root, [
      'object', 'add', '--title', 'Custom Root Item', '--amount', '100', '--json',
    ]);

    expect(add.status).toBe(0);
    const created = JSON.parse(add.stdout) as { fileName: string };
    expect(existsSync(join(root, 'Objects', created.fileName))).toBe(true);
    expect(existsSync(join(root, 'Ownly'))).toBe(false);
  });

  it('creates, reads, updates, archives, and restores a physical object', () => {
    const root = createDataLocation();
    const add = runCli(root, [
      'object', 'add', '--title', 'Travel Camera', '--amount', '12000', '--category', 'Camera', '--json',
    ]);

    expect(add.status).toBe(0);
    expect(add.stderr).toBe('');
    const created = JSON.parse(add.stdout) as { id: string; fileName: string; status: string };
    expect(created.id).toMatch(/^obj_/);
    expect(created.status).toBe('observing');

    const objectPath = join(root, 'Ownly', 'Objects', created.fileName);
    expect(existsSync(objectPath)).toBe(true);
    expect(parseFrontmatter(objectPath)).toMatchObject({
      id: created.id,
      type: 'object',
      object_type: 'physical',
      title: 'Travel Camera',
      purchase_price: 12000,
    });

    const update = runCli(root, [
      'object', 'update', '--id', created.id, '--status', 'using', '--purchased-at', '2026-08-01', '--json',
    ]);
    expect(update.status).toBe(0);
    expect(JSON.parse(update.stdout)).toMatchObject({ id: created.id, status: 'using' });
    expect(parseFrontmatter(objectPath)).toMatchObject({ status: 'using', purchased_at: '2026-08-01' });

    const get = runCli(root, ['object', 'get', '--id', created.id, '--json']);
    expect(get.status).toBe(0);
    expect(JSON.parse(get.stdout)).toMatchObject({
      id: created.id,
      title: 'Travel Camera',
      object_type: 'physical',
      status: 'using',
    });

    const archived = runCli(root, ['object', 'delete', '--id', created.id, '--yes', '--json']);
    expect(archived.status).toBe(0);
    const archiveResult = JSON.parse(archived.stdout) as { archiveFileName: string };
    expect(existsSync(objectPath)).toBe(false);
    expect(existsSync(join(root, 'Ownly', 'Archive', 'Objects', archiveResult.archiveFileName))).toBe(true);

    const restored = runCli(root, ['object', 'restore', '--id', created.id, '--json']);
    expect(restored.status).toBe(0);
    expect(JSON.parse(restored.stdout)).toMatchObject({
      restored: true,
      object: { id: created.id, status: 'using' },
    });
  });

  it('creates recurring and experience facts without same-day filename overwrite', () => {
    const root = createDataLocation();
    const recurring = runCli(root, [
      'object', 'add', '--title', 'Shared Name', '--object-type', 'recurring_cost', '--amount', '20',
      '--billing-cycle', 'monthly', '--json',
    ]);
    const experience = runCli(root, [
      'object', 'add', '--title', 'Shared Name', '--object-type', 'one_time_experience', '--amount', '600', '--json',
    ]);

    expect(recurring.status).toBe(0);
    expect(experience.status).toBe(0);
    const recurringRow = JSON.parse(recurring.stdout) as { fileName: string; object_type: string };
    const experienceRow = JSON.parse(experience.stdout) as { fileName: string; object_type: string };
    expect(recurringRow.object_type).toBe('recurring_cost');
    expect(experienceRow.object_type).toBe('one_time_experience');
    expect(experienceRow.fileName).not.toBe(recurringRow.fileName);
    expect(readdirSync(join(root, 'Ownly', 'Objects')).filter((name) => name.endsWith('.md'))).toHaveLength(2);
  });

  it('returns stable JSON errors and non-zero exit codes for invalid input', () => {
    const root = createDataLocation();
    const missing = runCli(root, ['object', 'add', '--amount', '100', '--json']);

    expect(missing.status).toBe(1);
    expect(missing.stdout).toBe('');
    expect(JSON.parse(missing.stderr)).toEqual({
      error: 'Missing required option --title',
      code: 'MISSING_OPTION',
    });

    const invalid = runCli(root, [
      'object', 'add', '--title', 'Bad Subscription', '--object-type', 'recurring_cost',
      '--amount', '20', '--billing-cycle', 'sometimes', '--json',
    ]);
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stderr)).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('exposes summary and Doctor as deterministic fact surfaces', () => {
    const root = createDataLocation();
    expect(runCli(root, ['object', 'add', '--title', 'Camera', '--amount', '1000', '--json']).status).toBe(0);
    expect(runCli(root, [
      'object', 'add', '--title', 'Storage', '--object-type', 'recurring_cost', '--amount', '10', '--json',
    ]).status).toBe(0);

    const summary = runCli(root, ['summary', '--json']);
    expect(summary.status).toBe(0);
    expect(JSON.parse(summary.stdout)).toMatchObject({
      total_objects: 2,
      physical: 1,
      active_recurring_costs: 1,
      needs_review_count: 0,
    });

    const doctor = runCli(root, ['doctor', '--json']);
    expect(doctor.status).toBe(0);
    expect(JSON.parse(doctor.stdout)).toMatchObject({
      valid: true,
      entitiesChecked: 2,
      errors: [],
    });
  });
});
