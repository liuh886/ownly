export interface SessionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

const memoryStore = new Map<string, unknown>();
const memoryFallback: SessionStorageArea = {
  get: async (keys) => {
    const kList = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(kList.map((k) => [k, memoryStore.get(k)]));
  },
  set: async (items) => {
    for (const [k, v] of Object.entries(items)) memoryStore.set(k, v);
  },
  remove: async (keys) => {
    const kList = Array.isArray(keys) ? keys : [keys];
    for (const k of kList) memoryStore.delete(k);
  },
};

export const sessionStorage: SessionStorageArea =
  typeof chrome !== 'undefined' && (chrome.storage as unknown as { session?: SessionStorageArea })?.session
    ? (chrome.storage as unknown as { session: SessionStorageArea }).session
    : memoryFallback;
