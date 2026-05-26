'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sampleObjects, sampleReviews, sampleSnapshots } from '@/data/sampleData';
import { calculateHomeMetrics } from '@/domain/calculations';
import { BottomNav, type AppTab } from './BottomNav';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { ObjectComposer } from '@/components/objects/ObjectComposer';
import { ObjectList, type ObjectListFocus } from '@/components/objects/ObjectList';
import { AccountsOverview } from '@/components/accounts/AccountsOverview';
import { ArchivePanel } from '@/components/archive/ArchivePanel';
import { ReviewHome } from '@/components/reviews/ReviewHome';
import { createWYQDRuntimeInfo, WYQD_PRODUCT_SLOGAN } from '@/core/runtime';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';
import type { AccountSnapshot, ReviewEntry, WYQDObject } from '@/domain/types';
import { obsidianService } from '@/services/ObsidianFileSystemService';
import {
  markdownEntityRepository,
  type ArchivedStoredEntity,
  type ArchiveEntityType,
  type StoredEntity,
} from '@/services/MarkdownEntityRepository';

import { motion, AnimatePresence } from 'framer-motion';

interface ReviewRankings {
  foodRank: number | null;
  sceneryRank: number | null;
  experienceRank: number | null;
}

const runtimeInfo = createWYQDRuntimeInfo('web');

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
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
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
  const { t, language, setLanguage } = useI18n();
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [isEmbedded] = useState(() => typeof window !== 'undefined' && window.parent !== window);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !isEmbedded);
  const [storedObjects, setStoredObjects] = useState<StoredEntity<WYQDObject>[]>(
    sampleObjects.map((entity) => ({ fileName: `${entity.id}.md`, entity, body: '' })),
  );
  const [storedSnapshots, setStoredSnapshots] = useState<StoredEntity<AccountSnapshot>[]>(
    sampleSnapshots.map((entity) => ({ fileName: `${entity.id}.md`, entity, body: '' })),
  );
  const [storedReviews, setStoredReviews] = useState<StoredEntity<ReviewEntry>[]>(
    sampleReviews.map((entity) => ({ fileName: `${entity.id}.md`, entity, body: '' })),
  );
  const [archivedEntities, setArchivedEntities] = useState<ArchivedStoredEntity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [objectListFocus, setObjectListFocus] = useState<ObjectListFocus | null>(null);
  const objects = useMemo(() => storedObjects.map((item) => item.entity), [storedObjects]);
  const snapshots = useMemo(
    () => storedSnapshots.map((item) => item.entity),
    [storedSnapshots],
  );
  const metrics = useMemo(() => calculateHomeMetrics(objects, snapshots), [objects, snapshots]);
  const pendingWrites = useRef<Map<string, { resolve: () => void; reject: (e: Error) => void }>>(new Map());

  // postMessage bridge: receive vault data from Obsidian parent
  useEffect(() => {
    if (!isEmbedded) return;

    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'wyqd:vault-data' && msg.payload) {
        const { objects: obj, snapshots: snap, reviews: rev, archived: arch } = msg.payload;
        if (Array.isArray(obj)) setStoredObjects(obj);
        if (Array.isArray(snap)) setStoredSnapshots(snap);
        if (Array.isArray(rev)) setStoredReviews(rev);
        if (Array.isArray(arch)) setArchivedEntities(arch);
        setIsConnected(true);
        setIsLoading(false);
      }

      if (msg.type === 'wyqd:write-result' && msg.payload?.requestId) {
        const entry = pendingWrites.current.get(msg.payload.requestId);
        if (entry) {
          pendingWrites.current.delete(msg.payload.requestId);
          if (msg.payload.success) {
            entry.resolve();
          } else {
            entry.reject(new Error(msg.payload.error || 'Write failed'));
          }
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEmbedded]);

  const sendWriteRequest = useCallback(
    (action: string, kind: string, fileName?: string, payload?: unknown, body?: string): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        pendingWrites.current.set(requestId, { resolve, reject });
        window.parent.postMessage(
          { type: 'wyqd:write-request', requestId, action, kind, fileName, payload, body },
          '*',
        );
      });
    },
    [],
  );

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }

  function openObjectsWithFocus(focus: Omit<ObjectListFocus, 'token'>) {
    setObjectListFocus({ ...focus, token: Date.now() });
    setActiveTab('objects');
  }

  async function loadVaultData() {
    const [nextObjects, nextSnapshots, nextReviews, nextArchivedEntities] = await Promise.all([
      markdownEntityRepository.listObjects(),
      markdownEntityRepository.listSnapshots(),
      markdownEntityRepository.listReviews(),
      markdownEntityRepository.listArchivedEntities(),
    ]);

    setStoredObjects(nextObjects);
    setStoredSnapshots(nextSnapshots);
    setStoredReviews(nextReviews);
    setArchivedEntities(nextArchivedEntities);
  }

  async function connectVault() {
    setIsLoading(true);
    setError(null);
    try {
      const connected = await obsidianService.requestAccess();
      setIsConnected(connected);
      if (connected) {
        await markdownEntityRepository.initialize();
        await loadVaultData();
        showNotice('Vault 已连接，物欲清单数据已同步。');
      } else {
        setError('当前浏览器不支持本地文件访问，或授权已取消。建议使用 Chromium 系浏览器。');
      }
    } catch (event) {
      setError(event instanceof Error ? event.message : '连接 Vault 失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function createObject(object: WYQDObject, body: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('save', 'object', undefined, object, body);
      } else {
        await markdownEntityRepository.saveObject(object, body);
        await loadVaultData();
      }
      showNotice('对象已保存到 Ownly/Objects。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '保存对象失败。');
      throw event;
    }
  }

  async function updateObject(fileName: string, object: WYQDObject, body: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('update', 'object', fileName, object, body);
      } else {
        await markdownEntityRepository.updateObject(fileName, object, body);
        await loadVaultData();
      }
      showNotice('对象已更新。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '更新对象失败。');
      throw event;
    }
  }

  async function deleteObject(fileName: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('delete', 'object', fileName);
      } else {
        await markdownEntityRepository.deleteObject(fileName);
        await loadVaultData();
      }
      showNotice('对象已归档，可在归档箱恢复。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '删除对象失败。');
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
      schema_version: '0.1',
      id: `review_${date.replaceAll('-', '')}_${Date.now()}`,
      type: 'review',
      review_type: 'object_review',
      title: `复盘 ${object.title}`,
      target: object.title,
      target_id: object.id,
      target_type: object.object_type,
      reviewed_at: date,
      exited_at: object.ended_at || date,
      exit_type: 'completed',
      realized_experience_cost: object.actual_total || object.budget_total || 0,
      food_rank: rankings.foodRank,
      scenery_rank: rankings.sceneryRank,
      experience_rank: rankings.experienceRank,
      summary,
      period: date.slice(0, 7),
      year: Number(date.slice(0, 4)),
      created_at: date,
      updated_at: date,
      currency: object.currency || 'CNY',
      tags: ['ownly', 'review', 'experience'],
    };

    const reviewBody = `## 体验复盘\n\n${summary}\n\n## 排行榜\n\n- 美食：${
      rankings.foodRank ? `第 ${rankings.foodRank} 名` : '未排位'
    }\n- 风景：${
      rankings.sceneryRank ? `第 ${rankings.sceneryRank} 名` : '未排位'
    }\n- 体验：${
      rankings.experienceRank ? `第 ${rankings.experienceRank} 名` : '未排位'
    }\n\n## 关联对象\n\n- ${object.title}\n`;

    const updatedObject: WYQDObject = {
      ...object,
      status: 'reviewed',
      reviewed_at: date,
      review_ref: review.id,
      updated_at: date,
    };

    if (isEmbedded) {
      await sendWriteRequest('save', 'review', undefined, review, reviewBody);
      await sendWriteRequest('update', 'object', fileName, updatedObject, body);
    } else {
      await markdownEntityRepository.saveReview(review, reviewBody);
      await markdownEntityRepository.updateObject(fileName, updatedObject, body);
      await loadVaultData();
    }
    showNotice('体验复盘已写入 Ownly/Reviews，并已关联对象。');
  }

  async function createSnapshot(snapshot: AccountSnapshot, body: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('save', 'snapshot', undefined, snapshot, body);
      } else {
        await markdownEntityRepository.saveSnapshot(snapshot, body);
        await loadVaultData();
      }
      showNotice('账户快照已保存。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '保存账户快照失败。');
      throw event;
    }
  }

  async function updateSnapshot(fileName: string, snapshot: AccountSnapshot, body: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('update', 'snapshot', fileName, snapshot, body);
      } else {
        await markdownEntityRepository.updateSnapshot(fileName, snapshot, body);
        await loadVaultData();
      }
      showNotice('账户快照已更新。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '更新账户快照失败。');
      throw event;
    }
  }

  async function deleteSnapshot(fileName: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('delete', 'snapshot', fileName);
      } else {
        await markdownEntityRepository.deleteSnapshot(fileName);
        await loadVaultData();
      }
      showNotice('账户快照已归档，可在归档箱恢复。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '删除账户快照失败。');
      throw event;
    }
  }

  async function createReview(review: ReviewEntry, body: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('save', 'review', undefined, review, body);
      } else {
        await markdownEntityRepository.saveReview(review, body);
        await loadVaultData();
      }
      showNotice('复盘已保存。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '保存复盘失败。');
      throw event;
    }
  }

  async function updateReview(fileName: string, review: ReviewEntry, body: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('update', 'review', fileName, review, body);
      } else {
        await markdownEntityRepository.updateReview(fileName, review, body);
        await loadVaultData();
      }
      showNotice('复盘已更新。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '更新复盘失败。');
      throw event;
    }
  }

  async function deleteReview(fileName: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('delete', 'review', fileName);
      } else {
        await markdownEntityRepository.deleteReview(fileName);
        await loadVaultData();
      }
      showNotice('复盘已归档，可在归档箱恢复。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '删除复盘失败。');
      throw event;
    }
  }

  async function restoreArchivedEntity(archiveType: ArchiveEntityType, archiveFileName: string) {
    try {
      if (isEmbedded) {
        await sendWriteRequest('restore', archiveType, archiveFileName);
      } else {
        await markdownEntityRepository.restoreArchivedEntity(archiveType, archiveFileName);
        await loadVaultData();
      }
      showNotice('归档数据已恢复。');
    } catch (event) {
      setError(event instanceof Error ? event.message : '恢复归档数据失败。');
      throw event;
    }
  }

  useEffect(() => {
    if (isEmbedded) return; // Data arrives via postMessage from Obsidian parent

    let isMounted = true;

    async function initialize() {
      setIsLoading(true);
      try {
        const connected = await obsidianService.initAutoConnect();
        if (!isMounted) return;

        setIsConnected(connected);
        if (connected) {
          await markdownEntityRepository.initialize();
          const [objectsFromVault, snapshotsFromVault, reviewsFromVault, archivedFromVault] = await Promise.all([
            markdownEntityRepository.listObjects(),
            markdownEntityRepository.listSnapshots(),
            markdownEntityRepository.listReviews(),
            markdownEntityRepository.listArchivedEntities(),
          ]);
          if (!isMounted) return;
          setStoredObjects(objectsFromVault);
          setStoredSnapshots(snapshotsFromVault);
          setStoredReviews(reviewsFromVault);
          setArchivedEntities(archivedFromVault);
        }
      } catch (event) {
        if (isMounted) {
          setError(event instanceof Error ? event.message : '初始化 Vault 失败。');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initialize();
    return () => {
      isMounted = false;
    };
  }, [isEmbedded]);

  return (
    <main className="wyqd-web-shell min-h-screen bg-stone-50 px-4 pb-28 pt-6 text-stone-950 sm:px-5 sm:pt-8">
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
        <header className="mb-6 rounded-xl border border-stone-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          {/* Row 1: brand identity */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-stone-100 pb-3 text-[11px] font-medium text-stone-500">
            <span className="text-lg font-semibold tracking-tight text-stone-950">Ownly</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-stone-600">
              v{runtimeInfo.coreTargetVersion}
            </span>
            {!isEmbedded && (
              <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[11px] font-semibold text-white">
                Web
              </span>
            )}
            <span className="h-1 w-1 rounded-full bg-stone-300" aria-hidden="true" />
            <span>{t('workspaceSubtitle')}</span>
          </div>
          {/* Row 2: tab heading + controls */}
          <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-stone-950 sm:text-xl">
                {t(tabHeadingKeys[activeTab].title)}
              </h1>
              <p className="mt-0.5 text-sm text-stone-500">{t(tabHeadingKeys[activeTab].description)}</p>
              <p className="mt-1.5 text-xs font-medium text-stone-400">{WYQD_PRODUCT_SLOGAN}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  isConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-stone-200 bg-stone-50 text-stone-500'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? 'bg-emerald-500' : 'bg-stone-400'
                  }`}
                  aria-hidden="true"
                />
                {isConnected ? t('vaultConnected') : isLoading ? t('connecting') : t('demoMode')}
              </span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-500">
                {storedObjects.length} {t('objects')}
              </span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-500">
                {storedSnapshots.length} {t('snapshots')}
              </span>
              <button
                type="button"
                onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
              >
                {language === 'zh' ? 'EN' : '中文'}
              </button>
              {!isEmbedded && (
                <button
                  type="button"
                  onClick={connectVault}
                  disabled={isLoading}
                  className="rounded-full bg-stone-950 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {isLoading ? t('connecting') : isConnected ? t('reconnectVault') : t('connectVault')}
                </button>
              )}
            </div>
          </div>
        </header>

        {!isEmbedded && (!isConnected || error) ? (
          <StatusBanner
            isConnected={isConnected}
            isLoading={isLoading}
            error={error}
            onConnect={connectVault}
          />
        ) : null}

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
	                onNavigate={setActiveTab}
	              />
            ) : null}
            {activeTab === 'objects' ? (
              <div className="space-y-4">
                <ObjectList
                  key={objectListFocus?.token || 'objects-default'}
                  disabled={!isConnected}
                  objects={storedObjects}
                  focus={objectListFocus}
                  onUpdate={updateObject}
                  onDelete={deleteObject}
                  onCreateObjectReview={createObjectReview}
                />
                <ObjectComposer
                  disabled={!isConnected}
                  submitLabel="保存到 Ownly"
                  onSubmit={createObject}
                />
                <ArchivePanel
                  disabled={!isConnected}
                  archivedEntities={archivedEntities}
                  onRestore={restoreArchivedEntity}
                />
              </div>
            ) : null}
            {activeTab === 'accounts' ? (
              <AccountsOverview
                disabled={!isConnected}
                snapshots={storedSnapshots}
                objects={objects}
                onCreateSnapshot={createSnapshot}
                onUpdateSnapshot={updateSnapshot}
                onDeleteSnapshot={deleteSnapshot}
              />
            ) : null}
            {activeTab === 'reviews' ? (
              <ReviewHome
                disabled={!isConnected}
                objects={objects}
                reviews={storedReviews}
                onCreateReview={createReview}
                onUpdateReview={updateReview}
                onDeleteReview={deleteReview}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </main>
  );
}
