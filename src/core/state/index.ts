/**
 * P4/PR2: 统一状态 — reactive store + useSyncExternalStore
 * 组件仅 subscribe，不自建 useState 泛滥；Extension/CLI 可直接 subscribe
 */
import { useSyncExternalStore } from 'react';

export type ConnectionState = 'connected' | 'missing' | 'permission';
export type SyncState = 'idle' | 'syncing' | 'failed';
export interface WorkspaceState { vaultPath: string; connection: ConnectionState; sync: SyncState; }

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (patch: Partial<T> | ((prev: T) => T)) => {
      const next = typeof patch === 'function' ? (patch as (prev: T) => T)(state) : { ...state, ...patch };
      if (next !== state) {
        state = next;
        for (const l of listeners) l();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    useStore: <S>(selector: (s: T) => S): S => {
      return useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => selector(state),
        () => selector(state),
      );
    },
  };
}

export const workspaceStore = createStore<WorkspaceState>({ vaultPath: '', connection: 'missing', sync: 'idle' });
// 兼容旧全局变量（逐步迁移）
export const workspaceState = workspaceStore.getState();
