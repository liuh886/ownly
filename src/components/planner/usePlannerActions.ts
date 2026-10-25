'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PlannerPlaceKind,
  PlannerTravelMode,
  PlannerTrip,
  PlannerTripCalendarFeed,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseItem,
} from '@/domain/planner';
import type { PlannerScheduledPlace, PlannerTripVisit } from '@/domain/planner-visits';
import { sortPlannerScheduledPlaces } from '@/domain/planner-visits';
import {
  calculateDefaultTripLeg,
  exportPlacesToCSV,
  exportPlacesToKML,
  exportTripToMarkdown,
  extractPlaceCoordinates,
  getPlannerKindLabel,
  isTransitHubPlace,
  plannerTripLegId,
} from '@/domain/planner';
import {
  buildOrsSingleLeg,
  computeDayOrderOptimization,
  computeDayTravelRefreshByMode,
  materializeStopCoordinates,
  resolvePairEffectiveModes,
  resolveStopCoordinates,
  travelPairKey,
  type DayTravelRefreshLedger,
  type OrsMatrixFacts,
  type OrsMatrixInput,
  type PairEffectiveTravel,
  type PlannerDayOptimizationComputation,
} from '@/domain/planner-optimization';
import {
  fetchOpenRouteServiceLeg,
  fetchOpenRouteServiceMatrix,
  loadOrsApiKey,
  openRouteServiceProfile,
} from '@/lib/openrouteservice';
import {
  buildTripCalendarIcs,
  buildDayCalendarIcs,
  type AccountCalendarFeedMeta,
} from '@/domain/calendar-feed';
import { useAutoCalendarSync } from './useAutoCalendarSync';
import { saveUnifiedTrip } from '@/services/TripExperienceService';
import { trackFirstEver } from '@/lib/analytics';
import { createDetachedElement } from '@/lib/dom';
import { buildTripItineraryHtml, tripItineraryHtmlFileName } from '@/domain/trip-itinerary-html';
import { type TripShareMeta } from '@/domain/trip-share';
import { plannerRepository } from '@/services/PlannerRepository';
import { calendarFeedService } from '@/services/CalendarFeedService';
import { tripShareService } from '@/services/TripShareService';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { usePublicationCredentials } from './usePublicationCredentials';
import { captureWorkspaceIdentity } from '@/services/ownlyStoreRouter';
import { useAutoTripShareSync } from './useAutoTripShareSync';
import { assertPublicationWorkspace, invalidatePublication, publicationKey, queuePublication, resumePublication, suspendPublication } from './publication-queue';
import {
  applyCaptureImportReport,
  pullCaptureState,
  setCaptureDebugLogs,
  getCaptureDebugLogs,
} from './capture-bridge';
import type { PlannerDataReturn } from './usePlannerData';

function mergeLegs(prev: PlannerTripLeg[], next: PlannerTripLeg[]): PlannerTripLeg[] {
  const byId = new Map(prev.map((leg) => [leg.id, leg] as const));
  for (const leg of next) byId.set(leg.id, leg);
  return [...byId.values()];
}

interface PlaceSnapshot {
  place: PlannerTripPlace | undefined;
  visits: PlannerTripVisit[];
  legs: PlannerTripLeg[];
}

function snapshotPlace(
  placeId: string,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  legs: PlannerTripLeg[],
  tripId?: string,
): PlaceSnapshot {
  return {
    place: places.find((p) => p.id === placeId),
    visits: visits.filter((v) => v.place_id === placeId && (!tripId || v.trip_id === tripId)),
    legs: legs.filter(
      (l) => (!tripId || l.trip_id === tripId) && (l.from_place_id === placeId || l.to_place_id === placeId),
    ),
  };
}

async function restorePlaceSnapshot(snapshot: PlaceSnapshot, repository: typeof plannerRepository, assertWorkspace: () => void): Promise<void> {
  assertWorkspace();
  if (snapshot.place) await repository.upsertPlace(snapshot.place);
  for (const visit of snapshot.visits) {
    assertWorkspace();
    await repository.upsertVisit(visit);
  }
  for (const leg of snapshot.legs) {
    assertWorkspace();
    await repository.upsertLeg(leg);
  }
}

export interface UsePlannerActionsProps {
  onDataChanged?: () => Promise<void>;
  data: PlannerDataReturn;
  disabled: boolean;
}

/**
 * Motorcycle pairs go through per-leg directions (with expressway/tollway
 * avoidance) because the matrix endpoint ignores those options. Results are
 * assembled into a sparse matrix so the shared refresh computation can
 * consume every mode uniformly. Unroutable pairs stay null → kept estimates.
 */
