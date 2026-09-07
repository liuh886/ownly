import { describe, expect, it, vi, beforeEach } from 'vitest';
import { pullCaptureState, requestBridge } from './capture-bridge';

const ORIGIN = 'https://planner.test';

function createWindowStub() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const posts: Array<Record<string, unknown>> = [];
  const win = {
    location: { origin: ORIGIN, href: `${ORIGIN}/` },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    postMessage: (message: Record<string, unknown>) => {
      posts.push(message);
    },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as NodeJS.Timeout),
  };
  const emit = (data: Record<string, unknown>) => {
    listeners.get('message')?.forEach((fn) => fn({ source: win, origin: ORIGIN, data }));
  };
  return { win, posts, emit };
}

function v3Payload() {
  return {
    version: 3,
    active_collection_id: 'inbox',
    collections: [{ id: 'inbox', title: 'Inbox', created_at: '2026-09-01T00:00:00Z' }],
    places: [{
      id: 'p-1',
      collection_id: 'inbox',
      title: 'Retry Probe Cafe',
      source: { provider: 'google_maps', url: 'https://www.google.com/maps/place/RetryProbe' },
      inferred_kind: 'cafe',
      captured_at: '2026-09-01T00:00:00Z',
    }],
  };
}

function respondState(emit: (data: Record<string, unknown>) => void, requestId: unknown) {
  emit({
    source: 'ownly-capture-extension',
    requestId,
    type: 'CAPTURE_STATE',
    payload: v3Payload(),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('requestBridge retry', () => {
  it('resolves on the first attempt without retrying', async () => {
    const { win, posts, emit } = createWindowStub();
    vi.stubGlobal('window', win);
    const pending = requestBridge<Record<string, unknown>>('PULL_CAPTURE_STATE', undefined, 100, 1);
    respondState(emit, posts[0]?.requestId);
    const result = await pending;
    expect(posts).toHaveLength(1);
    expect(result).toMatchObject({ version: 3 });
  });

  it('retries once after a cold-start timeout and resolves', async () => {
    const { win, posts, emit } = createWindowStub();
    vi.stubGlobal('window', win);
    const pending = requestBridge<Record<string, unknown>>('PULL_CAPTURE_STATE', undefined, 20, 1);
    // First attempt gets no response (cold worker); answer only the retry.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posts).toHaveLength(2);
    respondState(emit, posts[1]?.requestId);
    const result = await pending;
    expect(result).toMatchObject({ version: 3 });
  });

  it('returns null after exhausting retries', async () => {
    const { win, posts } = createWindowStub();
    vi.stubGlobal('window', win);
    const result = await requestBridge<Record<string, unknown>>('PULL_CAPTURE_STATE', undefined, 10, 1);
    expect(result).toBeNull();
    expect(posts).toHaveLength(2);
  });
});

describe('pullCaptureState', () => {
  it('maps a V3 bridge payload to pending places', async () => {
    const { win, posts, emit } = createWindowStub();
    vi.stubGlobal('window', win);
    const pending = pullCaptureState({ timeoutMs: 100, retries: 0 });
    respondState(emit, posts[0]?.requestId);
    const state = await pending;
    expect(state?.pendingPlaces).toHaveLength(1);
    expect(state?.pendingPlaces[0].title).toBe('Retry Probe Cafe');
  });
});
