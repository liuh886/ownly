import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const DEFAULT_OWNLY_DATA_FOLDER = 'Ownly';

export interface ResolveOwnlyDataRootOptions {
  allowCreateDefault?: boolean;
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function looksLikeDataRoot(path: string): boolean {
  return isDirectory(join(path, 'Objects'));
}

/**
 * Resolve either a direct Ownly data root (custom folder name supported) or a
 * container whose default `Ownly/` child is the data root.
 */
export function resolveOwnlyDataRoot(
  input: string,
  options: ResolveOwnlyDataRootOptions = {},
): string {
  const selected = resolve(input.trim());
  if (looksLikeDataRoot(selected)) return selected;

  const defaultChild = join(selected, DEFAULT_OWNLY_DATA_FOLDER);
  if (isDirectory(defaultChild)) return defaultChild;

  if (
    basename(selected).toLocaleLowerCase() === DEFAULT_OWNLY_DATA_FOLDER.toLocaleLowerCase()
  ) {
    return selected;
  }

  if (options.allowCreateDefault) return defaultChild;
  return selected;
}

export function ownsRequiredObjectsDirectory(dataRoot: string): boolean {
  return looksLikeDataRoot(dataRoot);
}
