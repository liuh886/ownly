import {
  calculateNetWorth,
  calculatePhysicalAcquisitionCost,
  calculateRecurringMonthlyCost,
} from '@/domain/calculations';
import type { Account, AccountSnapshot, ReviewEntry, WYQDObject } from '@/domain/types';
import { WYQD_DATA_DIRECTORIES } from './paths';
import type { WYQDReadonlyRepositoryAdapter, WYQDStoredEntity } from './repository';

export type WYQDDoctorSeverity = 'info' | 'warning' | 'error';

export type WYQDDoctorCheckId =
  | 'directory.presence'
  | 'entity.id.duplicate'
  | 'entity.schema.unsupported'
  | 'object.cost.negative'
  | 'snapshot.net_worth.mismatch'
  | 'review.target.missing';

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

function checkDuplicateIds(entities: readonly AnyStoredEntity[]): WYQDDoctorFinding[] {
  const seen = new Map<string, AnyStoredEntity>();
  const findings: WYQDDoctorFinding[] = [];

  for (const stored of entities) {
    const previous = seen.get(stored.entity.id);
    if (!previous) {
      seen.set(stored.entity.id, stored);
      continue;
    }

    findings.push({
      id: 'entity.id.duplicate',
      severity: 'error',
      message: `Duplicate Ownly entity id: ${stored.entity.id}`,
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

function checkSchemaVersions(entities: readonly AnyStoredEntity[]): WYQDDoctorFinding[] {
  return entities
    .filter((stored) => stored.entity.schema_version !== '0.1')
    .map((stored) => ({
      id: 'entity.schema.unsupported' as const,
      severity: 'warning' as const,
      message: `Unsupported Ownly schema version: ${stored.entity.schema_version}`,
      path: entityPath(stored),
      entityId: stored.entity.id,
      details: { schemaVersion: stored.entity.schema_version },
    }));
}

function checkObjectCosts(objects: readonly WYQDStoredEntity<WYQDObject>[]): WYQDDoctorFinding[] {
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
        message: `Object has negative calculated cost: ${object.title}`,
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
        message: `Snapshot net worth does not match balances: ${stored.entity.title}`,
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
): WYQDDoctorFinding[] {
  const objectIds = new Set(objects.map((stored) => stored.entity.id));

  return reviews
    .filter((stored) => stored.entity.target_id && !objectIds.has(stored.entity.target_id))
    .map((stored) => ({
      id: 'review.target.missing' as const,
      severity: 'warning' as const,
      message: `Review target is missing: ${stored.entity.title}`,
      path: entityPath(stored),
      entityId: stored.entity.id,
      details: { targetId: stored.entity.target_id },
    }));
}

async function checkDirectories(
  adapter: WYQDDoctorRepositoryAdapter,
): Promise<WYQDDoctorFinding[]> {
  if (!adapter.listDataDirectories) return [];

  const existingDirectories = new Set(await adapter.listDataDirectories());
  return Object.values(WYQD_DATA_DIRECTORIES)
    .filter((directory) => !existingDirectories.has(directory))
    .map((directory) => ({
      id: 'directory.presence' as const,
      severity: 'info' as const,
      message: `Ownly data directory is not present yet: ${directory}`,
      path: directory,
    }));
}

export async function runWYQDDoctor(
  adapter: WYQDDoctorRepositoryAdapter,
  checkedAt = new Date().toISOString(),
): Promise<WYQDDoctorReport> {
  const [objects, accounts, snapshots, reviews, directoryFindings] = await Promise.all([
    adapter.listObjects?.() ?? Promise.resolve([]),
    adapter.listAccounts?.() ?? Promise.resolve([]),
    adapter.listSnapshots?.() ?? Promise.resolve([]),
    adapter.listReviews?.() ?? Promise.resolve([]),
    checkDirectories(adapter),
  ]);

  const entities: AnyStoredEntity[] = [...objects, ...accounts, ...snapshots, ...reviews];
  const findings = [
    ...directoryFindings,
    ...checkDuplicateIds(entities),
    ...checkSchemaVersions(entities),
    ...checkObjectCosts(objects),
    ...checkSnapshotTotals(snapshots),
    ...checkReviewTargets(reviews, objects),
  ];

  return createReport(findings, checkedAt);
}
