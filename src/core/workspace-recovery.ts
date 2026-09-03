/**
 * Risk 1: PWA File System Access 生命周期 — WorkspaceRecoveryFlow
 * 状态：CONNECTED | PERMISSION_REQUIRED | RECONNECT_REQUIRED | MISSING_FOLDER | OFFLINE
 * 覆盖：permission denied / handle expired / folder moved / sync provider offline
 */
export type RecoveryState =
  | 'CONNECTED'
  | 'PERMISSION_REQUIRED'
  | 'RECONNECT_REQUIRED'
  | 'MISSING_FOLDER'
  | 'OFFLINE';

export interface RecoveryResult {
  state: RecoveryState;
  message: string;
  actionLabel?: string;
}

export async function checkWorkspaceRecovery(
  handle: FileSystemDirectoryHandle | null,
  isOnline: boolean,
): Promise<RecoveryResult> {
  if (!isOnline) {
    return { state: 'OFFLINE', message: 'Sync provider offline — working offline, changes will sync when online.' };
  }
  if (!handle) {
    return { state: 'RECONNECT_REQUIRED', message: 'No folder selected — please reconnect your Ownly folder.', actionLabel: 'Reconnect' };
  }
  try {
    if ((handle as unknown as { requestPermission?: unknown }).requestPermission) {
      const perm = await (handle as unknown as { requestPermission: (o: { mode: 'readwrite' }) => Promise<PermissionState> }).requestPermission({ mode: 'readwrite' });
      if (perm === 'denied') return { state: 'PERMISSION_REQUIRED', message: 'Permission denied — please allow access to your Ownly folder.', actionLabel: 'Allow' };
      if (perm !== 'granted') return { state: 'PERMISSION_REQUIRED', message: 'Permission required — please allow access.', actionLabel: 'Allow' };
    }
    // Try to read to detect moved/deleted folder
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _item of (handle as unknown as { values: () => AsyncIterableIterator<unknown> }).values()) { break; }
    return { state: 'CONNECTED', message: 'Connected' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/NotFound|NotAllowed|Abort/i.test(msg)) {
      return { state: 'MISSING_FOLDER', message: 'Folder moved or not found — please reconnect.', actionLabel: 'Reconnect' };
    }
    return { state: 'RECONNECT_REQUIRED', message: `Access failed: ${msg}`, actionLabel: 'Reconnect' };
  }
}
