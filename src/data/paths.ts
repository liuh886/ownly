export const WYQD_ROOT = 'WYQD';

export const WYQD_DIRECTORIES = {
  root: WYQD_ROOT,
  objects: `${WYQD_ROOT}/Objects`,
  accounts: `${WYQD_ROOT}/Accounts`,
  snapshots: `${WYQD_ROOT}/Snapshots`,
  reviews: `${WYQD_ROOT}/Reviews`,
  objectArchive: `${WYQD_ROOT}/Archive/Objects`,
  snapshotArchive: `${WYQD_ROOT}/Archive/Snapshots`,
  reviewArchive: `${WYQD_ROOT}/Archive/Reviews`,
} as const;

export type WYQDDirectoryKey = keyof typeof WYQD_DIRECTORIES;

export function splitVaultPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export function createEntityFileName(date: string, slug: string): string {
  return `${date}--${slug}.md`;
}

export function createSnapshotFileName(date: string, time?: string): string {
  return time ? `snapshot--${date}--${time}.md` : `snapshot--${date}.md`;
}

export function createReviewFileName(date: string, slug: string): string {
  return `review--${date}--${slug}.md`;
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'untitled';
}
