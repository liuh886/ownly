/**
 * WS-2 Gate 1 — browser capability and data-safety status collectors.
 *
 * Pure and deterministic: every browser probe result is injected via
 * {@link TrustStatusProbes} so the collectors run identically on Web/PWA,
 * in tests, and (with an Obsidian-supplied probe set) in other runtimes.
 * UI copy lives in the component layer; rows carry stable ids only.
 */

export type TrustStatusLevel = 'ok' | 'warn' | 'error' | 'info';

export type TrustStatusAction =
  | 'choose-folder'
  | 'reconnect'
  | 'reauthorize'
  | 'export-backup'
  | 'validate-backup'
  | 'install-pwa';

export interface TrustStatusProbes {
  /** PWA installed vs plain browser tab. */
  installedMode: 'pwa' | 'tab' | 'unknown';
  /** File System Access API available. */
  fileSystemAccess: boolean;
  /**
   * Current read/write authorization for the connected folder.
   * 'none' means no folder has been chosen yet; 'unknown' means the
   * browser refused to answer (treat as needing re-authorization).
   */
  folderAuthorization: 'granted' | 'prompt' | 'denied' | 'none' | 'unknown';
  /** navigator.storage.persisted() result; null when the API is unavailable. */
  storagePersisted: boolean | null;
  /** navigator.storage.estimate() result; null when unavailable. */
  storageEstimate: { quota?: number; usage?: number } | null;
  /** Outcome of the workspace recovery check (folder health). */
  workspaceRecovery:
    | 'CONNECTED'
    | 'PERMISSION_REQUIRED'
    | 'RECONNECT_REQUIRED'
    | 'MISSING_FOLDER'
    | 'OFFLINE'
    | 'unknown';
  lastBackupExportAt: string | null;
  lastBackupValidatedAt: string | null;
  online: boolean;
}

export interface TrustStatusRow {
  id: string;
  level: TrustStatusLevel;
  /** Machine-readable facts for copy rendering (timestamps, counts). */
  facts: Record<string, string | number | boolean>;
  action: TrustStatusAction | null;
}

export const TRUST_BACKUP_EXPORT_KEY = 'ownly:last-backup-export-at';
export const TRUST_BACKUP_VALIDATED_KEY = 'ownly:last-backup-validated-at';

export interface TrustTimestampStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function readTrustTimestamps(store: TrustTimestampStore): {
  lastBackupExportAt: string | null;
  lastBackupValidatedAt: string | null;
} {
  return {
    lastBackupExportAt: store.get(TRUST_BACKUP_EXPORT_KEY),
    lastBackupValidatedAt: store.get(TRUST_BACKUP_VALIDATED_KEY),
  };
}

export function recordTrustTimestamp(
  store: TrustTimestampStore,
  kind: 'export' | 'validated',
  at = new Date().toISOString(),
): void {
  store.set(kind === 'export' ? TRUST_BACKUP_EXPORT_KEY : TRUST_BACKUP_VALIDATED_KEY, at);
}

/**
 * Collect the 10 Gate 1 rows in governance order
 * (PRODUCT_GOVERNANCE.md, Gate 1 bullet list + failure-mapping rule).
 */
export function collectTrustStatus(probes: TrustStatusProbes): TrustStatusRow[] {
  const rows: TrustStatusRow[] = [];

  // 1 — installed PWA versus browser tab.
  rows.push({
    id: 'app_mode',
    level: probes.installedMode === 'pwa' ? 'ok' : 'info',
    facts: { mode: probes.installedMode },
    action: probes.installedMode === 'tab' ? 'install-pwa' : null,
  });

  // 2 — local-folder API support.
  rows.push({
    id: 'fsa_support',
    level: probes.fileSystemAccess ? 'ok' : 'error',
    facts: { supported: probes.fileSystemAccess },
    action: null,
  });

  // 3 — current read/write authorization state (+ restart renewal maps here).
  rows.push({
    id: 'folder_authorization',
    level:
      probes.folderAuthorization === 'granted'
        ? 'ok'
        : probes.folderAuthorization === 'none'
          ? 'info'
          : probes.folderAuthorization === 'denied'
            ? 'error'
            : 'warn',
    facts: { state: probes.folderAuthorization },
    action:
      probes.folderAuthorization === 'none'
        ? 'choose-folder'
        : probes.folderAuthorization === 'granted'
          ? null
          : probes.folderAuthorization === 'denied'
            ? 'reconnect'
            : 'reauthorize',
  });

  // 4 — persistence/storage status where available.
  rows.push({
    id: 'storage_persistence',
    level:
      probes.storagePersisted === true
        ? 'ok'
        : probes.storagePersisted === false
          ? 'warn'
          : 'info',
    facts: {
      persisted: probes.storagePersisted ?? 'unknown',
      quota: probes.storageEstimate?.quota ?? 'unknown',
      usage: probes.storageEstimate?.usage ?? 'unknown',
    },
    action: null,
  });

  // 5 — connected data-folder health.
  rows.push({
    id: 'folder_health',
    level:
      probes.workspaceRecovery === 'CONNECTED'
        ? 'ok'
        : probes.workspaceRecovery === 'OFFLINE' || probes.workspaceRecovery === 'unknown'
          ? 'info'
          : 'error',
    facts: { state: probes.workspaceRecovery },
    action:
      probes.workspaceRecovery === 'PERMISSION_REQUIRED'
        ? 'reauthorize'
        : probes.workspaceRecovery === 'RECONNECT_REQUIRED' ||
            probes.workspaceRecovery === 'MISSING_FOLDER'
          ? 'reconnect'
          : null,
  });

  // 6 — most recent verified backup status.
  const hasValidation = probes.lastBackupValidatedAt !== null;
  const hasExport = probes.lastBackupExportAt !== null;
  rows.push({
    id: 'backup_verified',
    level: hasValidation ? 'ok' : hasExport ? 'warn' : 'warn',
    facts: {
      validatedAt: probes.lastBackupValidatedAt ?? 'never',
      exportedAt: probes.lastBackupExportAt ?? 'never',
    },
    action: hasExport && !hasValidation ? 'validate-backup' : 'export-backup',
  });

  // 7 — precise offline capabilities and limitations.
  rows.push({
    id: 'offline_scope',
    level: probes.online ? 'info' : 'warn',
    facts: { online: probes.online },
    action: null,
  });

  // 8 — the user-controlled storage boundary.
  rows.push({ id: 'storage_boundary', level: 'info', facts: {}, action: null });

  // 9 — personal cloud folder guidance (keep offline + single provider).
  rows.push({ id: 'cloud_folder_guidance', level: 'info', facts: {}, action: null });

  // 10 — failure-to-action mapping is structural: every error/warn row above
  // carries an action except purely informational probes. This row reports
  // whether any row still lacks a recovery action (governance rule check).
  const unactionable = rows.filter(
    (row) => (row.level === 'error' || row.level === 'warn') && row.action === null,
  );
  rows.push({
    id: 'failure_actions',
    level: unactionable.length === 0 ? 'ok' : 'warn',
    facts: { missing: unactionable.map((row) => row.id).join(',') },
    action: null,
  });

  return rows;
}
