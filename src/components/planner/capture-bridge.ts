import type { CaptureContext, CaptureCandidate, ImportReport, OwnlyCaptureState } from '@/domain/planner';
import { asCaptureCandidate } from '@/domain/planner';
import { capturePlaceToPlannerPlace, type CapturePlace, type OwnlyCaptureStateV3 } from '@/domain/capture';

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

export async function pullCaptureState(): Promise<OwnlyCaptureState | null> {
  const raw = await requestBridge<unknown>('PULL_CAPTURE_STATE');
  if (!raw || typeof raw !== 'object') return null;

  const rawObj = raw as Record<string, unknown>;

  // V3 state shape
  if (rawObj.version === 3 || Array.isArray(rawObj.places)) {
    const v3 = raw as OwnlyCaptureStateV3;
    const targetCollectionId = v3.planner_target?.collection_id || v3.active_collection_id || v3.collections?.[0]?.id || 'inbox';
    const activeCollection = v3.collections?.find((c) => c.id === targetCollectionId) || v3.collections?.[0];
    const targetTripId = v3.planner_target?.trip_id || activeCollection?.id || v3.active_collection_id || '';
    const activeContext: CaptureContext | null = v3.planner_target
      ? { tripId: v3.planner_target.trip_id, title: v3.planner_target.title }
      : (activeCollection ? { tripId: activeCollection.id, title: activeCollection.title, currency: activeCollection.currency } : null);

    const allPlaces = Array.isArray(v3.places) ? v3.places : [];
    // Strictly isolate places belonging to the active/target collection to prevent cross-collection contamination and destructive deletion
    const scopedPlaces = allPlaces.filter((place: CapturePlace) => (place.collection_id || 'inbox') === targetCollectionId);
    const pendingPlaces: CaptureCandidate[] = scopedPlaces.map((place: CapturePlace) =>
      asCaptureCandidate(capturePlaceToPlannerPlace(place, targetTripId, undefined, { preserveId: true }) as never)
    );

    return {
      activeContext,
      pendingPlaces,
    };
  }

  // Fallback state shape
  const fallback = raw as Partial<OwnlyCaptureState>;
  return {
    activeContext: fallback.activeContext ?? null,
    pendingPlaces: Array.isArray(fallback.pendingPlaces) ? fallback.pendingPlaces : [],
    lastImportReport: fallback.lastImportReport,
  };
}

export async function applyCaptureImportReport(report: ImportReport): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('APPLY_CAPTURE_IMPORT_REPORT', { report });
  return result?.ok === true;
}

export async function setCaptureContext(context: CaptureContext | null): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('SET_CAPTURE_CONTEXT', { context });
  return result?.ok === true;
}

