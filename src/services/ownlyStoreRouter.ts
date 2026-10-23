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
 * The routed memory view rejects user writes. Demo seeding binds repositories
 * directly to memory, so switching this router during a seed cannot write
 * examples into a real folder.
 */
import { obsidianService } from './ObsidianFileSystemService';
import { MemoryOwnlyFileStore } from './MemoryOwnlyStore';

export interface RoutedFileStore {
  getDataFolder(): Promise<string>;
  readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]>;
  writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void>;
  deleteMarkdownFile(directory: string, fileName: string): Promise<void>;
  writeExistingMarkdownFile?(directory: string, fileName: string, content: string): Promise<void>;
  captureSession?(): Promise<RoutedFileStore>;
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
let routeVersion = 0;

export function captureWorkspaceIdentity(): string {
  return `${routeVersion}:${folderConnected}:${obsidianService.getConnectionVersion?.() ?? 0}`;
}

export function isWorkspaceIdentityCurrent(identity: string): boolean {
  return identity === captureWorkspaceIdentity();
}

/** Stable namespace for browser-local credentials; never falls back to a folder name. */
export async function getStableWorkspaceNamespace(): Promise<string> {
  if (!folderConnected) throw new Error('Connect a data folder before publishing.');
  const identity = captureWorkspaceIdentity();
  const namespace = await obsidianService.getStableWorkspaceNamespace();
  if (!isWorkspaceIdentityCurrent(identity)) throw new Error('Data folder changed while identifying it.');
  return namespace;
}

/** Mirror of the shell's connection state. */
export function setStoreFolderConnected(connected: boolean): void {
  if (folderConnected === connected) return;
  folderConnected = connected;
  routeVersion++;
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
  captureSession: async () => folderConnected
    ? (obsidianService.captureSession?.() ?? obsidianService)
    : {
        getDataFolder: () => memoryOwnlyStore.getDataFolder(),
        readMarkdownFiles: (directory) => memoryOwnlyStore.readMarkdownFiles(directory),
        writeMarkdownFile: () => Promise.reject(new Error('Demo mode is read-only. Connect a data folder to save changes.')),
        deleteMarkdownFile: () => Promise.reject(new Error('Demo mode is read-only. Connect a data folder to delete records.')),
      },
  getDataFolder: () =>
    folderConnected ? obsidianService.getDataFolder() : memoryOwnlyStore.getDataFolder(),
  readMarkdownFiles: (directory) =>
    folderConnected
      ? obsidianService.readMarkdownFiles(directory)
      : memoryOwnlyStore.readMarkdownFiles(directory),
  writeMarkdownFile: (directory, fileName, content) =>
    folderConnected
      ? obsidianService.writeMarkdownFile(directory, fileName, content)
      : Promise.reject(new Error('Demo mode is read-only. Connect a data folder to save changes.')),
  writeExistingMarkdownFile: (directory, fileName, content) =>
    folderConnected
      ? obsidianService.writeExistingMarkdownFile(directory, fileName, content)
      : Promise.reject(new Error('Demo mode is read-only. Connect a data folder to save changes.')),
  deleteMarkdownFile: (directory, fileName) =>
    folderConnected
      ? obsidianService.deleteMarkdownFile(directory, fileName)
      : Promise.reject(new Error('Demo mode is read-only. Connect a data folder to delete records.')),
};
