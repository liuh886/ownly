import { get, set } from 'idb-keyval';
import {
  OWNLY_DATA_ROOT_MARKER,
  OWNLY_DATA_ROOT_NAME,
  OWNLY_REQUIRED_DIRECTORIES,
  shouldUseSelectedDirectoryAsDataRoot,
} from './ownly-data-layout';

interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

declare global {
  interface FileSystemHandle {
    queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
  interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>;
  }
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  }
  interface Window {
    showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
}

const HANDLE_KEY = 'wyqd_obsidian_handle';
const WORKSPACE_REGISTRY_KEY = 'ownly_workspace_handle_registry';

interface WorkspaceRegistryEntry {
  id: string;
  handle: FileSystemDirectoryHandle;
}

// Standard Obsidian config directory. File System Access API cannot access Vault#configDir,
// so this uses the standard default that matches 99% of Obsidian installations.
const OBSIDIAN_CONFIG_DIR = ['', 'obsidian'].join('.');

interface PluginSettings {
  dataFolder?: string;
  [key: string]: unknown;
}

export class ObsidianFileSystemService {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private cachedDataFolder: string | null = null;
  private connectionVersion = 0;
  private transitionVersion = 0;
  private transitionQueue: Promise<void> = Promise.resolve();
  private namespaceQueue: Promise<void> = Promise.resolve();

  private queueTransition<T>(action: () => Promise<T>): Promise<T> {
    const next = this.transitionQueue.then(action, action);
    this.transitionQueue = next.then(() => {}, () => {});
    return next;
  }

