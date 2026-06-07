import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { App } from 'obsidian';
import { OwnlyWorkspaceProvider } from '@/core/ownly-workspace-context';
import type { WYQDRepositoryWithStorageInfo } from '@/core/repository';
import type { WYQDMembershipState } from '@/core/membership';
import { I18nProvider } from '@/core/i18n-context';
import type { WYQDLanguage } from '@/core/i18n';
import { LicenseKeyModal } from '@/components/common/LicenseKeyModal';

export function ObsidianWorkspaceProvider({
  app,
  repository,
  membership,
  language,
  onLanguageChange,
  onRefresh,
  withSuppressedRefresh,
  children,
}: {
  app: App;
  repository: WYQDRepositoryWithStorageInfo;
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
    const wrap = <T extends (...args: never[]) => Promise<unknown>>(fn: T): T =>
      ((...args: Parameters<T>) => withSuppressedRefresh(() => fn(...args))) as unknown as T;
    const bind = <T extends (...args: never[]) => Promise<unknown>>(fn: T): T =>
      fn.bind(repository) as T;

    // Copy prototype methods that spread operator misses
    return {
      listObjects: bind(repository.listObjects.bind(repository)),
      listAccounts: bind(repository.listAccounts.bind(repository)),
      listSnapshots: bind(repository.listSnapshots.bind(repository)),
      listReviews: bind(repository.listReviews.bind(repository)),
      listArchivedEntities: bind(repository.listArchivedEntities.bind(repository)),
      getDataFolderPath: repository.getDataFolderPath?.bind(repository),
      listDataDirectories: repository.listDataDirectories?.bind(repository),
      saveObject: wrap(repository.saveObject.bind(repository)),
      updateObject: wrap(repository.updateObject.bind(repository)),
      archiveObject: wrap(repository.archiveObject.bind(repository)),
      restoreObject: wrap(repository.restoreObject.bind(repository)),
      saveAccount: wrap(repository.saveAccount.bind(repository)),
      updateAccount: wrap(repository.updateAccount.bind(repository)),
      archiveAccount: wrap(repository.archiveAccount.bind(repository)),
      restoreAccount: wrap(repository.restoreAccount.bind(repository)),
      saveSnapshot: wrap(repository.saveSnapshot.bind(repository)),
      updateSnapshot: wrap(repository.updateSnapshot.bind(repository)),
      archiveSnapshot: wrap(repository.archiveSnapshot.bind(repository)),
      restoreSnapshot: wrap(repository.restoreSnapshot.bind(repository)),
      saveReview: wrap(repository.saveReview.bind(repository)),
      updateReview: wrap(repository.updateReview.bind(repository)),
      archiveReview: wrap(repository.archiveReview.bind(repository)),
      restoreReview: wrap(repository.restoreReview.bind(repository)),
      restoreArchivedEntity: wrap(repository.restoreArchivedEntity.bind(repository)),
      permanentlyDeleteArchivedEntity: wrap(repository.permanentlyDeleteArchivedEntity.bind(repository)),
    } as WYQDRepositoryWithStorageInfo;
  }, [repository, withSuppressedRefresh]);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const clearError = useCallback(() => {}, []);

  return (
    <I18nProvider
      initialLanguage={language}
      onLanguageChange={onLanguageChange}
      storageGet={(key) => app.loadLocalStorage(key) as string | null}
      storageSet={(key, value) => { app.saveLocalStorage(key, value); }}
    >
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
          activateLicenseKey: (_key: string) => {
            setLicenseModalOpen(false);
          },
          clearLicenseKey: () => {
            setLicenseModalOpen(false);
          },
          openLicenseModal: () => setLicenseModalOpen(true),
          closeLicenseModal: () => setLicenseModalOpen(false),
          licenseModalOpen,
          storageGet: (key: string) => app.loadLocalStorage(key) as string | null,
          storageSet: (key: string, value: string) => { app.saveLocalStorage(key, value); },
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
