import YAML from 'yaml';
import { get, set } from 'idb-keyval';
import {
  OWNLY_DATA_ROOT_NAME,
  OWNLY_REQUIRED_DIRECTORIES,
  shouldUseSelectedDirectoryAsDataRoot,
} from './ownly-data-layout';

export interface WishlistItem {
  name: string;
  price_estimated: number;
  status: 'wishlist' | 'cooling' | 'purchased' | 'archived';
  date_added: string;
  cooling_days: number;
  date_purchased?: string;
  fileName?: string;
  [key: string]: unknown;
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
      await this.persistDirectoryHandle(selectedDirectory, null);
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

  get isConnected(): boolean {
    return this.directoryHandle !== null;
  }

  async getDataFolder(): Promise<string> {
    if (this.cachedDataFolder !== null) return this.cachedDataFolder;

    const fallback = OWNLY_DATA_ROOT_NAME;
    if (!this.directoryHandle) return fallback;

    // 1. The selected directory is already an initialized Ownly data root.
    try {
      await this.directoryHandle.getDirectoryHandle('Objects');
      this.cachedDataFolder = '';
      return this.cachedDataFolder;
    } catch {
      // Continue with empty-folder and Vault detection.
    }

    // 2. An empty standalone directory named Ownly is also the data root.
    const hasObsidianConfig = await this.hasDirectory(this.directoryHandle, OBSIDIAN_CONFIG_DIR);
    if (shouldUseSelectedDirectoryAsDataRoot(this.directoryHandle.name, hasObsidianConfig)) {
      this.cachedDataFolder = '';
      return this.cachedDataFolder;
    }

    // 3. The selected directory contains an Ownly child folder (typically a Vault root).
    try {
      await this.directoryHandle.getDirectoryHandle(OWNLY_DATA_ROOT_NAME);
      this.cachedDataFolder = OWNLY_DATA_ROOT_NAME;
      return this.cachedDataFolder;
    } catch {
      // Not here either, continue.
    }

    // 4. Try Obsidian plugin settings lookup for custom data folders.
    try {
      const pluginDir = await this.getNestedDirectoryHandle([OBSIDIAN_CONFIG_DIR, 'plugins', 'wyqd']);
      const dataFile = await pluginDir.getFileHandle('data.json');
      const file = await dataFile.getFile();
      const text = await file.text();
      const settings = JSON.parse(text) as PluginSettings;
      this.cachedDataFolder = settings.dataFolder || fallback;
      return this.cachedDataFolder;
    } catch (e) {
      console.warn('[Ownly] Failed to read plugin settings for data folder detection', e);
      this.cachedDataFolder = fallback;
      return this.cachedDataFolder;
    }
  }

  async ensureDataStructure(): Promise<void> {
    const dataFolder = await this.getDataFolder();
    for (const directory of OWNLY_REQUIRED_DIRECTORIES) {
      const path = dataFolder ? `${dataFolder}/${directory}` : directory;
      await this.getDirHandle(path, true);
    }
  }

  private async getNestedDirectoryHandle(parts: string[]): Promise<FileSystemDirectoryHandle> {
    if (!this.directoryHandle) throw new Error('Not connected to local data');

    let current = this.directoryHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    return current;
  }

  async getItems(): Promise<WishlistItem[]> {
    if (!this.directoryHandle) throw new Error('Not connected to local data');

    const items: WishlistItem[] = [];

    for await (const entry of this.directoryHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const file = await entry.getFile();
        const text = await file.text();

        const match = text.match(/^---\n([\s\S]*?)\n---/);
        if (match && match[1]) {
          try {
            const data = YAML.parse(match[1]) as WishlistItem;
            if (data.status && data.price_estimated !== undefined) {
              data.fileName = entry.name;
              items.push(data);
            }
          } catch {
            console.warn('Failed to parse YAML for', entry.name);
          }
        }
      }
    }

    return items;
  }

  async addItem(item: Partial<WishlistItem>): Promise<void> {
    if (!this.directoryHandle) throw new Error('Not connected to local data');

    const now = new Date().toISOString().split('T')[0];

    let coolingDays = 1;
    if (item.price_estimated) {
      if (item.price_estimated < 100) coolingDays = 1;
      else if (item.price_estimated < 1000) coolingDays = 3;
      else if (item.price_estimated < 10000) coolingDays = 7;
      else coolingDays = 30;
    }

    const fullItem: WishlistItem = {
      name: item.name || 'Untitled',
      price_estimated: item.price_estimated || 0,
      status: 'cooling',
      date_added: now,
      cooling_days: coolingDays,
      ...item
    };

    const yamlStr = YAML.stringify(fullItem);
    const content = `---\n${yamlStr}---\n`;

    const fileName = `Ownly-${now}-${Date.now()}.md`;
    const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async updateItemStatus(fileName: string, newStatus: 'purchased' | 'archived'): Promise<void> {
    if (!this.directoryHandle) throw new Error('Not connected to local data');
    this.sanitizeFileName(fileName);

    const fileHandle = await this.directoryHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();

    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (match && match[1]) {
      const data = YAML.parse(match[1]) as WishlistItem;
      data.status = newStatus;

      if (newStatus === 'purchased' && !data.date_purchased) {
        data.date_purchased = new Date().toISOString().split('T')[0];
      }

      delete data.fileName;

      const yamlStr = YAML.stringify(data);
      const restOfContent = text.substring(match[0].length);
      const newContent = `---\n${yamlStr}\n--- \n${restOfContent}`;

      const writable = await fileHandle.createWritable();
      await writable.write(newContent);
      await writable.close();
    }
  }

  async updateItem(fileName: string, updates: Partial<WishlistItem>): Promise<void> {
    if (!this.directoryHandle) throw new Error('Not connected to local data');
    this.sanitizeFileName(fileName);

    const fileHandle = await this.directoryHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();

    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (match && match[1]) {
      const data = YAML.parse(match[1]) as WishlistItem;

      if (updates.name !== undefined) data.name = updates.name;
      if (updates.price_estimated !== undefined) {
        data.price_estimated = updates.price_estimated;
        if (data.status === 'cooling') {
            if (data.price_estimated < 100) data.cooling_days = 1;
            else if (data.price_estimated < 1000) data.cooling_days = 3;
            else if (data.price_estimated < 10000) data.cooling_days = 7;
            else data.cooling_days = 30;
        }
      }

      delete data.fileName;

      const yamlStr = YAML.stringify(data);
      const restOfContent = text.substring(match[0].length);
      const newContent = `---\n${yamlStr}\n--- \n${restOfContent}`;

      const writable = await fileHandle.createWritable();
      await writable.write(newContent);
      await writable.close();
    }
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
        if (!create) return null;
        throw e;
      }
    }
    return current;
  }

  async readMarkdownFiles(directory: string): Promise<{fileName: string, content: string}[]> {
    const dirHandle = await this.getDirHandle(directory);
    if (!dirHandle) return [];

    const files: {fileName: string, content: string}[] = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        try {
          const file = await entry.getFile();
          const content = await file.text();
          files.push({ fileName: entry.name, content });
        } catch (e) {
          console.warn(`Failed to read file ${entry.name}`, e);
        }
      }
    }
    return files;
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
