'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BottomNav, type AppTab } from './BottomNav';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import { createWYQDRuntimeInfo } from '@/core/runtime';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import type { FirstObjectChoice } from '@/core/first-object-copy';
import {
  FIRST_OBJECT_COMPLETED_KEY,
  FIRST_OBJECT_DISMISSED_KEY,
  shouldPromptForFirstObject,
} from '@/core/first-object-onboarding';
import { motion, AnimatePresence } from 'framer-motion';
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

export function AppShell() {
  const { t } = useI18n();
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

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [objectListFocus, setObjectListFocus] = useState<ObjectListFocus | null>(null);
  const [autoFocusComposer, setAutoFocusComposer] = useState(false);
  const [firstObjectOpen, setFirstObjectOpen] = useState(false);
  const [firstObjectPromptHandled, setFirstObjectPromptHandled] = useState(false);
  const [firstObjectRequest, setFirstObjectRequest] = useState<FirstObjectRequest | undefined>();

  const data = useOwnlyData();

  const completeFirstObjectOnboarding = useCallback(() => {
    storageSet(FIRST_OBJECT_COMPLETED_KEY, 'true');
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'false');
    setFirstObjectOpen(false);
    setFirstObjectPromptHandled(true);
  }, [storageSet]);

  const actions = useOwnlyActions(
    data.loadVaultData,
    data.storedObjects,
    completeFirstObjectOnboarding,
  );

  useEffect(() => {
    const shouldPrompt = shouldPromptForFirstObject({
      isConnected,
      dataLoaded: data.dataLoaded,
      objectCount: data.storedObjects.length,
      completed: storageGet(FIRST_OBJECT_COMPLETED_KEY) === 'true',
      dismissed: storageGet(FIRST_OBJECT_DISMISSED_KEY) === 'true',
      promptHandled: firstObjectPromptHandled,
    });
    if (shouldPrompt) setFirstObjectOpen(true);
  }, [
    data.dataLoaded,
    data.storedObjects.length,
    firstObjectPromptHandled,
    isConnected,
    storageGet,
  ]);

  async function connectVault() {
    clearError();
    await connect();
  }

  const chooseFirstObject = useCallback((choice: FirstObjectChoice) => {
    setFirstObjectOpen(false);
    setFirstObjectPromptHandled(true);
    setFirstObjectRequest({ token: Date.now(), choice });
  }, []);

  const dismissFirstObject = useCallback(() => {
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'true');
    setFirstObjectOpen(false);
    setFirstObjectPromptHandled(true);
  }, [storageSet]);

  const reopenFirstObject = useCallback(() => {
    storageSet(FIRST_OBJECT_DISMISSED_KEY, 'false');
    setFirstObjectOpen(true);
  }, [storageSet]);

  const firstObjectRequestHandled = useCallback(() => {
    setFirstObjectRequest(undefined);
  }, []);

  const showEmptyDataBanner = isConnected
    && data.dataLoaded
    && data.storedObjects.length === 0;

  return (
    <main className="wyqd-web-shell min-h-screen bg-stone-50 px-5 pb-24 pt-8 text-stone-950 sm:px-6 sm:pt-10">
      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 top-4 z-30 mx-auto max-w-2xl">
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
            {notice}
          </div>
        ) : null}
      </div>
      <div className="mx-auto max-w-6xl">
        <AppHeader
          activeTab={activeTab}
          objectCount={data.storedObjects.length}
          snapshotCount={data.storedSnapshots.length}
          onConnectVault={() => void connectVault()}
        />

        {!isConnected || error ? (
          <StatusBanner
            isConnected={isConnected}
            isLoading={isLoading}
            error={error}
            onConnect={() => void connectVault()}
            isWebRuntime={runtimeTarget === 'web'}
          />
        ) : null}

        {showEmptyDataBanner ? (
          <EmptyOwnlyDataBanner onCreate={reopenFirstObject} />
        ) : null}

        {isConnected && !data.dataLoaded ? (
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

        {isConnected && !data.dataLoaded ? null : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
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
                archivedEntities={data.archivedEntities}
                objectListFocus={objectListFocus}
                autoFocusComposer={autoFocusComposer}
                firstObjectRequest={firstObjectRequest}
                actions={actions}
                setObjectListFocus={setObjectListFocus}
                setAutoFocusComposer={setAutoFocusComposer}
                setActiveTab={setActiveTab}
                onFirstObjectRequestHandled={firstObjectRequestHandled}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      <footer className="mt-4 pb-20 text-center">
        <span className="text-[10px] text-stone-300">Ownly v{runtimeInfo.coreTargetVersion} · {runtimeTarget} · {runtimeInfo.gitSha}</span>
      </footer>

      <FirstObjectOnboarding
        open={firstObjectOpen}
        onChoose={chooseFirstObject}
        onDismiss={dismissFirstObject}
      />
    </main>
  );
}