async function fetchMotorcyclePairMatrix(
  apiKey: string,
  stopsForCompute: PlannerScheduledPlace[],
  matrixStops: PlannerScheduledPlace[],
  pairModes: Map<string, PairEffectiveTravel>,
): Promise<OrsMatrixInput | null> {
  const orderIndex = new Map(matrixStops.map((stop, index) => [stop.id, index]));
  const size = matrixStops.length;
  const durations_minutes: Array<Array<number | null>> = Array.from({ length: size }, () => Array<number | null>(size).fill(null));
  const distances_meters: Array<Array<number | null>> = Array.from({ length: size }, () => Array<number | null>(size).fill(null));
  let attempted = false;
  for (let index = 0; index + 1 < stopsForCompute.length; index += 1) {
    const from = stopsForCompute[index];
    const to = stopsForCompute[index + 1];
    const info = pairModes.get(travelPairKey(from.place_id || from.id, to.place_id || to.id));
    if (!info || info.manual || info.mode !== 'motorcycle') continue;
    const row = orderIndex.get(from.id);
    const col = orderIndex.get(to.id);
    if (row === undefined || col === undefined || !from.coordinates || !to.coordinates) continue;
    attempted = true;
    try {
      const leg = await fetchOpenRouteServiceLeg(apiKey, from.coordinates, to.coordinates, 'motorcycle');
      const durationRow = durations_minutes[row];
      const distanceRow = distances_meters[row];
      if (durationRow && distanceRow) {
        durationRow[col] = leg.duration_minutes;
        distanceRow[col] = leg.distance_meters;
      }
    } catch (error) {
      console.warn('[Planner] Travel refresh motorcycle leg failed; keeping estimate', error);
    }
    // Stay comfortably under the 40/min rate limit on pair-heavy days.
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
  if (!attempted) return null;
  return { order: matrixStops, facts: { durations_minutes, distances_meters } };
}

export function usePlannerActions({ data, disabled, onDataChanged }: UsePlannerActionsProps) {
  const {
    zh,
    language,
    selectedTripId,
    selectedTrip,
    trips,
    places,
    visits,
    legs,
    tripDates,
    activeDate,
    scheduled,
    scheduledAll,
    sortedPendingCandidates,
    selectedCandidateIds,
    isBatchOperating,
    setIsBatchOperating,
    isScheduling,
    setIsScheduling,
    isPro,
    currentUserId,
    currentExpenses,
    load,
    setNotice,
    setNoticeAction,
    setConfirmRequest,
    busy,
    setBusy,
    setTrips,
    setVisits,
    setLegs,
    setExpensesByTrip,
    setMembersByTrip,
    setSelectedTripId,
    setSelectedCandidateIds,
    setIsMultiSelectMode,
    setCapturePending,
  } = data;

  const plannerWorkspaceIdentity = captureWorkspaceIdentity();
  const publicationContext = useRef({ disabled, currentUserId, isPro, selectedTripId });
  useEffect(() => { publicationContext.current = { disabled, currentUserId, isPro, selectedTripId }; }, [disabled, currentUserId, isPro, selectedTripId]);

  const showPersistError = useCallback((error: unknown, context: string) => {
    console.warn(`[Planner] Failed to ${context}`, error);
    setNotice(zh ? '保存失败，界面已还原，请重试。' : 'Save failed; the change was reverted. Please try again.');
  }, [setNotice, zh]);

  const workspace = useOwnlyWorkspace();
  const { scope, getScope } = usePublicationCredentials(workspace, plannerWorkspaceIdentity, disabled);
  const accountOwner = `${scope?.namespace ?? ''}:${plannerWorkspaceIdentity}:${currentUserId}`;
  const shareOwner = `${scope?.namespace ?? ''}:${plannerWorkspaceIdentity}:${selectedTripId}`;
  const [accountReceipt, setAccountReceipt] = useState<{ owner: string; meta: AccountCalendarFeedMeta | null }>({ owner: '', meta: null });
  const [shareReceipt, setShareReceipt] = useState<{ owner: string; meta: TripShareMeta | null }>({ owner: '', meta: null });
  const accountFeed = accountReceipt.owner === accountOwner ? accountReceipt.meta : null;
  const tripShareMeta = shareReceipt.owner === shareOwner ? shareReceipt.meta : null;
  const setAccountFeed = useCallback((meta: AccountCalendarFeedMeta) => setAccountReceipt({ owner: accountOwner, meta }), [accountOwner]);
  const canRecoverLegacyShare = Boolean(selectedTripId && scope?.canRecoverLegacyShare(selectedTripId));
  const legacyAccountOwners = scope?.recoverableLegacyAccountOwners(currentUserId) ?? [];
  const canRecoverTripFeed = Boolean(selectedTrip && scope?.canRecoverTripFeed(selectedTrip.id, selectedTrip.calendar_feed));
  const managedTripFeed = selectedTrip ? scope?.loadTripFeed(selectedTrip.id) ?? null : null;
  const recoverLegacyShare = useCallback(async () => {
    if (!selectedTripId) throw new Error('Select a trip first.');
    const identity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    assertPublicationWorkspace(identity);
    const meta = credentials.recoverLegacyShare(selectedTripId);
    setShareReceipt({ owner: `${credentials.namespace}:${identity}:${selectedTripId}`, meta });
  }, [selectedTripId, plannerWorkspaceIdentity, getScope]);
  const recoverLegacyAccount = useCallback(async (oldUserId: string) => {
    const identity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    assertPublicationWorkspace(identity);
    if (credentials.loadAccount(currentUserId)) {
      const old = credentials.legacyAccountForRevocation(oldUserId);
      await calendarFeedService.disableAccountFeed({
        membership: { isPro }, userId: oldUserId, feedToken: old.feed_token,
      });
      assertPublicationWorkspace(identity);
      credentials.markLegacyAccountRevoked(oldUserId);
      setAccountReceipt((receipt) => ({ ...receipt }));
      return;
    }
    const meta = credentials.recoverLegacyAccount(currentUserId, oldUserId);
    setAccountReceipt({ owner: `${credentials.namespace}:${identity}:${currentUserId}`, meta });
  }, [currentUserId, plannerWorkspaceIdentity, getScope, isPro]);
  const recoverTripFeed = useCallback(async () => {
    if (!selectedTrip) throw new Error('Select a trip first.');
    const identity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    assertPublicationWorkspace(identity);
    const storedTrip = (await plannerRepository.listTrips({ strict: true })).find((trip) => trip.id === selectedTrip.id);
    assertPublicationWorkspace(identity);
    if (!storedTrip?.calendar_feed) throw new Error('This trip has no older calendar token to recover.');
    credentials.recoverTripFeed(selectedTrip.id, storedTrip.calendar_feed, currentUserId);
    await load();
  }, [selectedTrip, plannerWorkspaceIdentity, getScope, currentUserId, load]);
  const pendingTripShareReceipts = useRef(new Map<string, TripShareMeta>());
  const pendingTripFeedReceipts = useRef(new Map<string, PlannerTripCalendarFeed>());
  const pendingAccountFeedReceipts = useRef(new Map<string, AccountCalendarFeedMeta>());
  useEffect(() => {
    let active = true;
    if (scope) void Promise.resolve().then(() => {
      if (!active) return;
      setAccountReceipt({ owner: accountOwner, meta: pendingAccountFeedReceipts.current.get(`${plannerWorkspaceIdentity}:${currentUserId}`) ?? scope.loadAccount(currentUserId) });
      setShareReceipt({ owner: shareOwner, meta: selectedTripId ? pendingTripShareReceipts.current.get(`${scope.namespace}:${plannerWorkspaceIdentity}:${selectedTripId}`) ?? scope.loadShare(selectedTripId) : null });
    });
    return () => { active = false; };
  }, [scope, plannerWorkspaceIdentity, accountOwner, shareOwner, currentUserId, selectedTripId]);



  // Persists one trip's refreshed feed meta without reloading; the auto-sync
  // trigger reloads once after all trips are done.
  const saveTripFeedMeta = useCallback(async (trip: PlannerTrip, feed: PlannerTripCalendarFeed) => {
    return plannerRepository.withWriteSession(async (bound) => {
      assertPublicationWorkspace(plannerWorkspaceIdentity);
      return bound.patchTripCalendarFeed(trip.id, feed, trip.calendar_feed?.feed_token);
    });
  }, [plannerWorkspaceIdentity]);
  const reloadPlanner = useCallback(async () => {
    await load();
  }, [load]);

  // Background trigger: debounced republish of already-published feeds after
  // itinerary edits settle. Never mints or resurrects feeds.
  useAutoCalendarSync({
    trips,
    places,
    visits,
    legs,
    isPro,
    currentUserId,
    language,
    accountFeed,
    setAccountFeed,
    saveTripFeedMeta,
    reloadPlanner,
    enabled: !disabled,
    credentials: scope,
    onError: (error) => setNotice((zh ? '日历自动同步失败，请在订阅窗口重试。' : 'Calendar auto-sync failed; retry in the subscription dialog.') + (error instanceof Error ? ` ${error.message}` : '')),
  });

  useAutoTripShareSync({
    trips,
    places,
    visits,
    legs,
    isPro,
    currentUserId,
    language,
    enabled: !disabled,
    credentials: scope,
    onError: (error) => setNotice((zh ? '分享自动同步失败，请在分享窗口重试。' : 'Share auto-sync failed; retry in the share dialog.') + (error instanceof Error ? ` ${error.message}` : '')),
  });

  const showUndoNotice = useCallback((text: string, restore: (repository: typeof plannerRepository, assertWorkspace: () => void) => Promise<void>) => {
    const identity = plannerWorkspaceIdentity;
    setNoticeAction({
      label: zh ? '撤销' : 'Undo', text,
      run: () => {
        void (async () => {
          try {
            assertPublicationWorkspace(identity);
            await plannerRepository.withWriteSession(async (bound) => {
              const assertWorkspace = () => assertPublicationWorkspace(identity);
              assertWorkspace();
              await restore(bound, assertWorkspace);
              assertWorkspace();
            });
            await load();
            setNotice(zh ? '已撤销。' : 'Change undone.');
          } catch (error) {
            setNotice(zh ? '撤销失败：工作区可能已切换或无法保存。请返回原目录检查后重试。' : 'Undo failed: the workspace changed or saving failed. Return to the original folder, check the record and retry.');
            console.warn('[Planner] Undo restore failed', error);
          }
        })();
      },
    });
    setNotice(text);
  }, [plannerWorkspaceIdentity, load, setNotice, setNoticeAction, zh]);

  const handleUpsertTrip = useCallback(
    async (newTrip: PlannerTrip, baseline?: PlannerTrip) => {
      if (disabled) throw new Error(zh ? '请先连接数据目录。' : 'Connect a data folder first.');
      const identity = plannerWorkspaceIdentity;
      const assertWorkspace = () => assertPublicationWorkspace(identity);
      const save = async (repo: typeof workspace.repository) => {
        assertWorkspace();
        await plannerRepository.withWriteSession(async (planner) => {
          assertWorkspace();
          await saveUnifiedTrip(repo, planner, newTrip, assertWorkspace, baseline ?? trips.find((trip) => trip.id === newTrip.id));
        });
      };
      if (workspace.repository.withWriteSession) await workspace.repository.withWriteSession(save);
      else await save(workspace.repository);
      assertWorkspace();
      setSelectedTripId(newTrip.id);
      try {
        await load();
        if (onDataChanged) await onDataChanged();
        else workspace.refreshData();
      } catch {
        setNotice(zh ? '行程已保存，列表刷新失败，请重新打开。' : 'Trip saved; refresh failed. Reopen it to refresh.');
        return;
      }
      setNotice(zh ? `已保存行程「${newTrip.title}」` : `Saved trip "${newTrip.title}"`);
    },
    [load, setSelectedTripId, setNotice, zh, disabled, plannerWorkspaceIdentity, workspace, trips, onDataChanged],
  );

  const handleDeleteTrip = useCallback(
    async (tripId: string) => {
      await plannerRepository.deleteTrip(tripId);
      await load();
      setNotice(zh ? '已删除行程' : 'Trip deleted');
      if (selectedTripId === tripId) {
        setSelectedTripId(trips.find((t) => t.id !== tripId)?.id ?? '');
      }
    },
    [load, selectedTripId, setNotice, setSelectedTripId, trips, zh],
  );

  const handleToggleVisitLock = useCallback(
    async (visitId: string) => {
      await plannerRepository.toggleVisitLock(visitId);
      await load();
    },
    [load],
  );

  const handleAddExpense = useCallback(
    async (item: Omit<TripExpenseItem, 'id' | 'created_at'>) => {
      if (!selectedTripId) return;
      const newExp: TripExpenseItem = { ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      try {
        await plannerRepository.upsertExpense(newExp);
        setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: [newExp, ...(prev[selectedTripId] ?? [])] }));
      } catch (error) {
        console.warn('[Planner] Failed to persist expense', error);
        setNotice(zh ? '费用保存失败，请重试。输入已保留。' : 'Expense save failed. Your input was kept; retry saving.');
        throw error;
      }
    },
    [selectedTripId, setExpensesByTrip, setNotice, zh],
  );

  const handleUpdateExpense = useCallback(
    async (item: TripExpenseItem) => {
      if (!selectedTripId) return;
      try {
        await plannerRepository.upsertExpense(item);
        setExpensesByTrip((prev) => ({
          ...prev,
          [selectedTripId]: (prev[selectedTripId] ?? []).map((expense) => (expense.id === item.id ? item : expense)),
        }));
      } catch (error) {
        console.warn('[Planner] Failed to update expense', error);
        setNotice(zh ? '费用更新失败，原记录仍保留。' : 'Expense update failed; the original record is still present.');
        throw error;
      }
    },
    [selectedTripId, setExpensesByTrip, setNotice, zh],
  );

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      if (!selectedTripId) return;
      try {
        await plannerRepository.deleteExpense(id);
        setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: (prev[selectedTripId] ?? []).filter((expense) => expense.id !== id) }));
      } catch (error) {
        console.warn('[Planner] Failed to delete expense', error);
        setNotice(zh ? '费用删除失败，原记录仍保留。' : 'Expense delete failed; the original record is still present.');
      }
    },
    [selectedTripId, setExpensesByTrip, setNotice, zh],
  );

  const handleUpdateMembers = useCallback(
    async (nextMembers: string[]) => {
      if (!selectedTripId) return;
      const trip = trips.find((item) => item.id === selectedTripId);
      if (!trip) return;
      try {
        const nextTrip = { ...trip, members: nextMembers, updated_at: new Date().toISOString() };
        await plannerRepository.upsertTrip(nextTrip);
        setMembersByTrip((prev) => ({ ...prev, [selectedTripId]: nextMembers }));
        setTrips((prev) => prev.map((item) => (item.id === selectedTripId ? nextTrip : item)));
      } catch (error) {
        console.warn('[Planner] Failed to persist trip members', error);
        setNotice(zh ? '成员保存失败，未更新界面。' : 'Member save failed; the UI was not updated.');
      }
    },
    [selectedTripId, trips, setMembersByTrip, setTrips, setNotice, zh],
  );

  const handleSwitchTravelMode = useCallback(
    async (from: PlannerScheduledPlace, to: PlannerScheduledPlace, mode: PlannerTravelMode) => {
      if (!selectedTrip) return;
      const leg = calculateDefaultTripLeg(selectedTrip, from, to, mode);
      // Propagate forward: later legs of the same day that still follow the
      // previous mode (or have no stored leg) inherit the new mode, so the
      // user doesn't have to switch every leg one by one. Manually cleared
      // legs (duration 0) and legs explicitly set to another mode are kept.
      const fromPlaceId = from.place_id || from.id;
      const toPlaceId = to.place_id || to.id;
      const previousLeg = legs.find(
        (item) => item.trip_id === selectedTrip.id
          && item.from_place_id === fromPlaceId && item.to_place_id === toPlaceId,
      );
      const previousMode = previousLeg?.mode ?? selectedTrip.transport_mode ?? 'driving';
      const pendingLegs = leg ? [leg] : [];
      let propagated = 0;
      const fromIndex = scheduled.findIndex((item) => item.id === from.id);
      if (fromIndex >= 0) {
        for (let index = fromIndex + 1; index < scheduled.length - 1; index += 1) {
          const segFrom = scheduled[index];
          const segTo = scheduled[index + 1];
          const segFromId = segFrom.place_id || segFrom.id;
          const segToId = segTo.place_id || segTo.id;
          const stored = legs.find(
            (item) => item.trip_id === selectedTrip.id
              && item.from_place_id === segFromId && item.to_place_id === segToId,
          );
          if (stored && stored.source === 'manual' && stored.duration_minutes === 0) continue;
          if (stored && stored.mode !== previousMode) continue;
          const next = calculateDefaultTripLeg(selectedTrip, segFrom, segTo, mode);
          if (!next) continue;
          pendingLegs.push(next);
          propagated += 1;
        }
      }
      // Optimistic: leg ids and estimates derive from the same pure function,
      // so the preview matches persistence exactly; load() reconciles/rolls back.
      let saved = false;
      if (pendingLegs.length > 0) setLegs((prev) => mergeLegs(prev, pendingLegs));
      try {
        for (const pending of pendingLegs) {
          await plannerRepository.upsertLeg(pending);
        }
        saved = true;
      } catch (error) {
        showPersistError(error, 'persist travel mode');
      }
      await load();
      if (saved && propagated > 0) {
        setNotice(zh ? `已切换交通方式，并向后应用 ${propagated} 段。` : `Travel mode switched and applied to ${propagated} following legs.`);
      }
    },
    [selectedTrip, load, legs, scheduled, setLegs, setNotice, showPersistError, zh],
  );

  const handleClearTravelEstimate = useCallback(
    async (from: PlannerScheduledPlace, to: PlannerScheduledPlace) => {
      if (!selectedTrip) return;
      const fromPlaceId = from.place_id || from.id;
      const toPlaceId = to.place_id || to.id;
      const nowIso = new Date().toISOString();
      const clearedLeg: PlannerTripLeg = {
        schema_version: '0.1',
        type: 'trip_leg',
        id: plannerTripLegId(selectedTrip.id, fromPlaceId, toPlaceId),
        trip_id: selectedTrip.id,
        from_place_id: fromPlaceId,
        to_place_id: toPlaceId,
        mode: selectedTrip.transport_mode ?? 'driving',
        duration_minutes: 0,
        distance_meters: 0,
        source: 'manual',
        created_at: nowIso,
        updated_at: nowIso,
      };
      setLegs((prev) => mergeLegs(prev, [clearedLeg]));
      const previousLeg = legs.find(
        (item) => item.trip_id === selectedTrip.id
          && item.from_place_id === fromPlaceId && item.to_place_id === toPlaceId,
      );
      try {
        await plannerRepository.upsertLeg(clearedLeg);
      } catch (error) {
        showPersistError(error, 'clear commute estimate');
        await load();
        return;
      }
      await load();
      if (previousLeg && previousLeg.duration_minutes > 0) {
        showUndoNotice(zh ? '已清除该段交通时间预估。' : 'Commute estimate cleared for this leg.', async (bound, assertWorkspace) => {
          assertWorkspace();
          await bound.upsertLeg(previousLeg);
        });
      } else {
        setNotice(zh ? '已清除该段交通时间预估。' : 'Commute estimate cleared for this leg.');
      }
    },
    [legs, selectedTrip, load, setLegs, setNotice, showPersistError, showUndoNotice, zh],
  );

  const handleRecalculateTravelEstimate = useCallback(
    async (from: PlannerScheduledPlace, to: PlannerScheduledPlace) => {
      if (!selectedTrip) return;
      if (isTransitHubPlace(from) && isTransitHubPlace(to)) {
        setNotice(zh ? '两站均为交通枢纽，无需本地交通预估。' : 'Both stops are transit hubs; no local commute estimate needed.');
        return;
      }
      // Prefer real road-network routing when the pair's effective mode
      // (stored leg mode, else the trip default) supports it and an API key
      // is configured; any failure falls back to the distance heuristic.
      const fromPlaceId = from.place_id || from.id;
      const toPlaceId = to.place_id || to.id;
      const mode = legs.find(
        (item) => item.trip_id === selectedTrip.id && item.from_place_id === fromPlaceId && item.to_place_id === toPlaceId,
      )?.mode ?? selectedTrip.transport_mode ?? 'driving';
      let leg: PlannerTripLeg | null = null;
      let viaOrs = false;
      const fromCoords = extractPlaceCoordinates(from);
      const toCoords = extractPlaceCoordinates(to);
      const apiKey = loadOrsApiKey();
      if (fromCoords && toCoords && openRouteServiceProfile(mode) && apiKey.trim()) {
        try {
          const ors = await fetchOpenRouteServiceLeg(apiKey, fromCoords, toCoords, mode);
          leg = buildOrsSingleLeg(selectedTrip, fromPlaceId, toPlaceId, mode, ors);
          viaOrs = true;
        } catch (error) {
          console.warn('[Planner] OpenRouteService single-leg failed; falling back to heuristic estimate', error);
        }
      }
      leg ??= calculateDefaultTripLeg(selectedTrip, from, to);
      if (!leg) {
        setNotice(zh ? '两站均为交通枢纽，无需本地交通预估。' : 'Both stops are transit hubs; no local commute estimate needed.');
        return;
      }
      setLegs((prev) => mergeLegs(prev, [leg]));
      try {
        await plannerRepository.upsertLeg(leg);
      } catch (error) {
        showPersistError(error, 'recalculate commute estimate');
        await load();
        return;
      }
      await load();
      setNotice(viaOrs
        ? (zh ? '已用真实路网（ORS）重新计算该段。' : 'Recalculated this leg with live road-network routing (ORS).')
        : (zh ? '已按该段交通方式重新计算。' : 'Commute estimate recalculated with this leg’s travel mode.'));
    },
    [selectedTrip, legs, load, setLegs, setNotice, showPersistError, zh],
  );

  const handleSelectHotelForStaySpan = useCallback(
    async (hotel: PlannerTripPlace, stayDates: string[]) => {
      if (disabled || stayDates.length === 0) return;
      setBusy(true);
      try {
        await plannerRepository.setStaySpan(hotel.id, stayDates);
        await load();
        setNotice(
          zh
            ? `✓ 已将「${hotel.title}」设为 ${stayDates.length} 晚连住宿点 (${stayDates[0]} ~ ${stayDates[stayDates.length - 1]})！`
            : `✓ Set "${hotel.title}" as stay for ${stayDates.length} nights!`,
        );
      } finally {
        setBusy(false);
      }
    },
    [disabled, zh, load, setBusy, setNotice],
  );

  const handleUpdateFxRates = useCallback(
    async (rates: Record<string, number>) => {
      const trip = trips.find((item) => item.id === selectedTripId);
      if (!trip) throw new Error(zh ? '请先选择行程。' : 'Select a trip first.');
      try {
        await plannerRepository.upsertTrip({ ...trip, fx_rates: rates, updated_at: new Date().toISOString() });
        setTrips((prev) => prev.map((item) => item.id === trip.id ? { ...item, fx_rates: rates } : item));
      } catch (error) {
        setNotice(zh ? '汇率保存失败，原汇率仍保留，请重试。' : 'Rate save failed; original rates were kept. Please retry.');
        throw error;
      }
    },
    [selectedTripId, trips, setTrips, setNotice, zh],
  );

  const handleDropPlace = useCallback(
    async (placeId: string) => {
      if (!placeId || disabled) return;
      try {
        await plannerRepository.dropPlace(placeId);
        await load();
        trackFirstEver('object_archived', 'object_archived');
        showUndoNotice(zh ? '已将地点设为暂不考虑' : 'Place shelved', async (bound, assertWorkspace) => {
          assertWorkspace();
          await bound.restorePlace(placeId);
        });
      } catch {
        setNotice(zh ? '该地点仍在行程中，请先从日程中移除已排访问。' : 'This place is still scheduled. Remove its visits first.');
      }
    },
    [disabled, load, setNotice, showUndoNotice, zh],
  );

  const handleRestorePlace = useCallback(
    async (placeId: string) => {
      if (!placeId || disabled) return;
      try {
        await plannerRepository.restorePlace(placeId);
        await load();
        trackFirstEver('object_restored', 'object_restored');
        setNotice(zh ? '已恢复为待考虑候选' : 'Place restored to candidates');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      }
    },
    [disabled, load, setNotice, zh],
  );

  const handleDeletePlace = useCallback(
    async (placeId: string, placeTitle?: string) => {
      if (!placeId || disabled) return;
      const title = placeTitle || '该地点';
      setConfirmRequest({
        title: zh ? '彻底删除地点' : 'Delete place',
        message: zh
          ? `确定要彻底删除地点「${title}」吗？删除后对应文件将被移除，可在 8 秒内撤销。`
          : `Permanently delete "${title}"? You can undo within 8 seconds.`,
        confirmLabel: zh ? '彻底删除' : 'Delete',
        run: async () => {
          const snapshot = snapshotPlace(placeId, places, visits, legs, selectedTripId);
          try {
            await plannerRepository.deletePlace(placeId);
            await load();
            showUndoNotice(zh ? '已彻底删除地点' : 'Place permanently deleted', async (bound, assertWorkspace) => {
              await restorePlaceSnapshot(snapshot, bound, assertWorkspace);
            });
          } catch (err) {
            setNotice(err instanceof Error ? err.message : zh ? '删除失败，若已排入日程请先移除日程' : 'Delete failed');
          }
        },
      });
    },
    [disabled, legs, places, selectedTripId, setConfirmRequest, setNotice, showUndoNotice, visits, load, zh],
  );

  const handleDeduplicatePlaces = useCallback(async () => {
    if (!selectedTripId || disabled) return;
    try {
      const res = await plannerRepository.deduplicateTripPlaces(selectedTripId);
      await load();
      if (res.mergedCount > 0 || res.removedCount > 0) {
        setNotice(zh ? `去重完成：已合并 ${res.mergedCount} 处重复并清理 ${res.removedCount} 份多余文件` : `Deduplication complete: merged ${res.mergedCount} duplicate place(s)`);
      } else {
        setNotice(zh ? '当前行程候选池未发现重复地点' : 'No duplicate places found in current trip');
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [disabled, load, selectedTripId, setNotice, zh]);

  const handleMergePair = useCallback(
    async (primaryId: string, secondaryId: string) => {
      if (!primaryId || !secondaryId || disabled) return;
      try {
        await plannerRepository.mergePlaces(primaryId, secondaryId);
        await load();
        setNotice(zh ? '已成功合并地点并更新关联日程！' : 'Places merged successfully!');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      }
    },
    [disabled, load, setNotice, zh],
  );

  const handleIgnoreSuspectedPair = useCallback(
    async (pairId: string) => {
      if (!pairId || !selectedTrip || disabled) return;
      try {
        const ignored = new Set(selectedTrip.ignored_duplicate_pair_ids ?? []);
        ignored.add(pairId);
        const nextTrip: PlannerTrip = {
          ...selectedTrip,
          ignored_duplicate_pair_ids: [...ignored].sort(),
          updated_at: new Date().toISOString(),
        };
        await plannerRepository.upsertTrip(nextTrip);
        setTrips((prev) => prev.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip)));
        setNotice(zh ? '已确认这两个地点应保持分开' : 'Kept these places separate');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      }
    },
    [disabled, selectedTrip, setTrips, setNotice, zh],
  );

  const toggleSelectCandidate = useCallback((id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelectedCandidateIds]);

  const handleSelectAllCandidates = useCallback(() => {
    setSelectedCandidateIds(new Set(sortedPendingCandidates.map((p) => p.id)));
  }, [setSelectedCandidateIds, sortedPendingCandidates]);

  const handleDeselectAllCandidates = useCallback(() => {
    setSelectedCandidateIds(new Set());
  }, [setSelectedCandidateIds]);

  const handleBatchDeleteCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || disabled || isBatchOperating) return;
    const count = selectedCandidateIds.size;
    const ids = [...selectedCandidateIds];
    setConfirmRequest({
      title: zh ? '彻底删除所选地点' : 'Delete selected places',
      message: zh
        ? `确定要彻底删除已选中的 ${count} 个地点吗？删除后可在 8 秒内撤销。`
        : `Permanently delete ${count} selected places? You can undo within 8 seconds.`,
      confirmLabel: zh ? '彻底删除' : 'Delete',
      run: async () => {
        const snapshots = ids.map((id) => snapshotPlace(id, places, visits, legs, selectedTripId));
        setIsBatchOperating(true);
        const succeededIds: string[] = [];
        const failedIds: string[] = [];
        try {
          for (const id of ids) {
            try {
              await plannerRepository.deletePlace(id);
              succeededIds.push(id);
            } catch {
              failedIds.push(id);
            }
          }
          await load();
          setSelectedCandidateIds((prev) => {
            const next = new Set(prev);
            succeededIds.forEach((id) => next.delete(id));
            return next;
          });
          if (failedIds.length === 0) {
            setIsMultiSelectMode(false);
            showUndoNotice(zh ? `已彻底删除 ${succeededIds.length} 个地点` : `Deleted ${succeededIds.length} places`, async (bound, assertWorkspace) => {
              for (const snapshot of snapshots) {
                await restorePlaceSnapshot(snapshot, bound, assertWorkspace);
              }
            });
          } else {
            setNotice(
              zh
                ? `已删除 ${succeededIds.length} 个地点，${failedIds.length} 个删除失败`
                : `Deleted ${succeededIds.length} places, ${failedIds.length} failed`,
            );
          }
        } finally {
          setIsBatchOperating(false);
        }
      },
    });
  }, [disabled, isBatchOperating, legs, load, places, selectedCandidateIds, selectedTripId, setConfirmRequest, setIsBatchOperating, setIsMultiSelectMode, setNotice, setSelectedCandidateIds, showUndoNotice, visits, zh]);

  const handleBatchShelveCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || disabled || isBatchOperating) return;
    setIsBatchOperating(true);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    try {
      for (const id of selectedCandidateIds) {
        try {
          await plannerRepository.dropPlace(id);
          succeededIds.push(id);
        } catch {
          failedIds.push(id);
        }
      }
      await load();
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      if (failedIds.length === 0) {
        setIsMultiSelectMode(false);
        setNotice(zh ? `已将 ${succeededIds.length} 个地点设为暂不考虑` : `Shelved ${succeededIds.length} places`);
      } else {
        setNotice(
          zh
            ? `已将 ${succeededIds.length} 个地点设为暂不考虑，${failedIds.length} 个失败`
            : `Shelved ${succeededIds.length} places, ${failedIds.length} failed`,
        );
      }
    } finally {
      setIsBatchOperating(false);
    }
  }, [disabled, isBatchOperating, load, selectedCandidateIds, setIsBatchOperating, setIsMultiSelectMode, setNotice, setSelectedCandidateIds, zh]);

  const handleBatchScheduleCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || !activeDate || disabled || isBatchOperating) return;
    setIsBatchOperating(true);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    try {
      for (const id of selectedCandidateIds) {
        try {
          await plannerRepository.addVisit(id, activeDate);
          succeededIds.push(id);
        } catch {
          failedIds.push(id);
        }
      }
      await load();
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      if (failedIds.length === 0) {
        setIsMultiSelectMode(false);
        setNotice(zh ? `已将 ${succeededIds.length} 个地点排入 ${activeDate}` : `Scheduled ${succeededIds.length} places to ${activeDate}`);
      } else {
        setNotice(
          zh
            ? `已将 ${succeededIds.length} 个地点排入 ${activeDate}，${failedIds.length} 个失败`
            : `Scheduled ${succeededIds.length} places to ${activeDate}, ${failedIds.length} failed`,
        );
      }
    } finally {
      setIsBatchOperating(false);
    }
  }, [activeDate, disabled, isBatchOperating, load, selectedCandidateIds, setIsBatchOperating, setIsMultiSelectMode, setNotice, setSelectedCandidateIds, zh]);

  const handleBatchMergeCandidates = useCallback(async () => {
    if (selectedCandidateIds.size < 2 || disabled || isBatchOperating) return;
    const selectedPlaces = sortedPendingCandidates.filter((p) => selectedCandidateIds.has(p.id));
    if (selectedPlaces.length < 2) return;
    const primary = selectedPlaces[0];
    const mergeCount = selectedPlaces.length;
    setConfirmRequest({
      title: zh ? '合并地点' : 'Merge places',
      message: zh
        ? `确定将选中的 ${mergeCount} 个地点合并为「${primary.title}」吗？合并不可撤销。`
        : `Merge ${mergeCount} selected places into "${primary.title}"? This cannot be undone.`,
      confirmLabel: zh ? '合并' : 'Merge',
      run: async () => {
        setIsBatchOperating(true);
        try {
          for (let i = 1; i < selectedPlaces.length; i++) {
            await plannerRepository.mergePlaces(primary.id, selectedPlaces[i].id);
          }
          await load();
          setSelectedCandidateIds(new Set());
          setIsMultiSelectMode(false);
          setNotice(zh ? `已成功合并为「${primary.title}」！` : `Merged into "${primary.title}"!`);
        } catch (err) {
          setNotice(err instanceof Error ? err.message : String(err));
        } finally {
          setIsBatchOperating(false);
        }
      },
    });
  }, [disabled, isBatchOperating, load, selectedCandidateIds, setConfirmRequest, setIsBatchOperating, setIsMultiSelectMode, setNotice, setSelectedCandidateIds, sortedPendingCandidates, zh]);

  const handleSavePlaceTiming = useCallback(
    async (
      visitId: string,
      timing: {
        // null = explicitly clear the field; undefined = leave untouched.
        scheduled_start?: string | null;
        duration_minutes?: number | null;
        is_anchor?: boolean;
        anchor_type?: PlannerScheduledPlace['anchor_type'] | null;
      },
    ) => {
      const cleared = timing.scheduled_start === null || timing.duration_minutes === null;
      setVisits((prev) => prev.map((visit) => {
        if (visit.id !== visitId) return visit;
        const next = { ...visit };
        if (timing.scheduled_start !== undefined) next.start = timing.scheduled_start ?? undefined;
        if (timing.duration_minutes !== undefined) next.duration_minutes = timing.duration_minutes ?? undefined;
        if (timing.is_anchor !== undefined) next.is_anchor = timing.is_anchor;
        if (timing.anchor_type !== undefined) next.anchor_type = timing.anchor_type ?? undefined;
        return next;
      }));
      try {
        await plannerRepository.updateVisitTiming(visitId, {
          start: timing.scheduled_start,
          duration_minutes: timing.duration_minutes,
          is_anchor: timing.is_anchor,
          anchor_type: timing.anchor_type,
        });
      } catch (error) {
        showPersistError(error, 'save place timing');
        await load();
        return;
      }
      await load();
      setNotice(cleared
        ? (zh ? '已清除固定时间，改按交通时间自动推算。' : 'Fixed time cleared; now inferred from travel times.')
        : (zh ? '已更新行程时段与停留时长！' : 'Updated schedule timing and duration!'));
    },
    [load, setNotice, setVisits, showPersistError, zh],
  );

  /**
   * Manual kind correction from the planner UI. The vault record is
   * planner-owned: mergeCapturedPlaceResearch pins kind to the stored value,
   * so future re-capture / re-enrichment will not flip it back.
   */
  const handleChangePlaceKind = useCallback(
    async (placeId: string, kind: PlannerPlaceKind) => {
      if (!placeId || disabled) return;
      const target = places.find((p) => p.id === placeId);
      if (!target || target.kind === kind) return;
      try {
        await plannerRepository.upsertPlace({ ...target, kind });
        await load();
        setNotice(
          zh
            ? `已将「${target.title}」分类改为${getPlannerKindLabel(kind, 'zh')}，后续抓取不会覆盖。`
            : `Changed "${target.title}" to ${getPlannerKindLabel(kind, 'en')}. Future captures will keep it.`,
        );
      } catch (error) {
        showPersistError(error, 'change place kind');
        await load();
      }
    },
    [disabled, load, places, setNotice, showPersistError, zh],
  );

  // Candidate-pool edit mode: patch price/note without touching anything
  // else. Blank input clears the field. Silent on success (the card badges
  // update visibly); only persistence failures surface a notice.
  // Pin semantics come free from mergeCapturedPlaceResearch: why/notes are
  // planner-owned and recapture never overwrites them.
  const handleUpdatePlaceFields = useCallback(
    async (placeId: string, patch: { observed_price?: string; why?: string }) => {
      if (!placeId || disabled) return;
      const target = places.find((p) => p.id === placeId);
      if (!target) return;
      const nextPrice = patch.observed_price === undefined
        ? target.observed_price
        : (patch.observed_price.trim() || undefined);
      const nextWhy = patch.why === undefined
        ? target.why
        : (patch.why.trim() || undefined);
      if (nextPrice === target.observed_price && nextWhy === target.why) return;
      try {
        await plannerRepository.upsertPlace({ ...target, observed_price: nextPrice, why: nextWhy });
        await load();
      } catch (error) {
        showPersistError(error, 'update place details');
        await load();
      }
    },
    [disabled, load, places, showPersistError],
  );

  const schedulePlace = useCallback(
    async (placeId: string, date = activeDate, opts?: { sortOrder?: number }) => {
      if (!date || disabled || isScheduling) return;
      setIsScheduling(true);
      try {
        await plannerRepository.addVisit(
          placeId,
          date,
          opts?.sortOrder !== undefined ? { sort_order: opts.sortOrder } : undefined,
        );
        await load();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      } finally {
        setIsScheduling(false);
      }
    },
    [activeDate, disabled, isScheduling, load, setIsScheduling, setNotice],
  );

  const removeVisit = useCallback(
    async (place: PlannerScheduledPlace) => {
      const snapshot = visits.find((visit) => visit.id === place.visit_id);
      setVisits((prev) => prev.filter((visit) => visit.id !== place.visit_id));
      try {
        await plannerRepository.removeVisit(place.visit_id);
      } catch (error) {
        showPersistError(error, 'remove visit');
        await load();
        return;
      }
      await load();
      if (snapshot) {
        showUndoNotice(zh ? `已将「${place.title}」移出当天` : `Removed "${place.title}" from the day`, async (bound, assertWorkspace) => {
          assertWorkspace();
          await bound.upsertVisit(snapshot);
        });
      }
    },
    [load, setVisits, showPersistError, showUndoNotice, visits, zh],
  );

  const moveScheduled = useCallback(
    async (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= scheduled.length) return;
      const orderedIds = scheduled.map((p) => p.id);
      const [moved] = orderedIds.splice(index, 1);
      orderedIds.splice(targetIndex, 0, moved);
      const orderById = new Map(orderedIds.map((id, order) => [id, order] as const));
      setVisits((prev) => prev.map((visit) => {
        const order = orderById.get(visit.id);
        return order === undefined || visit.date !== activeDate ? visit : { ...visit, sort_order: order };
      }));
      try {
        await plannerRepository.reorderVisits(activeDate, orderedIds);
      } catch (error) {
        showPersistError(error, 'reorder visits');
      }
      await load();
    },
    [activeDate, load, scheduled, setVisits, showPersistError],
  );

  const syncCapture = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setCaptureDebugLogs(true);
    try {
      const state = await pullCaptureState();
      if (!state) {
        setCapturePending(null);
        setNotice(zh ? '未检测到 Ownly Capture 扩展。' : 'Ownly Capture extension was not detected.');
        return;
      }

      await plannerRepository.initialize();
      const pending = Array.isArray(state.pendingPlaces) ? state.pendingPlaces : [];
      if (pending.length > 0) {
        const targetTripId = selectedTripId || state.activeContext?.tripId || trips[0]?.id || '';
        // Stamp the currently selected trip unconditionally: pending places all
        // share one pull batch, and a stale bridge context must never win.
        const placesToImport = pending.map((p) => ({
          ...p,
          trip_id: targetTripId,
        })) as PlannerTripPlace[];
        const report = await plannerRepository.importCapturedPlaces(placesToImport);

        let ackFailed = false;
        try {
          const applied = await applyCaptureImportReport(report);
          if (!applied) ackFailed = true;
        } catch {
          ackFailed = true;
        }

        setCapturePending(report.failed.length);
        const importedCount = report.created.length + report.updated.length;
        const parts: string[] = [];
        if (importedCount > 0) {
          const detailParts: string[] = [];
          if (report.created.length > 0) detailParts.push(zh ? `${report.created.length} 新增` : `${report.created.length} new`);
          if (report.updated.length > 0) detailParts.push(zh ? `${report.updated.length} 更新` : `${report.updated.length} updated`);
          if (report.deduped.length > 0) detailParts.push(zh ? `${report.deduped.length} 去重` : `${report.deduped.length} deduped`);
          parts.push(
            zh
              ? `✅ 已导入 ${importedCount}/${report.received} 个候选（${detailParts.join('，')}）`
              : `✅ Imported ${importedCount}/${report.received} candidates (${detailParts.join(', ')})`,
          );
        }
        if (report.failed.length > 0) {
          const failSummary = report.failed.map((f) => `${f.title} (${f.reason}${f.detail ? `: ${f.detail}` : ''})`).join('; ');
          parts.push(zh ? `⚠️ ${report.failed.length} 个失败：${failSummary}` : `⚠️ ${report.failed.length} failed: ${failSummary}`);
        }
        if (ackFailed) {
          parts.push(zh ? '⚠️ 扩展确认失败，下次同步可能重复导入' : '⚠️ Extension ACK failed; may re-import next sync');
        }
        setNotice(parts.join(' · ') || (zh ? '同步完成。' : 'Sync complete.'));
      } else {
        setCapturePending(0);
        setNotice(zh ? '没有待同步的研究候选。' : 'No pending research candidates to sync.');
      }
      await load();
      setSelectedTripId((current) => current || state.activeContext?.tripId || '');
    } catch (err) {
      const logs = getCaptureDebugLogs();
      const logSummary = logs.map((l) => `[${l.timestamp}] ${l.type}: ${l.messageType} ${l.detail || ''}`).join('\n');
      console.error('[Planner] syncCapture error:', err, '\nDebug logs:\n', logSummary);
      setCapturePending(null);
      const detail = err instanceof Error ? err.message : String(err);
      setNotice(zh ? `同步失败：${detail}` : `Sync failed: ${detail}`);
    } finally {
      setBusy(false);
    }
  }, [load, selectedTripId, setBusy, setCapturePending, setNotice, setSelectedTripId, trips, zh]);

  const handleSwapDays = useCallback(
    async (dateA: string, dateB: string) => {
      if (!selectedTripId || !dateA || !dateB || dateA === dateB) return;
      try {
        const result = await plannerRepository.swapTripDays(selectedTripId, dateA, dateB);
        await load();
        const indexA = tripDates.indexOf(dateA);
        const indexB = tripDates.indexOf(dateB);
        const labelA = indexA >= 0 ? (zh ? `第${indexA + 1}天` : `Day ${indexA + 1}`) : dateA;
        const labelB = indexB >= 0 ? (zh ? `第${indexB + 1}天` : `Day ${indexB + 1}`) : dateB;
        setNotice(
          zh
            ? `✅ 已将 ${labelA} 与 ${labelB} 的全部行程路线完整互换 (${result.swappedCount} 个地点顺位与时间已平移)`
            : `✅ Swapped itinerary between ${labelA} and ${labelB} (${result.swappedCount} visits moved)`,
        );
      } catch (err) {
        console.warn('[Planner] Failed to swap days:', err);
        setNotice(zh ? '互换日程失败，请重试。' : 'Failed to swap day itineraries.');
      }
    },
    [selectedTripId, tripDates, zh, load, setNotice],
  );

  const downloadKML = useCallback(() => {
    if (!selectedTrip || scheduled.length === 0) return;
    const kmlContent = exportPlacesToKML(selectedTrip.title, activeDate, scheduled);
    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = createDetachedElement('a');
    a.href = url;
    a.download = `${selectedTrip.title}_${activeDate}.kml`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '已导出 Google My Maps (KML) 路线文件！' : 'Exported Google My Maps (KML) route file!');
  }, [selectedTrip, scheduled, activeDate, zh, setNotice]);

  const downloadTripItineraryHtml = useCallback((includeExpenses: boolean) => {
    if (!selectedTrip) return;
    const html = buildTripItineraryHtml({
      trip: selectedTrip,
      places,
      visits,
      expenses: currentExpenses ?? [],
      language,
      includeExpenses,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = createDetachedElement('a');
    a.href = url;
    a.download = tripItineraryHtmlFileName(selectedTrip.title);
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh
      ? `已导出单文件行程「${selectedTrip.title}」（${includeExpenses ? '含费用' : '不含费用'}）。传到手机后直接点开即可离线阅读，无需联网或部署。`
      : `Exported a single-file itinerary for "${selectedTrip.title}" (${includeExpenses ? 'with' : 'without'} expenses). Open it directly on your phone — no server or network needed.`);
  }, [selectedTrip, places, visits, currentExpenses, language, zh, setNotice]);

  const handlePublishTripShare = useCallback(async () => {
    if (disabled) throw new Error(zh ? '演示模式只读。' : 'Demo mode is read-only.');
    if (!selectedTrip) throw new Error(zh ? '请先选择行程。' : 'Select a trip first.');
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'share', selectedTrip.id);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      if (disabled) throw new Error(zh ? '演示模式只读。' : 'Demo mode is read-only.');
      if (!selectedTrip) throw new Error(zh ? '请先选择行程。' : 'Select a trip first.');
      const liveMeta = pendingTripShareReceipts.current.get(`${credentials.namespace}:${workspaceIdentity}:${selectedTrip.id}`) ?? credentials.loadShare(selectedTrip.id) ?? tripShareMeta;
      const alias = liveMeta?.alias?.trim() || selectedTrip.title;
      const response = await tripShareService.publishShare({
        trip: selectedTrip,
        places,
        visits,
        membership: { isPro },
        userId: `${currentUserId}:${credentials.namespace}`,
        alias,
        writeToken: liveMeta?.write_token,
        language,
      });
      assertPublicationWorkspace(workspaceIdentity);
      const meta: TripShareMeta = {
        alias: response.share.alias,
        write_token: response.write_token,
        updated_at: response.share.updated_at,
        enabled: true,
      };
      pendingTripShareReceipts.current.set(`${credentials.namespace}:${workspaceIdentity}:${selectedTrip.id}`, meta);
      if (publicationContext.current.selectedTripId === selectedTrip.id) setShareReceipt({ owner: `${credentials.namespace}:${workspaceIdentity}:${selectedTrip.id}`, meta });
      credentials.saveShare(selectedTrip.id, meta);
      if (credentials.loadShare(selectedTrip.id)?.write_token !== meta.write_token) {
        throw new Error(zh ? '云端分享已开启，但本地凭据保存失败。请勿刷新，留在此窗口重试或停用。' : 'The cloud share is enabled, but its local credentials could not be saved. Stay in this window to retry or disable it.');
      }
      pendingTripShareReceipts.current.delete(`${credentials.namespace}:${workspaceIdentity}:${selectedTrip.id}`);
      resumePublication(key);
      return response;
    });
  }, [plannerWorkspaceIdentity, getScope, selectedTrip, places, visits, isPro, currentUserId, tripShareMeta, language, zh, disabled]);

  const handleDisableTripShare = useCallback(async () => {
    if (!selectedTrip) return;
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'share', selectedTrip.id);
    suspendPublication(key);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      const liveMeta = pendingTripShareReceipts.current.get(`${credentials.namespace}:${workspaceIdentity}:${selectedTrip.id}`) ?? credentials.loadShare(selectedTrip.id) ?? tripShareMeta;
      if (!liveMeta) return;
      await tripShareService.disableShare({
        tripId: selectedTrip.id,
        membership: { isPro },
        userId: `${currentUserId}:${credentials.namespace}`,
        alias: liveMeta.alias,
        writeToken: liveMeta.write_token,
      });
      assertPublicationWorkspace(workspaceIdentity);
      const meta: TripShareMeta = { ...liveMeta, enabled: false };
      pendingTripShareReceipts.current.set(`${credentials.namespace}:${workspaceIdentity}:${selectedTrip.id}`, meta);
      if (publicationContext.current.selectedTripId === selectedTrip.id) setShareReceipt({ owner: `${credentials.namespace}:${workspaceIdentity}:${selectedTrip.id}`, meta });
      credentials.saveShare(selectedTrip.id, meta);
      if (credentials.loadShare(selectedTrip.id)?.enabled !== false) {
        throw new Error(zh ? '云端分享已停用，但本地状态保存失败。请重试停用。' : 'The cloud share is disabled, but its local status could not be saved. Retry disabling it.');
      }
    });
  }, [plannerWorkspaceIdentity, getScope, selectedTrip, tripShareMeta, isPro, currentUserId, zh]);

  const downloadCSV = useCallback(() => {
    if (!selectedTrip || scheduled.length === 0) return;
    const csvContent = exportPlacesToCSV(scheduled);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = createDetachedElement('a');
    a.href = url;
    a.download = `${selectedTrip.title}_${activeDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '已导出 Google Maps (CSV) 路线文件！' : 'Exported Google Maps (CSV) file!');
  }, [selectedTrip, scheduled, activeDate, zh, setNotice]);

  const copyMarkdownItinerary = useCallback(async () => {
    if (!selectedTrip) return;
    const md = exportTripToMarkdown(selectedTrip, places, scheduledAll, currentExpenses, language);
    await navigator.clipboard.writeText(md);
    setNotice(zh ? '已复制 Markdown 完整行程单至剪贴板！' : 'Copied Markdown itinerary to clipboard!');
  }, [selectedTrip, places, scheduledAll, currentExpenses, language, zh, setNotice]);

  const downloadFullIcs = useCallback(() => {
    if (!selectedTrip) return;
    const ics = buildTripCalendarIcs(selectedTrip, places, visits, { language, legs, includeAllDates: true });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = createDetachedElement('a');
    a.href = url;
    a.download = `${selectedTrip.title || 'trip'}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '✓ 已下载全行程 .ics 日历文件！' : '✓ Downloaded full trip .ics file!');
  }, [selectedTrip, places, visits, legs, language, zh, setNotice]);

  const downloadDayIcs = useCallback(
    (date: string) => {
      if (!selectedTrip) return;
      const ics = buildDayCalendarIcs(selectedTrip, places, visits, date, { language, legs, includeAllDates: true });
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = createDetachedElement('a');
      a.href = url;
      a.download = `${selectedTrip.title || 'trip'}-${date}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(zh ? `✓ 已下载 ${date} 当天 .ics 日历文件！` : `✓ Downloaded day .ics file for ${date}!`);
    },
    [selectedTrip, places, visits, legs, language, zh, setNotice],
  );

  const copyIcsContent = useCallback(async () => {
    if (!selectedTrip) return;
    const ics = buildTripCalendarIcs(selectedTrip, places, visits, { language, legs, includeAllDates: true });
    await navigator.clipboard.writeText(ics);
    setNotice(zh ? '✓ 已复制 RFC 5545 ICS 日历文本至剪贴板！' : '✓ Copied RFC 5545 ICS calendar text to clipboard!');
  }, [selectedTrip, places, visits, legs, language, zh, setNotice]);

  const handleCreateOrUpdateFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'calendar', selectedTrip.id);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      const storedTrip = (await plannerRepository.listTrips({ strict: true })).find((trip) => trip.id === selectedTrip.id);
      if (!storedTrip) throw new Error('Trip no longer exists.');
      const currentTrip = { ...storedTrip, calendar_feed: pendingTripFeedReceipts.current.get(`${workspaceIdentity}:${selectedTrip.id}`) ?? credentials.loadTripFeed(selectedTrip.id) ?? undefined };
      const response = await calendarFeedService.publishFeed({
        trip: currentTrip,
        places,
        visits,
        membership: { isPro },
        userId: credentials.remoteUserId('calendar', selectedTrip.id, currentUserId),
        options: { language },
        legs,
      });
      pendingTripFeedReceipts.current.set(`${workspaceIdentity}:${selectedTrip.id}`, response.feed);
      assertPublicationWorkspace(workspaceIdentity);
      try {
        credentials.saveTripFeed(selectedTrip.id, response.feed);
        await plannerRepository.withWriteSession(async (bound) => {
          assertPublicationWorkspace(workspaceIdentity);
          await bound.patchTripCalendarFeed(selectedTrip.id, response.feed);
        });
      }
      catch { suspendPublication(key); throw new Error('The cloud calendar was updated, but its local record could not be saved. Retry publishing before closing this window.'); }
      resumePublication(key);
      pendingTripFeedReceipts.current.delete(`${workspaceIdentity}:${selectedTrip.id}`);
      try { await load(); } catch { setNotice('Cloud calendar and local status were saved, but refreshing failed. Reopen the trip.'); }
    });
  }, [plannerWorkspaceIdentity, getScope, selectedTrip, places, visits, legs, isPro, currentUserId, language, load, setNotice]);

  const handleRotateFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'calendar', selectedTrip.id);
    invalidatePublication(key);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      const storedTrip = (await plannerRepository.listTrips({ strict: true })).find((trip) => trip.id === selectedTrip.id);
      if (!storedTrip) throw new Error('Trip no longer exists.');
      const currentTrip = { ...storedTrip, calendar_feed: pendingTripFeedReceipts.current.get(`${workspaceIdentity}:${selectedTrip.id}`) ?? credentials.loadTripFeed(selectedTrip.id) ?? undefined };
      if (!currentTrip.calendar_feed) throw new Error('This workspace has no calendar publication credentials. Publish its own link first.');
      const response = await calendarFeedService.rotateFeed({
        trip: currentTrip,
        places,
        visits,
        membership: { isPro },
        userId: credentials.remoteUserId('calendar', selectedTrip.id, currentUserId),
        options: { language },
        legs,
      });
      pendingTripFeedReceipts.current.set(`${workspaceIdentity}:${selectedTrip.id}`, response.feed);
      assertPublicationWorkspace(workspaceIdentity);
      try {
        credentials.saveTripFeed(selectedTrip.id, response.feed);
        await plannerRepository.withWriteSession(async (bound) => {
          assertPublicationWorkspace(workspaceIdentity);
          await bound.patchTripCalendarFeed(selectedTrip.id, response.feed);
        });
      }
      catch { suspendPublication(key); throw new Error('The cloud calendar was updated, but its local record could not be saved. Retry publishing before closing this window.'); }
      resumePublication(key);
      pendingTripFeedReceipts.current.delete(`${workspaceIdentity}:${selectedTrip.id}`);
      try { await load(); } catch { setNotice('Cloud calendar and local status were saved, but refreshing failed. Reopen the trip.'); }
    });
  }, [plannerWorkspaceIdentity, getScope, selectedTrip, places, visits, legs, isPro, currentUserId, language, load, setNotice]);

  const handleDisableFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'calendar', selectedTrip.id);
    suspendPublication(key);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      const storedTrip = (await plannerRepository.listTrips({ strict: true })).find((trip) => trip.id === selectedTrip.id);
      if (!storedTrip) throw new Error('Trip no longer exists.');
      const currentTrip = { ...storedTrip, calendar_feed: pendingTripFeedReceipts.current.get(`${workspaceIdentity}:${selectedTrip.id}`) ?? credentials.loadTripFeed(selectedTrip.id) ?? undefined };
      if (!currentTrip.calendar_feed) throw new Error('This workspace has no calendar publication credentials. Imported links are not adopted automatically.');
      const updatedFeed = await calendarFeedService.disableFeed({
        trip: currentTrip,
        membership: { isPro },
        userId: credentials.remoteUserId('calendar', selectedTrip.id, currentUserId),
      });
      pendingTripFeedReceipts.current.set(`${workspaceIdentity}:${selectedTrip.id}`, updatedFeed);
      assertPublicationWorkspace(workspaceIdentity);
      try {
        credentials.saveTripFeed(selectedTrip.id, updatedFeed);
        await plannerRepository.withWriteSession(async (bound) => {
          assertPublicationWorkspace(workspaceIdentity);
          await bound.patchTripCalendarFeed(selectedTrip.id, updatedFeed);
        });
      }
      catch { throw new Error('The cloud calendar is disabled, but its local status could not be saved. Automatic updates are paused; retry disabling it.'); }
      pendingTripFeedReceipts.current.delete(`${workspaceIdentity}:${selectedTrip.id}`);
      try { await load(); } catch { setNotice('Cloud calendar and local status were saved, but refreshing failed. Reopen the trip.'); }
    });
  }, [plannerWorkspaceIdentity, getScope, selectedTrip, isPro, currentUserId, load, setNotice]);

  const handleCreateOrUpdateAccountFeed = useCallback(async () => {
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'account', currentUserId);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      if (disabled) throw new Error(zh ? '演示模式只读。' : 'Demo mode is read-only.');
      const response = await calendarFeedService.publishAccountFeed({
        trips,
        places,
        visits,
        membership: { isPro },
        userId: credentials.remoteUserId('account', currentUserId, currentUserId),
        // Reuse the stored token even when locally disabled: re-enabling then
        // resurrects the same URL instead of minting an orphan row per cycle.
        feedToken: (pendingAccountFeedReceipts.current.get(`${workspaceIdentity}:${currentUserId}`) ?? credentials.loadAccount(currentUserId))?.feed_token,
        options: { language },
        legs,
      });
      assertPublicationWorkspace(workspaceIdentity);
      const meta: AccountCalendarFeedMeta = {
        feed_token: response.feed.feed_token,
        updated_at: response.feed.updated_at,
        enabled: true,
      };
      pendingAccountFeedReceipts.current.set(`${workspaceIdentity}:${currentUserId}`, meta);
      if (publicationContext.current.currentUserId === currentUserId) setAccountReceipt({ owner: `${credentials.namespace}:${workspaceIdentity}:${currentUserId}`, meta });
      credentials.saveAccount(currentUserId, meta);
      if (credentials.loadAccount(currentUserId)?.feed_token !== meta.feed_token) {
        throw new Error(zh ? '云端日历已更新，但本地凭据保存失败。请勿刷新，在此窗口重试或停用。' : 'The cloud calendar was updated, but local credentials could not be saved. Stay in this window to retry or disable it.');
      }
      pendingAccountFeedReceipts.current.delete(`${workspaceIdentity}:${currentUserId}`);
      resumePublication(key);
      return response;
    });
  }, [plannerWorkspaceIdentity, getScope, trips, places, visits, legs, isPro, currentUserId, language, disabled, zh]);

  const handleRotateAccountFeed = useCallback(async () => {
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'account', currentUserId);
    invalidatePublication(key);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      if (disabled) throw new Error(zh ? '演示模式只读。' : 'Demo mode is read-only.');
      const response = await calendarFeedService.rotateAccountFeed({
        trips,
        places,
        visits,
        membership: { isPro },
        userId: credentials.remoteUserId('account', currentUserId, currentUserId),
        currentFeedToken: (pendingAccountFeedReceipts.current.get(`${workspaceIdentity}:${currentUserId}`) ?? credentials.loadAccount(currentUserId))?.feed_token,
        options: { language },
        legs,
      });
      assertPublicationWorkspace(workspaceIdentity);
      const meta: AccountCalendarFeedMeta = {
        feed_token: response.feed.feed_token,
        updated_at: response.feed.updated_at,
        enabled: true,
      };
      pendingAccountFeedReceipts.current.set(`${workspaceIdentity}:${currentUserId}`, meta);
      if (publicationContext.current.currentUserId === currentUserId) setAccountReceipt({ owner: `${credentials.namespace}:${workspaceIdentity}:${currentUserId}`, meta });
      credentials.saveAccount(currentUserId, meta);
      if (credentials.loadAccount(currentUserId)?.feed_token !== meta.feed_token) {
        throw new Error(zh ? '云端日历已更新，但本地凭据保存失败。请勿刷新，在此窗口重试或停用。' : 'The cloud calendar was updated, but local credentials could not be saved. Stay in this window to retry or disable it.');
      }
      pendingAccountFeedReceipts.current.delete(`${workspaceIdentity}:${currentUserId}`);
      resumePublication(key);
      return response;
    });
  }, [plannerWorkspaceIdentity, getScope, trips, places, visits, legs, isPro, currentUserId, language, disabled, zh]);

  const handleDisableAccountFeed = useCallback(async () => {
    const workspaceIdentity = plannerWorkspaceIdentity;
    const credentials = await getScope();
    const key = publicationKey(`${credentials.namespace}:${workspaceIdentity}`, 'account', currentUserId);
    suspendPublication(key);
    return queuePublication(key, async () => {
      assertPublicationWorkspace(workspaceIdentity);
      if (publicationContext.current.disabled || !publicationContext.current.isPro || publicationContext.current.currentUserId !== currentUserId) {
        throw new Error('Publication is unavailable: the workspace is read-only or membership changed.');
      }
      const liveMeta = pendingAccountFeedReceipts.current.get(`${workspaceIdentity}:${currentUserId}`) ?? credentials.loadAccount(currentUserId) ?? accountFeed;
      if (!liveMeta?.feed_token) return;
      await calendarFeedService.disableAccountFeed({
        membership: { isPro },
        userId: credentials.remoteUserId('account', currentUserId, currentUserId),
        feedToken: liveMeta.feed_token,
      });
      // Keep the token locally (enabled:false) so re-enabling resurrects the same URL.
      assertPublicationWorkspace(workspaceIdentity);
      const meta: AccountCalendarFeedMeta = { ...liveMeta, enabled: false, updated_at: new Date().toISOString() };
      pendingAccountFeedReceipts.current.set(`${workspaceIdentity}:${currentUserId}`, meta);
      if (publicationContext.current.currentUserId === currentUserId) setAccountReceipt({ owner: `${credentials.namespace}:${workspaceIdentity}:${currentUserId}`, meta });
      credentials.saveAccount(currentUserId, meta);
      if (credentials.loadAccount(currentUserId)?.enabled !== false) {
        throw new Error(zh ? '云端日历已停用，但本地状态保存失败。请重试停用。' : 'The cloud calendar is disabled, but its local status could not be saved. Retry disabling it.');
      }
      pendingAccountFeedReceipts.current.delete(`${workspaceIdentity}:${currentUserId}`);
    });
  }, [plannerWorkspaceIdentity, getScope, accountFeed, isPro, currentUserId, zh]);

  const copyItineraryText = useCallback(async () => {
    if (!selectedTrip || scheduled.length === 0) return;
    const lines = [
      `📅 ${selectedTrip.title} · ${activeDate}`,
      ...scheduled.map(
        (p, i) =>
          `${i + 1}. ${p.title}${p.area ? ` (${p.area})` : ''}${p.why ? `\n   💡 理由: ${p.why}` : ''}${p.notes ? `\n   📝 备注: ${p.notes}` : ''}${p.address ? `\n   📍 地址: ${p.address}` : ''}`,
      ),
    ];
    await navigator.clipboard.writeText(lines.join('\n\n'));
    setNotice(zh ? '已复制当天路线清单至剪贴板！' : 'Copied day itinerary to clipboard!');
  }, [selectedTrip, scheduled, activeDate, zh, setNotice]);

  const optimizeDayOrder = useCallback(
    async (date: string): Promise<PlannerDayOptimizationComputation | null> => {
      if (!selectedTrip) return null;
      const dayStops = sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === date));
      if (dayStops.length < 3) {
        setNotice(zh ? '至少需要 3 个已安排的游览点才能优化顺序。' : 'Need at least 3 scheduled stops to optimize the order.');
        return null;
      }
      // Same field-first, URL-fallback rule as the map: a stop counts as
      // geo-located when either the persisted field or the source URL yields it.
      const resolved = resolveStopCoordinates(dayStops);
      const missingCoords = resolved.filter((stop) => !stop.coords).map((stop) => stop.place.title);
      if (missingCoords.length > 0) {
        setNotice(zh
          ? `以下地点缺少坐标，无法估算路线：${missingCoords.join('、')}`
          : `Missing coordinates, cannot estimate routes: ${missingCoords.join(', ')}`);
        return null;
      }
      const stopsForCompute = materializeStopCoordinates(resolved);
      const mode: PlannerTravelMode = selectedTrip.transport_mode ?? 'transit';
      let ors: OrsMatrixFacts | null = null;
      let orsFallback: PlannerDayOptimizationComputation['orsFallback'];
      if (openRouteServiceProfile(mode)) {
        const apiKey = loadOrsApiKey();
        if (apiKey) {
          try {
            ors = await fetchOpenRouteServiceMatrix(
              apiKey,
              stopsForCompute.map((place) => ({ coordinates: place.coordinates as { lat: number; lng: number } })),
              mode,
            );
          } catch (error) {
            console.warn('[Planner] OpenRouteService matrix failed; falling back to heuristic estimates', error);
            orsFallback = 'request_failed';
          }
        } else {
          orsFallback = 'missing_key';
        }
      }
      const computation = computeDayOrderOptimization(selectedTrip, stopsForCompute, legs, ors);
      if (!computation) {
        setNotice(zh ? '当前顺序已是最优（按已知交通时间）。' : 'Current order is already optimal by known travel times.');
        return null;
      }
      if (orsFallback) computation.orsFallback = orsFallback;
      return computation;
    },
    [selectedTrip, scheduledAll, legs, setNotice, zh],
  );

  const applyDayOptimization = useCallback(
    async (computation: PlannerDayOptimizationComputation) => {
      if (!selectedTrip) return;
      const orderedVisitIds = computation.orderedPlaces.map((place) => place.id);
      const orderById = new Map(orderedVisitIds.map((id, order) => [id, order] as const));
      setVisits((prev) => prev.map((visit) => {
        const order = orderById.get(visit.id);
        return order === undefined ? visit : { ...visit, sort_order: order };
      }));
      if (computation.legsToWrite.length > 0) setLegs((prev) => mergeLegs(prev, computation.legsToWrite));
      try {
        for (const leg of computation.legsToWrite) {
          await plannerRepository.upsertLeg(leg);
        }
        await plannerRepository.reorderVisits(computation.date, orderedVisitIds);
      } catch (error) {
        showPersistError(error, 'apply optimized day order');
        await load();
        return;
      }
      await load();
      setNotice(zh
        ? `已按最优顺序重排，预计节省 ${computation.savedMinutes} 分钟交通时间。`
        : `Reordered optimally; about ${computation.savedMinutes} min of travel saved.`);
    },
    [selectedTrip, load, setVisits, setLegs, setNotice, showPersistError, zh],
  );

  const refreshTravelTimes = useCallback(
    async (scope: 'day' | 'trip', opts?: { silent?: boolean }) => {
      if (!selectedTrip || disabled) return;
      const trip = selectedTrip;
      const silent = opts?.silent ?? false;
      // Per-pair effective modes: a stored leg's mode wins, else the trip
      // default. A transit-default trip (e.g. TH26) no longer vetoes ORS for
      // pairs that carry their own routable mode.
      const defaultMode = trip.transport_mode ?? 'transit';
      const dates = scope === 'day' ? (activeDate ? [activeDate] : []) : tripDates;
      if (dates.length === 0) return;
      const anyRoutable = dates.some((date) => {
        const dayStops = sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === date));
        if (dayStops.length < 2) return false;
        for (const { mode, manual } of resolvePairEffectiveModes(trip.id, dayStops, legs, defaultMode).values()) {
          if (!manual && openRouteServiceProfile(mode)) return true;
        }
        return false;
      });
      if (!anyRoutable && !openRouteServiceProfile(defaultMode)) {
        if (!silent) setNotice(zh ? '当前交通方式无真实路网支持，保持距离估算。' : 'This travel mode has no road-network routing; keeping estimates.');
        return;
      }
      const apiKey = loadOrsApiKey();
      if (anyRoutable && !apiKey.trim()) {
        if (!silent) setNotice(zh ? '未配置 OpenRouteService key，保持距离估算。可在优化弹窗中填入。' : 'No OpenRouteService key configured; keeping estimates. Add one in the optimize dialog.');
        return;
      }
      setBusy(true);
      try {
        const allNewLegs: PlannerTripLeg[] = [];
        const total: DayTravelRefreshLedger = {
          updated: 0, manualSkipped: 0, keptEstimate: 0,
          missingCoordsSkipped: 0, samePlaceSkipped: 0, unroutableSkipped: 0,
        };
        let beforeMinutes = 0;
        let afterMinutes = 0;
        let daysWithPairs = 0;
        for (const date of dates) {
          const dayStops = sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === date));
          if (dayStops.length < 2) continue;
          const stopsForCompute = materializeStopCoordinates(resolveStopCoordinates(dayStops));
          const pairModes = resolvePairEffectiveModes(trip.id, stopsForCompute, legs, defaultMode);
          const matrixStops = stopsForCompute.filter((stop) => stop.coordinates);
          const orsByMode = new Map<PlannerTravelMode, OrsMatrixInput>();
          if (matrixStops.length >= 2) {
            const modesToFetch = new Set<PlannerTravelMode>();
            let needsMotorcycle = false;
            for (const { mode, manual } of pairModes.values()) {
              if (manual || !openRouteServiceProfile(mode)) continue;
              if (mode === 'motorcycle') needsMotorcycle = true;
              else modesToFetch.add(mode);
            }
            for (const mode of modesToFetch) {
              try {
                const facts = await fetchOpenRouteServiceMatrix(
                  apiKey,
                  matrixStops.map((stop) => ({ coordinates: stop.coordinates as { lat: number; lng: number } })),
                  mode,
                );
                orsByMode.set(mode, { order: matrixStops, facts });
              } catch (error) {
                console.warn('[Planner] Travel refresh matrix failed for', date, mode, '; keeping estimates', error);
              }
            }
            if (needsMotorcycle) {
              const motorcycle = await fetchMotorcyclePairMatrix(apiKey, stopsForCompute, matrixStops, pairModes);
              if (motorcycle) orsByMode.set('motorcycle', motorcycle);
            }
          }
          const result = computeDayTravelRefreshByMode(trip, stopsForCompute, legs, orsByMode, defaultMode);
          allNewLegs.push(...result.legs);
          total.updated += result.ledger.updated;
          total.manualSkipped += result.ledger.manualSkipped;
          total.keptEstimate += result.ledger.keptEstimate;
          total.missingCoordsSkipped += result.ledger.missingCoordsSkipped;
          total.samePlaceSkipped += result.ledger.samePlaceSkipped;
          total.unroutableSkipped += result.ledger.unroutableSkipped;
          beforeMinutes += result.beforeMinutes;
          afterMinutes += result.afterMinutes;
          daysWithPairs += 1;
        }
        if (allNewLegs.length > 0) setLegs((prev) => mergeLegs(prev, allNewLegs));
        try {
          for (const leg of allNewLegs) {
            await plannerRepository.upsertLeg(leg);
          }
        } catch (error) {
          showPersistError(error, 'refresh travel times');
          await load();
          return;
        }
        await load();
        const skipped: string[] = [];
        if (total.manualSkipped > 0) skipped.push(zh ? `手动锁定 ${total.manualSkipped} 段` : `${total.manualSkipped} manual`);
        if (total.keptEstimate > 0) skipped.push(zh ? `保持估算 ${total.keptEstimate} 段` : `${total.keptEstimate} kept`);
        if (total.missingCoordsSkipped > 0) skipped.push(zh ? `缺坐标 ${total.missingCoordsSkipped} 段` : `${total.missingCoordsSkipped} missing coords`);
        if (total.unroutableSkipped > 0) skipped.push(zh ? `不可达 ${total.unroutableSkipped} 段` : `${total.unroutableSkipped} unroutable`);
        if (total.samePlaceSkipped > 0) skipped.push(zh ? `同地 ${total.samePlaceSkipped} 段` : `${total.samePlaceSkipped} same-place`);
        const scopeLabel = scope === 'day' ? (zh ? '当天' : 'day') : (zh ? `${daysWithPairs} 天` : `${daysWithPairs} days`);
        if (total.updated === 0) {
          if (!silent) {
            setNotice(zh
              ? `无需刷新（${scopeLabel}）：${skipped.length > 0 ? skipped.join('、') : '没有可刷新的路段'}。`
              : `Nothing to refresh (${scopeLabel}): ${skipped.length > 0 ? skipped.join(', ') : 'no refreshable legs'}.`);
          }
          return;
        }
        const delta = afterMinutes - beforeMinutes;
        const deltaLabel = delta === 0
          ? (zh ? '持平' : 'unchanged')
          : (zh ? `${delta > 0 ? '+' : ''}${delta} 分钟` : `${delta > 0 ? '+' : ''}${delta} min`);
        if (!silent) {
          setNotice(zh
            ? `已刷新${scopeLabel}交通 ${beforeMinutes}→${afterMinutes} 分钟（${deltaLabel}），更新 ${total.updated} 段${skipped.length > 0 ? `；跳过：${skipped.join('、')}` : ''}。`
            : `Refreshed ${scopeLabel}: ${beforeMinutes}→${afterMinutes} min (${deltaLabel}), ${total.updated} legs updated${skipped.length > 0 ? `; skipped: ${skipped.join(', ')}` : ''}.`);
        }
      } finally {
        setBusy(false);
      }
    },
    [selectedTrip, disabled, activeDate, tripDates, scheduledAll, legs, setBusy, setLegs, showPersistError, load, setNotice, zh],
  );

  // ORS-by-default: there is no manual refresh button anymore. Whenever the
  // active day has routable pairs that still lack a persisted ORS leg, fetch
  // them silently in the background (debounced). Anything left over keeps its
  // heuristic estimate and the timeline marks it （估）/ (est.).
  const autoRefreshSigRef = useRef(new Map<string, string>());
  const autoRefreshTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedTrip || disabled || busy || !activeDate) return;
    const trip = selectedTrip;
    const defaultMode = trip.transport_mode ?? 'transit';
    const dayStops = sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === activeDate));
    if (dayStops.length < 2) return;
    const stopsForCompute = materializeStopCoordinates(resolveStopCoordinates(dayStops));
    const coordsByPlaceId = new Map(stopsForCompute.map((stop) => [(stop.place_id || stop.id), Boolean(stop.coordinates)]));
    const pairModes = resolvePairEffectiveModes(trip.id, dayStops, legs, defaultMode);
    const parts: string[] = [];
    let needsOrs = false;
    for (let index = 0; index + 1 < dayStops.length; index += 1) {
      const from = dayStops[index];
      const to = dayStops[index + 1];
      const fromPlaceId = from.place_id || from.id;
      const toPlaceId = to.place_id || to.id;
      const info = pairModes.get(travelPairKey(fromPlaceId, toPlaceId));
      if (!info) continue;
      const storedSource = legs.find(
        (item) => item.trip_id === trip.id && item.from_place_id === fromPlaceId && item.to_place_id === toPlaceId,
      )?.source;
      // Same-place pairs (e.g. morning checkout → evening stay) never get
      // road routing; the refresh computation skips them as well.
      const routable = !info.manual
        && fromPlaceId !== toPlaceId
        && openRouteServiceProfile(info.mode)
        && coordsByPlaceId.get(fromPlaceId) === true
        && coordsByPlaceId.get(toPlaceId) === true;
      if (routable && storedSource !== 'openrouteservice') needsOrs = true;
      parts.push(`${fromPlaceId}→${toPlaceId}|${info.mode}|${info.manual ? 'm' : 'a'}|${storedSource ?? '-'}|${routable ? 'r' : '-'}`);
    }
    if (!needsOrs) return;
    const signature = parts.join(';');
    if (autoRefreshSigRef.current.get(activeDate) === signature) return;
    if (!loadOrsApiKey().trim()) return;
    autoRefreshSigRef.current.set(activeDate, signature);
    if (autoRefreshTimerRef.current) window.clearTimeout(autoRefreshTimerRef.current);
    autoRefreshTimerRef.current = window.setTimeout(() => {
      void refreshTravelTimes('day', { silent: true });
    }, 900);
    return () => {
      if (autoRefreshTimerRef.current) window.clearTimeout(autoRefreshTimerRef.current);
    };
  }, [selectedTrip, disabled, busy, activeDate, scheduledAll, legs, refreshTravelTimes]);

  // Read-only previews still need navigation and calculations. Block mutations
  // centrally so a newly exposed control cannot turn a preview into an editor.
  function writable<Args extends unknown[]>(action: (...args: Args) => Promise<void>): (...args: Args) => Promise<void>;
  function writable<Args extends unknown[]>(action: (...args: Args) => void): (...args: Args) => void;
  function writable<Args extends unknown[]>(action: (...args: Args) => void | Promise<void>) {
    return disabled ? async () => {
      setNotice(zh ? '演示模式只读，请连接数据目录后编辑。' : 'Demo mode is read-only. Connect a data folder to edit.');
    } : (...args: Args) => action(...args);
  }

  return {
    handleUpsertTrip: writable(handleUpsertTrip),
    handleDeleteTrip: writable(handleDeleteTrip),
    handleToggleVisitLock: writable(handleToggleVisitLock),
    handleAddExpense: writable(handleAddExpense),
    handleUpdateExpense: writable(handleUpdateExpense),
    handleDeleteExpense: writable(handleDeleteExpense),
    handleUpdateMembers: writable(handleUpdateMembers),
    handleSwitchTravelMode: writable(handleSwitchTravelMode),
    handleClearTravelEstimate: writable(handleClearTravelEstimate),
    handleRecalculateTravelEstimate: writable(handleRecalculateTravelEstimate),
    refreshTravelTimes: writable(refreshTravelTimes),
    handleSelectHotelForStaySpan: writable(handleSelectHotelForStaySpan),
    handleUpdateFxRates: writable(handleUpdateFxRates),
    handleDropPlace: writable(handleDropPlace),
    handleRestorePlace: writable(handleRestorePlace),
    handleDeletePlace: writable(handleDeletePlace),
    handleDeduplicatePlaces: writable(handleDeduplicatePlaces),
    handleMergePair: writable(handleMergePair),
    handleIgnoreSuspectedPair: writable(handleIgnoreSuspectedPair),
    toggleSelectCandidate,
    handleSelectAllCandidates,
    handleDeselectAllCandidates,
    handleBatchDeleteCandidates: writable(handleBatchDeleteCandidates),
    handleBatchShelveCandidates: writable(handleBatchShelveCandidates),
    handleBatchScheduleCandidates: writable(handleBatchScheduleCandidates),
    handleBatchMergeCandidates: writable(handleBatchMergeCandidates),
    handleSavePlaceTiming: writable(handleSavePlaceTiming),
    handleChangePlaceKind: writable(handleChangePlaceKind),
    handleUpdatePlaceFields: writable(handleUpdatePlaceFields),
    schedulePlace: writable(schedulePlace),
    removeVisit: writable(removeVisit),
    moveScheduled: writable(moveScheduled),
    syncCapture: writable(syncCapture),
    handleSwapDays: writable(handleSwapDays),
    downloadKML,
    downloadCSV,
    downloadTripItineraryHtml,
    copyMarkdownItinerary,
    downloadFullIcs,
    downloadDayIcs,
    copyIcsContent,
    handleCreateOrUpdateFeed,
    handleRotateFeed,
    handleDisableFeed,
    accountFeed,
    handleCreateOrUpdateAccountFeed,
    handleRotateAccountFeed,
    handleDisableAccountFeed,
    legacyAccountOwners,
    recoverLegacyAccount,
    canRecoverTripFeed,
    recoverTripFeed,
    managedTripFeed,
    tripShareMeta,
    canRecoverLegacyShare,
    recoverLegacyShare,
    handlePublishTripShare,
    handleDisableTripShare,
    copyItineraryText,
    optimizeDayOrder,
    applyDayOptimization: writable(applyDayOptimization),
  };
}
