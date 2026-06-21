import { BaseEntity } from './types';

export interface Migration {
  versionFrom: string;
  versionTo: string;
  up: (entity: any) => any;
  down?: (entity: any) => any;
}

export const migrations: Migration[] = [
  {
    versionFrom: '0.1',
    versionTo: '0.2',
    up: (entity: any) => {
      // Future: add migration logic here when moving to schema version 0.2
      // For now, it's a no-op placeholder for schema_version 0.1 -> 0.2
      return entity;
    }
  }
];

export function runMigrations(entity: any, targetVersion: string = '0.1'): any {
  if (!entity || !entity.schema_version) return entity;
  
  let currentVersion = entity.schema_version;
  let migratedEntity = { ...entity };

  // Example: simple linear migration
  for (const migration of migrations) {
    if (currentVersion === migration.versionFrom && targetVersion > currentVersion) {
      migratedEntity = migration.up(migratedEntity);
      currentVersion = migration.versionTo;
      migratedEntity.schema_version = currentVersion;
    }
  }

  return migratedEntity;
}
