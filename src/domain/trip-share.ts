import type { PlannerTrip } from './planner';

/**
 * PRO per-trip share links. The owner picks a short human alias (e.g. `TH26`)
 * and Ownly hosts the single-file itinerary HTML at a stable URL served by the
 * `trip-share` Edge Function. Aliases are public and low-entropy by design:
 * anyone who guesses the alias can read the itinerary, so the UI warns about
 * it and the server content always excludes expenses. Writes are authorized by
 * a separate high-entropy write token kept only on the owner's device.
 */

export const TRIP_SHARE_ALIAS_RE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

/** Paths that could collide with service routes or invite abuse. */
const RESERVED_ALIASES = new Set([
  'APP',
  'API',
  'ADMIN',
  'ASSETS',
  'C',
  'F',
  'PRIVACY',
  'ROBOTS',
  'SITEMAP',
  'STATIC',
  'TRIP-SHARE',
  'SHARE',
]);

export type TripShareAliasValidation =
  | { ok: true; alias: string }
  | { ok: false; reason: 'empty' | 'format' | 'reserved' };

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

export function normalizeTripShareAlias(input: string): string {
  return input.trim().toUpperCase();
}

export function validateTripShareAlias(input: string): TripShareAliasValidation {
  const alias = normalizeTripShareAlias(input);
  if (!alias) return { ok: false, reason: 'empty' };
  if (!TRIP_SHARE_ALIAS_RE.test(alias)) return { ok: false, reason: 'format' };
  if (RESERVED_ALIASES.has(alias)) return { ok: false, reason: 'reserved' };
  return { ok: true, alias };
}

function asciiLetters(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Suggests a memorable alias from the destination (or title) plus the start
 * year, e.g. Thailand 2026 → `TH26`. Falls back to `TRIP` when no ASCII code
 * can be derived (e.g. all-CJK destinations).
 */
export function suggestTripShareAlias(
  trip: Pick<PlannerTrip, 'destinations' | 'title' | 'start_date'>,
): string {
  const destination = (trip.destinations ?? [])[0] ?? '';
  let code = asciiLetters(destination).slice(0, 2);
  if (code.length < 2) code = asciiLetters(trip.title).slice(0, 2);
  if (code.length < 2) code = 'TRIP';
  const year = /^\d{4}/.test(trip.start_date) ? trip.start_date.slice(2, 4) : '';
  return `${code}${year}`.slice(0, 24);
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
