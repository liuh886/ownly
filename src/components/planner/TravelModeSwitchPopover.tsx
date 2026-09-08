'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlannerTravelMode, PlannerTrip } from '@/domain/planner';
import { calculateDefaultTripLeg, PLANNER_TRAVEL_MODE_CONFIG } from '@/domain/planner';
import { type PlannerScheduledPlace } from '@/domain/planner-visits';

interface TravelModeSwitchPopoverProps {
  zh: boolean;
  selectedTrip: PlannerTrip;
  place: PlannerScheduledPlace;
  nextPlace: PlannerScheduledPlace;
  currentMode: PlannerTravelMode;
  isCleared: boolean;
  onSelectMode: (mode: PlannerTravelMode) => void;
  onClearEstimate: () => void;
  onRecalculateEstimate: () => void;
  onClose: () => void;
}

export function TravelModeSwitchPopover({
  zh,
  selectedTrip,
  place,
  nextPlace,
  currentMode,
  isCleared,
  onSelectMode,
  onClearEstimate,
  onRecalculateEstimate,
  onClose,
}: TravelModeSwitchPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

  useEffect(() => {
    if (popoverRef.current) {
      const rect = popoverRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const spaceBelow = viewportHeight - rect.top;
      const neededHeight = 250;
      if (spaceBelow < neededHeight && rect.top > spaceBelow) {
        setPlacement('top');
      } else {
        setPlacement('bottom');
      }
    }
  }, []);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className={`absolute left-0 z-50 flex flex-col gap-0.5 rounded-xl border border-stone-200 bg-white/95 backdrop-blur-md p-1.5 shadow-xl ring-1 ring-black/5 min-w-[190px] max-w-[260px] max-h-[min(300px,calc(100vh-120px))] overflow-y-auto overscroll-contain transition-all ${
        placement === 'top' ? 'bottom-full mb-1.5 origin-bottom-left' : 'top-full mt-1.5 origin-top-left'
      }`}
    >
      <div className="px-2 py-0.5 text-[9.5px] font-bold text-stone-400 uppercase tracking-wider">
        {zh ? '交通方式与预估' : 'Travel Mode & Estimate'}
      </div>
      {(['driving', 'walking', 'motorcycle', 'bicycling', 'transit'] as PlannerTravelMode[]).map((m) => {
        const cfg = PLANNER_TRAVEL_MODE_CONFIG[m];
        const isCurrent = !isCleared && currentMode === m;
        const previewLeg = calculateDefaultTripLeg(selectedTrip, place, nextPlace, m);
        const previewDuration = previewLeg?.duration_minutes ?? cfg.defaultDuration;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMode(m)}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] text-left transition ${
              isCurrent
                ? 'bg-sky-50 font-bold text-sky-900 ring-1 ring-sky-300/60'
                : 'text-stone-700 hover:bg-stone-50 hover:text-stone-900'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span>{cfg.emoji}</span>
              <span>{zh ? cfg.labelZh : cfg.labelEn}</span>
            </span>
            <span className="text-[10px] text-stone-400 font-mono">
              ~{previewDuration}m {isCurrent ? '✓' : ''}
            </span>
          </button>
        );
      })}
      <div className="my-0.5 border-t border-stone-100" />
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={onClearEstimate}
          className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-left transition ${
            isCleared
              ? 'bg-stone-100 font-bold text-stone-900 ring-1 ring-stone-300'
              : 'text-stone-600 hover:bg-rose-50 hover:text-rose-700'
          }`}
          title={zh ? '两站之间不计入交通路程时间' : 'Do not calculate commute time between these stops'}
        >
          <span>🚫</span>
          <span>{zh ? '清除预估' : 'Clear'}</span>
          {isCleared ? <span className="text-[10px] font-bold text-stone-900">✓</span> : null}
        </button>
        <button
          type="button"
          onClick={onRecalculateEstimate}
          className="flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-stone-600 transition hover:bg-sky-50 hover:text-sky-800"
          title={zh ? '按行程默认交通方式重新计算本段' : 'Recalculate this leg with the trip default mode'}
        >
          <span>↻</span>
          <span>{zh ? '重新计算' : 'Recalc'}</span>
        </button>
      </div>
    </div>
  );
}
