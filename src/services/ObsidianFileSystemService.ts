import { get, set } from 'idb-keyval';
import {
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

  async initAutoConnect(): Promise<boolean> {
    try {
      const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY);
      if (handle) {
        const options: FileSystemPermissionDescriptor = { mode: 'readwrite' };
        const permission = await handle.queryPermission?.(options);

        if (permission === 'granted') {
          this.directoryHandle = handle;
          return true;
        }

        const requestStatus = await handle.requestPermission?.(options);
        if (requestStatus === 'granted') {
          this.directoryHandle = handle;
          return true;
        }
      }
    } catch (e) {
      console.error('Failed to auto-connect:', e);
    }
    return false;
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
    this.directoryHandle = handle;
    this.cachedDataFolder = dataFolder;
    await set(HANDLE_KEY, handle);
  }

  async createLocalData(): Promise<boolean> {
    try {
      const picker = window.showDirectoryPicker;
      if (!picker) return false;

      const selectedDirectory = await picker({ mode: 'readwrite' });
      const hasObsidianConfig = await this.hasDirectory(selectedDirectory, OBSIDIAN_CONFIG_DIR);
      const useSelectedAsRoot = shouldUseSelectedDirectoryAsDataRoot(
        selectedDirectory.name,
        hasObsidianConfig,
      );
      const dataRoot = useSelectedAsRoot
        ? selectedDirectory
        : await selectedDirectory.getDirectoryHandle(OWNLY_DATA_ROOT_NAME, { create: true });

      await this.persistDirectoryHandle(dataRoot, '');
      await this.ensureDataStructure();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      console.error('Failed to create Ownly local data:', error);
      throw error;
    }
  }

  async openLocalData(): Promise<boolean> {
    try {
      const picker = window.showDirectoryPicker;
      if (!picker) return false;
      const selectedDirectory = await picker({ mode: 'readwrite' });
      const hasObsidianConfig = await this.hasDirectory(selectedDirectory, OBSIDIAN_CONFIG_DIR);
      if (hasObsidianConfig) {
        const dataFolder = await this.resolvePluginDataFolder(selectedDirectory);
        await this.persistDirectoryHandle(selectedDirectory, dataFolder);
      } else {
        await this.persistDirectoryHandle(selectedDirectory, null);
      }
      await this.ensureDataStructure();
      return true;
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
    } catch {}

    return OWNLY_DATA_ROOT_NAME;
  }

  async disconnect(): Promise<void> {
    this.directoryHandle = null;
    this.cachedDataFolder = null;
    await set(HANDLE_KEY, null);
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
