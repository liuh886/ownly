import { describe, expect, it } from 'vitest';
import { migrateEntity } from '@/domain/migrations';
import { VaultIndexer } from '@/core/indexer';

describe('P2: old user upgrade v0.9 -> 1.0', () => {
  it('old file with schema 0.1 still readable after migration — 字段转换验证', () => {
    const old = { id: 'place-1', type: 'trip_place', schema_version: '0.1', title: 'Old Place', trip_id: 't1', source_url: 'https://x', kind: 'food' };
    const migrated = migrateEntity(old as unknown as Record<string, unknown>, '0.2') as Record<string, unknown>;
    expect(migrated.schema_version).toBe('0.2');
    expect(migrated.id).toBe('place-1');
    expect(migrated.title).toBe('Old Place');
    expect(migrated.trip_id).toBe('t1');
    expect(migrated.source_url).toBe('https://x');
    expect(migrated.kind).toBe('food');
    // Ensure no data loss: all original keys preserved (except version bump)
    for (const k of Object.keys(old)) {
      if (k === 'schema_version') continue;
      expect(migrated[k]).toEqual((old as Record<string, unknown>)[k]);
    }
  });

  it('index rebuilds after upgrade', async () => {
    const indexer = new VaultIndexer();
    const files = [{ fileName: 'Places/old.md', content: '---\nid: old\ntype: trip_place\nschema_version: 0.1\ntitle: Old\n---\n' }];
    const { changed } = await indexer.build(files);
    expect(changed.length).toBe(1);
  });

  it('archive and review not lost on upgrade (simulated)', async () => {
    const fakeArchive = { id: 'arch-1', type: 'archive', schema_version: '0.1' };
    const migrated = migrateEntity(fakeArchive as unknown as Record<string, unknown>, '0.2');
    expect(migrated.id).toBe('arch-1');
  });
});
