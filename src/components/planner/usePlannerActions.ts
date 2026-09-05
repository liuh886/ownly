'use client';

import { useCallback } from 'react';
import type {
  PlannerTravelMode,
  PlannerTrip,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseItem,
} from '@/domain/planner';
import type { PlannerScheduledPlace } from '@/domain/planner-visits';
import {
  calculateDefaultTripLeg,
  exportPlacesToCSV,
  exportPlacesToKML,
  exportTripToMarkdown,
  plannerTripLegId,
} from '@/domain/planner';
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
    setBusy,
    setTrips,
    setExpensesByTrip,
    setMembersByTrip,
    setSelectedTripId,
    setSelectedCandidateIds,
    setIsMultiSelectMode,
    setCapturePending,
  } = data;

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
      if (leg) {
        await plannerRepository.upsertLeg(leg);
        await load();
      }
    },
    [selectedTrip, load],
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
      await plannerRepository.upsertLeg(clearedLeg);
      await load();
      setNotice(zh ? '已清除该段交通时间预估。' : 'Commute estimate cleared for this leg.');
      setTimeout(() => setNotice(''), 3000);
    },
    [selectedTrip, load, setNotice, zh],
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
        setTimeout(() => setNotice(''), 4000);
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
        setNotice(zh ? '已将地点设为暂不考虑' : 'Place shelved');
        setTimeout(() => setNotice(''), 3000);
      } catch {
        setNotice(zh ? '该地点仍在行程中，请先从日程中移除已排访问。' : 'This place is still scheduled. Remove its visits first.');
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, load, setNotice, zh],
  );

  const handleRestorePlace = useCallback(
    async (placeId: string) => {
      if (!placeId || disabled) return;
      try {
        await plannerRepository.restorePlace(placeId);
        await load();
        setNotice(zh ? '已恢复为待考虑候选' : 'Place restored to candidates');
        setTimeout(() => setNotice(''), 3000);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, load, setNotice, zh],
  );

  const handleDeletePlace = useCallback(
    async (placeId: string, placeTitle?: string) => {
      if (!placeId || disabled) return;
      const confirmMsg = zh
        ? `确定要彻底删除地点「${placeTitle || '该地点'}」吗？删除后对应文件将被移除。`
        : `Are you sure you want to permanently delete "${placeTitle || 'this place'}"?`;
      if (!window.confirm(confirmMsg)) return;
      try {
        await plannerRepository.deletePlace(placeId);
        await load();
        setNotice(zh ? '已彻底删除地点' : 'Place permanently deleted');
        setTimeout(() => setNotice(''), 3000);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : zh ? '删除失败，若已排入日程请先移除日程' : 'Delete failed');
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, load, setNotice, zh],
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
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, load, selectedTripId, setNotice, zh]);

  const handleMergePair = useCallback(
    async (primaryId: string, secondaryId: string) => {
      if (!primaryId || !secondaryId || disabled) return;
      try {
        await plannerRepository.mergePlaces(primaryId, secondaryId);
        await load();
        setNotice(zh ? '已成功合并地点并更新关联日程！' : 'Places merged successfully!');
        setTimeout(() => setNotice(''), 3000);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setTimeout(() => setNotice(''), 4000);
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
        setTimeout(() => setNotice(''), 2500);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setTimeout(() => setNotice(''), 4000);
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
    const confirmMsg = zh
      ? `确定要彻底删除已选中的 ${count} 个地点吗？`
      : `Are you sure you want to permanently delete ${count} selected places?`;
    if (!window.confirm(confirmMsg)) return;
    setIsBatchOperating(true);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    try {
      for (const id of selectedCandidateIds) {
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
        setNotice(zh ? `已彻底删除 ${succeededIds.length} 个地点` : `Deleted ${succeededIds.length} places`);
      } else {
        setNotice(
          zh
            ? `已删除 ${succeededIds.length} 个地点，${failedIds.length} 个删除失败`
            : `Deleted ${succeededIds.length} places, ${failedIds.length} failed`,
        );
      }
      setTimeout(() => setNotice(''), 3500);
    } finally {
      setIsBatchOperating(false);
    }
  }, [disabled, isBatchOperating, load, selectedCandidateIds, setIsBatchOperating, setIsMultiSelectMode, setNotice, setSelectedCandidateIds, zh]);

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
      setTimeout(() => setNotice(''), 3500);
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
      setTimeout(() => setNotice(''), 3500);
    } finally {
      setIsBatchOperating(false);
    }
  }, [activeDate, disabled, isBatchOperating, load, selectedCandidateIds, setIsBatchOperating, setIsMultiSelectMode, setNotice, setSelectedCandidateIds, zh]);

  const handleBatchMergeCandidates = useCallback(async () => {
    if (selectedCandidateIds.size < 2 || disabled || isBatchOperating) return;
    const selectedPlaces = sortedPendingCandidates.filter((p) => selectedCandidateIds.has(p.id));
    if (selectedPlaces.length < 2) return;
    const primary = selectedPlaces[0];
    const confirmMsg = zh
      ? `确定将选中的 ${selectedPlaces.length} 个地点合并为「${primary.title}」吗？`
      : `Merge ${selectedPlaces.length} selected places into "${primary.title}"?`;
    if (!window.confirm(confirmMsg)) return;
    setIsBatchOperating(true);
    try {
      for (let i = 1; i < selectedPlaces.length; i++) {
        await plannerRepository.mergePlaces(primary.id, selectedPlaces[i].id);
      }
      await load();
      setSelectedCandidateIds(new Set());
      setIsMultiSelectMode(false);
      setNotice(zh ? `已成功合并为「${primary.title}」！` : `Merged into "${primary.title}"!`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    } finally {
      setIsBatchOperating(false);
    }
  }, [disabled, isBatchOperating, load, selectedCandidateIds, setIsBatchOperating, setIsMultiSelectMode, setNotice, setSelectedCandidateIds, sortedPendingCandidates, zh]);

  const handleSavePlaceTiming = useCallback(
    async (visitId: string, timing: { scheduled_start?: string; duration_minutes?: number }) => {
      await plannerRepository.updateVisitTiming(visitId, { start: timing.scheduled_start, duration_minutes: timing.duration_minutes });
      await load();
      setNotice(zh ? '已更新行程时段与停留时长！' : 'Updated schedule timing and duration!');
      setTimeout(() => setNotice(''), 3000);
    },
    [load, setNotice, zh],
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
        setTimeout(() => setNotice(''), 3500);
      } finally {
        setIsScheduling(false);
      }
    },
    [activeDate, disabled, isScheduling, load, setIsScheduling, setNotice],
  );

  const removeVisit = useCallback(
    async (place: PlannerScheduledPlace) => {
      await plannerRepository.removeVisit(place.visit_id);
      await load();
    },
    [load],
  );

  const moveScheduled = useCallback(
    async (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= scheduled.length) return;
      const orderedIds = scheduled.map((p) => p.id);
      const [moved] = orderedIds.splice(index, 1);
      orderedIds.splice(targetIndex, 0, moved);
      await plannerRepository.reorderVisits(activeDate, orderedIds);
      await load();
    },
    [activeDate, load, scheduled],
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
    setTimeout(() => setNotice(''), 3000);
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
    setTimeout(() => setNotice(''), 3500);
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
      setTimeout(() => setNotice(''), 3500);
    },
    [selectedTrip, places, visits, language, zh, setNotice],
  );

  const copyIcsContent = useCallback(async () => {
    if (!selectedTrip) return;
    const ics = buildTripCalendarIcs(selectedTrip, places, visits, { language });
    await navigator.clipboard.writeText(ics);
    setNotice(zh ? '✓ 已复制 RFC 5545 ICS 日历文本至剪贴板！' : '✓ Copied RFC 5545 ICS calendar text to clipboard!');
    setTimeout(() => setNotice(''), 3500);
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

  return {
    handleUpsertTrip,
    handleDeleteTrip,
    handleToggleVisitLock,
    handleAddExpense,
    handleDeleteExpense,
    handleUpdateMembers,
    handleSwitchTravelMode,
    handleClearTravelEstimate,
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
  };
}
