import { useState, useCallback, useMemo, useEffect } from 'react';
import type { WYQDStoredEntity, WYQDArchivedStoredEntity } from '@/core/repository';
import type { WYQDObject, AccountSnapshot, ReviewEntry } from '@/domain/types';
import { sampleObjects, sampleReviews, sampleSnapshots } from '@/data/sampleData';
import { calculateHomeMetrics } from '@/domain/calculations';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { useI18n } from '@/core/i18n-context';

export function useOwnlyData() {
  const { t } = useI18n();
  const { repository, isConnected, showNotice, storageGet, storageSet } = useOwnlyWorkspace();

  const [storedObjects, setStoredObjects] = useState<WYQDStoredEntity<WYQDObject>[]>([]);
  const [storedSnapshots, setStoredSnapshots] = useState<WYQDStoredEntity<AccountSnapshot>[]>([]);
  const [storedReviews, setStoredReviews] = useState<WYQDStoredEntity<ReviewEntry>[]>([]);
  const [archivedEntities, setArchivedEntities] = useState<WYQDArchivedStoredEntity[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const objects = useMemo(() => storedObjects.map((item) => item.entity), [storedObjects]);
  const snapshots = useMemo(() => storedSnapshots.map((item) => item.entity), [storedSnapshots]);
  const metrics = useMemo(() => calculateHomeMetrics(objects, snapshots), [objects, snapshots]);

  const loadVaultData = useCallback(async () => {
    const [nextObjects, nextSnapshots, nextReviews, nextArchivedEntities] = await Promise.all([
      repository.listObjects(),
      repository.listSnapshots(),
      repository.listReviews(),
      repository.listArchivedEntities(),
    ]);
    setStoredObjects([...nextObjects]);
    setStoredSnapshots([...nextSnapshots]);
    setStoredReviews([...nextReviews]);
    setArchivedEntities([...nextArchivedEntities]);
  }, [repository]);

  const seedDemoDataToVault = useCallback(async () => {
    for (const obj of sampleObjects) {
      await repository.saveObject(obj, '');
    }
    for (const snap of sampleSnapshots) {
      await repository.saveSnapshot(snap, '');
    }
    for (const review of sampleReviews) {
      const body = review.summary
        ? `## ${t('reviewExperienceSection')}\n\n${review.summary}\n`
        : '';
      await repository.saveReview(review, body);
    }
    storageSet('ownly_demo_seeded', 'true');
    showNotice(t('demoDataSeeded'));
  }, [repository, t, showNotice, storageSet]);

  useEffect(() => {
    if (!isConnected) return;

    let isMounted = true;

    async function refreshVaultData() {
      try {
        const [nextObjects, nextSnapshots, nextReviews, nextArchivedEntities] = await Promise.all([
          repository.listObjects(),
          repository.listSnapshots(),
          repository.listReviews(),
          repository.listArchivedEntities(),
        ]);

        if (!isMounted) return;

        const isEmpty = nextObjects.length === 0 && nextSnapshots.length === 0 && nextReviews.length === 0;
        const alreadySeeded = storageGet('ownly_demo_seeded') === 'true';

        if (isEmpty && !alreadySeeded) {
          try {
            await seedDemoDataToVault();
            await loadVaultData();
            if (!isMounted) return;
            setDataLoaded(true);
            return;
          } catch (e) {
            console.warn('Ownly: Failed to seed demo data:', e);
          }
        }

        setStoredObjects([...nextObjects]);
        setStoredSnapshots([...nextSnapshots]);
        setStoredReviews([...nextReviews]);
        setArchivedEntities([...nextArchivedEntities]);
        setDataLoaded(true);
      } catch (e) {
        console.warn('Ownly: Failed to load vault data:', e);
        if (isMounted) {
          setStoredObjects([]);
          setStoredSnapshots([]);
          setStoredReviews([]);
          setArchivedEntities([]);
          setDataLoaded(true);
        }
      }
    }

    void refreshVaultData();

    return () => {
      isMounted = false;
    };
  }, [isConnected, repository, seedDemoDataToVault, loadVaultData, storageGet]);

  return {
    storedObjects,
    storedSnapshots,
    storedReviews,
    archivedEntities,
    objects,
    snapshots,
    metrics,
    dataLoaded,
    loadVaultData,
  };
}
