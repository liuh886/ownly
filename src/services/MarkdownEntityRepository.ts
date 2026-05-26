import {
  WYQD_DIRECTORIES,
  createEntityFileName,
  createReviewFileName,
  createSnapshotFileName,
  slugify,
} from '@/data/paths';
import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import type { AccountSnapshot, ReviewEntry, WYQDObject, WYQDEntityType } from '@/domain/types';
import { obsidianService } from './ObsidianFileSystemService';

export interface StoredEntity<T> {
  fileName: string;
  entity: T;
  body: string;
}

export type ArchiveEntityType = 'object' | 'snapshot' | 'review';

export type ArchivedStoredEntity =
  | (StoredEntity<WYQDObject> & { archiveType: 'object' })
  | (StoredEntity<AccountSnapshot> & { archiveType: 'snapshot' })
  | (StoredEntity<ReviewEntry> & { archiveType: 'review' });

export class MarkdownEntityRepository {
  private async archiveEntity(
    sourceDirectory: string,
    archiveDirectory: string,
    fileName: string,
  ): Promise<string> {
    const files = await obsidianService.readMarkdownFiles(sourceDirectory);
    const target = files.find((file) => file.fileName === fileName);
    if (!target) {
      throw new Error(`Markdown file not found: ${fileName}`);
    }

    const timestamp = new Date().toISOString();
    const archiveFileName = `${timestamp.replace(/[:.]/g, '-')}--${fileName}`;
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

    await obsidianService.writeMarkdownFile(archiveDirectory, archiveFileName, content);
    await obsidianService.deleteMarkdownFile(sourceDirectory, fileName);
    return archiveFileName;
  }

  private async restoreEntity(
    archiveDirectory: string,
    targetDirectory: string,
    archiveFileName: string,
  ): Promise<string> {
    const archivedFiles = await obsidianService.readMarkdownFiles(archiveDirectory);
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
    const existingFiles = await obsidianService.readMarkdownFiles(targetDirectory);
    const preferredFileName =
      typeof originalFileName === 'string' && originalFileName.endsWith('.md')
        ? originalFileName
        : archiveFileName.replace(/^[^-]+--/, '');
    const fileName = existingFiles.some((file) => file.fileName === preferredFileName)
      ? `restored-${new Date().toISOString().replace(/[:.]/g, '-')}--${preferredFileName}`
      : preferredFileName;

    await obsidianService.writeMarkdownFile(
      targetDirectory,
      fileName,
      serializeMarkdownEntity(
        {
          ...frontmatter,
          updated_at: new Date().toISOString().split('T')[0],
        },
        parsed.body,
      ),
    );
    await obsidianService.deleteMarkdownFile(archiveDirectory, archiveFileName);
    return fileName;
  }

  private async listEntities<T>(
    directory: string,
    type: WYQDEntityType,
    warningLabel: string,
  ): Promise<StoredEntity<T>[]> {
    const files = await obsidianService.readMarkdownFiles(directory);
    const entities: StoredEntity<T>[] = [];

    for (const file of files) {
      try {
        const parsed = parseMarkdownEntity<Record<string, unknown>>(file.content);
        if (parsed.frontmatter.type !== type) continue;

        entities.push({
          fileName: file.fileName,
          entity: parsed.frontmatter as unknown as T,
          body: parsed.body,
        });
      } catch {
        console.warn(`Skipping invalid Ownly ${warningLabel} file:`, file.fileName);
      }
    }

    return entities;
  }

  async listObjects(): Promise<StoredEntity<WYQDObject>[]> {
    return this.listEntities<WYQDObject>(WYQD_DIRECTORIES.objects, 'object', 'object');
  }

  async listArchivedObjects(): Promise<Array<StoredEntity<WYQDObject> & { archiveType: 'object' }>> {
    const entries = await this.listEntities<WYQDObject>(
      WYQD_DIRECTORIES.objectArchive,
      'object',
      'archived object',
    );
    return entries.map((entry) => ({ ...entry, archiveType: 'object' as const }));
  }

  async saveObject(object: WYQDObject, body = ''): Promise<string> {
    const date = object.created_at || new Date().toISOString().split('T')[0];
    const fileName = createEntityFileName(date, slugify(object.title));
    const content = serializeMarkdownEntity(object as unknown as Record<string, unknown>, body);

    await obsidianService.writeMarkdownFile(WYQD_DIRECTORIES.objects, fileName, content);
    return fileName;
  }

  async updateObject(fileName: string, object: WYQDObject, body = ''): Promise<void> {
    const content = serializeMarkdownEntity(object as unknown as Record<string, unknown>, body);
    await obsidianService.writeMarkdownFile(WYQD_DIRECTORIES.objects, fileName, content);
  }

  async deleteObject(fileName: string): Promise<void> {
    await this.archiveEntity(WYQD_DIRECTORIES.objects, WYQD_DIRECTORIES.objectArchive, fileName);
  }

