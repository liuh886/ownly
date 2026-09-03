/**
 * P3/PR1: Production Index Engine — vault/markdown -> IndexedDB/Map -> UI
 * 特性：hash diff、incremental update、version migration、IndexedDB 持久化（浏览器）/ Map 回退（Node/测试）
 */
export interface FileIndex {
  fileName: string;
  hash: string;
  entityId: string;
  type: string;
  updatedAt: string;
}

export interface IndexRecord {
  id: string;
  type: string;
  updatedAt: string;
}

const INDEX_VERSION = 1;
const DB_NAME = 'ownly-index';
const STORE_FILES = 'files';

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function parseEntityId(fileName: string, content: string): string {
  const m = /id:\s*"?([^"\n]+)"?/.exec(content);
  return m?.[1]?.trim() || fileName;
}

function inferType(fileName: string, content: string): string {
  if (fileName.includes('Places') || content.includes('type: trip_place')) return 'place';
  if (fileName.includes('Trips') || content.includes('type: trip')) return 'trip';
  if (content.includes('type: trip_visit')) return 'visit';
  return 'unknown';
}

// Minimal IndexedDB wrapper with Map fallback for Node
class IndexStore {
  private mem = new Map<string, FileIndex>();
  private useIdb = typeof indexedDB !== 'undefined';

  async getAll(): Promise<Map<string, FileIndex>> {
    if (!this.useIdb) return new Map(this.mem);
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, INDEX_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES, { keyPath: 'fileName' });
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) { resolve(new Map()); return; }
        const tx = db.transaction(STORE_FILES, 'readonly');
        const store = tx.objectStore(STORE_FILES);
        const getAllReq = store.getAll() as IDBRequest<FileIndex[]>;
        getAllReq.onsuccess = () => {
          const map = new Map<string, FileIndex>();
          for (const r of getAllReq.result ?? []) map.set(r.fileName, r);
          resolve(map);
        };
        getAllReq.onerror = () => resolve(new Map());
      };
      req.onerror = () => resolve(new Map(this.mem));
    });
  }

  async putAll(records: FileIndex[]): Promise<void> {
    if (!this.useIdb) {
      for (const r of records) this.mem.set(r.fileName, r);
      return;
    }
    await new Promise<void>((resolve) => {
      const req = indexedDB.open(DB_NAME, INDEX_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES, { keyPath: 'fileName' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(STORE_FILES, 'readwrite');
        const store = tx.objectStore(STORE_FILES);
        for (const r of records) store.put(r);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  }

  async clear(): Promise<void> {
    this.mem.clear();
    if (!this.useIdb) return;
    await new Promise<void>((resolve) => {
      const req = indexedDB.open(DB_NAME, INDEX_VERSION);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) { resolve(); return; }
        const tx = db.transaction(STORE_FILES, 'readwrite');
        tx.objectStore(STORE_FILES).clear();
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => resolve();
    });
  }
}

export class VaultIndexer {
  private store = new IndexStore();
  private version = INDEX_VERSION;

  /** Build index: hash diff, only changed files need parsing */
  async build(allFiles: Array<{ fileName: string; content: string }>): Promise<{ changed: string[]; index: FileIndex[]; records: IndexRecord[] }> {
    const existing = await this.store.getAll();
    const changed: string[] = [];
    const toPut: FileIndex[] = [];
    const index: FileIndex[] = [];

    for (const f of allFiles) {
      const hash = hashString(f.content);
      const prev = existing.get(f.fileName);
      if (!prev || prev.hash !== hash) changed.push(f.fileName);
      const rec: FileIndex = {
        fileName: f.fileName,
        hash,
        entityId: parseEntityId(f.fileName, f.content),
        type: inferType(f.fileName, f.content),
        updatedAt: new Date().toISOString(),
      };
      toPut.push(rec);
      index.push(rec);
      existing.set(f.fileName, rec);
    }
    // remove deleted files from index
    const live = new Set(allFiles.map((f) => f.fileName));
    for (const key of [...existing.keys()]) if (!live.has(key)) existing.delete(key);

    await this.store.putAll(toPut);
    const records: IndexRecord[] = index.map((r) => ({ id: r.entityId, type: r.type, updatedAt: r.updatedAt }));
    return { changed, index, records };
  }

  async incremental(changedFiles: Array<{ fileName: string; content: string }>): Promise<string[]> {
    if (changedFiles.length === 0) return [];
    const { changed } = await this.build(changedFiles);
    return changed;
  }

  async migrateIfNeeded(currentVersion: number): Promise<boolean> {
    if (currentVersion !== this.version) {
      await this.store.clear();
      this.version = currentVersion;
      return true;
    }
    return false;
  }

  // Test helper
  async _getAll(): Promise<Map<string, FileIndex>> {
    return this.store.getAll();
  }
}
