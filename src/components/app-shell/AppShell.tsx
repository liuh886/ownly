'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sampleObjects, sampleReviews, sampleSnapshots } from '@/data/sampleData';
import { calculateHomeMetrics } from '@/domain/calculations';
import { BottomNav, type AppTab } from './BottomNav';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { ObjectComposer } from '@/components/objects/ObjectComposer';
import { ObjectList, type ObjectListFocus } from '@/components/objects/ObjectList';
import { AccountsOverview } from '@/components/accounts/AccountsOverview';
import { ArchivePanel } from '@/components/archive/ArchivePanel';
import { ReviewHome } from '@/components/reviews/ReviewHome';
import { createWYQDRuntimeInfo, WYQD_PRODUCT_SLOGAN, WYQD_SCHEMA_VERSION } from '@/core/runtime';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';
import type { AccountSnapshot, ReviewEntry, WYQDObject } from '@/domain/types';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import type { WYQDStoredEntity, WYQDArchivedStoredEntity, WYQDArchiveEntityType } from '@/core/repository';

import { motion, AnimatePresence } from 'framer-motion';
import { WYQD_CURRENCIES, WYQD_CURRENCY_LABELS } from '@/lib/format';

interface ReviewRankings {
  foodScore: number | null;
  sceneryScore: number | null;
  experienceScore: number | null;
}

const tabHeadingKeys: Record<AppTab, { title: WYQDTranslationKey; description: WYQDTranslationKey }> = {
  home: { title: 'tabHome', description: 'tabHomeDesc' },
  objects: { title: 'tabObjects', description: 'tabObjectsDesc' },
  accounts: { title: 'tabAccounts', description: 'tabAccountsDesc' },
  reviews: { title: 'tabReviews', description: 'tabReviewsDesc' },
};

