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

export type RootStatus = 'VALID_OWNLY_ROOT' | 'PARENT_WITH_OWNLY_CHILD' | 'EMPTY_FOLDER' | 'NOT_FOUND' | 'INVALID_FOLDER';

export function detectRootStatus(input: string): { status: RootStatus; path: string; message: string } {
  const selected = resolve(input.trim());
  if (looksLikeDataRoot(selected)) return { status: 'VALID_OWNLY_ROOT', path: selected, message: 'Valid Ownly root' };
  const defaultChild = join(selected, DEFAULT_OWNLY_DATA_FOLDER);
  if (isDirectory(defaultChild) && looksLikeDataRoot(defaultChild)) return { status: 'PARENT_WITH_OWNLY_CHILD', path: defaultChild, message: 'Found Vault/Ownly child' };
  if (!existsSync(selected)) return { status: 'NOT_FOUND', path: selected, message: 'Path does not exist' };
  if (!isDirectory(selected)) return { status: 'INVALID_FOLDER', path: selected, message: 'Path is not a directory' };
  if (basename(selected).toLocaleLowerCase() === DEFAULT_OWNLY_DATA_FOLDER.toLocaleLowerCase()) {
    return { status: 'VALID_OWNLY_ROOT', path: selected, message: 'Selected Ownly folder directly' };
  }
  // Exists, is directory, but not valid and no child Ownly
  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const entries = readdirSync(selected);
    if (entries.length === 0) return { status: 'EMPTY_FOLDER', path: defaultChild, message: 'Empty folder — will create Ownly/ here' };
  } catch {}
  return { status: 'INVALID_FOLDER', path: selected, message: 'Not a valid Ownly folder (missing Objects/) — please select a valid Ownly root or its parent' };
}

/**
 * Resolve either a direct Ownly data root (custom folder name supported) or a
 * container whose default `Ownly/` child is the data root.
 */
export function resolveOwnlyDataRoot(
  input: string,
  options: ResolveOwnlyDataRootOptions = {},
): string {
  const detected = detectRootStatus(input);
  if (detected.status === 'VALID_OWNLY_ROOT' || detected.status === 'PARENT_WITH_OWNLY_CHILD') return detected.path;
  if (detected.status === 'EMPTY_FOLDER' && options.allowCreateDefault) return detected.path;
  if (detected.status === 'NOT_FOUND') {
    throw new Error(
      `No Ownly folder at "${input}" — path does not exist. Run: npm run --silent ownly -- --vault /path/to/folder object list --json (or wyqd for legacy) or set OWNLY_VAULT env.`,
    );
  }
  if (detected.status === 'INVALID_FOLDER') {
    throw new Error(
      `Invalid Ownly folder "${input}" — ${detected.message}. Please select a valid Ownly root or its parent containing Ownly/.`,
    );
  }
  if (detected.status === 'EMPTY_FOLDER') {
    throw new Error(
      `Empty folder "${input}" — will create Ownly/ here. Re-run with --vault "${detected.path}" or allow create.`,
    );
  }
  return detected.path;
}

export function ownsRequiredObjectsDirectory(dataRoot: string): boolean {
  return looksLikeDataRoot(dataRoot);
}
