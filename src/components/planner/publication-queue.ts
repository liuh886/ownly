import { isWorkspaceIdentityCurrent } from '@/services/ownlyStoreRouter';

/** Serialize cloud writes and their local receipts, so revocation is the last write. */
const tails = new Map<string, Promise<unknown>>();
const generations = new Map<string, number>();
const suspended = new Set<string>();

export const publicationKey = (scope: string, kind: 'share' | 'calendar' | 'account', id: string) => JSON.stringify([scope, kind, id]);
export const publicationGeneration = (key: string) => generations.get(key) ?? 0;
export function invalidatePublication(key: string): void {
  generations.set(key, publicationGeneration(key) + 1);
}
export function suspendPublication(key: string): void {
  invalidatePublication(key);
  suspended.add(key);
}
export function resumePublication(key: string): void { suspended.delete(key); }
export function isPublicationSuspended(key: string): boolean { return suspended.has(key); }
export function queuePublication<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (tails.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  tails.set(key, result);
  void result.finally(() => { if (tails.get(key) === result) tails.delete(key); }).catch(() => {});
  return result;
}

export function assertPublicationWorkspace(identity: string): void {
  if (!isWorkspaceIdentityCurrent(identity)) {
    throw new Error('Workspace changed during publication. The cloud request may have completed; reopen the original workspace to check its link.');
  }
}
