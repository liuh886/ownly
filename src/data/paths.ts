export const WYQD_ROOT = 'Ownly';

export function createWYQDDirectories(root: string) {
  return {
    root,
    objects: `${root}/Objects`,
    accounts: `${root}/Accounts`,
    snapshots: `${root}/Snapshots`,
    reviews: `${root}/Reviews`,
    objectArchive: `${root}/Archive/Objects`,
    snapshotArchive: `${root}/Archive/Snapshots`,
    reviewArchive: `${root}/Archive/Reviews`,
  };
}

export const WYQD_DIRECTORIES = createWYQDDirectories(WYQD_ROOT);

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
