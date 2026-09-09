'use client';

import type { PlannerTrip, PlannerTripLeg } from '@/domain/planner';
import type { PlannerControllerReturn } from './usePlannerController';
import { DayLoadBreakdown, DayRiskList } from './PlannerDayStatsPanel';
import { PlannerBudgetLedger } from './PlannerBudgetLedger';
import { PlannerMap } from './PlannerMap';

export interface PlannerRightPanelProps {
  zh: boolean;
  language: PlannerControllerReturn['language'];
  rightTab: 'map' | 'context' | 'budget';
  setRightTab: (tab: 'map' | 'context' | 'budget') => void;
  setIsMapExpanded: (open: boolean) => void;
  mapScheduled: PlannerControllerReturn['mapScheduled'];
  sortedPendingCandidates: PlannerControllerReturn['sortedPendingCandidates'];
  placesByDate: PlannerControllerReturn['placesByDate'];
  tripDates: PlannerControllerReturn['tripDates'];
  legByPair: Map<string, PlannerTripLeg>;
  tripId: string;
  sharedViewRef: { current: { center: { lat: number; lng: number }; zoom: number } | null };
  ownsSharedView: boolean;
  selectedTrip: PlannerTrip;
  activeDate: PlannerControllerReturn['activeDate'];
  activeDayIndex: PlannerControllerReturn['activeDayIndex'];
  highlightedPlaceId: string | null;
  schedulePlace: PlannerControllerReturn['schedulePlace'];
  removeVisit: PlannerControllerReturn['removeVisit'];
  handleDropPlace: PlannerControllerReturn['handleDropPlace'];
  handleDeletePlace: PlannerControllerReturn['handleDeletePlace'];
  handleChangePlaceKind: PlannerControllerReturn['handleChangePlaceKind'];
  setHighlightedPlaceId: (value: string | null) => void;
  visitCountByPlaceId: PlannerControllerReturn['visitCountByPlaceId'];
  scheduled: PlannerControllerReturn['scheduled'];
  tripPlaces: PlannerControllerReturn['tripPlaces'];
  budgetInitialPlaceId: string | null;
  onClearInitialPlaceId: () => void;
  currentExpenses: PlannerControllerReturn['currentExpenses'];
  handleAddExpense: PlannerControllerReturn['handleAddExpense'];
  handleUpdateExpense: PlannerControllerReturn['handleUpdateExpense'];
  handleDeleteExpense: PlannerControllerReturn['handleDeleteExpense'];
  currentMembers: PlannerControllerReturn['currentMembers'];
  handleUpdateMembers: PlannerControllerReturn['handleUpdateMembers'];
  handleUpdateFxRates: PlannerControllerReturn['handleUpdateFxRates'];
  dayAssessment: PlannerControllerReturn['dayAssessment'];
  pendingCandidates: PlannerControllerReturn['pendingCandidates'];
  droppedPlaces: PlannerControllerReturn['droppedPlaces'];
  mustScheduled: number;
  mustTotal: number;
  scheduledMinutes: number;
  areaCounts: PlannerControllerReturn['areaCounts'];
  maxAreaCount: number;
}

