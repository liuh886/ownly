export {
  WYQD_DATA_ROOT as WYQD_ROOT,
  WYQD_DATA_DIRECTORIES as WYQD_DIRECTORIES,
  type WYQDDataDirectoryKey as WYQDDirectoryKey,
  splitWYQDPath as splitVaultPath,
  createWYQDEntityFileName as createEntityFileName,
  createWYQDSnapshotFileName as createSnapshotFileName,
  createWYQDReviewFileName as createReviewFileName,
  slugifyWYQDTitle as slugify,
} from '@/core/paths';

export function createWYQDDirectories(root: string) {
  return {
    root,
    objects: `${root}/Objects`,
    accounts: `${root}/Accounts`,
    snapshots: `${root}/Snapshots`,
    reviews: `${root}/Reviews`,
    objectLogs: `${root}/Logs/Object Experiences`,
    archive: `${root}/Archive`,
    objectArchive: `${root}/Archive/Objects`,
    accountArchive: `${root}/Archive/Accounts`,
    snapshotArchive: `${root}/Archive/Snapshots`,
    reviewArchive: `${root}/Archive/Reviews`,
    objectLogArchive: `${root}/Archive/Object Logs`,
  };
}
