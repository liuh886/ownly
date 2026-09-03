export type LogLevel = 'DEBUG' | 'INFO' | 'FETCH' | 'PARSER' | 'MAPS_TAB' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
  sessionId?: string;
  context?: string; // 'background' | 'sidepanel' | 'content' | 'bridge'
}

const MAX_LOGS = 800;
const PERSIST_KEY = 'ownly_debug_persist_v1';
const PERSIST_DEBOUNCE_MS = 1200;
const MAX_PERSIST_ENTRIES = 600;

// Session identifier — stable per page/service-worker lifetime
const SESSION_ID = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const logBuffer: LogEntry[] = [];
const subscribers = new Set<(entry: LogEntry) => void>();
let persistTimer: number | undefined;
let isHydrated = false;

function nowStr(): string {
  const d = new Date();
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function detectContext(): string {
  try {
    // Service worker has no window
    if (typeof window === 'undefined') return 'background';
    const path = window.location.pathname || '';
    const href = window.location.href || '';
    if (path.includes('sidepanel') || href.includes('sidepanel')) return 'sidepanel';
    if (href.includes('maps.google') || href.includes('tabelog') || href.includes('xiaohongshu') || href.includes('booking.com')) return 'content';
    if (href.includes('/app') || href.includes('ownly')) return 'bridge';
    return 'web';
  } catch {
    return 'unknown';
  }
}

function schedulePersist(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  // Only background should own persistence to avoid races; sidepanel/content forward via message
  if (detectContext() !== 'background') return;
  const g = globalThis as unknown as { clearTimeout?: (id: number) => void; setTimeout?: (cb: () => void, ms: number) => number };
  if (persistTimer !== undefined) (g.clearTimeout ?? clearTimeout)(persistTimer as unknown as number);
  persistTimer = (g.setTimeout ?? setTimeout)(() => {
    persistTimer = undefined;
    const toPersist = logBuffer.slice(-MAX_PERSIST_ENTRIES);
    void chrome.storage.local.set({ [PERSIST_KEY]: { sessionId: SESSION_ID, updatedAt: new Date().toISOString(), entries: toPersist } }).catch(() => {});
  }, PERSIST_DEBOUNCE_MS) as unknown as number;
}

async function hydrateFromStorage(): Promise<void> {
  if (isHydrated) return;
  isHydrated = true;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const res = await chrome.storage.local.get(PERSIST_KEY);
    const persisted = res[PERSIST_KEY] as { entries?: LogEntry[] } | undefined;
    if (persisted?.entries && Array.isArray(persisted.entries) && persisted.entries.length > 0) {
      // Merge persisted entries that are not already in buffer (by timestamp+message)
      const existingKeys = new Set(logBuffer.map((e) => `${e.timestamp}|${e.scope}|${e.message}`));
      const entries = persisted.entries ?? [];
      for (const e of entries) {
        const key = `${e.timestamp}|${e.scope}|${e.message}`;
        if (!existingKeys.has(key)) {
          logBuffer.push(e);
          if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        }
      }
      // Notify subscribers of hydration
      if (entries.length > 0) {
        subscribers.forEach((cb) => {
          try { cb(entries[0]); } catch {}
        });
      }
    }
  } catch {}
}

// Attempt hydration on load (sidepanel/background)
if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  void hydrateFromStorage();
}

function shouldForward(): boolean {
  // Content and sidepanel forward to background; background does not forward
  const ctx = detectContext();
  return ctx === 'sidepanel' || ctx === 'content' || ctx === 'bridge' || ctx === 'web';
}

function append(level: LogLevel, scope: string, message: string, data?: unknown): LogEntry {
  const entry: LogEntry = {
    timestamp: nowStr(),
    level,
    scope,
    message,
    data: data !== undefined ? (typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data) : undefined,
    sessionId: SESSION_ID,
    context: detectContext(),
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }

  // Console output — always visible for dev
  const prefix = `[Ownly ${level}][${scope}]`;
  if (level === 'ERROR') {
    console.error(prefix, message, data ?? '');
  } else if (level === 'WARN') {
    console.warn(prefix, message, data ?? '');
  } else if (level === 'DEBUG') {
    console.debug(prefix, message, data ?? '');
  } else {
    console.log(prefix, message, data ?? '');
  }

  // Notify local subscribers (UI)
  subscribers.forEach((cb) => {
    try { cb(entry); } catch {}
  });

  // Cross-context forwarding to background for persistence + centralized buffer
  if (shouldForward() && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      void chrome.runtime.sendMessage({ type: 'OWNLY_DEBUG_LOG', entry }).catch(() => {});
    } catch {}
  } else if (detectContext() === 'background') {
    schedulePersist();
  }

  return entry;
}

