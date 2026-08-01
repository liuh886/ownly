import { describe, expect, it } from 'vitest';
import {
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

  it('initializes every directory required by the Web repository', () => {
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Objects');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Accounts');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Snapshots');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Reviews');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Logs/Object Experiences');
    expect(OWNLY_REQUIRED_DIRECTORIES).toContain('Archive/Object Logs');
  });
});
