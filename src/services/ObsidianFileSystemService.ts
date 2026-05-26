/* eslint-disable @typescript-eslint/no-explicit-any */
import YAML from 'yaml';
import { get, set } from 'idb-keyval';

export interface WishlistItem {
  name: string;
  price_estimated: number;
  status: 'wishlist' | 'cooling' | 'purchased' | 'archived';
  date_added: string;
  cooling_days: number;
  date_purchased?: string;
  fileName?: string;
  [key: string]: any;
}

const HANDLE_KEY = 'wyqd_obsidian_handle';

interface PluginSettings {
  dataFolder?: string;
  [key: string]: unknown;
}

export class ObsidianFileSystemService {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private cachedDataFolder: string | null = null;

  async initAutoConnect(): Promise<boolean> {
    try {
      const handle = await get(HANDLE_KEY);
      if (handle) {
        const options = { mode: 'readwrite' as FileSystemPermissionMode };
        const permission = await (handle as any).queryPermission(options);
        
        if (permission === 'granted') {
          this.directoryHandle = handle as FileSystemDirectoryHandle;
          return true;
        }
        
        const requestStatus = await (handle as any).requestPermission(options);
        if (requestStatus === 'granted') {
          this.directoryHandle = handle as FileSystemDirectoryHandle;
          return true;
        }
      }
    } catch (e) {
      console.error('Failed to auto-connect:', e);
    }
    return false;
  }

  async requestAccess(): Promise<boolean> {
    try {
      this.directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      this.cachedDataFolder = null;
      await set(HANDLE_KEY, this.directoryHandle);
      return true;
    } catch (error) {
      console.error('User denied access or error occurred:', error);
      return false;
    }
  }

  get isConnected(): boolean {
    return this.directoryHandle !== null;
  }

  async getDataFolder(): Promise<string> {
    if (this.cachedDataFolder) return this.cachedDataFolder;

    const fallback = 'Ownly';
    if (!this.directoryHandle) return fallback;

    try {
      const pluginDir = await this.getNestedDirectoryHandle(['.obsidian', 'plugins', 'wyqd']);
      const dataFile = await pluginDir.getFileHandle('data.json');
      const file = await dataFile.getFile();
      const text = await file.text();
      const settings = JSON.parse(text) as PluginSettings;
      this.cachedDataFolder = settings.dataFolder || fallback;
      return this.cachedDataFolder;
    } catch {
      return fallback;
    }
  }

  private async getNestedDirectoryHandle(parts: string[]): Promise<FileSystemDirectoryHandle> {
    if (!this.directoryHandle) throw new Error('Not connected to Obsidian Vault');

    let current = this.directoryHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    return current;
  }

  async getItems(): Promise<WishlistItem[]> {
    if (!this.directoryHandle) throw new Error('Not connected to Obsidian Vault');
    
    const items: WishlistItem[] = [];
    
    for await (const entry of (this.directoryHandle as any).values()) {
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
    if (!this.directoryHandle) throw new Error('Not connected to Obsidian Vault');
    
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
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }

  async updateItemStatus(fileName: string, newStatus: 'purchased' | 'archived'): Promise<void> {
    if (!this.directoryHandle) throw new Error('Not connected to Obsidian Vault');

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

      const writable = await (fileHandle as any).createWritable();
      await writable.write(newContent);
      await writable.close();
    }
  }

  async updateItem(fileName: string, updates: Partial<WishlistItem>): Promise<void> {
    if (!this.directoryHandle) throw new Error('Not connected to Obsidian Vault');

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

      const writable = await (fileHandle as any).createWritable();
      await writable.write(newContent);
      await writable.close();
    }
  }
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
    for await (const entry of (dirHandle as any).values()) {
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
    const dirHandle = await this.getDirHandle(directory, true);
    if (!dirHandle) throw new Error(`Could not access or create directory: ${directory}`);
    
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }

  async deleteMarkdownFile(directory: string, fileName: string): Promise<void> {
    const dirHandle = await this.getDirHandle(directory);
    if (!dirHandle) return;
    try {
      await dirHandle.removeEntry(fileName);
    } catch (e) {
      console.warn(`Failed to delete file ${fileName} in ${directory}`, e);
    }
  }
}

export const obsidianService = new ObsidianFileSystemService();
