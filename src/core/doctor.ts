import {
  calculateNetWorth,
  calculatePhysicalAcquisitionCost,
  calculateRecurringMonthlyCost,
} from '@/domain/calculations';
import type { Account, AccountSnapshot, ReviewEntry, WYQDObject } from '@/domain/types';
import { joinWYQDPath, WYQD_DATA_ROOT } from './paths';
import type { WYQDReadonlyRepositoryAdapter, WYQDStoredEntity } from './repository';
import type { WYQDTranslationKey } from './i18n';

type TranslateFn = (key: WYQDTranslationKey) => string;

export type WYQDDoctorSeverity = 'info' | 'warning' | 'error';

export type WYQDDoctorCheckId =
  | 'directory.presence'
  | 'entity.id.duplicate'
  | 'entity.schema.unsupported'
  | 'object.cost.negative'
  | 'snapshot.net_worth.mismatch'
  | 'review.target.missing'
  | 'object.review_ref.missing'
  | 'object.status_date.inconsistent'
  | 'entity.date.chronology'
  | 'snapshot.stale';

export interface WYQDDoctorFinding {
  id: WYQDDoctorCheckId;
  severity: WYQDDoctorSeverity;
  message: string;
  path?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export interface WYQDDoctorReport {
  checkedAt: string;
  findings: WYQDDoctorFinding[];
  summary: Record<WYQDDoctorSeverity, number>;
}

export interface WYQDDoctorRepositoryAdapter
  extends Partial<WYQDReadonlyRepositoryAdapter> {
  listDataDirectories?: () => Promise<readonly string[]>;
  getDataFolderPath?: () => string;
}

type AnyStoredEntity =
  | WYQDStoredEntity<WYQDObject>
  | WYQDStoredEntity<Account>
  | WYQDStoredEntity<AccountSnapshot>
  | WYQDStoredEntity<ReviewEntry>;

function createReport(findings: WYQDDoctorFinding[], checkedAt = new Date().toISOString()): WYQDDoctorReport {
  return {
    checkedAt,
    findings,
    summary: {
      info: findings.filter((finding) => finding.severity === 'info').length,
      warning: findings.filter((finding) => finding.severity === 'warning').length,
      error: findings.filter((finding) => finding.severity === 'error').length,
    },
  };
}

function entityPath(stored: { fileName: string; path?: string }): string | undefined {
  return stored.path ?? stored.fileName;
}

function checkDuplicateIds(entities: readonly AnyStoredEntity[], t?: TranslateFn): WYQDDoctorFinding[] {
  const seen = new Map<string, AnyStoredEntity>();
  const findings: WYQDDoctorFinding[] = [];

  for (const stored of entities) {
    const previous = seen.get(stored.entity.id);
    if (!previous) {
      seen.set(stored.entity.id, stored);
      continue;
    }

    const msg = t
      ? t('doctorDuplicateId').replace('{id}', stored.entity.id)
      : `Duplicate Ownly entity id: ${stored.entity.id}`;
    findings.push({
      id: 'entity.id.duplicate',
      severity: 'error',
      message: msg,
      path: entityPath(stored),
      entityId: stored.entity.id,
      details: {
        firstPath: entityPath(previous),
        duplicatePath: entityPath(stored),
      },
    });
  }

  return findings;
}

function checkSchemaVersions(entities: readonly AnyStoredEntity[], t?: TranslateFn): WYQDDoctorFinding[] {
  return entities
    .filter((stored) => stored.entity.schema_version !== '0.1')
    .map((stored) => ({
      id: 'entity.schema.unsupported' as const,
      severity: 'warning' as const,
      message: t
        ? t('doctorUnsupportedSchema').replace('{version}', String(stored.entity.schema_version))
        : `Unsupported Ownly schema version: ${stored.entity.schema_version}`,
      path: entityPath(stored),
      entityId: stored.entity.id,
      details: { schemaVersion: stored.entity.schema_version },
    }));
}

function checkObjectCosts(objects: readonly WYQDStoredEntity<WYQDObject>[], t?: TranslateFn): WYQDDoctorFinding[] {
  const findings: WYQDDoctorFinding[] = [];

  for (const stored of objects) {
    const object = stored.entity;
    const cost =
      object.object_type === 'recurring_cost'
        ? calculateRecurringMonthlyCost(object)
        : object.object_type === 'physical'
          ? calculatePhysicalAcquisitionCost(object)
          : object.actual_total ?? object.budget_total ?? 0;

    if (cost < 0) {
      findings.push({
        id: 'object.cost.negative',
        severity: 'warning',
        message: t
          ? t('doctorNegativeCost').replace('{title}', object.title)
          : `Object has negative calculated cost: ${object.title}`,
        path: entityPath(stored),
        entityId: object.id,
        details: { cost },
      });
    }
  }

  return findings;
}

function checkSnapshotTotals(
  snapshots: readonly WYQDStoredEntity<AccountSnapshot>[],
  t?: TranslateFn,
): WYQDDoctorFinding[] {
  const findings: WYQDDoctorFinding[] = [];

  for (const stored of snapshots) {
    const calculated = calculateNetWorth(stored.entity);
    if (
      stored.entity.net_worth !== undefined &&
      Math.abs((stored.entity.net_worth ?? 0) - (calculated.net_worth ?? 0)) > 0.01
    ) {
      findings.push({
        id: 'snapshot.net_worth.mismatch',
        severity: 'warning',
        message: t
          ? t('doctorNetWorthMismatch').replace('{title}', stored.entity.title)
          : `Snapshot net worth does not match balances: ${stored.entity.title}`,
        path: entityPath(stored),
        entityId: stored.entity.id,
        details: {
          storedNetWorth: stored.entity.net_worth,
          calculatedNetWorth: calculated.net_worth,
        },
      });
    }
  }

  return findings;
}

function checkReviewTargets(
  reviews: readonly WYQDStoredEntity<ReviewEntry>[],
  objects: readonly WYQDStoredEntity<WYQDObject>[],
  t?: TranslateFn,
): WYQDDoctorFinding[] {
  const objectIds = new Set(objects.map((stored) => stored.entity.id));

  return reviews
    .filter((stored) => stored.entity.target_id && !objectIds.has(stored.entity.target_id))
    .map((stored) => ({
      id: 'review.target.missing' as const,
      severity: 'warning' as const,
      message: t
        ? t('doctorReviewTargetMissing').replace('{title}', stored.entity.title)
        : `Review target is missing: ${stored.entity.title}`,
      path: entityPath(stored),
      entityId: stored.entity.id,
      details: { targetId: stored.entity.target_id },
    }));
}

function checkReviewRefIntegrity(
  objects: readonly WYQDStoredEntity<WYQDObject>[],
  reviews: readonly WYQDStoredEntity<ReviewEntry>[],
  t?: TranslateFn,
): WYQDDoctorFinding[] {
  const reviewIds = new Set(reviews.map((stored) => stored.entity.id));
  const findings: WYQDDoctorFinding[] = [];

  for (const stored of objects) {
    const ref = stored.entity.review_ref;
    if (ref && !reviewIds.has(ref)) {
      findings.push({
        id: 'object.review_ref.missing',
        severity: 'warning',
        message: t
          ? t('doctorReviewRefMissing').replace('{title}', stored.entity.title)
          : `Object references nonexistent review: ${stored.entity.title}`,
        path: entityPath(stored),
        entityId: stored.entity.id,
        details: { reviewRef: ref },
      });
    }
  }

  return findings;
}

function checkStatusDateConsistency(
  objects: readonly WYQDStoredEntity<WYQDObject>[],
  t?: TranslateFn,
): WYQDDoctorFinding[] {
  const findings: WYQDDoctorFinding[] = [];

  for (const stored of objects) {
    const obj = stored.entity;

    if (obj.object_type === 'physical') {
      if ((obj.status === 'purchased' || obj.status === 'using') && !obj.purchased_at) {
        findings.push({
          id: 'object.status_date.inconsistent',
          severity: 'warning',
          message: t
            ? t('doctorStatusDateInconsistent').replace('{title}', obj.title).replace('{status}', obj.status)
            : `Physical object "${obj.title}" has status "${obj.status}" but no purchased_at date`,
          path: entityPath(stored),
          entityId: obj.id,
        });
      }
      if ((obj.status === 'idle' || obj.status === 'transferred' || obj.status === 'discarded') && !obj.ended_at) {
        findings.push({
          id: 'object.status_date.inconsistent',
          severity: 'warning',
          message: t
            ? t('doctorStatusDateInconsistent').replace('{title}', obj.title).replace('{status}', obj.status)
            : `Physical object "${obj.title}" has status "${obj.status}" but no ended_at date`,
          path: entityPath(stored),
          entityId: obj.id,
        });
      }
    }

    if (obj.object_type === 'recurring_cost') {
      if (obj.status === 'active' && (!obj.billing_amount || !obj.billing_cycle)) {
        findings.push({
          id: 'object.status_date.inconsistent',
          severity: 'warning',
          message: t
            ? t('doctorStatusDateInconsistent').replace('{title}', obj.title).replace('{status}', obj.status)
            : `Recurring cost "${obj.title}" is active but missing billing_amount or billing_cycle`,
          path: entityPath(stored),
          entityId: obj.id,
        });
      }
    }

    if (obj.object_type === 'one_time_experience') {
      if (obj.status === 'completed' && !obj.ended_at) {
        findings.push({
          id: 'object.status_date.inconsistent',
          severity: 'warning',
          message: t
            ? t('doctorStatusDateInconsistent').replace('{title}', obj.title).replace('{status}', obj.status)
            : `Experience "${obj.title}" is completed but has no ended_at date`,
          path: entityPath(stored),
          entityId: obj.id,
        });
      }
    }
  }

  return findings;
}

function checkDateChronology(
  entities: readonly AnyStoredEntity[],
  t?: TranslateFn,
): WYQDDoctorFinding[] {
  const findings: WYQDDoctorFinding[] = [];

  for (const stored of entities) {
    const e = stored.entity;
    if (e.created_at && e.updated_at && e.created_at > e.updated_at) {
      findings.push({
        id: 'entity.date.chronology',
        severity: 'warning',
        message: t
          ? t('doctorDateChronology').replace('{title}', e.title)
          : `Entity "${e.title}" has created_at after updated_at`,
        path: entityPath(stored),
        entityId: e.id,
        details: { created_at: e.created_at, updated_at: e.updated_at },
      });
    }
  }

  return findings;
}

function checkSnapshotStaleness(
  snapshots: readonly WYQDStoredEntity<AccountSnapshot>[],
  t?: TranslateFn,
): WYQDDoctorFinding[] {
  if (snapshots.length === 0) return [];

  const sorted = [...snapshots].sort((a, b) =>
    (b.entity.snapshot_at || '').localeCompare(a.entity.snapshot_at || ''),
  );
  const latest = sorted[0];
  const latestDate = latest.entity.snapshot_at;
  if (!latestDate) return [];

  const daysSince = Math.floor(
    (Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSince > 30) {
    return [{
      id: 'snapshot.stale',
      severity: 'info',
      message: t
        ? t('doctorSnapshotStale').replace('{days}', String(daysSince)).replace('{date}', latestDate)
        : `Latest snapshot is ${daysSince} days old (${latestDate}). Consider recording a new one.`,
      path: entityPath(latest),
      entityId: latest.entity.id,
      details: { latestDate, daysSince },
    }];
  }

  return [];
}

async function checkDirectories(
  adapter: WYQDDoctorRepositoryAdapter,
  t?: TranslateFn,
): Promise<WYQDDoctorFinding[]> {
  if (!adapter.listDataDirectories) return [];

  const existingDirectories = new Set(await adapter.listDataDirectories());
  const root = adapter.getDataFolderPath?.() || WYQD_DATA_ROOT;
  const expectedDirectories = [
    root,
    joinWYQDPath(root, 'Objects'),
    joinWYQDPath(root, 'Accounts'),
    joinWYQDPath(root, 'Snapshots'),
    joinWYQDPath(root, 'Reviews'),
    joinWYQDPath(root, 'Archive'),
    joinWYQDPath(root, 'Archive', 'Objects'),
    joinWYQDPath(root, 'Archive', 'Accounts'),
    joinWYQDPath(root, 'Archive', 'Snapshots'),
    joinWYQDPath(root, 'Archive', 'Reviews'),
  ];

  return expectedDirectories
    .filter((directory) => !existingDirectories.has(directory))
    .map((directory) => ({
      id: 'directory.presence' as const,
      severity: 'info' as const,
      message: t
        ? t('doctorDirectoryMissing').replace('{path}', directory)
        : `Ownly data directory is not present yet: ${directory}`,
      path: directory,
    }));
}

export async function runWYQDDoctor(
  adapter: WYQDDoctorRepositoryAdapter,
  checkedAt = new Date().toISOString(),
  t?: TranslateFn,
): Promise<WYQDDoctorReport> {
  const dataFolderPath = adapter.getDataFolderPath?.() || WYQD_DATA_ROOT;
  console.log('Ownly Doctor: getDataFolderPath =', adapter.getDataFolderPath?.());
  console.log('Ownly Doctor: dataFolderPath =', dataFolderPath);

  const [objects, accounts, snapshots, reviews, directoryFindings] = await Promise.all([
    adapter.listObjects?.() ?? Promise.resolve([]),
    adapter.listAccounts?.() ?? Promise.resolve([]),
    adapter.listSnapshots?.() ?? Promise.resolve([]),
    adapter.listReviews?.() ?? Promise.resolve([]),
    checkDirectories(adapter, t),
  ]);

  const entities: AnyStoredEntity[] = [...objects, ...accounts, ...snapshots, ...reviews];

  // Add data folder path info as first finding
  const pathInfo: WYQDDoctorFinding = {
    id: 'directory.presence',
    severity: 'info',
    message: `Data folder: ${dataFolderPath}`,
    path: dataFolderPath,
    details: {
      objects: objects.length,
      accounts: accounts.length,
      snapshots: snapshots.length,
      reviews: reviews.length,
      total: entities.length,
    },
  };

  const findings = [
    pathInfo,
    ...directoryFindings,
    ...checkDuplicateIds(entities, t),
    ...checkSchemaVersions(entities, t),
    ...checkObjectCosts(objects, t),
    ...checkSnapshotTotals(snapshots, t),
    ...checkReviewTargets(reviews, objects, t),
    ...checkReviewRefIntegrity(objects, reviews, t),
    ...checkStatusDateConsistency(objects, t),
    ...checkDateChronology(entities, t),
    ...checkSnapshotStaleness(snapshots, t),
  ];

  return createReport(findings, checkedAt);
}
