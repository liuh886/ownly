'use client';

import { useEffect, useRef } from 'react';
import { captureWorkspaceIdentity } from '@/services/ownlyStoreRouter';
import { usePublicationSync } from './usePublicationSync';
import { assertPublicationWorkspace, isPublicationSuspended, publicationGeneration, publicationKey, queuePublication } from './publication-queue';
import type { PublicationCredentials } from './publication-credentials';
import { plannerRepository } from '@/services/PlannerRepository';
import type {
  PlannerTrip,
  PlannerTripCalendarFeed,
  PlannerTripLeg,
  PlannerTripPlace,
} from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
import {
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
  saveTripFeedMeta: (trip: PlannerTrip, feed: PlannerTripCalendarFeed) => Promise<boolean>;
  /** Reloads planner state after trip metas were persisted. */
  reloadPlanner: () => Promise<void>;
  credentials: PublicationCredentials | null;
  enabled?: boolean;
  onError?: (error: unknown) => void;
}

/**
 * Fire-and-forget trigger that keeps published calendar feeds fresh without
 * a manual tap: once itinerary content settles for the debounce window, all
 * already-published feeds (account + per-trip) are rebuilt with their stable
 * tokens and re-upserted. Silent on success; failures only warn to console
 * (the modal's manual sync remains the explicit fallback).
 */
export function useAutoCalendarSync(input: AutoCalendarSyncInput): void {
  const latest = useRef(input);
  useEffect(() => { latest.current = input; });
  const workspaceIdentity = captureWorkspaceIdentity();
  const fingerprint = `${workspaceIdentity}:${input.language}:${buildFeedSyncFingerprint(input.trips, input.places, input.visits, input.legs)}`;
  const scopedTrips = input.trips.filter((trip) => {
    const receipt = input.credentials?.loadTripFeed(trip.id);
    return receipt?.enabled !== false && Boolean(receipt?.feed_token) && receipt?.feed_token === trip.calendar_feed?.feed_token;
  });
  const targets = collectFeedSyncTargets(scopedTrips, input.accountFeed);
  usePublicationSync({
    state: { ...input, workspaceIdentity }, fingerprint, delay: AUTO_CALENDAR_SYNC_DEBOUNCE_MS,
    active: input.enabled !== false && input.isPro && Boolean(input.currentUserId)
      && Boolean(targets.accountToken || targets.tripFeeds.length),
    onError: input.onError,
    sync: async (state) => {
      const identity = state.workspaceIdentity;
      if (!state.credentials) return;
      const credentials = state.credentials;
      const liveTargets = collectFeedSyncTargets(state.trips.filter((trip) => {
        const receipt = credentials.loadTripFeed(trip.id);
        return receipt?.enabled !== false && Boolean(receipt?.feed_token) && receipt?.feed_token === trip.calendar_feed?.feed_token;
      }), state.accountFeed);
      const allowed = () => latest.current.enabled !== false && latest.current.isPro && latest.current.currentUserId === state.currentUserId;
      if (liveTargets.accountToken) {
        const key = publicationKey(`${credentials.namespace}:${identity}`, 'account', state.currentUserId);
        const generation = publicationGeneration(key);
        await queuePublication(key, async () => {
          assertPublicationWorkspace(identity);
          const meta = credentials.loadAccount(state.currentUserId);
          if (!allowed() || isPublicationSuspended(key) || generation !== publicationGeneration(key) || !meta?.enabled || meta.feed_token !== liveTargets.accountToken) return;
          const response = await calendarFeedService.publishAccountFeed({
            trips: state.trips, places: state.places, visits: state.visits,
            membership: { isPro: state.isPro }, userId: credentials.remoteUserId('account', state.currentUserId, state.currentUserId), feedToken: meta.feed_token,
            options: { language: state.language }, legs: state.legs, refreshOnly: true,
          });
          assertPublicationWorkspace(identity);
          const receipt = { feed_token: response.feed.feed_token, updated_at: response.feed.updated_at, enabled: true };
          credentials.saveAccount(state.currentUserId, receipt);
          if (credentials.loadAccount(state.currentUserId)?.feed_token !== receipt.feed_token) throw new Error('Cloud calendar updated, but local credentials could not be saved. Retry in the subscription dialog.');
          if (allowed()) latest.current.setAccountFeed(receipt);
        });
      }
      let touched = false;
      for (const { trip, token } of liveTargets.tripFeeds) {
        const key = publicationKey(`${credentials.namespace}:${identity}`, 'calendar', trip.id);
        const generation = publicationGeneration(key);
        await queuePublication(key, async () => {
          assertPublicationWorkspace(identity);
          if (!allowed() || isPublicationSuspended(key) || generation !== publicationGeneration(key)) return;
          const currentTrip = (await plannerRepository.listTrips({ strict: true })).find((item) => item.id === trip.id);
          if (!currentTrip?.calendar_feed || currentTrip.calendar_feed.enabled === false || currentTrip.calendar_feed.feed_token !== token) return;
          const response = await calendarFeedService.publishFeed({
            trip, places: state.places, visits: state.visits,
            membership: { isPro: state.isPro }, userId: credentials.remoteUserId('calendar', trip.id, state.currentUserId),
            feedToken: token, options: { language: state.language }, legs: state.legs, refreshOnly: true,
          });
          assertPublicationWorkspace(identity);
          credentials.saveTripFeed(trip.id, response.feed);
          touched = await state.saveTripFeedMeta(trip, response.feed) || touched;
        });
      }
      if (touched && allowed()) await latest.current.reloadPlanner();
    },
  });
}
