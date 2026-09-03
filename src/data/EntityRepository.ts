/**
 * P0-Issue2: 统一 Repository 接口 — local-first 长期路线
 * Markdown / IndexedDB / Supabase 均为 EntityRepository<T> 的 adapter
 */
export interface EntityRepository<T extends { id: string }> {
  get(id: string): Promise<T | null>;
  save(entity: T): Promise<void>;
  delete(id: string): Promise<void>;
  query(filter?: Partial<T>): Promise<T[]>;
  list?(): Promise<T[]>;
}

// Markdown adapter 已在 src/data/MarkdownRepository.ts 实现为 MarkdownRepository (read/write/remove)
// IndexedDB adapter 未来由 src/core/indexer.ts 的 VaultIndexer 承接
// Supabase adapter 预留：src/data/SupabaseRepository.ts
