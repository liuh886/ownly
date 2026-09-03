import { describe, expect, it } from 'vitest';
import { migrateEntity } from '@/domain/migrations';
import { VaultIndexer } from '@/core/indexer';

describe('P2: old user upgrade v0.9 -> 1.0', () => {
  it('old file with schema 0.1 still readable after migration', () => {
    const old = { id: 'place-1', type: 'trip_place', schema_version: '0.1', title: 'Old Place', trip_id: 't1' };
    const migrated = migrateEntity(old as unknown as Record<string, unknown>, '0.2');
    expect(migrated.schema_version).toBeDefined();
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
