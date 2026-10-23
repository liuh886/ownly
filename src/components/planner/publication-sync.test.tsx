// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicationSync } from './usePublicationSync';
import { invalidatePublication, publicationGeneration, queuePublication } from './publication-queue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Planner publication ordering', () => {
  it('refreshes the current snapshot when publication becomes active after edits during manual publish', async () => {
    const upload = vi.fn(async () => {});
    function Probe({ value, active }: { value: string; active: boolean }) {
      usePublicationSync({ state: value, fingerprint: value, active, delay: 30, sync: upload });
      return null;
    }
    await act(async () => root.render(<Probe value="A" active={false} />));
    await act(async () => root.render(<Probe value="B" active={false} />));
    await act(async () => root.render(<Probe value="B" active />));
    await act(async () => vi.advanceTimersByTimeAsync(30));
    expect(upload).toHaveBeenCalledWith('B');
  });
  it('refreshes an already-enabled publication after remount instead of assuming local data was uploaded', async () => {
    const upload = vi.fn(async () => {});
    function Probe() {
      usePublicationSync({ state: 'local', fingerprint: 'local', active: true, delay: 30, sync: upload });
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => vi.advanceTimersByTimeAsync(30));
    expect(upload).toHaveBeenCalledWith('local');
  });
  it('uploads the newer edit after an older request finishes, including a timer fired mid-request', async () => {
    const first = deferred();
    const upload = vi.fn(async (value: string) => { if (value === 'A') await first.promise; });
    function Probe({ value }: { value: string }) {
      usePublicationSync({ state: value, fingerprint: value, active: true, delay: 30, sync: upload });
      return null;
    }
    await act(async () => root.render(<Probe value="baseline" />));
    await act(async () => root.render(<Probe value="A" />));
    await act(async () => vi.advanceTimersByTimeAsync(30));
    await act(async () => root.render(<Probe value="B" />));
    await act(async () => vi.advanceTimersByTimeAsync(30));
    expect(upload.mock.calls.map(([value]) => value)).toEqual(['A']);
    await act(async () => first.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(upload.mock.calls.map(([value]) => value)).toEqual(['A', 'B']);
  });

  it('keeps failed content dirty without spinning, then retries when connectivity returns', async () => {
    const error = vi.fn();
    const upload = vi.fn().mockRejectedValueOnce(new Error('offline service')).mockResolvedValue(undefined);
    function Probe({ value }: { value: string }) {
      usePublicationSync({ state: value, fingerprint: value, active: true, delay: 30, sync: upload, onError: error });
      return null;
    }
    await act(async () => root.render(<Probe value="baseline" />));
    await act(async () => root.render(<Probe value="edit" />));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(upload).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('makes revocation the last cloud write and invalidates already queued refreshes', async () => {
    const key = 'test:revoke';
    const request = deferred();
    let enabled = false;
    const upload = queuePublication(key, async () => { await request.promise; enabled = true; });
    const generation = publicationGeneration(key);
    const queued = queuePublication(key, async () => {
      if (generation === publicationGeneration(key)) enabled = true;
    });
    invalidatePublication(key);
    const revoke = queuePublication(key, async () => { enabled = false; });
    request.resolve();
    await Promise.all([upload, queued, revoke]);
    expect(enabled).toBe(false);
  });
});
