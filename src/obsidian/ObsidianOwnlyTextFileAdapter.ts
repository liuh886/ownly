import {
  App,
  TFile,
  TFolder,
  normalizePath,
} from 'obsidian';
import {
  normalizeOwnlyBackupPath,
  type OwnlyTextFileAdapter,
} from '../core/data-portability';

function canonicalInsideOwnly(path: string): string {
  return normalizeOwnlyBackupPath(path).split('/').slice(1).join('/');
}

export class ObsidianOwnlyTextFileAdapter implements OwnlyTextFileAdapter {
  private readonly dataFolder: string;

  constructor(
    private readonly app: App,
    dataFolder: string,
  ) {
    this.dataFolder = normalizePath(dataFolder || 'Ownly');
  }

  private vaultPath(path: string): string {
    const inside = canonicalInsideOwnly(path);
    return normalizePath(inside ? `${this.dataFolder}/${inside}` : this.dataFolder);
  }

  private canonicalPath(vaultPath: string): string {
    const normalized = normalizePath(vaultPath);
    const prefix = `${this.dataFolder}/`;
    if (!normalized.startsWith(prefix)) {
      throw new Error(`Vault file is outside the Ownly data folder: ${vaultPath}`);
    }
    return normalizeOwnlyBackupPath(`Ownly/${normalized.slice(prefix.length)}`);
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized || this.app.vault.getAbstractFileByPath(normalized)) return;
    const parent = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/'))
      : '';
    if (parent) await this.ensureFolder(parent);
    try {
      await this.app.vault.createFolder(normalized);
    } catch (error) {
      if (!(this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder)) throw error;
    }
  }

  async listFiles(): Promise<string[]> {
    const prefix = `${this.dataFolder}/`;
    return this.app.vault.getFiles()
      .filter((file) => normalizePath(file.path).startsWith(prefix))
      .map((file) => this.canonicalPath(file.path))
      .sort((left, right) => left.localeCompare(right));
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(this.vaultPath(path)) instanceof TFile;
  }

  async readText(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(this.vaultPath(path));
    if (!(file instanceof TFile)) throw new Error(`Ownly file not found: ${path}`);
    return this.app.vault.read(file);
  }

  async writeText(path: string, content: string): Promise<void> {
    const target = this.vaultPath(path);
    const parent = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '';
    if (parent) await this.ensureFolder(parent);
    const existing = this.app.vault.getAbstractFileByPath(target);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }
    if (existing) throw new Error(`Cannot write file over Vault folder: ${target}`);
    await this.app.vault.create(target, content);
  }

  async deleteText(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.vaultPath(path));
    if (file instanceof TFile) await this.app.vault.delete(file, true);
  }
}
