export const OWNLY_DATA_ROOT_NAME = 'Ownly';

/**
 * The directory every Ownly data root contains, used to recognise a root by its
 * contents rather than by its name. Must stay in sync with `looksLikeDataRoot` in
 * `scripts/shared/data-root.ts`, which the CLI and MCP apply to the same choice —
 * when the two disagreed, the Web created a redundant `Ownly/` child inside a
 * custom-named root and then wrote every record to that empty folder.
 */
export const OWNLY_DATA_ROOT_MARKER = 'Objects';

export const OWNLY_REQUIRED_DIRECTORIES = [
  'Objects',
  'Accounts',
  'Snapshots',
  'Reviews',
  'Trips',
  'Trip Places',
  'Trip Visits',
  'Trip Legs',
  'Trip Expenses',
  'Logs/Object Experiences',
  'Archive/Objects',
  'Archive/Accounts',
  'Archive/Snapshots',
  'Archive/Reviews',
  'Archive/Object Logs',
] as const;

export function shouldUseSelectedDirectoryAsDataRoot(
  directoryName: string,
  hasObsidianConfig: boolean,
  hasDataRootMarker = false,
): boolean {
  if (hasObsidianConfig) return false;
  if (hasDataRootMarker) return true;
  return directoryName.trim().toLocaleLowerCase() === OWNLY_DATA_ROOT_NAME.toLocaleLowerCase();
}
