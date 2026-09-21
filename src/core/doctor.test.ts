import { describe, expect, it } from 'vitest';
import {
  applyReviewRefRepairs,
  inspectReviewRefRepairs,
  runWYQDDoctor,
  type WYQDDoctorRepositoryAdapter,
  type WYQDDoctorRepairAdapter,
} from './doctor';
import type { WYQDStoredEntity } from './repository';
import type {
  AccountSnapshot,
  BaseEntity,
  ObjectLogEntry,
  PhysicalObject,
  ReviewEntry,
  WYQDObject,
} from '@/domain/types';

const CHECKED_AT = '2026-09-08T00:00:00.000Z';

function stored<T extends BaseEntity>(entity: T, fileName = `${entity.id}.md`): WYQDStoredEntity<T> {
  return { fileName, path: `Ownly/${fileName}`, entity, body: '' };
}

function physical(overrides: Partial<PhysicalObject> = {}): PhysicalObject {
  return {
    schema_version: '0.1', id: 'obj-1', type: 'object', object_type: 'physical',
    title: 'Camera', status: 'using', created_at: '2026-01-01', purchased_at: '2026-01-01', purchase_price: 1000,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    schema_version: '0.1', id: 'snap-1', type: 'snapshot', title: 'Net worth',
    created_at: '2026-08-01', snapshot_type: 'net_worth', snapshot_at: '2026-08-01',
    asset_balances: [{ account: 'Cash', account_id: 'a1', amount: 100 }], liability_balances: [], net_worth: 100,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    schema_version: '0.1', id: 'rev-1', type: 'review', title: 'Review', created_at: '2026-01-10',
    review_type: 'object_review', target_id: 'obj-1', target_type: 'physical', summary: 'ok',
    ...overrides,
  };
}

function log(overrides: Partial<ObjectLogEntry> = {}): ObjectLogEntry {
  return {
    schema_version: '0.1', id: 'log-1', type: 'object_log', title: 'Log', target_id: 'obj-1',
    event_type: 'usage', summary: 'used', created_at: '2026-01-05', occurred_at: '2026-01-05',
    ...overrides,
  };
}

function adapter(entities: {
  objects?: WYQDStoredEntity<WYQDObject>[];
  snapshots?: WYQDStoredEntity<AccountSnapshot>[];
  reviews?: WYQDStoredEntity<ReviewEntry>[];
  logs?: WYQDStoredEntity<ObjectLogEntry>[];
}): WYQDDoctorRepositoryAdapter {
  return {
    listObjects: async () => entities.objects ?? [],
    listSnapshots: async () => entities.snapshots ?? [],
    listReviews: async () => entities.reviews ?? [],
    listObjectLogs: async () => entities.logs ?? [],
  };
}

const ids = (report: { findings: { id: string }[] }) => report.findings.map((f) => f.id);

