'use client';

import { useEffect, useState } from 'react';
import type { PlannerDayOptimizationComputation } from '@/domain/planner-optimization';
import { saveOrsApiKey } from '@/lib/openrouteservice';

interface OptimizeOrderModalProps {
  zh: boolean;
  computation: PlannerDayOptimizationComputation;
  busy: boolean;
  onClose: () => void;
  onApply: (computation: PlannerDayOptimizationComputation) => void;
  onRecompute: () => void;
}

export function OptimizeOrderModal({
  zh,
  computation,
  busy,
  onClose,
  onApply,
  onRecompute,
}: OptimizeOrderModalProps) {
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const movedCount = computation.orderedPlaces.filter(
    (place, index) => computation.originalPlaces[index]?.id !== place.id,
  ).length;

  const matrixSourceLabel = computation.matrixSource === 'openrouteservice'
    ? (zh ? '真实路网时间 (OpenRouteService)' : 'Real road-network times (OpenRouteService)')
    : (zh ? '粗略估算 (直线距离启发式，跨河/堵车会有偏差)' : 'Rough estimate (straight-line heuristic; bridges/traffic not modeled)');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={zh ? '优化当天顺序' : 'Optimize day order'}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-stone-950">
              <span>✨</span>
              <span>{zh ? '优化当天顺序' : 'Optimize Day Order'}</span>
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {computation.date} · {computation.orderedPlaces.length} {zh ? '个游览点' : 'stops'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-200/60 hover:text-stone-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-stone-500">{zh ? '原始' : 'Original'}</span>
              <span className="text-sm font-bold text-stone-700">{computation.originalMinutes}{zh ? ' 分钟' : ' min'}</span>
            </div>
            <span className="text-stone-400">→</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-stone-500">{zh ? '优化后' : 'Optimized'}</span>
              <span className="text-sm font-bold text-stone-700">{computation.optimizedMinutes}{zh ? ' 分钟' : ' min'}</span>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              {zh ? `预计节省 ${computation.savedMinutes} 分钟` : `~${computation.savedMinutes} min saved`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <span>⏱️</span>
            <span>{matrixSourceLabel}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-500">{zh ? '当前顺序' : 'Current'}</p>
              <ol className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/50 p-2 text-xs">
                {computation.originalPlaces.map((place, index) => (
                  <li key={place.id} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-right text-[10px] font-bold text-stone-400">{index + 1}</span>
                    <span className="truncate text-stone-600" title={place.title}>{place.title}</span>
                    {place.is_anchor ? <span title={zh ? '锚点' : 'anchor'}>⚓</span> : null}
                    {place.locked ? <span title={zh ? '已锁定' : 'locked'}>🔒</span> : null}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-emerald-700">{zh ? '优化后' : 'Optimized'}</p>
              <ol className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-emerald-200 bg-emerald-50/30 p-2 text-xs">
                {computation.orderedPlaces.map((place, index) => (
                  <li key={place.id} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-right text-[10px] font-bold text-emerald-600">{index + 1}</span>
                    <span className={`truncate ${place.is_anchor || place.locked ? 'font-semibold text-stone-700' : 'text-stone-800'}`} title={place.title}>
                      {place.title}
                    </span>
                    {place.is_anchor ? <span title={zh ? '锚点' : 'anchor'}>⚓</span> : null}
                    {place.locked ? <span title={zh ? '已锁定' : 'locked'}>🔒</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <p className="text-[11px] text-stone-400">
            {zh
              ? `调整 ${movedCount} 个游览点的先后顺序；锁定 🔒 与锚点 ⚓ 不会移动。应用后各点时间推断与营业时间告警将自动重算。`
              : `Reorders ${movedCount} stops; locked 🔒 and anchored ⚓ stops stay put. Inferred times and opening-hour warnings recompute after applying.`}
          </p>

          <div className="rounded-xl border border-stone-200 p-3">
            <button
              type="button"
              onClick={() => setShowKeyForm((prev) => !prev)}
              className="text-[11px] font-semibold text-stone-600 hover:text-stone-800"
            >
              {showKeyForm ? '▾' : '▸'} OpenRouteService API Key {zh ? '（可选，用于真实路网时间）' : '(optional, for real road-network times)'}
            </button>
            {showKeyForm ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder="eyJ... (openrouteservice.org)"
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-stone-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    saveOrsApiKey(apiKeyDraft);
                    setApiKeyDraft('');
                    setShowKeyForm(false);
                    onRecompute();
                  }}
                  className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700"
                >
                  {zh ? '保存并重算' : 'Save & recompute'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100"
          >
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApply(computation)}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? (zh ? '应用中…' : 'Applying…') : (zh ? '应用新顺序' : 'Apply new order')}
          </button>
        </div>
      </div>
    </div>
  );
}
