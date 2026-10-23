'use client';

import { useEffect, useRef } from 'react';
import { captureWorkspaceIdentity } from '@/services/ownlyStoreRouter';
import { usePublicationSync } from './usePublicationSync';
import { assertPublicationWorkspace, isPublicationSuspended, publicationGeneration, publicationKey, queuePublication } from './publication-queue';
import type { PlannerTrip, PlannerTripLeg, PlannerTripPlace } from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';
import type { PublicationCredentials } from './publication-credentials';
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
  credentials: PublicationCredentials | null;
  enabled?: boolean;
  onError?: (error: unknown) => void;
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
export function collectTripShareSyncTargets(trips: PlannerTrip[], credentials?: PublicationCredentials | null): TripShareSyncTarget[] {
  const targets: TripShareSyncTarget[] = [];
  for (const trip of trips) {
    const meta = credentials?.loadShare(trip.id);
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
  const latest = useRef(input);
  useEffect(() => { latest.current = input; });
  const workspaceIdentity = captureWorkspaceIdentity();
  const fingerprint = `${workspaceIdentity}:${input.language}:${buildFeedSyncFingerprint(input.trips, input.places, input.visits, input.legs)}`;
  usePublicationSync({
    state: { ...input, workspaceIdentity }, fingerprint, delay: AUTO_CALENDAR_SYNC_DEBOUNCE_MS,
    active: input.enabled !== false && input.isPro && Boolean(input.currentUserId) && collectTripShareSyncTargets(input.trips, input.credentials).length > 0,
    onError: input.onError,
    sync: async (state) => {
      const identity = state.workspaceIdentity;
      for (const { trip, alias, writeToken } of collectTripShareSyncTargets(state.trips, state.credentials)) {
        if (!state.credentials) return;
        const credentials = state.credentials;
        const key = publicationKey(`${credentials.namespace}:${identity}`, 'share', trip.id);
        const generation = publicationGeneration(key);
        await queuePublication(key, async () => {
          assertPublicationWorkspace(identity);
          const live = latest.current;
          const meta = credentials.loadShare(trip.id);
          if (live.enabled === false || !live.isPro || live.currentUserId !== state.currentUserId
            || !live.trips.some((item) => item.id === trip.id)
            || isPublicationSuspended(key) || generation !== publicationGeneration(key) || !meta?.enabled || meta.write_token !== writeToken) return;
          const response = await tripShareService.publishShare({
            trip, places: state.places, visits: state.visits,
            membership: { isPro: state.isPro }, userId: `${state.currentUserId}:${credentials.namespace}`,
            alias, writeToken, language: state.language, refreshOnly: true,
          });
          // Revocation is queued behind this entire remote write + receipt.
          assertPublicationWorkspace(identity);
          credentials.saveShare(trip.id, { alias: response.share.alias, write_token: response.write_token,
            updated_at: response.share.updated_at, enabled: true });
          if (credentials.loadShare(trip.id)?.write_token !== response.write_token) throw new Error('Cloud share updated, but local credentials could not be saved. Retry in the share dialog.');
        });
      }
    },
  });
}
