import { useMemo, useState } from 'react';
import { checkOpeningHoursCollision } from '@/domain/planner';
import type { PlannerScheduledPlace } from '@/domain/planner-visits';
import {
  findPlannerTimeOverlaps,
  getScheduledEndTime,
  validatePlannerTiming,
} from '@/domain/planner-schedule';

interface PlaceTimingModalProps {
  open: boolean;
  place: PlannerScheduledPlace | null;
  dayOtherPlaces?: PlannerScheduledPlace[];
  onClose: () => void;
  onSave: (visitId: string, timing: { scheduled_start?: string; duration_minutes?: number }) => Promise<void>;
  language?: 'zh' | 'en';
}

const QUICK_START_TIMES = [
  { labelZh: '早晨 09:00', labelEn: 'Morning 09:00', value: '09:00' },
  { labelZh: '午餐 11:30', labelEn: 'Lunch 11:30', value: '11:30' },
  { labelZh: '下午 14:00', labelEn: 'Afternoon 14:00', value: '14:00' },
  { labelZh: '傍晚 17:00', labelEn: 'Evening 17:00', value: '17:00' },
  { labelZh: '夜间 19:30', labelEn: 'Night 19:30', value: '19:30' },
];

const QUICK_DURATIONS = [
  { labelZh: '30 分钟', labelEn: '30m', minutes: 30 },
  { labelZh: '1 小时', labelEn: '1h', minutes: 60 },
  { labelZh: '1.5 小时', labelEn: '1.5h', minutes: 90 },
  { labelZh: '2 小时', labelEn: '2h', minutes: 120 },
  { labelZh: '3 小时', labelEn: '3h', minutes: 180 },
];

function timingIssueText(code: string, zh: boolean): string {
  if (!zh) {
    if (code === 'INVALID_START_TIME') return 'Start time must use 24-hour HH:mm format.';
    if (code === 'INVALID_DURATION') return 'Duration must be an integer between 1 and 1440 minutes.';
    if (code === 'CROSSES_MIDNIGHT') return 'Ordinary stops must finish on the same calendar day.';
    return 'Invalid schedule timing.';
  }
  if (code === 'INVALID_START_TIME') return '开始时间必须使用 24 小时 HH:mm 格式。';
  if (code === 'INVALID_DURATION') return '停留时长必须是 1–1440 分钟的整数。';
  if (code === 'CROSSES_MIDNIGHT') return '普通地点不能跨越午夜；过夜安排应建模为明确的 anchor。';
  return '行程时段无效。';
}