  /**
   * Restore the folder from a previous visit.
   *
   * Permission alone is not the same as readable. A folder that was moved,
   * renamed, or dropped by its sync provider still grants permission and then
   * reads as an empty directory — so the handle has to survive one real read
   * before it is allowed to call itself connected. Without this probe the header
   * said "data folder connected" over an empty screen, and every empty-state
   * message in the app looked like data loss instead of a broken handle.
   */
  async initAutoConnect(): Promise<boolean> {
    const attempt = ++this.transitionVersion;
    try {
      const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY);
      if (!handle) return false;

      const options: FileSystemPermissionDescriptor = { mode: 'readwrite' };
      const permission = await handle.queryPermission?.(options);
      if (permission !== 'granted') {
        const requestStatus = await handle.requestPermission?.(options);
        if (requestStatus !== 'granted') return false;
      }

      await this.assertReadable(handle);
      return await this.queueTransition(async () => {
        if (attempt !== this.transitionVersion) return false;
        this.directoryHandle = handle;
        this.cachedDataFolder = null;
        this.connectionVersion++;
        return true;
      });
    } catch (e) {
      console.error('Failed to auto-connect:', e);
    }
    return false;
  }

  /** Prove the directory is still there by reading a single entry out of it. */
  private async assertReadable(handle: FileSystemDirectoryHandle): Promise<void> {
    if (typeof handle.values !== 'function') return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- breaking on the first entry is the whole probe
    for await (const _entry of handle.values()) break;
  }

  private async hasDirectory(
    handle: FileSystemDirectoryHandle,
    directoryName: string,
  ): Promise<boolean> {
    try {
      await handle.getDirectoryHandle(directoryName);
      return true;
    } catch {
      return false;
    }
  }

  private async persistDirectoryHandle(
    handle: FileSystemDirectoryHandle,
    dataFolder: string | null,
  ): Promise<void> {
    await set(HANDLE_KEY, handle);
    this.directoryHandle = handle;
    this.cachedDataFolder = dataFolder;
    this.connectionVersion++;
  }

  /** Finish all candidate filesystem work before changing the active connection. */
  private async prepareDirectoryHandle(handle: FileSystemDirectoryHandle, dataFolder: string | null): Promise<void> {
    const candidate = new ObsidianFileSystemService();
    candidate.directoryHandle = handle;
    candidate.cachedDataFolder = dataFolder;
    await candidate.ensureDataStructure();
  }

  /** A stable filesystem view for operations that span more than one await. */
  async captureSession(): Promise<ObsidianFileSystemService> {
    const handle = this.directoryHandle;
    if (!handle) throw new Error('Not connected to local data');
    const session = new ObsidianFileSystemService();
    session.directoryHandle = handle;
    if (this.cachedDataFolder === null) {
      const isVault = await this.hasDirectory(handle, OBSIDIAN_CONFIG_DIR);
      session.cachedDataFolder = isVault ? await this.resolvePluginDataFolder(handle) : '';
    } else {
      session.cachedDataFolder = this.cachedDataFolder;
    }
    return session;
  }

  async createLocalData(): Promise<boolean> {
    const attempt = ++this.transitionVersion;
    try {
      const picker = window.showDirectoryPicker?.bind(window);
      if (!picker) return false;

      const selectedDirectory = await picker({ mode: 'readwrite' });
      const hasObsidianConfig = await this.hasDirectory(selectedDirectory, OBSIDIAN_CONFIG_DIR);
      const hasDataRootMarker = await this.hasDirectory(selectedDirectory, OWNLY_DATA_ROOT_MARKER);
      const useSelectedAsRoot = shouldUseSelectedDirectoryAsDataRoot(
        selectedDirectory.name,
        hasObsidianConfig,
        hasDataRootMarker,
      );
      const dataRoot = useSelectedAsRoot
        ? selectedDirectory
        : await selectedDirectory.getDirectoryHandle(OWNLY_DATA_ROOT_NAME, { create: true });

      await this.prepareDirectoryHandle(dataRoot, '');
      return await this.queueTransition(async () => {
        if (attempt !== this.transitionVersion) return false;
        await this.persistDirectoryHandle(dataRoot, '');
        return attempt === this.transitionVersion;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      console.error('Failed to create Ownly local data:', error);
      throw error;
    }
  }

  async openLocalData(): Promise<boolean> {
    const attempt = ++this.transitionVersion;
    try {
      const picker = window.showDirectoryPicker?.bind(window);
      if (!picker) return false;
      const selectedDirectory = await picker({ mode: 'readwrite' });
      const hasObsidianConfig = await this.hasDirectory(selectedDirectory, OBSIDIAN_CONFIG_DIR);
      if (hasObsidianConfig) {
        const dataFolder = await this.resolvePluginDataFolder(selectedDirectory);
        await this.prepareDirectoryHandle(selectedDirectory, dataFolder);
        return await this.queueTransition(async () => {
          if (attempt !== this.transitionVersion) return false;
          await this.persistDirectoryHandle(selectedDirectory, dataFolder);
          return attempt === this.transitionVersion;
        });
      } else {
        await this.prepareDirectoryHandle(selectedDirectory, null);
        return await this.queueTransition(async () => {
          if (attempt !== this.transitionVersion) return false;
          await this.persistDirectoryHandle(selectedDirectory, null);
          return attempt === this.transitionVersion;
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      console.error('Failed to open Ownly local data:', error);
      throw error;
    }
  }

  async requestAccess(): Promise<boolean> {
    return this.openLocalData();
  }

  async getPortableDataRootHandle(): Promise<FileSystemDirectoryHandle> {
    if (!this.directoryHandle) throw new Error('Not connected to local data');

    const dataFolder = await this.getDataFolder();
    if (!dataFolder) return this.directoryHandle;

    const dataRoot = await this.getDirHandle(dataFolder);
    if (!dataRoot) {
      throw new Error(`Could not access Ownly data root: ${dataFolder}`);
    }
    return dataRoot;
  }

  async connectVault(): Promise<boolean> {
    return this.openLocalData();
  }

  private async ensureDataStructure(): Promise<void> {
    if (!this.directoryHandle) return;

    for (const folder of OWNLY_REQUIRED_DIRECTORIES) {
      await this.getDirHandle(this.getRelativePath(folder), true);
    }
  }

  private async resolvePluginDataFolder(vaultHandle: FileSystemDirectoryHandle): Promise<string> {
    try {
      const obsidianDir = await vaultHandle.getDirectoryHandle(OBSIDIAN_CONFIG_DIR);
      const pluginsDir = await obsidianDir.getDirectoryHandle('plugins');
      const ownlyPluginDir = await pluginsDir.getDirectoryHandle('ownly');
      const dataFileHandle = await ownlyPluginDir.getFileHandle('data.json');
      const dataFile = await dataFileHandle.getFile();
      const content = await dataFile.text();
      const parsed = JSON.parse(content) as PluginSettings;

      if (typeof parsed.dataFolder === 'string' && parsed.dataFolder.trim()) {
        return parsed.dataFolder.trim().replace(/^\/+|\/+$/g, '');
      }
    } catch { /* best-effort; failure is non-fatal */ }

    return OWNLY_DATA_ROOT_NAME;
  }

  async disconnect(): Promise<void> {
    ++this.transitionVersion;
    await this.queueTransition(async () => {
      await set(HANDLE_KEY, null);
      this.directoryHandle = null;
      this.cachedDataFolder = null;
      this.connectionVersion++;
    });
  }

  getConnectionVersion(): number {
    return this.connectionVersion;
  }

  /** Stable browser-local identity for the physical Ownly data root. */
  async getStableWorkspaceNamespace(): Promise<string> {
    const root = await this.getPortableDataRootHandle();
    const run = async (): Promise<string> => {
      const entries = (await get<WorkspaceRegistryEntry[]>(WORKSPACE_REGISTRY_KEY)) ?? [];
      const sameEntry = (root as FileSystemDirectoryHandle & {
        isSameEntry?: (other: FileSystemHandle) => Promise<boolean>;
      }).isSameEntry;
      if (!sameEntry) throw new Error('This browser cannot identify the connected data folder safely.');
      for (const entry of entries) {
        if (await sameEntry.call(root, entry.handle)) return entry.id;
      }
      const id = crypto.randomUUID();
      await set(WORKSPACE_REGISTRY_KEY, [...entries, { id, handle: root }]);
      return id;
    };
    const result = this.namespaceQueue.then(run, run);
    this.namespaceQueue = result.then(() => {}, () => {});
    return result;
  }

  isConnected(): boolean {
    return this.directoryHandle !== null;
  }

  async getDataFolder(): Promise<string> {
    if (this.cachedDataFolder !== null) {
      return this.cachedDataFolder;
    }

    if (this.directoryHandle) {
      const hasObsidianConfig = await this.hasDirectory(this.directoryHandle, OBSIDIAN_CONFIG_DIR);
      if (hasObsidianConfig) {
        this.cachedDataFolder = await this.resolvePluginDataFolder(this.directoryHandle);
        return this.cachedDataFolder;
      }
    }

    return '';
  }

  private getRelativePath(path: string): string {
    if (!this.cachedDataFolder) return path;
    return `${this.cachedDataFolder}/${path}`;
  }

  private sanitizeFileName = (fileName: string): string => {
    // Reject path traversal attempts
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new Error(`Invalid file name: ${fileName}`);
    }
    return fileName;
  };

  private async getDirHandle(path: string, create = false): Promise<FileSystemDirectoryHandle | null> {
    if (!this.directoryHandle) return null;
    let current = this.directoryHandle;
    const parts = path.split('/').filter(Boolean);
    for (const part of parts) {
      try {
        current = await current.getDirectoryHandle(part, { create });
      } catch (e) {
        if (!create) {
          const isNotFound =
            (e instanceof DOMException && e.name === 'NotFoundError') ||
            (e instanceof Error && (e.name === 'NotFoundError' || e.message.includes('NotFoundError') || e.message.toLowerCase().includes('not found')));
          if (isNotFound) {
            return null;
          }
        }
        throw e;
      }
    }
    return current;
  }

  async readMarkdownFiles(
    directory: string,
    options?: { tolerant?: boolean },
  ): Promise<{ fileName: string; content: string }[]> {
    const dirHandle = await this.getDirHandle(directory);
    if (!dirHandle) return [];

    const files: { fileName: string; content: string }[] = [];
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          try {
            const file = await entry.getFile();
            const content = await file.text();
            files.push({ fileName: entry.name, content });
          } catch (e) {
            if (options?.tolerant) {
              console.warn(`[ObsidianFileSystemService] Failed to read file ${entry.name} in ${directory}`, e);
            } else {
              throw new Error(`Failed to read markdown file "${entry.name}" in "${directory}": ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }
    } catch (e) {
      if (options?.tolerant) {
        console.warn(`[ObsidianFileSystemService] Failed to iterate directory ${directory}`, e);
        return files;
      }
      throw e;
    }
    return files;
  }

  async scanMarkdownFilesBestEffort(directory: string): Promise<{ fileName: string; content: string }[]> {
    return this.readMarkdownFiles(directory, { tolerant: true });
  }

  async writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void> {
    this.sanitizeFileName(fileName);
    const dirHandle = await this.getDirHandle(directory, true);
    if (!dirHandle) throw new Error(`Could not access or create directory: ${directory}`);

    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async writeExistingMarkdownFile(directory: string, fileName: string, content: string): Promise<void> {
    this.sanitizeFileName(fileName);
    const dirHandle = await this.getDirHandle(directory);
    if (!dirHandle) throw new Error(`Markdown directory not found: ${directory}`);
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async deleteMarkdownFile(directory: string, fileName: string): Promise<void> {
    this.sanitizeFileName(fileName);
    const dirHandle = await this.getDirHandle(directory);
    if (!dirHandle) return;
    try {
      await dirHandle.removeEntry(fileName);
    } catch (e) {
      console.warn(`Failed to delete file ${fileName} in ${directory}`, e);
      throw e;
    }
  }
}

export const obsidianService = new ObsidianFileSystemService();