export const logger = {
  debug(scope: string, message: string, data?: unknown): LogEntry {
    return append('DEBUG', scope, message, data);
  },
  info(scope: string, message: string, data?: unknown): LogEntry {
    return append('INFO', scope, message, data);
  },
  fetch(scope: string, message: string, data?: unknown): LogEntry {
    return append('FETCH', scope, message, data);
  },
  parser(scope: string, message: string, data?: unknown): LogEntry {
    return append('PARSER', scope, message, data);
  },
  maps(scope: string, message: string, data?: unknown): LogEntry {
    return append('MAPS_TAB', scope, message, data);
  },
  warn(scope: string, message: string, data?: unknown): LogEntry {
    return append('WARN', scope, message, data);
  },
  error(scope: string, message: string, data?: unknown): LogEntry {
    return append('ERROR', scope, message, data);
  },
  getLogs(): LogEntry[] {
    return [...logBuffer];
  },
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return logBuffer.filter((e) => e.level === level);
  },
  getStats(): { total: number; byLevel: Record<string, number>; byScope: Record<string, number>; sessionId: string } {
    const byLevel: Record<string, number> = {};
    const byScope: Record<string, number> = {};
    for (const e of logBuffer) {
      byLevel[e.level] = (byLevel[e.level] || 0) + 1;
      byScope[e.scope] = (byScope[e.scope] || 0) + 1;
    }
    return { total: logBuffer.length, byLevel, byScope, sessionId: SESSION_ID };
  },
  clear(): void {
    logBuffer.length = 0;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.remove(PERSIST_KEY).catch(() => {});
    }
  },
  async clearAndPersist(): Promise<void> {
    logBuffer.length = 0;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(PERSIST_KEY).catch(() => {});
    }
    subscribers.forEach((cb) => {
      try { cb({ timestamp: nowStr(), level: 'INFO', scope: 'System', message: 'Logs cleared', sessionId: SESSION_ID, context: detectContext() }); } catch {}
    });
  },
  subscribe(callback: (entry: LogEntry) => void): () => void {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
  formatEntryText(entry: LogEntry): string {
    const dataStr = entry.data !== undefined ? ` | ${typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}` : '';
    const ctx = entry.context ? `(${entry.context})` : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.scope}]${ctx} ${entry.message}${dataStr}`;
  },
  getAllFormattedText(): string {
    return logBuffer.map((e) => logger.formatEntryText(e)).join('\n');
  },
  getSessionId(): string {
    return SESSION_ID;
  },
  async hydrate(): Promise<void> {
    await hydrateFromStorage();
  },
  exportDiagnostics(context?: Record<string, unknown>): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        sessionId: SESSION_ID,
        context: detectContext(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        url: typeof window !== 'undefined' ? window.location.href : 'background',
        diagnosticsContext: context || {},
        stats: logger.getStats(),
        logs: logBuffer,
      },
      null,
      2
    );
  },
};

// Listen for cross-context log events (content/bridge → background/sidepanel)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'OWNLY_DEBUG_LOG') {
      const entry = (msg as { entry?: LogEntry }).entry;
      if (entry && typeof entry.message === 'string') {
        logBuffer.push(entry);
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        subscribers.forEach((cb) => {
          try { cb(entry); } catch {}
        });
        // Background persists forwarded logs
        if (detectContext() === 'background') schedulePersist();
      }
    }
  });
}

// Global error capture — feed uncaught errors into logger
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    append('ERROR', 'Global', event.message || 'Uncaught error', {
      filename: (event as ErrorEvent).filename,
      lineno: (event as ErrorEvent).lineno,
      colno: (event as ErrorEvent).colno,
      stack: (event as ErrorEvent).error?.stack,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    append('ERROR', 'Global', 'Unhandled rejection', {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined,
    });
  });
}
