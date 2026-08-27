import type { OwnlyCaptureState } from '@/domain/planner';

const REQUEST_SOURCE = 'ownly-planner-web';
const RESPONSE_SOURCE = 'ownly-capture-extension';

interface BridgeResponse<T> {
  source: typeof RESPONSE_SOURCE;
  requestId: string;
  type: string;
  payload?: T;
  error?: string;
}

function getTargetOrigin(): string {
  if (typeof window === 'undefined') return '*';
  return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
}

function requestBridge<T>(type: string, payload?: unknown, timeoutMs = 2500): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
      finish(message.error ? null : message.payload ?? null);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ source: REQUEST_SOURCE, requestId, type, payload }, getTargetOrigin());
  });
}

export function pullCaptureState(): Promise<OwnlyCaptureState | null> {
  return requestBridge<OwnlyCaptureState>('PULL_CAPTURE_STATE');
}

export async function ackCapturedPlaces(placeIds: string[]): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('ACK_CAPTURED_PLACES', { placeIds });
  return result?.ok === true;
}
