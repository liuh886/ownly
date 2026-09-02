import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getWorkspaceId } from './workspaceIdentity';

describe('getWorkspaceId', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('workspace-test-id');
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
    localStorage.clear();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('workspace-new-id');

    expect(getWorkspaceId()).not.toBe(first);
    expect(getWorkspaceId()).toBe('workspace-new-id');
  });
});
