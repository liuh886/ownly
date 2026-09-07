'use client';

import { useCallback } from 'react';
import type {
  PlannerTravelMode,
  PlannerTrip,
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
  plannerTripLegId,
} from '@/domain/planner';
import {
  computeDayOrderOptimization,
  materializeStopCoordinates,
  resolveStopCoordinates,
  type OrsMatrixFacts,
  type PlannerDayOptimizationComputation,
} from '@/domain/planner-optimization';
import {
  fetchOpenRouteServiceMatrix,
  loadOrsApiKey,
  openRouteServiceProfile,
} from '@/lib/openrouteservice';
import { buildTripCalendarIcs, buildDayCalendarIcs } from '@/domain/calendar-feed';
import { plannerRepository } from '@/services/PlannerRepository';
import { calendarFeedService } from '@/services/CalendarFeedService';
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

async function restorePlaceSnapshot(snapshot: PlaceSnapshot): Promise<void> {
  if (snapshot.place) await plannerRepository.upsertPlace(snapshot.place);
  for (const visit of snapshot.visits) {
    await plannerRepository.upsertVisit(visit);
  }
  for (const leg of snapshot.legs) {
    await plannerRepository.upsertLeg(leg);
  }
}

export interface UsePlannerActionsProps {
  data: PlannerDataReturn;
  disabled: boolean;
}

