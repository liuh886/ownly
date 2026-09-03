import type { SchemaMeta } from '../common';
export interface PlaceV1 extends SchemaMeta {
  type: 'trip_place';
  schema_version: '0.1';
  trip_id: string;
  title: string;
  source_provider: string;
  source_url: string;
  source_place_id?: string;
  kind: string;
  address?: string;
}
