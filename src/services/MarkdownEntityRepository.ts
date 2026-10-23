import {
  WYQD_DATA_DIRECTORIES as WYQD_DIRECTORIES,
  createWYQDEntityFileName as createEntityFileName,
  createWYQDReviewFileName as createReviewFileName,
  createWYQDSnapshotFileName as createSnapshotFileName,
  slugifyWYQDTitle as slugify,
} from '@/core/paths';
import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import { migrateReviewEntry } from '@/lib/format';
import type { Account, AccountSnapshot, ObjectLogEntry, ReviewEntry, WYQDObject, WYQDEntityType } from '@/domain/types';
import type {
  WYQDRepositoryAdapter,
  WYQDStoredEntity,
  WYQDArchivedStoredEntity,
  WYQDArchiveEntityType,
} from '@/core/repository';
import { ownlyStoreRouter } from './ownlyStoreRouter';
import { createWYQDDirectories } from '@/data/paths';

export interface MarkdownFileStore {
  getDataFolder(): Promise<string>;
  readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]>;
  writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void>;
  deleteMarkdownFile(directory: string, fileName: string): Promise<void>;
  writeExistingMarkdownFile?(directory: string, fileName: string, content: string): Promise<void>;
  captureSession?(): Promise<MarkdownFileStore>;
}

export type RepositoryClock = () => Date;

export class MarkdownEntityRepository implements WYQDRepositoryAdapter {
  private static mutationQueue: Promise<void> = Promise.resolve();
  private dirs: ReturnType<typeof createWYQDDirectories> = WYQD_DIRECTORIES;
  private sessionLockHeld = false;

  constructor(
    private readonly store: MarkdownFileStore = ownlyStoreRouter,
    private readonly clock: RepositoryClock = () => new Date(),
    private readonly bound = false,
  ) {}

  /** Bind a group of writes to one filesystem handle and data root. */
  async withWriteSession<T>(action: (repository: WYQDRepositoryAdapter) => Promise<T>): Promise<T> {
    return this.withBoundRepository(action);
  }

  private async withBoundRepository<T>(action: (repository: MarkdownEntityRepository) => Promise<T>): Promise<T> {
    if (this.bound) return action(this);
    const store = await (this.store.captureSession?.() ?? this.store);
    const repository = new MarkdownEntityRepository(store, this.clock, true);
    await repository.initialize();
    return repository.withMutationLock(async () => {
      repository.sessionLockHeld = true;
      try { return await action(repository); }
      finally { repository.sessionLockHeld = false; }
    });
  }

