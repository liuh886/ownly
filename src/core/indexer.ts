/**
 * P3: Local Index — vault/markdown -> IndexedDB -> UI
 * 首次 build index，后续 incremental update，PWA 首屏关键
 */
export interface IndexRecord { id: string; type: string; updatedAt: string; }

export class VaultIndexer {
  private dbName = 'ownly-index';
  async build(allFiles: Array<{ fileName: string; content: string }>): Promise<IndexRecord[]> {
    return allFiles.map((f) => ({ id: f.fileName, type: 'unknown', updatedAt: new Date().toISOString() }));
  }
  async incremental(changed: string[]): Promise<void> {
    // TODO: diff + IndexedDB put
  }
}
