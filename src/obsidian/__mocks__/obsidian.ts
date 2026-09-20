/**
 * Vitest-only stub for the `obsidian` runtime package, which ships types but no
 * resolvable runtime entry. Aliased in vitest.config.ts so the Obsidian adapter
 * can be exercised against a fake Vault. Never bundled into the plugin build.
 */

export class TFile {
  path: string;
  name: string;
  extension: string;
  basename: string;

  constructor(path: string) {
    this.path = path;
    const name = path.split('/').pop() ?? path;
    this.name = name;
    const dot = name.lastIndexOf('.');
    this.extension = dot >= 0 ? name.slice(dot + 1) : '';
    this.basename = dot >= 0 ? name.slice(0, dot) : name;
  }
}

export class TFolder {
  path: string;
  name: string;
  children: unknown[] = [];

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() ?? path;
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}
