'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OwnlyWorkspaceContextValue } from '@/core/ownly-workspace-context';
import { getStableWorkspaceNamespace } from '@/services/ownlyStoreRouter';
import { assertPublicationWorkspace } from './publication-queue';
import { createPublicationCredentials, type PublicationCredentials } from './publication-credentials';

export function usePublicationCredentials(workspace: OwnlyWorkspaceContextValue, identity: string, disabled: boolean) {
  const { runtimeTarget, storageGet, storageSet } = workspace;
  const [resolved, setResolved] = useState<PublicationCredentials | null>(null);
  const getScope = useCallback(async () => {
    if (disabled) throw new Error('Demo mode is read-only. Connect a data folder to publish.');
    assertPublicationWorkspace(identity);
    let namespace: string;
    if (runtimeTarget === 'obsidian') {
      // App's local storage belongs to this Vault/runtime, unlike browser localStorage.
      const key = 'ownly:publication:vault-namespace:v2';
      namespace = storageGet(key) ?? `vault:${crypto.randomUUID()}`;
      storageSet(key, namespace);
      if (storageGet(key) !== namespace) throw new Error('Cannot persist this Vault publication identity.');
    } else {
      namespace = await getStableWorkspaceNamespace();
    }
    assertPublicationWorkspace(identity);
    // Older publication helpers wrote to browser localStorage even in the Vault
    // runtime. Read that store only when the user explicitly chooses recovery.
    const legacyGet = (key: string) => {
      try { return typeof window === 'undefined' ? null : window.localStorage.getItem(key); }
      catch { return null; }
    };
    const legacySet = (key: string, value: string) => window.localStorage.setItem(key, value);
    const legacyKeys = () => {
      try {
        if (typeof window === 'undefined') return [];
        return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter((key): key is string => key !== null);
      }
      catch { return []; }
    };
    return createPublicationCredentials(namespace, identity, storageGet, storageSet, legacyGet, legacySet, legacyKeys);
  }, [disabled, identity, runtimeTarget, storageGet, storageSet]);
  useEffect(() => {
    let active = true;
    if (!disabled) void getScope().then((scope) => { if (active) setResolved(scope); }).catch(() => {});
    return () => { active = false; };
  }, [disabled, getScope]);
  return { scope: !disabled && resolved?.sessionIdentity === identity ? resolved : null, getScope };
}
