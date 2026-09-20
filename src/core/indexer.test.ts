import { describe, expect, it } from 'vitest';
import { VaultIndexer } from './indexer';

function file(fileName: string, content: string) {
  return { fileName, content };
}

describe('VaultIndexer', () => {
  it('indexes files and infers entity ids and types', async () => {
    const indexer = new VaultIndexer();
    const result = await indexer.build([
      file('Trip Places/place--a.md', 'id: place-a\ntype: trip_place'),
      file('Trips/trip--t.md', 'id: trip-1\ntype: trip'),
      file('Trip Visits/visit--v.md', 'id: visit-1\ntype: trip_visit'),
    ]);
    expect(result.changed).toHaveLength(3);
    expect(result.index.map((entry) => entry.type).sort()).toEqual(['place', 'trip', 'visit']);
    expect(result.records.map((record) => record.id).sort()).toEqual(['place-a', 'trip-1', 'visit-1']);
  });

  it('reports no changes when content hashes are unchanged', async () => {
    const indexer = new VaultIndexer();
    const files = [file('Trips/trip--t.md', 'id: trip-1\ntype: trip')];
    await indexer.build(files);
    const second = await indexer.build(files);
    expect(second.changed).toEqual([]);
  });

  it('reports only the modified file as changed', async () => {
    const indexer = new VaultIndexer();
    await indexer.build([
      file('Trips/a.md', 'id: a\ntype: trip'),
      file('Trips/b.md', 'id: b\ntype: trip'),
    ]);
    const result = await indexer.build([
      file('Trips/a.md', 'id: a\ntype: trip'),
      file('Trips/b.md', 'id: b\ntype: trip\nstatus: active'),
    ]);
    expect(result.changed).toEqual(['Trips/b.md']);
  });

  it('drops deleted files from the persisted index', async () => {
    const indexer = new VaultIndexer();
    await indexer.build([file('Trips/a.md', 'id: a\ntype: trip'), file('Trips/b.md', 'id: b\ntype: trip')]);
    await indexer.build([file('Trips/a.md', 'id: a\ntype: trip')]);
    const stored = await indexer._getAll();
    expect([...stored.keys()]).toEqual(['Trips/a.md']);
  });

  it('short-circuits incremental for an empty change set', async () => {
    const indexer = new VaultIndexer();
    expect(await indexer.incremental([])).toEqual([]);
  });

  it('clears the index only when the version changes', async () => {
    const indexer = new VaultIndexer();
    await indexer.build([file('Trips/a.md', 'id: a\ntype: trip')]);
    expect(await indexer.migrateIfNeeded(1)).toBe(false);
    expect((await indexer._getAll()).size).toBe(1);

    expect(await indexer.migrateIfNeeded(2)).toBe(true);
    expect((await indexer._getAll()).size).toBe(0);
  });
});
