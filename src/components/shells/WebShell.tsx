'use client';

import { useCallback, useEffect, useState } from 'react';
import { OwnlyWorkspaceProvider } from '@/core/ownly-workspace-context';
import { type WYQDMembershipState } from '@/core/membership';
import { markdownEntityRepository } from '@/services/MarkdownEntityRepository';
import { obsidianService } from '@/services/ObsidianFileSystemService';
import { AppShell } from '@/components/app-shell/AppShell';
import { LicenseKeyModal } from '@/components/common/LicenseKeyModal';

const WEB_PRO_MEMBERSHIP: WYQDMembershipState = {
  plan: 'pro_lifetime',
  status: 'activated',
  isPro: true,
  licenseKeyLast4: null,
  planLabel: 'Pro Lifetime',
  statusLabel: 'Web always Pro',
  upgradeMessage: 'Web runtime is always Pro.',
};

export function WebShell() {
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
      setIsConnected(connected);
      if (connected) {
        await markdownEntityRepository.initialize();
        return true;
      }
      setError('当前浏览器不支持本地文件访问，或授权已取消。建议使用 Chromium 系浏览器。');
      return false;
    } catch (event) {
      setError(event instanceof Error ? event.message : '连接 Vault 失败。');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setIsLoading(true);
      try {
        const connected = await obsidianService.initAutoConnect();
        if (!isMounted) return;
        setIsConnected(connected);
        if (connected) {
          await markdownEntityRepository.initialize();
        }
      } catch (event) {
        if (isMounted) {
          setError(event instanceof Error ? event.message : '初始化 Vault 失败。');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    init();
    return () => { isMounted = false; };
  }, []);

  return (
    <OwnlyWorkspaceProvider
      value={{
        repository: markdownEntityRepository,
        runtimeTarget: 'web',
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
      }}
    >
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
