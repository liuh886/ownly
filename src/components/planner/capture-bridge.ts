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
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== RESPONSE_SOURCE || message.requestId !== requestId) return;
      finish(message.error ? null : message.payload ?? null);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ source: REQUEST_SOURCE, requestId, type, payload }, window.location.origin);
  });
}

export function pullCaptureState(): Promise<OwnlyCaptureState | null> {
  return requestBridge<OwnlyCaptureState>('PULL_CAPTURE_STATE');
}

export async function ackCapturedPlaces(placeIds: string[]): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('ACK_CAPTURED_PLACES', { placeIds });
  return result?.ok === true;
}