export function PlaceTimingModal({
  open,
  place,
  dayOtherPlaces = [],
  onClose,
  onSave,
  language = 'zh',
}: PlaceTimingModalProps) {
  const zh = language === 'zh';
  const [startTime, setStartTime] = useState<string>(() => place?.scheduled_start || '');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>(() => place?.duration_minutes || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const normalizedDuration = typeof durationMinutes === 'number' ? durationMinutes : undefined;
  const timingErrors = useMemo(
    () => validatePlannerTiming(
      startTime || undefined,
      normalizedDuration,
      { allowCrossMidnight: Boolean(place?.is_anchor) },
    ).filter((issue) => issue.severity === 'error'),
    [normalizedDuration, place?.is_anchor, startTime],
  );

  const computedEndTime = useMemo(
    () => getScheduledEndTime(startTime || undefined, normalizedDuration),
    [startTime, normalizedDuration],
  );

  const hoursWarning = useMemo(() => {
    if (!place?.open_hours || !place.scheduled_date) return null;
    const result = checkOpeningHoursCollision(place.open_hours, place.scheduled_date, place.preferred_window);
    return result.isCollision ? result.reason : null;
  }, [place]);

  const overlapWarning = useMemo(() => {
    if (!place?.scheduled_date || !startTime || !normalizedDuration) return null;
    const prospective: PlannerScheduledPlace = {
      ...place,
      scheduled_start: startTime,
      duration_minutes: normalizedDuration,
    };
    const overlap = findPlannerTimeOverlaps([...dayOtherPlaces, prospective], place.scheduled_date)
      .find((item) => item.fromId === place.id || item.toId === place.id);
    if (!overlap) return null;
    return zh
      ? `所选时段与【${overlap.fromId === place.id ? overlap.toTitle : overlap.fromTitle}】存在时间重叠（${overlap.fromTime} / ${overlap.toTime}）。`
      : `Selected time overlaps ${overlap.fromId === place.id ? overlap.toTitle : overlap.fromTitle} (${overlap.fromTime} / ${overlap.toTime}).`;
  }, [dayOtherPlaces, normalizedDuration, place, startTime, zh]);

  if (!open || !place) return null;

  const handleSave = async () => {
    if (timingErrors.length > 0) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(place.visit_id, {
        scheduled_start: startTime.trim() || undefined,
        duration_minutes: normalizedDuration,
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(place.visit_id, { scheduled_start: undefined, duration_minutes: undefined });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-base font-bold text-stone-900"><span>🕒</span><span>{zh ? '调整行程时间' : 'Adjust Schedule Timing'}</span></h2>
            <p className="mt-0.5 max-w-xs truncate text-xs font-medium text-stone-500">{place.title} · {place.scheduled_date}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={zh ? '关闭' : 'Close'}>✕</button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-700">{zh ? '1. 开始时间 (24小时制)' : '1. Start Time (24-hour)'}</label>
          <div className="flex items-center gap-2">
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 shadow-2xs focus:border-stone-900 focus:outline-none" />
            {startTime ? <button type="button" onClick={() => setStartTime('')} className="rounded-lg border border-stone-200 px-2.5 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50">{zh ? '清空' : 'Clear'}</button> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_START_TIMES.map((item) => <button key={item.value} type="button" onClick={() => setStartTime(item.value)} className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${startTime === item.value ? 'bg-stone-900 font-semibold text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{zh ? item.labelZh : item.labelEn}</button>)}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-700">{zh ? '2. 停留 / 游览耗时' : '2. Visit Duration'}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="1440"
              step="5"
              placeholder={zh ? '例如 90' : 'e.g. 90'}
              value={durationMinutes}
              onChange={(event) => {
                const value = event.target.value;
                setDurationMinutes(value === '' ? '' : Number(value));
              }}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 shadow-2xs focus:border-stone-900 focus:outline-none"
            />
            <span className="text-xs font-medium text-stone-500">{zh ? '分钟' : 'mins'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_DURATIONS.map((item) => <button key={item.minutes} type="button" onClick={() => setDurationMinutes(item.minutes)} className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${durationMinutes === item.minutes ? 'bg-stone-900 font-semibold text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{zh ? item.labelZh : item.labelEn}</button>)}
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-stone-700">{zh ? '📅 日历投影预览' : '📅 Calendar Projection'}</span>
            {startTime && computedEndTime ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">VEVENT</span> : <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">date-only</span>}
          </div>
          <p className="font-mono text-sm font-semibold text-stone-800">{startTime && computedEndTime ? `${place.scheduled_date} ${startTime} - ${computedEndTime}` : `${place.scheduled_date} (${zh ? '日期级任务' : 'date-only task'})`}</p>
          <p className="text-[11px] leading-relaxed text-stone-500">{zh ? '开始时间与时长都明确时才生成具体时间块；订阅日历将在客户端下一次刷新时更新。' : 'A timed block is projected only when both start time and duration are explicit; subscribed calendars update on their next client refresh.'}</p>
        </div>

        {timingErrors.length > 0 ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">{timingErrors.map((issue) => <p key={issue.code}>{timingIssueText(issue.code, zh)}</p>)}</div> : null}
        {hoursWarning ? <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900"><span className="text-base leading-none">⚠️</span><div className="flex-1"><span className="font-semibold">{zh ? '营业日 / 偏好时段提示:' : 'Opening day / preferred-window warning:'}</span><p className="mt-0.5 text-[11px] text-amber-800">{hoursWarning}</p></div></div> : null}
        {overlapWarning ? <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900"><span className="text-base leading-none">⚠️</span><div className="flex-1"><span className="font-semibold">{zh ? '时段重叠预警:' : 'Time Overlap Warning:'}</span><p className="mt-0.5 text-[11px] text-rose-800">{overlapWarning}</p></div></div> : null}
        {saveError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">{saveError}</div> : null}

        <div className="flex items-center justify-between border-t border-stone-100 pt-2">
          <button type="button" onClick={() => void handleClear()} disabled={saving || (!place.scheduled_start && !place.duration_minutes)} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40">{zh ? '清除时间' : 'Clear Timing'}</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">{zh ? '取消' : 'Cancel'}</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || timingErrors.length > 0} className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50">{saving ? '…' : (zh ? '保存时段' : 'Save Timing')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
