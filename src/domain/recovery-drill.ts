import {
  createOwnlyBackup,
  restoreOwnlyBackup,
  sha256Text,
  validateOwnlyBackup,
  type OwnlyBackupBundle,
  type OwnlyTextFileAdapter,
} from '@/core/data-portability';
import { WYQD_CORE_TARGET_VERSION } from '@/core/runtime';

/**
 * WS-2 Gate 2 — guided recovery drill.
 *
 * The drill is structurally non-destructive: its signature takes no adapter
 * at all, so there is no channel through which real data could be written.
 * Fixture files are written to an internal memory adapter, the backup
 * round-trips through the production backup/validate/restore path, the
 * restore lands in a second isolated memory adapter, and both adapters are
 * wiped before the report is returned. The test suite pins the read-only
 * behavior of the underlying backup path plus the drill's cleanup evidence.
 */

export interface RecoveryDrillStep {
  id: string;
  ok: boolean;
  detail: string;
}

export interface RecoveryDrillReport {
  passed: boolean;
  fileCount: number;
  verifiedCount: number;
  cleanedCount: number;
  steps: RecoveryDrillStep[];
}

export class MemoryTextFileAdapter implements OwnlyTextFileAdapter {
  private readonly files = new Map<string, string>();

  async listFiles(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`Drill adapter has no file: ${path}`);
    return content;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async deleteText(path: string): Promise<void> {
    this.files.delete(path);
  }
}

/** Disposable fixture files. Deliberately spread across entity folders. */
export const DRILL_FIXTURE_FILES: Readonly<Record<string, string>> = {
  'Ownly/Objects/object-drill-1.md': `---\ntype: object\nobject_type: physical\ntitle: Drill Lamp\nstatus: owned\n---\n\nA disposable drill fixture. Not a real record.\n`,
  'Ownly/Objects/object-drill-2.md': `---\ntype: object\nobject_type: recurring_cost\ntitle: Drill Subscription\nstatus: active\n---\n\nA disposable drill fixture. Not a real record.\n`,
  'Ownly/Reviews/review-drill-1.md': `---\ntype: review\ntitle: Drill Review\n---\n\nA disposable drill fixture. Not a real record.\n`,
  'Ownly/Snapshots/snapshot-drill-1.md': `---\ntype: snapshot\ntitle: Drill Snapshot\n---\n\nA disposable drill fixture. Not a real record.\n`,
  'Ownly/Trips/trip-drill-1.md': `---\ntype: trip\ntitle: Drill Trip\n---\n\nA disposable drill fixture. Not a real record.\n`,
};

export async function createDrillFixture(
  adapter: OwnlyTextFileAdapter,
): Promise<string[]> {
  const paths: string[] = [];
  for (const [path, content] of Object.entries(DRILL_FIXTURE_FILES)) {
    await adapter.writeText(path, content);
    paths.push(path);
  }
  return paths;
}

/**
 * Compare a restored adapter against the bundle inventory: same file set,
 * and every file re-hashes to the recorded SHA-256.
 */
export async function compareBackupToAdapter(
  bundle: OwnlyBackupBundle,
  adapter: OwnlyTextFileAdapter,
): Promise<{ matched: number; mismatches: string[] }> {
  const mismatches: string[] = [];
  const actualPaths = await adapter.listFiles();
  const expectedPaths = bundle.files.map((file) => file.path).sort();
  if (actualPaths.join('\n') !== expectedPaths.join('\n')) {
    mismatches.push(
      `inventory differs (restored ${actualPaths.length}, expected ${expectedPaths.length})`,
    );
  }
  for (const file of bundle.files) {
    if (!(await adapter.exists(file.path))) {
      mismatches.push(`missing after restore: ${file.path}`);
      continue;
    }
    const actualHash = await sha256Text(await adapter.readText(file.path));
    if (actualHash !== file.sha256) mismatches.push(`hash mismatch: ${file.path}`);
  }
  return { matched: bundle.files.length - mismatches.length, mismatches };
}

export async function clearAdapter(adapter: OwnlyTextFileAdapter): Promise<number> {
  const paths = await adapter.listFiles();
  for (const path of paths) await adapter.deleteText(path);
  return paths.length;
}

export async function runRecoveryDrill(
  sourceRuntime: OwnlyBackupBundle['source']['runtime'] = 'web',
  now = new Date(),
): Promise<RecoveryDrillReport> {
  const steps: RecoveryDrillStep[] = [];
  const fail = (id: string, detail: string): RecoveryDrillReport => {
    steps.push({ id, ok: false, detail });
    return { passed: false, fileCount: 0, verifiedCount: 0, cleanedCount: 0, steps };
  };

  const fixtureAdapter = new MemoryTextFileAdapter();
  const isolatedAdapter = new MemoryTextFileAdapter();
  try {
    const fixturePaths = await createDrillFixture(fixtureAdapter);
    steps.push({ id: 'fixture', ok: true, detail: `${fixturePaths.length} disposable files` });

    const bundle = await createOwnlyBackup(
      fixtureAdapter,
      { runtime: sourceRuntime, ownly_version: WYQD_CORE_TARGET_VERSION },
      now,
    );
    steps.push({ id: 'export', ok: true, detail: `${bundle.files.length} files backed up` });

    const validation = await validateOwnlyBackup(bundle);
    if (!validation.valid) {
      return fail(
        'validate',
        validation.issues.map((issue) => issue.message).join('; ') || 'invalid',
      );
    }
    steps.push({ id: 'validate', ok: true, detail: `${validation.file_count} files, hashes ok` });

    const restore = await restoreOwnlyBackup(bundle, isolatedAdapter, {
      collisionPolicy: 'reject',
    });
    steps.push({ id: 'restore', ok: true, detail: `${restore.written.length} files restored` });

    const comparison = await compareBackupToAdapter(bundle, isolatedAdapter);
    if (comparison.mismatches.length > 0) {
      return fail('compare', comparison.mismatches.join('; '));
    }
    steps.push({ id: 'compare', ok: true, detail: `${comparison.matched} files byte-identical` });

    const cleanedFixture = await clearAdapter(fixtureAdapter);
    const cleanedIsolated = await clearAdapter(isolatedAdapter);
    const cleanedCount = cleanedFixture + cleanedIsolated;
    steps.push({ id: 'cleanup', ok: true, detail: `${cleanedCount} drill files removed` });

    return {
      passed: true,
      fileCount: bundle.files.length,
      verifiedCount: restore.verified.length,
      cleanedCount,
      steps,
    };
  } catch (error) {
    await clearAdapter(fixtureAdapter).catch(() => 0);
    await clearAdapter(isolatedAdapter).catch(() => 0);
    return fail('error', error instanceof Error ? error.message : String(error));
  }
}
