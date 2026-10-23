'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { AppTab } from './BottomNav';
import { extractTripSharePayload } from '@/domain/trip-share-link';

const CHANGE_EVENT = 'ownly:view-change';
const views: AppTab[] = ['home', 'objects', 'accounts', 'reviews', 'planner'];
function browserTab(): AppTab {
  const view = new URLSearchParams(window.location.search).get('view');
  return views.includes(view as AppTab) ? view as AppTab : 'home';
}
function subscribe(notify: () => void) {
  window.addEventListener('popstate', notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}
const idleSubscription = () => () => {};
const homeTab = (): AppTab => 'home';

/** Shareable Web views with native Back/Forward; Vault navigation stays internal. */
export function useAppNavigation(browser: boolean) {
  const [localTab, setLocalTab] = useState<AppTab>('home');
  const urlTab = useSyncExternalStore(browser ? subscribe : idleSubscription, browser ? browserTab : homeTab, homeTab);
  const navigate = useCallback((tab: AppTab, replace = false) => {
    if (!browser) { setLocalTab(tab); return; }
    const url = new URL(window.location.href);
    if (tab === 'home') url.searchParams.delete('view'); else url.searchParams.set('view', tab);
    const target = `${url.pathname}${url.search}${url.hash}`;
    if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      if (replace) window.history.replaceState(window.history.state, '', target);
      else window.history.pushState(window.history.state, '', target);
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [browser]);
  useEffect(() => {
    if (!browser) return;
    // Handle incoming links once, rather than on every TabRenderer mount.
    const routeShare = () => { if (extractTripSharePayload(window.location.hash)) navigate('planner', true); };
    routeShare();
    window.addEventListener('hashchange', routeShare);
    return () => window.removeEventListener('hashchange', routeShare);
  }, [browser, navigate]);
  return [browser ? urlTab : localTab, navigate] as const;
}
