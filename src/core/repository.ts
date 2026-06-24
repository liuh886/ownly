import type {
  Account,
  AccountSnapshot,
  BaseEntity,
  ObjectLogEntry,
  ReviewEntry,
  WYQDObject,
} from '@/domain/types';

export type WYQDEntity = WYQDObject | Account | AccountSnapshot | ReviewEntry | ObjectLogEntry;

export interface WYQDStoredEntity<T extends BaseEntity = WYQDEntity> {
  fileName: string;
  path?: string;
  entity: T;
  body: string;
}

export type WYQDArchiveEntityType = 'object' | 'account' | 'snapshot' | 'review' | 'object_log';

export type WYQDArchivedStoredEntity =
  | (WYQDStoredEntity<WYQDObject> & { archiveType: 'object' })
  | (WYQDStoredEntity<Account> & { archiveType: 'account' })
  | (WYQDStoredEntity<AccountSnapshot> & { archiveType: 'snapshot' })
  | (WYQDStoredEntity<ReviewEntry> & { archiveType: 'review' })
  | (WYQDStoredEntity<ObjectLogEntry> & { archiveType: 'object_log' });

export interface WYQDReadonlyRepositoryAdapter {
  listObjects(): Promise<readonly WYQDStoredEntity<WYQDObject>[]>;
  listAccounts(): Promise<readonly WYQDStoredEntity<Account>[]>;
  listSnapshots(): Promise<readonly WYQDStoredEntity<AccountSnapshot>[]>;
  listReviews(): Promise<readonly WYQDStoredEntity<ReviewEntry>[]>;
  listObjectLogs(): Promise<readonly WYQDStoredEntity<ObjectLogEntry>[]>;
  listArchivedEntities(): Promise<readonly WYQDArchivedStoredEntity[]>;
}

export interface WYQDWritableRepositoryAdapter {
  saveObject(object: WYQDObject, body?: string): Promise<string>;
  updateObject(fileName: string, object: WYQDObject, body?: string): Promise<void>;
  archiveObject(fileName: string): Promise<string | void>;
  restoreObject(archiveFileName: string): Promise<string>;

  saveAccount(account: Account, body?: string): Promise<string>;
  updateAccount(fileName: string, account: Account, body?: string): Promise<void>;
  archiveAccount(fileName: string): Promise<string | void>;
  restoreAccount(archiveFileName: string): Promise<string>;

  saveSnapshot(snapshot: AccountSnapshot, body?: string): Promise<string>;
  updateSnapshot(fileName: string, snapshot: AccountSnapshot, body?: string): Promise<void>;
  archiveSnapshot(fileName: string): Promise<string | void>;
  restoreSnapshot(archiveFileName: string): Promise<string>;

  saveReview(review: ReviewEntry, body?: string): Promise<string>;
  updateReview(fileName: string, review: ReviewEntry, body?: string): Promise<void>;
  archiveReview(fileName: string): Promise<string | void>;
  restoreReview(archiveFileName: string): Promise<string>;

  restoreArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string): Promise<string>;
  permanentlyDeleteArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string): Promise<void>;
}

export type WYQDRepositoryAdapter = WYQDReadonlyRepositoryAdapter & WYQDWritableRepositoryAdapter;

export interface WYQDRepositoryStorageInfo {
  getDataFolderPath?: () => string;
  listDataDirectories?: () => Promise<readonly string[]>;
}

export type WYQDRepositoryWithStorageInfo = WYQDRepositoryAdapter & WYQDRepositoryStorageInfo;

export interface WYQDMarkdownFile {
  fileName: string;
  path: string;
  content: string;
}
