// @vitest-environment jsdom
/**
 * The read that populates every tab used to fire once, on mount.
 *
 * On a refresh that is before the shell has restored the folder handle from
 * IndexedDB and pointed the repository at the right data root, so all five lists
 * came back empty and `dataLoaded` latched true with no second read coming. The
 * app then reported an empty data folder over a folder full of records — and
 * said "connected" the whole time, because nothing had asked whether the folder
 * could be read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  OwnlyWorkspaceProvider,
  type OwnlyWorkspaceContextValue,
} from '@/core/ownly-workspace-context';
import { useOwnlyData } from './useOwnlyData';
import type { WYQDStoredEntity } from '@/core/repository';
import type { WYQDObject } from '@/domain/types';
import { createObjectDraft } from '@/components/objects/composerDraftFactory';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createRepository() {
  return {
    listObjects: vi.fn(async (): Promise<WYQDStoredEntity<WYQDObject>[]> => []),
    listSnapshots: vi.fn(async () => []),
    listReviews: vi.fn(async () => []),
    listObjectLogs: vi.fn(async () => []),
    listArchivedEntities: vi.fn(async () => []),
  };
}

type Repository = ReturnType<typeof createRepository>;

function createContext(repository: Repository) {
  return {
    repository,
    isLoading: true,
    dataRevision: 0,
  } as unknown as OwnlyWorkspaceContextValue;
}

let container: HTMLDivElement;
let root: Root | null = null;

function Probe() {
  const { storedObjects, dataLoaded, loadError, loadVaultData } = useOwnlyData();
  return (
    <div
      data-probe="ownly-data"
      data-objects={storedObjects.length}
      data-loaded={String(dataLoaded)}
      data-error={loadError ?? ''}
    ><button onClick={() => void loadVaultData().catch(() => {})}>Reload</button></div>
  );
}

function readProbe() {
  const node = container.querySelector('[data-probe="ownly-data"]');
  return {
    objects: Number(node?.getAttribute('data-objects') ?? -1),
    dataLoaded: node?.getAttribute('data-loaded') === 'true',
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function render(value: OwnlyWorkspaceContextValue) {
  await act(async () => {
    root?.render(
      <OwnlyWorkspaceProvider value={value}>
        <Probe />
      </OwnlyWorkspaceProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
  document.body.innerHTML = '';
});

describe('useOwnlyData', () => {
  it('does not let a slow manual reload overwrite a newer workspace revision', async () => {
    const repository = createRepository();
    const value = { ...createContext(repository), isLoading: false };
    await render(value);
    let resolveOld!: (objects: WYQDStoredEntity<WYQDObject>[]) => void;
    repository.listObjects.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
    await render({ ...value, dataRevision: 1 });
    await act(async () => resolveOld([{
      fileName: 'old.md', body: '', entity: createObjectDraft({ title: 'Old workspace', objectType: 'physical', amount: 10 }),
    }]));
    expect(readProbe().objects).toBe(0);
    expect(readProbe().dataLoaded).toBe(true);
  });

  it('shows manual reload failures and clears them after retrying', async () => {
    const repository = createRepository();
    await render({ ...createContext(repository), isLoading: false });
    repository.listObjects.mockRejectedValueOnce(new Error('Read failed'));
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
    expect(readProbe().dataLoaded).toBe(true);
    expect(container.querySelector('[data-probe]')?.getAttribute('data-error')).toBe('Read failed');
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
    expect(readProbe().dataLoaded).toBe(true);
    expect(container.querySelector('[data-probe]')?.getAttribute('data-error')).toBe('');
  });
  it('does not report an unreadable folder as a successfully loaded empty dataset', async () => {
    const repository = createRepository();
    repository.listObjects.mockRejectedValue(new Error('Permission lost'));
    await render({ ...createContext(repository), isLoading: false });
    expect(readProbe().dataLoaded).toBe(false);
    expect(container.querySelector('[data-probe]')?.getAttribute('data-error')).toBe('Permission lost');
    repository.listObjects.mockResolvedValue([]);
    await render({ ...createContext(repository), isLoading: false, dataRevision: 1 });
    expect(readProbe().dataLoaded).toBe(true);
    expect(container.querySelector('[data-probe]')?.getAttribute('data-error')).toBe('');
  });
  it('does not read while the shell is still deciding which store is live', async () => {
    const repository = createRepository();

    await render(createContext(repository));

    // A read here lands before the handle is restored and returns empty for a
    // folder that is full.
    expect(repository.listObjects).not.toHaveBeenCalled();
    expect(readProbe().dataLoaded).toBe(false);
  });

  it('reads once the shell has finished booting', async () => {
    const repository = createRepository();
    const value = createContext(repository);

    await render(value);
    await render({ ...value, isLoading: false });

    expect(repository.listObjects).toHaveBeenCalledTimes(1);
    expect(readProbe().dataLoaded).toBe(true);
  });

  it('re-reads when the store is swapped underneath it', async () => {
    const repository = createRepository();
    const value = createContext(repository);

    await render(value);
    await render({ ...value, isLoading: false });
    await render({ ...value, isLoading: false, dataRevision: 1 });

    expect(repository.listObjects).toHaveBeenCalledTimes(2);
  });
});
