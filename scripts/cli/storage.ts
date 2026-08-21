import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { parseMarkdownEntity, serializeMarkdownEntity } from '../../src/data/frontmatter';
import { validateEntity } from '../../src/domain/schema';
import type {
  AccountSnapshot,
  ObjectLogEntry,
  ReviewEntry,
  WYQDObject,
} from '../../src/domain/types';
import { CliError, type EntityByType, type StoredEntry, type SupportedCliEntityType } from './types';

export const CLI_DIRECTORIES: Record<SupportedCliEntityType, string> = {
  object: 'Objects',
  snapshot: 'Snapshots',
  review: 'Reviews',
  object_log: 'Logs/Object Experiences',
};

export const CLI_ARCHIVE_DIRECTORIES: Record<SupportedCliEntityType, string> = {
  object: 'Archive/Objects',
  snapshot: 'Archive/Snapshots',
  review: 'Archive/Reviews',
  object_log: 'Archive/Object Logs',
};

function isExpectedEntity<K extends SupportedCliEntityType>(
  value: object,
  expectedType: K,
): value is EntityByType[K] {
  return 'type' in value && value.type === expectedType;
}

export function ensureDirectoryPath(dataLocation: string, relativePath: string): string {
  const directory = join(dataLocation, relativePath);
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function ensureEntityDirectory<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
): string {
  return ensureDirectoryPath(dataLocation, CLI_DIRECTORIES[entityType]);
}

export function ensureArchiveDirectory<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
): string {
  return ensureDirectoryPath(dataLocation, CLI_ARCHIVE_DIRECTORIES[entityType]);
}

export function parseStoredMarkdown<K extends SupportedCliEntityType>(
  content: string,
  fileName: string,
  expectedType: K,
): { frontmatter: EntityByType[K]; body: string } {
  let parsed: ReturnType<typeof parseMarkdownEntity<Record<string, unknown>>>;
  try {
    parsed = parseMarkdownEntity<Record<string, unknown>>(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Invalid Markdown frontmatter in ${fileName}: ${message}`);
  }

  if (!isExpectedEntity(parsed.frontmatter, expectedType)) {
    throw new CliError(
      `Unexpected entity type in ${fileName}: expected ${expectedType}, received ${String(parsed.frontmatter.type)}`,
    );
  }

  const validation = validateEntity(parsed.frontmatter);
  if (!validation.valid) {
    const details = validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.field ?? 'entity'}: ${issue.message}`)
      .join('; ');
    throw new CliError(`Entity validation failed in ${fileName}: ${details}`);
  }

  return { frontmatter: parsed.frontmatter, body: parsed.body };
}

export function readEntry<K extends SupportedCliEntityType>(
  directory: string,
  fileName: string,
  entityType: K,
): StoredEntry<EntityByType[K]> {
  const filePath = join(directory, fileName);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Could not read ${filePath}: ${message}`, 'IO_ERROR');
  }
  const parsed = parseStoredMarkdown(content, fileName, entityType);
  return { ...parsed, fileName, filePath };
}

export function listEntries<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
): StoredEntry<EntityByType[K]>[] {
  const directory = ensureEntityDirectory(dataLocation, entityType);
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => readEntry(directory, fileName, entityType));
}

export function listArchivedEntries<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
): StoredEntry<EntityByType[K]>[] {
  const directory = ensureArchiveDirectory(dataLocation, entityType);
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => readEntry(directory, fileName, entityType));
}

export interface EntrySelector {
  id?: string;
  title?: string;
  archiveFile?: string;
}

export function findEntry<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
  selector: EntrySelector,
): StoredEntry<EntityByType[K]> {
  const id = selector.id;
  const title = selector.title;
  if (!id && !title) {
    throw new CliError('Pass --id or --title to select an entry.', 'MISSING_OPTION');
  }

  const matches = listEntries(dataLocation, entityType).filter((entry) =>
    id ? entry.frontmatter.id === id : entry.frontmatter.title === title,
  );

  if (matches.length === 0) throw new CliError(`No ${entityType} matched.`, 'NOT_FOUND');
  if (matches.length > 1) {
    throw new CliError(`Multiple ${entityType} entries matched. Use --id.`, 'NOT_FOUND');
  }
  return matches[0];
}

export function findArchivedEntry<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
  selector: EntrySelector,
): StoredEntry<EntityByType[K]> {
  const archiveFile = selector.archiveFile;
  const id = selector.id;
  const title = selector.title;
  if (!archiveFile && !id && !title) {
    throw new CliError(
      'Pass --archive-file, --id or --title to select an archived entry.',
      'MISSING_OPTION',
    );
  }

  const matches = listArchivedEntries(dataLocation, entityType).filter((entry) => {
    if (archiveFile) return entry.fileName === archiveFile;
    if (id) return entry.frontmatter.id === id;
    return entry.frontmatter.title === title;
  });

  if (matches.length === 0) {
    throw new CliError(`No archived ${entityType} matched.`, 'NOT_FOUND');
  }
  if (matches.length > 1) {
    throw new CliError(
      `Multiple archived ${entityType} entries matched. Use --archive-file.`,
      'NOT_FOUND',
    );
  }
  return matches[0];
}

function reportValidationWarnings(entity: object): void {
  const validation = validateEntity(entity);
  for (const issue of validation.issues) {
    if (issue.severity === 'warning') {
      console.warn(`[Validation Warning] ${issue.message} (field: ${issue.field ?? 'entity'})`);
    }
  }
  if (!validation.valid) {
    const details = validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.field ?? 'entity'}: ${issue.message}`)
      .join('; ');
    throw new CliError(`Entity validation failed. ${details}`);
  }
}

