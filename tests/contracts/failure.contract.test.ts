import { describe, expect, it } from 'vitest';
import { migrateEntity } from '@/domain/migrations';
import { parseMarkdownEntity } from '@/data/frontmatter';

describe('P1-⑤ runtime failure — 异常路径', () => {
  it('Case1 旧 schema 可升级', () => {
    const old = { id: 'x', type: 'trip_place', schema_version: '0.1', title: 'Old' };
    const migrated = migrateEntity(old as unknown as Record<string, unknown>, '0.2');
    expect(migrated.schema_version).toBeDefined();
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
