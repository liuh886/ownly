import { describe, expect, it } from 'vitest';
import { checkWorkspaceRecovery } from './workspace-recovery';

/**
 * Controlled test double for the File System Access lifecycle (QUALITY_BASELINE
 * Major risk): permission loss, picker cancellation, moved/expired handles, and
 * offline recovery must map to deterministic states rather than raw browser
 * errors.
 */

interface FakeHandleOptions {
  requestPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
  values?: () => AsyncIterableIterator<unknown>;
}

function handle(options: FakeHandleOptions = {}): FileSystemDirectoryHandle {
  return {
    requestPermission: options.requestPermission,
    values: options.values ?? (async function* () { yield { kind: 'file' }; }),
  } as unknown as FileSystemDirectoryHandle;
}

describe('checkWorkspaceRecovery', () => {
  it('reports OFFLINE before probing the handle', async () => {
    const result = await checkWorkspaceRecovery(handle(), false);
    expect(result.state).toBe('OFFLINE');
  });

  it('asks to reconnect when no folder handle exists', async () => {
    const result = await checkWorkspaceRecovery(null, true);
    expect(result.state).toBe('RECONNECT_REQUIRED');
    expect(result.actionLabel).toBe('Reconnect');
  });

  it('maps a denied permission prompt to PERMISSION_REQUIRED', async () => {
    const result = await checkWorkspaceRecovery(
      handle({ requestPermission: async () => 'denied' }),
      true,
    );
    expect(result.state).toBe('PERMISSION_REQUIRED');
    expect(result.actionLabel).toBe('Allow');
  });

  it('maps an unresolved (prompt) permission to PERMISSION_REQUIRED', async () => {
    const result = await checkWorkspaceRecovery(
      handle({ requestPermission: async () => 'prompt' }),
      true,
    );
    expect(result.state).toBe('PERMISSION_REQUIRED');
  });

  it('reports CONNECTED when permission is granted and the folder is readable', async () => {
    const result = await checkWorkspaceRecovery(
      handle({ requestPermission: async () => 'granted' }),
      true,
    );
    expect(result.state).toBe('CONNECTED');
  });

  it('reports CONNECTED for legacy handles without a permission API', async () => {
    const result = await checkWorkspaceRecovery(handle(), true);
    expect(result.state).toBe('CONNECTED');
  });

  it('maps a moved or expired handle to MISSING_FOLDER', async () => {
    const result = await checkWorkspaceRecovery(
      handle({
        values: () => ({
          [Symbol.asyncIterator]() { return this; },
          next: async () => { throw new Error('NotFoundError: folder moved'); },
        } as AsyncIterableIterator<unknown>),
      }),
      true,
    );
    expect(result.state).toBe('MISSING_FOLDER');
    expect(result.actionLabel).toBe('Reconnect');
  });

  it('maps a cancelled picker (AbortError) to MISSING_FOLDER', async () => {
    const result = await checkWorkspaceRecovery(
      handle({
        requestPermission: async () => {
          throw new Error('AbortError: user cancelled');
        },
      }),
      true,
    );
    expect(result.state).toBe('MISSING_FOLDER');
  });

  it('maps an unexpected access failure to RECONNECT_REQUIRED with the reason', async () => {
    const result = await checkWorkspaceRecovery(
      handle({
        requestPermission: async () => {
          throw new Error('device disconnected');
        },
      }),
      true,
    );
    expect(result.state).toBe('RECONNECT_REQUIRED');
    expect(result.message).toContain('device disconnected');
  });
});
