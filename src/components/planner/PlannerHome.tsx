'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PlannerTravelMode,
} from '@/domain/planner';
import { type PlannerScheduledPlace } from '@/domain/planner-visits';
import {
  buildGoogleMapsRouteUrl,
  calculateDefaultTripLeg,
  currencySymbolFor,
  effectiveFxRate,
  formatPlacePriceInTripCurrency,
  isTransitHubPlace,
  PLANNER_KIND_ICONS,
  PLANNER_TRAVEL_MODE_CONFIG,
} from '@/domain/planner';
import type { PlannerExecutionTransitionItem, PlannerTimelineStopItem } from '@/domain/planner-schedule';
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
import { PlannerRightPanel } from './PlannerRightPanel';
import { ResearchPoolSection } from './ResearchPoolSection';
import { TravelModeSwitchPopover } from './TravelModeSwitchPopover';
import { useEscapeKey } from './use-escape-key';
import { extractTripSharePayload } from '@/domain/trip-share-link';
import { CalendarSubscriptionModal } from './CalendarSubscriptionModal';
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
    refreshTravelTimes,
  } = ctrl;

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
    highlightedPlaceId,
    setHighlightedPlaceId,
    setDraggingPlaceId,
    setGuideOpen,
    setIsImportModalOpen,
    setIsHotelModalOpen,
    setIsSuspectedModalOpen,
    disabled,
  };

  const rightPanelProps = {
    zh,
    language,
    rightTab,
    setRightTab,
    setIsMapExpanded,
    mapScheduled,
    sortedPendingCandidates,
    placesByDate,
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
          {currentDayTransferInfo?.isTransferDay ? (
            <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 shadow-2xs">
              <span className="text-base">🧳</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <span>{zh ? '今日为换宿日 (Hotel Transfer Day)' : 'Hotel Transfer Day'}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                  {zh ? (
                    <>
                      🌅 <b>早上退房:</b> {currentDayTransferInfo.checkoutHotel?.title} (行李可寄放前台或直送新店) ➔ 🚶 <b>白天游览</b> ➔ 🌙 <b>傍晚入住:</b> {currentDayTransferInfo.checkinHotel?.title}
                    </>
                  ) : (
                    <>
                      🌅 <b>Morning Check-out:</b> {currentDayTransferInfo.checkoutHotel?.title} ➔ 🚶 <b>Sightseeing</b> ➔ 🌙 <b>Evening Check-in:</b> {currentDayTransferInfo.checkinHotel?.title}
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : currentDayTransferInfo?.checkoutHotel && !currentDayTransferInfo.stayHotel ? (
            <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-950 shadow-2xs">
              <div className="flex items-center gap-1.5 font-medium truncate">
                <span>🌅</span>
                <span className="truncate">
                  {zh ? '早晨退房出发:' : 'Morning Checkout & Depart:'}{' '}
                  <strong className="font-bold">{currentDayTransferInfo.checkoutHotel.title}</strong>
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-sky-200/80 px-2 py-0.5 text-[10.5px] font-bold text-sky-900">
                {zh ? '退房出发日 · 今晚不住宿' : 'Checkout & Departure Day'}
              </span>
            </div>
          ) : currentDayTransferInfo?.stayHotel ? (
            <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950 shadow-2xs">
              <div className="flex items-center gap-1.5 font-medium truncate">
                <span>🌙</span>
                <span className="truncate">
                  {zh ? '今晚住宿:' : 'Tonight Stay:'}{' '}
                  <strong className="font-bold">{currentDayTransferInfo.stayHotel.title}</strong>
                </span>
              </div>
              {currentDayTransferInfo.totalStayNights && currentDayTransferInfo.totalStayNights > 1 ? (
                <span className="shrink-0 rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10.5px] font-bold text-emerald-900">
                  {zh
                    ? `连住第 ${currentDayTransferInfo.stayNightIndex} 晚 / 共 ${currentDayTransferInfo.totalStayNights} 晚`
                    : `Night ${currentDayTransferInfo.stayNightIndex} of ${currentDayTransferInfo.totalStayNights}`}
                </span>
              ) : null}
            </div>
          ) : null}
          <DayRiskSummary zh={zh} assessment={dayAssessment} onViewDetails={() => setRightTab('context')} />
          <div className="p-2 sm:p-2.5">
            {scheduled.length === 0 ? (
              <div className={`rounded-xl border-2 border-dashed px-4 py-12 text-center text-sm ${draggingPlaceId ? 'border-emerald-300 bg-emerald-50/50 text-emerald-700' : 'border-stone-200 text-stone-400'}`}>
                {zh ? '把 Research Pool 的候选拖进这一天，或点击“+ 当天”。' : 'Drag a researched candidate here, or use “+ Day”.'}
              </div>
            ) : (
              <ol className="space-y-1">
                {scheduled.map((place, index) => {
                  const timeOverlap = dayAssessment.time_overlaps.find((overlap) => overlap.fromId === place.id || overlap.toId === place.id);
                  const openHoursIssue = dayAssessment.opening_hours_warnings.find((issue) => issue.visit_id === place.visit_id || issue.place_id === place.place_id);
                  const col = timeOverlap
                    ? { isCollision: true, reason: zh ? '与当天其它地点存在时间重叠' : 'Overlaps another timed stop on this day' }
                    : openHoursIssue
                      ? { isCollision: true, reason: openHoursIssue.reason }
                      : undefined;
                  const timelineStop = dayTimeline.items.find(
                    (item): item is PlannerTimelineStopItem => item.type === 'stop' && (item.visit_id === place.visit_id || item.id === place.id),
                  );
                  const nextPlace = scheduled[index + 1];
                  const transitionItems = nextPlace
                    ? dayTimeline.items.filter(
                      (item): item is PlannerExecutionTransitionItem => item.type !== 'stop' && item.from_id === place.id && item.to_id === nextPlace.id,
                    )
                    : [];
                    return (
                    <li
                      key={place.id}
                      className="group space-y-1"
                      onMouseEnter={() => setHighlightedPlaceId(place.id)}
                      onMouseLeave={() => setHighlightedPlaceId(null)}
                    >
                      <div className={`relative flex items-start gap-2 rounded-lg border px-2 py-1.5 sm:px-2.5 sm:py-2 transition-all duration-150 shadow-2xs ${
                        highlightedPlaceId === place.id
                          ? 'border-emerald-500 ring-2 ring-emerald-300/50 bg-emerald-50/30'
                          : 'border-stone-200/90 bg-white hover:border-stone-300'
                      }`}>
                        {/* Stop Number Circle */}
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white shrink-0 shadow-2xs mt-0.5">
                          {index + 1}
                        </div>

                        {/* Stop Content Body */}
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Row 1: Title (left, 1 line clamp) & Time Trigger (right) */}
                          <div className="flex items-center justify-between gap-1.5">
                            {/* Title with kind emoji */}
                            <div className="min-w-0 flex-1 flex items-center gap-1.5">
                              <span className="text-xs shrink-0">{PLANNER_KIND_ICONS[place.kind] || '📍'}</span>
                              <h3 className="truncate text-xs font-bold text-stone-900 leading-tight" title={place.title}>
                                {place.title}
                              </h3>
                              {place.kind === 'stay' ? (
                                place.anchor_type === 'stay_checkout' ||
                                (currentDayTransferInfo?.checkoutHotel &&
                                  (currentDayTransferInfo.checkoutHotel.id === place.id ||
                                    currentDayTransferInfo.checkoutHotel.visit_id === place.visit_id) &&
                                  currentDayTransferInfo.stayHotel?.visit_id !== place.visit_id) ? (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 py-0.2 text-[9px] font-bold text-sky-800 shrink-0">
                                    🌅 {zh ? '退房出发' : 'Checkout'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 px-1 py-0.2 text-[9px] font-bold text-indigo-800 shrink-0">
                                    🌙 {zh ? '今晚住宿' : 'Stay'}
                                  </span>
                                )
                              ) : null}
                            </div>

                            {/* Timing Trigger (Top Right) */}
                            <button
                              type="button"
                              onClick={() => setTimingModalPlace(place)}
                              className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold transition hover:scale-102 ${
                                timelineStop?.start
                                  ? timelineStop.is_inferred_start
                                    ? 'bg-amber-50/90 text-amber-800 border border-dashed border-amber-300 hover:bg-amber-100 font-mono'
                                    : 'bg-stone-100 text-stone-800 hover:bg-stone-200 ring-1 ring-stone-300/70 font-mono'
                                  : 'border border-dashed border-stone-300 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-700'
                              }`}
                              title={
                                timelineStop?.is_inferred_start
                                  ? (zh ? '根据上一站游览与通勤时间自动推算；点击可手动调整或锁定' : 'Inferred arrival time; click to adjust or lock manually')
                                  : timelineStop?.start
                                    ? (zh ? '手动设置的游览时段；点击可修改' : 'Manual scheduled timing; click to edit')
                                    : (zh ? '设置开始时间与停留时长' : 'Set start time and duration')
                              }
                            >
                              <span>🕒</span>
                              <span>
                                {timelineStop?.start
                                  ? `${timelineStop.is_inferred_start ? '~' : ''}${timelineStop.start}${timelineStop.end ? `-${timelineStop.end}${timelineStop.crosses_midnight ? ' +1' : ''}` : ''}${timelineStop.is_inferred_start ? ` ${zh ? '估' : 'est'}` : ''}`
                                  : (zh ? '设时间' : 'Time')}
                              </span>
                            </button>
                          </div>

                          {/* Row 2: Bottom-Left Meta/Emojis & Bottom-Right Actions [ 📍 | ↑ | ↓ | ✕ ] */}
                          <div className="flex items-center justify-between gap-1.5 min-w-0">
                            {/* Bottom-Left: Meta info (Area, Duration, Price) + Quick Emojis (🧭, 📞, 🗺️, 📖, 🎟️, 💳) */}
                            <div className="flex items-center gap-1.5 text-[10.5px] text-stone-500 min-w-0 overflow-hidden">
                              {/* Meta Details */}
                              <div className="flex items-center gap-1 min-w-0 shrink-0">
                                {place.area ? <span className="text-stone-600 font-medium truncate max-w-[80px] sm:max-w-[110px] text-[10.5px]">{place.area}</span> : null}
                                {place.duration_minutes ? <span className="text-stone-400 shrink-0 text-[10px] font-mono">{place.duration_minutes}m</span> : null}
                                {(() => {
                                  const isHotel = place.kind === 'stay';
                                  const placeExpense =
                                    expensesByPlace.get(place.id) ||
                                    (place.place_id ? expensesByPlace.get(place.place_id) : undefined) ||
                                    expensesByPlace.get(place.title.trim().toLowerCase());

                                  if (isHotel) {
                                    // Hotel / Stay Card:
                                    // 1. Do NOT display estimated price (only used for hotel comparison).
                                    // 2. If there are recorded expenses, divide by stay days to get daily actual expense.
                                    if (!placeExpense || placeExpense.total <= 0) return null;
                                    const stayDays = hotelStayDaysMap.getDays(place);
                                    const dailyActual = Math.round((placeExpense.total / stayDays) * 100) / 100;
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBudgetInitialPlaceId(place.id);
                                          setRightTab('budget');
                                        }}
                                        className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 py-0.2 text-[9.5px] font-semibold shrink-0 transition hover:bg-emerald-100"
                                        title={
                                          zh
                                            ? `实记 ${currencySymbolFor(selectedTrip?.currency)}${dailyActual}/天（总计 ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total}，共 ${stayDays} 晚分摊，共 ${placeExpense.count} 笔），点击前往账本查看`
                                            : `Actual: ${currencySymbolFor(selectedTrip?.currency)}${dailyActual}/day (Total ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total} across ${stayDays} nights, ${placeExpense.count} expenses), click to view in budget`
                                        }
                                      >
                                        💳 {zh ? '实记' : 'Act'}: {currencySymbolFor(selectedTrip?.currency)}{dailyActual}{stayDays > 1 ? (zh ? '/天' : '/d') : ''}
                                      </button>
                                    );
                                  }

                                  // Non-hotel place: show estimated price if present, and actual expense if recorded
                                  return (
                                    <>
                                      {formatPlacePriceInTripCurrency(place, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates) ? (
                                        <span className="rounded bg-stone-100 px-1 py-0.2 text-[9.5px] font-semibold text-stone-700 shrink-0">
                                          {formatPlacePriceInTripCurrency(place, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates)}
                                        </span>
                                      ) : null}
                                      {placeExpense && placeExpense.total > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBudgetInitialPlaceId(place.id);
                                            setRightTab('budget');
                                          }}
                                          className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 py-0.2 text-[9.5px] font-semibold shrink-0 transition hover:bg-emerald-100"
                                          title={
                                            zh
                                              ? `实记 ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total}（共 ${placeExpense.count} 笔），点击前往账本查看`
                                              : `Actual: ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total} (${placeExpense.count} expenses), click to view in budget`
                                          }
                                        >
                                          💳 {zh ? '实记' : 'Act'}: {currencySymbolFor(selectedTrip?.currency)}{placeExpense.total}
                                        </button>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Quick Action Emoji Buttons (hover/focus-revealed on fine pointers) */}
                              <div className="flex items-center gap-0.5 shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                                {/* 交通 / 导航 */}
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address || place.title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                                  title={zh ? '导航到此地' : 'Directions'}
                                >
                                  🧭
                                </a>
                                {/* 电话 */}
                                {place.phone ? (
                                  <a
                                    href={`tel:${place.phone}`}
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-700 hover:bg-stone-200 transition"
                                    title={zh ? `拨打电话: ${place.phone}` : `Call: ${place.phone}`}
                                  >
                                    📞
                                  </a>
                                ) : null}
                                {/* 地图 */}
                                {place.source_url ? (
                                  <a
                                    href={place.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                                    title={zh ? '在 Google Maps 中查看' : 'View on Maps'}
                                  >
                                    🗺️
                                  </a>
                                ) : (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address || place.title)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                                    title={zh ? '在 Google Maps 中搜索' : 'Search on Maps'}
                                  >
                                    🗺️
                                  </a>
                                )}
                                {/* 菜单 */}
                                {place.menu_url ? (
                                  <a
                                    href={place.menu_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-700 hover:bg-stone-200 transition"
                                    title={zh ? '查看菜单' : 'Menu'}
                                  >
                                    📖
                                  </a>
                                ) : null}
                                {/* 预订 */}
                                {place.reservation_url ? (
                                  <a
                                    href={place.reservation_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-amber-300 bg-amber-50 text-[10px] text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                                    title={zh ? '官方预订' : 'Reserve'}
                                  >
                                    🎟️
                                  </a>
                                ) : null}
                                {/* 记账 */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBudgetInitialPlaceId(place.id);
                                    setRightTab('budget');
                                  }}
                                  className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 transition"
                                  title={zh ? '为此地点记一笔账' : 'Record expense for this place'}
                                >
                                  💳
                                </button>
                              </div>
                            </div>

                            {/* Bottom-Right: Grouped 4 Actions (hover/focus-revealed on fine pointers) */}
                            <div className="inline-flex items-center rounded border border-stone-200 bg-stone-50/90 p-0.5 shadow-2xs shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                              <button
                                type="button"
                                aria-label={place.locked ? (zh ? '取消固定' : 'Unpin') : (zh ? '固定顺位' : 'Pin')}
                                onClick={() => void handleToggleVisitLock(place.visit_id)}
                                className={`flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] transition ${
                                  place.locked
                                    ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                    : 'text-stone-400 hover:bg-white hover:text-stone-700'
                                }`}
                                title={place.locked ? (zh ? '已固定顺位（交通优化不移动此站）' : 'Pinned') : (zh ? '固定在当前顺位' : 'Pin stop')}
                              >
                                {place.locked ? '📌' : '📍'}
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '上移' : 'Move up'}
                                disabled={index === 0}
                                onClick={() => void moveScheduled(index, -1)}
                                className="flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] font-bold text-stone-500 hover:bg-white hover:text-stone-900 disabled:opacity-20 transition"
                                title={zh ? '上移一站' : 'Move up'}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '下移' : 'Move down'}
                                disabled={index === scheduled.length - 1}
                                onClick={() => void moveScheduled(index, 1)}
                                className="flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] font-bold text-stone-500 hover:bg-white hover:text-stone-900 disabled:opacity-20 transition"
                                title={zh ? '下移一站' : 'Move down'}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '从当天日程移除' : 'Remove stop'}
                                onClick={() => void removeVisit(place)}
                                className="flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title={zh ? '从当天日程移除（回到待安排候选池）' : 'Remove stop'}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Warning / Conflict Alerts */}
                          {col?.isCollision ? (
                            <div className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200 leading-tight">
                              <span>⚠️</span>
                              <span>{col.reason}</span>
                            </div>
                          ) : null}

                          {/* Deduplicated Research Note / Why Insight (Only 1 block displayed) */}
                          {place.why ? (
                            <p className="line-clamp-1 rounded bg-stone-50 px-1.5 py-0.5 text-[10px] text-stone-600 leading-tight">
                              💡 <strong className="font-semibold text-stone-700">{zh ? '推荐理由:' : 'Why:'}</strong> {place.why}
                            </p>
                          ) : place.notes ? (
                            <p className="line-clamp-1 text-[10px] text-stone-500 italic pl-0.5 leading-tight">
                              📝 {place.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Travel Transition Rail (Between Stops) */}
                      {index < scheduled.length - 1 ? (
                        <div className="relative ml-3 border-l-2 border-dashed border-stone-200 py-1 pl-3.5 space-y-1">
                          {isTransitHubPlace(place) && isTransitHubPlace(nextPlace) ? (
                            <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100/90 px-2.5 py-0.5 text-[10px] font-semibold text-stone-700 shadow-2xs">
                              <span>✈️ {zh ? '跨城交通 · 依据票务时间' : 'Intercity Transit (Ticket-based)'}</span>
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode === 'motorcycle' ? 'two_wheeler' : (selectedTrip.transport_mode ?? 'transit')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full bg-stone-200 hover:bg-stone-300 px-1.5 py-0.2 text-[9px] font-bold text-stone-800 transition"
                              >
                                Google 路线 ↗
                              </a>
                            </div>
                          ) : transitionItems.length === 0 ? (
                            (() => {
                              const isPairSwitching = activeModeSwitchPair === `${place.id}->${nextPlace.id}`;
                              const defaultLeg = calculateDefaultTripLeg(selectedTrip, place, nextPlace);
                              const modeKey = defaultLeg?.mode ?? (selectedTrip.transport_mode ?? 'driving');
                              const modeConfig = PLANNER_TRAVEL_MODE_CONFIG[modeKey] ?? PLANNER_TRAVEL_MODE_CONFIG.driving;
                              const icon = modeConfig.emoji;
                              const dur = defaultLeg?.duration_minutes ?? modeConfig.defaultDuration;
                              const distance = defaultLeg?.distance_meters === undefined
                                ? ''
                                : defaultLeg.distance_meters < 1000 ? ` · ${defaultLeg.distance_meters} m` : ` · ${(defaultLeg.distance_meters / 1000).toFixed(1)} km`;
                              return (
                                <div className="relative inline-flex flex-wrap items-center gap-1.5">
                                  <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-sky-200/90 bg-sky-50/90 px-2.5 py-0.5 text-[10px] font-semibold text-sky-900 shadow-2xs">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveModeSwitchPair(isPairSwitching ? null : `${place.id}->${nextPlace.id}`);
                                      }}
                                      className="inline-flex items-center gap-1 hover:text-sky-700 hover:underline cursor-pointer transition font-medium"
                                      title={zh ? '点击切换出行方式' : 'Click to change travel mode'}
                                    >
                                      <span>{icon} {dur} min{distance}</span>
                                      <span className="text-[8.5px] opacity-70">▾</span>
                                    </button>
                                    <a
                                      href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${modeKey === 'motorcycle' ? 'two_wheeler' : (modeKey ?? 'transit')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-full bg-sky-100 hover:bg-sky-200 px-1.5 py-0.2 text-[9px] font-bold text-sky-800 transition"
                                    >
                                      Google 导航 ↗
                                    </a>
                                  </div>

                                  {/* Mode Switch Popover */}
                                  {isPairSwitching && selectedTrip ? (
                                    <TravelModeSwitchPopover
                                      zh={zh}
                                      selectedTrip={selectedTrip}
                                      place={place}
                                      nextPlace={nextPlace}
                                      currentMode={modeKey}
                                      isCleared={false}
                                      onSelectMode={(m) => {
                                        setActiveModeSwitchPair(null);
                                        void handleSwitchTravelMode(place, nextPlace, m);
                                      }}
                                      onClearEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleClearTravelEstimate(place, nextPlace);
                                      }}
                                      onRecalculateEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleRecalculateTravelEstimate(place, nextPlace);
                                      }}
                                      onClose={() => setActiveModeSwitchPair(null)}
                                    />
                                  ) : null}
                                </div>
                              );
                            })()
                          ) : transitionItems.map((item) => {
                            if (item.type === 'travel') {
                              const isPairSwitching = activeModeSwitchPair === `${place.id}->${nextPlace.id}`;
                              const isCleared = item.duration_minutes === 0;
                              const modeKey = (item.mode as PlannerTravelMode) || 'driving';
                              const modeConfig = PLANNER_TRAVEL_MODE_CONFIG[modeKey] ?? PLANNER_TRAVEL_MODE_CONFIG.driving;
                              const icon = modeConfig.emoji;
                              const distance = item.distance_meters === undefined
                                ? ''
                                : item.distance_meters < 1000 ? ` · ${item.distance_meters} m` : ` · ${(item.distance_meters / 1000).toFixed(1)} km`;
                              return (
                                <div key={item.id} className="relative inline-flex flex-wrap items-center gap-2">
                                  {isCleared ? (
                                    <div className="inline-flex flex-wrap items-center gap-2 px-1 py-0.5 text-[10.5px] text-stone-400">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveModeSwitchPair(isPairSwitching ? null : `${place.id}->${nextPlace.id}`);
                                        }}
                                        className="inline-flex items-center gap-1 hover:text-stone-800 hover:underline cursor-pointer transition font-medium"
                                        title={zh ? '当前无需交通时间预估，点击可恢复或切换' : 'No travel estimate. Click to switch or restore'}
                                      >
                                        <span>🚫 {zh ? '无预估' : 'No est'}</span>
                                        <span className="text-[9px] opacity-70">▾</span>
                                      </button>
                                      <a
                                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode === 'motorcycle' ? 'two_wheeler' : (selectedTrip.transport_mode ?? 'transit')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[9.5px] text-stone-400 hover:text-stone-700 underline underline-offset-2 transition"
                                      >
                                        Google 导航 ↗
                                      </a>
                                    </div>
                                  ) : (
                                    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-stone-500">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveModeSwitchPair(isPairSwitching ? null : `${place.id}->${nextPlace.id}`);
                                        }}
                                        className="inline-flex items-center gap-1 hover:text-stone-800 hover:underline cursor-pointer transition"
                                        title={zh ? '点击切换出行方式或清除预估' : 'Click to change travel mode or clear estimate'}
                                      >
                                        <span className="font-medium text-stone-600">{icon} {item.duration_minutes} min{distance}{item.source === 'openrouteservice' ? ' · ORS' : ''}</span>
                                        <span className="text-[9px] opacity-70">▾</span>
                                      </button>
                                      {item.start && item.end ? <span className="font-mono text-stone-400">{item.start}–{item.end}</span> : null}
                                      <a
                                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${item.mode === 'motorcycle' ? 'two_wheeler' : (item.mode ?? selectedTrip.transport_mode ?? 'transit')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[9.5px] text-stone-400 hover:text-stone-700 underline underline-offset-2 transition"
                                      >
                                        Google 导航 ↗
                                      </a>
                                    </div>
                                  )}

                                  {/* Mode Switch Popover */}
                                  {isPairSwitching && selectedTrip ? (
                                    <TravelModeSwitchPopover
                                      zh={zh}
                                      selectedTrip={selectedTrip}
                                      place={place}
                                      nextPlace={nextPlace}
                                      currentMode={modeKey}
                                      isCleared={isCleared}
                                      onSelectMode={(m) => {
                                        setActiveModeSwitchPair(null);
                                        void handleSwitchTravelMode(place, nextPlace, m);
                                      }}
                                      onClearEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleClearTravelEstimate(place, nextPlace);
                                      }}
                                      onRecalculateEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleRecalculateTravelEstimate(place, nextPlace);
                                      }}
                                      onClose={() => setActiveModeSwitchPair(null)}
                                    />
                                  ) : null}
                                </div>
                              );
                            }
                            if (item.type === 'gap') {
                              return (
                                <div key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[10px] font-semibold text-emerald-800 shadow-2xs">
                                  <span>◌</span>
                                  <span>{zh ? `机动空闲 ${item.duration_minutes} min` : `${item.duration_minutes} min buffer`} · {item.start}-{item.end}</span>
                                </div>
                              );
                            }
                            if (item.type === 'conflict') {
                              return (
                                <div key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-0.5 text-[10px] font-semibold text-rose-800 shadow-2xs">
                                  <span>🚨</span>
                                  <span>{zh
                                    ? `衔接冲突 · 最早 ${item.earliest_arrival ?? '次日'} 到达 · 比下一站晚 ${item.late_by_minutes} min`
                                    : `Conflict · ${item.late_by_minutes} min late`}</span>
                                </div>
                              );
                            }
                            // Only render travel_time_missing (which has navigation link); hide "时间不完整" by default
                            if (item.type === 'unknown' && item.reason === 'travel_time_missing') {
                              return (
                                <div key={item.id} className="inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <span>❔ {zh ? '交通时间未确认' : 'Travel time unknown'}</span>
                                  <a
                                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode === 'motorcycle' ? 'two_wheeler' : (selectedTrip.transport_mode ?? 'transit')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full bg-amber-100 hover:bg-amber-200 px-1.5 py-0.2 text-[9.5px] font-bold text-amber-900 transition"
                                  >
                                    Google 导航 ↗
                                  </a>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
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
                onSchedulePlace={schedulePlace}
                onUnschedulePlace={removeVisit}
                onShelvePlace={handleDropPlace}
                onDeletePlace={handleDeletePlace}
                onHoverPlace={setHighlightedPlaceId}
                visitCountByPlaceId={visitCountByPlaceId}
                language={language}
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

      {/* Accessible Day Swap Modal */}
      {isSwapDaysModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <span>⇄</span>
                <span>{zh ? '互换行程日程' : 'Swap Day Itineraries'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSwapDaysModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              {zh
                ? '将当前选中日期的全部排期路线与目标日期整体对调。两天的游览先后顺位、时间设定与锁定标记将 100% 完整平移。'
                : 'Atomically swap all scheduled visits between the active day and a target day. Sequence orders, custom timings, and pinned locks are preserved.'}
            </p>

            <div className="grid grid-cols-2 gap-3 items-center rounded-xl bg-stone-50 p-3 border border-stone-200">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-stone-500">{zh ? '当前日期 (源)' : 'Source Day'}</span>
                <div className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900">
                  {zh ? `第${tripDates.indexOf(activeDate) + 1}天` : `Day ${tripDates.indexOf(activeDate) + 1}`} ({formatDay(activeDate, language)})
                  <div className="text-[10.5px] font-normal text-stone-500 mt-0.5">
                    {placesByDate[activeDate]?.length || 0} {zh ? '个地点' : 'places'}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-bold text-stone-500">{zh ? '目标互换日期' : 'Target Day'}</span>
                <select
                  value={swapTargetDate}
                  onChange={(e) => setSwapTargetDate(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs font-semibold text-stone-900 focus:border-stone-900 focus:outline-hidden"
                >
                  {tripDates.map((d, i) => {
                    if (d === activeDate) return null;
                    const count = placesByDate[d]?.length || 0;
                    return (
                      <option key={d} value={d}>
                        {zh ? `第${i + 1}天 (${formatDay(d, language)}) · ${count}个地点` : `Day ${i + 1} (${formatDay(d, language)}) · ${count} places`}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSwapDaysModalOpen(false)}
                className="rounded-lg border border-stone-200 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!swapTargetDate || swapTargetDate === activeDate}
                onClick={async () => {
                  if (!swapTargetDate || swapTargetDate === activeDate) return;
                  setIsSwapDaysModalOpen(false);
                  await handleSwapDays(activeDate, swapTargetDate);
                }}
                className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition disabled:opacity-40"
              >
                {zh ? '确认互换' : 'Confirm Swap'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
