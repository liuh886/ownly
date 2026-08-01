import YAML from 'yaml';

export interface ParsedMarkdown<T extends object> {
  frontmatter: T;
  body: string;
}

const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdownEntity<T extends object = Record<string, unknown>>(
  content: string,
): ParsedMarkdown<T> {
  const match = content.match(FRONTMATTER_PATTERN);

  if (!match) {
    throw new Error('Markdown file does not contain YAML frontmatter.');
  }

  const parsed: unknown = YAML.parse(match[1] || '{}');

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML frontmatter is not a valid object.');
  }

  const frontmatterRecord = parsed as Record<string, unknown>;
  const body = content.slice(match[0].length);

  const requiredFields = ['schema_version', 'id', 'type'] as const;
  const missing = requiredFields.filter((field) => !(field in frontmatterRecord));
  if (missing.length > 0) {
    throw new Error(`Frontmatter missing required fields: ${missing.join(', ')}`);
  }

  return { frontmatter: parsed as T, body };
}

export function serializeMarkdownEntity<T extends object>(
  frontmatter: T,
  body = '',
): string {
  const yaml = YAML.stringify(frontmatter as Record<string, unknown>).trimEnd();
  const normalizedBody = body.startsWith('\n') || body.length === 0 ? body : `\n${body}`;

  return `---\n${yaml}\n---\n${normalizedBody}`;
}
