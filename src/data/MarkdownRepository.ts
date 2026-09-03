/**
 * P0: 唯一 Markdown I/O — 所有入口（Web/Extension/Obsidian/CLI）经此读写
 * 现 PlannerRepository / ObsidianFileSystemService 逐步收敛至此
 */
import { parseMarkdownEntity, serializeMarkdownEntity } from './frontmatter';

export interface MarkdownFile {
  fileName: string;
  content: string;
}

export interface MarkdownStore {
  getDataFolder(): Promise<string>;
  readMarkdownFiles(directory: string): Promise<MarkdownFile[]>;
  writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void>;
  deleteMarkdownFile(directory: string, fileName: string): Promise<void>;
}

export class MarkdownRepository {
  constructor(private readonly store: MarkdownStore) {}

  async read<T extends object>(directory: string, type: string): Promise<T[]> {
    const root = await this.store.getDataFolder();
    const dir = root ? `${root}/${directory}` : directory;
    const files = await this.store.readMarkdownFiles(dir);
    const out: T[] = [];
    for (const f of files) {
      try {
        const parsed = parseMarkdownEntity<Record<string, unknown>>(f.content);
        if (parsed.frontmatter.type !== type) continue;
        out.push(parsed.frontmatter as unknown as T);
      } catch {}
    }
    return out;
  }

  async write(directory: string, fileName: string, entity: object, body = ''): Promise<void> {
    const root = await this.store.getDataFolder();
    const dir = root ? `${root}/${directory}` : directory;
    await this.store.writeMarkdownFile(dir, fileName, serializeMarkdownEntity(entity as Record<string, unknown>, body));
  }

  async remove(directory: string, fileName: string): Promise<void> {
    const root = await this.store.getDataFolder();
    const dir = root ? `${root}/${directory}` : directory;
    await this.store.deleteMarkdownFile(dir, fileName);
  }
}
