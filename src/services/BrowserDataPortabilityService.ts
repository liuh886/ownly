'use client';

import {
  createOwnlyBackup,
  migrateOwnlyBackup,
  parseOwnlyBackup,
  planOwnlyRestore,
  restoreOwnlyBackup,
  serializeOwnlyBackup,
  validateOwnlyBackup,
  type MigrationReport,
  type OwnlyBackupBundle,
  type RestorePlan,
  type RestoreResult,
} from '@/core/data-portability';
import { WYQD_CORE_TARGET_VERSION } from '@/core/runtime';
import {
  browserOwnlyTextFileAdapter,
  BrowserOwnlyTextFileAdapter,
} from './BrowserOwnlyTextFileAdapter';

export interface BrowserBackupInspection {
  bundle: OwnlyBackupBundle;
  plan: RestorePlan;
}

export interface BrowserMigrationInspection {
  original: OwnlyBackupBundle;
  migration: MigrationReport;
}

function runtimeSource(): 'web' | 'pwa' {
  return typeof window !== 'undefined'
    && window.matchMedia('(display-mode: standalone)').matches
    ? 'pwa'
    : 'web';
}

function timestampToken(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function downloadText(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class BrowserDataPortabilityService {
  constructor(
    private readonly adapter: BrowserOwnlyTextFileAdapter = browserOwnlyTextFileAdapter,
  ) {}

  async exportBackup(now = new Date()): Promise<OwnlyBackupBundle> {
    const bundle = await createOwnlyBackup(
      this.adapter,
      { runtime: runtimeSource(), ownly_version: WYQD_CORE_TARGET_VERSION },
      now,
    );
    downloadText(
      serializeOwnlyBackup(bundle),
      `ownly-backup-${timestampToken(now)}.json`,
    );
    return bundle;
  }

  async readBackupFile(file: File): Promise<OwnlyBackupBundle> {
    const bundle = parseOwnlyBackup(await file.text());
    const validation = await validateOwnlyBackup(bundle);
    if (!validation.valid) {
      throw new Error(
        validation.issues.map((issue) => issue.message).join('; ') || 'Backup validation failed.',
      );
    }
    return bundle;
  }

  async inspectRestore(bundle: OwnlyBackupBundle): Promise<BrowserBackupInspection> {
    return {
      bundle,
      plan: await planOwnlyRestore(bundle, this.adapter, 'reject'),
    };
  }

  async restore(
    bundle: OwnlyBackupBundle,
    overwrite: boolean,
    now = new Date(),
  ): Promise<RestoreResult> {
    let safetyBackup: OwnlyBackupBundle | undefined;
    if (overwrite) {
      const overwritePlan = await planOwnlyRestore(bundle, this.adapter, 'overwrite');
      if (overwritePlan.overwrites > 0) {
        safetyBackup = await createOwnlyBackup(
          this.adapter,
          { runtime: 'restore-safety', ownly_version: WYQD_CORE_TARGET_VERSION },
          now,
        );
        downloadText(
          serializeOwnlyBackup(safetyBackup),
          `ownly-safety-backup-${timestampToken(now)}.json`,
        );
      }
    }

    return restoreOwnlyBackup(bundle, this.adapter, {
      collisionPolicy: overwrite ? 'overwrite' : 'reject',
      safetyBackup,
    });
  }

  async inspectMigration(now = new Date()): Promise<BrowserMigrationInspection> {
    const original = await createOwnlyBackup(
      this.adapter,
      { runtime: runtimeSource(), ownly_version: WYQD_CORE_TARGET_VERSION },
      now,
    );
    return {
      original,
      migration: await migrateOwnlyBackup(original),
    };
  }

  async applyMigration(
    inspection: BrowserMigrationInspection,
    now = new Date(),
  ): Promise<RestoreResult> {
    if (inspection.migration.applied_steps.length === 0) {
      throw new Error('Ownly data is already on the current schema version.');
    }
    downloadText(
      serializeOwnlyBackup(inspection.original),
      `ownly-pre-migration-${timestampToken(now)}.json`,
    );
    return restoreOwnlyBackup(
      inspection.migration.migrated_bundle,
      this.adapter,
      {
        collisionPolicy: 'overwrite',
        safetyBackup: inspection.original,
      },
    );
  }
}

export const browserDataPortabilityService = new BrowserDataPortabilityService();