describe('runWYQDDoctor', () => {
  it('reports a clean dataset with only the data-folder summary', async () => {
    const recent = new Date().toISOString().split('T')[0];
    const report = await runWYQDDoctor(
      adapter({ objects: [stored(physical())], snapshots: [stored(snapshot({ snapshot_at: recent }))] }),
      CHECKED_AT,
    );
    expect(report.summary.error).toBe(0);
    expect(report.summary.warning).toBe(0);
    expect(report.checkedAt).toBe(CHECKED_AT);
    expect(ids(report)).toEqual(['directory.presence']);
  });

  it('flags duplicate entity ids', async () => {
    const report = await runWYQDDoctor(
      adapter({ objects: [stored(physical()), stored(physical(), 'dup.md')] }),
      CHECKED_AT,
    );
    expect(ids(report)).toContain('entity.id.duplicate');
    expect(report.summary.error).toBe(1);
  });

  it('warns on unsupported schema versions', async () => {
    const report = await runWYQDDoctor(
      adapter({ objects: [stored(physical({ schema_version: '9.9' } as unknown as Partial<PhysicalObject>))] }),
      CHECKED_AT,
    );
    expect(ids(report)).toContain('entity.schema.unsupported');
  });

  it('warns on negative calculated cost', async () => {
    const report = await runWYQDDoctor(
      adapter({ objects: [stored(physical({ purchase_price: -50 }))] }),
      CHECKED_AT,
    );
    expect(ids(report)).toContain('object.cost.negative');
  });

  it('warns when a snapshot net worth disagrees with its balances', async () => {
    const report = await runWYQDDoctor(
      adapter({ snapshots: [stored(snapshot({ net_worth: 999 }))] }),
      CHECKED_AT,
    );
    expect(ids(report)).toContain('snapshot.net_worth.mismatch');
  });

  it('warns on missing review targets and mismatched back-references', async () => {
    const missing = await runWYQDDoctor(
      adapter({ objects: [stored(physical())], reviews: [stored(review({ target_id: 'ghost' }))] }),
      CHECKED_AT,
    );
    expect(ids(missing)).toContain('review.target.missing');

    const mismatch = await runWYQDDoctor(
      adapter({ objects: [stored(physical())], reviews: [stored(review())] }),
      CHECKED_AT,
    );
    expect(ids(mismatch)).toContain('object.review_ref.mismatch');
  });

  it('warns on dangling object review_ref and log targets', async () => {
    const report = await runWYQDDoctor(
      adapter({
        objects: [stored(physical({ review_ref: 'ghost-review' } as Partial<PhysicalObject>))],
        logs: [stored(log({ target_id: 'ghost-object' }))],
      }),
      CHECKED_AT,
    );
    expect(ids(report)).toContain('object.review_ref.missing');
    expect(ids(report)).toContain('log.target.missing');
  });

  it('warns on created_at after updated_at', async () => {
    const report = await runWYQDDoctor(
      adapter({ objects: [stored(physical({ created_at: '2026-02-01', updated_at: '2026-01-01' }))] }),
      CHECKED_AT,
    );
    expect(ids(report)).toContain('entity.date.chronology');
  });

  it('reports stale snapshots as info', async () => {
    const report = await runWYQDDoctor(
      adapter({ snapshots: [stored(snapshot({ snapshot_at: '2020-01-01' }))] }),
      CHECKED_AT,
    );
    expect(ids(report)).toContain('snapshot.stale');
    expect(report.summary.info).toBeGreaterThanOrEqual(2);
  });

  it('reports missing expected data directories', async () => {
    const report = await runWYQDDoctor(
      {
        ...adapter({}),
        getDataFolderPath: () => 'Ownly',
        listDataDirectories: async () => ['Ownly', 'Ownly/Objects'],
      },
      CHECKED_AT,
    );
    const dirFindings = report.findings.filter((f) => f.id === 'directory.presence');
    expect(dirFindings.length).toBeGreaterThan(1);
  });
});

describe('review ref repairs', () => {
  function repairAdapter(objects: WYQDStoredEntity<WYQDObject>[], reviews: WYQDStoredEntity<ReviewEntry>[]) {
    const writes: Array<{ fileName: string; entity: WYQDObject }> = [];
    const adapter: WYQDDoctorRepairAdapter = {
      listObjects: async () => objects,
      listReviews: async () => reviews,
      updateObject: async (fileName, object) => {
        writes.push({ fileName, entity: object });
      },
    };
    return { adapter, writes };
  }

  it('plans a sync for a mismatch and a clear for a dangling ref', async () => {
    const { adapter: repair } = repairAdapter(
      [
        stored(physical({ id: 'obj-1' })),
        stored(physical({ id: 'obj-2', review_ref: 'ghost' } as Partial<PhysicalObject>)),
      ],
      [stored(review({ id: 'rev-1', target_id: 'obj-1' }))],
    );
    const plan = await inspectReviewRefRepairs(repair);
    expect(plan.mismatches).toEqual([
      expect.objectContaining({ objectId: 'obj-1', reviewId: 'rev-1', action: 'sync' }),
    ]);
    expect(plan.dangling).toEqual([
      expect.objectContaining({ objectId: 'obj-2', action: 'clear' }),
    ]);
  });

  it('applies repairs and reports counts', async () => {
    const { adapter: repair, writes } = repairAdapter(
      [
        stored(physical({ id: 'obj-1' })),
        stored(physical({ id: 'obj-2', review_ref: 'ghost' } as Partial<PhysicalObject>)),
      ],
      [stored(review({ id: 'rev-1', target_id: 'obj-1' }))],
    );
    const result = await applyReviewRefRepairs(repair, await inspectReviewRefRepairs(repair));
    expect(result).toEqual({ fixedMismatches: 1, clearedDangling: 1 });
    expect(writes.find((w) => w.fileName === 'obj-1.md')?.entity.review_ref).toBe('rev-1');
    expect(writes.find((w) => w.fileName === 'obj-2.md')?.entity.review_ref).toBeNull();
  });
});
