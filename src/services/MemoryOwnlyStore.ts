/**
 * In-memory Ownly file store.
 *
 * This is what makes Demo mode honest. Demo mode has no Ownly data folder, so
 * there is nowhere to write — the previous demo system solved that by writing
 * sample records into the user's *real* folder, which Product Governance
 * forbids and which `e654715` had to undo.
 *
 * This store satisfies the same structural contract as `obsidianService`, so
 * `MarkdownEntityRepository` and `PlannerRepository` are unchanged: reads and
 * writes both work, against a `Map` that dies with the tab. Nothing here ever
 * reaches the filesystem, so a demo session cannot leak into real data, and the
 * UI stays read-only because write actions remain gated on a connected folder.
 */
import type { MarkdownFileStore } from './MarkdownEntityRepository';

export interface MemoryOwnlyStore extends MarkdownFileStore {
  /** Simulates losing folder permission: everything becomes unreachable. */
  detach(): void;
  readonly isAttached: boolean;
}

export const MEMORY_DATA_FOLDER = 'Ownly';

export class MemoryOwnlyFileStore implements MemoryOwnlyStore {
  /** directory path -> fileName -> content */
  private readonly files = new Map<string, Map<string, string>>();
  private attached = true;

  get isAttached(): boolean {
    return this.attached;
  }

  async getDataFolder(): Promise<string> {
    return MEMORY_DATA_FOLDER;
  }

  async readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]> {
    if (!this.attached) return [];
    const bucket = this.files.get(directory);
    if (!bucket) return [];
    return [...bucket.entries()].map(([fileName, content]) => ({ fileName, content }));
  }

  async writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void> {
    if (!this.attached) throw new Error('Demo store is detached; no data folder is connected.');
    const bucket = this.files.get(directory) ?? new Map<string, string>();
    this.files.set(directory, bucket);
    bucket.set(fileName, content);
  }

  async deleteMarkdownFile(directory: string, fileName: string): Promise<void> {
    if (!this.attached) return;
    this.files.get(directory)?.delete(fileName);
  }

  /**
   * Direct seeding, bypassing the filename derivation the repositories do.
   * Used to place a bundled dataset into the store before any repository
   * caches its data root.
   */
  seed(directory: string, files: ReadonlyArray<{ fileName: string; content: string }>): void {
    const bucket = this.files.get(directory) ?? new Map<string, string>();
    this.files.set(directory, bucket);
    for (const file of files) bucket.set(file.fileName, file.content);
  }

  snapshot(): Array<{ directory: string; fileName: string; content: string }> {
    return [...this.files.entries()].flatMap(([directory, bucket]) =>
      [...bucket.entries()].map(([fileName, content]) => ({ directory, fileName, content })),
    );
  }

  clear(): void {
    this.files.clear();
  }

  detach(): void {
    this.attached = false;
    this.files.clear();
  }

  attach(): void {
    this.attached = true;
  }
}