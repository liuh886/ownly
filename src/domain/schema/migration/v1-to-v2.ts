/**
 * migration v1 -> v2 占位 — 未来 Capture v4 / Planner v3 / Trip v2 在此集中编排
 * 原则：Schema 是产品协议，migration 是唯一升级入口
 */
import type { SchemaMeta } from '../common';
export function migrateV1ToV2(entity: SchemaMeta & Record<string, unknown>): SchemaMeta & Record<string, unknown> {
  return { ...entity, schema_version: '0.2' as const };
}
