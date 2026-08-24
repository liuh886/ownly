'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type { PlannerTrip, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';
import {
  buildGoogleMapsRouteUrl,
  checkOpeningHoursCollision,
  exportPlacesToCSV,
  exportPlacesToKML,
  getTripAreaCounts,
  detectHotelTransferDays,
  generateStaySpanPlaces,
  listTripDates,
  optimizeStopsSequence,
  sortPlannerPlaces,
} from '@/domain/planner';
import { plannerRepository } from '@/services/PlannerRepository';
import { AppInstallGuideModal } from '@/components/pwa/AppInstallGuideModal';
import { ackCapturedPlaces, pullCaptureState } from './capture-bridge';
import { PlannerMap } from './PlannerMap';
import { HotelComparisonModal } from './HotelComparisonModal';
import { PlannerBudgetLedger } from './PlannerBudgetLedger';

interface PlannerHomeProps {
  disabled: boolean;
}

const priorityRank: Record<PlannerTripPlace['priority'], number> = {
  must: 0,
  want: 1,
  optional: 2,
};

function formatDay(date: string, language: 'en' | 'zh'): string {
  const [, month, day] = date.split('-');
  return language === 'zh' ? `${Number(month)}月${Number(day)}日` : `${month}/${day}`;
}

function placeMeta(place: PlannerTripPlace): string {
  return [
    place.area,
    place.kind,
    place.duration_minutes ? `${place.duration_minutes} min` : null,
    place.preferred_window,
  ].filter(Boolean).join(' · ');
}

