// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectDraft } from '@/components/objects/composerDraftFactory';
import { useOwnlyActions } from './useOwnlyActions';
import type { WYQDStoredEntity } from '@/core/repository';
import type { WYQDObject } from '@/domain/types';

const mocks = vi.hoisted(() => ({
  saveReview: vi.fn(async () => {}),
  updateObject: vi.fn(async () => {}),
  saveObjectLog: vi.fn(async () => {}),
  reload: vi.fn(async () => {}),
  listObjects: vi.fn(async (): Promise<WYQDStoredEntity<WYQDObject>[]> => []),
  listReviews: vi.fn(async () => []),
}));
vi.mock('@/core/ownly-workspace-context', () => ({ useOwnlyWorkspace: () => ({
  repository: mocks, membership: { isPro: true }, showNotice: vi.fn(), isConnected: true, isLoading: false, dataRevision: 0,
}) }));
vi.mock('@/core/i18n-context', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;

function Probe() {
  const experience = createObjectDraft({ title: 'Free outing', objectType: 'one_time_experience', experienceStatus: 'completed', amount: 500, actualAmount: 0 });
  const physical = createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100 });
  const actions = useOwnlyActions(mocks.reload, [{ entity: physical, fileName: 'camera.md', body: '' }]);
  if (experience.object_type !== 'one_time_experience') throw new Error('Expected experience');
  return <>
    <button id="review" onClick={() => void actions.createObjectReview('outing.md', experience, 'Great', { foodScore: null, sceneryScore: null, experienceScore: null }, '')}>Review</button>
    <button id="usage" onClick={() => void actions.toggleObjectUsageState(physical.id, 'unused')}>Mark unused</button>
  </>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 3, 1));
  mocks.listObjects.mockResolvedValue([
    { fileName: 'outing.md', body: '', entity: createObjectDraft({ title: 'Free outing', objectType: 'one_time_experience', experienceStatus: 'completed', amount: 500, actualAmount: 0 }) },
    { fileName: 'camera.md', body: '', entity: createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100 }) },
  ]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('persisted object actions', () => {
  it('records an actually free experience as zero cost on the local review date', async () => {
    await act(async () => (container.querySelector('#review') as HTMLButtonElement).click());
    expect(mocks.saveReview).toHaveBeenCalledWith(expect.objectContaining({ realized_experience_cost: 0, reviewed_at: '2026-10-03', period: '2026-10' }), expect.any(String));
    expect(mocks.updateObject).toHaveBeenCalledWith('outing.md', expect.objectContaining({ reviewed_at: '2026-10-03', updated_at: '2026-10-03' }), '');
  });

  it('records usage changes and their timeline logs on the same local day', async () => {
    await act(async () => (container.querySelector('#usage') as HTMLButtonElement).click());
    expect(mocks.updateObject).toHaveBeenCalledWith('camera.md', expect.objectContaining({ unused_since: '2026-10-03' }), '');
    expect(mocks.saveObjectLog).toHaveBeenCalledWith(expect.objectContaining({ occurred_at: '2026-10-03', created_at: '2026-10-03' }), expect.any(String));
  });
});