export function PlannerRightPanel(props: PlannerRightPanelProps) {
  const {
    zh, language, rightTab, setRightTab, setIsMapExpanded,
    mapScheduled, sortedPendingCandidates, placesByDate, tripDates, selectedTrip,
    activeDate, activeDayIndex, highlightedPlaceId, schedulePlace, removeVisit,
    handleDropPlace, handleDeletePlace, handleChangePlaceKind, setHighlightedPlaceId, visitCountByPlaceId,
    scheduled, tripPlaces, budgetInitialPlaceId, onClearInitialPlaceId,
    currentExpenses, handleAddExpense, handleUpdateExpense, handleDeleteExpense,
    currentMembers, handleUpdateMembers, handleUpdateFxRates, dayAssessment,
    pendingCandidates, droppedPlaces, mustScheduled, mustTotal, scheduledMinutes,
    areaCounts, maxAreaCount, legByPair, tripId, sharedViewRef, ownsSharedView,
  } = props;
  return (
        <aside className="min-w-0 flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {/* Header Tab Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-stone-100 bg-stone-50/90 px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightTab('map')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  rightTab === 'map' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                🗺️ {zh ? '空间建议地图' : 'Spatial Map'}
              </button>
              <button
                type="button"
                onClick={() => setRightTab('context')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  rightTab === 'context' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                📊 {zh ? '负荷统计' : 'Context'}
              </button>
              <button
                type="button"
                onClick={() => setRightTab('budget')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  rightTab === 'budget' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                💸 {zh ? '预算与账本' : 'Budget'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsMapExpanded(true)}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100 shadow-2xs"
              title={zh ? '展开全屏大地图' : 'Expand Map'}
            >
              ⛶ {zh ? '大地图' : 'Expand'}
            </button>
          </div>

          {rightTab === 'map' ? (
            <div className="flex-1 min-h-[380px] p-2 flex flex-col">
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
                onChangePlaceKind={handleChangePlaceKind}
                onHoverPlace={setHighlightedPlaceId}
                visitCountByPlaceId={visitCountByPlaceId}
                language={language}
                showLegend={false}
                variant="compact"
                legByPair={legByPair}
                tripId={tripId}
                sharedViewRef={sharedViewRef}
                ownsSharedView={ownsSharedView}
              />
            </div>
          ) : rightTab === 'budget' ? (
            <PlannerBudgetLedger
              key={selectedTrip.id}
              trip={selectedTrip}
              scheduledPlaces={scheduled}
              allPlaces={tripPlaces}
              activeDate={activeDate}
              initialPlaceId={budgetInitialPlaceId}
              onClearInitialPlaceId={onClearInitialPlaceId}
              expenses={currentExpenses}
              onAddExpense={handleAddExpense}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
              members={currentMembers}
              onUpdateMembers={handleUpdateMembers}
              onUpdateFxRates={handleUpdateFxRates}
              language={language}
            />
          ) : (
            <div className="p-4 overflow-y-auto">
              <h2 className="text-sm font-semibold text-stone-900">{zh ? '当天负荷统计' : 'Day Stats'}</h2>
              <div className="mt-3 space-y-5">
                <DayLoadBreakdown zh={zh} load={dayAssessment.load} />

                <div>
                  <h3 className="mb-2 text-xs font-semibold text-stone-700">{zh ? '当天风险' : 'Day risks'}</h3>
                  <DayRiskList
                    zh={zh}
                    assessment={dayAssessment}
                    onHighlight={setHighlightedPlaceId}
                  />
                </div>
              </div>

              <div className="mt-6 divide-y divide-stone-100 text-xs">
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '当天已排' : 'Day Scheduled'}</span><strong>{scheduled.length}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '候选池' : 'Candidates'}</span><strong>{pendingCandidates.length}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '暂不考虑' : 'Shelved'}</span><strong>{droppedPlaces.length}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">Must</span><strong>{mustScheduled}/{mustTotal}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '地点时长' : 'Place time'}</span><strong>{Math.round(scheduledMinutes / 60 * 10) / 10}h</strong></div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-stone-700">{zh ? '区域分布' : 'Area load'}</h3>
                  <span className="text-[10px] text-stone-400">{areaCounts.length}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {areaCounts.slice(0, 6).map((item) => (
                    <div key={item.area}>
                      <div className="mb-1 flex justify-between text-[10px] text-stone-500"><span>{item.area}</span><span>{item.count}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-stone-700" style={{ width: `${Math.max(12, item.count / maxAreaCount * 100)}%` }} /></div>
                    </div>
                  ))}
                  {areaCounts.length === 0 ? <p className="text-[11px] leading-5 text-stone-400">{zh ? '采集时填写区域，后续 AI 才能更好地做空间聚类。' : 'Add areas while researching so future AI planning can cluster places spatially.'}</p> : null}
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-stone-50 p-3 text-[11px] leading-5 text-stone-500 ring-1 ring-stone-200">
                {zh
                  ? '当前版本只做人工编排：研究在 Google Maps 完成，Planner 负责候选池、空间地图排程、顺序调整和回到 Google Maps 执行。'
                  : 'Research in Google Maps, then pool → map → day skeleton → Google Maps.'}
              </div>
            </div>
          )}
        </aside>
  );
}
