import type { PlannerTrip } from './planner';

/**
 * PRO per-trip share links. The alias is simply the trip name (no manual
 * entry): Ownly hosts the single-file itinerary HTML at a stable URL served by
 * the `trip-share` Edge Function. Aliases are public and low-entropy by design:
 * anyone who has or guesses the name can read the itinerary, so the UI warns
 * about it and the server content always excludes expenses. Writes are
 * authorized by a separate high-entropy write token kept only on the owner's
 * device.
 */

export const TRIP_SHARE_ALIAS_MAX_LENGTH = 64;

/** Characters that cannot appear in an alias (URL/path/query hazards). */
const FORBIDDEN_ALIAS_RE = /[/\\?#%\u0000-\u001f]/;

export type TripShareAliasValidation =
  | { ok: true; alias: string }
  | { ok: false; reason: 'empty' | 'format' };

export interface TripShareLink {
  alias: string;
  trip_id: string;
  enabled: boolean;
  updated_at: string;
}

export interface TripShareMeta {
  alias: string;
  /** Owner-only capability secret; never sent to the share host as plaintext. */
  write_token: string;
  updated_at: string;
  enabled: boolean;
}

/** Trims and collapses internal whitespace; preserves case and scripts. */
export function normalizeTripShareAlias(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function validateTripShareAlias(input: string): TripShareAliasValidation {
  const alias = normalizeTripShareAlias(input);
  if (!alias) return { ok: false, reason: 'empty' };
  if (alias.length > TRIP_SHARE_ALIAS_MAX_LENGTH) return { ok: false, reason: 'format' };
  if (FORBIDDEN_ALIAS_RE.test(alias)) return { ok: false, reason: 'format' };
  return { ok: true, alias };
}

/** Appends a numeric suffix (for name collisions), staying within the limit. */
export function withTripShareAliasSuffix(alias: string, suffix: number): string {
  const base = normalizeTripShareAlias(alias);
  const tag = `-${suffix}`;
  return `${base.slice(0, TRIP_SHARE_ALIAS_MAX_LENGTH - tag.length)}${tag}`;
}

const DEFAULT_SUPABASE_URL = 'https://blgwlycfcwvsupmqyqwn.supabase.co';

function getDefaultShareHost(): string {
  const base =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
    DEFAULT_SUPABASE_URL;
  return `${base.replace(/\/+$/, '')}/functions/v1/trip-share`;
}

export function getTripShareUrl(alias: string, host?: string): string {
  const cleanHost = (host || getDefaultShareHost()).replace(/\/+$/, '');
  return `${cleanHost}/${encodeURIComponent(normalizeTripShareAlias(alias))}`;
}

/** Convenience: the default alias for a trip is its name. */
export function defaultTripShareAlias(trip: Pick<PlannerTrip, 'title'>): string {
  return normalizeTripShareAlias(trip.title);
}

function tripShareStorageKey(tripId: string): string {
  return `ownly:trip-share:${tripId}`;
}

export function loadTripShareMeta(tripId: string): TripShareMeta | null {
  try {
    if (typeof window === 'undefined' || !tripId) return null;
    const raw = window.localStorage.getItem(tripShareStorageKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TripShareMeta>;
    if (typeof parsed.alias !== 'string' || !parsed.alias) return null;
    if (typeof parsed.write_token !== 'string' || !parsed.write_token) return null;
    return {
      alias: parsed.alias,
      write_token: parsed.write_token,
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : '',
      enabled: parsed.enabled !== false,
    };
  } catch {
    return null;
  }
}

export function saveTripShareMeta(tripId: string, meta: TripShareMeta): void {
  if (typeof window === 'undefined' || !tripId) return;
  try {
    window.localStorage.setItem(tripShareStorageKey(tripId), JSON.stringify(meta));
  } catch {
    // Storage full or blocked: the share still works, the write token just
    // won't persist across reloads.
  }
}

export function clearTripShareMeta(tripId: string): void {
  if (typeof window === 'undefined' || !tripId) return;
  try {
    window.localStorage.removeItem(tripShareStorageKey(tripId));
  } catch {
    // Ignore storage failures.
  }
}
