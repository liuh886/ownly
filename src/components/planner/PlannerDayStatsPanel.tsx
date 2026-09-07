'use client';

import { useEffect, useRef } from 'react';
import {
  PLANNER_LOAD_LEVEL_LABEL,
  type PlannerDayAssessment,
  type PlannerDayLoad,
} from '@/domain/planner-schedule';

const LOAD_LEVEL_STYLE: Record<PlannerDayLoad['level'], string> = {
  heavy: 'bg-rose-50 text-rose-800 ring-rose-200',
  tight: 'bg-amber-50 text-amber-800 ring-amber-200',
  moderate: 'bg-sky-50 text-sky-800 ring-sky-200',
  easy: 'bg-stone-100 text-stone-600 ring-stone-200',
};

/** Inline day-load breakdown — the former DayLoadBadge popover, now a permanent panel section. */
export function DayLoadBreakdown({ zh, load }: { zh: boolean; load: PlannerDayLoad }) {
  const rows: Array<{ label: string; text: string; ratio: number }> = [
    { label: zh ? '游览' : 'Stops', text: `${Math.round(load.activity_minutes)} min`, ratio: Math.min(1, load.activity_minutes / 600) },
    { label: zh ? '交通' : 'Transit', text: `${Math.round(load.transit_minutes)} min`, ratio: Math.min(1, load.transit_minutes / 180) },
    { label: zh ? '站点' : 'Places', text: `${load.stop_count}`, ratio: Math.min(1, load.stop_count / 8) },
    {
      label: zh ? '跨度' : 'Span',
      text: load.span_minutes !== null ? `${Math.floor(load.span_minutes / 60)}h${load.span_minutes % 60 > 0 ? `${load.span_minutes % 60}m` : ''}` : '—',
      ratio: load.span_minutes !== null ? Math.min(1, load.span_minutes / 720) : 0,
    },
  ];

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-stone-700">{zh ? '当天负荷构成' : 'Day load breakdown'}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${LOAD_LEVEL_STYLE[load.level]}`}>
          {zh ? '负荷' : 'Load'} {load.score} · {PLANNER_LOAD_LEVEL_LABEL[load.level]}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-8 shrink-0 font-semibold text-stone-500">{row.label}</span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-stone-500" style={{ width: `${Math.round(row.ratio * 100)}%` }} />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] text-stone-600">{row.text}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 px-1 pt-0.5 text-[10.5px] text-stone-600">
          <span>{load.lunch_ok ? '✅' : '⚠️'} {zh ? '午餐' : 'Lunch'}</span>
          <span>{load.dinner_ok ? '✅' : '⚠️'} {zh ? '晚餐' : 'Dinner'}</span>
          {load.longest_stretch_minutes !== null ? (
            <span className="ml-auto font-mono text-[10px] text-stone-500">
              {zh ? '最长连轴' : 'Stretch'} {Math.floor(load.longest_stretch_minutes / 60)}h{load.longest_stretch_minutes % 60 > 0 ? `${load.longest_stretch_minutes % 60}m` : ''}
            </span>
          ) : null}
        </div>
        {load.suggestion ? (
          <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
            💡 {load.suggestion}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Actionable per-day risk list — moved out of the inline timeline banner. */
export function DayRiskList({ zh, assessment, onHighlight }: {
  zh: boolean;
  assessment: PlannerDayAssessment;
  onHighlight?: (placeId: string | null) => void;
}) {
  const riskCount =
    assessment.time_overlaps.length +
    assessment.travel_conflicts.length +
    assessment.opening_hours_warnings.length +
    (assessment.is_overloaded ? 1 : 0);
  if (riskCount === 0) {
    return (
      <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        ✅ {zh ? '当天无时段重叠、交通冲突或营业时间风险。' : 'No overlaps, travel conflicts or opening-hours risks today.'}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {assessment.time_overlaps.map((overlap) => (
        <RiskRow
          key={`overlap-${overlap.fromId}-${overlap.toId}`}
          tone="rose"
          icon="⚠️"
          highlightIds={[overlap.fromId, overlap.toId]}
          onHighlight={onHighlight}
        >
          {zh
            ? `${overlap.fromTitle} 与 ${overlap.toTitle} 时段重叠（${overlap.fromTime} / ${overlap.toTime}）`
            : `${overlap.fromTitle} overlaps ${overlap.toTitle} (${overlap.fromTime} / ${overlap.toTime})`}
        </RiskRow>
      ))}
      {assessment.travel_conflicts.map((conflict) => (
        <RiskRow
          key={conflict.id}
          tone="rose"
          icon="🚨"
          onHighlight={onHighlight}
        >
          {zh
            ? `交通耗时冲突: 从「${conflict.from_title}」出发预计到达时间迟于「${conflict.to_title}」开始时间（晚 ${conflict.late_by_minutes} 分钟）`
            : `Travel conflict: arrival from "${conflict.from_title}" is ${conflict.late_by_minutes}m late for "${conflict.to_title}"`}
        </RiskRow>
      ))}
      {assessment.opening_hours_warnings.map((oh) => (
        <RiskRow
          key={`${oh.visit_id}-${oh.place_id}`}
          tone="amber"
          icon="⚠️"
          highlightIds={[oh.visit_id]}
          onHighlight={onHighlight}
        >
          <b>{oh.title}</b>: {oh.reason}
        </RiskRow>
      ))}
      {assessment.is_overloaded ? (
        <RiskRow tone="amber" icon="⚠️">
          {assessment.overload_reason ?? ''}
        </RiskRow>
      ) : null}
    </div>
  );
}

function RiskRow({ tone, icon, highlightIds, onHighlight, children }: {
  tone: 'rose' | 'amber';
  icon: string;
  highlightIds?: string[];
  onHighlight?: (placeId: string | null) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => () => onHighlight?.(null), [onHighlight]);
  const toneClass = tone === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-900'
    : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div
      ref={ref}
      className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-2xs ${toneClass}`}
      onMouseEnter={() => highlightIds?.forEach((id) => onHighlight?.(id))}
      onMouseLeave={() => highlightIds?.forEach(() => onHighlight?.(null))}
    >
      <span className="leading-5">{icon}</span>
      <span className="min-w-0 flex-1 leading-5">{children}</span>
    </div>
  );
}

/** Compact single-line entry shown where the full banner used to sit. */
export function DayRiskSummary({ zh, assessment, onViewDetails }: {
  zh: boolean;
  assessment: PlannerDayAssessment;
  onViewDetails: () => void;
}) {
  const riskCount =
    assessment.time_overlaps.length +
    assessment.travel_conflicts.length +
    assessment.opening_hours_warnings.length +
    (assessment.is_overloaded ? 1 : 0);
  if (riskCount === 0) return null;
  return (
    <button
      type="button"
      onClick={onViewDetails}
      className={`mx-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-2xs transition hover:brightness-95 ${
        assessment.time_overlaps.length > 0 || assessment.travel_conflicts.length > 0
          ? 'border-rose-200 bg-rose-50 text-rose-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <span>⚠️</span>
      <span>{zh ? `${riskCount} 条当天风险` : `${riskCount} day risk${riskCount > 1 ? 's' : ''}`}</span>
      <span className="ml-auto text-[10px] opacity-70">{zh ? '查看负荷统计 →' : 'View stats →'}</span>
    </button>
  );
}
