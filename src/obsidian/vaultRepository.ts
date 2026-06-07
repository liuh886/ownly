import { TFile, TFolder, normalizePath, type App, type FileManager, type Vault } from 'obsidian';

import {
  createWYQDEntityFileName,
  createWYQDReviewFileName,
  createWYQDSnapshotFileName,
  slugifyWYQDTitle,
} from '@/core/paths';
import type {
  WYQDArchivedStoredEntity,
  WYQDArchiveEntityType,
  WYQDRepositoryAdapter,
  WYQDStoredEntity,
} from '@/core/repository';
import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import type {
  Account,
  AccountSnapshot,
  BaseEntity,
  ReviewEntry,
  WYQDObject,
  WYQDEntityType,
} from '@/domain/types';

interface ObsidianVaultRepositoryOptions {
  dataFolder: string | (() => string);
  t?: (key: string) => string;
}

type EntityFolderKey = WYQDArchiveEntityType;

type EntityConfig<T extends BaseEntity> = {
  type: EntityFolderKey;
  folderName: string;
  entityType: WYQDEntityType;
  createFileName: (entity: T) => string;
};

const OBJECT_CONFIG: EntityConfig<WYQDObject> = {
  type: 'object',
  folderName: 'Objects',
  entityType: 'object',
  createFileName: (entity: WYQDObject) =>
    createWYQDEntityFileName(toDateSegment(entity.created_at), slugifyWYQDTitle(entity.title)),
};

const ACCOUNT_CONFIG: EntityConfig<Account> = {
  type: 'account',
  folderName: 'Accounts',
  entityType: 'account',
  createFileName: (entity: Account) =>
    createWYQDEntityFileName(toDateSegment(entity.created_at), slugifyWYQDTitle(entity.title)),
};

const SNAPSHOT_CONFIG: EntityConfig<AccountSnapshot> = {
  type: 'snapshot',
  folderName: 'Snapshots',
  entityType: 'snapshot',
  createFileName: (entity: AccountSnapshot) =>
    createWYQDSnapshotFileName(
      toDateSegment(entity.snapshot_at || entity.created_at),
      toTimeSegment(entity.created_at),
    ),
};

const REVIEW_CONFIG: EntityConfig<ReviewEntry> = {
  type: 'review',
  folderName: 'Reviews',
  entityType: 'review',
  createFileName: (entity: ReviewEntry) =>
    createWYQDReviewFileName(
      toDateSegment(entity.reviewed_at || entity.exited_at || entity.created_at),
      slugifyWYQDTitle(entity.title),
    ),
};

const ENTITY_CONFIG = {
  object: OBJECT_CONFIG,
  account: ACCOUNT_CONFIG,
  snapshot: SNAPSHOT_CONFIG,
  review: REVIEW_CONFIG,
};

export class ObsidianVaultRepository implements WYQDRepositoryAdapter {
  private readonly vault: Vault;
  private readonly fileManager: FileManager | null;
  private readonly getDataFolder: () => string;
  private readonly t: (key: string) => string;

  constructor(appOrVault: App | Vault, options: ObsidianVaultRepositoryOptions) {
    if ('vault' in appOrVault) {
      this.vault = appOrVault.vault;
      this.fileManager = appOrVault.fileManager;
    } else {
      this.vault = appOrVault;
      this.fileManager = null;
    }
    const dataFolder = options.dataFolder;
    this.getDataFolder = typeof dataFolder === 'function' ? dataFolder : () => dataFolder;
    this.t = options.t || ((key: string) => key);
  }

  getVault(): Vault {
    return this.vault;
  }

  /** Delete a file using trash (system trash if available, otherwise Obsidian trash). */
  private async deleteFile(file: TFile): Promise<void> {
    if (this.fileManager) {
      await this.fileManager.trashFile(file);
    } else {
      await this.vault.delete(file);
    }
  }

  getDataFolderPath(): string {
    return this.getDataFolder();
  }

  async listObjects(): Promise<readonly WYQDStoredEntity<WYQDObject>[]> {
    return this.listEntities<WYQDObject>(ENTITY_CONFIG.object);
  }

