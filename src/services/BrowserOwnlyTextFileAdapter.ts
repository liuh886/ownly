import {
  normalizeOwnlyBackupPath,
  type OwnlyTextFileAdapter,
} from '@/core/data-portability';
import {
  ObsidianFileSystemService,
  obsidianService,
} from './ObsidianFileSystemService';

function pathInsideDataRoot(path: string): string[] {
  const canonical = normalizeOwnlyBackupPath(path);
  return canonical.split('/').slice(1);
}

async function directoryForParts(
  root: FileSystemDirectoryHandle,
  parts: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}

async function listRecursively(
  directory: FileSystemDirectoryHandle,
  prefix: string[],
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind === 'directory') {
      paths.push(...await listRecursively(entry, [...prefix, entry.name]));
    } else if (entry.kind === 'file') {
      paths.push(['Ownly', ...prefix, entry.name].join('/'));
    }
  }
  return paths;
}

export class BrowserOwnlyTextFileAdapter implements OwnlyTextFileAdapter {
  constructor(
    private readonly service: ObsidianFileSystemService = obsidianService,
  ) {}

  private async root(): Promise<FileSystemDirectoryHandle> {
    return this.service.getPortableDataRootHandle();
  }

  async listFiles(): Promise<string[]> {
    return (await listRecursively(await this.root(), []))
      .map(normalizeOwnlyBackupPath)
      .sort((left, right) => left.localeCompare(right));
  }

  async exists(path: string): Promise<boolean> {
    const parts = pathInsideDataRoot(path);
    const fileName = parts.pop();
    if (!fileName) return false;
    try {
      const parent = await directoryForParts(await this.root(), parts, false);
      await parent.getFileHandle(fileName);
      return true;
    } catch {
      return false;
    }
  }

  async readText(path: string): Promise<string> {
    const parts = pathInsideDataRoot(path);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid Ownly file path: ${path}`);
    const parent = await directoryForParts(await this.root(), parts, false);
    const fileHandle = await parent.getFileHandle(fileName);
    return (await fileHandle.getFile()).text();
  }

  async writeText(path: string, content: string): Promise<void> {
    const parts = pathInsideDataRoot(path);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid Ownly file path: ${path}`);
    const parent = await directoryForParts(await this.root(), parts, true);
    const fileHandle = await parent.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }

  async deleteText(path: string): Promise<void> {
    const parts = pathInsideDataRoot(path);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid Ownly file path: ${path}`);
    const parent = await directoryForParts(await this.root(), parts, false);
    await parent.removeEntry(fileName);
  }
}

export const browserOwnlyTextFileAdapter = new BrowserOwnlyTextFileAdapter();
