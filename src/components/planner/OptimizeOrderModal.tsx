'use client';

import { useState } from 'react';
import { Sheet } from '@/components/common/Sheet';
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
  const [showKeyForm, setShowKeyForm] = useState(computation.orsFallback === 'missing_key');
  const [lastFallback, setLastFallback] = useState(computation.orsFallback);

  // Recompute swaps in a fresh computation object; auto-open the key form when
  // the new result reports a missing key, but never auto-close a manually
  // opened form. Render-phase sync (no effect) per React docs.
  if (computation.orsFallback !== lastFallback) {
    setLastFallback(computation.orsFallback);
    if (computation.orsFallback === 'missing_key') setShowKeyForm(true);
  }

  // (Sheet owns Escape / backdrop dismissal; no local key handler needed.)

  const movedCount = computation.orderedPlaces.filter(
    (place, index) => computation.originalPlaces[index]?.id !== place.id,
  ).length;

  const matrixSourceLabel = computation.matrixSource === 'openrouteservice'
    ? (zh ? '真实路网时间 (OpenRouteService)' : 'Real road-network times (OpenRouteService)')
    : (zh ? '粗略估算 (直线距离启发式，跨河/堵车会有偏差)' : 'Rough estimate (straight-line heuristic; bridges/traffic not modeled)');

  return (
    <Sheet
      open
      onClose={onClose}
      title={zh ? '✨ 优化当天顺序' : '✨ Optimize Day Order'}
      description={`${computation.date} · ${computation.orderedPlaces.length} ${zh ? '个游览点' : 'stops'}`}
      size="lg"
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 touch-manipulation rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold text-stone-600 transition duration-150 active:scale-[0.98] hover:bg-stone-100 sm:flex-none sm:px-4"
          >
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApply(computation)}
            className="min-h-11 flex-1 touch-manipulation rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white transition duration-150 active:scale-[0.98] hover:bg-emerald-700 disabled:opacity-50 sm:flex-none sm:px-5"
          >
            {busy ? (zh ? '应用中…' : 'Applying…') : (zh ? '应用新顺序' : 'Apply new order')}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
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

          {computation.orsFallback ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
              {computation.orsFallback === 'missing_key'
                ? (zh
                  ? '⚠️ 本次使用粗略估算：未配置 OpenRouteService key（可在下方填入后重算）。'
                  : '⚠️ Rough estimates used: no OpenRouteService key configured (add one below and recompute).')
                : (zh
                  ? '⚠️ 本次使用粗略估算：ORS 请求失败，已回退（可稍后重试）。'
                  : '⚠️ Rough estimates used: the ORS request failed and fell back (retry later).')}
            </div>
          ) : null}

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
                  className="min-h-11 min-w-0 flex-1 touch-manipulation rounded-lg border border-stone-200 px-2 py-1.5 text-base outline-none focus:border-stone-400 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    saveOrsApiKey(apiKeyDraft);
                    setApiKeyDraft('');
                    setShowKeyForm(false);
                    onRecompute();
                  }}
                  className="min-h-11 shrink-0 touch-manipulation rounded-lg bg-stone-800 px-3 py-1.5 text-sm font-semibold text-white transition duration-150 active:scale-[0.98] hover:bg-stone-700"
                >
                  {zh ? '保存并重算' : 'Save & recompute'}
                </button>
              </div>
            ) : null}
          </div>
      </div>
    </Sheet>
  );
}
