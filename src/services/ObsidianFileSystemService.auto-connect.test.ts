/**
 * `initAutoConnect` decides whether the header may claim "data folder connected".
 *
 * That claim is only allowed to be made when the restored handle can actually be
 * read. Permission survives a folder being moved, renamed, or dropped by a sync
 * provider, and a handle that grants permission but reads nothing looks exactly
 * like a folder full of records that vanished — which is what users were shown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => ({ handle: null as unknown }));

vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => idb.handle),
  set: vi.fn(async () => undefined),
}));

import { ObsidianFileSystemService } from './ObsidianFileSystemService';

interface FakeHandleOptions {
  permission?: PermissionState;
  requestResult?: PermissionState;
  readable?: boolean;
  supportsValues?: boolean;
}

function fakeHandle({
  permission = 'granted',
  requestResult = 'granted',
  readable = true,
  supportsValues = true,
}: FakeHandleOptions = {}) {
  return {
    kind: 'directory',
    name: 'Ownly',
    queryPermission: async () => permission,
    requestPermission: async () => requestResult,
    get values() {
      if (!supportsValues) return undefined;
      return async function* values() {
        if (!readable) throw new DOMException('entry not found', 'NotFoundError');
        yield { kind: 'file', name: 'ledger.md' };
      };
    },
  };
}

beforeEach(() => {
  idb.handle = null;
});

describe('ObsidianFileSystemService.initAutoConnect', () => {
  it('connects a stored handle that is readable', async () => {
    idb.handle = fakeHandle();

    await expect(new ObsidianFileSystemService().initAutoConnect()).resolves.toBe(true);
  });

  it('refuses a handle whose folder can no longer be read', async () => {
    idb.handle = fakeHandle({ readable: false });

    // Permission is still granted. Reporting `true` here is what let the app
    // claim a connection over an empty screen.
    await expect(new ObsidianFileSystemService().initAutoConnect()).resolves.toBe(false);
  });

  it('asks for permission when the stored handle is only on prompt', async () => {
    const handle = fakeHandle({ permission: 'prompt', requestResult: 'granted' });
    idb.handle = handle;

    await expect(new ObsidianFileSystemService().initAutoConnect()).resolves.toBe(true);
  });

  it('refuses when permission is denied', async () => {
    idb.handle = fakeHandle({ permission: 'denied', requestResult: 'denied' });

    await expect(new ObsidianFileSystemService().initAutoConnect()).resolves.toBe(false);
  });

  it('refuses when there is no stored handle at all', async () => {
    await expect(new ObsidianFileSystemService().initAutoConnect()).resolves.toBe(false);
  });

  it('still connects when the platform cannot enumerate entries', async () => {
    idb.handle = fakeHandle({ supportsValues: false });

    // No probe available is not evidence of a broken folder, so this must not
    // turn into a false "disconnected".
    await expect(new ObsidianFileSystemService().initAutoConnect()).resolves.toBe(true);
  });

  it('does not resurrect a stored connection after disconnect while permission is pending', async () => {
    let releasePermission!: (value: PermissionState) => void;
    idb.handle = {
      ...fakeHandle(),
      queryPermission: () => new Promise<PermissionState>((resolve) => { releasePermission = resolve; }),
    };
    const service = new ObsidianFileSystemService();
    const pending = service.initAutoConnect();
    await vi.waitFor(() => expect(releasePermission).toBeTypeOf('function'));
    await service.disconnect();
    releasePermission('granted');
    await expect(pending).resolves.toBe(false);
    expect(service.isConnected()).toBe(false);
  });
});
