'use client';

import type { PlannerControllerReturn } from './usePlannerController';
import { formatDay } from './planner-home-shared';

export interface PlannerDateNavProps {
  zh: boolean;
  language: PlannerControllerReturn['language'];
  dateNavRef: PlannerControllerReturn['dateNavRef'];
  poolView: boolean;
  setPoolView: (view: boolean) => void;
  sortedPendingCandidates: PlannerControllerReturn['sortedPendingCandidates'];
  tripDates: string[];
  activeDate: string;
  placesByDate: PlannerControllerReturn['placesByDate'];
  setSelectedDate: (date: string) => void;
  draggingDate: string | null;
  setDraggingDate: (date: string | null) => void;
  dragOverDate: string | null;
  setDragOverDate: (date: string | null) => void;
  handleSwapDays: PlannerControllerReturn['handleSwapDays'];
  setSwapTargetDate: (date: string) => void;
  setIsSwapDaysModalOpen: (open: boolean) => void;
  selectedTrip: PlannerControllerReturn['selectedTrip'];
  urgencies: PlannerControllerReturn['urgencies'];
  daysOut: number;
  weatherRelevant: boolean;
  weather: PlannerControllerReturn['weather'];
}

export function PlannerDateNav(props: PlannerDateNavProps) {
  const {
    zh, language, dateNavRef, poolView, setPoolView, sortedPendingCandidates,
    tripDates, activeDate, placesByDate, setSelectedDate, draggingDate, setDraggingDate,
    dragOverDate, setDragOverDate, handleSwapDays, setSwapTargetDate, setIsSwapDaysModalOpen,
    selectedTrip, urgencies, daysOut, weatherRelevant, weather,
  } = props;
  return (
    <>
      <nav ref={dateNavRef} className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" aria-label={zh ? '日期导航' : 'Date navigation'}>
        <button
          key="__pool__"
          type="button"
          data-date="__pool__"
          onClick={() => setPoolView(true)}
          className={`shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all shadow-2xs select-none ${
            poolView
              ? 'bg-stone-900 text-white shadow-xs'
              : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900'
          }`}
          title={zh ? '查看全部候选池（主区切换，地图保持当天视角）' : 'View full candidate pool (main area switches, map keeps day view)'}
        >
          <span>🗂️ {zh ? '候选池' : 'Pool'}</span>
          {sortedPendingCandidates.length > 0 ? (
            <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums ${
              poolView ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-600'
            }`}>
              {sortedPendingCandidates.length}
            </span>
          ) : null}
        </button>
        {tripDates.map((date, index) => {
          const isSelected = !poolView && activeDate === date;
          const isDragOver = dragOverDate === date;
          const isDraggingThis = draggingDate === date;
          const dayPlacesCount = placesByDate[date]?.length || 0;
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              draggable={tripDates.length > 1}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', date);
                e.dataTransfer.effectAllowed = 'move';
                setDraggingDate(date);
              }}
              onDragOver={(e) => {
                if (draggingDate && draggingDate !== date) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverDate !== date) setDragOverDate(date);
                }
              }}
              onDragLeave={() => {
                if (dragOverDate === date) setDragOverDate(null);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                const sourceDate = e.dataTransfer.getData('text/plain') || draggingDate;
                setDraggingDate(null);
                setDragOverDate(null);
                if (sourceDate && sourceDate !== date) {
                  await handleSwapDays(sourceDate, date);
                }
              }}
              onDragEnd={() => {
                setDraggingDate(null);
                setDragOverDate(null);
              }}
              onClick={() => {
                setPoolView(false);
                setSelectedDate(date);
              }}
              className={`group shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all shadow-2xs cursor-grab active:cursor-grabbing select-none ${
                isDragOver
                  ? 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-900 border-emerald-400 scale-105 shadow-md z-10'
                  : isDraggingThis
                    ? 'opacity-40 border-dashed border-stone-400 bg-stone-100 text-stone-400'
                    : isSelected
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900'
              }`}
              title={zh ? '点击切换视图；按住可拖拽至其它天整体互换路线日程' : 'Click to select; drag to swap day itinerary with another day'}
            >
              <span>{zh ? `第${index + 1}天` : `Day ${index + 1}`}</span>
              <span className={`text-[11px] ${isSelected ? 'text-stone-300' : 'text-stone-400 group-hover:text-stone-500'}`}>
                {formatDay(date, language)}
              </span>
              {dayPlacesCount > 0 ? (
                <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums ${
                  isSelected ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-600'
                }`}>
                  {dayPlacesCount}
                </span>
              ) : null}
            </button>
          );
        })}

        {tripDates.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              const currentIndex = tripDates.indexOf(activeDate);
              const defaultTarget = tripDates[currentIndex + 1] || tripDates[currentIndex - 1] || tripDates[0];
              setSwapTargetDate(defaultTarget);
              setIsSwapDaysModalOpen(true);
            }}
            className="group shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50/80 px-2.5 py-2 text-xs font-semibold text-stone-700 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-900 transition shadow-2xs"
            title={zh ? '整体互换某两天的路线日程（也可直接拖动上方标签）' : 'Swap itinerary between two days'}
          >
            <span className="text-stone-500 group-hover:text-stone-900">⇄</span>
            <span>{zh ? '互换' : 'Swap'}</span>
          </button>
        ) : null}
      </nav>

      {/* Departure Intelligence Bar */}
      {(urgencies.length > 0 || (weatherRelevant && weather.length > 0)) && selectedTrip ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
              ⏰ {zh ? '出发情报' : 'Departure Intel'}
              <span className="ml-1 rounded-full bg-amber-200/70 px-1.5 py-0 text-[9px] font-bold text-amber-800">
                {daysOut >= 0 ? `D-${daysOut}` : ''}
              </span>
            </span>
            {weatherRelevant ? (
              <div className="flex gap-1">
                {weather.slice(0, 7).map((w) => (
                  <span
                    key={w.date}
                    className={`inline-flex flex-col items-center rounded-md px-1.5 py-0.5 text-[9px] leading-tight ${
                      w.date === activeDate
                        ? 'bg-white ring-1 ring-amber-400 font-bold'
                        : 'bg-white/60 text-stone-500'
                    }`}
                    title={w.date}
                  >
                    <span>{w.label}</span>
                    <span>{w.temp_min}°~{w.temp_max}°</span>
                    {w.is_rainy ? <span className="text-sky-600">🌧️</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {urgencies.length > 0 ? (
            <ul className="space-y-0.5 mt-1">
              {urgencies.slice(0, 5).map((u, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px] leading-4">
                  <span className={u.severity === 'urgent' ? 'text-red-600 font-bold' : 'text-amber-600'}>{u.severity === 'urgent' ? '🔴' : '🟡'}</span>
                  <span className="text-stone-700">{u.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
