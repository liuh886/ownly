/**
 * Schema common — 产品协议基座，不归属任一功能模块
 * 所有实体共享的元字段在此定义，半年后 Agent 改一处不破另一处
 */
export type SchemaVersion = '0.1' | '0.2' | '1.0';
export const CURRENT_SCHEMA_VERSION: SchemaVersion = '0.1';

export interface SchemaMeta {
  schema_version: SchemaVersion;
  type: string;
  id: string;
  created_at: string;
  updated_at?: string;
}
