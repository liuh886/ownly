'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OwnlyWorkspaceProvider } from '@/core/ownly-workspace-context';
import { type WYQDMembershipState } from '@/core/membership';
import { getOwnlyLocalDataCopy, isMobileDevice } from '@/core/local-data-copy';
import { markdownEntityRepository } from '@/services/MarkdownEntityRepository';
import { obsidianService } from '@/services/ObsidianFileSystemService';
import { seedDemoMode } from '@/services/seedDemoMode';
import { setStoreFolderConnected } from '@/services/ownlyStoreRouter';
import { AppShell } from '@/components/app-shell/AppShell';
import { LicenseKeyModal } from '@/components/common/LicenseKeyModal';
import { WebDataOnboarding } from '@/components/onboarding/WebDataOnboarding';
import { useI18n } from '@/core/i18n-context';
import { trackOwnlyEvent } from '@/lib/analytics';
import { checkWorkspaceRecovery, type RecoveryState } from '@/core/workspace-recovery';

const ONBOARDING_DISMISSED_KEY = 'ownly_web_onboarding_dismissed';
const basePath = process.env.NEXT_PUBLIC_OWNLY_BASE_PATH ?? '';

function requestStoragePersistence(): void {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

type LocalDataAction = 'create' | 'open';

export function WebShell() {
  const { t, language } = useI18n();
  const localDataCopy = getOwnlyLocalDataCopy(language);

  const WEB_PRO_MEMBERSHIP: WYQDMembershipState = useMemo(() => ({
    plan: 'pro_lifetime',
    status: 'activated',
    isPro: true,
    licenseKeyLast4: null,
    planLabel: t('planProLifetime'),
    statusLabel: t('webAlwaysPro'),
    upgradeMessage: t('webAlwaysProDesc'),
  }), [t]);
  const [isConnected, setIsConnected] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [membership] = useState<WYQDMembershipState>(WEB_PRO_MEMBERSHIP);
  const [, setRecoveryState] = useState<RecoveryState | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const activateLicenseKey = useCallback(() => setLicenseModalOpen(false), []);
  const clearLicenseKey = useCallback(() => setLicenseModalOpen(false), []);
  const openLicenseModal = useCallback(() => setLicenseModalOpen(true), []);
  const closeLicenseModal = useCallback(() => setLicenseModalOpen(false), []);

  const connect = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof window.showDirectoryPicker !== 'function') {
      setError(isMobileDevice() ? localDataCopy.mobileNotSupported : localDataCopy.browserNotSupported);
      return false;
    }
    setOnboardingOpen(true);
    trackOwnlyEvent('onboarding_opened');
    return false;
  }, [localDataCopy]);

  const refreshData = useCallback(() => {
    setDataRevision((revision) => revision + 1);
  }, []);

  const connectLocalData = useCallback(async (action: LocalDataAction): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      if (typeof window.showDirectoryPicker !== 'function') {
        setError(isMobileDevice() ? localDataCopy.mobileNotSupported : localDataCopy.browserNotSupported);
        return false;
      }

      const connected = action === 'create'
        ? await obsidianService.createLocalData()
        : await obsidianService.openLocalData();
      if (!connected) return false;

      setStoreFolderConnected(true);
      await markdownEntityRepository.initialize();
      requestStoragePersistence();
      setIsConnected(true);
      setIsDemoMode(false);
      refreshData();
      setOnboardingOpen(false);
      window.localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
      showNotice(action === 'create' ? localDataCopy.createdNotice : localDataCopy.openedNotice);
      trackOwnlyEvent('local_data_connected', { action });
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : localDataCopy.connectFailed);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [localDataCopy, showNotice, refreshData]);

  /**
   * Demo mode: no folder, so the repository resolves to the in-memory store.
   * Seeding it is what makes Home / Objects / Accounts / Reviews / Planner show
   * a populated, read-only app. Nothing is written to disk — connecting a
   * folder discards this rather than migrating it.
   */
  const continueInDemo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setStoreFolderConnected(false);
    try {
      await seedDemoMode();
      setIsDemoMode(true);
      // The store was empty when the app first read it; nudge consumers to
      // re-read or the tabs would keep showing zero records.
      refreshData();
      trackOwnlyEvent('demo_started', { surface: 'web' });
    } catch (seedError) {
      setError(seedError instanceof Error ? seedError.message : localDataCopy.connectFailed);
    } finally {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
      setOnboardingOpen(false);
      setIsLoading(false);
    }
  }, [localDataCopy, refreshData]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      window.location.replace(`${basePath}/#preview`);
      return;
    }

    let isMounted = true;

    // Activation funnel: returning-visit milestone. Gap bucket is computed
    // locally from the last-visit date; only the bucket leaves the device.
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastVisit = window.localStorage.getItem('ownly_last_visit');
      const seen = window.localStorage.getItem('ownly_seen');
      if (seen && lastVisit && lastVisit !== today) {
        const gapDays = Math.max(0, Math.round((Date.parse(today) - Date.parse(lastVisit)) / 86400000));
        const gap = gapDays <= 1 ? '1d' : gapDays <= 7 ? '7d' : gapDays <= 30 ? '30d' : '90d+';
        trackOwnlyEvent('app_return', { gap });
      }
      window.localStorage.setItem('ownly_last_visit', today);
      window.localStorage.setItem('ownly_seen', '1');
    } catch {}

    async function init() {
      setIsLoading(true);
      try {
        const connected = await obsidianService.initAutoConnect();
        if (!isMounted) return;
        if (connected) {
          setStoreFolderConnected(true);
          await markdownEntityRepository.initialize();
          requestStoragePersistence();
          setRecoveryState('CONNECTED');
        } else {
          // No folder: route the repositories at the in-memory store so Demo
          // mode has something to render. Reads work, writes stay gated.
          setStoreFolderConnected(false);
          // Check recovery state for detailed UX (permission / missing)
          try {
            const { get } = await import('idb-keyval');
            const handle = (await get('wyqd_obsidian_handle')) as FileSystemDirectoryHandle | null;
            const rec = await checkWorkspaceRecovery(handle ?? null, navigator.onLine);
            setRecoveryState(rec.state);
            if (rec.state !== 'CONNECTED') setError(rec.message);
          } catch {}
        }
        if (isMounted) {
          setIsConnected(connected);
          const shouldPrompt = !connected
            && window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== 'true';
          setOnboardingOpen(shouldPrompt);
          if (shouldPrompt) trackOwnlyEvent('onboarding_opened');
          // A returning demo user has no folder, and the memory store dies with
          // the tab, so re-seed it. This is memory-only by construction — the
          // store router still points at the filesystem the moment a folder
          // connects, so nothing here can reach real data.
          if (!connected && !shouldPrompt) {
            await seedDemoMode();
            setIsDemoMode(true);
            refreshData();
          }
        }
      } catch (error) {
        if (isMounted) {
          setError(error instanceof Error ? error.message : localDataCopy.initializeFailed);
          setRecoveryState('RECONNECT_REQUIRED');
          const shouldPrompt = window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== 'true';
          setOnboardingOpen(shouldPrompt);
          if (shouldPrompt) trackOwnlyEvent('onboarding_opened');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void init();
    return () => { isMounted = false; };
  }, [localDataCopy, refreshData]);

  const contextValue = useMemo(() => ({
    repository: markdownEntityRepository,
    runtimeTarget: 'web' as const,
    isConnected,
    isDemoMode,
    dataRevision,
    refreshData,
    isLoading,
    connect,
    error,
    clearError,
    notice,
    showNotice,
    membership,
    activateLicenseKey,
    clearLicenseKey,
    openLicenseModal,
    closeLicenseModal,
    licenseModalOpen,
    storageGet: (key: string) => (
      typeof window === 'undefined' ? null : window.localStorage.getItem(key)
    ),
    storageSet: (key: string, value: string) => {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    },
  }), [isConnected, isDemoMode, dataRevision, refreshData, isLoading, connect, error, clearError, notice, showNotice, membership, activateLicenseKey, clearLicenseKey, openLicenseModal, closeLicenseModal, licenseModalOpen]);

  return (
    <OwnlyWorkspaceProvider value={contextValue}>
      <AppShell />
      <WebDataOnboarding
        open={onboardingOpen}
        isLoading={isLoading}
        error={error}
        onCreate={() => void connectLocalData('create')}
        onOpen={() => void connectLocalData('open')}
        onContinueDemo={() => void continueInDemo()}
      />
      <LicenseKeyModal
        open={licenseModalOpen}
        onClose={closeLicenseModal}
        onActivate={activateLicenseKey}
        onClear={clearLicenseKey}
        currentPlan={membership.plan}
      />
    </OwnlyWorkspaceProvider>
  );
}

