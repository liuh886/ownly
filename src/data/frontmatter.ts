import YAML from 'yaml';

export interface ParsedMarkdown<T extends Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdownEntity<T extends Record<string, unknown>>(content: string): ParsedMarkdown<T> {
  const match = content.match(FRONTMATTER_PATTERN);

  if (!match) {
    throw new Error('Markdown file does not contain YAML frontmatter.');
  }

  const parsed = YAML.parse(match[1] || '{}');

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML frontmatter is not a valid object.');
  }

  const frontmatter = parsed as T;
  const body = content.slice(match[0].length);

  // Validate required fields
  const requiredFields = ['schema_version', 'id', 'type'] as const;
  const missing = requiredFields.filter((field) => !(field in frontmatter));
  if (missing.length > 0) {
    console.warn(`[Ownly] Frontmatter missing required fields: ${missing.join(', ')}`);
  }

  return { frontmatter, body };
}

export function serializeMarkdownEntity<T extends Record<string, unknown>>(
  frontmatter: T,
  body = '',
): string {
  const yaml = YAML.stringify(frontmatter).trimEnd();
  const normalizedBody = body.startsWith('\n') || body.length === 0 ? body : `\n${body}`;

  return `---\n${yaml}\n---\n${normalizedBody}`;
}

export function updateMarkdownFrontmatter<T extends Record<string, unknown>>(
  existingContent: string,
  updates: Partial<T>,
): string {
  const { frontmatter, body } = parseMarkdownEntity<T>(existingContent);
  return serializeMarkdownEntity({ ...frontmatter, ...updates }, body);
}
