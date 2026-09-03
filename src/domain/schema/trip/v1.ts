import type { SchemaMeta } from '../common';
export interface TripV1 extends SchemaMeta {
  type: 'trip';
  schema_version: '0.1';
  title: string;
  start_date: string;
  end_date: string;
  destinations: string[];
}
