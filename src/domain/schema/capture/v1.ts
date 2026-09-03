import type { SchemaMeta } from '../common';
export interface CaptureV1 extends SchemaMeta {
  type: 'capture_place';
  schema_version: '0.1';
  collection_id: string;
  title: string;
  source: { provider: string; url: string; place_id?: string };
}
