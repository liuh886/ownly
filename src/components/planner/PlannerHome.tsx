'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type PlannerScheduledPlace } from '@/domain/planner-visits';
import {
  buildGoogleMapsRouteUrl,
  effectiveFxRate,
  formatPlacePriceInTripCurrency,
} from '@/domain/planner';
import type { PlannerTimelineStopItem } from '@/domain/planner-schedule';
import type { PlannerDayOptimizationComputation } from '@/domain/planner-optimization';
import { AppInstallGuideModal } from '@/components/pwa/AppInstallGuideModal';
import { PlannerMap } from './PlannerMap';
import { HotelComparisonModal } from './HotelComparisonModal';
import { ImportCandidatesModal } from './ImportCandidatesModal';
import { PlaceTimingModal } from './PlaceTimingModal';
import { ConfirmDialog } from './ConfirmDialog';
import { formatDay } from './planner-home-shared';
import { CreateTripModal } from './CreateTripModal';
import { PlannerDateNav } from './PlannerDateNav';
import { PlannerDayTimeline } from './PlannerDayTimeline';
import { PlannerRightPanel } from './PlannerRightPanel';
import { ResearchPoolSection } from './ResearchPoolSection';
import { SwapDaysModal } from './SwapDaysModal';
import { useEscapeKey } from './use-escape-key';
import { extractTripSharePayload } from '@/domain/trip-share-link';
import { CalendarSubscriptionModal } from './CalendarSubscriptionModal';
import { TripReviewModal } from './TripReviewModal';
import { isTripReviewable, type TripReviewDraft } from '@/domain/trip-review';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { OptimizeOrderModal } from './OptimizeOrderModal';
import { DayRiskSummary } from './PlannerDayStatsPanel';
import { usePlannerController } from './usePlannerController';

interface PlannerHomeProps {
  disabled: boolean;
}


