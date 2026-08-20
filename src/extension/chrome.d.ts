declare namespace chrome {
  namespace sidePanel {
    function setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
  }

  namespace runtime {
    interface MessageSender { tab?: { id?: number } }
    interface MessageEvent {
      addListener(listener: (
        message: unknown,
        sender: MessageSender,
        sendResponse: (response: unknown) => void,
      ) => boolean | void): void;
    }
    interface SimpleEvent { addListener(listener: () => void): void }
    const onMessage: MessageEvent;
    const onInstalled: SimpleEvent;
    const onStartup: SimpleEvent;
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace tabs {
    interface Tab { id?: number }
    function query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<Tab[]>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }
}
