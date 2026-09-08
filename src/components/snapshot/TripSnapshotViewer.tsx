'use client';

import { useMemo, useState } from 'react';
import { PlannerMap } from '@/components/planner/PlannerMap';
import { listTripDates } from '@/domain/planner';
import { materializePlannerScheduledPlaces } from '@/domain/planner-visits';
import {
  buildSnapshotView,
  isSnapshotStale,
  snapshotAgeHours,
  type OwnlyTripSnapshot,
} from '@/domain/trip-snapshot';

// NOTE (WS-3 read-only guarantee): this module is props-in only. It imports
// no repository, no workspace context, and no planner actions. The map's
// mutation callbacks below are dead ends by construction — there is no store
// reachable from this tree. A static test pins the import boundary.

const COPY = {
  en: {
    days: 'Timeline',
    pool: 'Candidate pool',
    map: 'Map',
    expenses: 'Expenses',
    expensesExcluded: 'Expenses were not included in this snapshot.',
    exportedAt: 'Snapshot taken',
    stale: 'Possibly outdated — older than 24h. The desktop data folder is the source of truth.',
    fresh: 'Fresh snapshot.',
    ageHours: 'h ago',
    noStops: 'Nothing scheduled this day.',
    emptyPool: 'No unscheduled places.',
    readOnly: 'Read-only snapshot — nothing here can modify your trip.',
    stops: 'stops',
  },
  zh: {
    days: '时间线',
    pool: '候选池',
    map: '地图',
    expenses: '费用',
    expensesExcluded: '该快照未包含费用。',
    exportedAt: '快照生成时间',
    stale: '可能已过期（超过 24 小时）。桌面数据目录才是唯一真源。',
    fresh: '快照新鲜。',
    ageHours: '小时前',
    noStops: '当天无安排。',
    emptyPool: '无未排期地点。',
    readOnly: '只读快照——这里的任何操作都不会改动你的行程。',
    stops: '站',
  },
} as const;

function noop(): void {}

export function TripSnapshotViewer({
  snapshot,
  language,
}: {
  snapshot: OwnlyTripSnapshot;
  language: 'zh' | 'en';
}) {
  const copy = COPY[language];
  const trip = snapshot.trip;
  const view = useMemo(() => buildSnapshotView(snapshot), [snapshot]);
  const scheduled = useMemo(
    () => materializePlannerScheduledPlaces(snapshot.places, snapshot.visits),
    [snapshot],
  );
  const tripDates = useMemo(
    () => listTripDates(trip.start_date, trip.end_date),
    [trip.start_date, trip.end_date],
  );
  const legByPair = useMemo(() => {
    const map = new Map(snapshot.legs.map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));
    return map;
  }, [snapshot]);
  const visitCountByPlaceId = useMemo(() => {
    const map = new Map<string, number>();
    for (const visit of snapshot.visits) {
      map.set(visit.place_id, (map.get(visit.place_id) ?? 0) + 1);
    }
    return map;
  }, [snapshot]);

  const [activeDate, setActiveDate] = useState<string>(tripDates[0] ?? '');
  const activeDayIndex = Math.max(0, tripDates.indexOf(activeDate));
  const stale = isSnapshotStale(snapshot.exported_at);
  const ageHours = snapshotAgeHours(snapshot.exported_at);
  const expenseTotal = useMemo(
    () => snapshot.expenses.reduce((sum, item) => sum + item.amount, 0),
    [snapshot],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-16 sm:p-6">
      <header className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="text-[11px] font-medium text-stone-400">{copy.readOnly}</div>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-stone-950">📱 {trip.title}</h1>
        <div className="mt-1 text-xs text-stone-500">
          {trip.start_date} → {trip.end_date} · {(trip.destinations ?? []).join(', ')}
        </div>
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${stale ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {copy.exportedAt} {snapshot.exported_at}
          {ageHours !== null ? ` (${Math.floor(ageHours)}${copy.ageHours})` : ''} —{' '}
          {stale ? copy.stale : copy.fresh}
        </div>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-stone-900">🗺️ {copy.map}</h2>
        {tripDates.length > 0 ? (
          <>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {tripDates.map((date, index) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setActiveDate(date)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    date === activeDate
                      ? 'bg-stone-950 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  D{index + 1}
                </button>
              ))}
            </div>
            <div className="mt-2 h-80 overflow-hidden rounded-xl border border-stone-200">
              <PlannerMap
                scheduledPlaces={scheduled}
                candidatePlaces={snapshot.places}
                tripDates={tripDates}
                destinations={trip.destinations}
                activeDate={activeDate}
                activeDayIndex={activeDayIndex}
                onSchedulePlace={noop}
                onUnschedulePlace={noop}
                visitCountByPlaceId={visitCountByPlaceId}
                language={language}
                legByPair={legByPair}
                tripId={trip.id}
              />
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-stone-900">📋 {copy.days}</h2>
        <div className="mt-2 space-y-3">
          {view.days.map((day) => (
            <div key={day.date}>
              <div className="text-xs font-semibold text-stone-500">
                {day.date} · {day.stops.length} {copy.stops}
              </div>
              <ol className="mt-1 space-y-1">
                {day.stops.map((stop, index) => (
                  <li key={`${day.date}-${index}`} className="flex items-baseline gap-2 text-sm">
                    <span className="w-6 shrink-0 text-right font-bold text-stone-400">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-stone-900">{stop.title}</span>
                    {stop.time ? <span className="shrink-0 text-xs text-stone-500">{stop.time}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {view.days.length === 0 ? <p className="text-xs text-stone-400">{copy.noStops}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-stone-900">📦 {copy.pool}</h2>
        {view.pool.length === 0 ? (
          <p className="mt-1 text-xs text-stone-400">{copy.emptyPool}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {view.pool.map((place) => (
              <li key={place.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-stone-800">{place.title}</span>
                {place.area ? <span className="shrink-0 text-xs text-stone-400">{place.area}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-stone-900">💰 {copy.expenses}</h2>
        {snapshot.privacy.expenses === 'included' ? (
          <div className="mt-2 text-sm text-stone-700">
            <div className="font-semibold">
              {trip.currency || ''} {expenseTotal.toLocaleString('en-US')}
            </div>
            <ul className="mt-1 space-y-1">
              {snapshot.expenses.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-stone-600">{item.title}</span>
                  <span className="shrink-0 text-stone-800">
                    {item.currency} {item.amount.toLocaleString('en-US')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-xs text-stone-400">{copy.expensesExcluded}</p>
        )}
      </section>
    </div>
  );
}