export function writeEntry<T extends object>(
  directory: string,
  fileName: string,
  frontmatter: T,
  body = '',
  validateStrict = true,
): void {
  if (validateStrict) reportValidationWarnings(frontmatter);

  mkdirSync(directory, { recursive: true });
  const targetPath = join(directory, fileName);
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporaryPath, serializeMarkdownEntity(frontmatter, body), 'utf8');
    renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Could not write ${targetPath}: ${message}`, 'IO_ERROR');
  }
}

export function availableFileName(directory: string, preferredFileName: string): string {
  mkdirSync(directory, { recursive: true });
  const existing = new Set(readdirSync(directory));
  if (!existing.has(preferredFileName)) return preferredFileName;

  const extension = preferredFileName.toLowerCase().endsWith('.md') ? '.md' : '';
  const base = extension ? preferredFileName.slice(0, -extension.length) : preferredFileName;
  let suffix = 2;
  let candidate = `${base}--${suffix}${extension}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${base}--${suffix}${extension}`;
  }
  return candidate;
}

export function archiveEntry<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
  entry: StoredEntry<EntityByType[K]>,
  now = new Date(),
): string {
  const archiveDirectory = ensureArchiveDirectory(dataLocation, entityType);
  const timestamp = now.toISOString();
  const archiveFileName = availableFileName(
    archiveDirectory,
    `${timestamp.replace(/[:.]/g, '-')}--${entry.fileName}`,
  );
  const archiveFrontmatter = {
    ...entry.frontmatter,
    archived_at: timestamp,
    archived_from: CLI_DIRECTORIES[entityType],
    original_file_name: entry.fileName,
  };

  writeEntry(archiveDirectory, archiveFileName, archiveFrontmatter, entry.body, false);
  try {
    rmSync(entry.filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `Archive copy was created, but the active source could not be removed: ${message}`,
      'IO_ERROR',
    );
  }
  return archiveFileName;
}

export function restoreArchivedEntry<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
  entry: StoredEntry<EntityByType[K]>,
  now = new Date(),
): string {
  const targetDirectory = ensureEntityDirectory(dataLocation, entityType);
  const archiveDirectory = ensureArchiveDirectory(dataLocation, entityType);
  const frontmatter = { ...entry.frontmatter } as EntityByType[K] & {
    archived_at?: string;
    archived_from?: string;
    original_file_name?: string;
  };
  const originalFileName = frontmatter.original_file_name;
  delete frontmatter.archived_at;
  delete frontmatter.archived_from;
  delete frontmatter.original_file_name;

  const preferredFileName =
    typeof originalFileName === 'string' && originalFileName.endsWith('.md')
      ? originalFileName
      : entry.fileName.replace(/^[^-]+--/, '');
  const existing = new Set(readdirSync(targetDirectory));
  const collisionSafeName = existing.has(preferredFileName)
    ? `restored-${now.toISOString().replace(/[:.]/g, '-')}--${preferredFileName}`
    : preferredFileName;
  const fileName = availableFileName(targetDirectory, collisionSafeName);

  writeEntry(
    targetDirectory,
    fileName,
    { ...frontmatter, updated_at: now.toISOString().split('T')[0] },
    entry.body,
    false,
  );
  rmSync(join(archiveDirectory, entry.fileName));
  return fileName;
}

export function writeAgentLog(
  dataLocation: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): void {
  const directory = ensureDirectoryPath(dataLocation, 'Logs');
  const logFile = join(directory, 'agent_operations.log');
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    entity_id: entityId,
    before,
    after,
  };
  appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

export function archivedBasename(entry: StoredEntry): string {
  return basename(entry.filePath);
}

export type ObjectEntry = StoredEntry<WYQDObject>;
export type SnapshotEntry = StoredEntry<AccountSnapshot>;
export type ReviewEntryFile = StoredEntry<ReviewEntry>;
export type ObjectLogEntryFile = StoredEntry<ObjectLogEntry>;
