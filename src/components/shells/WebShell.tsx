'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OwnlyWorkspaceProvider } from '@/core/ownly-workspace-context';
import { type WYQDMembershipState } from '@/core/membership';
import { markdownEntityRepository } from '@/services/MarkdownEntityRepository';
import { obsidianService } from '@/services/ObsidianFileSystemService';
import { AppShell } from '@/components/app-shell/AppShell';
import { LicenseKeyModal } from '@/components/common/LicenseKeyModal';
import { useI18n } from '@/core/i18n-context';

export function WebShell() {
  const { t } = useI18n();

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [membership] = useState<WYQDMembershipState>(WEB_PRO_MEMBERSHIP);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
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
    setIsLoading(true);
    setError(null);
    try {
      const connected = await obsidianService.requestAccess();
      if (connected) {
        await markdownEntityRepository.initialize();
        setIsConnected(true);
        return true;
      }
      setError(t('browserNotSupported'));
      return false;
    } catch (event) {
      setError(event instanceof Error ? event.message : t('connectVaultFailed'));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Auto-connect on mount
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setIsLoading(true);
      try {
        const connected = await obsidianService.initAutoConnect();
        if (!isMounted) return;
        if (connected) {
          await markdownEntityRepository.initialize();
        }
        if (isMounted) {
          setIsConnected(connected);
        }
      } catch (event) {
        if (isMounted) {
          setError(event instanceof Error ? event.message : t('initVaultFailed'));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void init();
    return () => { isMounted = false; };
  }, [t]);

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
  }), [isConnected, isLoading, connect, error, clearError, notice, showNotice, membership, activateLicenseKey, clearLicenseKey, openLicenseModal, closeLicenseModal, licenseModalOpen]);

  return (
    <OwnlyWorkspaceProvider value={contextValue}>
      <AppShell />
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
