'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { BottomNav, type AppTab } from './BottomNav';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import { createWYQDRuntimeInfo } from '@/core/runtime';
import { getWYQDRuntimeCapabilities } from '@/core/runtime-capabilities';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import type { FirstObjectChoice } from '@/core/first-object-copy';
import {
  FIRST_OBJECT_COMPLETED_KEY,
  FIRST_OBJECT_DISMISSED_KEY,
  LEGACY_CAPTURE_ONBOARDING_KEY,
  hasSeenCaptureExplainer,
  resolveFirstRunStep,
  type FirstRunStep,
} from '@/core/first-run';
import { SAMPLE_TRIP_LOADED_KEY } from '@/core/sample-trip';
import { SAMPLE_DATA_LOADED_KEY } from '@/services/loadSampleData';
import { MotionConfig } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';

import { useOwnlyData } from './useOwnlyData';
import { useOwnlyActions } from './useOwnlyActions';
import { AppHeader } from './AppHeader';
import { StatusBanner } from './StatusBanner';
import { TabRenderer, type FirstObjectRequest } from './TabRenderer';
import { EmptyOwnlyDataBanner } from '@/components/onboarding/FirstObjectOnboarding';
import { useAppNavigation } from './useAppNavigation';
const FirstRunGuide = dynamic(() => import('@/components/onboarding/FirstRunGuide').then((mod) => mod.FirstRunGuide));
const AgentMcpGuide = dynamic(() => import('@/components/agent/AgentMcpGuide').then((mod) => mod.AgentMcpGuide));