export function PlannerHome({ disabled }: PlannerHomeProps) {  const ctrl = usePlannerController({ disabled });

  const [guideOpen, setGuideOpen] = useState(false);
  const [draggingPlaceId, setDraggingPlaceId] = useState<string | null>(null);
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'map' | 'context' | 'budget'>('map');
  const [poolView, setPoolView] = useState(false);
  const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);
  const [activeModeSwitchPair, setActiveModeSwitchPair] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  // Shared viewport for the sidebar + expanded map instances (single writer:
  // whichever instance is currently visible). Survives big-map mount/unmount.
  const mapViewRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  useEscapeKey(exportMenuOpen, () => setExportMenuOpen(false));
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
  useEscapeKey(refreshMenuOpen, () => setRefreshMenuOpen(false));
  const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isSuspectedModalOpen, setIsSuspectedModalOpen] = useState(false);
  const [timingModalPlace, setTimingModalPlace] = useState<PlannerScheduledPlace | null>(null);
  const [draggingDate, setDraggingDate] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isSwapDaysModalOpen, setIsSwapDaysModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [swapTargetDate, setSwapTargetDate] = useState<string>('');
  const [budgetInitialPlaceId, setBudgetInitialPlaceId] = useState<string | null>(null);
  const [optimizeBusy, setOptimizeBusy] = useState(false);
  const [optimizeComputation, setOptimizeComputation] = useState<PlannerDayOptimizationComputation | null>(null);

  // Incoming trip share link: offer it once per hash value by opening the
  // manage-trips modal on its import tab (the modal decodes + imports).
  const [shareHash, setShareHash] = useState<string | null>(null);
  const offeredShareHashRef = useRef<string | null>(null);
  useEffect(() => {
    const syncShareHash = () => {
      if (typeof window === 'undefined') return;
      const payload = extractTripSharePayload(window.location.hash);
      if (payload && offeredShareHashRef.current !== payload) {
        offeredShareHashRef.current = payload;
        setShareHash(payload);
        setIsCreateTripOpen(true);
      }
    };
    syncShareHash();
    window.addEventListener('hashchange', syncShareHash);
    return () => window.removeEventListener('hashchange', syncShareHash);
  }, []);

  const {
    language,
    zh,
    trips,
    selectedTripId,
    setSelectedTripId,
    setSelectedDate,
    activeFilter,
    setActiveFilter,
    tripDates,
    activeDate,
    capturePending,
    busy,
    notice,
    setNotice,
    noticeAction,
    setNoticeAction,
    confirmRequest,
    setConfirmRequest,
    isPro,
    openLicenseModal,
    currentExpenses,
    currentMembers,
    selectedTrip,
    activeDayIndex,
    dateNavRef,
    tripPlaces,
    tripVisits,
    visitCountByPlaceId,
    visibleSuspectedPairs,
    pendingCandidates,
    droppedPlaces,
    filterChips,
    candidateSortMode,
    setCandidateSortMode,
    scheduledAll,
    scheduled,
    legs,
    mapScheduled,
    dayAssessment,
    dayTimeline,
    candidateDistances,
    lastScheduledStop,
    lastStopCoords,
    sortedPendingCandidates,
    candidateHotels,
    placesByDate,
    transferDaysInfo,
    currentDayTransferInfo,
    areaCounts,
    maxAreaCount,
    mustTotal,
    mustScheduled,
    scheduledMinutes,
    daysOut,
    weatherRelevant,
    weather,
    urgencies,
    activeDayWeather,
    isMultiSelectMode,
    setIsMultiSelectMode,
    selectedCandidateIds,
    setSelectedCandidateIds,
    poolSearch,
    setPoolSearch,
    isBatchOperating,
    load,
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
    handleChangePlaceKind,
    schedulePlace,
    removeVisit,
    moveScheduled,
    syncCapture,
    handleSwapDays,
    downloadKML,
    downloadCSV,
    downloadTripSnapshot,
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
    refreshTravelTimes,
  } = ctrl;

  // WS-1 trip retrospective: draft lives in TripReviewModal (preview-only);
  // confirm persists via the standard object path, then backlinks review_id.
  const { repository } = useOwnlyWorkspace();
  const reviewable = selectedTrip ? isTripReviewable(selectedTrip) : false;
  const tripStatusLabel = !selectedTrip
    ? ''
    : selectedTrip.status === 'completed'
      ? zh ? '已完结' : 'Completed'
      : selectedTrip.status === 'active'
        ? zh ? '进行中' : 'Active'
        : zh ? '规划中' : 'Planning';

  const markTripComplete = useCallback(() => {
    if (!selectedTrip) return;
    setConfirmRequest({
      title: zh ? '标记行程完结？' : 'Mark trip complete?',
      message: zh
        ? `「${selectedTrip.title}」将标记为完结，随后可一键生成复盘草稿。`
        : `"${selectedTrip.title}" will be marked complete, unlocking the retrospective draft.`,
      confirmLabel: zh ? '标记完结' : 'Mark complete',
      run: () => {
        void handleUpsertTrip({ ...selectedTrip, status: 'completed' });
      },
    });
  }, [selectedTrip, handleUpsertTrip, setConfirmRequest, zh]);

  const confirmTripReview = useCallback(async (draft: TripReviewDraft) => {
    if (!selectedTrip) return;
    setReviewBusy(true);
    try {
      await repository.saveObject(draft.object, draft.body);
      await handleUpsertTrip({ ...selectedTrip, review_id: draft.object.id });
      setIsReviewModalOpen(false);
      setNotice(zh
        ? `复盘草稿已生成，可在「复盘」页补评分。`
        : `Retrospective draft saved; add scores in the Reviews tab.`);
    } catch {
      setNotice(zh ? '复盘草稿保存失败，未写入任何数据。' : 'Failed to save the draft; nothing was written.');
    } finally {
      setReviewBusy(false);
    }
  }, [selectedTrip, repository, handleUpsertTrip, setNotice, zh]);

  const poolSectionProps = {
    zh,
    language,
    sortedPendingCandidates,
    pendingCandidates,
    droppedPlaces,
    activeFilter,
    setActiveFilter,
    filterChips,
    poolSearch,
    setPoolSearch,
    candidateSortMode,
    setCandidateSortMode,
    lastStopCoords,
    lastScheduledStop,
    capturePending,
    busy,
    syncCapture,
    candidateHotels,
    visibleSuspectedPairs,
    isMultiSelectMode,
    setIsMultiSelectMode,
    selectedCandidateIds,
    setSelectedCandidateIds,
    isBatchOperating,
    handleDeduplicatePlaces,
    handleSelectAllCandidates,
    handleDeselectAllCandidates,
    handleBatchMergeCandidates,
    handleBatchScheduleCandidates,
    handleBatchShelveCandidates,
    handleBatchDeleteCandidates,
    toggleSelectCandidate,
    candidateDistances,
    visitCountByPlaceId,
    selectedTrip,
    schedulePlace,
    handleDropPlace,
    handleDeletePlace,
    handleRestorePlace,
    handleChangePlaceKind,
    highlightedPlaceId,
    setHighlightedPlaceId,
    setDraggingPlaceId,
    setGuideOpen,
    setIsImportModalOpen,
    setIsHotelModalOpen,
    setIsSuspectedModalOpen,
    disabled,
  };

  // Built once here; both map instances share it for segment time badges.
  const legByPair = useMemo(() => new Map(
    legs.filter((leg) => leg.trip_id === selectedTripId).map((leg) => [leg.id, leg] as const),
  ), [legs, selectedTripId]);

  const rightPanelProps = {
    zh,
    language,
    rightTab,
    setRightTab,
    setIsMapExpanded,
    sharedViewRef: mapViewRef,
    ownsSharedView: !isMapExpanded,
    mapScheduled,
    sortedPendingCandidates,
    placesByDate,
    legByPair,
    tripId: selectedTripId,
    tripDates,
    // Rendered only after the empty-trip early return, so the trip is non-null here.
    selectedTrip: selectedTrip!,
    activeDate,
    activeDayIndex,
    highlightedPlaceId,
    schedulePlace,
    removeVisit,
    handleDropPlace,
    handleDeletePlace,
    setHighlightedPlaceId,
    visitCountByPlaceId,
    scheduled,
    tripPlaces,
    budgetInitialPlaceId,
    onClearInitialPlaceId: () => setBudgetInitialPlaceId(null),
    currentExpenses,
    handleAddExpense,
    handleUpdateExpense,
    handleDeleteExpense,
    currentMembers,
    handleUpdateMembers,
    handleUpdateFxRates,
    dayAssessment,
    pendingCandidates,
    droppedPlaces,
    mustScheduled,
    mustTotal,
    scheduledMinutes,
    areaCounts,
    maxAreaCount,
  };

  const dateNavProps = {
    zh,
    language,
    dateNavRef,
    poolView,
    setPoolView,
    sortedPendingCandidates,
    tripDates,
    activeDate,
    placesByDate,
    setSelectedDate,
    draggingDate,
    setDraggingDate,
    dragOverDate,
    setDragOverDate,
    handleSwapDays,
    setSwapTargetDate,
    setIsSwapDaysModalOpen,
    selectedTrip,
    urgencies,
    daysOut,
    weatherRelevant,
    weather,
  };

  // One-click direct send from the Capture sidepanel (?capture-sync=1):
  // run the standard sync once, then strip the param so reloads stay quiet.
  const captureSyncRanRef = useRef(false);
  useEffect(() => {
    if (captureSyncRanRef.current || disabled) return;
    let params: URLSearchParams | null = null;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    if (params.get('capture-sync') !== '1') return;
    captureSyncRanRef.current = true;
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    } catch {}
    void syncCapture();
  }, [disabled, syncCapture]);

  // Multi-day keyboard navigation: [ / ] or ArrowLeft / ArrowRight to switch days
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        timingModalPlace ||
        isSwapDaysModalOpen ||
        isCreateTripOpen ||
        guideOpen ||
        isHotelModalOpen ||
        isImportModalOpen ||
        isCalendarModalOpen ||
        isSuspectedModalOpen ||
        isMapExpanded ||
        poolView ||
        optimizeComputation ||
        confirmRequest
      ) {
        return;
      }
      if (!tripDates || tripDates.length <= 1) return;

      if (e.key === '[' || e.key === 'ArrowLeft') {
        if (activeDayIndex > 0) {
          e.preventDefault();
          setSelectedDate(tripDates[activeDayIndex - 1]);
        }
      } else if (e.key === ']' || e.key === 'ArrowRight') {
        if (activeDayIndex < tripDates.length - 1) {
          e.preventDefault();
          setSelectedDate(tripDates[activeDayIndex + 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeDayIndex,
    tripDates,
    setSelectedDate,
    timingModalPlace,
    isSwapDaysModalOpen,
    isCreateTripOpen,
    guideOpen,
    isHotelModalOpen,
    isImportModalOpen,
    isCalendarModalOpen,
    isSuspectedModalOpen,
    isMapExpanded,
    poolView,
    optimizeComputation,
    confirmRequest,
  ]);

  const runOptimizeOrder = () => {
    if (optimizeBusy || !selectedTrip) return;
    setOptimizeBusy(true);
    void (async () => {
      try {
        const computation = await optimizeDayOrder(activeDate);
        if (computation) setOptimizeComputation(computation);
      } finally {
        setOptimizeBusy(false);
      }
    })();
  };

  const expensesByPlace = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    if (!selectedTrip) return map;
    const fx = { base: selectedTrip.currency || 'USD', overrides: selectedTrip.fx_rates };
    for (const exp of currentExpenses) {
      const rate = effectiveFxRate(exp.currency, fx);
      const amountInBase = rate === null ? exp.amount : exp.amount * rate;
      if (exp.place_id) {
        const prev = map.get(exp.place_id) ?? { total: 0, count: 0 };
        map.set(exp.place_id, {
          total: Math.round((prev.total + amountInBase) * 100) / 100,
          count: prev.count + 1,
        });
      }
      const titleKey = exp.title.trim().toLowerCase();
      if (titleKey) {
        const prevTitle = map.get(titleKey) ?? { total: 0, count: 0 };
        map.set(titleKey, {
          total: Math.round((prevTitle.total + amountInBase) * 100) / 100,
          count: prevTitle.count + 1,
        });
      }
    }
    return map;
  }, [currentExpenses, selectedTrip]);

  const hotelStayDaysMap = useMemo(() => {
    const datesByPlaceId = new Map<string, Set<string>>();
    const datesByTitle = new Map<string, Set<string>>();

    // Count genuine overnight stay dates from transferDaysInfo
    for (const [date, info] of Object.entries(transferDaysInfo)) {
      const stayPlace = info.stayHotel;
      if (stayPlace) {
        const placeId = stayPlace.place_id || stayPlace.id;
        if (placeId) {
          if (!datesByPlaceId.has(placeId)) datesByPlaceId.set(placeId, new Set());
          datesByPlaceId.get(placeId)!.add(date);
        }
        const titleKey = stayPlace.title?.trim().toLowerCase();
        if (titleKey) {
          if (!datesByTitle.has(titleKey)) datesByTitle.set(titleKey, new Set());
          datesByTitle.get(titleKey)!.add(date);
        }
      }
    }

    // Fallback: if transferDaysInfo found no stayHotel, scan scheduledAll with kind === 'stay' and not checkout
    if (datesByPlaceId.size === 0 && datesByTitle.size === 0) {
      for (const sp of scheduledAll) {
        if (sp.kind === 'stay' && sp.anchor_type !== 'stay_checkout') {
          const placeId = sp.place_id || sp.id;
          if (placeId) {
            if (!datesByPlaceId.has(placeId)) datesByPlaceId.set(placeId, new Set());
            datesByPlaceId.get(placeId)!.add(sp.scheduled_date);
          }
          const titleKey = sp.title?.trim().toLowerCase();
          if (titleKey) {
            if (!datesByTitle.has(titleKey)) datesByTitle.set(titleKey, new Set());
            datesByTitle.get(titleKey)!.add(sp.scheduled_date);
          }
        }
      }
    }

    return {
      getDays: (place: { id: string; place_id?: string; title: string; kind?: string }): number => {
        const pId = place.place_id || place.id;
        const byId = datesByPlaceId.get(pId)?.size;
        if (byId && byId > 0) return byId;
        const byTitle = datesByTitle.get(place.title?.trim().toLowerCase())?.size;
        if (byTitle && byTitle > 0) return byTitle;
        return 1;
      },
    };
  }, [transferDaysInfo, scheduledAll]);

  // Aggregated after the local memos above (expensesByPlace, hotelStayDaysMap).
  // Rendered only after the empty-trip early return below, so the trip is non-null here.
  const dayTimelineProps = {
    zh,
    scheduled,
    draggingPlaceId,
    dayAssessment,
    dayTimeline,
    highlightedPlaceId,
    setHighlightedPlaceId,
    currentDayTransferInfo,
    // Rendered only after the empty-trip early return, so the trip is non-null here.
    selectedTrip: selectedTrip!,
    expensesByPlace,
    hotelStayDaysMap,
    setTimingModalPlace,
    setBudgetInitialPlaceId,
    setRightTab,
    handleToggleVisitLock,
    moveScheduled,
    removeVisit,
    activeModeSwitchPair,
    setActiveModeSwitchPair,
    handleSwitchTravelMode,
    handleClearTravelEstimate,
    handleRecalculateTravelEstimate,
  };

  if (disabled) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
        {zh ? '连接 Ownly 本地数据目录后即可使用 Planner。' : 'Connect your Ownly data folder to use Planner.'}
      </section>
    );
  }

  if (!selectedTrip) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✈️</span>
            <h2 className="text-xl font-bold tracking-tight text-stone-950">
              {zh ? '规划你的旅行行程' : 'Plan Your Travel Itinerary'}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            {zh
              ? '在本地安全创建行程，设置目的地与出行日期。选定行程后，可在地图采集候选地点并由 Planner 统一排期与推演。'
              : 'Create a local trip with destinations and dates. Your selected trip acts as the authority for place research and timeline optimization.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreateTripOpen(true)}
              className="rounded-lg bg-stone-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-stone-800"
            >
              {zh ? '行程管理' : 'Manage Trips'}
            </button>
          </div>
          {notice ? <p className="mt-3 text-xs text-stone-500">{notice}</p> : null}
        </div>
        <CreateTripModal
          key={isCreateTripOpen ? 'open' : 'closed'}
          open={isCreateTripOpen}
          onClose={() => setIsCreateTripOpen(false)}
          trips={trips}
          onCreate={handleUpsertTrip}
          onImported={(tripId) => {
            void load();
            setSelectedTripId(tripId);
          }}
          onDeleteTrip={handleDeleteTrip}
          language={language}
          disabled={disabled}
          incomingShareHash={shareHash}
          onDismissShare={() => setShareHash(null)}
        />
      </section>
    );
  }

  return (
    <section className="space-y-3.5">
      <header className="flex flex-col gap-3 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <select
                value={selectedTripId}
                onChange={(event) => {
                  setSelectedTripId(event.target.value);
                  setActiveFilter('all');
                  setSelectedCandidateIds(new Set());
                  setIsMultiSelectMode(false);
                  setPoolSearch('');
                }}
                className="max-w-full rounded-xl border border-stone-300 bg-stone-50/80 px-3.5 py-2 text-sm font-bold text-stone-900 shadow-2xs outline-none transition focus:border-stone-900 focus:bg-white cursor-pointer"
                aria-label={zh ? '选择行程' : 'Select trip'}
              >
                {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateTripOpen(true)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-950 active:scale-98"
              title={zh ? '管理行程（新建/删除）' : 'Manage trips'}
            >
              {zh ? '行程管理' : 'Manage Trips'}
            </button>
            <button
              type="button"
              onClick={() => { if (selectedTrip.status !== 'completed') markTripComplete(); }}
              title={selectedTrip.status === 'completed'
                ? (zh ? '行程已完结' : 'Trip completed')
                : (zh ? '点击标记行程完结' : 'Click to mark the trip complete')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
                selectedTrip.status === 'completed'
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-stone-100/80 text-stone-500 hover:bg-stone-200/80 hover:text-stone-800'
              }`}
            >
              <span>{selectedTrip.status === 'completed' ? '✅' : '○'}</span>
              <span>{tripStatusLabel}</span>
            </button>
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100/80 px-2.5 py-1 text-xs font-medium text-stone-600">
              <span>📅</span>
              <span>{selectedTrip.start_date} → {selectedTrip.end_date}</span>
              <span className="text-stone-400">·</span>
              <span>{tripDates.length}{zh ? '天' : 'd'}</span>
              <span className="text-stone-400">·</span>
              <span>{tripPlaces.length} {zh ? '地点' : 'places'}</span>
              <span className="text-stone-400">·</span>
              <span>{tripVisits.length} {zh ? '行程' : 'visits'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCalendarModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs font-bold text-amber-900 shadow-2xs transition hover:bg-amber-100 hover:border-amber-400 active:scale-98"
            title={zh ? '导出 .ics 日历文件或设置 Google/Apple Calendar 持续订阅源' : 'Export .ics or setup Google/Apple Calendar Feed'}
          >
            <span>📅</span>
            <span>{zh ? '日历' : 'Calendar'}</span>
            {selectedTrip?.calendar_feed?.enabled ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => void copyMarkdownItinerary()}
            className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-900 active:scale-98"
            title={zh ? '一键复制 Markdown 完整行程单至剪贴板' : 'Copy complete Markdown itinerary to clipboard'}
          >
            <span>📋</span>
            <span>{zh ? '行程单' : 'Copy'}</span>
          </button>
          {reviewable ? (
            <button
              type="button"
              onClick={() => { if (!selectedTrip.review_id) setIsReviewModalOpen(true); }}
              disabled={Boolean(selectedTrip.review_id)}
              className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-900 active:scale-98 disabled:cursor-default disabled:opacity-60"
              title={selectedTrip.review_id
                ? (zh ? '已生成复盘，可在对象页查看' : 'Retrospective already created; see Objects')
                : (zh ? '行程结束，一键生成复盘草稿' : 'Generate a retrospective draft')}
            >
              <span>{selectedTrip.review_id ? '✅' : '📝'}</span>
              <span>{zh ? '复盘' : 'Review'}</span>
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div aria-live="polite" className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 shadow-2xs animate-in fade-in duration-150">
          <span className="min-w-0 flex-1">{notice}</span>
          {noticeAction && noticeAction.text === notice ? (
            <button
              type="button"
              onClick={() => {
                const run = noticeAction.run;
                setNotice('');
                setNoticeAction(null);
                run();
              }}
              className="shrink-0 rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800 transition"
            >
              {noticeAction.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setNotice('');
              setNoticeAction(null);
            }}
            className="shrink-0 rounded p-0.5 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-900 transition"
            title={zh ? '关闭提示' : 'Dismiss'}
          >
            ✕
          </button>
        </div>
      ) : null}

      {confirmRequest ? (
        <ConfirmDialog
          zh={zh}
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          onConfirm={() => {
            const run = confirmRequest.run;
            setConfirmRequest(null);
            void run();
          }}
          onClose={() => setConfirmRequest(null)}
        />
      ) : null}

      <PlannerDateNav {...dateNavProps} />

      <div className={poolView ? 'grid gap-4 grid-cols-1' : 'grid gap-4 grid-cols-1 lg:grid-cols-[minmax(340px,1fr)_minmax(0,3fr)]'}>
        {poolView ? (
          <div className="min-w-0">
            <ResearchPoolSection {...poolSectionProps} className="w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm flex flex-col transition-all" />
          </div>
        ) : null}
        <section
          className={poolView ? 'hidden' : 'min-w-0 rounded-xl border border-stone-200 bg-white shadow-sm flex flex-col'}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain') || draggingPlaceId;
            if (id) void schedulePlace(id);
            setDraggingPlaceId(null);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">{zh ? '执行时间线' : 'Execution Timeline'}</h2>
                <p className="text-[11px] text-stone-400">{activeDate} · {scheduled.length} {zh ? '个游览点' : 'stops'}</p>
              </div>
              {dayAssessment.status !== 'unknown' ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  dayAssessment.status === 'feasible'
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    : dayAssessment.status === 'conflict'
                      ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                      : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                }`}>
                  {dayAssessment.status === 'feasible'
                    ? (zh ? '可执行' : 'Feasible')
                    : dayAssessment.status === 'conflict'
                      ? (zh ? '有冲突' : 'Conflict')
                      : (zh ? '需注意' : 'Warning')}
                </span>
              ) : null}
            </div>
            {activeDayWeather ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeDayWeather.is_rainy
                    ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-300'
                    : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                }`}
                title={zh
                  ? `${activeDayWeather.temp_min}°C ~ ${activeDayWeather.temp_max}°C · 降水 ${activeDayWeather.precipitation_mm}mm`
                  : `${activeDayWeather.temp_min}°C ~ ${activeDayWeather.temp_max}°C · ${activeDayWeather.precipitation_mm}mm precip`}
              >
                {activeDayWeather.label} {activeDayWeather.temp_min}°~{activeDayWeather.temp_max}°
                {activeDayWeather.is_rainy ? (zh ? ' 🌧️ 有雨' : ' 🌧️ Rain') : ''}
              </span>
            ) : null}
            {scheduled.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <a
                  href={buildGoogleMapsRouteUrl(scheduled, 'driving')}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '驾车路线' : 'Driving Route'}
                >
                  🚗
                </a>
                <a
                  href={buildGoogleMapsRouteUrl(scheduled, 'walking')}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '步行路线' : 'Walking Route'}
                >
                  🚶
                </a>
                <div className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((prev) => !prev)}
                    className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                    title={zh ? '导出存档（KML / CSV / 文本）' : 'Export archive (KML / CSV / text)'}
                    aria-expanded={exportMenuOpen}
                  >
                    📦 {zh ? '导出' : 'Export'} ▾
                  </button>
                  {exportMenuOpen ? (
                    <>
                      <div className="fixed inset-0 z-40 cursor-default" onClick={() => setExportMenuOpen(false)} />
                      <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-xl">
                        <button
                          type="button"
                          onClick={() => { setExportMenuOpen(false); downloadKML(); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title={zh ? '导出 KML (用于导入 Google 我的地图)' : 'Export KML for Google My Maps'}
                        >
                          📍 KML
                        </button>
                        <button
                          type="button"
                          onClick={() => { setExportMenuOpen(false); downloadCSV(); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title={zh ? '导出 CSV (用于导入 Google 表格或自定义地图)' : 'Export CSV'}
                        >
                          📊 CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => { setExportMenuOpen(false); void copyItineraryText(); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title={zh ? '复制路线文字清单' : 'Copy itinerary text'}
                        >
                          📋 {zh ? '复制文本' : 'Copy text'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setExportMenuOpen(false); downloadTripSnapshot(false); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title={zh ? '导出手机快照（不含费用），传到手机后在 /trip 页只读打开' : 'Export phone snapshot (no expenses); open read-only on the /trip page'}
                        >
                          📱 {zh ? '手机快照' : 'Snapshot'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setExportMenuOpen(false); downloadTripSnapshot(true); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title={zh ? '导出含费用的手机快照——费用将随文件流转，请确认知晓' : 'Export snapshot WITH expenses — expenses travel with the file, confirm you understand'}
                        >
                          📱 {zh ? '快照（含费用）' : 'Snapshot + costs'}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setIsCalendarModalOpen(true)}
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '日历导出与订阅 (.ics / Feed)' : 'Calendar (.ics / Feed)'}
                >
                  📅 {zh ? '日历' : 'Calendar'}
                </button>
                <button
                  type="button"
                  disabled={optimizeBusy}
                  onClick={() => void runOptimizeOrder()}
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  title={zh ? '按交通时间优化当天游览顺序 (预览后应用)' : 'Optimize day order by travel time (preview first)'}
                >
                  {optimizeBusy ? '⏳' : '✨'} {zh ? '优化顺序' : 'Optimize'}
                </button>
                <div className="relative hidden sm:block">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRefreshMenuOpen((prev) => !prev)}
                    className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    title={zh ? '用真实路网刷新交通时间（手动锁定的段不受影响）' : 'Refresh travel times with live road routing (manual legs untouched)'}
                    aria-expanded={refreshMenuOpen}
                  >
                    🚗 {zh ? '刷新路况' : 'Refresh'} ▾
                  </button>
                  {refreshMenuOpen ? (
                    <>
                      <div className="fixed inset-0 z-40 cursor-default" onClick={() => setRefreshMenuOpen(false)} />
                      <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-xl">
                        <button
                          type="button"
                          onClick={() => { setRefreshMenuOpen(false); void refreshTravelTimes('day'); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                        >
                          📅 {zh ? '刷新当天' : 'This day'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRefreshMenuOpen(false); void refreshTravelTimes('trip'); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                        >
                          🗓️ {zh ? '刷新整程' : 'Whole trip'}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <DayRiskSummary zh={zh} assessment={dayAssessment} onViewDetails={() => setRightTab('context')} />
          <PlannerDayTimeline {...dayTimelineProps} />
        </section>

        <PlannerRightPanel {...rightPanelProps} />
      </div>


      {isMapExpanded && selectedTrip ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-stone-950/60 p-3 sm:p-6 backdrop-blur-xs animate-in fade-in">
          <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-bold text-stone-900">🗺️ {selectedTrip.title} · {zh ? `第${activeDayIndex + 1}天空间地图` : `Day ${activeDayIndex + 1} Spatial Map`}</span>
                <span className="shrink-0 text-xs text-stone-400">({activeDate})</span>
                {tripDates.length > 1 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={activeDayIndex <= 0}
                      onClick={() => setSelectedDate(tripDates[activeDayIndex - 1])}
                      className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title={zh ? '前一天' : 'Previous day'}
                    >
                      ‹
                    </button>
                    <select
                      value={activeDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-xs font-semibold text-stone-700 focus:border-stone-400 focus:outline-hidden"
                      title={zh ? '切换日期' : 'Switch day'}
                    >
                      {tripDates.map((date, index) => (
                        <option key={date} value={date}>
                          D{index + 1} · {formatDay(date, language)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={activeDayIndex >= tripDates.length - 1}
                      onClick={() => setSelectedDate(tripDates[activeDayIndex + 1])}
                      className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title={zh ? '后一天' : 'Next day'}
                    >
                      ›
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsMapExpanded(false)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                ✕ {zh ? '退出大地图' : 'Close Map'}
              </button>
            </div>
            <div className="flex-1 p-2">
              <PlannerMap
                scheduledPlaces={mapScheduled}
                candidatePlaces={sortedPendingCandidates}
                allPlacesByDate={placesByDate}
                tripDates={tripDates}
                destinations={selectedTrip?.destinations}
                activeDate={activeDate}
                activeDayIndex={activeDayIndex}
                highlightedPlaceId={highlightedPlaceId}
                onSchedulePlace={(placeId, sortOrder) => {
                  void schedulePlace(placeId, undefined, sortOrder === undefined ? undefined : { sortOrder });
                }}
                onUnschedulePlace={removeVisit}
                onShelvePlace={handleDropPlace}
                onDeletePlace={handleDeletePlace}
                onHoverPlace={setHighlightedPlaceId}
                visitCountByPlaceId={visitCountByPlaceId}
                language={language}
                legByPair={legByPair}
                tripId={selectedTripId}
                sharedViewRef={mapViewRef}
                ownsSharedView={isMapExpanded}
              />
            </div>
          </div>
        </div>
      ) : null}

      {poolView ? null : (
        <ResearchPoolSection {...poolSectionProps} />
      )}

      <ImportCandidatesModal
        key={`import-${selectedTrip.id}-${isImportModalOpen}`}
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tripId={selectedTrip.id}
        tripTitle={selectedTrip.title}
        onImportSuccess={(count) => {
          void load();
          setNotice(zh ? `成功导入 ${count} 个候选地点！` : `Successfully imported ${count} places!`);
        }}
        language={language}
      />

      {optimizeComputation ? (
        <OptimizeOrderModal
          zh={zh}
          computation={optimizeComputation}
          busy={optimizeBusy}
          onClose={() => setOptimizeComputation(null)}
          onApply={(computation) => {
            setOptimizeBusy(true);
            setOptimizeComputation(null);
            void (async () => {
              try {
                await applyDayOptimization(computation);
              } finally {
                setOptimizeBusy(false);
              }
            })();
          }}
          onRecompute={runOptimizeOrder}
        />
      ) : null}

      <HotelComparisonModal
        key={`hotel-cmp-${activeDate}-${isHotelModalOpen}`}
        open={isHotelModalOpen}
        onClose={() => setIsHotelModalOpen(false)}
        candidateHotels={candidateHotels}
        scheduledPlaces={scheduled}
        placesByDate={placesByDate}
        tripDates={tripDates}
        activeDate={activeDate}
        activeDayIndex={activeDayIndex}
        onSelectHotelForStaySpan={handleSelectHotelForStaySpan}
        onDropHotel={handleDropPlace}
        destinations={selectedTrip?.destinations}
        tripCurrency={selectedTrip?.currency || 'CNY'}
        fxRates={selectedTrip?.fx_rates}
        language={language}
      />

      <PlaceTimingModal
        key={`timing-${timingModalPlace?.id}-${timingModalPlace?.scheduled_start}-${timingModalPlace?.duration_minutes}`}
        open={Boolean(timingModalPlace)}
        place={timingModalPlace}
        dayOtherPlaces={scheduled.filter((p) => p.id !== timingModalPlace?.id)}
        inferredStartTime={(() => {
          if (!timingModalPlace) return undefined;
          const stop = dayTimeline.items.find(
            (item): item is PlannerTimelineStopItem =>
              item.type === 'stop' && (item.visit_id === timingModalPlace.visit_id || item.place_id === timingModalPlace.place_id || item.id === `stop:${timingModalPlace.id}`),
          );
          return stop?.inferred_start || (stop?.is_inferred_start ? stop.start : undefined);
        })()}
        onClose={() => setTimingModalPlace(null)}
        onSave={handleSavePlaceTiming}
        language={language}
      />

      <AppInstallGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        defaultTab="extension"
      />

      <CreateTripModal
        key={isCreateTripOpen ? 'open' : 'closed'}
        open={isCreateTripOpen}
        onClose={() => setIsCreateTripOpen(false)}
        trips={trips}
        onCreate={handleUpsertTrip}
        onImported={(tripId) => {
          void load();
          setSelectedTripId(tripId);
        }}
        onDeleteTrip={handleDeleteTrip}
        language={language}
        disabled={disabled}
        incomingShareHash={shareHash}
        onDismissShare={() => setShareHash(null)}
      />

      {selectedTrip ? (
        <CalendarSubscriptionModal
          key={`calendar-${selectedTrip.id}-${isCalendarModalOpen}-${selectedTrip.calendar_feed?.feed_token}-${selectedTrip.calendar_feed?.enabled}`}
          open={isCalendarModalOpen}
          onClose={() => setIsCalendarModalOpen(false)}
          trip={selectedTrip}
          activeDate={activeDate}
          onDownloadFullIcs={downloadFullIcs}
          onDownloadDayIcs={downloadDayIcs}
          onCopyIcs={copyIcsContent}
          onCreateOrUpdateFeed={handleCreateOrUpdateFeed}
          onRotateFeed={handleRotateFeed}
          onDisableFeed={handleDisableFeed}
          isPro={isPro}
          onUpgradePro={openLicenseModal}
          language={language}
        />
      ) : null}

      {selectedTrip && isReviewModalOpen ? (
        <TripReviewModal
          key={`review-${selectedTrip.id}-${selectedTrip.review_id ?? 'none'}`}
          trip={selectedTrip}
          places={tripPlaces}
          visits={tripVisits}
          legs={legs}
          expenses={currentExpenses}
          language={language}
          busy={reviewBusy}
          onClose={() => { if (!reviewBusy) setIsReviewModalOpen(false); }}
          onConfirm={(draft) => void confirmTripReview(draft)}
        />
      ) : null}

      {/* Suspected Duplicates Review Modal */}
      {isSuspectedModalOpen && visibleSuspectedPairs.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4 bg-stone-50">
              <div>
                <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  ✨ {zh ? '疑似重复地点复核' : 'Suspected Duplicate Review'}
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    {visibleSuspectedPairs.length}
                  </span>
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  {zh
                    ? '以下地点只有相似证据，系统不会自动合并。请逐组选择合并或确认保持分开。'
                    : 'These places have similarity evidence only. Ownly will not auto-merge them; review each pair explicitly.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSuspectedModalOpen(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {visibleSuspectedPairs.map((pair) => (
                <div
                  key={pair.pairId}
                  className="rounded-xl border border-amber-200/80 bg-amber-50/20 p-4 shadow-xs"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        🔍 {pair.reason}
                      </span>
                      <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-stone-500">
                        {zh ? '匹配分' : 'Match'} {Math.round(pair.score * 100)}%
                      </span>
                      {pair.distanceMeters !== undefined ? (
                        <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-stone-500">
                          📍 {pair.distanceMeters}m
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleIgnoreSuspectedPair(pair.pairId)}
                      className="text-[11px] font-medium text-stone-400 hover:text-stone-600 transition"
                    >
                      {zh ? '不是同类 (忽略)' : 'Ignore (keep separate)'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Left Candidate (Primary) */}
                    <div className="flex flex-col justify-between rounded-lg border border-stone-200 bg-white p-3 shadow-2xs">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-sm font-semibold text-stone-900">{pair.primaryPlace.title}</h4>
                          {visitCountByPlaceId.get(pair.primaryPlace.id) ? (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800">
                              ✓ {zh ? '已排日程' : 'Scheduled'}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-stone-400 truncate">{pair.primaryPlace.address || pair.primaryPlace.source_category || '—'}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pair.primaryPlace.observed_rating ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">★ {pair.primaryPlace.observed_rating}</span>
                          ) : null}
                          {formatPlacePriceInTripCurrency(pair.primaryPlace, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates) ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">{formatPlacePriceInTripCurrency(pair.primaryPlace, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates)}</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMergePair(pair.primaryPlace.id, pair.secondaryPlace.id)}
                        className="mt-3 w-full rounded-md bg-emerald-700 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition"
                      >
                        {zh ? '保留此地点并合并' : 'Keep this place & merge'}
                      </button>
                    </div>

                    {/* Right Candidate (Secondary) */}
                    <div className="flex flex-col justify-between rounded-lg border border-stone-200 bg-white p-3 shadow-2xs">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-sm font-semibold text-stone-900">{pair.secondaryPlace.title}</h4>
                          {visitCountByPlaceId.get(pair.secondaryPlace.id) ? (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800">
                              ✓ {zh ? '已排日程' : 'Scheduled'}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-stone-400 truncate">{pair.secondaryPlace.address || pair.secondaryPlace.source_category || '—'}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pair.secondaryPlace.observed_rating ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">★ {pair.secondaryPlace.observed_rating}</span>
                          ) : null}
                          {formatPlacePriceInTripCurrency(pair.secondaryPlace, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates) ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">{formatPlacePriceInTripCurrency(pair.secondaryPlace, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates)}</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMergePair(pair.secondaryPlace.id, pair.primaryPlace.id)}
                        className="mt-3 w-full rounded-md bg-stone-900 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition"
                      >
                        {zh ? '保留此地点并合并' : 'Keep this place & merge'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-stone-100 px-6 py-3 bg-stone-50">
              <button
                type="button"
                onClick={() => setIsSuspectedModalOpen(false)}
                className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 transition"
              >
                {zh ? '暂不处理' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SwapDaysModal
        isSwapDaysModalOpen={isSwapDaysModalOpen}
        setIsSwapDaysModalOpen={setIsSwapDaysModalOpen}
        tripDates={tripDates}
        activeDate={activeDate}
        placesByDate={placesByDate}
        swapTargetDate={swapTargetDate}
        setSwapTargetDate={setSwapTargetDate}
        handleSwapDays={handleSwapDays}
        zh={zh}
        language={language}
      />
    </section>
  );
}
