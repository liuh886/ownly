/**
 * Domain Schema 版本化中心 — 唯一真源
 */
export { CURRENT_SCHEMA_VERSION, type SchemaVersion, type SchemaMeta } from './common';

export const SCHEMA_VERSIONS = {
  capture: '0.1' as const,
  planner: '0.1' as const,
  trip: '0.1' as const,
  place: '0.1' as const,
  visit: '0.1' as const,
} as const;

