import React, { useState, useMemo } from 'react';
import {
  checkOpeningHoursCollision,
  type PlannerTripPlace,
} from '@/domain/planner';
import { getScheduledEndTime } from '@/domain/planner-schedule';

interface PlaceTimingModalProps {
  open: boolean;
  place: PlannerTripPlace | null;
  dayOtherPlaces?: PlannerTripPlace[];
  onClose: () => void;
  onSave: (placeId: string, timing: { scheduled_start?: string; duration_minutes?: number }) => Promise<void>;
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

export const PlaceTimingModal: React.FC<PlaceTimingModalProps> = ({
  open,
  place,
  dayOtherPlaces = [],
  onClose,
  onSave,
  language = 'zh',
}) => {
  const zh = language === 'zh';
  const [startTime, setStartTime] = useState<string>(() => place?.scheduled_start || '');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>(() => place?.duration_minutes || '');
  const [saving, setSaving] = useState(false);

  const computedEndTime = useMemo(() => {
    if (!startTime || !durationMinutes || typeof durationMinutes !== 'number') return null;
    return getScheduledEndTime(startTime, durationMinutes);
  }, [startTime, durationMinutes]);

  const hoursWarning = useMemo(() => {
    if (!place?.open_hours || !place.scheduled_date) return null;
    const res = checkOpeningHoursCollision(place.open_hours, place.scheduled_date, startTime);
    return res.isCollision ? res.reason : null;
  }, [place, startTime]);

  const overlapWarning = useMemo(() => {
    if (!place || !startTime || !durationMinutes || typeof durationMinutes !== 'number' || !dayOtherPlaces.length) {
      return null;
    }
    const [startH, startM] = startTime.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM)) return null;
    const currentStart = startH * 60 + startM;
    const currentEnd = currentStart + durationMinutes;

    for (const other of dayOtherPlaces) {
      if (!other.scheduled_start || !other.duration_minutes || other.id === place.id) continue;
      const [otherH, otherM] = other.scheduled_start.split(':').map(Number);
      if (isNaN(otherH) || isNaN(otherM)) continue;
      const oStart = otherH * 60 + otherM;
      const oEnd = oStart + other.duration_minutes;

      if (Math.max(currentStart, oStart) < Math.min(currentEnd, oEnd)) {
        const oEndStr = getScheduledEndTime(other.scheduled_start, other.duration_minutes);
        return zh
          ? `所选时段 (${startTime}-${computedEndTime}) 与已安排的【${other.title}】(${other.scheduled_start}-${oEndStr}) 存在时间重叠。`
          : `Selected time (${startTime}-${computedEndTime}) overlaps with [${other.title}] (${other.scheduled_start}-${oEndStr}).`;
      }
    }
    return null;
  }, [startTime, durationMinutes, dayOtherPlaces, place, computedEndTime, zh]);

  if (!open || !place) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(place.id, {
        scheduled_start: startTime.trim() || undefined,
        duration_minutes: typeof durationMinutes === 'number' && durationMinutes > 0 ? durationMinutes : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await onSave(place.id, {
        scheduled_start: undefined,
        duration_minutes: undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl space-y-5"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
              <span>🕒</span>
              <span>{zh ? '调整行程时间' : 'Adjust Schedule Timing'}</span>
            </h2>
            <p className="mt-0.5 text-xs text-stone-500 truncate max-w-xs font-medium">
              {place.title} · {place.scheduled_date}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label={zh ? '关闭' : 'Close'}
          >
            ✕
          </button>
        </div>

        {/* Start Time Section */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-700">
            {zh ? '1. 开始时间 (24小时制)' : '1. Start Time (24-hour)'}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 shadow-2xs focus:border-stone-900 focus:outline-none"
            />
            {startTime ? (
              <button
                type="button"
                onClick={() => setStartTime('')}
                className="rounded-lg border border-stone-200 px-2.5 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50"
              >
                {zh ? '清空' : 'Clear'}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_START_TIMES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStartTime(item.value)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  startTime === item.value
                    ? 'bg-stone-900 text-white font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {zh ? item.labelZh : item.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Duration Section */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-700">
            {zh ? '2. 停留 / 游览耗时' : '2. Visit Duration'}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="1440"
              step="5"
              placeholder={zh ? '例如 90' : 'e.g. 90'}
              value={durationMinutes}
              onChange={(e) => {
                const val = e.target.value;
                setDurationMinutes(val === '' ? '' : Math.max(1, Number(val)));
              }}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 shadow-2xs focus:border-stone-900 focus:outline-none"
            />
            <span className="text-xs font-medium text-stone-500">{zh ? '分钟' : 'mins'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_DURATIONS.map((item) => (
              <button
                key={item.minutes}
                type="button"
                onClick={() => setDurationMinutes(item.minutes)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  durationMinutes === item.minutes
                    ? 'bg-stone-900 text-white font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {zh ? item.labelZh : item.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Timing Result & Google Calendar Preview */}
        <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-stone-700">{zh ? '📅 日程与日历预览:' : '📅 Calendar Projection:'}</span>
            {startTime && computedEndTime ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                VEVENT ({durationMinutes} {zh ? '分钟' : 'mins'})
              </span>
            ) : startTime ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                {zh ? '缺少时长 (全天任务)' : 'Missing duration (All-day)'}
              </span>
            ) : (
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                {zh ? '未设定时段' : 'Untimed'}
              </span>
            )}
          </div>
          <p className="text-stone-800 font-mono text-sm font-semibold">
            {startTime && computedEndTime
              ? `${place.scheduled_date} ${startTime} - ${computedEndTime}`
              : startTime
              ? `${place.scheduled_date} ${startTime} (未定时长)`
              : `${place.scheduled_date} (${zh ? '全天自由安排' : 'Flexible all-day'})`}
          </p>
          <p className="text-[11px] text-stone-500 leading-relaxed">
            {zh
              ? '设定开始时间与时长后，obsidian-ical-plugin-pro 会将此地点作为具体时间块无缝同步至 Google Calendar。'
              : 'With start time and duration, obsidian-ical-plugin-pro projects this stop as a time block on Google Calendar.'}
          </p>
        </div>

        {/* Collision & Overlap Warnings */}
        {hoursWarning ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1">
              <span className="font-semibold">{zh ? '营业时间冲突提示:' : 'Opening Hours Warning:'}</span>
              <p className="text-[11px] text-amber-800 mt-0.5">{hoursWarning}</p>
            </div>
          </div>
        ) : null}

        {overlapWarning ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900 animate-in fade-in duration-100">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1">
              <span className="font-semibold">{zh ? '时段重叠预警:' : 'Time Overlap Warning:'}</span>
              <p className="text-[11px] text-rose-800 mt-0.5">{overlapWarning}</p>
            </div>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={handleClear}
            disabled={saving || (!place.scheduled_start && !place.duration_minutes)}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            {zh ? '清除时间' : 'Clear Timing'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              {zh ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {saving ? '…' : (zh ? '保存时段' : 'Save Timing')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
