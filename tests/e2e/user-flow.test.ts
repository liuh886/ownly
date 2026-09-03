import { describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarkdownRepository } from '@/data/MarkdownRepository';
import { buildCollectionExport, type CaptureCollection, type CapturePlace } from '@/domain/capture';

function memoryStore(root: string) {
  const files = new Map<string, Map<string, string>>();
  return {
    async getDataFolder() { return root; },
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

describe('真实用户流程 E2E: 空文件夹 -> 创建 -> Capture -> 刷新 -> 重开', () => {
  it('数据在刷新/重开后仍存在', async () => {
    const tmp = join(tmpdir(), `ownly-e2e-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    try {
      const store = memoryStore(tmp);
      const repo = new MarkdownRepository(store);

      // 1. 空文件夹 -> 创建 Ownly (模拟 createLocalData)
      const collection: CaptureCollection = { id: 'inbox-1', title: 'Inbox', created_at: new Date().toISOString() };
      const place: CapturePlace = {
        id: 'cap-1', collection_id: 'inbox-1', title: 'Test Place',
        source: { provider: 'google_maps', url: 'https://maps.example.com/1', place_id: 'ChIJ1' },
        captured_at: new Date().toISOString(),
      };
      const exported = buildCollectionExport(collection, [place]);
      expect(exported.places).toHaveLength(1);

      // 2. Capture 一个地点 -> 写入
      await repo.write('Trip Places', 'place--cap-1.md', { ...place, type: 'trip_place', schema_version: '0.1' } as unknown as object);

      // 3. 刷新（重新读取）
      const afterRefresh = await repo.read<CapturePlace>('Trip Places', 'trip_place');
      expect(afterRefresh).toHaveLength(1);
      expect(afterRefresh[0].title).toBe('Test Place');

      // 4. 重新打开（新实例，同一 store）
      const repo2 = new MarkdownRepository(store);
      const afterReopen = await repo2.read<CapturePlace>('Trip Places', 'trip_place');
      expect(afterReopen).toHaveLength(1);
      expect(afterReopen[0].id).toBe('cap-1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
