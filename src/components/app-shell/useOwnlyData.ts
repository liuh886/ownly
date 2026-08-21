import { useState, useCallback, useMemo, useEffect } from 'react';
import type { WYQDStoredEntity, WYQDArchivedStoredEntity } from '@/core/repository';
import type { WYQDObject, AccountSnapshot, ReviewEntry, ObjectLogEntry } from '@/domain/types';
import { calculateHomeMetrics } from '@/domain/calculations';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';

export function useOwnlyData() {
  const { repository, isConnected } = useOwnlyWorkspace();

  const [storedObjects, setStoredObjects] = useState<WYQDStoredEntity<WYQDObject>[]>([]);
  const [storedSnapshots, setStoredSnapshots] = useState<WYQDStoredEntity<AccountSnapshot>[]>([]);
  const [storedReviews, setStoredReviews] = useState<WYQDStoredEntity<ReviewEntry>[]>([]);
  const [storedLogs, setStoredLogs] = useState<WYQDStoredEntity<ObjectLogEntry>[]>([]);
  const [archivedEntities, setArchivedEntities] = useState<WYQDArchivedStoredEntity[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const objects = useMemo(() => storedObjects.map((item) => item.entity), [storedObjects]);
  const snapshots = useMemo(() => storedSnapshots.map((item) => item.entity), [storedSnapshots]);
  const metrics = useMemo(() => calculateHomeMetrics(objects, snapshots), [objects, snapshots]);

  const loadVaultData = useCallback(async () => {
    const [nextObjects, nextSnapshots, nextReviews, nextLogs, nextArchivedEntities] = await Promise.all([
      repository.listObjects(),
      repository.listSnapshots(),
      repository.listReviews(),
      repository.listObjectLogs(),
      repository.listArchivedEntities(),
    ]);
    setStoredObjects([...nextObjects]);
    setStoredSnapshots([...nextSnapshots]);
    setStoredReviews([...nextReviews]);
    setStoredLogs([...nextLogs]);
    setArchivedEntities([...nextArchivedEntities]);
    setDataLoaded(true);
  }, [repository]);

  useEffect(() => {
    if (!isConnected) return;

    let isMounted = true;

    async function refreshLocalData() {
      try {
        const [nextObjects, nextSnapshots, nextReviews, nextLogs, nextArchivedEntities] = await Promise.all([
          repository.listObjects(),
          repository.listSnapshots(),
          repository.listReviews(),
          repository.listObjectLogs(),
          repository.listArchivedEntities(),
        ]);

        if (!isMounted) return;
        setStoredObjects([...nextObjects]);
        setStoredSnapshots([...nextSnapshots]);
        setStoredReviews([...nextReviews]);
        setStoredLogs([...nextLogs]);
        setArchivedEntities([...nextArchivedEntities]);
        setDataLoaded(true);
      } catch (error) {
        console.warn('Ownly: Failed to load local data:', error);
        if (isMounted) {
          setStoredObjects([]);
          setStoredSnapshots([]);
          setStoredReviews([]);
          setStoredLogs([]);
          setArchivedEntities([]);
          setDataLoaded(true);
        }
      }
    }

    void refreshLocalData();

    return () => {
      isMounted = false;
    };
  }, [isConnected, repository]);

  return {
    storedObjects,
    storedSnapshots,
    storedReviews,
    storedLogs,
    archivedEntities,
    objects,
    snapshots,
    metrics,
    dataLoaded,
    loadVaultData,
  };
}
