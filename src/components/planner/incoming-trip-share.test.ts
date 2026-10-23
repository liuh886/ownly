// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTripShareHash, consumeTripShareHash } from '@/domain/trip-share-link';
import { observeIncomingTripShare } from './incoming-trip-share';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('incoming trip share URL', () => {
  it('offers the initial payload and consumes only its fragment in real history', () => {
    const state = { router: 'preserve' };
    window.history.replaceState(state, '', '/app?capture-sync=1#preview&ownly-trip=first&other=x%2By');
    const offer = vi.fn();
    const stop = observeIncomingTripShare(offer);
    expect(offer).toHaveBeenCalledExactlyOnceWith('first');
    expect(window.location.pathname).toBe('/app');
    expect(window.location.search).toBe('?capture-sync=1');
    expect(window.location.hash).toBe('#preview&other=x%2By');
    expect(window.history.state).toEqual(state);
    stop();
  });

  it('offers a later external hashchange and leaves the copied payload in caller state', () => {
    window.history.replaceState({ page: 1 }, '', '/app#ownly-trip=first');
    const received: string[] = [];
    const stop = observeIncomingTripShare((payload) => { received.push(payload); });
    expect(window.location.hash).toBe('');
    window.history.pushState({ page: 2 }, '', '/app#panel=map&ownly-trip=second');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(received).toEqual(['first', 'second']);
    expect(window.location.hash).toBe('#panel=map');
    expect(window.history.state).toEqual({ page: 2 });
    stop();
    window.history.pushState(null, '', '/app#ownly-trip=third');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(received).toEqual(['first', 'second']);
  });

  it('does not clear a changed payload or unrelated hash when dismissing', () => {
    window.history.replaceState({ page: 3 }, '', '/app?x=1#panel=budget&ownly-trip=current');
    expect(consumeTripShareHash('stale')).toBe(false);
    expect(window.location.hash).toContain('ownly-trip=current');
    clearTripShareHash('previous');
    expect(window.location.hash).toContain('ownly-trip=current');
    clearTripShareHash();
    expect(window.location.href).toContain('/app?x=1#panel=budget');
    expect(window.history.state).toEqual({ page: 3 });
  });
});