  async restoreObject(archiveFileName: string): Promise<string> {
    return this.restoreEntity(
      WYQD_DIRECTORIES.objectArchive,
      WYQD_DIRECTORIES.objects,
      archiveFileName,
    );
  }

  async listSnapshots(): Promise<StoredEntity<AccountSnapshot>[]> {
    return this.listEntities<AccountSnapshot>(
      WYQD_DIRECTORIES.snapshots,
      'snapshot',
      'snapshot',
    );
  }

  async listArchivedSnapshots(): Promise<
    Array<StoredEntity<AccountSnapshot> & { archiveType: 'snapshot' }>
  > {
    const entries = await this.listEntities<AccountSnapshot>(
      WYQD_DIRECTORIES.snapshotArchive,
      'snapshot',
      'archived snapshot',
    );
    return entries.map((entry) => ({ ...entry, archiveType: 'snapshot' as const }));
  }

  async saveSnapshot(snapshot: AccountSnapshot, body = ''): Promise<string> {
    const date = snapshot.snapshot_at || snapshot.created_at || new Date().toISOString().split('T')[0];
    const time = snapshot.created_at?.includes('T')
      ? snapshot.created_at.slice(11, 19).replaceAll(':', '')
      : undefined;
    const fileName = createSnapshotFileName(date, time);
    const content = serializeMarkdownEntity(snapshot as unknown as Record<string, unknown>, body);

    await obsidianService.writeMarkdownFile(WYQD_DIRECTORIES.snapshots, fileName, content);
    return fileName;
  }

  async updateSnapshot(fileName: string, snapshot: AccountSnapshot, body = ''): Promise<void> {
    const content = serializeMarkdownEntity(snapshot as unknown as Record<string, unknown>, body);
    await obsidianService.writeMarkdownFile(WYQD_DIRECTORIES.snapshots, fileName, content);
  }

  async deleteSnapshot(fileName: string): Promise<void> {
    await this.archiveEntity(
      WYQD_DIRECTORIES.snapshots,
      WYQD_DIRECTORIES.snapshotArchive,
      fileName,
    );
  }

  async restoreSnapshot(archiveFileName: string): Promise<string> {
    return this.restoreEntity(
      WYQD_DIRECTORIES.snapshotArchive,
      WYQD_DIRECTORIES.snapshots,
      archiveFileName,
    );
  }

  async listReviews(): Promise<StoredEntity<ReviewEntry>[]> {
    return this.listEntities<ReviewEntry>(WYQD_DIRECTORIES.reviews, 'review', 'review');
  }

  async listArchivedReviews(): Promise<Array<StoredEntity<ReviewEntry> & { archiveType: 'review' }>> {
    const entries = await this.listEntities<ReviewEntry>(
      WYQD_DIRECTORIES.reviewArchive,
      'review',
      'archived review',
    );
    return entries.map((entry) => ({ ...entry, archiveType: 'review' as const }));
  }

  async saveReview(review: ReviewEntry, body = ''): Promise<string> {
    const date = review.reviewed_at || review.exited_at || review.created_at || new Date().toISOString().split('T')[0];
    const fileName = createReviewFileName(date, slugify(review.title));
    const content = serializeMarkdownEntity(review as unknown as Record<string, unknown>, body);

    await obsidianService.writeMarkdownFile(WYQD_DIRECTORIES.reviews, fileName, content);
    return fileName;
  }

  async updateReview(fileName: string, review: ReviewEntry, body = ''): Promise<void> {
    const content = serializeMarkdownEntity(review as unknown as Record<string, unknown>, body);
    await obsidianService.writeMarkdownFile(WYQD_DIRECTORIES.reviews, fileName, content);
  }

  async deleteReview(fileName: string): Promise<void> {
    await this.archiveEntity(WYQD_DIRECTORIES.reviews, WYQD_DIRECTORIES.reviewArchive, fileName);
  }

  async restoreReview(archiveFileName: string): Promise<string> {
    return this.restoreEntity(
      WYQD_DIRECTORIES.reviewArchive,
      WYQD_DIRECTORIES.reviews,
      archiveFileName,
    );
  }

  async listArchivedEntities(): Promise<ArchivedStoredEntity[]> {
    const [objects, snapshots, reviews] = await Promise.all([
      this.listArchivedObjects(),
      this.listArchivedSnapshots(),
      this.listArchivedReviews(),
    ]);
    return [...objects, ...snapshots, ...reviews];
  }

  async restoreArchivedEntity(archiveType: ArchiveEntityType, archiveFileName: string): Promise<string> {
    if (archiveType === 'object') return this.restoreObject(archiveFileName);
    if (archiveType === 'snapshot') return this.restoreSnapshot(archiveFileName);
    return this.restoreReview(archiveFileName);
  }
}

export const markdownEntityRepository = new MarkdownEntityRepository();
