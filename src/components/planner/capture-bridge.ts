import type { CaptureContext, ImportReport, OwnlyCaptureState } from '@/domain/planner';

const REQUEST_SOURCE = 'ownly-planner-web';
const RESPONSE_SOURCE = 'ownly-capture-extension';

interface BridgeResponse<T> {
  source: typeof RESPONSE_SOURCE;
  requestId: string;
  type: string;
  payload?: T;
  error?: string;
}

type DebugLogEntry = {
  timestamp: string;
  type: 'send' | 'receive' | 'timeout' | 'error';
  requestId: string;
  messageType: string;
  detail?: string;
};

let debugLogsEnabled = false;
let debugLogBuffer: DebugLogEntry[] = [];
const MAX_DEBUG_LOGS = 50;

export function setCaptureDebugLogs(enabled: boolean): void {
  debugLogsEnabled = enabled;
  if (enabled) {
    debugLogBuffer = [];
  }
}

export function getCaptureDebugLogs(): DebugLogEntry[] {
  return [...debugLogBuffer];
}

function addDebugLog(entry: Omit<DebugLogEntry, 'timestamp'>): void {
  if (!debugLogsEnabled) return;
  debugLogBuffer.push({ ...entry, timestamp: new Date().toISOString() });
  if (debugLogBuffer.length > MAX_DEBUG_LOGS) {
    debugLogBuffer = debugLogBuffer.slice(-MAX_DEBUG_LOGS);
  }
}

function getTargetOrigin(): string {
  if (typeof window === 'undefined') return '*';
  return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
}

function requestBridge<T>(type: string, payload?: unknown, timeoutMs = 2500): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (event: MessageEvent<BridgeResponse<T>>) => {
      const isSameOrigin = !event.origin || event.origin === 'null' || event.origin === window.location.origin;
      if (event.source !== window || !isSameOrigin) return;
      const message = event.data;
      if (!message || message.source !== RESPONSE_SOURCE || message.requestId !== requestId) return;
      addDebugLog({
        type: 'receive',
        requestId,
        messageType: message.type,
        detail: message.error ? `error: ${message.error}` : 'ok',
      });
      finish(message.error ? null : message.payload ?? null);
    };
    const timer = window.setTimeout(() => {
      addDebugLog({ type: 'timeout', requestId, messageType: type, detail: `timeout after ${timeoutMs}ms` });
      finish(null);
    }, timeoutMs);
    window.addEventListener('message', onMessage);
    addDebugLog({ type: 'send', requestId, messageType: type });
    window.postMessage({ source: REQUEST_SOURCE, requestId, type, payload }, getTargetOrigin());
  });
}

export function pullCaptureState(): Promise<OwnlyCaptureState | null> {
  return requestBridge<OwnlyCaptureState>('PULL_CAPTURE_STATE');
}

export async function applyCaptureImportReport(report: ImportReport): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('APPLY_CAPTURE_IMPORT_REPORT', { report });
  return result?.ok === true;
}

export async function setCaptureContext(context: CaptureContext | null): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('SET_CAPTURE_CONTEXT', { context });
  return result?.ok === true;
}
