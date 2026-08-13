import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { resolveOwnlyDataRoot } from '../shared/data-root';
import {
  normalizeOwnlyBackupPath,
  type OwnlyTextFileAdapter,
} from '../../src/core/data-portability';

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(path));
    else if (entry.isFile()) results.push(path);
  }
  return results;
}

export class NodeOwnlyTextFileAdapter implements OwnlyTextFileAdapter {
  private readonly root: string;

  constructor(dataLocation: string) {
    this.root = resolveOwnlyDataRoot(dataLocation, { allowCreateDefault: true });
  }

  private resolveCanonicalPath(path: string): string {
    const canonical = normalizeOwnlyBackupPath(path);
    const [, ...insideOwnly] = canonical.split('/');
    const absolute = resolve(this.root, ...insideOwnly);
    const relativePath = relative(this.root, absolute);
    if (
      relativePath.startsWith('..')
      || relativePath === '..'
      || relativePath.split(sep).includes('..')
    ) {
      throw new Error(`Path escapes Ownly data location: ${path}`);
    }
    return absolute;
  }

  async listFiles(): Promise<string[]> {
    return walkFiles(this.root)
      .map((absolute) => `Ownly/${relative(this.root, absolute).split(sep).join('/')}`)
      .map(normalizeOwnlyBackupPath)
      .sort((left, right) => left.localeCompare(right));
  }

  async exists(path: string): Promise<boolean> {
    const absolute = this.resolveCanonicalPath(path);
    return existsSync(absolute) && statSync(absolute).isFile();
  }

  async readText(path: string): Promise<string> {
    return readFileSync(this.resolveCanonicalPath(path), 'utf8');
  }

  async writeText(path: string, content: string): Promise<void> {
    const absolute = this.resolveCanonicalPath(path);
    mkdirSync(dirname(absolute), { recursive: true });
    const temporary = `${absolute}.tmp-${process.pid}-${Date.now()}`;
    try {
      writeFileSync(temporary, content, 'utf8');
      renameSync(temporary, absolute);
    } catch (error) {
      if (existsSync(temporary)) rmSync(temporary, { force: true });
      throw error;
    }
  }

  async deleteText(path: string): Promise<void> {
    const absolute = this.resolveCanonicalPath(path);
    rmSync(absolute, { force: true });
  }
}
