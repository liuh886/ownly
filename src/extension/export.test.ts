import { describe, expect, it } from 'vitest';
import { buildCollectionMarkdown } from './export';
import type { CaptureCollection, CapturePlace } from '../domain/capture';

const collection: CaptureCollection = {
  id: 'c1',
  title: '曼谷三日',
  created_at: '2026-09-13T00:00:00.000Z',
};

const place = (overrides: Partial<CapturePlace> & { id: string; title: string }): CapturePlace => ({
  collection_id: 'c1',
  source: { provider: 'google_maps', url: `https://maps.google.com/?cid=${overrides.id}` },
  captured_at: '2026-09-13T00:00:00.000Z',
  ...overrides,
});

describe('buildCollectionMarkdown (standalone collector text export)', () => {
  it('renders numbered entries with facts and skips empty fields', () => {
    const md = buildCollectionMarkdown(collection, [
      place({
        id: 'p1',
        title: '大皇宫',
        inferred_kind: 'attraction',
        address: 'Bangkok',
        rating: 4.7,
        review_count: 12000,
        open_hours: '08:30–15:30',
        price: { raw: '฿500' },
        user: { why: '必去地标', tags: ['文化'] },
      }),
      place({ id: 'p2', title: '路边摊', inferred_kind: 'food' }),
    ], 'zh');

    expect(md).toContain('## 曼谷三日');
    expect(md).toContain('共 2 个地点');
    expect(md).toContain('1. **大皇宫 — attraction · ★4.7（12000）**');
    expect(md).toContain('地址：Bangkok');
    expect(md).toContain('营业时间：08:30–15:30');
    expect(md).toContain('价格：฿500');
    expect(md).toContain('备注：必去地标');
    expect(md).toContain('#文化');
    expect(md).toContain('🗺️ https://maps.google.com/?cid=p1');
    expect(md).toContain('2. **路边摊 — food**');
    // No empty fact lines for the bare place
    expect(md).not.toContain('地址：\n');
  });

  it('renders English labels for en', () => {
    const md = buildCollectionMarkdown(collection, [place({ id: 'p1', title: 'Grand Palace', rating: 4.5, review_count: 100 })], 'en');
    expect(md).toContain('1 place');
    expect(md).toContain('★4.5 (100)');
    expect(md).toContain('🗺️ https://maps.google.com/?cid=p1');
  });

  it('skips the map line when the source url is empty', () => {
    const bare = place({ id: 'p9', title: 'NoLink' });
    bare.source.url = '';
    const md = buildCollectionMarkdown(collection, [bare], 'zh');
    expect(md).toContain('NoLink');
    expect(md).not.toContain('🗺️');
  });
});
