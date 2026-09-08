import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWorkspaceId } from './workspaceIdentity';

function stubStorage(impl?: Partial<Storage>) {
  let store: Record<string, string> = {};
  const storage: Storage = {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      store = {};
    },
    getItem: (k: string) => store[k] ?? null,
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => {
      delete store[k];
    },
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    ...impl,
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('getWorkspaceId', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubStorage();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('workspace-test-id');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('generates an ID on first call', () => {
    expect(getWorkspaceId()).toBe('workspace-test-id');
  });

  it('returns the same ID on subsequent calls', () => {
    const first = getWorkspaceId();

    expect(getWorkspaceId()).toBe(first);
  });

  it('generates a new ID after localStorage is cleared', () => {
    const first = getWorkspaceId();
    (localStorage as Storage).clear();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('workspace-new-id');

    expect(getWorkspaceId()).not.toBe(first);
    expect(getWorkspaceId()).toBe('workspace-new-id');
  });

  it('falls back when randomUUID is unavailable (non-secure contexts)', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('Not supported');
    });
    const id = getWorkspaceId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getWorkspaceId()).toBe(id);
  });

  it('still returns a session id when storage throws (locked-down privacy mode)', () => {
    stubStorage({
      getItem: () => {
        throw new Error('Denied');
      },
      setItem: () => {
        throw new Error('Denied');
      },
    });

    expect(() => getWorkspaceId()).not.toThrow();
    expect(typeof getWorkspaceId()).toBe('string');
  });

  it('ignores corrupt stored values', () => {
    (localStorage as Storage).setItem('ownly_workspace_id', 'x');
    expect(getWorkspaceId()).toBe('workspace-test-id');
  });
});
