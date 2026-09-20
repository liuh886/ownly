import { describe, expect, it } from 'vitest';
import {
  createWYQDEntityFileName,
  createWYQDEntityPath,
  createWYQDReviewFileName,
  createWYQDSnapshotFileName,
  getWYQDEntityDirectory,
  joinWYQDPath,
  slugifyWYQDTitle,
  splitWYQDPath,
  WYQD_DATA_DIRECTORIES,
} from './paths';

describe('path helpers', () => {
  it('splits and joins paths while dropping empty segments', () => {
    expect(splitWYQDPath('/Ownly//Objects/')).toEqual(['Ownly', 'Objects']);
    expect(joinWYQDPath('Ownly', '/Objects/', 'a.md')).toBe('Ownly/Objects/a.md');
  });

  it('resolves active and archive directories per entity type', () => {
    expect(getWYQDEntityDirectory({ type: 'object' })).toBe(WYQD_DATA_DIRECTORIES.objects);
    expect(getWYQDEntityDirectory({ type: 'object', mode: 'archive' })).toBe(WYQD_DATA_DIRECTORIES.objectArchive);
    expect(getWYQDEntityDirectory({ type: 'account', mode: 'archive' })).toBe(WYQD_DATA_DIRECTORIES.accountArchive);
    expect(getWYQDEntityDirectory({ type: 'snapshot' })).toBe(WYQD_DATA_DIRECTORIES.snapshots);
    expect(getWYQDEntityDirectory({ type: 'review', mode: 'archive' })).toBe(WYQD_DATA_DIRECTORIES.reviewArchive);
    expect(getWYQDEntityDirectory({ type: 'object_log' })).toBe(WYQD_DATA_DIRECTORIES.objectLogs);
    expect(getWYQDEntityDirectory({ type: 'object_log', mode: 'archive' })).toBe(WYQD_DATA_DIRECTORIES.objectLogArchive);
  });

  it('builds a full entity path', () => {
    expect(createWYQDEntityPath({ type: 'object' }, '2026-08-01--camera.md'))
      .toBe('Ownly/Objects/2026-08-01--camera.md');
  });
});

describe('filename builders', () => {
  it('uses the canonical date--slug scheme', () => {
    expect(createWYQDEntityFileName('2026-08-01', 'travel-camera')).toBe('2026-08-01--travel-camera.md');
  });

  it('prefixes snapshots and reviews', () => {
    expect(createWYQDSnapshotFileName('2026-08-01')).toBe('snapshot--2026-08-01.md');
    expect(createWYQDSnapshotFileName('2026-08-01', '081000')).toBe('snapshot--2026-08-01--081000.md');
    expect(createWYQDReviewFileName('2026-08-01', 'camera-review')).toBe('review--2026-08-01--camera-review.md');
  });
});

describe('slugifyWYQDTitle', () => {
  it('lowercases, collapses punctuation, and preserves CJK', () => {
    expect(slugifyWYQDTitle('  Travel   Camera!! ')).toBe('travel-camera');
    expect(slugifyWYQDTitle('大皇宫 Wat Pho')).toBe('大皇宫-wat-pho');
  });

  it('falls back to untitled for empty or symbol-only titles', () => {
    expect(slugifyWYQDTitle('   ')).toBe('untitled');
    expect(slugifyWYQDTitle('!!!')).toBe('untitled');
  });
});
