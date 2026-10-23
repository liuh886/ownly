// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OwnlyWorkspaceProvider, type OwnlyWorkspaceContextValue } from '@/core/ownly-workspace-context';
import { I18nProvider } from '@/core/i18n-context';
import { MemoryOwnlyFileStore } from '@/services/MemoryOwnlyStore';
import { MarkdownEntityRepository } from '@/services/MarkdownEntityRepository';
import { createObjectDraft } from '@/components/objects/composerDraftFactory';
import type { ReviewEntry, WYQDObject } from '@/domain/types';
import type { WYQDStoredEntity } from '@/core/repository';
import { useOwnlyActions } from './useOwnlyActions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let store: MemoryOwnlyFileStore;
let repo: MarkdownEntityRepository;
let actions: ReturnType<typeof useOwnlyActions>;
let visible: WYQDStoredEntity<WYQDObject>[];
let workspace: OwnlyWorkspaceContextValue;
const reload = vi.fn(async () => {});
const notice = vi.fn();
const objectCreated = vi.fn();

function Probe() {
  const value = useOwnlyActions(reload, visible, objectCreated);
  useEffect(() => { actions = value; });
  return null;
}
async function render() {
  await act(async () => root.render(<I18nProvider initialLanguage="en"><OwnlyWorkspaceProvider value={workspace}><Probe /></OwnlyWorkspaceProvider></I18nProvider>));
}
async function seed(objectType: 'physical' | 'one_time_experience' = 'one_time_experience') {
  const draft = createObjectDraft({ title: 'Trip', objectType, amount: 100, experienceStatus: 'completed' });
  const object = { ...draft, id: 'object-trip' } as WYQDObject;
  const fileName = await repo.saveObject(object, 'Personal notes');
  visible = [...await repo.listObjects()];
  await render();
  return { object, fileName };
}
function review(id = 'review-trip'): ReviewEntry {
  return { schema_version: '0.1', id, type: 'review', review_type: 'object_review', title: 'Trip review', target_id: 'object-trip', target: 'Trip', target_type: 'one_time_experience', created_at: '2026-10-04', updated_at: '2026-10-04', reviewed_at: '2026-10-04', summary: 'Good', currency: 'CNY' };
}
beforeEach(async () => {
  vi.clearAllMocks(); reload.mockResolvedValue();
  store = new MemoryOwnlyFileStore();
  repo = new MarkdownEntityRepository(store, () => new Date('2026-10-04T08:00:00Z'));
  await repo.initialize(); visible = [];
  workspace = { repository: repo, isConnected: true, isLoading: false, dataRevision: 0, membership: { isPro: true }, showNotice: notice } as unknown as OwnlyWorkspaceContextValue;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('does not turn a completed write into a retryable save when rereading fails', async () => {
  reload.mockRejectedValueOnce(new Error('Permission lost during reload'));
  await expect(actions.createObject({ ...createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 0 }), id: 'camera' }, 'Notes')).resolves.toBeUndefined();
  expect(await repo.listObjects()).toHaveLength(1);
  expect(objectCreated).toHaveBeenCalledOnce();
  expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('do not save again'));
});

it('does not complete onboarding in a new workspace when the old save refresh fails', async () => {
  reload.mockImplementationOnce(async () => {
    workspace = { ...workspace, dataRevision: 1 };
    await render();
    throw new Error('Old workspace reload failed');
  });
  await actions.createObject({ ...createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 0 }), id: 'camera' }, 'Notes');
  expect(await repo.listObjects()).toHaveLength(1);
  expect(objectCreated).not.toHaveBeenCalled();
  expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('previous data folder'));
});

it('compensates a failed review backlink and retries with one active review', async () => {
  const { fileName, object } = await seed();
  const write = store.writeMarkdownFile.bind(store);
  let fail = true;
  vi.spyOn(store, 'writeMarkdownFile').mockImplementation(async (dir, name, body) => {
    if (fail && dir.endsWith('/Objects')) { fail = false; throw new Error('Object write denied'); }
    await write(dir, name, body);
  });
  const ranks = { foodScore: 0, sceneryScore: null, experienceScore: 90 };
  await expect(actions.createObjectReview(fileName, object, 'Good', ranks, 'Personal notes')).rejects.toThrow('denied');
  expect(await repo.listReviews()).toHaveLength(0);
  expect((await repo.listObjects())[0].entity).toMatchObject({ status: 'completed' });
  await actions.createObjectReview(fileName, object, 'Good', ranks, 'Personal notes');
  const first = (await repo.listReviews())[0];
  expect((await repo.listObjects())[0].entity).toMatchObject({ status: 'reviewed', review_ref: first.entity.id });
  await actions.createObjectReview(fileName, object, 'Better', ranks, 'Personal notes');
  expect(await repo.listReviews()).toHaveLength(1);
  expect((await repo.listReviews())[0].entity).toMatchObject({ id: first.entity.id, summary: 'Better', food_score: 0 });
});

