import YAML from 'yaml';

export interface WishlistItem {
  name: string;
  price_estimated: number;
  status: 'wishlist' | 'cooling' | 'purchased' | 'archived';
  date_added: string;
  cooling_days: number;
  [key: string]: any;
}

export class ObsidianFileSystemService {
  private directoryHandle: FileSystemDirectoryHandle | null = null;

  async requestAccess(): Promise<boolean> {
    try {
      this.directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });
      return true;
    } catch (error) {
      console.error('User denied access or error occurred:', error);
      return false;
    }
  }

  get isConnected(): boolean {
    return this.directoryHandle !== null;
  }

  async getItems(): Promise<WishlistItem[]> {
    if (!this.directoryHandle) throw new Error('Not connected to Obsidian Vault');
    
    const items: WishlistItem[] = [];
    
    for await (const entry of (this.directoryHandle as any).values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const file = await entry.getFile();
        const text = await file.text();
        
        // Parse frontmatter
        const match = text.match(/^---\n([\s\S]*?)\n---/);
        if (match && match[1]) {
          try {
            const data = YAML.parse(match[1]) as WishlistItem;
            // Only include items that look like wishlist entries
            if (data.status && data.price_estimated !== undefined) {
              items.push(data);
            }
          } catch (e) {
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
    const coolingDays = item.price_estimated && item.price_estimated > 1000 ? 7 : 1;
    
    const fullItem: WishlistItem = {
      name: item.name || 'Untitled',
      price_estimated: item.price_estimated || 0,
      status: 'cooling',
      date_added: now,
      cooling_days: coolingDays,
      ...item
    };

    const yamlStr = YAML.stringify(fullItem);
    const content = \---\n\---\n\;
    
    const fileName = \WYQD-\.md\;
    const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }
}

export const obsidianService = new ObsidianFileSystemService();
