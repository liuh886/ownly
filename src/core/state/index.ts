/**
 * P4: 统一状态 — connection/sync/workspace/userPreference 单源
 * 组件仅 useSyncExternalStore，不自建 useState 泛滥
 */
export type ConnectionState = 'connected' | 'missing' | 'permission';
export type SyncState = 'idle' | 'syncing' | 'failed';
export interface WorkspaceState { vaultPath: string; connection: ConnectionState; sync: SyncState; }
export const workspaceState: WorkspaceState = { vaultPath: '', connection: 'missing', sync: 'idle' };
