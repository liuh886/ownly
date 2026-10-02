'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { WYQDRepositoryAdapter } from './repository';
import type { WYQDRuntimeTarget } from './runtime';
import type { WYQDMembershipState } from './membership';
import type { LocalDataMode } from './local-data-mode';

export interface OwnlyWorkspaceContextValue {
  repository: WYQDRepositoryAdapter;
  runtimeTarget: WYQDRuntimeTarget;
  isConnected: boolean;
  /**
   * Demo mode: no folder is connected, but the in-memory store holds example
   * records so every tab can render. Reads work; writes still require a folder.
   */
  isDemoMode: boolean;
  /**
   * Where the records on screen actually live. Prefer this over the two booleans
   * above wherever the answer is user-facing: `isConnected === false` alone
   * cannot tell "deliberately browsing the demo" from "never managed to
   * connect", and those need different wording and different exits.
   */
  mode: LocalDataMode;
  /**
   * Bumped whenever the backing store changes underneath the app (demo seeding,
   * a folder being connected or detached). Consumers re-read so a seed is
   * reflected without a page reload.
   */
  dataRevision: number;
  refreshData: () => void;
  isLoading: boolean;
  connect: () => Promise<boolean>;
  /**
   * Detach the current folder *and* forget it, so a later reload does not
   * silently re-attach it. Leaves the app in `disconnected`.
   */
  disconnectFolder: () => Promise<boolean>;
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
