'use client';

import { Sheet } from '@/components/common/Sheet';
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
  const close = () => setIsSwapDaysModalOpen(false);
  const canConfirm = Boolean(swapTargetDate) && swapTargetDate !== activeDate;
  return (
    <Sheet
      open={isSwapDaysModalOpen}
      onClose={close}
      title={zh ? '⇄ 互换行程日程' : '⇄ Swap Day Itineraries'}
      description={zh
        ? '将当前选中日期的全部排期路线与目标日期整体对调。两天的游览先后顺位、时间设定与锁定标记将 100% 完整平移。'
        : 'Atomically swap all scheduled visits between the active day and a target day. Sequence orders, custom timings, and pinned locks are preserved.'}
      size="sm"
      footer={(
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="min-h-11 flex-1 touch-manipulation rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-600 transition duration-150 active:scale-[0.98] hover:bg-stone-50"
          >
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              close();
              void handleSwapDays(activeDate, swapTargetDate);
            }}
            className="min-h-11 flex-1 touch-manipulation rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition duration-150 active:scale-[0.98] hover:bg-stone-800 disabled:opacity-40"
          >
            {zh ? '确认互换' : 'Confirm Swap'}
          </button>
        </div>
      )}
    >
      <div className="grid grid-cols-2 items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <div className="space-y-1">
          <span className="text-xs font-bold text-stone-500">{zh ? '当前日期 (源)' : 'Source Day'}</span>
          <div className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900">
            {zh ? `第${tripDates.indexOf(activeDate) + 1}天` : `Day ${tripDates.indexOf(activeDate) + 1}`} ({formatDay(activeDate, language)})
            <div className="mt-0.5 text-xs font-normal text-stone-500">
              {placesByDate[activeDate]?.length || 0} {zh ? '个地点' : 'places'}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-bold text-stone-500">{zh ? '目标互换日期' : 'Target Day'}</span>
          <select
            value={swapTargetDate}
            onChange={(e) => setSwapTargetDate(e.target.value)}
            className="min-h-11 w-full touch-manipulation rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-base font-semibold text-stone-900 focus:border-stone-900 focus:outline-hidden sm:text-sm"
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
    </Sheet>
  );
}
