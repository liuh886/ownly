import { type ReactNode } from 'react';
import { Notice } from 'obsidian';
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
  children,
}: {
  repository: WYQDRepositoryAdapter;
  membership: WYQDMembershipState;
  language: WYQDLanguage;
  onLanguageChange?: (lang: WYQDLanguage) => void;
  children?: ReactNode;
}) {
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
          clearError: () => {},
          notice: null,
          showNotice: (msg: string) => {
            new Notice(msg);
          },
          membership,
        }}
      >
        {children}
      </OwnlyWorkspaceProvider>
    </I18nProvider>
  );
}
