import { describe, expect, it } from 'vitest';
import {
  migrateEntity,
  migrateEntities,
  needsMigration,
  getMigrationPath,
  MIGRATIONS,
} from './index';

describe('Schema Migration Framework', () => {
  it('returns entity unchanged when already at target version', () => {
    const entity = { schema_version: '0.1', id: 'test', type: 'trip' };
    const result = migrateEntity(entity, '0.1');
    expect(result).toEqual(entity);
  });

  it('returns entity unchanged when no migration path exists', () => {
    const entity = { schema_version: '9.9', id: 'test', type: 'trip' };
    const result = migrateEntity(entity, '0.1');
    expect(result).toEqual(entity);
  });

  it('needsMigration returns true when versions differ', () => {
    const entity = { schema_version: '0.1' };
    expect(needsMigration(entity, '0.2')).toBe(true);
  });

  it('needsMigration returns false when versions match', () => {
    const entity = { schema_version: '0.1' };
    expect(needsMigration(entity, '0.1')).toBe(false);
  });

  it('getMigrationPath returns empty array for same version', () => {
    const path = getMigrationPath('0.1', '0.1');
    expect(path).toEqual([]);
  });

  it('getMigrationPath returns correct chain', () => {
    const path = getMigrationPath('0.1', '0.2');
    expect(path.length).toBeGreaterThanOrEqual(1);
    expect(path[0].from).toBe('0.1');
    expect(path[0].to).toBe('0.2');
  });

  it('migrateEntities applies migration to all entities', () => {
    const entities = [
      { schema_version: '0.1', id: '1' },
      { schema_version: '0.1', id: '2' },
    ];
    const result = migrateEntities(entities, '0.1');
    expect(result).toHaveLength(2);
    expect(result[0].schema_version).toBe('0.1');
  });

  it('MIGRATIONS array contains registered migrations', () => {
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(3);
    expect(MIGRATIONS.every((m) => m.from && m.to && m.transform)).toBe(true);
  });

  it('migration transform is pure — does not mutate input', () => {
    const entity = { schema_version: '0.1', id: 'test' };
    const frozen = { ...entity };
    migrateEntity(entity, '0.1');
    expect(entity).toEqual(frozen);
  });
});
