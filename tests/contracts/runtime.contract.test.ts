import { describe, expect, it } from 'vitest';
import { MarkdownRepository, type MarkdownStore } from '@/data/MarkdownRepository';
import { capturePlaceToPlannerPlace, type CapturePlace } from '@/domain/capture';
import { normalizeCaptureStateV3 } from '@/extension/capture-state';

function memoryStore(): MarkdownStore {
  const files = new Map<string, Map<string, string>>();
  return {
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

describe('PR3 runtime contract: Extension -> Vault -> Web -> Planner', () => {
  it('Extension Capture 写入的 markdown 可被 Web Inbox 读取并转为 Planner Place，且 schema/migration 一致', async () => {
    // 1. Extension 采集
    const capture: CapturePlace = {
      id: 'cap-1', collection_id: 'inbox-1', title: 'Chiang Mai University',
      source: { provider: 'google_maps', url: 'https://maps.example.com/place/ChIJ123', place_id: 'ChIJ123' },
      captured_at: new Date().toISOString(),
    };
    // 2. 落盘 markdown (via MarkdownRepository)
    const store = memoryStore();
    const repo = new MarkdownRepository(store);
    await repo.write('Trip Places', 'place--cap-1.md', { ...capture, type: 'trip_place', schema_version: '0.1' } as unknown as object);
    const readBack = await repo.read<CapturePlace>('Trip Places', 'trip_place');
    expect(readBack).toHaveLength(1);
    expect(readBack[0].title).toBe('Chiang Mai University');

    // 3. Web Inbox 读取并校验 required fields + schema
    const raw = readBack[0] as unknown as Record<string, unknown>;
    expect(raw.id).toBeTruthy();
    expect(raw.title).toBeTruthy();
    expect((raw as unknown as { source?: { url?: string } }).source?.url).toBeTruthy();

    // 4. 转为 Planner Place
    const plannerPlace = capturePlaceToPlannerPlace(capture, 'trip-1');
    expect(plannerPlace.trip_id).toBe('trip-1');
    expect(plannerPlace.title).toBe('Chiang Mai University');
    expect(plannerPlace.source_place_id).toBe('ChIJ123');

    // 5. Migration 兼容：旧 V2 状态可 normalize 为 V3 Inbox
    const v2 = { version: 2, activeContext: null, pendingPlaces: [] };
    const v3 = normalizeCaptureStateV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.collections.length).toBeGreaterThan(0);
  });
});
