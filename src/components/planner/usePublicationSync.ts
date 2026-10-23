'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Record only the snapshot actually uploaded and drain edits made during upload. */
export function usePublicationSync<T>(input: {
  state: T;
  fingerprint: string;
  active: boolean;
  delay: number;
  sync: (state: T) => Promise<void>;
  onError?: (error: unknown) => void;
}): void {
  const latest = useRef(input);
  const synced = useRef<string | null>(null);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { latest.current = input; });
  const runRef = useRef<() => void>(() => {});
  const run = useCallback(async () => {
    if (running.current || !mounted.current) return;
    const snapshot = latest.current;
    if (!snapshot.active || synced.current === snapshot.fingerprint) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    running.current = true;
    let success = false;
    try {
      await snapshot.sync(snapshot.state);
      synced.current = snapshot.fingerprint;
      success = true;
    } catch (error) {
      latest.current.onError?.(error);
    } finally {
      running.current = false;
      // Failed writes remain dirty, retried on edits/online/background or manually.
      // Do not turn an unavailable server into an unbounded retry loop.
      if (success && mounted.current && latest.current.active && latest.current.fingerprint !== snapshot.fingerprint) {
        timer.current = setTimeout(() => { timer.current = null; runRef.current(); }, 0);
      }
    }
  }, []);
  useEffect(() => { runRef.current = () => void run(); }, [run]);
  useEffect(() => {
    // An inactive render or remount does not prove the current content is published.
    if (!input.active) return;
    if (synced.current === input.fingerprint) return;
    timer.current = setTimeout(() => { timer.current = null; void run(); }, input.delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [input.active, input.fingerprint, input.delay, run]);
  useEffect(() => {
    mounted.current = true;
    const flush = () => { if (timer.current) clearTimeout(timer.current); void run(); };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [run]);
}
