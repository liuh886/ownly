export interface SessionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export const sessionStorage = (chrome.storage as unknown as { session: SessionStorageArea }).session;
