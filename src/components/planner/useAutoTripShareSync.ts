'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { PlannerTrip, PlannerTripLeg, PlannerTripPlace } from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
import { loadTripShareMeta, saveTripShareMeta } from '@/domain/trip-share';
import { tripShareService } from '@/services/TripShareService';
import {
  AUTO_CALENDAR_SYNC_DEBOUNCE_MS,
  buildFeedSyncFingerprint,
} from './useAutoCalendarSync';

export interface AutoTripShareSyncInput {
  trips: PlannerTrip[];
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
  isPro: boolean;
  currentUserId: string;
  language: 'zh' | 'en';
  enabled?: boolean;
}

export interface TripShareSyncTarget {
  trip: PlannerTrip;
  alias: string;
  writeToken: string;
}

/**
 * Refresh-only target collection: only trips with a locally recorded, enabled
 * share are republished. Creation stays an explicit act in the share modal, so
 * this hook never mints or resurrects a link.
 */
export function collectTripShareSyncTargets(trips: PlannerTrip[]): TripShareSyncTarget[] {
  const targets: TripShareSyncTarget[] = [];
  for (const trip of trips) {
    const meta = loadTripShareMeta(trip.id);
    if (!meta || !meta.enabled) continue;
    const alias = meta.alias?.trim();
    const writeToken = meta.write_token?.trim();
    if (!alias || !writeToken) continue;
    targets.push({ trip, alias, writeToken });
  }
  return targets;
}

/**
 * Fire-and-forget trigger that keeps published share links fresh: once
 * itinerary content settles for the debounce window, every already-published
 * share is rebuilt with its stable alias and re-upserted. Silent on success;
 * failures only warn to console (the modal's manual publish stays the explicit
 * fallback).
 */
export function useAutoTripShareSync(input: AutoTripShareSyncInput): void {
  const latestRef = useRef(input);
  const syncedFingerprintRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    latestRef.current = input;
  });

  const fingerprint = buildFeedSyncFingerprint(input.trips, input.places, input.visits, input.legs);
  const targets = collectTripShareSyncTargets(input.trips);
  const hasTargets = targets.length > 0;
  const enabled = input.enabled ?? true;

  const runSyncRef = useRef<() => void>(() => {});
  const runSync = useCallback(async () => {
    const state = latestRef.current;
    if (syncingRef.current) return;
    if (!state.isPro || !state.currentUserId?.trim()) return;
    const live = collectTripShareSyncTargets(state.trips);
    if (live.length === 0) return;
    const current = buildFeedSyncFingerprint(state.trips, state.places, state.visits, state.legs);
    if (syncedFingerprintRef.current === current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => runSyncRef.current(), { once: true });
      }
      return;
    }
    syncingRef.current = true;
    try {
      const { isPro, currentUserId, language } = state;
      for (const { trip, alias, writeToken } of live) {
        const response = await tripShareService.publishShare({
          trip,
          places: state.places,
          visits: state.visits,
          membership: { isPro },
          userId: currentUserId,
          alias,
          writeToken,
          language,
        });
        saveTripShareMeta(trip.id, {
          alias: response.share.alias,
          write_token: response.write_token,
          updated_at: response.share.updated_at,
          enabled: true,
        });
      }
      syncedFingerprintRef.current = buildFeedSyncFingerprint(
        latestRef.current.trips,
        latestRef.current.places,
        latestRef.current.visits,
        latestRef.current.legs,
      );
    } catch (error) {
      console.warn('[Planner] auto trip share sync failed', error);
    } finally {
      syncingRef.current = false;
    }
  }, []);
  useEffect(() => {
    runSyncRef.current = () => void runSync();
  }, [runSync]);

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
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void runSync();
    }, AUTO_CALENDAR_SYNC_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fingerprint, hasTargets, enabled, input.isPro, input.currentUserId, runSync]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        void runSync();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [runSync]);
}
