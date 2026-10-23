// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => ({ saved: null as unknown, registry: null as unknown, failNextSet: false }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => key === 'wyqd_obsidian_handle' ? idb.saved : idb.registry),
  set: vi.fn(async (key: string, value: unknown) => {
    if (idb.failNextSet) {
      idb.failNextSet = false;
      throw new Error('IndexedDB unavailable');
    }
    if (key === 'wyqd_obsidian_handle') idb.saved = value;
    else idb.registry = value;
  }),
}));

import { ObsidianFileSystemService } from './ObsidianFileSystemService';

function directory(name: string, failCreate = false): FileSystemDirectoryHandle {
  const children = new Map<string, FileSystemDirectoryHandle>();
  const handle = {
    kind: 'directory',
    name,
    isSameEntry: async (other: FileSystemHandle) => other === handle,
    getDirectoryHandle: vi.fn(async (child: string, options?: { create?: boolean }) => {
      if (failCreate && options?.create) throw new Error('Cannot create directory');
      if (!children.has(child)) {
        if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
        children.set(child, directory(child));
      }
      return children.get(child)!;
    }),
  } as unknown as FileSystemDirectoryHandle;
  return handle;
}

beforeEach(() => {
  idb.saved = null;
  idb.registry = null;
  idb.failNextSet = false;
});

describe('ObsidianFileSystemService connection commit', () => {
  it('keeps the prior connection when candidate initialization fails', async () => {
    const service = new ObsidianFileSystemService();
    const original = directory('Ownly');
    window.showDirectoryPicker = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(directory('Ownly', true));
    await expect(service.createLocalData()).resolves.toBe(true);
    await expect(service.createLocalData()).rejects.toThrow('Cannot create directory');
    expect(await service.getPortableDataRootHandle()).toBe(original);
    expect(idb.saved).toBe(original);
  });

  it('keeps the prior connection when persisting a prepared candidate fails', async () => {
    const service = new ObsidianFileSystemService();
    const original = directory('Ownly');
    window.showDirectoryPicker = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(directory('Ownly'));
    await service.createLocalData();
    idb.failNextSet = true;
    await expect(service.createLocalData()).rejects.toThrow('IndexedDB unavailable');
    expect(await service.getPortableDataRootHandle()).toBe(original);
    expect(idb.saved).toBe(original);
  });

  it('does not reconnect from a picker completed after disconnect', async () => {
    const service = new ObsidianFileSystemService();
    const original = directory('Ownly');
    let finishPicker!: (value: FileSystemDirectoryHandle) => void;
    window.showDirectoryPicker = vi.fn()
      .mockResolvedValueOnce(original)
      .mockImplementationOnce(() => new Promise<FileSystemDirectoryHandle>((resolve) => { finishPicker = resolve; }));
    await service.createLocalData();
    const pending = service.createLocalData();
    await service.disconnect();
    finishPicker(directory('Ownly'));
    await expect(pending).resolves.toBe(false);
    expect(service.isConnected()).toBe(false);
    expect(idb.saved).toBeNull();
  });

  it('does not let delayed auto-connect replace a newer picked directory', async () => {
    const service = new ObsidianFileSystemService();
    let releasePermission!: (value: PermissionState) => void;
    const stale = Object.assign(directory('Old'), {
      queryPermission: () => new Promise<PermissionState>((resolve) => { releasePermission = resolve; }),
    });
    idb.saved = stale;
    const pending = service.initAutoConnect();
    await vi.waitFor(() => expect(releasePermission).toBeTypeOf('function'));
    const chosen = directory('Ownly');
    window.showDirectoryPicker = vi.fn().mockResolvedValue(chosen);
    await expect(service.createLocalData()).resolves.toBe(true);
    releasePermission('granted');
    await expect(pending).resolves.toBe(false);
    expect(await service.getPortableDataRootHandle()).toBe(chosen);
    expect(idb.saved).toBe(chosen);
  });

  it('assigns stable distinct namespaces to physical roots, even with the same name', async () => {
    const first = directory('Ownly');
    const second = directory('Ownly');
    const service = new ObsidianFileSystemService();
    window.showDirectoryPicker = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(first);
    await service.createLocalData();
    const firstNamespace = await service.getStableWorkspaceNamespace();
    await service.createLocalData();
    const secondNamespace = await service.getStableWorkspaceNamespace();
    await service.createLocalData();
    expect(await service.getStableWorkspaceNamespace()).toBe(firstNamespace);
    expect(secondNamespace).not.toBe(firstNamespace);
  });
});
