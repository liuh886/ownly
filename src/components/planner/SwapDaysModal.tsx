'use client';

import type { PlannerControllerReturn } from './usePlannerController';
import { formatDay } from './planner-home-shared';

export interface SwapDaysModalProps {
  zh: boolean;
  language: PlannerControllerReturn['language'];
  isSwapDaysModalOpen: boolean;
  setIsSwapDaysModalOpen: (open: boolean) => void;
  tripDates: string[];
  activeDate: string;
  placesByDate: PlannerControllerReturn['placesByDate'];
  swapTargetDate: string;
  setSwapTargetDate: (date: string) => void;
  handleSwapDays: PlannerControllerReturn['handleSwapDays'];
}

export function SwapDaysModal(props: SwapDaysModalProps) {
  const {
    zh, language, isSwapDaysModalOpen, setIsSwapDaysModalOpen, tripDates,
    activeDate, placesByDate, swapTargetDate, setSwapTargetDate, handleSwapDays,
  } = props;
  return (
    <>
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
    </>
  );
}
