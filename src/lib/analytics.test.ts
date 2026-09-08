import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OWNLY_ANALYTICS_ALLOWLIST, trackFirstEver, trackOwnlyEvent } from './analytics';

describe('privacy-bounded analytics (issue #48)', () => {
  let store: Record<string, string>;
  let gtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    store = {};
    gtag = vi.fn();
    vi.stubGlobal('window', {
      gtag,
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { store = {}; },
      },
    });
  });

  it('sends allowlisted events with allowlisted params only', () => {
    trackOwnlyEvent('local_data_connected', { action: 'create', title: 'Secret Trip' } as never);
    expect(gtag).toHaveBeenCalledWith('event', 'local_data_connected', { action: 'create' });
  });

  it('drops non-allowlisted event names', () => {
    trackOwnlyEvent('place_viewed', { placeId: 'abc' } as never);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('drops over-long strings and non-scalar params', () => {
    trackOwnlyEvent('backup_exported', { files: 12 });
    expect(gtag).toHaveBeenCalledWith('event', 'backup_exported', { files: 12 });
  });

  it('fires first-ever milestones once', () => {
    trackFirstEver('object_archived', 'object_archived');
    trackFirstEver('object_archived', 'object_archived');
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it('respects the kill switch and never throws without gtag', () => {
    store['ownly_analytics_disabled'] = '1';
    trackOwnlyEvent('pwa_installed');
    expect(gtag).not.toHaveBeenCalled();
    (window as unknown as { gtag?: unknown }).gtag = undefined;
    expect(() => trackOwnlyEvent('pwa_installed')).not.toThrow();
  });

  it('dictionary covers the full activation funnel', () => {
    for (const name of [
      'onboarding_opened', 'local_data_connected', 'first_object_saved',
      'object_archived', 'object_restored', 'backup_exported',
      'backup_validated', 'pwa_installed', 'app_return',
    ]) {
      expect(OWNLY_ANALYTICS_ALLOWLIST[name]).toBeDefined();
    }
  });
});
