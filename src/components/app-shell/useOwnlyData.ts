import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { WYQDStoredEntity, WYQDArchivedStoredEntity, WYQDRepositoryAdapter } from '@/core/repository';
import type { WYQDObject, AccountSnapshot, ReviewEntry, ObjectLogEntry } from '@/domain/types';
import { calculateHomeMetrics } from '@/domain/calculations';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';

async function readVaultData(repository: WYQDRepositoryAdapter) {
  return Promise.all([
    repository.listObjects(),
    repository.listSnapshots(),
    repository.listReviews(),
    repository.listObjectLogs(),
    repository.listArchivedEntities(),
  ]);
}

export function useOwnlyData() {
  const { repository, dataRevision, isLoading } = useOwnlyWorkspace();

  const [storedObjects, setStoredObjects] = useState<WYQDStoredEntity<WYQDObject>[]>([]);
  const [storedSnapshots, setStoredSnapshots] = useState<WYQDStoredEntity<AccountSnapshot>[]>([]);
  const [storedReviews, setStoredReviews] = useState<WYQDStoredEntity<ReviewEntry>[]>([]);
  const [storedLogs, setStoredLogs] = useState<WYQDStoredEntity<ObjectLogEntry>[]>([]);
  const [archivedEntities, setArchivedEntities] = useState<WYQDArchivedStoredEntity[]>([]);
  const [loadedWorkspace, setLoadedWorkspace] = useState<{ repository: typeof repository; revision: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const readRevision = useRef(0);

  const objects = useMemo(() => storedObjects.map((item) => item.entity), [storedObjects]);
  const snapshots = useMemo(() => storedSnapshots.map((item) => item.entity), [storedSnapshots]);
  const metrics = useMemo(() => calculateHomeMetrics(objects, snapshots), [objects, snapshots]);

  /**
   * Reads the whole data folder, whichever store is active.
   *
   * This used to bail out when no folder was connected, which is why Demo mode
   * rendered five empty tabs. It now always reads: the repository resolves to
   * the filesystem when a folder is connected and to the in-memory store
   * otherwise, so Demo mode gets a populated, read-only view. Read safety is
   * unchanged — every write action stays gated on `isConnected`.
   *
   * `dataRevision` is a dependency because the store can be repopulated
   * underneath us: Demo mode seeds the memory store after this hook first ran,
   * and nothing else would trigger a second read.
   *
   * `isLoading` is a dependency for the opposite reason, and it is the one that
   * matters. A refresh used to run this read exactly once, on mount — before the
   * shell had restored the folder handle from IndexedDB and pointed the
   * repository at the right data root. Every list came back empty, `dataLoaded`
   * latched true, and nothing ever re-read: the app showed "data folder empty"
   * over a folder full of records, while Planner (which re-resolves its root on
   * every read, and mounts after boot) kept working. Waiting for the shell to
   * finish deciding means the first read is the one that counts.
   */
  const loadVaultData = useCallback((): Promise<void> => {
    if (isLoading) return Promise.resolve();
    const revision = ++readRevision.current;
    return readVaultData(repository).then(([nextObjects, nextSnapshots, nextReviews, nextLogs, nextArchivedEntities]) => {
      // Manual reloads and workspace changes share the same ordering guard.
      if (revision !== readRevision.current) return;
      setStoredObjects([...nextObjects]);
      setStoredSnapshots([...nextSnapshots]);
      setStoredReviews([...nextReviews]);
      setStoredLogs([...nextLogs]);
      setArchivedEntities([...nextArchivedEntities]);
      setLoadError(null);
      setLoadedWorkspace({ repository, revision: dataRevision });
    }).catch((error: unknown) => {
      if (revision !== readRevision.current) return;
      setLoadError(error instanceof Error ? error.message : String(error));
      // Keep the last successful snapshot. A read failure does not mean the
      // records disappeared; the workspace/revision key prevents cross-root use.
      throw error;
    });
  }, [repository, isLoading, dataRevision]);

  useEffect(() => {
    // The store is not knowable until the shell is done deciding: the folder
    // handle is still in IndexedDB and the repository still points at its
    // construction-time paths. Reading now returns empty and marks the data
    // loaded, which is how a real folder came to look like an empty one.
    if (isLoading) return;

    void loadVaultData().catch((error: unknown) => console.warn('Ownly: Failed to load local data:', error));

    return () => {
      readRevision.current += 1;
    };
  }, [loadVaultData, isLoading]);

  return {
    storedObjects,
    storedSnapshots,
    storedReviews,
    storedLogs,
    archivedEntities,
    objects,
    snapshots,
    metrics,
    dataLoaded: loadedWorkspace?.repository === repository && loadedWorkspace.revision === dataRevision && !isLoading,
    loadError,
    loadVaultData,
  };
}
