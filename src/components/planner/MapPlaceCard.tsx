import type { PlannerPlaceKind, PlannerTripPlace } from '@/domain/planner';
import type { PlannerScheduledPlace } from '@/domain/planner-visits';
import { PLANNER_KIND_ICONS, PLANNER_KIND_LABELS } from '@/domain/planner';

const KIND_OPTIONS: PlannerPlaceKind[] = [
  'attraction',
  'food',
  'cafe',
  'experience',
  'shopping',
  'stay',
  'transit',
  'service',
  'other',
];

export interface MapPlaceCardProps {
  /** Candidate or scheduled place (map points carry either shape). */
  place: PlannerTripPlace | PlannerScheduledPlace;
  zh: boolean;
  activeDayIndex: number;
  /** Times this place is already scheduled across the trip. */
  visitCount: number;
  /** The scheduled entry on the active day, if any. */
  scheduledPlace: PlannerScheduledPlace | null;
  onSchedule: (placeId: string) => void;
  onUnschedule: (place: PlannerScheduledPlace) => void;
  onShelve?: (placeId: string) => void;
  /** Manual kind correction; when set a 🏷️ row lets the user re-classify. */
  onChangeKind?: (placeId: string, kind: PlannerPlaceKind) => void;
  onClose: () => void;
}

/**
 * Minimal place card for the map popup. Mirrors the candidate-pool card
 * language (badges + 💡 why) but stays slim: one meta line, two actions,
 * no delete entry — deletion lives in the pool / timeline.
 */
export function MapPlaceCard({
  place,
  zh,
  activeDayIndex,
  visitCount,
  scheduledPlace,
  onSchedule,
  onUnschedule,
  onShelve,
  onChangeKind,
  onClose,
}: MapPlaceCardProps) {
  const meta: string[] = [];
  if (place.observed_rating) {
    meta.push(
      `★ ${place.observed_rating}${place.observed_review_count ? ` (${place.observed_review_count})` : ''}`,
    );
  }
  if (place.source_category) meta.push(place.source_category);
  if (place.observed_price) meta.push(place.observed_price);
  if (visitCount > 0) meta.push(zh ? `已排 ${visitCount} 次` : `${visitCount}x scheduled`);

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-sm">{PLANNER_KIND_ICONS[place.kind] || '📍'}</span>
          <h4 className="truncate text-xs font-bold leading-snug text-stone-900" title={place.title}>
            {place.title}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded p-0.5 text-stone-400 transition hover:text-stone-700"
          title={zh ? '关闭' : 'Close'}
        >
          ✕
        </button>
      </div>

      {/* One-line meta */}
      {meta.length > 0 ? (
        <p className="mt-1 truncate text-[11px] text-stone-500" title={meta.join(' · ')}>
          {meta.join(' · ')}
        </p>
      ) : null}

      {/* Kind correction */}
      {onChangeKind ? (
        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-stone-500">
          <span className="shrink-0">🏷️ {zh ? '分类' : 'Kind'}</span>
          <select
            value={place.kind}
            onChange={(e) => onChangeKind(place.id, e.target.value as PlannerPlaceKind)}
            className="min-w-0 flex-1 cursor-pointer truncate rounded-md border border-stone-200 bg-white px-1 py-0.5 text-[11px] font-semibold text-stone-700"
            title={zh ? '纠正分类（后续抓取不会覆盖）' : 'Correct kind (future captures keep it)'}
          >
            {KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {PLANNER_KIND_ICONS[kind]} {zh ? PLANNER_KIND_LABELS[kind].zh : PLANNER_KIND_LABELS[kind].en}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* Why quote */}
      {place.why ? (
        <p
          className="mt-1.5 line-clamp-2 rounded-md bg-stone-50/80 px-2 py-1 text-xs leading-relaxed text-stone-700"
          title={place.why}
        >
          💡 {place.why}
        </p>
      ) : null}

      {/* Actions: schedule + shelve only */}
      <div className="mt-2 flex items-center gap-1.5 border-t border-stone-100 pt-2">
        {scheduledPlace ? (
          <button
            type="button"
            onClick={() => onUnschedule(scheduledPlace)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
            title={zh ? '已排入当天日程，点击移出（回到待安排候选池）' : 'Scheduled on active day. Click to remove'}
          >
            <span>−</span>
            <span>{zh ? '移出当天' : 'Remove'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSchedule(place.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-stone-900 px-2 py-1.5 text-[11px] font-bold text-white transition hover:bg-stone-700"
            title={zh ? `排入第 ${activeDayIndex + 1} 天路线` : `Add to Day ${activeDayIndex + 1}`}
          >
            <span>＋</span>
            <span>{visitCount > 0 ? (zh ? '再排当天' : 'Add Again') : zh ? '排入当天' : 'Add Stop'}</span>
          </button>
        )}
        {onShelve ? (
          <button
            type="button"
            onClick={() => {
              onShelve(place.id);
              onClose();
            }}
            className="flex items-center justify-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-bold text-stone-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
            title={zh ? '设为暂不考虑（可在待考虑池查看）' : 'Shelve (drop) place'}
          >
            <span>🙈</span>
            <span>{zh ? '暂不考虑' : 'Shelve'}</span>
          </button>
        ) : null}
        {place.source_url ? (
          <a
            href={place.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center rounded-lg px-1.5 py-1.5 text-[11px] text-stone-400 transition hover:bg-stone-100 hover:text-emerald-700"
            title={zh ? '在 Google Maps 中查看' : 'View on Maps'}
          >
            🗺️
          </a>
        ) : null}
      </div>
    </div>
  );
}