export function PlannerHome({ disabled }: PlannerHomeProps) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const [trips, setTrips] = useState<PlannerTrip[]>([]);
  const [places, setPlaces] = useState<PlannerTripPlace[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [activeTag, setActiveTag] = useState<string>('all');
  const [capturePending, setCapturePending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [optimizeUndo, setOptimizeUndo] = useState<PlannerTripPlace[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [draggingPlaceId, setDraggingPlaceId] = useState<string | null>(null);
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'map' | 'context' | 'budget'>('map');
  const [expensesByTrip, setExpensesByTrip] = useState<Record<string, TripExpenseItem[]>>({});
  const [membersByTrip, setMembersByTrip] = useState<Record<string, string[]>>({});

  const currentExpenses = useMemo(() => {
    if (!selectedTripId) return [];
    return expensesByTrip[selectedTripId] ?? [];
  }, [selectedTripId, expensesByTrip]);

  const currentMembers = useMemo(() => {
    if (!selectedTripId) return [zh ? '我' : 'Me'];
    return membersByTrip[selectedTripId] ?? (zh ? ['我'] : ['Me']);
  }, [selectedTripId, membersByTrip, zh]);

  const handleAddExpense = useCallback(
    (item: Omit<TripExpenseItem, 'id' | 'created_at'>) => {
      if (!selectedTripId) return;
      const newExp: TripExpenseItem = {
        ...item,
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        created_at: new Date().toISOString(),
      };
      const next = [newExp, ...currentExpenses];
      setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: next }));
      void plannerRepository.upsertExpense(newExp).catch((error) => {
        console.warn('[Planner] Failed to persist expense', error);
      });
    },
    [selectedTripId, currentExpenses],
  );

  const handleDeleteExpense = useCallback(
    (id: string) => {
      if (!selectedTripId) return;
      const next = currentExpenses.filter((e) => e.id !== id);
      setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: next }));
      void plannerRepository.deleteExpense(id).catch((error) => {
        console.warn('[Planner] Failed to delete expense', error);
      });
    },
    [selectedTripId, currentExpenses],
  );

  const handleUpdateMembers = useCallback(
    (nextMembers: string[]) => {
      if (!selectedTripId) return;
      setMembersByTrip((prev) => ({ ...prev, [selectedTripId]: nextMembers }));
      const trip = trips.find((item) => item.id === selectedTripId);
      if (!trip) return;
      void plannerRepository
        .upsertTrip({ ...trip, members: nextMembers, updated_at: new Date().toISOString() })
        .catch((error) => {
          console.warn('[Planner] Failed to persist trip members', error);
        });
    },
    [selectedTripId, trips],
  );
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);

  const hydrateLedgerFromVault = useCallback(async (trips: PlannerTrip[]) => {
    const stored = await plannerRepository.listExpenses();

    // One-time migration: pull legacy localStorage ledgers/members into the vault.
    for (const trip of trips) {
      try {
        const expKey = `ownly_trip_expenses_${trip.id}`;
        const rawExpenses = typeof window !== 'undefined' ? localStorage.getItem(expKey) : null;
        if (rawExpenses !== null) {
          localStorage.removeItem(expKey);
          const legacy = JSON.parse(rawExpenses) as TripExpenseItem[];
          if (Array.isArray(legacy) && legacy.length > 0 && !stored.some((e) => e.trip_id === trip.id)) {
            await Promise.all(legacy.map((e) => plannerRepository.upsertExpense(e)));
            stored.push(...legacy);
          }
        }
      } catch (error) {
        console.warn('[Planner] expense migration skipped', error);
      }

      try {
        const memberKey = `ownly_trip_members_${trip.id}`;
        const rawMembers = typeof window !== 'undefined' ? localStorage.getItem(memberKey) : null;
        let members = trip.members;
        if (rawMembers !== null) {
          localStorage.removeItem(memberKey);
          const parsed = JSON.parse(rawMembers) as string[];
          if (Array.isArray(parsed) && parsed.length > 0 && JSON.stringify(trip.members ?? []) !== JSON.stringify(parsed)) {
            members = parsed;
            await plannerRepository.upsertTrip({ ...trip, members, updated_at: new Date().toISOString() });
          }
        }
        if (members && members.length > 0) {
          setMembersByTrip((prev) => ({ ...prev, [trip.id]: members as string[] }));
        }
      } catch (error) {
        console.warn('[Planner] member migration skipped', error);
      }
    }

    const grouped: Record<string, TripExpenseItem[]> = {};
    for (const expense of stored) {
      (grouped[expense.trip_id] ??= []).push(expense);
    }
    setExpensesByTrip(grouped);
  }, []);

  const load = useCallback(async () => {
    if (disabled) return;
    await plannerRepository.initialize();
    const [nextTrips, nextPlaces] = await Promise.all([
      plannerRepository.listTrips(),
      plannerRepository.listPlaces(),
    ]);
    nextTrips.sort((left, right) => right.start_date.localeCompare(left.start_date));
    setTrips(nextTrips);
    setPlaces(nextPlaces);
    setSelectedTripId((current) => current || nextTrips[0]?.id || '');
    try {
      await hydrateLedgerFromVault(nextTrips);
    } catch (error) {
      console.warn('[Planner] ledger hydration failed', error);
    }
  }, [disabled, hydrateLedgerFromVault]);

  useEffect(() => {
    let active = true;
    async function init() {
      if (disabled) return;
      await plannerRepository.initialize();
      const [nextTrips, nextPlaces, state] = await Promise.all([
        plannerRepository.listTrips(),
        plannerRepository.listPlaces(),
        pullCaptureState(),
      ]);
      if (!active) return;
      nextTrips.sort((left, right) => right.start_date.localeCompare(left.start_date));
      setTrips(nextTrips);
      setPlaces(nextPlaces);
      setSelectedTripId((current) => current || nextTrips[0]?.id || '');
      setCapturePending(state ? state.pendingPlaces.length : null);
    }
    void init();
    return () => {
      active = false;
    };
  }, [disabled]);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );

  const tripDates = useMemo(
    () => selectedTrip ? listTripDates(selectedTrip.start_date, selectedTrip.end_date) : [],
    [selectedTrip],
  );

  const activeDate = useMemo(() => {
    if (!selectedTrip) return '';
    return tripDates.includes(selectedDate) ? selectedDate : (tripDates[0] ?? '');
  }, [selectedDate, selectedTrip, tripDates]);

  const activeDayIndex = useMemo(() => {
    return Math.max(0, tripDates.indexOf(activeDate));
  }, [activeDate, tripDates]);

  const tripPlaces = useMemo(
    () => places.filter((place) => place.trip_id === selectedTripId && place.state !== 'dropped'),
    [places, selectedTripId],
  );

  const tripTags = useMemo(
    () => Array.from(new Set([...(selectedTrip?.tags || []), ...tripPlaces.flatMap((p) => p.tags)])).filter(Boolean),
    [selectedTrip, tripPlaces],
  );

  const candidates = useMemo(
    () => [...tripPlaces]
      .filter((place) => !place.scheduled_date && place.state === 'candidate')
      .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || left.title.localeCompare(right.title)),
    [tripPlaces],
  );

  const filteredCandidates = useMemo(() => {
    if (activeTag === 'all') return candidates;
    return candidates.filter((p) => p.tags.some((t) => t.trim().toLowerCase() === activeTag.trim().toLowerCase()));
  }, [candidates, activeTag]);

  const scheduled = useMemo(
    () => sortPlannerPlaces(tripPlaces.filter((place) => place.scheduled_date === activeDate && place.state === 'scheduled')),
    [activeDate, tripPlaces],
  );

  const candidateHotels = useMemo(
    () => candidates.filter((p) => p.kind === 'stay'),
    [candidates],
  );

  const runRouteOptimization = useCallback(async () => {
    if (scheduled.length < 3 || disabled) return;
    setBusy(true);
    try {
      const result = optimizeStopsSequence(scheduled, { respectLocked: true });
      if (!result.improved) {
        setNotice(zh ? '当前路线已经是最佳顺路顺序！' : 'Current sequence is already optimal!');
        setTimeout(() => setNotice(''), 3000);
        return;
      }
      const snapshot = scheduled.map((p) => ({ ...p }));
      for (const place of result.places) {
        await plannerRepository.upsertPlace(place);
      }
      await load();
      setOptimizeUndo(snapshot);
      setNotice(zh ? `✓ 顺路优化完成！节省约 ${result.savedKm} km 绕路路程` : `✓ Optimized! Saved ~${result.savedKm} km`);
      setTimeout(() => setNotice(''), 4000);
    } finally {
      setBusy(false);
    }
  }, [scheduled, disabled, zh, load]);

  const undoRouteOptimization = useCallback(async () => {
    if (!optimizeUndo || disabled) return;
    setBusy(true);
    try {
      for (const place of optimizeUndo) {
        await plannerRepository.upsertPlace(place);
      }
      setOptimizeUndo(null);
      await load();
      setNotice(zh ? '已撤销本次顺路优化。' : 'Route optimization reverted.');
      setTimeout(() => setNotice(''), 3000);
    } finally {
      setBusy(false);
    }
  }, [optimizeUndo, disabled, zh, load]);

  const placesByDate = useMemo(() => {
    const map: Record<string, PlannerTripPlace[]> = {};
    tripDates.forEach((date) => {
      map[date] = sortPlannerPlaces(
        tripPlaces.filter((p) => p.state === 'scheduled' && p.scheduled_date === date),
      );
    });
    return map;
  }, [tripDates, tripPlaces]);

  const transferDaysInfo = useMemo(() => {
    return detectHotelTransferDays(tripPlaces, tripDates);
  }, [tripPlaces, tripDates]);

  const currentDayTransferInfo = activeDate ? transferDaysInfo[activeDate] : undefined;

  const handleSelectHotelForStaySpan = useCallback(
    async (hotel: PlannerTripPlace, stayDates: string[]) => {
      if (disabled || stayDates.length === 0) return;
      setBusy(true);
      try {
        const stayPlaces = generateStaySpanPlaces(hotel, stayDates);
        const dateSet = new Set(stayDates);
        const newIds = new Set(stayPlaces.map((sp) => sp.id));

        // Retire previous stay anchors on the same dates so switching hotels never duplicates stays.
        const staleStays = tripPlaces.filter(
          (p) =>
            p.state === 'scheduled'
            && p.scheduled_date
            && dateSet.has(p.scheduled_date)
            && !newIds.has(p.id)
            && (p.kind === 'stay' || (p.is_anchor && p.anchor_type === 'stay_checkin')),
        );
        for (const stale of staleStays) {
          await plannerRepository.dropPlace(stale.id);
        }

        for (const sp of stayPlaces) {
          await plannerRepository.upsertPlace(sp);
        }
        await load();
        setNotice(
          zh
            ? `✓ 已将「${hotel.title}」设为 ${stayDates.length} 晚连住宿点 (${stayDates[0]} ~ ${stayDates[stayDates.length - 1]})！`
            : `✓ Set "${hotel.title}" as stay for ${stayDates.length} nights!`,
        );
        setTimeout(() => setNotice(''), 4000);
      } finally {
        setBusy(false);
      }
    },
    [disabled, zh, load, tripPlaces],
  );

  const handleUpdateFxRates = useCallback(
    (rates: Record<string, number>) => {
      if (!selectedTripId) return;
      setTrips((prev) => prev.map((t) => (t.id === selectedTripId ? { ...t, fx_rates: rates } : t)));
      const trip = trips.find((item) => item.id === selectedTripId);
      if (!trip) return;
      void plannerRepository
        .upsertTrip({ ...trip, fx_rates: rates, updated_at: new Date().toISOString() })
        .catch((error) => console.warn('[Planner] Failed to persist fx_rates', error));
    },
    [selectedTripId, trips],
  );

  const handleDropHotel = useCallback(async (hotelId: string) => {
    if (!hotelId || disabled) return;
    await plannerRepository.dropPlace(hotelId);
    await load();
  }, [disabled, load]);

  const areaCounts = useMemo(() => getTripAreaCounts(tripPlaces), [tripPlaces]);
  const maxAreaCount = Math.max(1, ...areaCounts.map((item) => item.count));
  const mustTotal = tripPlaces.filter((place) => place.priority === 'must').length;
  const mustScheduled = tripPlaces.filter((place) => place.priority === 'must' && place.scheduled_date).length;
  const scheduledMinutes = scheduled.reduce((sum, place) => sum + (place.duration_minutes ?? 0), 0);

  const downloadKML = useCallback(() => {
    if (!selectedTrip || scheduled.length === 0) return;
    const kmlContent = exportPlacesToKML(selectedTrip.title, activeDate, scheduled);
    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTrip.title}_${activeDate}.kml`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '已导出 Google My Maps (KML) 路线文件！' : 'Exported Google My Maps (KML) route file!');
  }, [selectedTrip, scheduled, activeDate, zh]);

  const downloadCSV = useCallback(() => {
    if (!selectedTrip || scheduled.length === 0) return;
    const csvContent = exportPlacesToCSV(scheduled);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTrip.title}_${activeDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '已导出 Google Maps (CSV) 路线文件！' : 'Exported Google Maps (CSV) file!');
  }, [selectedTrip, scheduled, activeDate, zh]);

  const copyItineraryText = useCallback(async () => {
    if (!selectedTrip || scheduled.length === 0) return;
    const lines = [
      `📅 ${selectedTrip.title} · ${activeDate}`,
      ...scheduled.map((p, i) => `${i + 1}. ${p.title}${p.area ? ` (${p.area})` : ''}${p.why ? `\n   💡 理由: ${p.why}` : ''}${p.notes ? `\n   📝 备注: ${p.notes}` : ''}${p.address ? `\n   📍 地址: ${p.address}` : ''}`),
    ];
    await navigator.clipboard.writeText(lines.join('\n\n'));
    setNotice(zh ? '已复制当天路线清单至剪贴板！' : 'Copied day itinerary to clipboard!');
  }, [selectedTrip, scheduled, activeDate, zh]);

  const schedulePlace = useCallback(async (placeId: string, date = activeDate) => {
    if (!date) return;
    await plannerRepository.schedulePlace(placeId, date);
    await load();
  }, [activeDate, load]);

  const returnToPool = useCallback(async (place: PlannerTripPlace) => {
    await plannerRepository.unschedulePlace(place.id);
    await load();
  }, [load]);

  const moveScheduled = useCallback(async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= scheduled.length) return;
    const orderedIds = scheduled.map((p) => p.id);
    const [moved] = orderedIds.splice(index, 1);
    orderedIds.splice(targetIndex, 0, moved);
    await plannerRepository.reorderScheduled(activeDate, orderedIds);
    await load();
  }, [activeDate, load, scheduled]);

  const syncCapture = useCallback(async () => {
    setBusy(true);
    setNotice('');
    try {
      const state = await pullCaptureState();
      if (!state) {
        setCapturePending(null);
        setNotice(zh ? '未检测到 Ownly Capture 扩展。' : 'Ownly Capture extension was not detected.');
        return;
      }

      await plannerRepository.initialize();
      const existingTripIds = new Set(trips.map((trip) => trip.id));
      for (const trip of state.trips) {
        if (!existingTripIds.has(trip.id)) await plannerRepository.upsertTrip(trip);
      }
      if (state.pendingPlaces.length > 0) {
        await plannerRepository.upsertPlaces(state.pendingPlaces);
        await ackCapturedPlaces(state.pendingPlaces.map((place) => place.id));
      }
      setCapturePending(0);
      await load();
      setSelectedTripId((current) => current || state.activeTripId || state.trips[0]?.id || '');
      setNotice(zh
        ? `已同步 ${state.pendingPlaces.length} 个研究候选。`
        : `Synced ${state.pendingPlaces.length} research candidates.`);
    } catch {
      setCapturePending(null);
      setNotice(zh ? '同步失败：无法写入数据目录或扩展未响应。' : 'Sync failed: could not write data folder or extension unreachable.');
    } finally {
      setBusy(false);
    }
  }, [load, trips, zh]);

  if (disabled) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
        {zh ? '连接 Ownly 本地数据目录后即可使用 Planner。' : 'Connect your Ownly data folder to use Planner.'}
      </section>
    );
  }

  if (!selectedTrip) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight text-stone-950">Planner</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">
          {zh
            ? '先在 Google Maps 的 Ownly Capture 侧栏创建 Trip 并采集候选地点。Planner 只负责把研究完成的地点排进日程。'
            : 'Create a trip and capture researched places in the Ownly Capture side panel on Google Maps. Planner only turns that research into a schedule.'}
        </p>
        <button
          type="button"
          onClick={() => void syncCapture()}
          disabled={busy}
          className="mt-5 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? (zh ? '同步中…' : 'Syncing…') : (zh ? '从 Capture 同步' : 'Sync from Capture')}
        </button>
        {notice ? <p className="mt-3 text-xs text-stone-500">{notice}</p> : null}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTripId}
              onChange={(event) => setSelectedTripId(event.target.value)}
              className="max-w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-stone-400"
              aria-label={zh ? '选择行程' : 'Select trip'}
            >
              {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
            </select>
            <span className="text-xs text-stone-400">
              {selectedTrip.start_date} → {selectedTrip.end_date}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-400">{selectedTrip.destinations.join(' · ') || (zh ? '未填写目的地' : 'No destinations')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capturePending === null ? (
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
              title={zh ? '未检测到扩展，点击查看安装步骤' : 'Extension offline, click to view installation guide'}
            >
              {zh ? 'Capture 未连接 · 安装扩展' : 'Capture offline · Install guide'}
            </button>
          ) : (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500">
              {`${capturePending} ${zh ? '待同步' : 'pending'}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void syncCapture()}
            disabled={busy}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {busy ? '…' : (zh ? '同步 Capture' : 'Sync Capture')}
          </button>
        </div>
      </div>

      {notice ? <div aria-live="polite" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">{notice}</div> : null}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tripDates.map((date, index) => (
          <button
            key={date}
            type="button"
            onClick={() => setSelectedDate(date)}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition ${activeDate === date ? 'bg-stone-950 text-white' : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:text-stone-900'}`}
          >
            {zh ? `第${index + 1}天 · ${formatDay(date, language)}` : `Day ${index + 1} · ${formatDay(date, language)}`}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(220px,0.75fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Research Pool</h2>
              <p className="text-[11px] text-stone-400">{zh ? 'Google Maps 研究完成的候选' : 'Researched in Google Maps'}</p>
            </div>
            <span className="text-xs font-medium text-stone-400">{filteredCandidates.length}/{candidates.length}</span>
          </div>

          {candidateHotels.length > 0 ? (
            <div className="flex items-center justify-between border-b border-stone-100 bg-amber-50/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                <span>🏨</span>
                <span>{zh ? `有 ${candidateHotels.length} 家备选住宿` : `${candidateHotels.length} candidate stays`}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsHotelModalOpen(true)}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-2xs hover:bg-amber-100/60"
              >
                {zh ? '多维比选' : 'Compare'}
              </button>
            </div>
          ) : null}

          {tripTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b border-stone-100 bg-stone-50/70 px-3 py-2">
              <button
                type="button"
                onClick={() => setActiveTag('all')}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${activeTag === 'all' ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}`}
              >
                {zh ? '全部' : 'All'} ({candidates.length})
              </button>
              {tripTags.map((tag) => {
                const count = candidates.filter((p) => p.tags.some((t) => t.trim().toLowerCase() === tag.trim().toLowerCase())).length;
                const isSelected = activeTag.trim().toLowerCase() === tag.trim().toLowerCase();
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveTag(isSelected ? 'all' : tag)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${isSelected ? 'bg-emerald-700 text-white' : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
                  >
                    🏷️ {tag} ({count})
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="space-y-2 p-3">
            {filteredCandidates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200 px-3 py-8 text-center text-xs text-stone-400">
                {zh ? '当前筛选下暂无候选地点。' : 'No unscheduled candidates matching filter.'}
              </div>
            ) : filteredCandidates.map((place) => (
              <article
                key={place.id}
                draggable
                onDragStart={() => setDraggingPlaceId(place.id)}
                onDragEnd={() => setDraggingPlaceId(null)}
                onMouseEnter={() => setHighlightedPlaceId(place.id)}
                onMouseLeave={() => setHighlightedPlaceId(null)}
                className={`rounded-lg border bg-stone-50/70 p-3 transition-all duration-150 ${
                  highlightedPlaceId === place.id
                    ? 'border-emerald-500 ring-2 ring-emerald-300/60 bg-emerald-50/30'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-stone-900">{place.title}</h3>
                    <p className="mt-1 text-[11px] text-stone-400">{placeMeta(place)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void schedulePlace(place.id)}
                    className="shrink-0 rounded-md bg-stone-950 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-stone-800"
                  >
                    + {zh ? '当天' : 'Day'}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${place.priority === 'must' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{place.priority}</span>
                  {place.observed_rating ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">★ {place.observed_rating}</span> : null}
                  {place.observed_price ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">{place.observed_price}</span> : null}
                  {place.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      🏷️ {tag}
                    </span>
                  ))}
                  {place.signals.slice(0, 2).map((signal) => <span key={signal} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">{signal}</span>)}
                </div>
                {place.why ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-600">{place.why}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <section
          className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingPlaceId) void schedulePlace(draggingPlaceId);
            setDraggingPlaceId(null);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Day Skeleton</h2>
              <p className="text-[11px] text-stone-400">{activeDate} · {scheduled.length} {zh ? '个游览点' : 'stops'}</p>
            </div>
            {scheduled.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void runRouteOptimization()}
                  disabled={busy || scheduled.length < 3}
                  className="rounded-md border border-emerald-300 bg-emerald-50/80 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 shadow-2xs transition"
                  title={zh ? '基于真实经纬度一键顺路重排游览顺序 (消除折返跑)；锁定与无坐标点保持原位' : 'Optimize route sequence; locked and unlocated stops stay pinned'}
                >
                  ⚡ {zh ? '顺路优化' : 'Optimize'}
                </button>
                {optimizeUndo ? (
                  <button
                    type="button"
                    onClick={() => void undoRouteOptimization()}
                    disabled={busy}
                    className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition"
                    title={zh ? '恢复优化前的游览顺序' : 'Revert to the pre-optimization order'}
                  >
                    ↩️ {zh ? '撤销优化' : 'Undo'}
                  </button>
                ) : null}
                <a
                  href={buildGoogleMapsRouteUrl(scheduled, selectedTrip.transport_mode ?? 'transit')}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-stone-950 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-stone-800 transition"
                  title={zh ? '在 Google Maps 中打开全天完整路线' : 'Open full day route in Google Maps'}
                >
                  🗺️ {zh ? 'Google Maps 完整路线' : 'Google Maps Route'}
                </a>
                <a
                  href={buildGoogleMapsRouteUrl(scheduled, 'driving')}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '驾车路线' : 'Driving Route'}
                >
                  🚗
                </a>
                <a
                  href={buildGoogleMapsRouteUrl(scheduled, 'walking')}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '步行路线' : 'Walking Route'}
                >
                  🚶
                </a>
                <button
                  type="button"
                  onClick={downloadKML}
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '导出 KML (用于导入 Google 我的地图)' : 'Export KML for Google My Maps'}
                >
                  📍 KML
                </button>
                <button
                  type="button"
                  onClick={downloadCSV}
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '导出 CSV (用于导入 Google 表格或自定义地图)' : 'Export CSV'}
                >
                  📊 CSV
                </button>
                <button
                  type="button"
                  onClick={() => void copyItineraryText()}
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '复制路线文字清单' : 'Copy itinerary text'}
                >
                  📋
                </button>
              </div>
            ) : null}
          </div>
          {currentDayTransferInfo?.isTransferDay ? (
            <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 shadow-2xs">
              <span className="text-base">🧳</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <span>{zh ? '今日为换宿日 (Hotel Transfer Day)' : 'Hotel Transfer Day'}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                  {zh ? (
                    <>
                      🌅 <b>早上退房:</b> {currentDayTransferInfo.checkoutHotel?.title} (行李可寄放前台或直送新店) ➔ 🚶 <b>白天游览</b> ➔ 🌙 <b>傍晚入住:</b> {currentDayTransferInfo.checkinHotel?.title}
                    </>
                  ) : (
                    <>
                      🌅 <b>Morning Check-out:</b> {currentDayTransferInfo.checkoutHotel?.title} ➔ 🚶 <b>Sightseeing</b> ➔ 🌙 <b>Evening Check-in:</b> {currentDayTransferInfo.checkinHotel?.title}
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : currentDayTransferInfo?.stayHotel && currentDayTransferInfo.totalStayNights && currentDayTransferInfo.totalStayNights > 1 ? (
            <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950 shadow-2xs">
              <div className="flex items-center gap-1.5 font-medium truncate">
                <span>🌙</span>
                <span className="truncate">
                  {zh ? '今晚住宿:' : 'Tonight Stay:'}{' '}
                  <strong className="font-bold">{currentDayTransferInfo.stayHotel.title}</strong>
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10.5px] font-bold text-emerald-900">
                {zh
                  ? `连住第 ${currentDayTransferInfo.stayNightIndex} 晚 / 共 ${currentDayTransferInfo.totalStayNights} 晚`
                  : `Night ${currentDayTransferInfo.stayNightIndex} of ${currentDayTransferInfo.totalStayNights}`}
              </span>
            </div>
          ) : null}
          <div className="p-3">
            {scheduled.length === 0 ? (
              <div className={`rounded-xl border-2 border-dashed px-4 py-16 text-center text-sm ${draggingPlaceId ? 'border-emerald-300 bg-emerald-50/50 text-emerald-700' : 'border-stone-200 text-stone-400'}`}>
                {zh ? '把 Research Pool 的候选拖进这一天，或点击“+ 当天”。' : 'Drag a researched candidate here, or use “+ Day”.'}
              </div>
            ) : (
              <ol className="space-y-1.5">
                {scheduled.map((place, index) => {
                  const col = checkOpeningHoursCollision(place.open_hours, activeDate);
                  return (
                    <li key={place.id} className="space-y-1.5">
                      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-xs">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-xs font-bold text-white shrink-0">{index + 1}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-sm font-semibold text-stone-900">{place.title}</h3>
                            {place.locked ? <span className="text-[10px] text-stone-400">locked</span> : null}
                            {place.observed_price ? <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[10px] text-stone-500">{place.observed_price}</span> : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-stone-400">{placeMeta(place)}</p>
                          {col.isCollision ? (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                              ⚠️ {col.reason}
                            </div>
                          ) : null}
                          {place.why ? <p className="mt-1 line-clamp-1 text-xs text-stone-600">💡 {place.why}</p> : null}
                          {place.notes ? <p className="mt-0.5 line-clamp-1 text-xs text-stone-500 italic">📝 {place.notes}</p> : null}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" aria-label={zh ? '上移' : 'Move up'} disabled={index === 0} onClick={() => void moveScheduled(index, -1)} className="h-8 w-8 rounded-md border border-stone-200 text-xs text-stone-500 hover:bg-stone-50 disabled:opacity-30">↑</button>
                          <button type="button" aria-label={zh ? '下移' : 'Move down'} disabled={index === scheduled.length - 1} onClick={() => void moveScheduled(index, 1)} className="h-8 w-8 rounded-md border border-stone-200 text-xs text-stone-500 hover:bg-stone-50 disabled:opacity-30">↓</button>
                          <button type="button" aria-label={zh ? '放回候选池' : 'Return to pool'} onClick={() => void returnToPool(place)} className="h-8 rounded-md border border-stone-200 px-2 text-[10px] font-semibold text-stone-500 hover:bg-stone-50">{zh ? '移出' : 'Pool'}</button>
                        </div>
                      </div>
                      {index < scheduled.length - 1 ? (
                        <div className="flex items-center justify-center py-0.5">
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(scheduled[index + 1].address || scheduled[index + 1].title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-stone-100 hover:bg-stone-200 px-2.5 py-0.5 text-[10px] font-medium text-stone-600 transition"
                            title={zh ? '在 Google Maps 中查看两站之间的导航' : 'View directions between stops in Google Maps'}
                          >
                            ↓ {zh ? 'Google Maps 站间路线' : 'Directions to next stop'}
                          </a>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <aside className="min-w-0 flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {/* Header Tab Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-stone-100 bg-stone-50/90 px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightTab('map')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  rightTab === 'map' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                🗺️ {zh ? '空间建议地图' : 'Spatial Map'}
              </button>
              <button
                type="button"
                onClick={() => setRightTab('context')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  rightTab === 'context' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                📊 {zh ? '负荷统计' : 'Context'}
              </button>
              <button
                type="button"
                onClick={() => setRightTab('budget')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  rightTab === 'budget' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                💸 {zh ? '预算与账本' : 'Budget'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsMapExpanded(true)}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100 shadow-2xs"
              title={zh ? '展开全屏大地图' : 'Expand Map'}
            >
              ⛶ {zh ? '大地图' : 'Expand'}
            </button>
          </div>

          {rightTab === 'map' ? (
            <div className="flex-1 min-h-[380px] p-2 flex flex-col">
              <PlannerMap
                scheduledPlaces={scheduled}
                candidatePlaces={filteredCandidates}
                destinations={selectedTrip?.destinations}
                activeDate={activeDate}
                activeDayIndex={activeDayIndex}
                highlightedPlaceId={highlightedPlaceId}
                onSchedulePlace={schedulePlace}
                onUnschedulePlace={returnToPool}
                onHoverPlace={setHighlightedPlaceId}
                language={language}
              />
            </div>
          ) : rightTab === 'budget' ? (
            <PlannerBudgetLedger
              trip={selectedTrip}
              scheduledPlaces={scheduled}
              expenses={currentExpenses}
              onAddExpense={handleAddExpense}
              onDeleteExpense={handleDeleteExpense}
        members={currentMembers}
        onUpdateMembers={handleUpdateMembers}
        onUpdateFxRates={handleUpdateFxRates}
              language={language}
            />
          ) : (
            <div className="p-4 overflow-y-auto">
              <h2 className="text-sm font-semibold text-stone-900">Planner Context</h2>
              <div className="mt-3 divide-y divide-stone-100 text-xs">
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '当天已排' : 'Scheduled'}</span><strong>{scheduled.length}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '候选未排' : 'Unscheduled'}</span><strong>{candidates.length}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">Must</span><strong>{mustScheduled}/{mustTotal}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '地点时长' : 'Place time'}</span><strong>{Math.round(scheduledMinutes / 60 * 10) / 10}h</strong></div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-stone-700">{zh ? '区域分布' : 'Area load'}</h3>
                  <span className="text-[10px] text-stone-400">{areaCounts.length}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {areaCounts.slice(0, 6).map((item) => (
                    <div key={item.area}>
                      <div className="mb-1 flex justify-between text-[10px] text-stone-500"><span>{item.area}</span><span>{item.count}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-stone-700" style={{ width: `${Math.max(12, item.count / maxAreaCount * 100)}%` }} /></div>
                    </div>
                  ))}
                  {areaCounts.length === 0 ? <p className="text-[11px] leading-5 text-stone-400">{zh ? '采集时填写区域，后续 AI 才能更好地做空间聚类。' : 'Add areas while researching so future AI planning can cluster places spatially.'}</p> : null}
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-stone-50 p-3 text-[11px] leading-5 text-stone-500 ring-1 ring-stone-200">
                {zh
                  ? '当前版本只做人工编排：研究在 Google Maps 完成，Planner 负责候选池、空间地图排程、顺序调整和回到 Google Maps 执行。'
                  : 'Research in Google Maps, then pool → map → day skeleton → Google Maps.'}
              </div>
            </div>
          )}
        </aside>
      </div>


      {isMapExpanded && selectedTrip ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-stone-950/70 p-3 sm:p-6 backdrop-blur-xs animate-in fade-in">
          <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-stone-900">🗺️ {selectedTrip.title} · {zh ? `第${activeDayIndex + 1}天空间地图` : `Day ${activeDayIndex + 1} Spatial Map`}</span>
                <span className="text-xs text-stone-400">({activeDate})</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMapExpanded(false)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                ✕ {zh ? '退出大地图' : 'Close Map'}
              </button>
            </div>
            <div className="flex-1 p-2">
              <PlannerMap
                scheduledPlaces={scheduled}
                candidatePlaces={filteredCandidates}
                destinations={selectedTrip?.destinations}
                activeDate={activeDate}
                activeDayIndex={activeDayIndex}
                highlightedPlaceId={highlightedPlaceId}
                onSchedulePlace={schedulePlace}
                onUnschedulePlace={returnToPool}
                onHoverPlace={setHighlightedPlaceId}
                language={language}
              />
            </div>
          </div>
        </div>
      ) : null}

      <HotelComparisonModal
        key={`hotel-cmp-${activeDate}-${isHotelModalOpen}`}
        open={isHotelModalOpen}
        onClose={() => setIsHotelModalOpen(false)}
        candidateHotels={candidateHotels}
        scheduledPlaces={scheduled}
        placesByDate={placesByDate}
        tripDates={tripDates}
        activeDate={activeDate}
        activeDayIndex={activeDayIndex}
        onSelectHotelForStaySpan={handleSelectHotelForStaySpan}
        onDropHotel={handleDropHotel}
        onHoverHotel={setHighlightedPlaceId}
        language={language}
      />

      <AppInstallGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        defaultTab="extension"
      />
    </section>
  );
}
