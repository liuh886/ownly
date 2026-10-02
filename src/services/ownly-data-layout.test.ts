import { describe, expect, it } from 'vitest';
import {
  OWNLY_DATA_ROOT_MARKER,
  OWNLY_REQUIRED_DIRECTORIES,
  shouldUseSelectedDirectoryAsDataRoot,
} from './ownly-data-layout';

describe('Ownly local data layout', () => {
  it('treats an empty folder named Ownly as the data root', () => {
    expect(shouldUseSelectedDirectoryAsDataRoot('Ownly', false)).toBe(true);
    expect(shouldUseSelectedDirectoryAsDataRoot('ownly', false)).toBe(true);
  });

  it('does not treat an Obsidian Vault named Ownly as the data root', () => {
    expect(shouldUseSelectedDirectoryAsDataRoot('Ownly', true)).toBe(false);
  });

  it('treats a custom-named folder that already holds Objects/ as the data root', () => {
    expect(shouldUseSelectedDirectoryAsDataRoot('WYQD', false, true)).toBe(true);
    expect(shouldUseSelectedDirectoryAsDataRoot('MyOwnlyLedger', false, true)).toBe(true);
  });

  it('still creates Ownly/ inside a custom-named folder with no data root marker', () => {
    expect(shouldUseSelectedDirectoryAsDataRoot('WYQD', false, false)).toBe(false);
  });

  it('never treats an Obsidian Vault as the data root, even with the marker present', () => {
    expect(shouldUseSelectedDirectoryAsDataRoot('Ownly', true, true)).toBe(false);
  });

  it('recognises the data root by the same marker the CLI uses', () => {
    expect(OWNLY_DATA_ROOT_MARKER).toBe('Objects');
  });

  it('initializes every directory required by the Web repository', () => {
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Objects');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Accounts');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Snapshots');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Reviews');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trips');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trip Places');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trip Visits');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trip Legs');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Trip Expenses');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Logs/Object Experiences');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Archive/Object Logs');
  });
});