it('rolls back usage status when its timeline entry cannot be written', async () => {
  const { object } = await seed('physical');
  const write = store.writeMarkdownFile.bind(store);
  vi.spyOn(store, 'writeMarkdownFile').mockImplementation(async (dir, name, body) => {
    if (dir.includes('Logs/')) throw new Error('Log write denied');
    await write(dir, name, body);
  });
  await expect(actions.toggleObjectUsageState(object.id, 'unused')).rejects.toThrow('denied');
  expect((await repo.listObjects())[0].entity).toEqual(object);
  expect(await repo.listObjectLogs()).toHaveLength(0);
});

it('archives and restores a review together with the experience lifecycle link', async () => {
  await seed(); await actions.createReview(review(), 'Review notes');
  const saved = (await repo.listReviews())[0];
  await actions.deleteReview(saved.fileName);
  expect((await repo.listObjects())[0].entity).toMatchObject({ status: 'completed', review_ref: null });
  const archived = (await repo.listArchivedEntities()).find((entry) => entry.archiveType === 'review')!;
  await actions.restoreArchivedEntity('review', archived.fileName);
  expect((await repo.listObjects())[0].entity).toMatchObject({ status: 'reviewed', review_ref: 'review-trip' });
});

it('restores an object without a dangling pointer to its subsequently archived review', async () => {
  const { fileName } = await seed(); await actions.createReview(review(), 'Review notes');
  await actions.archiveObject(fileName);
  await actions.deleteReview((await repo.listReviews())[0].fileName);
  const archived = (await repo.listArchivedEntities()).find((entry) => entry.archiveType === 'object')!;
  await actions.restoreArchivedEntity('object', archived.fileName);
  expect((await repo.listObjects())[0].entity).toMatchObject({ status: 'completed', review_ref: null, reviewed_at: null });
});

it('preserves the review link when archiving that review fails', async () => {
  await seed(); await actions.createReview(review(), 'Review notes');
  const saved = (await repo.listReviews())[0];
  const remove = store.deleteMarkdownFile.bind(store);
  vi.spyOn(store, 'deleteMarkdownFile').mockImplementation(async (dir, name) => {
    if (dir === 'Ownly/Reviews') throw new Error('Delete denied');
    await remove(dir, name);
  });
  await expect(actions.deleteReview(saved.fileName)).rejects.toThrow('denied');
  expect(await repo.listReviews()).toHaveLength(1);
  expect((await repo.listObjects())[0].entity).toMatchObject({ status: 'reviewed', review_ref: 'review-trip' });
});

it('rejects stale edits rather than overwriting an externally changed Markdown record', async () => {
  const { object, fileName } = await seed();
  await repo.updateObject(fileName, { ...object, title: 'Externally renamed' }, 'New personal notes');
  await expect(actions.updateObject(fileName, { ...object, title: 'Old editor' }, 'Old notes')).rejects.toThrow('changed');
  expect((await repo.listObjects())[0]).toMatchObject({ body: expect.stringContaining('New personal notes'), entity: { title: 'Externally renamed' } });
});

it('rejects disconnected and old-workspace callbacks before any persisted write', async () => {
  const { object, fileName } = await seed();
  const old = actions;
  workspace = { ...workspace, dataRevision: 1 }; await render();
  await expect(old.archiveObject(fileName)).rejects.toThrow('folder changed');
  workspace = { ...workspace, isConnected: false }; await render();
  await expect(actions.updateObject(fileName, object, '')).rejects.toThrow();
  expect(await repo.listObjects()).toHaveLength(1);
  expect(await repo.listArchivedEntities()).toHaveLength(0);
});

it('never edits an unrelated review referenced by a corrupt object backlink', async () => {
  const { object, fileName } = await seed();
  await repo.saveReview({ ...review('other-review'), target_id: 'other-object', summary: 'Other original' }, 'Other notes');
  await repo.updateObject(fileName, { ...object, review_ref: 'other-review' }, 'Personal notes');
  await actions.createObjectReview(fileName, object, 'Trip only', { foodScore: null, sceneryScore: null, experienceScore: null }, '');
  const entries = await repo.listReviews();
  expect(entries).toHaveLength(2);
  expect(entries.find((entry) => entry.entity.id === 'other-review')).toMatchObject({ body: expect.stringContaining('Other notes'), entity: { summary: 'Other original' } });
});

it('allows editing a historical review after its object is archived', async () => {
  const { fileName } = await seed(); await actions.createReview(review(), 'Review notes');
  await actions.archiveObject(fileName);
  const original = (await repo.listReviews())[0];
  await actions.updateReview(original.fileName, { ...original.entity, summary: 'Historical correction' }, 'Updated notes');
  expect((await repo.listReviews())[0].entity.summary).toBe('Historical correction');
  expect(await repo.listObjects()).toHaveLength(0);
});
