'use client';

import { useCallback, useEffect, useRef } from 'react';
import type {
  PlannerTrip,
  PlannerTripCalendarFeed,
  PlannerTripLeg,
  PlannerTripPlace,
} from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
import {
  saveAccountFeedMeta,
  type AccountCalendarFeedMeta,
} from '@/domain/calendar-feed';
import { calendarFeedService } from '@/services/CalendarFeedService';

/**
 * Idle delay before an itinerary edit is pushed to already-published feeds.
 * Long enough to cover a burst of timeline edits, short enough that the
 * subscriber side never waits on a forgotten manual tap.
 */
export const AUTO_CALENDAR_SYNC_DEBOUNCE_MS = 30_000;

/** Volatile storage fields that must not count as itinerary edits. */
const SYNC_VOLATILE_KEYS = new Set(['updated_at', 'created_at', 'feed_token']);

function stripSyncVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSyncVolatile);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SYNC_VOLATILE_KEYS.has(key)) continue;
      out[key] = stripSyncVolatile(entry);
    }
    return out;
  }
  return value;
}

/**
 * Content fingerprint driving the trigger: any schedule-relevant edit
 * (times, order, dates, places, legs, trip meta) changes it, while bare
 * storage churn (updated_at bumps from the sync itself) does not — so the
 * trigger can never loop on its own writes.
 */
export function buildFeedSyncFingerprint(
  trips: PlannerTrip[],
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  legs: PlannerTripLeg[],
): string {
  return JSON.stringify(stripSyncVolatile([trips, places, visits, legs]));
}

export interface FeedSyncTargets {
  /** Raw bearer token of the enabled account feed, if any. */
  accountToken?: string;
  /** Trips with an enabled per-trip feed (token reuse, never minting). */
  tripFeeds: Array<{ trip: PlannerTrip; token: string }>;
}

/**
 * Refresh-only target collection: feeds that do not exist (or are disabled)
 * are never created or resurrected here — creation stays an explicit manual
 * act in the subscription modal.
 */
export function collectFeedSyncTargets(
  trips: PlannerTrip[],
  accountFeed: AccountCalendarFeedMeta | null | undefined,
): FeedSyncTargets {
  const accountToken = accountFeed?.feed_token?.trim();
  const tripFeeds: Array<{ trip: PlannerTrip; token: string }> = [];
  for (const trip of trips) {
    const token = trip.calendar_feed?.feed_token?.trim();
    if (!token || trip.calendar_feed?.enabled === false) continue;
    tripFeeds.push({ trip, token });
  }
  return {
    accountToken: accountToken && accountFeed?.enabled !== false ? accountToken : undefined,
    tripFeeds,
  };
}

export interface AutoCalendarSyncInput {
  trips: PlannerTrip[];
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
  isPro: boolean;
  currentUserId: string;
  language: 'zh' | 'en';
  accountFeed: AccountCalendarFeedMeta | null;
  setAccountFeed: (meta: AccountCalendarFeedMeta) => void;
  /** Persists one trip's refreshed feed meta (no reload; the hook reloads once). */
  saveTripFeedMeta: (trip: PlannerTrip, feed: PlannerTripCalendarFeed) => Promise<void>;
  /** Reloads planner state after trip metas were persisted. */
  reloadPlanner: () => Promise<void>;
  enabled?: boolean;
}

/**
 * Fire-and-forget trigger that keeps published calendar feeds fresh without
 * a manual tap: once itinerary content settles for the debounce window, all
 * already-published feeds (account + per-trip) are rebuilt with their stable
 * tokens and re-upserted. Silent on success; failures only warn to console
 * (the modal's manual sync remains the explicit fallback).
 */
export function useAutoCalendarSync(input: AutoCalendarSyncInput): void {
  const latestRef = useRef(input);
  const syncedFingerprintRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);

  // Mirror latest props for async callbacks (effect context, never render).
  useEffect(() => {
    latestRef.current = input;
  });

  const fingerprint = buildFeedSyncFingerprint(input.trips, input.places, input.visits, input.legs);
  const targets = collectFeedSyncTargets(input.trips, input.accountFeed);
  const hasTargets = Boolean(targets.accountToken) || targets.tripFeeds.length > 0;
  const enabled = input.enabled ?? true;

  const runSyncRef = useRef<() => void>(() => {});
  const runSync = useCallback(async () => {
    const state = latestRef.current;
    if (syncingRef.current) return;
    if (!state.isPro || !state.currentUserId?.trim()) return;
    const live = collectFeedSyncTargets(state.trips, state.accountFeed);
    if (!live.accountToken && live.tripFeeds.length === 0) return;
    const current = buildFeedSyncFingerprint(state.trips, state.places, state.visits, state.legs);
    if (syncedFingerprintRef.current === current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Park until connectivity returns instead of burning the debounce.
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => runSyncRef.current(), { once: true });
      }
      return;
    }
    syncingRef.current = true;
    try {
      const { isPro, currentUserId } = state;
      if (live.accountToken) {
        const response = await calendarFeedService.publishAccountFeed({
          trips: state.trips,
          places: state.places,
          visits: state.visits,
          membership: { isPro },
          userId: currentUserId,
          feedToken: live.accountToken,
          options: { language: state.language },
          legs: state.legs,
        });
        const meta: AccountCalendarFeedMeta = {
          feed_token: response.feed.feed_token,
          updated_at: response.feed.updated_at,
          enabled: true,
        };
        saveAccountFeedMeta(currentUserId, meta);
        state.setAccountFeed(meta);
      }
      let touchedTrips = false;
      for (const { trip, token } of live.tripFeeds) {
        const response = await calendarFeedService.publishFeed({
          trip,
          places: state.places,
          visits: state.visits,
          membership: { isPro },
          userId: currentUserId,
          feedToken: token,
          options: { language: state.language },
          legs: state.legs,
        });
        await state.saveTripFeedMeta(trip, response.feed);
        touchedTrips = true;
      }
      if (touchedTrips) await state.reloadPlanner();
      // Mark whatever is current now: edits made mid-flight differ and reschedule.
      syncedFingerprintRef.current = buildFeedSyncFingerprint(
        latestRef.current.trips,
        latestRef.current.places,
        latestRef.current.visits,
        latestRef.current.legs,
      );
    } catch (error) {
      console.warn('[Planner] auto calendar sync failed', error);
    } finally {
      syncingRef.current = false;
    }
  }, []);
  useEffect(() => {
    runSyncRef.current = () => void runSync();
  }, [runSync]);

  // Debounced trigger: baseline on mount / while inactive / without targets
  // (a manual publish just rebuilt everything, so there is nothing to catch
  // up on), schedule only on genuine content drift.
  useEffect(() => {
    if (!enabled || !input.isPro || !input.currentUserId || !hasTargets) {
      syncedFingerprintRef.current = fingerprint;
      return;
    }
    if (syncedFingerprintRef.current === null) {
      syncedFingerprintRef.current = fingerprint;
      return;
    }
    if (syncedFingerprintRef.current === fingerprint) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSync();
    }, AUTO_CALENDAR_SYNC_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fingerprint, hasTargets, enabled, input.isPro, input.currentUserId, runSync]);

  // Flush pending edits when the tab goes to background (covers tab-close
  // better than pagehide for an async upsert; best-effort either way).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        void runSync();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [runSync]);
}
