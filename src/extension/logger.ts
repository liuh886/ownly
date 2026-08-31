export type LogLevel = 'INFO' | 'FETCH' | 'PARSER' | 'MAPS_TAB' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

const MAX_LOGS = 500;
const logBuffer: LogEntry[] = [];
const subscribers = new Set<(entry: LogEntry) => void>();

function nowStr(): string {
  const d = new Date();
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function append(level: LogLevel, scope: string, message: string, data?: unknown): LogEntry {
  const entry: LogEntry = {
    timestamp: nowStr(),
    level,
    scope,
    message,
    data: data !== undefined ? (typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data) : undefined,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }

  // Console output
  const prefix = `[Ownly ${level}][${scope}]`;
  if (level === 'ERROR') {
    console.error(prefix, message, data ?? '');
  } else if (level === 'WARN') {
    console.warn(prefix, message, data ?? '');
  } else {
    console.log(prefix, message, data ?? '');
  }

  // Notify active listeners
  subscribers.forEach((cb) => {
    try { cb(entry); } catch {}
  });

  return entry;
}

export const logger = {
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
  clear(): void {
    logBuffer.length = 0;
  },
  subscribe(callback: (entry: LogEntry) => void): () => void {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
  formatEntryText(entry: LogEntry): string {
    const dataStr = entry.data !== undefined ? ` | ${typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}` : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.scope}] ${entry.message}${dataStr}`;
  },
  getAllFormattedText(): string {
    return logBuffer.map((e) => logger.formatEntryText(e)).join('\n');
  },
  exportDiagnostics(context?: Record<string, unknown>): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        context: context || {},
        logs: logBuffer,
      },
      null,
      2
    );
  },
};

// Listen for cross-context log events (e.g. from content.ts to sidepanel)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'OWNLY_DEBUG_LOG') {
      const entry = (msg as { entry?: LogEntry }).entry;
      if (entry) {
        logBuffer.push(entry);
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        subscribers.forEach((cb) => {
          try { cb(entry); } catch {}
        });
      }
    }
  });
}