  async listAccounts(): Promise<readonly WYQDStoredEntity<Account>[]> {
    return this.listEntities<Account>(ENTITY_CONFIG.account);
  }

  async listSnapshots(): Promise<readonly WYQDStoredEntity<AccountSnapshot>[]> {
    return this.listEntities<AccountSnapshot>(ENTITY_CONFIG.snapshot);
  }

  async listReviews(): Promise<readonly WYQDStoredEntity<ReviewEntry>[]> {
    return this.listEntities<ReviewEntry>(ENTITY_CONFIG.review);
  }

  async listArchivedEntities(): Promise<readonly WYQDArchivedStoredEntity[]> {
    const [objects, accounts, snapshots, reviews] = await Promise.all([
      this.listArchivedEntitiesFor<WYQDObject>(ENTITY_CONFIG.object),
      this.listArchivedEntitiesFor<Account>(ENTITY_CONFIG.account),
      this.listArchivedEntitiesFor<AccountSnapshot>(ENTITY_CONFIG.snapshot),
      this.listArchivedEntitiesFor<ReviewEntry>(ENTITY_CONFIG.review),
    ]);

    return [...objects, ...accounts, ...snapshots, ...reviews] as WYQDArchivedStoredEntity[];
  }

  async listDataDirectories(): Promise<readonly string[]> {
    const root = this.dataRoot();
    const folders = this.vault.getAllFolders(false).map((folder) => folder.path);
    return folders.filter((path) => path === root || path.startsWith(`${root}/`));
  }

  async ensureDataFolders(): Promise<void> {
    await this.ensureFolder(this.dataRoot());
    await Promise.all(
      Object.values(ENTITY_CONFIG).map(async (config) => {
        await this.ensureFolder(this.activeDirectory(config));
        await this.ensureFolder(this.archiveDirectory(config));
      }),
    );
  }

  async saveObject(object: WYQDObject, body = ''): Promise<string> {
    return this.saveEntity(ENTITY_CONFIG.object, object, body);
  }

  async updateObject(fileName: string, object: WYQDObject, body = ''): Promise<void> {
    await this.updateEntity(ENTITY_CONFIG.object, fileName, object, body);
  }

  async archiveObject(fileName: string): Promise<string> {
    return this.archiveEntity(ENTITY_CONFIG.object, fileName);
  }

  async restoreObject(archiveFileName: string): Promise<string> {
    return this.restoreEntity(ENTITY_CONFIG.object, archiveFileName);
  }

  async saveAccount(account: Account, body = ''): Promise<string> {
    return this.saveEntity(ENTITY_CONFIG.account, account, body);
  }

  async updateAccount(fileName: string, account: Account, body = ''): Promise<void> {
    await this.updateEntity(ENTITY_CONFIG.account, fileName, account, body);
  }

  async archiveAccount(fileName: string): Promise<string> {
    return this.archiveEntity(ENTITY_CONFIG.account, fileName);
  }

  async restoreAccount(archiveFileName: string): Promise<string> {
    return this.restoreEntity(ENTITY_CONFIG.account, archiveFileName);
  }

  async saveSnapshot(snapshot: AccountSnapshot, body = ''): Promise<string> {
    return this.saveEntity(ENTITY_CONFIG.snapshot, snapshot, body);
  }

  async updateSnapshot(fileName: string, snapshot: AccountSnapshot, body = ''): Promise<void> {
    await this.updateEntity(ENTITY_CONFIG.snapshot, fileName, snapshot, body);
  }

  async archiveSnapshot(fileName: string): Promise<string> {
    return this.archiveEntity(ENTITY_CONFIG.snapshot, fileName);
  }

  async restoreSnapshot(archiveFileName: string): Promise<string> {
    return this.restoreEntity(ENTITY_CONFIG.snapshot, archiveFileName);
  }

  async saveReview(review: ReviewEntry, body = ''): Promise<string> {
    return this.saveEntity(ENTITY_CONFIG.review, review, body);
  }

  async updateReview(fileName: string, review: ReviewEntry, body = ''): Promise<void> {
    await this.updateEntity(ENTITY_CONFIG.review, fileName, review, body);
  }