function subscribeOnlineStatus(notify: () => void): () => void {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

export function AppShell() {
  const { t, language } = useI18n();
  // Server snapshot is online so prerender and hydration match; the true
  // status is read from navigator right after hydration.
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    () => navigator.onLine,
    () => true,
  );
  const isOffline = !isOnline;
  const {
    runtimeTarget,
    isConnected,
    mode,
    isLoading,
    connect,
    disconnectFolder,
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

  const isBrowserRuntime = runtimeCapabilities.dataRuntime === 'browser';
  const [activeTab, setActiveTab] = useAppNavigation(isBrowserRuntime);
  const previousTab = useRef(activeTab);
  useEffect(() => {
    const changed = previousTab.current !== activeTab;
    previousTab.current = activeTab;
    // Run after the locale provider's generic document-title effect.
    const timer = window.setTimeout(() => {
      const heading = document.getElementById('ownly-view-title');
      if (heading && isBrowserRuntime) document.title = `${heading.textContent} · Ownly`;
      if (changed && !document.querySelector('[aria-modal="true"]')) heading?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, language, isBrowserRuntime]);
  const [objectListFocus, setObjectListFocus] = useState<ObjectListFocus | null>(null);
  const [autoFocusComposer, setAutoFocusComposer] = useState(false);
  const [firstObjectForcedOpen, setFirstObjectForcedOpen] = useState(false);
  const [firstRunHandled, setFirstRunHandled] = useState(false);
  const [firstObjectRequest, setFirstObjectRequest] = useState<FirstObjectRequest | undefined>();
  const [agentGuideOpen, setAgentGuideOpen] = useState(false);

  const data = useOwnlyData();

  const completeFirstObjectOnboarding = useCallback(() => {
    storageSet(FIRST_OBJECT_COMPLETED_KEY, 'true');
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'false');
    setFirstObjectForcedOpen(false);
    setFirstRunHandled(true);
    setFirstObjectRequest(undefined);
  }, [storageSet]);

  const actions = useOwnlyActions(
    data.loadVaultData,
    data.storedObjects,
    completeFirstObjectOnboarding,
  );

  // One dialog, one decision point. `resolveFirstRunStep` owns the ordering so
  // the explainer and the first-record prompt can no longer both fire.
  const automaticFirstRunStep: FirstRunStep | null =
    runtimeCapabilities.firstObjectOnboarding
      ? resolveFirstRunStep({
          isConnected,
          dataLoaded: data.dataLoaded,
          objectCount: data.storedObjects.length,
          completed: storageGet(FIRST_OBJECT_COMPLETED_KEY) === 'true',
          dismissed: storageGet(FIRST_OBJECT_DISMISSED_KEY) === 'true',
          captureExplainerSeen: hasSeenCaptureExplainer(storageGet(LEGACY_CAPTURE_ONBOARDING_KEY)),
          sampleTripLoaded: storageGet(SAMPLE_TRIP_LOADED_KEY) === 'true',
        })
      : null;
  const firstRunStep = firstObjectForcedOpen
    ? (firstObjectRequest ? null : ('first-record' as const))
    : (firstRunHandled ? null : automaticFirstRunStep);
  const firstRunOpen = firstRunStep !== null;

  async function connectVault() {
    clearError();
    await connect();
  }

  const chooseFirstObject = useCallback((choice: FirstObjectChoice) => {
    const token = Date.now();
    setFirstObjectForcedOpen(false);
    setFirstRunHandled(true);
    setFirstObjectRequest({ token, choice });
    setObjectListFocus({ token });
    setAutoFocusComposer(true);
    setActiveTab('objects');
  }, [setActiveTab]);

  const dismissFirstObject = useCallback(() => {
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'true');
    setFirstObjectForcedOpen(false);
    setFirstRunHandled(true);
  }, [storageSet]);

  // A Sample Trip is real content in the user's own folder, so the first-run
  // guide is satisfied — and the legacy explainer flag is retired.
  const completeFirstRunViaSample = useCallback(() => {
    storageSet(SAMPLE_TRIP_LOADED_KEY, 'true');
    storageSet(FIRST_OBJECT_COMPLETED_KEY, 'true');
    storageSet(LEGACY_CAPTURE_ONBOARDING_KEY, '1');
    setFirstObjectForcedOpen(false);
    setFirstRunHandled(true);
    void data.loadVaultData();
  }, [data, storageSet]);

  // The full example set lands as ordinary records in the real data folder, so
  // it satisfies setup exactly the same way a Sample Trip does.
  const completeFirstRunViaSampleData = useCallback(() => {
    storageSet(SAMPLE_DATA_LOADED_KEY, 'true');
    storageSet(SAMPLE_TRIP_LOADED_KEY, 'true');
    storageSet(FIRST_OBJECT_COMPLETED_KEY, 'true');
    storageSet(LEGACY_CAPTURE_ONBOARDING_KEY, '1');
    setFirstObjectForcedOpen(false);
    setFirstRunHandled(true);
    void data.loadVaultData();
  }, [data, storageSet]);

  // Bottom-tab switches always restart at the top — otherwise a long list's
  // scroll position leaks into the newly selected tab.
  const handleTabChange = useCallback((tab: AppTab) => {
    setActiveTab(tab);
    window.scrollTo(0, 0);
  }, [setActiveTab]);

  const reopenFirstObject = useCallback(() => {
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'false');
    setFirstObjectForcedOpen(true);
  }, [storageSet]);

  const showEmptyDataBanner = runtimeCapabilities.firstObjectOnboarding
    && isConnected
    && data.dataLoaded
    && data.storedObjects.length === 0;

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#ownly-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(1rem+env(safe-area-inset-top))] focus:z-[80] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-primary focus:shadow-lg"
      >
        {t('skipToContent')}
      </a>
      <main
        id="ownly-main-content"
        tabIndex={-1}
        className="wyqd-web-shell min-h-screen bg-surface-subtle px-5 pb-10 pt-8 text-ink sm:px-6 sm:pt-10"
      >
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
          onDisconnectFolder={() => void disconnectFolder()}
          onOpenAgentGuide={() => setAgentGuideOpen(true)}
        />

        {/* Only the two states the header pill cannot state quietly. Connected
            lives entirely in the pill and its menu. */}
        <StatusBanner
          mode={mode}
          isLoading={isLoading}
          error={error ?? data.loadError}
          onConnect={() => void connectVault()}
          isWebRuntime={runtimeCapabilities.dataRuntime === 'browser'}
          onRetry={!error && data.loadError ? () => void data.loadVaultData().catch(() => {}) : undefined}
        />

        {showEmptyDataBanner ? (
          <EmptyOwnlyDataBanner onCreate={reopenFirstObject} />
        ) : null}

        {isConnected && !data.dataLoaded && !data.loadError ? (
          <div className="py-10" role="status" aria-label={t('loading')}>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="ownly-skeleton h-24 rounded-xl" aria-hidden="true" />
              <div className="ownly-skeleton h-24 rounded-xl" aria-hidden="true" />
              <div className="ownly-skeleton hidden h-24 rounded-xl sm:block" aria-hidden="true" />
            </div>
            <p className="mt-4 text-center text-xs text-ink-muted">{t('loading')}</p>
          </div>
        ) : null}

        {isConnected && !data.dataLoaded ? null : (
          <div>
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
                onDataChanged={data.loadVaultData}
                setObjectListFocus={setObjectListFocus}
                setAutoFocusComposer={setAutoFocusComposer}
                setActiveTab={setActiveTab}
              />
          </div>
        )}

        <footer className="mt-6 pb-2 text-center">
          <span className="text-[10px] text-ink-muted">
            Ownly v{runtimeInfo.coreTargetVersion} · {runtimeTarget} · {runtimeCapabilities.dataBehaviorContract} · {runtimeInfo.gitSha}
          </span>
        </footer>
      </div>

      <BottomNav activeTab={activeTab} onChange={handleTabChange} />

      {firstRunOpen && <FirstRunGuide
        open={firstRunOpen}
        step={firstRunStep}
        onChoose={chooseFirstObject}
        onSampleLoaded={completeFirstRunViaSample}
        onSampleDataLoaded={completeFirstRunViaSampleData}
        onDismiss={dismissFirstObject}
      />}
      {agentGuideOpen && <AgentMcpGuide open={agentGuideOpen} onClose={() => setAgentGuideOpen(false)} />}
      </main>
    </MotionConfig>
  );
}
