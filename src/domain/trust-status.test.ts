import { describe, expect, it } from 'vitest';
import {
  collectTrustStatus,
  readTrustTimestamps,
  recordTrustTimestamp,
  type TrustStatusProbes,
} from './trust-status';

const HEALTHY: TrustStatusProbes = {
  installedMode: 'pwa',
  fileSystemAccess: true,
  folderAuthorization: 'granted',
  storagePersisted: true,
  storageEstimate: { quota: 1000, usage: 10 },
  workspaceRecovery: 'CONNECTED',
  lastBackupExportAt: '2026-09-01T00:00:00.000Z',
  lastBackupValidatedAt: '2026-09-02T00:00:00.000Z',
  online: true,
};

describe('collectTrustStatus (WS-2 Gate 1)', () => {
  it('covers the 10 governance rows in order', () => {
    const rows = collectTrustStatus(HEALTHY);
    expect(rows.map((row) => row.id)).toEqual([
      'app_mode',
      'fsa_support',
      'folder_authorization',
      'storage_persistence',
      'folder_health',
      'backup_verified',
      'offline_scope',
      'storage_boundary',
      'cloud_folder_guidance',
      'failure_actions',
    ]);
  });

  it('reports ok across the board for a healthy PWA with a verified backup', () => {
    const rows = collectTrustStatus(HEALTHY);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('app_mode')!.level).toBe('ok');
    expect(byId.get('fsa_support')!.level).toBe('ok');
    expect(byId.get('folder_authorization')!.level).toBe('ok');
    expect(byId.get('folder_health')!.level).toBe('ok');
    expect(byId.get('backup_verified')!.level).toBe('ok');
    expect(byId.get('failure_actions')!.level).toBe('ok');
    expect(byId.get('folder_authorization')!.action).toBeNull();
  });

  it('maps a missing folder and missing FSA to errors with recovery actions', () => {
    const rows = collectTrustStatus({
      ...HEALTHY,
      fileSystemAccess: false,
      folderAuthorization: 'none',
      workspaceRecovery: 'MISSING_FOLDER',
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('fsa_support')!.level).toBe('error');
    expect(byId.get('folder_authorization')!.action).toBe('choose-folder');
    expect(byId.get('folder_health')!.level).toBe('error');
    expect(byId.get('folder_health')!.action).toBe('reconnect');
  });

  it('maps prompt authorization to a reauthorize warning (restart-renewal case)', () => {
    const rows = collectTrustStatus({
      ...HEALTHY,
      folderAuthorization: 'prompt',
      workspaceRecovery: 'PERMISSION_REQUIRED',
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('folder_authorization')!.level).toBe('warn');
    expect(byId.get('folder_authorization')!.action).toBe('reauthorize');
    expect(byId.get('folder_health')!.action).toBe('reauthorize');
  });

  it('warns when a backup was exported but never validated', () => {
    const rows = collectTrustStatus({ ...HEALTHY, lastBackupValidatedAt: null });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('backup_verified')!.level).toBe('warn');
    expect(byId.get('backup_verified')!.action).toBe('validate-backup');
  });

  it('treats an unanswerable authorization state as needing re-authorization', () => {
    const rows = collectTrustStatus({ ...HEALTHY, folderAuthorization: 'unknown' });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('folder_authorization')!.level).toBe('warn');
    expect(byId.get('folder_authorization')!.action).toBe('reauthorize');
  });

  it('warns when offline', () => {
    const rows = collectTrustStatus({ ...HEALTHY, online: false });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('offline_scope')!.level).toBe('warn');
  });
});

describe('trust backup timestamps', () => {
  it('round-trips export/validated timestamps through a store', () => {
    const backing = new Map<string, string>();
    const store = {
      get: (key: string) => backing.get(key) ?? null,
      set: (key: string, value: string) => void backing.set(key, value),
    };
    expect(readTrustTimestamps(store)).toEqual({
      lastBackupExportAt: null,
      lastBackupValidatedAt: null,
    });
    recordTrustTimestamp(store, 'export', '2026-09-05T00:00:00.000Z');
    recordTrustTimestamp(store, 'validated', '2026-09-06T00:00:00.000Z');
    expect(readTrustTimestamps(store)).toEqual({
      lastBackupExportAt: '2026-09-05T00:00:00.000Z',
      lastBackupValidatedAt: '2026-09-06T00:00:00.000Z',
    });
  });
});
