export interface Migration {
  versionFrom: string;
  versionTo: string;
  up: (entity: Record<string, unknown>) => Record<string, unknown>;
  down?: (entity: Record<string, unknown>) => Record<string, unknown>;
}

export const migrations: Migration[] = [
  {
    versionFrom: '0.1',
    versionTo: '0.2',
    up: (entity: Record<string, unknown>) => {
      // Future: add migration logic here when moving to schema version 0.2
      // For now, it's a no-op placeholder for schema_version 0.1 -> 0.2
      return entity;
    }
  }
];

export function runMigrations(entity: Record<string, unknown>, targetVersion: string = '0.1'): Record<string, unknown> {
  if (!entity || !entity.schema_version) return entity;
  
  let currentVersion = String(entity.schema_version);
  let migratedEntity = { ...entity };

  // Placeholder implementation for applying migrations sequentially
  // Future implementations should use a proper migration graph or explicit path
  for (const migration of migrations) {
    if (currentVersion === migration.versionFrom && targetVersion !== currentVersion) {
      migratedEntity = migration.up(migratedEntity);
      currentVersion = migration.versionTo;
      migratedEntity.schema_version = currentVersion;
    }
  }

  return migratedEntity;
}
