'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { WYQDRepositoryAdapter } from './repository';
import type { WYQDRuntimeTarget } from './runtime';
import type { WYQDMembershipState } from './membership';

export interface OwnlyWorkspaceContextValue {
  repository: WYQDRepositoryAdapter;
  runtimeTarget: WYQDRuntimeTarget;
  isConnected: boolean;
  isLoading: boolean;
  connect: () => Promise<boolean>;
  error: string | null;
  clearError: () => void;
  notice: string | null;
  showNotice: (msg: string) => void;
  membership: WYQDMembershipState;
  activateLicenseKey: (key: string) => void;
  clearLicenseKey: () => void;
  openLicenseModal: () => void;
  closeLicenseModal: () => void;
  licenseModalOpen: boolean;
  /** Runtime-appropriate localStorage wrapper (Obsidian: App#saveLocalStorage/loadLocalStorage, Web: localStorage) */
  storageGet: (key: string) => string | null;
  storageSet: (key: string, value: string) => void;
}

const OwnlyWorkspaceContext = createContext<OwnlyWorkspaceContextValue | null>(null);

export function OwnlyWorkspaceProvider({
  value,
  children,
}: {
  value: OwnlyWorkspaceContextValue;
  children: ReactNode;
}) {
  return <OwnlyWorkspaceContext.Provider value={value}>{children}</OwnlyWorkspaceContext.Provider>;
}

export function useOwnlyWorkspace(): OwnlyWorkspaceContextValue {
  const context = useContext(OwnlyWorkspaceContext);
  if (!context) {
    throw new Error('useOwnlyWorkspace must be used within an OwnlyWorkspaceProvider');
  }
  return context;
}
