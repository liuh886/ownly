'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BottomNav, type AppTab } from './BottomNav';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import { createWYQDRuntimeInfo } from '@/core/runtime';
import { getWYQDRuntimeCapabilities } from '@/core/runtime-capabilities';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import type { FirstObjectChoice } from '@/core/first-object-copy';
import {
  FIRST_OBJECT_COMPLETED_KEY,
  FIRST_OBJECT_DISMISSED_KEY,
  shouldPromptForFirstObject,
} from '@/core/first-object-onboarding';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';

import { useOwnlyData } from './useOwnlyData';
import { useOwnlyActions } from './useOwnlyActions';
import { AppHeader } from './AppHeader';
import { StatusBanner } from './StatusBanner';
import { TabRenderer, type FirstObjectRequest } from './TabRenderer';
import {
  EmptyOwnlyDataBanner,
  FirstObjectOnboarding,
} from '@/components/onboarding/FirstObjectOnboarding';
import { AgentMcpGuide } from '@/components/agent/AgentMcpGuide';

export function AppShell() {
  const { t, language } = useI18n();
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);
  const {
    runtimeTarget,
    isConnected,
    isLoading,
    connect,
    error,
    clearError,
    notice,
    storageGet,
    storageSet,
  } = useOwnlyWorkspace();
  const runtimeInfo = useMemo(() => createWYQDRuntimeInfo(runtimeTarget), [runtimeTarget]);
  const runtimeCapabilities = useMemo(
    () => getWYQDRuntimeCapabilities(runtimeTarget),
    [runtimeTarget],
  );

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [objectListFocus, setObjectListFocus] = useState<ObjectListFocus | null>(null);
  const [autoFocusComposer, setAutoFocusComposer] = useState(false);
  const [firstObjectForcedOpen, setFirstObjectForcedOpen] = useState(false);
  const [firstObjectPromptHandled, setFirstObjectPromptHandled] = useState(false);
  const [firstObjectRequest, setFirstObjectRequest] = useState<FirstObjectRequest | undefined>();
  const [agentGuideOpen, setAgentGuideOpen] = useState(false);

  const data = useOwnlyData();

  const completeFirstObjectOnboarding = useCallback(() => {
    storageSet(FIRST_OBJECT_COMPLETED_KEY, 'true');
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'false');
    setFirstObjectForcedOpen(false);
    setFirstObjectPromptHandled(true);
    setFirstObjectRequest(undefined);
  }, [storageSet]);

  const actions = useOwnlyActions(
    data.loadVaultData,
    data.storedObjects,
    completeFirstObjectOnboarding,
  );

  const automaticFirstObjectPrompt = runtimeCapabilities.firstObjectOnboarding
    && shouldPromptForFirstObject({
      isConnected,
      dataLoaded: data.dataLoaded,
      objectCount: data.storedObjects.length,
      completed: storageGet(FIRST_OBJECT_COMPLETED_KEY) === 'true',
      dismissed: storageGet(FIRST_OBJECT_DISMISSED_KEY) === 'true',
      promptHandled: firstObjectPromptHandled,
    });
  const firstObjectOpen = firstObjectForcedOpen || automaticFirstObjectPrompt;

  async function connectVault() {
    clearError();
    await connect();
  }

  const chooseFirstObject = useCallback((choice: FirstObjectChoice) => {
    const token = Date.now();
    setFirstObjectForcedOpen(false);
    setFirstObjectPromptHandled(true);
    setFirstObjectRequest({ token, choice });
    setObjectListFocus({ token });
    setAutoFocusComposer(true);
    setActiveTab('objects');
  }, []);

  const dismissFirstObject = useCallback(() => {
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'true');
    setFirstObjectForcedOpen(false);
    setFirstObjectPromptHandled(true);
  }, [storageSet]);

  // Bottom-tab switches always restart at the top — otherwise a long list's
  // scroll position leaks into the newly selected tab.
  const handleTabChange = useCallback((tab: AppTab) => {
    setActiveTab(tab);
    window.scrollTo(0, 0);
  }, []);

  const reopenFirstObject = useCallback(() => {
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'false');
    setFirstObjectForcedOpen(true);
  }, [storageSet]);

  const showEmptyDataBanner = runtimeCapabilities.firstObjectOnboarding
    && isConnected
    && data.dataLoaded
    && data.storedObjects.length === 0;

  return (
    <main className="wyqd-web-shell min-h-screen bg-stone-50 px-5 pb-10 pt-8 text-stone-950 sm:px-6 sm:pt-10">
      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-30 mx-auto max-w-2xl">
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
            {notice}
          </div>
        ) : null}
      </div>
      {isOffline ? (
        <div role="status" className="mx-auto mb-4 max-w-6xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          {language === 'zh'
            ? '当前处于离线状态，更改会保留在本地，联网后可继续同步。'
            : 'You are offline. Changes stay on this device and sync can resume when back online.'}
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl">
        <AppHeader
          activeTab={activeTab}
          objectCount={data.storedObjects.length}
          snapshotCount={data.storedSnapshots.length}
          onConnectVault={() => void connectVault()}
          onOpenAgentGuide={() => setAgentGuideOpen(true)}
        />

        {!isConnected || error ? (
          <StatusBanner
            isConnected={isConnected}
            isLoading={isLoading}
            error={error}
            onConnect={() => void connectVault()}
            isWebRuntime={runtimeCapabilities.dataRuntime === 'browser'}
          />
        ) : null}

        {showEmptyDataBanner ? (
          <EmptyOwnlyDataBanner onCreate={reopenFirstObject} />
        ) : null}

        {isConnected && !data.dataLoaded ? (
          <div className="py-10" role="status" aria-label={t('loading')}>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="ownly-skeleton h-24 rounded-xl" aria-hidden="true" />
              <div className="ownly-skeleton h-24 rounded-xl" aria-hidden="true" />
              <div className="ownly-skeleton hidden h-24 rounded-xl sm:block" aria-hidden="true" />
            </div>
            <p className="mt-4 text-center text-xs text-stone-500">{t('loading')}</p>
          </div>
        ) : null}

        {isConnected && !data.dataLoaded ? null : (
          <MotionConfig reducedMotion="user">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
              <TabRenderer
                activeTab={activeTab}
                isConnected={isConnected}
                metrics={data.metrics}
                objects={data.objects}
                snapshots={data.snapshots}
                storedObjects={data.storedObjects}
                storedReviews={data.storedReviews}
                storedSnapshots={data.storedSnapshots}
                storedLogs={data.storedLogs}
                archivedEntities={data.archivedEntities}
                objectListFocus={objectListFocus}
                autoFocusComposer={autoFocusComposer}
                firstObjectRequest={firstObjectRequest}
                actions={actions}
                setObjectListFocus={setObjectListFocus}
                setAutoFocusComposer={setAutoFocusComposer}
                setActiveTab={setActiveTab}
              />
            </motion.div>
            </AnimatePresence>
          </MotionConfig>
        )}

        <footer className="mt-6 pb-2 text-center">
          <span className="text-[10px] text-stone-500">
            Ownly v{runtimeInfo.coreTargetVersion} · {runtimeTarget} · {runtimeCapabilities.dataBehaviorContract} · {runtimeInfo.gitSha}
          </span>
        </footer>
      </div>

      <BottomNav activeTab={activeTab} onChange={handleTabChange} />

      <FirstObjectOnboarding
        open={firstObjectOpen}
        onChoose={chooseFirstObject}
        onDismiss={dismissFirstObject}
      />
      <AgentMcpGuide open={agentGuideOpen} onClose={() => setAgentGuideOpen(false)} />
    </main>
  );
}
