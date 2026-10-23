// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppNavigation } from './useAppNavigation';
import type { AppTab } from './BottomNav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let navigate: (tab: AppTab, replace?: boolean) => void;
function View({ browser = true }: { browser?: boolean }) {
  const [tab, change] = useAppNavigation(browser);
  useEffect(() => { navigate = change; }, [change]);
  return <h1>{tab}</h1>;
}
beforeEach(() => {
  window.history.replaceState(null, '', '/app/');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const render = async (browser = true) => { await act(async () => root.render(<View browser={browser} />)); };
const change = async (tab: AppTab) => { await act(async () => navigate(tab)); };
const heading = () => host.textContent;
it('restores a deep view after remount and preserves query, fragment and framework history state', async () => {
  const state = { __NA: true, tree: ['root'] };
  window.history.replaceState(state, '', '/app/?view=accounts&capture=1#preview');
  await render(); expect(heading()).toBe('accounts');
  await change('reviews');
  expect(window.location.search).toBe('?view=reviews&capture=1');
  expect(window.location.hash).toBe('#preview'); expect(window.history.state).toEqual(state);
  await act(async () => { root.unmount(); root = createRoot(host); root.render(<View />); });
  expect(heading()).toBe('reviews');
  await change('home'); expect(window.location.search).toBe('?capture=1');
});
it('responds to actual Back/Forward and does not add entries for the current view', async () => {
  await render(); await change('objects'); await change('accounts');
  const push = vi.spyOn(window.history, 'pushState');
  await change('accounts'); expect(push).not.toHaveBeenCalled();
  await act(async () => {
    window.history.back();
    await new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
  });
  expect(heading()).toBe('objects');
  await act(async () => {
    window.history.forward();
    await new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
  });
  expect(heading()).toBe('accounts');
});
it('routes an incoming share once without trapping ordinary view changes, then accepts a new link', async () => {
  window.history.replaceState(null, '', '/app/#ownly-trip=first');
  await render(); expect(heading()).toBe('planner');
  await change('accounts'); expect(heading()).toBe('accounts');
  await act(async () => {
    window.history.replaceState(null, '', '/app/?view=accounts#ownly-trip=second');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(heading()).toBe('planner');
});
it('uses internal Vault navigation without mutating the host URL or observing its share fragment', async () => {
  window.history.replaceState({ obsidian: true }, '', '/vault?view=accounts#ownly-trip=first');
  await render(false); expect(heading()).toBe('home');
  await change('planner'); expect(heading()).toBe('planner');
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/vault?view=accounts#ownly-trip=first');
  expect(window.history.state).toEqual({ obsidian: true });
});
it('uses Home for an unknown view and replaces it when the user navigates', async () => {
  window.history.replaceState(null, '', '/app/?view=unknown');
  await render(); expect(heading()).toBe('home');
  await change('objects'); expect(window.location.search).toBe('?view=objects');
});