  async archiveReview(fileName: string): Promise<string> {
    return this.archiveEntity(ENTITY_CONFIG.review, fileName);
  }

  async restoreReview(archiveFileName: string): Promise<string> {
    return this.restoreEntity(ENTITY_CONFIG.review, archiveFileName);
  }

  async restoreArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string): Promise<string> {
    const config = ENTITY_CONFIG[archiveType] as EntityConfig<BaseEntity>;
    return this.restoreEntity(config, archiveFileName);
  }

  async permanentlyDeleteArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string): Promise<void> {
    const config = ENTITY_CONFIG[archiveType] as EntityConfig<BaseEntity>;
    const directory = this.archiveDirectory(config);
    const filePath = normalizePath([directory, archiveFileName].join('/'));
    await this.vault.adapter.remove(filePath);
  }

  private async listEntities<T extends BaseEntity>(
    config: EntityConfig<T>,
    mode: 'active' | 'archive' = 'active',
  ): Promise<WYQDStoredEntity<T>[]> {
    const directory = mode === 'active' ? this.activeDirectory(config) : this.archiveDirectory(config);
    const files = this.markdownFilesIn(directory);
    const entities: WYQDStoredEntity<T>[] = [];

    for (const file of files) {
      try {
        const content = await this.vault.cachedRead(file);
        const parsed = parseMarkdownEntity<Record<string, unknown>>(content);
        if (parsed.frontmatter.type !== config.entityType) {
          continue;
        }

        entities.push({
          fileName: file.name,
          path: file.path,
          entity: parsed.frontmatter as unknown as T,
          body: parsed.body,
        });
      } catch (error) {
        console.warn(`Ownly: skipping invalid ${config.type} markdown file ${file.path}`, error);
      }
    }

    return entities;
  }

  private async listArchivedEntitiesFor<T extends BaseEntity>(
    config: EntityConfig<T>,
  ): Promise<Array<WYQDStoredEntity<T> & { archiveType: EntityFolderKey }>> {
    const entries = await this.listEntities<T>(config, 'archive');
    return entries.map((entry) => ({ ...entry, archiveType: config.type }));
  }

  private async saveEntity<T extends BaseEntity>(
    config: EntityConfig<T>,
    entity: T,
    body: string,
  ): Promise<string> {
    await this.ensureDataFolders();
    const directory = this.activeDirectory(config);
    const fileName = config.createFileName(entity);
    const path = await this.nextAvailablePath(joinPath(directory, fileName));
    await this.vault.create(path, serializeEntity(entity, body));
    return basename(path);
  }

  private async updateEntity<T extends BaseEntity>(
    config: EntityConfig<T>,
    fileName: string,
    entity: T,
    body: string,
  ): Promise<void> {
    await this.ensureDataFolders();
    const file = this.getMarkdownFile(this.activeDirectory(config), fileName);
    if (!file) {
      throw new Error(this.t('entityFileNotFound').replace('{type}', config.type).replace('{name}', fileName));
    }

    await this.vault.modify(file, serializeEntity(entity, body));
  }

  private async archiveEntity<T extends BaseEntity>(
    config: EntityConfig<T>,
    fileName: string,
  ): Promise<string> {
    await this.ensureDataFolders();
    const sourceFile = this.getMarkdownFile(this.activeDirectory(config), fileName);
    if (!sourceFile) {
      throw new Error(this.t('entityFileNotFound').replace('{type}', config.type).replace('{name}', fileName));
    }

    const timestamp = new Date().toISOString();
    const content = await this.vault.read(sourceFile);
    const parsed = parseMarkdownEntity<Record<string, unknown>>(content);
    const archiveFileName = `${timestamp.replace(/[:.]/g, '-')}--${sourceFile.name}`;
    const archivePath = await this.nextAvailablePath(joinPath(this.archiveDirectory(config), archiveFileName));
    const archiveContent = serializeMarkdownEntity(
      {
        ...parsed.frontmatter,
        archived_at: timestamp,
        archived_from: sourceFile.path,
        original_file_name: sourceFile.name,
      },
      parsed.body,
    );

    await this.vault.create(archivePath, archiveContent);
    try {
      await this.deleteFile(sourceFile);
    } catch (deleteError) {
      // Cleanup: remove the archive copy if source delete fails to avoid duplicates
      const archiveFile = this.getMarkdownFile(this.archiveDirectory(config), basename(archivePath));
      if (archiveFile) {
        try { await this.deleteFile(archiveFile); } catch { /* best effort cleanup */ }
      }
      throw deleteError;
    }
    return basename(archivePath);
  }

  private async restoreEntity<T extends BaseEntity>(
    config: EntityConfig<T>,
    archiveFileName: string,
  ): Promise<string> {
    await this.ensureDataFolders();
    const archiveFile = this.getMarkdownFile(this.archiveDirectory(config), archiveFileName);
    if (!archiveFile) {
      throw new Error(this.t('archivedFileNotFound').replace('{type}', config.type).replace('{name}', archiveFileName));
    }

    const content = await this.vault.read(archiveFile);
    const parsed = parseMarkdownEntity<Record<string, unknown>>(content);
    const frontmatter = { ...parsed.frontmatter };
    const originalFileName = frontmatter.original_file_name;
    delete frontmatter.archived_at;
    delete frontmatter.archived_from;
    delete frontmatter.original_file_name;

    const preferredFileName =
      typeof originalFileName === 'string' && originalFileName.endsWith('.md')
        ? originalFileName
        : archiveFile.name.replace(/^\d{4}-\d{2}-\d{2}T.*?--/, '');
    const restorePath = await this.nextAvailablePath(joinPath(this.activeDirectory(config), preferredFileName));
    const restoredContent = serializeMarkdownEntity(
      {
        ...frontmatter,
        updated_at: new Date().toISOString(),
      },
      parsed.body,
    );

    await this.vault.create(restorePath, restoredContent);
    await this.deleteFile(archiveFile);
    return basename(restorePath);
  }

  private markdownFilesIn(directory: string): TFile[] {
    const prefix = `${directory}/`;
    return this.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(prefix))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private getMarkdownFile(directory: string, fileNameOrPath: string): TFile | null {
    const path = fileNameOrPath.includes('/')
      ? normalizePath(fileNameOrPath)
      : joinPath(directory, fileNameOrPath);
    const file = this.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private async nextAvailablePath(path: string): Promise<string> {
    if (!this.vault.getAbstractFileByPath(path)) {
      return path;
    }

    const extensionIndex = path.lastIndexOf('.');
    const base = extensionIndex >= 0 ? path.slice(0, extensionIndex) : path;
    const extension = extensionIndex >= 0 ? path.slice(extensionIndex) : '';

    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${base}-${index}${extension}`;
      if (!this.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
    }

    throw new Error(this.t('pathNotFound').replace('{path}', path));
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) return;
    if (existing) throw new Error(this.t('pathNotFolder').replace('{path}', normalized));

    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const folder = this.vault.getAbstractFileByPath(current);
      if (folder instanceof TFolder) continue;
      if (folder) throw new Error(this.t('pathNotFolder').replace('{path}', current));
      await this.vault.createFolder(current);
    }
  }

  private activeDirectory(config: { folderName: string }): string {
    return joinPath(this.dataRoot(), config.folderName);
  }

  private archiveDirectory(config: { folderName: string }): string {
    return joinPath(this.dataRoot(), 'Archive', config.folderName);
  }

  private dataRoot(): string {
    return normalizePath(this.getDataFolder()).split('/').filter(Boolean).join('/') || 'Ownly';
  }
}

function serializeEntity<T extends BaseEntity>(entity: T, body: string): string {
  return serializeMarkdownEntity(entity, body);
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.flatMap((part) => part.split('/').filter(Boolean)).join('/'));
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function toDateSegment(value: string | undefined): string {
  return value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function toTimeSegment(value: string | undefined): string | undefined {
  if (!value?.includes('T')) return undefined;
  return value.slice(11, 19).replaceAll(':', '') || undefined;
}