export function usePlannerActions({ data, disabled }: UsePlannerActionsProps) {
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

  const showPersistError = useCallback((error: unknown, context: string) => {
    console.warn(`[Planner] Failed to ${context}`, error);
    setNotice(zh ? '保存失败，界面已还原，请重试。' : 'Save failed; the change was reverted. Please try again.');
  }, [setNotice, zh]);

  const showUndoNotice = useCallback((text: string, restore: () => Promise<void>) => {
    setNoticeAction({
      label: zh ? '撤销' : 'Undo',
      text,
      run: () => {
        void (async () => {
          try {
            await restore();
          } catch (error) {
            console.warn('[Planner] Undo restore failed', error);
          }
          await load();
        })();
      },
    });
    setNotice(text);
  }, [load, setNotice, setNoticeAction, zh]);

  const handleUpsertTrip = useCallback(
    async (newTrip: PlannerTrip) => {
      await plannerRepository.upsertTrip(newTrip);
      await load();
      setSelectedTripId(newTrip.id);
      setNotice(zh ? `已保存行程「${newTrip.title}」` : `Saved trip "${newTrip.title}"`);
    },
    [load, setSelectedTripId, setNotice, zh],
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
        setNotice(zh ? '费用保存失败，界面未写入未持久化数据。' : 'Expense save failed; the UI was not updated with unsaved data.');
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
          && item.from_place_id === fromPlaceId && item.to_place_id === toPlaceId
          && item.id !== clearedLeg.id,
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
        showUndoNotice(zh ? '已清除该段交通时间预估。' : 'Commute estimate cleared for this leg.', async () => {
          await plannerRepository.upsertLeg(previousLeg);
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
      const leg = calculateDefaultTripLeg(selectedTrip, from, to);
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
      setNotice(zh ? '已按当前行程默认交通方式重新计算。' : 'Commute estimate recalculated with the trip default mode.');
    },
    [selectedTrip, load, setLegs, setNotice, showPersistError, zh],
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
    (rates: Record<string, number>) => {
      if (!selectedTripId) return;
      setTrips((prev) => prev.map((t) => (t.id === selectedTripId ? { ...t, fx_rates: rates } : t)));
      const trip = trips.find((item) => item.id === selectedTripId);
      if (!trip) return;
      void plannerRepository
        .upsertTrip({ ...trip, fx_rates: rates, updated_at: new Date().toISOString() })
        .catch((error) => console.warn('[Planner] Failed to persist fx_rates', error));
    },
    [selectedTripId, trips, setTrips],
  );

  const handleDropPlace = useCallback(
    async (placeId: string) => {
      if (!placeId || disabled) return;
      try {
        await plannerRepository.dropPlace(placeId);
        await load();
        showUndoNotice(zh ? '已将地点设为暂不考虑' : 'Place shelved', async () => {
          await plannerRepository.restorePlace(placeId);
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
            showUndoNotice(zh ? '已彻底删除地点' : 'Place permanently deleted', async () => {
              await restorePlaceSnapshot(snapshot);
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
            showUndoNotice(zh ? `已彻底删除 ${succeededIds.length} 个地点` : `Deleted ${succeededIds.length} places`, async () => {
              for (const snapshot of snapshots) {
                await restorePlaceSnapshot(snapshot);
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
        scheduled_start?: string;
        duration_minutes?: number;
        is_anchor?: boolean;
        anchor_type?: PlannerScheduledPlace['anchor_type'];
      },
    ) => {
      setVisits((prev) => prev.map((visit) => {
        if (visit.id !== visitId) return visit;
        const next = { ...visit };
        if (timing.scheduled_start !== undefined) next.start = timing.scheduled_start;
        if (timing.duration_minutes !== undefined) next.duration_minutes = timing.duration_minutes;
        if (timing.is_anchor !== undefined) next.is_anchor = timing.is_anchor;
        if (timing.anchor_type !== undefined) next.anchor_type = timing.anchor_type;
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
      setNotice(zh ? '已更新行程时段与停留时长！' : 'Updated schedule timing and duration!');
    },
    [load, setNotice, setVisits, showPersistError, zh],
  );

  const schedulePlace = useCallback(
    async (placeId: string, date = activeDate) => {
      if (!date || disabled || isScheduling) return;
      setIsScheduling(true);
      try {
        await plannerRepository.addVisit(placeId, date);
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
        showUndoNotice(zh ? `已将「${place.title}」移出当天` : `Removed "${place.title}" from the day`, async () => {
          await plannerRepository.upsertVisit(snapshot);
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
        const placesToImport = pending.map((p) => ({
          ...p,
          trip_id: p.trip_id || targetTripId,
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
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTrip.title}_${activeDate}.kml`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '已导出 Google My Maps (KML) 路线文件！' : 'Exported Google My Maps (KML) route file!');
  }, [selectedTrip, scheduled, activeDate, zh, setNotice]);

  const downloadCSV = useCallback(() => {
    if (!selectedTrip || scheduled.length === 0) return;
    const csvContent = exportPlacesToCSV(scheduled);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
    const ics = buildTripCalendarIcs(selectedTrip, places, visits, { language });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTrip.title || 'trip'}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '✓ 已下载全行程 .ics 日历文件！' : '✓ Downloaded full trip .ics file!');
  }, [selectedTrip, places, visits, language, zh, setNotice]);

  const downloadDayIcs = useCallback(
    (date: string) => {
      if (!selectedTrip) return;
      const ics = buildDayCalendarIcs(selectedTrip, places, visits, date, { language });
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTrip.title || 'trip'}-${date}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(zh ? `✓ 已下载 ${date} 当天 .ics 日历文件！` : `✓ Downloaded day .ics file for ${date}!`);
    },
    [selectedTrip, places, visits, language, zh, setNotice],
  );

  const copyIcsContent = useCallback(async () => {
    if (!selectedTrip) return;
    const ics = buildTripCalendarIcs(selectedTrip, places, visits, { language });
    await navigator.clipboard.writeText(ics);
    setNotice(zh ? '✓ 已复制 RFC 5545 ICS 日历文本至剪贴板！' : '✓ Copied RFC 5545 ICS calendar text to clipboard!');
  }, [selectedTrip, places, visits, language, zh, setNotice]);

  const handleCreateOrUpdateFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const response = await calendarFeedService.publishFeed({
      trip: selectedTrip,
      places,
      visits,
      membership: { isPro },
      userId: currentUserId,
    });
    await plannerRepository.upsertTrip({
      ...selectedTrip,
      calendar_feed: response.feed,
    });
    await load();
  }, [selectedTrip, places, visits, isPro, currentUserId, load]);

  const handleRotateFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const response = await calendarFeedService.rotateFeed({
      trip: selectedTrip,
      places,
      visits,
      membership: { isPro },
      userId: currentUserId,
    });
    await plannerRepository.upsertTrip({
      ...selectedTrip,
      calendar_feed: response.feed,
    });
    await load();
  }, [selectedTrip, places, visits, isPro, currentUserId, load]);

  const handleDisableFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const updatedFeed = await calendarFeedService.disableFeed({
      trip: selectedTrip,
      membership: { isPro },
      userId: currentUserId,
    });
    await plannerRepository.upsertTrip({
      ...selectedTrip,
      calendar_feed: updatedFeed,
    });
    await load();
  }, [selectedTrip, isPro, currentUserId, load]);

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
          }
        }
      }
      const computation = computeDayOrderOptimization(selectedTrip, stopsForCompute, legs, ors);
      if (!computation) {
        setNotice(zh ? '当前顺序已是最优（按已知交通时间）。' : 'Current order is already optimal by known travel times.');
        return null;
      }
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

  return {
    handleUpsertTrip,
    handleDeleteTrip,
    handleToggleVisitLock,
    handleAddExpense,
    handleUpdateExpense,
    handleDeleteExpense,
    handleUpdateMembers,
    handleSwitchTravelMode,
    handleClearTravelEstimate,
    handleRecalculateTravelEstimate,
    handleSelectHotelForStaySpan,
    handleUpdateFxRates,
    handleDropPlace,
    handleRestorePlace,
    handleDeletePlace,
    handleDeduplicatePlaces,
    handleMergePair,
    handleIgnoreSuspectedPair,
    toggleSelectCandidate,
    handleSelectAllCandidates,
    handleDeselectAllCandidates,
    handleBatchDeleteCandidates,
    handleBatchShelveCandidates,
    handleBatchScheduleCandidates,
    handleBatchMergeCandidates,
    handleSavePlaceTiming,
    schedulePlace,
    removeVisit,
    moveScheduled,
    syncCapture,
    handleSwapDays,
    downloadKML,
    downloadCSV,
    copyMarkdownItinerary,
    downloadFullIcs,
    downloadDayIcs,
    copyIcsContent,
    handleCreateOrUpdateFeed,
    handleRotateFeed,
    handleDisableFeed,
    copyItineraryText,
    optimizeDayOrder,
    applyDayOptimization,
  };
}
