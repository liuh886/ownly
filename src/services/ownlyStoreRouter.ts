/**
 * Ownly file-store router.
 *
 * `MarkdownEntityRepository` and `PlannerRepository` both default to
 * `obsidianService`, which resolves to the real filesystem and returns nothing
 * useful when no folder is connected. That left Demo mode blank on every tab.
 *
 * This router is the single default for both: the filesystem when a folder is
 * connected, the in-memory store otherwise. Because `PlannerFileStore` and
 * `MarkdownFileStore` are structurally identical, one router satisfies both
 * without either repository changing how it resolves its default.
 *
 * Write safety does not depend on this switch. Every write action in the UI is
 * already gated on a connected folder (`disabled={!isConnected}`), so in-memory
 * writes only happen during an explicit demo seed and can never reach disk.
 */
import { obsidianService } from './ObsidianFileSystemService';
import { MemoryOwnlyFileStore } from './MemoryOwnlyStore';

export interface RoutedFileStore {
  getDataFolder(): Promise<string>;
  readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]>;
  writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void>;
  deleteMarkdownFile(directory: string, fileName: string): Promise<void>;
}

export const memoryOwnlyStore = new MemoryOwnlyFileStore();

/**
 * Defaults to the filesystem, which is the pre-router behavior for every
 * caller that does not opt into demo mode (including tests, which mock
 * `obsidianService` directly). Only the shell flips this off, and only when no
 * folder is connected — `initAutoConnect` is the authority, not this flag.
 */
let folderConnected = true;
let memorySeeded = false;

/** Mirror of the shell's connection state. */
export function setStoreFolderConnected(connected: boolean): void {
  if (folderConnected === connected) return;
  folderConnected = connected;
  if (connected) {
    // Demo data is not real data. Connecting a folder discards it rather than
    // migrating it — silently promoting a demo record would violate the same
    // rule that removed the old auto-seeding demo system.
    memoryOwnlyStore.detach();
    memorySeeded = false;
  } else {
    memoryOwnlyStore.attach();
  }
}

export function isStoreFolderConnected(): boolean {
  return folderConnected;
}

export function markMemoryStoreSeeded(): void {
  memorySeeded = true;
}

export function hasSeededMemoryStore(): boolean {
  return memorySeeded;
}

export function resetMemoryStore(): void {
  memoryOwnlyStore.detach();
  memorySeeded = false;
}

export function attachMemoryStore(): void {
  memoryOwnlyStore.attach();
}

export const ownlyStoreRouter: RoutedFileStore = {
  getDataFolder: () =>
    folderConnected ? obsidianService.getDataFolder() : memoryOwnlyStore.getDataFolder(),
  readMarkdownFiles: (directory) =>
    folderConnected
      ? obsidianService.readMarkdownFiles(directory)
      : memoryOwnlyStore.readMarkdownFiles(directory),
  writeMarkdownFile: (directory, fileName, content) =>
    folderConnected
      ? obsidianService.writeMarkdownFile(directory, fileName, content)
      : memoryOwnlyStore.writeMarkdownFile(directory, fileName, content),
  deleteMarkdownFile: (directory, fileName) =>
    folderConnected
      ? obsidianService.deleteMarkdownFile(directory, fileName)
      : memoryOwnlyStore.deleteMarkdownFile(directory, fileName),
};