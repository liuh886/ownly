'use client';

/**
 * Privacy-bounded activation analytics (issue #48, Gate 3).
 *
 * Only allowlisted aggregate events may leave the device — never object
 * titles, Markdown, filenames, paths, amounts, form values, backup contents,
 * folder metadata, vault names, or stable identifiers. The static guard
 * (scripts/validate-analytics.mjs) enforces this at build time; this module
 * enforces it at runtime as a second layer. Full dictionary:
 * docs/ANALYTICS_EVENTS.md.
 */

type AnalyticsValue = string | number | boolean;
export type AnalyticsParams = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** Event → allowed param keys. Anything else is rejected. */
export const OWNLY_ANALYTICS_ALLOWLIST: Record<string, readonly string[]> = {
  onboarding_opened: [],
  local_data_connected: ['action'],
  demo_started: ['surface'],
  first_object_saved: ['source'],
  object_archived: [],
  object_restored: [],
  backup_exported: ['files'],
  backup_validated: [],
  pwa_installed: [],
  app_return: ['gap'],
};

const KILL_SWITCH_KEY = 'ownly_analytics_disabled';
const FIRST_EVER_PREFIX = 'ownly_ev_';

function analyticsDisabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(KILL_SWITCH_KEY) === '1';
  } catch {
    return false;
  }
}

function sanitizeParams(name: string, params: AnalyticsParams): AnalyticsParams | null {
  const allowed = OWNLY_ANALYTICS_ALLOWLIST[name];
  if (!allowed) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ownly:analytics] blocked non-allowlisted event "${name}"`);
    }
    return null;
  }
  const clean: AnalyticsParams = {};
  for (const key of allowed) {
    const value = params[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    if (typeof value === 'string' && value.length > 64) continue;
    clean[key] = value;
  }
  return clean;
}

export function trackOwnlyEvent(name: string, params: AnalyticsParams = {}): void {
  try {
    if (typeof window === 'undefined' || analyticsDisabled()) return;
    const clean = sanitizeParams(name, params);
    if (!clean) return;
    window.gtag?.('event', name, clean);
  } catch {
    // Analytics must never break the app or surface errors.
  }
}

/**
 * First-ever funnel milestones (first object saved, first archive, ...).
 * Guarded by a local flag so repeats never re-emit; the flag itself never
 * leaves the device.
 */
export function trackFirstEver(flag: string, name: string, params: AnalyticsParams = {}): void {
  try {
    if (typeof window === 'undefined' || analyticsDisabled()) return;
    const key = `${FIRST_EVER_PREFIX}${flag}`;
    if (window.localStorage.getItem(key) === '1') return;
    window.localStorage.setItem(key, '1');
    trackOwnlyEvent(name, params);
  } catch {
    // Analytics must never break the app or surface errors.
  }
}
