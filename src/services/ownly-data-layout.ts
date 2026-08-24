export const OWNLY_DATA_ROOT_NAME = 'Ownly';

export const OWNLY_REQUIRED_DIRECTORIES = [
  'Objects',
  'Accounts',
  'Snapshots',
  'Reviews',
  'Trips',
  'Trip Places',
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
): boolean {
  return directoryName.trim().toLocaleLowerCase() === OWNLY_DATA_ROOT_NAME.toLocaleLowerCase()
    && !hasObsidianConfig;
}
