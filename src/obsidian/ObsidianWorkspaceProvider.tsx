import { useState, useCallback, useRef, type ReactNode } from 'react';
import { OwnlyWorkspaceProvider } from '@/core/ownly-workspace-context';
import type { WYQDRepositoryAdapter } from '@/core/repository';
import type { WYQDMembershipState } from '@/core/membership';
import { I18nProvider } from '@/core/i18n-context';
import type { WYQDLanguage } from '@/core/i18n';

export function ObsidianWorkspaceProvider({
  repository,
  membership,
  language,
  onLanguageChange,
  onActivateLicense,
  onClearLicense,
  onRefresh,
  children,
}: {
  repository: WYQDRepositoryAdapter;
  membership: WYQDMembershipState;
  language: WYQDLanguage;
  onLanguageChange?: (lang: WYQDLanguage) => void;
  onActivateLicense?: (key: string) => Promise<void>;
  onClearLicense?: () => Promise<void>;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  const clearError = useCallback(() => {}, []);

  return (
    <I18nProvider initialLanguage={language} onLanguageChange={onLanguageChange}>
      <OwnlyWorkspaceProvider
        value={{
          repository,
          runtimeTarget: 'obsidian',
          isConnected: true,
          isLoading: false,
          connect: async () => true,
          error: null,
          clearError,
          notice,
          showNotice,
          membership,
          activateLicenseKey: async (key: string) => {
            if (onActivateLicense) {
              await onActivateLicense(key);
              onRefresh?.();
            }
            setLicenseModalOpen(false);
          },
          clearLicenseKey: async () => {
            if (onClearLicense) {
              await onClearLicense();
              onRefresh?.();
            }
            setLicenseModalOpen(false);
          },
          openLicenseModal: () => setLicenseModalOpen(true),
          closeLicenseModal: () => setLicenseModalOpen(false),
          licenseModalOpen,
        }}
      >
        {children}
      </OwnlyWorkspaceProvider>
    </I18nProvider>
  );
}
