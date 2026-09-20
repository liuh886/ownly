import { describe, expect, it } from 'vitest';
import { parseMarkdownEntity, serializeMarkdownEntity } from './frontmatter';

const VALID = `---
schema_version: '0.1'
id: object-1
type: object
title: Travel Camera
---
Body line one
Body line two
`;

describe('parseMarkdownEntity', () => {
  it('parses frontmatter and preserves the body', () => {
    const { frontmatter, body } = parseMarkdownEntity<{ id: string; title: string }>(VALID);
    expect(frontmatter.id).toBe('object-1');
    expect(frontmatter.title).toBe('Travel Camera');
    expect(body).toContain('Body line one');
    expect(body).toContain('Body line two');
  });

  it('tolerates a BOM and CRLF line endings', () => {
    const crlf = '\uFEFF' + VALID.replace(/\n/g, '\r\n');
    const { frontmatter } = parseMarkdownEntity<{ id: string }>(crlf);
    expect(frontmatter.id).toBe('object-1');
  });

  it('throws when frontmatter is missing', () => {
    expect(() => parseMarkdownEntity('Just a body, no frontmatter.')).toThrow(/frontmatter/i);
  });

  it('throws when YAML is not an object', () => {
    expect(() => parseMarkdownEntity('---\n- a\n- b\n---\n')).toThrow(/valid object/i);
  });

  it('throws when required fields are missing', () => {
    expect(() => parseMarkdownEntity('---\nid: x\ntype: object\n---\n')).toThrow(/schema_version/);
  });
});

describe('serializeMarkdownEntity', () => {
  it('wraps frontmatter in delimiters and normalizes a leading body newline', () => {
    const out = serializeMarkdownEntity({ schema_version: '0.1', id: 'x', type: 'object' }, 'hello');
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('id: x');
    expect(out.endsWith('---\n\nhello')).toBe(true);
  });

  it('round-trips frontmatter and body through parse', () => {
    const entity = { schema_version: '0.1', id: 'object-9', type: 'object', title: '大皇宫' };
    const parsed = parseMarkdownEntity<typeof entity>(serializeMarkdownEntity(entity, 'Notes here'));
    expect(parsed.frontmatter).toEqual(entity);
    expect(parsed.body).toContain('Notes here');
  });

  it('emits an empty body without a trailing newline artifact', () => {
    const parsed = parseMarkdownEntity(serializeMarkdownEntity({ schema_version: '0.1', id: 'x', type: 'object' }));
    expect(parsed.body).toBe('');
  });
});