function StatusBanner({
  isConnected,
  isLoading,
  error,
  onConnect,
}: {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
            <span
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-stone-300'}`}
              aria-hidden="true"
            />
            {isConnected ? t('vaultConnected') : t('demoMode')}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            {isConnected ? t('vaultConnectedDesc') : t('demoModeDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={isLoading}
          className="min-h-10 shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
        >
          {isLoading ? t('connecting') : isConnected ? t('reconnectVault') : t('connectVault')}
        </button>
      </div>
      {!isConnected ? (
        <div className="mt-4 grid gap-2 text-xs leading-5 text-stone-600 min-[420px]:grid-cols-3">
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="font-medium text-stone-900">{t('tabHome')}</span>
            <div className="mt-0.5">{t('tabHomeDesc')}</div>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="font-medium text-stone-900">{t('tabObjects')}</span>
            <div className="mt-0.5">{t('tabObjectsDesc')}</div>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="font-medium text-stone-900">{t('tabReviews')}</span>
            <div className="mt-0.5">{t('tabReviewsDesc')}</div>
          </div>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}

export function AppShell() {
  const { t, language, setLanguage, currency, setCurrency } = useI18n();
  const {
    repository,
    runtimeTarget,
    isConnected,
    isLoading,
    connect,
    error,
    clearError,
    notice,
    showNotice,
    membership,
    openLicenseModal,
    storageGet,
    storageSet,
  } = useOwnlyWorkspace();

  const runtimeInfo = useMemo(() => createWYQDRuntimeInfo(runtimeTarget), [runtimeTarget]);

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [storedObjects, setStoredObjects] = useState<WYQDStoredEntity<WYQDObject>[]>([]);
  const [storedSnapshots, setStoredSnapshots] = useState<WYQDStoredEntity<AccountSnapshot>[]>([]);
  const [storedReviews, setStoredReviews] = useState<WYQDStoredEntity<ReviewEntry>[]>([]);
  const [archivedEntities, setArchivedEntities] = useState<WYQDArchivedStoredEntity[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [objectListFocus, setObjectListFocus] = useState<ObjectListFocus | null>(null);
  const [autoFocusComposer, setAutoFocusComposer] = useState(false);
  const objects = useMemo(() => storedObjects.map((item) => item.entity), [storedObjects]);
  const snapshots = useMemo(
    () => storedSnapshots.map((item) => item.entity),
    [storedSnapshots],
  );
  const metrics = useMemo(() => calculateHomeMetrics(objects, snapshots), [objects, snapshots]);

  function openObjectsWithFocus(focus: Omit<ObjectListFocus, 'token'>) {
    setObjectListFocus({ ...focus, token: Date.now() });
    setAutoFocusComposer(true);
    setActiveTab('objects');
  }

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
  }, [repository, t, showNotice]);

  async function loadVaultData() {
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
  }

  async function connectVault() {
    clearError();
    const connected = await connect();
    if (connected) {
      showNotice(t('vaultConnected'));
    }
  }

  async function createObject(object: WYQDObject, body: string) {
    try {
      await repository.saveObject(object, body);
      await loadVaultData();
      showNotice(t('objectSaved'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('objectSaveFailed'));
      throw event;
    }
  }

  async function updateObject(fileName: string, object: WYQDObject, body: string) {
    try {
      await repository.updateObject(fileName, object, body);
      await loadVaultData();
      showNotice(t('objectUpdated'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('objectUpdateFailed'));
      throw event;
    }
  }

  async function archiveObject(fileName: string) {
    try {
      await repository.archiveObject(fileName);
      await loadVaultData();
      showNotice(t('objectArchived'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('objectArchiveFailed'));
      throw event;
    }
  }

  async function createObjectReview(
    fileName: string,
    object: WYQDObject,
    summary: string,
    rankings: ReviewRankings,
    body: string,
  ) {
    if (object.object_type !== 'one_time_experience') return;

    const date = new Date().toISOString().split('T')[0];
    const review: ReviewEntry = {
      schema_version: WYQD_SCHEMA_VERSION,
      id: `review_${date.replaceAll('-', '')}_${Date.now()}`,
      type: 'review',
      review_type: 'object_review',
      title: `${t('reviewTitlePrefix')} ${object.title}`,
      target: object.title,
      target_id: object.id,
      target_type: object.object_type,
      reviewed_at: date,
      exited_at: object.ended_at || date,
      exit_type: 'completed',
      realized_experience_cost: object.actual_total || object.budget_total || 0,
      food_score: rankings.foodScore,
      scenery_score: rankings.sceneryScore,
      experience_score: rankings.experienceScore,
      summary,
      period: date.slice(0, 7),
      year: Number(date.slice(0, 4)),
      created_at: date,
      updated_at: date,
      currency: object.currency || 'CNY',
      tags: ['ownly', 'review', 'experience'],
    };

    const scoredLabel = (score: number | null | undefined) =>
      score ? t('reviewRankedAt').replace('{rank}', String(score)) : t('reviewUnranked');
    const reviewBody = `## ${t('reviewExperienceSection')}\n\n${summary}\n\n## ${t('reviewRankingSection')}\n\n- ${t('reviewFoodRank')}：${scoredLabel(rankings.foodScore)}\n- ${t('reviewSceneryRank')}：${scoredLabel(rankings.sceneryScore)}\n- ${t('reviewExperienceRank')}：${scoredLabel(rankings.experienceScore)}\n\n## ${t('reviewRelatedObjects')}\n\n- ${object.title}\n`;

    const updatedObject: WYQDObject = {
      ...object,
      status: 'reviewed',
      reviewed_at: date,
      review_ref: review.id,
      updated_at: date,
    };

    await repository.saveReview(review, reviewBody);
    await repository.updateObject(fileName, updatedObject, body);
    await loadVaultData();
    showNotice(t('reviewCreated'));
  }

  async function createSnapshot(snapshot: AccountSnapshot, body: string) {
    try {
      await repository.saveSnapshot(snapshot, body);
      await loadVaultData();
      showNotice(t('snapshotSaved'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('snapshotSaveFailed'));
      throw event;
    }
  }

  async function updateSnapshot(fileName: string, snapshot: AccountSnapshot, body: string) {
    try {
      await repository.updateSnapshot(fileName, snapshot, body);
      await loadVaultData();
      showNotice(t('snapshotUpdated'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('snapshotUpdateFailed'));
      throw event;
    }
  }

  async function deleteSnapshot(fileName: string) {
    try {
      await repository.archiveSnapshot(fileName);
      await loadVaultData();
      showNotice(t('snapshotArchived'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('snapshotArchiveFailed'));
      throw event;
    }
  }

  async function createReview(review: ReviewEntry, body: string) {
    try {
      await repository.saveReview(review, body);

      // If review targets an object, update that object's status to 'reviewed'
      if (review.target_id) {
        const targetStored = storedObjects.find((stored) => stored.entity.id === review.target_id);
        if (targetStored && targetStored.entity.status === 'completed') {
          const updatedObject: WYQDObject = {
            ...targetStored.entity,
            status: 'reviewed',
            reviewed_at: review.reviewed_at || new Date().toISOString().split('T')[0],
            review_ref: review.id,
            updated_at: new Date().toISOString().split('T')[0],
          };
          await repository.updateObject(targetStored.fileName, updatedObject, targetStored.body);
        }
      }

      await loadVaultData();
      showNotice(t('reviewSaved'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('reviewSaveFailed'));
      throw event;
    }
  }

  async function updateReview(fileName: string, review: ReviewEntry, body: string) {
    try {
      await repository.updateReview(fileName, review, body);
      await loadVaultData();
      showNotice(t('reviewUpdated'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('reviewUpdateFailed'));
      throw event;
    }
  }

  async function deleteReview(fileName: string) {
    try {
      await repository.archiveReview(fileName);
      await loadVaultData();
      showNotice(t('reviewArchived'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('reviewArchiveFailed'));
      throw event;
    }
  }

  async function restoreArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string) {
    try {
      await repository.restoreArchivedEntity(archiveType, archiveFileName);
      await loadVaultData();
      showNotice(t('archivedRestored'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('archivedRestoreFailed'));
      throw event;
    }
  }

  async function permanentlyDeleteArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string) {
    try {
      await repository.permanentlyDeleteArchivedEntity(archiveType, archiveFileName);
      await loadVaultData();
      showNotice(t('permanentlyDeleted'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('permanentlyDeleteFailed'));
      throw event;
    }
  }

  // Load vault data when connected
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

        // Auto-seed demo data on first connect if vault is empty
        const isEmpty = nextObjects.length === 0 && nextSnapshots.length === 0 && nextReviews.length === 0;
        const alreadySeeded = storageGet('ownly_demo_seeded') === 'true';

        if (isEmpty && !alreadySeeded) {
          try {
            await seedDemoDataToVault();
            const [seededObjects, seededSnapshots, seededReviews, seededArchived] = await Promise.all([
              repository.listObjects(),
              repository.listSnapshots(),
              repository.listReviews(),
              repository.listArchivedEntities(),
            ]);
            if (!isMounted) return;
            setStoredObjects([...seededObjects]);
            setStoredSnapshots([...seededSnapshots]);
            setStoredReviews([...seededReviews]);
            setArchivedEntities([...seededArchived]);
            setDataLoaded(true);
            return;
          } catch (e) {
            console.warn('Ownly: Failed to seed demo data:', e);
            // Fall through to load whatever the vault has
          }
        }

        setStoredObjects([...nextObjects]);
        setStoredSnapshots([...nextSnapshots]);
        setStoredReviews([...nextReviews]);
        setArchivedEntities([...nextArchivedEntities]);
        setDataLoaded(true);
      } catch (e) {
        console.warn('Ownly: Failed to load vault data:', e);
        // Clear stale state so the UI doesn't show misleading data
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
  }, [isConnected, repository, seedDemoDataToVault]);

  return (
    <main className="wyqd-web-shell min-h-screen bg-stone-50 px-5 pb-24 pt-8 text-stone-950 sm:px-6 sm:pt-10">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-4 top-4 z-30 mx-auto max-w-2xl"
      >
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
            {notice}
          </div>
        ) : null}
      </div>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {/* Brand bar */}
          <div className="flex items-center gap-3 border-b border-stone-100 bg-gradient-to-r from-stone-50/80 to-stone-100/40 px-4 py-2.5 sm:px-5">
            <span className="text-lg font-bold tracking-tight text-stone-950">Ownly</span>
            {membership.isPro ? (
              <button
                type="button"
                onClick={openLicenseModal}
                className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-bold text-white transition hover:bg-stone-800"
              >
                PRO
              </button>
            ) : null}
            <a
              href="https://liuh886.gumroad.com/l/ownly"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-100 hover:text-rose-700"
              title={t('sponsor')}
            >
              ❤ {t('sponsor')}
            </a>
            <span className="ml-auto text-[11px] text-stone-400">{WYQD_PRODUCT_SLOGAN}</span>
          </div>

          {/* Tab heading + controls */}
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-stone-950 sm:text-xl">
                {t(tabHeadingKeys[activeTab].title)}
              </h1>
              <p className="mt-0.5 text-xs text-stone-400">{t(tabHeadingKeys[activeTab].description)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  isConnected
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-stone-400'}`}
                  aria-hidden="true"
                />
                {isConnected ? t('vaultConnected') : isLoading ? t('connecting') : t('demoMode')}
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">
                {storedObjects.length} {t('objects')}
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">
                {storedSnapshots.length} {t('snapshots')}
              </span>
              <span className="mx-0.5 h-3 w-px bg-stone-200" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-200 hover:text-stone-900"
              >
                {language === 'zh' ? 'EN' : '中文'}
              </button>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as typeof currency)}
                className="cursor-pointer rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 outline-none transition hover:bg-stone-200 hover:text-stone-900"
              >
                {WYQD_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>{WYQD_CURRENCY_LABELS[cur]}</option>
                ))}
              </select>
              {runtimeTarget === 'web' ? (
                <button
                  type="button"
                  onClick={() => void connectVault()}
                  disabled={isLoading}
                  className="rounded-full bg-stone-950 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {isLoading ? t('connecting') : isConnected ? t('reconnectVault') : t('connectVault')}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {!isConnected || error ? (
          <StatusBanner
            isConnected={isConnected}
            isLoading={isLoading}
            error={error}
            onConnect={() => void connectVault()}
          />
        ) : null}

        {isConnected && !dataLoaded ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-sm text-stone-400">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('loading')}
            </div>
          </div>
        ) : null}

        {isConnected && !dataLoaded ? null : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            {activeTab === 'home' ? (
	              <HomeDashboard
	                metrics={metrics}
	                objects={objects}
	                snapshots={snapshots}
	                onOpenObjects={openObjectsWithFocus}
	              />
            ) : null}
            {activeTab === 'objects' ? (
              <div className="space-y-5">
                <ObjectList
                  key={objectListFocus?.token || 'objects-default'}
                  disabled={!isConnected}
                  objects={storedObjects}
                  reviews={storedReviews}
                  focus={objectListFocus}
                  onUpdate={updateObject}
                  onDelete={archiveObject}
                  onCreateObjectReview={createObjectReview}
                />
                <ObjectComposer
                  disabled={!isConnected}
                  submitLabel={t('saveToOwnly')}
                  onSubmit={createObject}
                  autoFocus={autoFocusComposer}
                  onAutoFocusHandled={() => setAutoFocusComposer(false)}
                />
                <ArchivePanel
                  disabled={!isConnected}
                  archivedEntities={archivedEntities}
                  onRestore={restoreArchivedEntity}
                  onDelete={permanentlyDeleteArchivedEntity}
                  filterType="objects"
                />
              </div>
            ) : null}
            {activeTab === 'accounts' ? (
              <div className="space-y-5">
                <AccountsOverview
                  disabled={!isConnected}
                  snapshots={storedSnapshots}
                  objects={objects}
                  onCreateSnapshot={createSnapshot}
                  onUpdateSnapshot={updateSnapshot}
                  onDeleteSnapshot={deleteSnapshot}
                />
                <ArchivePanel
                  disabled={!isConnected}
                  archivedEntities={archivedEntities}
                  onRestore={restoreArchivedEntity}
                  onDelete={permanentlyDeleteArchivedEntity}
                  filterType="accounts"
                />
              </div>
            ) : null}
            {activeTab === 'reviews' ? (
              <div className="space-y-5">
                <ReviewHome
                  disabled={!isConnected}
                  objects={objects}
                  reviews={storedReviews}
                  membership={membership}
                  onCreateReview={createReview}
                  onUpdateReview={updateReview}
                  onDeleteReview={deleteReview}
                />
                <ArchivePanel
                  disabled={!isConnected}
                  archivedEntities={archivedEntities}
                  onRestore={restoreArchivedEntity}
                  onDelete={permanentlyDeleteArchivedEntity}
                  filterType="reviews"
                />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
        )}
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      {/* Footer */}
      <footer className="mt-4 pb-20 text-center">
        <span className="text-[10px] text-stone-300">Ownly v{runtimeInfo.coreTargetVersion} · {runtimeTarget}</span>
      </footer>
    </main>
  );
}
