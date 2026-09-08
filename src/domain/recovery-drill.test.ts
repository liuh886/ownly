import { describe, expect, it } from 'vitest';
import {
  createOwnlyBackup,
  restoreOwnlyBackup,
  validateOwnlyBackup,
  type OwnlyTextFileAdapter,
} from '@/core/data-portability';
import { WYQD_CORE_TARGET_VERSION } from '@/core/runtime';
import {
  clearAdapter,
  compareBackupToAdapter,
  createDrillFixture,
  DRILL_FIXTURE_FILES,
  MemoryTextFileAdapter,
  runRecoveryDrill,
} from './recovery-drill';

class CountingAdapter extends MemoryTextFileAdapter {
  writes = 0;
  deletes = 0;

  override async writeText(path: string, content: string): Promise<void> {
    this.writes += 1;
    await super.writeText(path, content);
  }

  override async deleteText(path: string): Promise<void> {
    this.deletes += 1;
    await super.deleteText(path);
  }
}

describe('runRecoveryDrill (WS-2 Gate 2)', () => {
  it('passes end to end on the production backup path and cleans up', async () => {
    const report = await runRecoveryDrill('test', new Date('2026-09-08T00:00:00.000Z'));
    expect(report.passed).toBe(true);
    expect(report.steps.map((step) => step.id)).toEqual([
      'fixture',
      'export',
      'validate',
      'restore',
      'compare',
      'cleanup',
    ]);
    expect(report.steps.every((step) => step.ok)).toBe(true);
    expect(report.fileCount).toBe(Object.keys(DRILL_FIXTURE_FILES).length);
    expect(report.verifiedCount).toBe(report.fileCount);
    // Fixture adapter files + isolated restore files are all removed.
    expect(report.cleanedCount).toBe(report.fileCount * 2);
  });

  it('is deterministic across runs', async () => {
    const first = await runRecoveryDrill('test');
    const second = await runRecoveryDrill('test');
    expect(first.passed && second.passed).toBe(true);
    expect(first.fileCount).toBe(second.fileCount);
    expect(first.cleanedCount).toBe(second.cleanedCount);
  });

  it('fails the compare step when the restored data is tampered with', async () => {
    const source = new MemoryTextFileAdapter();
    await createDrillFixture(source);
    const bundle = await createOwnlyBackup(
      source,
      { runtime: 'test', ownly_version: WYQD_CORE_TARGET_VERSION },
      new Date('2026-09-08T00:00:00.000Z'),
    );
    expect((await validateOwnlyBackup(bundle)).valid).toBe(true);

    const isolated = new MemoryTextFileAdapter();
    await restoreOwnlyBackup(bundle, isolated, { collisionPolicy: 'reject' });
    // Tamper with one restored file: same inventory, different bytes.
    await isolated.writeText('Ownly/Objects/object-drill-1.md', 'tampered content');

    const comparison = await compareBackupToAdapter(bundle, isolated);
    expect(comparison.mismatches.length).toBeGreaterThan(0);
    expect(comparison.mismatches.some((mismatch) => mismatch.includes('hash mismatch'))).toBe(true);
  });

  it('rejects restoring into a non-empty target (isolation goes one way)', async () => {
    const source = new MemoryTextFileAdapter();
    await createDrillFixture(source);
    const bundle = await createOwnlyBackup(
      source,
      { runtime: 'test', ownly_version: WYQD_CORE_TARGET_VERSION },
    );
    const occupied = new MemoryTextFileAdapter();
    await occupied.writeText('Ownly/Objects/object-drill-1.md', 'someone else was here');
    await expect(
      restoreOwnlyBackup(bundle, occupied, { collisionPolicy: 'reject' }),
    ).rejects.toThrow();
  });

  it('never writes to an external adapter: backup creation is read-only', async () => {
    const active = new CountingAdapter();
    await active.writeText('Ownly/Objects/real.md', 'real user record');
    const writesBefore = active.writes;
    await createOwnlyBackup(active, { runtime: 'test', ownly_version: WYQD_CORE_TARGET_VERSION });
    expect(active.writes).toBe(writesBefore);
    expect(await active.readText('Ownly/Objects/real.md')).toBe('real user record');
  });

  it('clearAdapter leaves no residue', async () => {
    const adapter: OwnlyTextFileAdapter = new MemoryTextFileAdapter();
    await createDrillFixture(adapter);
    expect((await adapter.listFiles()).length).toBeGreaterThan(0);
    const removed = await clearAdapter(adapter);
    expect(removed).toBe(Object.keys(DRILL_FIXTURE_FILES).length);
    expect(await adapter.listFiles()).toEqual([]);
  });
});
