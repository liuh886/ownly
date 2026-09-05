import { describe, expect, it } from 'vitest';
import { parseMarkdownEntity } from '@/data/frontmatter';
import { validateEntity } from '@/domain/schema';
import { VaultIndexer } from '@/core/indexer';

describe('P2: schema 0.1 compatibility & indexing', () => {
  it('files with schema 0.1 are valid and parseable without loss', () => {
    const raw = `---
id: place-1
type: trip_place
schema_version: '0.1'
title: Old Place
trip_id: t1
source_provider: other
source_url: https://x
kind: food
state: candidate
tags: []
created_at: '2026-01-01T00:00:00.000Z'
---
`;
    const parsed = parseMarkdownEntity<Record<string, unknown>>(raw);
    const validation = validateEntity(parsed.frontmatter);
    expect(validation.valid).toBe(true);
    expect(parsed.frontmatter.id).toBe('place-1');
    expect(parsed.frontmatter.title).toBe('Old Place');
  });

  it('index rebuilds for schema 0.1 files', async () => {
    const indexer = new VaultIndexer();
    const files = [{ fileName: 'Trip Places/old.md', content: '---\nid: old\ntype: trip_place\nschema_version: "0.1"\ntitle: Old\ntrip_id: t1\nsource_provider: other\nsource_url: https://x\nkind: food\nstate: candidate\ntags: []\ncreated_at: 2026-01-01T00:00:00.000Z\n---\n' }];
    const { changed } = await indexer.build(files);
    expect(changed.length).toBe(1);
  });
});
