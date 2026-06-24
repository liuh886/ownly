import type { WYQDEntityType, WYQDObjectType } from '@/domain/types';

export const WYQD_DATA_ROOT = 'Ownly' as const;

export const WYQD_DATA_DIRECTORIES = {
  root: WYQD_DATA_ROOT,
  objects: `${WYQD_DATA_ROOT}/Objects`,
  accounts: `${WYQD_DATA_ROOT}/Accounts`,
  snapshots: `${WYQD_DATA_ROOT}/Snapshots`,
  reviews: `${WYQD_DATA_ROOT}/Reviews`,
  objectLogs: `${WYQD_DATA_ROOT}/Logs/Object Experiences`,
  archive: `${WYQD_DATA_ROOT}/Archive`,
  objectArchive: `${WYQD_DATA_ROOT}/Archive/Objects`,
  accountArchive: `${WYQD_DATA_ROOT}/Archive/Accounts`,
  snapshotArchive: `${WYQD_DATA_ROOT}/Archive/Snapshots`,
  reviewArchive: `${WYQD_DATA_ROOT}/Archive/Reviews`,
  objectLogArchive: `${WYQD_DATA_ROOT}/Archive/Object Logs`,
} as const;

export type WYQDDataDirectoryKey = keyof typeof WYQD_DATA_DIRECTORIES;

export type WYQDEntityPathMode = 'active' | 'archive';

export interface WYQDEntityPathDescriptor {
  type: WYQDEntityType;
  objectType?: WYQDObjectType;
  mode?: WYQDEntityPathMode;
}

export function splitWYQDPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export function joinWYQDPath(...parts: string[]): string {
  return parts.flatMap(splitWYQDPath).join('/');
}

export function getWYQDEntityDirectory(descriptor: WYQDEntityPathDescriptor): string {
  const mode = descriptor.mode ?? 'active';

  if (descriptor.type === 'object') {
    return mode === 'archive'
      ? WYQD_DATA_DIRECTORIES.objectArchive
      : WYQD_DATA_DIRECTORIES.objects;
  }

  if (descriptor.type === 'account') {
    return mode === 'archive'
      ? WYQD_DATA_DIRECTORIES.accountArchive
      : WYQD_DATA_DIRECTORIES.accounts;
  }

  if (descriptor.type === 'snapshot') {
    return mode === 'archive'
      ? WYQD_DATA_DIRECTORIES.snapshotArchive
      : WYQD_DATA_DIRECTORIES.snapshots;
  }

  if (descriptor.type === 'object_log') {
    return mode === 'archive'
      ? WYQD_DATA_DIRECTORIES.objectLogArchive
      : WYQD_DATA_DIRECTORIES.objectLogs;
  }

  return mode === 'archive'
    ? WYQD_DATA_DIRECTORIES.reviewArchive
    : WYQD_DATA_DIRECTORIES.reviews;
}

export function createWYQDEntityPath(
  descriptor: WYQDEntityPathDescriptor,
  fileName: string,
): string {
  return joinWYQDPath(getWYQDEntityDirectory(descriptor), fileName);
}

export function createWYQDEntityFileName(date: string, slug: string): string {
  return `${date}--${slug}.md`;
}

export function createWYQDSnapshotFileName(date: string, time?: string): string {
  return time ? `snapshot--${date}--${time}.md` : `snapshot--${date}.md`;
}

export function createWYQDReviewFileName(date: string, slug: string): string {
  return `review--${date}--${slug}.md`;
}

export function slugifyWYQDTitle(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'untitled';
}
