/**
 * Schema Migration Framework
 *
 * Migrations transform entities from one schema version to the next.
 * Each migration is a pure function: (oldEntity) => newEntity.
 * The runner chains migrations sequentially: v0.1 → v0.2 → v1.0 → ...
 */

import { placeV0_1_to_V0_2 } from './place_v0.1_to_v0.2';
import { tripV0_1_to_V0_2 } from './trip_v0.1_to_v0.2';
import { expenseV0_1_to_V0_2 } from './expense_v0.1_to_v0.2';

export type MigrationVersion = '0.1' | '0.2' | '1.0';

export type MigrationEntity = Record<string, unknown>;

export interface Migration {
  readonly from: MigrationVersion;
  readonly to: MigrationVersion;
  readonly transform: (entity: MigrationEntity) => MigrationEntity;
}

/**
 * Ordered list of all migrations. Each entry transforms one version step.
 * Add new migrations at the end.
 */
export const MIGRATIONS: Migration[] = [
  placeV0_1_to_V0_2,
  tripV0_1_to_V0_2,
  expenseV0_1_to_V0_2,
];

/**
 * Get the ordered migration path from `fromVersion` to `toVersion`.
 * Returns empty array if already at target version.
 */
export function getMigrationPath(
  fromVersion: string,
  toVersion: string,
): Migration[] {
  const path: Migration[] = [];
  let current = fromVersion;
  for (const migration of MIGRATIONS) {
    if (current === toVersion) break;
    if (migration.from === current) {
      path.push(migration);
      current = migration.to;
    }
  }
  return path;
}

/**
 * Run all migrations on an entity, returning the migrated result.
 * If entity is already at or beyond targetVersion, returns it unchanged.
 */
export function migrateEntity<T extends Record<string, unknown>>(
  entity: T,
  targetVersion: string,
): T {
  const currentVersion = entity.schema_version as string | undefined;
  if (!currentVersion || currentVersion === targetVersion) return entity;

  const path = getMigrationPath(currentVersion, targetVersion);
  if (path.length === 0) return entity;

  let result = { ...entity } as Record<string, unknown>;
  for (const migration of path) {
    result = migration.transform(result);
  }
  return result as T;
}

/**
 * Convenience: migrate an array of entities.
 */
export function migrateEntities<T extends Record<string, unknown>>(
  entities: T[],
  targetVersion: string,
): T[] {
  return entities.map((e) => migrateEntity(e, targetVersion));
}

/**
 * Check if an entity needs migration.
 */
export function needsMigration(entity: Record<string, unknown>, targetVersion: string): boolean {
  return (entity.schema_version as string | undefined) !== targetVersion;
}
