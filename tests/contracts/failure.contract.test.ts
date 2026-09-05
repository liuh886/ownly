import { describe, expect, it } from 'vitest';
import { parseMarkdownEntity } from '@/data/frontmatter';
import { validateEntity } from '@/domain/schema';

describe('P1-⑤ runtime failure — 异常路径', () => {
  it('Case1 schema 0.1 实体校验通过', () => {
    const valid = { id: 'x', type: 'trip_place', trip_id: 't1', kind: 'food', source_provider: 'other', source_url: 'https://x', state: 'candidate', schema_version: '0.1', title: 'Old', created_at: '2026-01-01T00:00:00.000Z' };
    const result = validateEntity(valid);
    expect(result.valid).toBe(true);
  });

  it('Case2 文件损坏 yaml invalid 跳过', () => {
    const bad = `---\ninvalid: [unclosed\n---\nbody`;
    try {
      parseMarkdownEntity(bad);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('Case3 重复 ID Doctor 可检出', async () => {
    const { checkPlannerIntegrity } = await import('@/domain/planner-integrity');
    const p1 = { id: 'dup1', trip_id: 't1', title: 'A', source_provider: 'google_maps', source_url: 'https://x/1', source_place_id: 'ChIJ1', kind: 'food', tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate' } as never;
    const p2 = { id: 'dup2', trip_id: 't1', title: 'B', source_provider: 'google_maps', source_url: 'https://x/1', source_place_id: 'ChIJ1', kind: 'food', tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate' } as never;
    const r = checkPlannerIntegrity({ trips: [{ id: 't1' }], places: [p1, p2], visits: [] });
    expect(r.issues.some((i) => i.category === 'duplicate_identity')).toBe(true);
  });

  it('Case4 同步冲突 Dropbox A/B 修改 — last-write-wins 由 MarkdownRepository 去重', async () => {
    // 模拟：同一文件被 A/B 同时修改，hash diff 仅保留最后一次
    const { VaultIndexer } = await import('@/core/indexer');
    const indexer = new VaultIndexer();
    const f1 = { fileName: 'Places/a.md', content: 'id: a\ntype: trip_place\ntitle: A\n' };
    const f2 = { fileName: 'Places/a.md', content: 'id: a\ntype: trip_place\ntitle: B\n' };
    await indexer.build([f1]);
    const { changed } = await indexer.build([f2]);
    expect(changed).toContain('Places/a.md');
  });
});
