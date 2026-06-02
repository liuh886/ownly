import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { OwnlyWorkspaceProvider } from '@/core/ownly-workspace-context';
import type { WYQDRepositoryAdapter } from '@/core/repository';
import type { WYQDMembershipState } from '@/core/membership';
import { I18nProvider } from '@/core/i18n-context';
import type { WYQDLanguage } from '@/core/i18n';
import { LicenseKeyModal } from '@/components/common/LicenseKeyModal';

export function ObsidianWorkspaceProvider({
  repository,
  membership,
  language,
  onLanguageChange,
  onRefresh, // eslint-disable-line @typescript-eslint/no-unused-vars
  withSuppressedRefresh,
  children,
}: {
  repository: WYQDRepositoryAdapter;
  membership: WYQDMembershipState;
  language: WYQDLanguage;
  onLanguageChange?: (lang: WYQDLanguage) => void;
  onRefresh?: () => void;
  withSuppressedRefresh?: <T>(fn: () => Promise<T>) => Promise<T>;
  children?: ReactNode;
}) {
  // Wrap repository write methods to suppress vault change listener during writes
  const wrappedRepository = useMemo(() => {
    if (!withSuppressedRefresh) return repository;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrap = <T extends (...args: any[]) => any>(fn: T): T =>
      ((...args: Parameters<T>) => withSuppressedRefresh(() => fn(...args))) as unknown as T;
    return {
      ...repository,
      saveObject: wrap(repository.saveObject.bind(repository)),
      updateObject: wrap(repository.updateObject.bind(repository)),
      archiveObject: wrap(repository.archiveObject.bind(repository)),
      restoreObject: wrap(repository.restoreObject.bind(repository)),
      saveSnapshot: wrap(repository.saveSnapshot.bind(repository)),
      updateSnapshot: wrap(repository.updateSnapshot.bind(repository)),
      archiveSnapshot: wrap(repository.archiveSnapshot.bind(repository)),
      saveReview: wrap(repository.saveReview.bind(repository)),
      updateReview: wrap(repository.updateReview.bind(repository)),
      archiveReview: wrap(repository.archiveReview.bind(repository)),
    } as WYQDRepositoryAdapter;
  }, [repository, withSuppressedRefresh]);
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
          repository: wrappedRepository,
          runtimeTarget: 'obsidian',
          isConnected: true,
          isLoading: false,
          connect: async () => true,
          error: null,
          clearError,
          notice,
          showNotice,
          membership,
          activateLicenseKey: async () => {
            setLicenseModalOpen(false);
          },
          clearLicenseKey: async () => {
            setLicenseModalOpen(false);
          },
          openLicenseModal: () => setLicenseModalOpen(true),
          closeLicenseModal: () => setLicenseModalOpen(false),
          licenseModalOpen,
        }}
      >
        {children}
        <LicenseKeyModal
          open={licenseModalOpen}
          onClose={() => setLicenseModalOpen(false)}
          currentPlan={membership.plan}
        />
      </OwnlyWorkspaceProvider>
    </I18nProvider>
  );
}
