import { describe, expect, it } from 'vitest';
import { MarkdownRepository, type MarkdownStore } from '@/data/MarkdownRepository';
import { buildCollectionExport, type CaptureCollection, type CapturePlace } from '@/domain/capture';
import { parseCaptureCollectionExport } from '@/domain/capture';

function memoryStore(): MarkdownStore & { files: Map<string, Map<string, string>> } {
  const files = new Map<string, Map<string, string>>();
  return {
    files,
    async getDataFolder() { return 'vault'; },
    async readMarkdownFiles(dir: string) {
      const m = files.get(dir) ?? new Map();
      return [...m.entries()].map(([fileName, content]) => ({ fileName, content }));
    },
    async writeMarkdownFile(dir: string, fileName: string, content: string) {
      if (!files.has(dir)) files.set(dir, new Map());
      files.get(dir)!.set(fileName, content);
    },
    async deleteMarkdownFile(dir: string, fileName: string) {
      files.get(dir)?.delete(fileName);
    },
  };
}

describe('P0 contract: Capture multi-entry consistency', () => {
  it('Web写入的 Capture Collection 可被 Extension/Obsidian/CLI 一致读取', async () => {
    const collection: CaptureCollection = { id: 'col-1', title: 'Bangkok', created_at: new Date().toISOString() };
    const place: CapturePlace = {
      id: 'place-1', collection_id: 'col-1', title: 'BKK Airport',
      source: { provider: 'google_maps', url: 'https://maps.example.com/1', place_id: 'ChIJ123' },
      captured_at: new Date().toISOString(),
    };
    const exported = buildCollectionExport(collection, [place]);

    // Web: 写入 MarkdownRepository (模拟 vault/Trip Places 写入)
    const store = memoryStore();
    const repo = new MarkdownRepository(store);
    await repo.write('Trip Places', 'place--place-1.md', { ...place, type: 'trip_place', schema_version: '0.1' } as unknown as object);

    // Extension: 读取同一文件
    const extRead = await repo.read<CapturePlace>('Trip Places', 'trip_place');
    expect(extRead).toHaveLength(1);

    // Obsidian: 同一 store 读取
    const obsRead = await repo.read<CapturePlace>('Trip Places', 'trip_place');
    expect(obsRead[0].title).toBe('BKK Airport');

    // CLI: 通过 OwnlyCollectionExportV1 解析一致
    const parsed = parseCaptureCollectionExport(exported);
    expect(parsed?.places[0].title).toBe('BKK Airport');
    expect(parsed?.collection.id).toBe('col-1');
  });
});
