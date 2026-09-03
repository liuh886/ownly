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
/**
 * @deprecated 直接读 workspaceState 为 snapshot 已废弃，短期以 Proxy 代理至 workspaceStore.getState() 保证旧引用不 stale；新代码请用 workspaceStore.getState() / workspaceStore.useStore() / workspaceStore.subscribe()
 */
export const workspaceState: WorkspaceState = new Proxy({} as WorkspaceState, {
  get(_t, prop) {
    return (workspaceStore.getState() as unknown as Record<string, unknown>)[prop as string];
  },
  set(_t, prop, value) {
    workspaceStore.setState({ [prop as string]: value } as unknown as Partial<WorkspaceState>);
    return true;
  },
  ownKeys() {
    return Reflect.ownKeys(workspaceStore.getState());
  },
  getOwnPropertyDescriptor(_t, prop) {
    return {
      configurable: true,
      enumerable: true,
      value: (workspaceStore.getState() as unknown as Record<string, unknown>)[prop as string],
      writable: true,
    };
  },
  has(_t, prop) {
    return prop in workspaceStore.getState();
  },
});
