'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OwnlyWorkspaceProvider } from '@/core/ownly-workspace-context';
import { type WYQDMembershipState } from '@/core/membership';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';
import { markdownEntityRepository } from '@/services/MarkdownEntityRepository';
import { obsidianService } from '@/services/ObsidianFileSystemService';
import { AppShell } from '@/components/app-shell/AppShell';
import { LicenseKeyModal } from '@/components/common/LicenseKeyModal';
import { ProductPreview } from '@/components/marketing/ProductPreview';
import { WebDataOnboarding } from '@/components/onboarding/WebDataOnboarding';
import { useI18n } from '@/core/i18n-context';

const ONBOARDING_DISMISSED_KEY = 'ownly_web_onboarding_dismissed';
const basePath = process.env.NEXT_PUBLIC_OWNLY_BASE_PATH ?? '';

type LocalDataAction = 'create' | 'open';

function previewRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

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
  const [isPreview, setIsPreview] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [membership] = useState<WYQDMembershipState>(WEB_PRO_MEMBERSHIP);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const activateLicenseKey = useCallback(() => {
    setLicenseModalOpen(false);
  }, []);

  const clearLicenseKey = useCallback(() => {
    setLicenseModalOpen(false);
  }, []);

  const openLicenseModal = useCallback(() => setLicenseModalOpen(true), []);
  const closeLicenseModal = useCallback(() => setLicenseModalOpen(false), []);

  const connect = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof window.showDirectoryPicker !== 'function') {
      setError(localDataCopy.browserNotSupported);
      return false;
    }
    setOnboardingOpen(true);
    return false;
  }, [localDataCopy]);

  const connectLocalData = useCallback(async (action: LocalDataAction): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      if (typeof window.showDirectoryPicker !== 'function') {
        setError(localDataCopy.browserNotSupported);
        return false;
      }

      const connected = action === 'create'
        ? await obsidianService.createLocalData()
        : await obsidianService.openLocalData();
      if (!connected) return false;

      await markdownEntityRepository.initialize();
      setIsConnected(true);
      setOnboardingOpen(false);
      window.localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
      showNotice(action === 'create' ? localDataCopy.createdNotice : localDataCopy.openedNotice);
      return true;
    } catch (event) {
      setError(event instanceof Error ? event.message : localDataCopy.connectFailed);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [localDataCopy, showNotice]);

  const continueInDemo = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    setError(null);
    setOnboardingOpen(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      setIsLoading(true);

      if (previewRequested()) {
        if (isMounted) {
          setIsPreview(true);
          setOnboardingOpen(false);
          setIsLoading(false);
        }
        return;
      }

      try {
        const connected = await obsidianService.initAutoConnect();
        if (!isMounted) return;
        if (connected) {
          await markdownEntityRepository.initialize();
        }
        if (isMounted) {
          setIsConnected(connected);
          const shouldPrompt = !connected
            && window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== 'true';
          setOnboardingOpen(shouldPrompt);
        }
      } catch (event) {
        if (isMounted) {
          setError(event instanceof Error ? event.message : localDataCopy.initializeFailed);
          const shouldPrompt = window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== 'true';
          setOnboardingOpen(shouldPrompt);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void init();
    return () => { isMounted = false; };
  }, [localDataCopy]);

  const contextValue = useMemo(() => ({
    repository: markdownEntityRepository,
    runtimeTarget: 'web' as const,
    isConnected,
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
  }), [isConnected, isLoading, connect, error, clearError, notice, showNotice, membership, activateLicenseKey, clearLicenseKey, openLicenseModal, closeLicenseModal, licenseModalOpen]);

  if (isPreview) {
    return (
      <ProductPreview
        appHref={`${basePath}/app/`}
        homeHref={`${basePath}/`}
      />
    );
  }

  return (
    <OwnlyWorkspaceProvider value={contextValue}>
      <AppShell />
      <WebDataOnboarding
        open={onboardingOpen}
        isLoading={isLoading}
        error={error}
        onCreate={() => void connectLocalData('create')}
        onOpen={() => void connectLocalData('open')}
        onContinueDemo={continueInDemo}
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
