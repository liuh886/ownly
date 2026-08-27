import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMarkdownEntity } from '../../src/data/frontmatter';
import type { WYQDObject } from '../../src/domain/types';
import { OwnlyWriteService } from './ownly-write-service';

const temporaryRoots: string[] = [];
const NOW = new Date('2026-08-14T12:00:00+08:00');

function fixture(): { container: string; dataRoot: string } {
  const container = mkdtempSync(join(tmpdir(), 'ownly-write-'));
  temporaryRoots.push(container);
  const dataRoot = join(container, 'Ownly');
  for (const relative of [
    'Objects', 'Snapshots', 'Reviews', 'Logs/Object Experiences', 'Archive/Objects',
  ]) {
    mkdirSync(join(dataRoot, relative), { recursive: true });
  }
  return { container, dataRoot };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('OwnlyWriteService', () => {
  it('previews without writing and requires explicit write enablement', async () => {
    const { dataRoot } = fixture();
    const service = new OwnlyWriteService(dataRoot, { now: () => NOW });
    const prepared = service.prepareCreateObject({
      object_type: 'physical', title: 'Camera', amount: 8000,
    });

    expect(prepared).toMatchObject({ action: 'create_object', write_enabled: false });
    expect(prepared.preview).toMatchObject({ before: null, after: { title: 'Camera' } });
    expect(readdirSync(join(dataRoot, 'Objects'))).toEqual([]);
    await expect(service.commit(prepared.operation_id)).rejects.toMatchObject({
      code: 'WRITE_DISABLED',
    });
    expect(readdirSync(join(dataRoot, 'Objects'))).toEqual([]);
  });

  it('backs up, commits once, and returns the same result when retried', async () => {
    const { container, dataRoot } = fixture();
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const prepared = service.prepareCreateObject({
      object_type: 'recurring_cost', title: 'Ownly Cloud', amount: 25,
      currency: 'CNY', billing_day: 14,
    });

    const first = await service.commit(prepared.operation_id);
    const second = await service.commit(prepared.operation_id);
    expect(second).toEqual(first);
    expect(first.status).toBe('committed');
    expect(existsSync(join(container, 'Ownly Backups', first.backup_file))).toBe(true);
    const files = readdirSync(join(dataRoot, 'Objects'));
    expect(files).toHaveLength(1);
    const stored = parseMarkdownEntity<WYQDObject>(
      readFileSync(join(dataRoot, 'Objects', files[0]), 'utf8'),
    ).frontmatter;
    expect(stored).toMatchObject({
      title: 'Ownly Cloud', object_type: 'recurring_cost', annualized_cost: 300,
    });
    expect(readFileSync(join(dataRoot, 'Logs', 'agent_operations.log'), 'utf8'))
      .toContain('object_add');
  });

  it('rejects stale previews instead of overwriting a concurrent edit', async () => {
    const { dataRoot } = fixture();
    const creator = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const created = await creator.commit(creator.prepareCreateObject({
      object_type: 'physical', title: 'Camera', amount: 8000,
    }).operation_id);
    const id = String((created.result.object as WYQDObject).id);
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const prepared = service.prepareUpdateObject({ id, title: 'New Camera' });
    const objectFile = join(dataRoot, 'Objects', readdirSync(join(dataRoot, 'Objects'))[0]);
    writeFileSync(objectFile, `${readFileSync(objectFile, 'utf8')}\nConcurrent note.\n`, 'utf8');

    await expect(service.commit(prepared.operation_id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(readFileSync(objectFile, 'utf8')).not.toContain('title: New Camera');
  });

  it('supports lifecycle, log, review, snapshot, archive, and restore operations', async () => {
    const { dataRoot } = fixture();
    let tick = 0;
    const service = new OwnlyWriteService(dataRoot, {
      allowWrite: true,
      now: () => new Date(NOW.getTime() + tick++ * 1000),
    });
    const objectResult = await service.commit(service.prepareCreateObject({
      object_type: 'physical', title: 'Old Camera', amount: 1000,
      purchased_at: '2025-01-01',
    }).operation_id);
    const id = String((objectResult.result.object as WYQDObject).id);

    await service.commit(service.prepareRetireObject(id, '2026-08-14').operation_id);
    await service.commit(service.prepareAddObjectLog({
      id, event_type: 'lesson', summary: 'Used less than expected.',
    }).operation_id);
    await service.commit(service.prepareCreateReview({
      review_type: 'object_review', target_id: id, summary: 'Useful learning.',
    }).operation_id);
    await service.commit(service.prepareCreateSnapshot({ assets: 100, liabilities: 20 }).operation_id);
    await service.commit(service.prepareArchiveObject(id).operation_id);
    expect(readdirSync(join(dataRoot, 'Objects'))).toEqual([]);
    await service.commit(service.prepareRestoreObject(id).operation_id);

    expect(readdirSync(join(dataRoot, 'Objects'))).toHaveLength(1);
    expect(readdirSync(join(dataRoot, 'Logs', 'Object Experiences'))).toHaveLength(1);
    expect(readdirSync(join(dataRoot, 'Reviews'))).toHaveLength(1);
    expect(readdirSync(join(dataRoot, 'Snapshots'))).toHaveLength(1);
  });
});
