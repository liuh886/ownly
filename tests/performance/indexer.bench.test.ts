import { describe, it } from 'vitest';
import { VaultIndexer } from '@/core/indexer';

function makeFiles(n: number): Array<{ fileName: string; content: string }> {
  return Array.from({ length: n }, (_, i) => ({
    fileName: `Places/place-${i}.md`,
    content: `---\nid: "place-${i}"\ntype: trip_place\ntitle: "Place ${i}"\n---\nbody`,
  }));
}

describe('P3 benchmark: VaultIndexer', () => {
  for (const n of [100, 1000]) {
    it(`cold build ${n} files`, async () => {
      const indexer = new VaultIndexer();
      const files = makeFiles(n);
      const t0 = performance.now();
      const { changed } = await indexer.build(files);
      const t1 = performance.now();
      // changed should be n on cold
      if (changed.length !== n) throw new Error(`expected ${n} changed, got ${changed.length}`);
      console.log(`[bench] cold ${n}: ${(t1 - t0).toFixed(1)}ms, changed=${changed.length}`);
    });

    it(`warm incremental ${n} files (1 changed)`, async () => {
      const indexer = new VaultIndexer();
      const files = makeFiles(n);
      await indexer.build(files);
      files[0].content += '\nupdated';
      const t0 = performance.now();
      const { changed } = await indexer.build(files);
      const t1 = performance.now();
      if (changed.length !== 1) throw new Error(`expected 1 changed, got ${changed.length}`);
      console.log(`[bench] warm incremental ${n}: ${(t1 - t0).toFixed(1)}ms, changed=${changed.length}`);
    });
  }

  it('memory check 1000 files', async () => {
    const before = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const indexer = new VaultIndexer();
    await indexer.build(makeFiles(1000));
    const after = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    if (before !== undefined && after !== undefined) {
      console.log(`[bench] memory delta 1000: ${((after - before) / 1024 / 1024).toFixed(2)} MB`);
    }
  });
});
