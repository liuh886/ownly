import { describe, expect, it, vi } from 'vitest';
import { saveTripReviewDraft, TripReviewConflictError, TripReviewSaveError } from './save-trip-review';
import { buildTripReviewDraft, buildTripReviewStats } from '@/domain/trip-review';
import type { PlannerTrip } from '@/domain/planner';
import { MarkdownEntityRepository, type MarkdownFileStore } from '@/services/MarkdownEntityRepository';
const trip: PlannerTrip = { schema_version: '0.1', type: 'trip', id: 't1', title: 'Trip', status: 'completed',
  start_date: '2026-10-01', end_date: '2026-10-02', destinations: ['Tokyo'], created_at: '2026-10-01' };
const draft = buildTripReviewDraft(trip, buildTripReviewStats(trip, [], [], [], []));
describe('retrospective recovery', () => {
  function markdownRepository() {
    const files = new Map<string, Map<string, string>>();
    const store: MarkdownFileStore = {
      getDataFolder: async () => '',
      readMarkdownFiles: async (directory) => [...(files.get(directory) ?? new Map()).entries()].map(([fileName, content]) => ({ fileName, content })),
      writeMarkdownFile: async (directory, fileName, content) => {
        const entries = files.get(directory) ?? new Map<string, string>();
        entries.set(fileName, content);
        files.set(directory, entries);
      },
      deleteMarkdownFile: async (directory, fileName) => { files.get(directory)?.delete(fileName); },
    };
    const repository = new MarkdownEntityRepository(store);
    return { repository, files };
  }
  it('uses actual Markdown readback as recovery baseline and updates structured edits safely', async () => {
    const { repository } = markdownRepository();
    await repository.initialize();
    const first = { ...draft, object: { ...draft.object, actual_total: 100, currency: 'JPY' as const,
      source_currency: 'JPY', legacy_extra: 'keep' } as typeof draft.object };
    const recovery = new Map();
    const link = vi.fn().mockRejectedValueOnce(new Error('Backlink denied')).mockResolvedValue(undefined);
    await expect(saveTripReviewDraft(repository, trip.id, first, link, () => {}, recovery)).rejects.toMatchObject({ objectSaved: true });
    const stored = (await repository.listObjects())[0];
    expect(stored.body).not.toBe(first.body);
    await saveTripReviewDraft(repository, trip.id, first, link, () => {}, recovery);
    const changed = { ...first, body: 'New notes', object: { ...first.object, id: 'random-retry-id',
      created_at: '2030-01-01', actual_total: 200, updated_at: '2030-01-02' } };
    await expect(saveTripReviewDraft(repository, trip.id, { ...changed, object: { ...changed.object, currency: 'USD' } }, link, () => {}, recovery)).rejects.toBeInstanceOf(TripReviewConflictError);
    expect((await repository.listObjects())[0].entity).toMatchObject({ currency: 'JPY', actual_total: 100 });
    await saveTripReviewDraft(repository, trip.id, changed, link, () => {}, recovery);
    const latest = (await repository.listObjects())[0];
    expect(latest.entity).toMatchObject({ id: stored.entity.id, created_at: stored.entity.created_at,
      currency: 'JPY', source_currency: 'JPY', actual_total: 200, legacy_extra: 'keep' });
    expect(latest.body).toContain('New notes');
  });
  it('detects external Markdown edits after a partial review save', async () => {
    const { repository, files } = markdownRepository();
    await repository.initialize();
    const recovery = new Map();
    const link = vi.fn().mockRejectedValueOnce(new Error('Backlink denied'));
    await expect(saveTripReviewDraft(repository, trip.id, draft, link, () => {}, recovery)).rejects.toMatchObject({ objectSaved: true });
    const directory = [...files.keys()][0];
    const entries = files.get(directory)!;
    const fileName = [...entries.keys()][0];
    entries.set(fileName, `${entries.get(fileName)}\nUser edited externally`);
    await expect(saveTripReviewDraft(repository, trip.id, { ...draft, body: 'Retry notes' }, link, () => {}, recovery))
      .rejects.toBeInstanceOf(TripReviewConflictError);
    expect(link).toHaveBeenCalledOnce();
  });
  it('reuses a saved object after linking fails, preserving edits made outside Planner', async () => {
    const rows: Array<{ fileName: string; entity: typeof draft.object; body: string }> = [];
    const saveObject = vi.fn(async (entity: typeof draft.object, body = '') => {
      rows.push({ fileName: 'review.md', entity, body }); return 'review.md';
    });
    const updateObject = vi.fn(async (_file: string, entity: typeof draft.object, body = '') => { rows[0] = { ...rows[0], entity, body }; });
    const repository = { listObjects: async () => rows, saveObject, updateObject };
    const recovery = new Map();
    const link = vi.fn().mockRejectedValueOnce(new Error('Disk denied')).mockResolvedValue(undefined);
    await expect(saveTripReviewDraft(repository, trip.id, draft, link, () => {}, recovery)).rejects.toMatchObject({ objectSaved: true });
    rows[0].body = 'User edited this in Reviews';
    await expect(saveTripReviewDraft(repository, trip.id, { ...draft, body: 'another attempt' }, link, () => {}, recovery)).rejects.toBeInstanceOf(TripReviewConflictError);
    expect(saveObject).toHaveBeenCalledOnce();
    expect(rows[0].body).toBe('User edited this in Reviews');
    expect(link).toHaveBeenCalledOnce();
    expect(updateObject).not.toHaveBeenCalled();
  });
  it('reports an object-write failure without linking or claiming partial success', async () => {
    const repository = { listObjects: async () => [], updateObject: vi.fn(), saveObject: vi.fn().mockRejectedValue(new Error('Disk denied')) };
    const link = vi.fn();
    const error = await saveTripReviewDraft(repository, trip.id, draft, link, () => {}, new Map()).catch((reason) => reason);
    expect(error).toBeInstanceOf(TripReviewSaveError);
    expect(error.objectSaved).toBe(false);
    expect(link).not.toHaveBeenCalled();
  });
  it('never links a remote/async result into a workspace switched during object save', async () => {
    let current = true;
    const repository = { listObjects: async () => [], updateObject: vi.fn(), saveObject: vi.fn(async () => { current = false; return 'saved.md'; }) };
    const link = vi.fn();
    await expect(saveTripReviewDraft(repository, trip.id, draft, link, () => {
      if (!current) throw new Error('Workspace changed');
    }, new Map())).rejects.toMatchObject({ objectSaved: true });
    expect(link).not.toHaveBeenCalled();
  });
  it('persists changed modal text on retry when the saved object has no external edits', async () => {
    const rows: Array<{ fileName: string; entity: typeof draft.object; body: string }> = [];
    const repository = {
      listObjects: async () => rows,
      saveObject: vi.fn(async (entity: typeof draft.object, body = '') => { rows.push({ fileName: 'review.md', entity, body }); return 'review.md'; }),
      updateObject: vi.fn(async (_file: string, entity: typeof draft.object, body = '') => { rows[0] = { ...rows[0], entity, body }; }),
    };
    const link = vi.fn().mockRejectedValueOnce(new Error('Disk denied')).mockResolvedValue(undefined);
    const recovery = new Map();
    await expect(saveTripReviewDraft(repository, trip.id, draft, link, () => {}, recovery)).rejects.toMatchObject({ objectSaved: true });
    await saveTripReviewDraft(repository, trip.id, { ...draft, body: 'New notes typed after failure' }, link, () => {}, recovery);
    expect(rows[0].body).toBe('New notes typed after failure');
    expect(repository.saveObject).toHaveBeenCalledOnce();
    expect(repository.updateObject).toHaveBeenCalledOnce();
    expect(link.mock.calls[0]).toEqual(link.mock.calls[1]);
  });

});
