/**
 * P0-Issue1: Domain Schema 版本化中心 — 唯一真源，避免散落的 '0.1'
 * 各实体版本在此注册，migration/ 下按版本对转换
 */
export const CURRENT_SCHEMA_VERSION = '0.1' as const;

export const SCHEMA_VERSIONS = {
  capture: '0.1' as const,
  planner: '0.1' as const,
  trip: '0.1' as const,
  place: '0.1' as const,
  visit: '0.1' as const,
} as const;

export type SchemaVersion = typeof CURRENT_SCHEMA_VERSION | '0.2' | '1.0';

// Re-export migration runner as schema 级能力
export { migrateEntity, migrateEntities, getMigrationPath, needsMigration, MIGRATIONS } from '../migrations';