  private async withMutationLock<T>(action: () => Promise<T>): Promise<T> {
    if (this.sessionLockHeld) return action();
    const previous = MarkdownEntityRepository.mutationQueue;
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    MarkdownEntityRepository.mutationQueue = previous.then(() => current, () => current);
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  private async updateExisting(directory: string, fileName: string, id: string, content: string): Promise<void> {
    const target = (await this.store.readMarkdownFiles(directory)).find((file) => file.fileName === fileName);
    if (!target) throw new Error(`Markdown file not found: ${fileName}`);
    const existingId = parseMarkdownEntity<Record<string, unknown>>(target.content).frontmatter.id;
    if (existingId !== id) throw new Error(`Markdown entity identity changed: ${fileName}`);
    if (this.store.writeExistingMarkdownFile) {
      await this.store.writeExistingMarkdownFile(directory, fileName, content);
    } else {
      await this.store.writeMarkdownFile(directory, fileName, content);
    }
  }

  private async removeCopyAfterFailedMove(
    sourceDirectory: string, sourceFileName: string,
    copyDirectory: string, copyFileName: string, sourceError: unknown,
  ): Promise<never> {
    try {
      const sourceStillExists = (await this.store.readMarkdownFiles(sourceDirectory))
        .some((file) => file.fileName === sourceFileName);
      if (!sourceStillExists) {
        throw new Error(`Source disappeared after delete failure: ${sourceDirectory}/${sourceFileName}`);
      }
    } catch (verificationError) {
      throw new AggregateError(
        [sourceError, verificationError],
        `Move partially completed: new copy was kept because source could not be verified (${copyDirectory}/${copyFileName}).`,
      );
    }
    try {
      await this.store.deleteMarkdownFile(copyDirectory, copyFileName);
    } catch (cleanupError) {
      throw new AggregateError(
        [sourceError, cleanupError],
        `Move partially completed: both source and new copy remain (${copyDirectory}/${copyFileName}).`,
      );
    }
    throw sourceError;
  }

  async initialize(): Promise<void> {
    const dataFolder = await this.store.getDataFolder();
    if (dataFolder === '') {
      // Selected folder IS the data root — use relative paths
      this.dirs = {
        root: '',
        objects: 'Objects',
        accounts: 'Accounts',
        snapshots: 'Snapshots',
        reviews: 'Reviews',
        objectLogs: 'Logs/Object Experiences',
        archive: 'Archive',
        objectArchive: 'Archive/Objects',
        accountArchive: 'Archive/Accounts',
        snapshotArchive: 'Archive/Snapshots',
        reviewArchive: 'Archive/Reviews',
        objectLogArchive: 'Archive/Object Logs',
      };
    } else {
      this.dirs = createWYQDDirectories(dataFolder);
    }
  }

  getDataFolderPath(): string {
    return this.dirs.root;
  }

  private now(): Date {
    return this.clock();
  }

  private async getAvailableFileName(directory: string, preferredFileName: string): Promise<string> {
    const existingNames = new Set(
      (await this.store.readMarkdownFiles(directory)).map((file) => file.fileName),
    );
    if (!existingNames.has(preferredFileName)) return preferredFileName;

    const extensionIndex = preferredFileName.toLowerCase().endsWith('.md')
      ? preferredFileName.length - 3
      : preferredFileName.length;
    const base = preferredFileName.slice(0, extensionIndex);
    const extension = preferredFileName.slice(extensionIndex);

    let suffix = 2;
    let candidate = `${base}--${suffix}${extension}`;
    while (existingNames.has(candidate)) {
      suffix += 1;
      candidate = `${base}--${suffix}${extension}`;
    }
    return candidate;
  }

  private async archiveEntity(
    sourceDirectory: string,
    archiveDirectory: string,
    fileName: string,
  ): Promise<string> {
    const files = await this.store.readMarkdownFiles(sourceDirectory);
    const target = files.find((file) => file.fileName === fileName);
    if (!target) {
      throw new Error(`Markdown file not found: ${fileName}`);
    }

    const timestamp = this.now().toISOString();
    const preferredArchiveFileName = `${timestamp.replace(/[:.]/g, '-')}--${fileName}`;
    const archiveFileName = await this.getAvailableFileName(
      archiveDirectory,
      preferredArchiveFileName,
    );
    const parsed = parseMarkdownEntity<Record<string, unknown>>(target.content);
    const content = serializeMarkdownEntity(
      {
        ...parsed.frontmatter,
        archived_at: timestamp,
        archived_from: sourceDirectory,
        original_file_name: fileName,
      },
      parsed.body,
    );

    // Write the recoverable archive copy before removing the active source.
    await this.store.writeMarkdownFile(archiveDirectory, archiveFileName, content);
    try {
      await this.store.deleteMarkdownFile(sourceDirectory, fileName);
    } catch (error) {
      return this.removeCopyAfterFailedMove(sourceDirectory, fileName, archiveDirectory, archiveFileName, error);
    }
    return archiveFileName;
  }

  private async restoreEntity(
    archiveDirectory: string,
    targetDirectory: string,
    archiveFileName: string,
  ): Promise<string> {
    const archivedFiles = await this.store.readMarkdownFiles(archiveDirectory);
    const target = archivedFiles.find((file) => file.fileName === archiveFileName);
    if (!target) {
      throw new Error(`Archived Markdown file not found: ${archiveFileName}`);
    }

    const parsed = parseMarkdownEntity<Record<string, unknown>>(target.content);
    const frontmatter = { ...parsed.frontmatter };
    const originalFileName = frontmatter.original_file_name;
    delete frontmatter.archived_at;
    delete frontmatter.archived_from;
    delete frontmatter.original_file_name;

    const preferredFileName =
      typeof originalFileName === 'string' && originalFileName.endsWith('.md')
        ? originalFileName
        : archiveFileName.replace(/^[^-]+--/, '');
    const restoreTimestamp = this.now().toISOString().replace(/[:.]/g, '-');
    const existingFiles = await this.store.readMarkdownFiles(targetDirectory);
    const existingNames = new Set(existingFiles.map((file) => file.fileName));
    const collisionSafePreferred = existingNames.has(preferredFileName)
      ? `restored-${restoreTimestamp}--${preferredFileName}`
      : preferredFileName;
    const fileName = await this.getAvailableFileName(targetDirectory, collisionSafePreferred);

    await this.store.writeMarkdownFile(
      targetDirectory,
      fileName,
      serializeMarkdownEntity(
        {
          ...frontmatter,
          updated_at: this.now().toISOString().split('T')[0],
        },
        parsed.body,
      ),
    );
    try {
      await this.store.deleteMarkdownFile(archiveDirectory, archiveFileName);
    } catch (error) {
      return this.removeCopyAfterFailedMove(archiveDirectory, archiveFileName, targetDirectory, fileName, error);
    }
    return fileName;
  }

  private async listEntities<T extends import('@/domain/types').BaseEntity>(
    directory: string,
    type: WYQDEntityType,
    warningLabel: string,
  ): Promise<WYQDStoredEntity<T>[]> {
    const files = await this.store.readMarkdownFiles(directory);
    const entities: WYQDStoredEntity<T>[] = [];

    for (const file of files) {
      try {
        const parsed = parseMarkdownEntity<Record<string, unknown>>(file.content);
        if (parsed.frontmatter.type !== type) continue;

        let frontmatter = parsed.frontmatter;
        if (type === 'review') {
          frontmatter = migrateReviewEntry(frontmatter);
        }

        entities.push({
          fileName: file.fileName,
          path: `${directory}/${file.fileName}`,
          entity: frontmatter as unknown as T,
          body: parsed.body,
        });
      } catch {
        console.warn(`Skipping invalid Ownly ${warningLabel} file:`, file.fileName);
      }
    }

    return entities;
  }

  async listObjects(): Promise<WYQDStoredEntity<WYQDObject>[]> {
    return this.listEntities<WYQDObject>(this.dirs.objects, 'object', 'object');
  }

  async listAccounts(): Promise<WYQDStoredEntity<Account>[]> {
    return [];
  }

  async listSnapshots(): Promise<WYQDStoredEntity<AccountSnapshot>[]> {
    return this.listEntities<AccountSnapshot>(
      this.dirs.snapshots,
      'snapshot',
      'snapshot',
    );
  }

  async listReviews(): Promise<WYQDStoredEntity<ReviewEntry>[]> {
    return this.listEntities<ReviewEntry>(this.dirs.reviews, 'review', 'review');
  }

  async listObjectLogs(): Promise<WYQDStoredEntity<ObjectLogEntry>[]> {
    return this.listEntities<ObjectLogEntry>(this.dirs.objectLogs, 'object_log', 'object log');
  }

  async listArchivedEntities(): Promise<WYQDArchivedStoredEntity[]> {
    const [objects, snapshots, reviews] = await Promise.all([
      this.listEntities<WYQDObject>(this.dirs.objectArchive, 'object', 'archived object')
        .then((entries) => entries.map((entry) => ({ ...entry, archiveType: 'object' as const }))),
      this.listEntities<AccountSnapshot>(this.dirs.snapshotArchive, 'snapshot', 'archived snapshot')
        .then((entries) => entries.map((entry) => ({ ...entry, archiveType: 'snapshot' as const }))),
      this.listEntities<ReviewEntry>(this.dirs.reviewArchive, 'review', 'archived review')
        .then((entries) => entries.map((entry) => ({ ...entry, archiveType: 'review' as const }))),
    ]);
    return [...objects, ...snapshots, ...reviews];
  }

  async saveObject(object: WYQDObject, body = ''): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.saveObject(object, body));
    return this.withMutationLock(async () => {
    const date = object.created_at || this.now().toISOString().split('T')[0];
    const preferredFileName = createEntityFileName(date, slugify(object.title));
    const fileName = await this.getAvailableFileName(this.dirs.objects, preferredFileName);
    const content = serializeMarkdownEntity(object, body);

    await this.store.writeMarkdownFile(this.dirs.objects, fileName, content);
    return fileName;
    });
  }

  async updateObject(fileName: string, object: WYQDObject, body = ''): Promise<void> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.updateObject(fileName, object, body));
    return this.withMutationLock(async () => {
    const content = serializeMarkdownEntity(object, body);
    await this.updateExisting(this.dirs.objects, fileName, object.id, content);
    });
  }

  async archiveObject(fileName: string): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.archiveObject(fileName));
    return this.withMutationLock(() => this.archiveEntity(this.dirs.objects, this.dirs.objectArchive, fileName));
  }

  async restoreObject(archiveFileName: string): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.restoreObject(archiveFileName));
    return this.withMutationLock(() => this.restoreEntity(
      this.dirs.objectArchive,
      this.dirs.objects,
      archiveFileName,
    ));
  }

  async saveAccount(): Promise<string> {
    throw new Error('Account management is not supported in web mode');
  }

  async updateAccount(): Promise<void> {
    throw new Error('Account management is not supported in web mode');
  }

  async archiveAccount(): Promise<string | void> {
    throw new Error('Account management is not supported in web mode');
  }

  async restoreAccount(): Promise<string> {
    throw new Error('Account management is not supported in web mode');
  }

  async saveSnapshot(snapshot: AccountSnapshot, body = ''): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.saveSnapshot(snapshot, body));
    return this.withMutationLock(async () => {
    const date = snapshot.snapshot_at || snapshot.created_at || this.now().toISOString().split('T')[0];
    const time = snapshot.created_at?.includes('T')
      ? snapshot.created_at.slice(11, 19).replaceAll(':', '')
      : undefined;
    const preferredFileName = createSnapshotFileName(date, time);
    const fileName = await this.getAvailableFileName(this.dirs.snapshots, preferredFileName);
    const content = serializeMarkdownEntity(snapshot, body);

    await this.store.writeMarkdownFile(this.dirs.snapshots, fileName, content);
    return fileName;
    });
  }

  async updateSnapshot(fileName: string, snapshot: AccountSnapshot, body = ''): Promise<void> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.updateSnapshot(fileName, snapshot, body));
    return this.withMutationLock(async () => {
    const content = serializeMarkdownEntity(snapshot, body);
    await this.updateExisting(this.dirs.snapshots, fileName, snapshot.id, content);
    });
  }

  async archiveSnapshot(fileName: string): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.archiveSnapshot(fileName));
    return this.withMutationLock(() => this.archiveEntity(
      this.dirs.snapshots,
      this.dirs.snapshotArchive,
      fileName,
    ));
  }

  async restoreSnapshot(archiveFileName: string): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.restoreSnapshot(archiveFileName));
    return this.withMutationLock(() => this.restoreEntity(
      this.dirs.snapshotArchive,
      this.dirs.snapshots,
      archiveFileName,
    ));
  }

  async saveReview(review: ReviewEntry, body = ''): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.saveReview(review, body));
    return this.withMutationLock(async () => {
    const date = review.reviewed_at || review.exited_at || review.created_at || this.now().toISOString().split('T')[0];
    const preferredFileName = createReviewFileName(date, slugify(review.title));
    const fileName = await this.getAvailableFileName(this.dirs.reviews, preferredFileName);
    const content = serializeMarkdownEntity(review, body);

    await this.store.writeMarkdownFile(this.dirs.reviews, fileName, content);
    return fileName;
    });
  }

  async updateReview(fileName: string, review: ReviewEntry, body = ''): Promise<void> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.updateReview(fileName, review, body));
    return this.withMutationLock(async () => {
    const content = serializeMarkdownEntity(review, body);
    await this.updateExisting(this.dirs.reviews, fileName, review.id, content);
    });
  }

  async archiveReview(fileName: string): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.archiveReview(fileName));
    return this.withMutationLock(() => this.archiveEntity(this.dirs.reviews, this.dirs.reviewArchive, fileName));
  }

  async restoreReview(archiveFileName: string): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.restoreReview(archiveFileName));
    return this.withMutationLock(() => this.restoreEntity(
      this.dirs.reviewArchive,
      this.dirs.reviews,
      archiveFileName,
    ));
  }

  async saveObjectLog(log: ObjectLogEntry, body = ''): Promise<string> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.saveObjectLog(log, body));
    return this.withMutationLock(async () => {
    const date = log.occurred_at || log.created_at || this.now().toISOString().split('T')[0];
    const preferredFileName = `log--${date}--${log.id}--${slugify(log.title.slice(0, 40))}.md`;
    const fileName = await this.getAvailableFileName(this.dirs.objectLogs, preferredFileName);
    const content = serializeMarkdownEntity(log, body);

    await this.store.writeMarkdownFile(this.dirs.objectLogs, fileName, content);
    return fileName;
    });
  }

  async restoreArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string): Promise<string> {
    if (archiveType === 'object') return this.restoreObject(archiveFileName);
    if (archiveType === 'snapshot') return this.restoreSnapshot(archiveFileName);
    if (archiveType === 'review') return this.restoreReview(archiveFileName);
    throw new Error('Account archive restore is not supported in web mode');
  }

  async permanentlyDeleteArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string): Promise<void> {
    if (!this.bound) return this.withBoundRepository((repository) => repository.permanentlyDeleteArchivedEntity(archiveType, archiveFileName));
    return this.withMutationLock(async () => {
    const dirMap: Record<WYQDArchiveEntityType, string> = {
      object: this.dirs.objectArchive,
      account: this.dirs.accountArchive,
      snapshot: this.dirs.snapshotArchive,
      review: this.dirs.reviewArchive,
      object_log: this.dirs.objectLogArchive,
    };
    await this.store.deleteMarkdownFile(dirMap[archiveType], archiveFileName);
    });
  }
}

export const markdownEntityRepository = new MarkdownEntityRepository();
