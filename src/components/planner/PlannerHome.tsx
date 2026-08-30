'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type { PlannerPlaceKind, PlannerScheduledPlace as PlannerScheduledPlaceDomain, PlannerTrip, PlannerTripLeg, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';
import { materializePlannerScheduledPlaces, sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripVisit } from '@/domain/planner-visits';
import {
  computeUrgencies,
  fetchWeather,
  isWeatherRelevant,
  daysUntil,
  type WeatherSummary,
} from '@/domain/departure';
import {
  buildGoogleMapsRouteUrl,
  checkOpeningHoursCollision,
  checkDayScheduleCollisions,
  currencySymbolFor,
  effectiveFxRate,
  ensurePlaceKindTag,
  exportPlacesToCSV,
  exportPlacesToKML,
  exportTripToMarkdown,
  extractPlaceCoordinates,
  getPlannerKindLabel,
  getTripAreaCounts,
  haversineDistanceKm,
  detectHotelTransferDays,
  isPlausibleCustomTag,
  listTripDates,
  parsePlaceExpenseEstimate,
  PLANNER_KIND_ICONS,
  PLANNER_KIND_LABELS,
} from '@/domain/planner';
import { exportTripToICalProMarkdown, ICAL_PRO_PRIORITY_MAP } from '@/domain/ical-pro';
import { buildPlannerDayExecutionTimeline, findPlannerTimeOverlaps, type PlannerExecutionTransitionItem, type PlannerTimelineStopItem } from '@/domain/planner-schedule';
import { plannerRepository } from '@/services/PlannerRepository';
import { AppInstallGuideModal } from '@/components/pwa/AppInstallGuideModal';
import { ackCapturedPlaces, pullCaptureState, setCaptureContext } from './capture-bridge';
import { PlannerMap } from './PlannerMap';
import { HotelComparisonModal } from './HotelComparisonModal';
import { PlannerBudgetLedger } from './PlannerBudgetLedger';
import { ImportCandidatesModal } from './ImportCandidatesModal';
import { PlaceTimingModal } from './PlaceTimingModal';

interface PlannerHomeProps {
  disabled: boolean;
}

function formatDay(date: string, language: 'en' | 'zh'): string {
  const [, month, day] = date.split('-');
  return language === 'zh' ? `${Number(month)}月${Number(day)}日` : `${month}/${day}`;
}

function placeMeta(place: PlannerTripPlace | PlannerScheduledPlaceDomain, language: 'en' | 'zh' = 'zh'): string {
  const kindLabel = `${PLANNER_KIND_ICONS[place.kind] || '📍'} ${getPlannerKindLabel(place.kind, language)}`;
  const durationLabel = place.duration_minutes
    ? (language === 'zh' ? `${place.duration_minutes} 分钟` : `${place.duration_minutes} min`)
    : null;
  const windowMap: Record<string, { zh: string; en: string }> = {
    morning: { zh: '上午', en: 'Morning' },
    afternoon: { zh: '下午', en: 'Afternoon' },
    evening: { zh: '傍晚', en: 'Evening' },
    night: { zh: '夜间', en: 'Night' },
  };
  const windowLabel = place.preferred_window
    ? (windowMap[place.preferred_window.toLowerCase()]?.[language] || place.preferred_window)
    : null;

  return [
    place.area,
    kindLabel,
    durationLabel,
    windowLabel,
  ].filter(Boolean).join(' · ');
}

function formatDistanceBadge(distKm: number, zh: boolean): string {
  if (!Number.isFinite(distKm)) return '';
  if (distKm < 1) {
    return zh ? `距上一站 ${Math.round(distKm * 1000)} m` : `${Math.round(distKm * 1000)}m from last stop`;
  }
  return zh ? `距上一站 ${distKm.toFixed(1)} km` : `${distKm.toFixed(1)}km from last stop`;
}

export function PlannerHome({ disabled }: PlannerHomeProps) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const [trips, setTrips] = useState<PlannerTrip[]>([]);
  const [places, setPlaces] = useState<PlannerTripPlace[]>([]);
  const [visits, setVisits] = useState<PlannerTripVisit[]>([]);
  const [legs, setLegs] = useState<PlannerTripLeg[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [capturePending, setCapturePending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
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
    async (item: Omit<TripExpenseItem, 'id' | 'created_at'>) => {
      if (!selectedTripId) return;
      const newExp: TripExpenseItem = { ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      try {
        await plannerRepository.upsertExpense(newExp);
        setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: [newExp, ...(prev[selectedTripId] ?? [])] }));
      } catch (error) {
        console.warn('[Planner] Failed to persist expense', error);
        setNotice(zh ? '费用保存失败，界面未写入未持久化数据。' : 'Expense save failed; the UI was not updated with unsaved data.');
      }
    },
    [selectedTripId, zh],
  );

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      if (!selectedTripId) return;
      try {
        await plannerRepository.deleteExpense(id);
        setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: (prev[selectedTripId] ?? []).filter((expense) => expense.id !== id) }));
      } catch (error) {
        console.warn('[Planner] Failed to delete expense', error);
        setNotice(zh ? '费用删除失败，原记录仍保留。' : 'Expense delete failed; the original record is still present.');
      }
    },
    [selectedTripId, zh],
  );

  const handleUpdateMembers = useCallback(
    async (nextMembers: string[]) => {
      if (!selectedTripId) return;
      const trip = trips.find((item) => item.id === selectedTripId);
      if (!trip) return;
      try {
        const nextTrip = { ...trip, members: nextMembers, updated_at: new Date().toISOString() };
        await plannerRepository.upsertTrip(nextTrip);
        setMembersByTrip((prev) => ({ ...prev, [selectedTripId]: nextMembers }));
        setTrips((prev) => prev.map((item) => (item.id === selectedTripId ? nextTrip : item)));
      } catch (error) {
        console.warn('[Planner] Failed to persist trip members', error);
        setNotice(zh ? '成员保存失败，未更新界面。' : 'Member save failed; the UI was not updated.');
      }
    },
    [selectedTripId, trips, zh],
  );
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [timingModalPlace, setTimingModalPlace] = useState<PlannerScheduledPlace | null>(null);
  const [isPoolCollapsed, setIsPoolCollapsed] = useState(false);
  const [poolSearch, setPoolSearch] = useState('');

  const hydrateLedgerFromVault = useCallback(async (nextTrips: PlannerTrip[]) => {
    const stored = await plannerRepository.listExpenses();
    const grouped: Record<string, TripExpenseItem[]> = {};
    for (const expense of stored) (grouped[expense.trip_id] ??= []).push(expense);
    setExpensesByTrip(grouped);
    const nextMembers: Record<string, string[]> = {};
    for (const trip of nextTrips) {
      if (trip.members?.length) nextMembers[trip.id] = trip.members;
    }
    setMembersByTrip(nextMembers);
  }, []);

  const load = useCallback(async () => {
    if (disabled) return;
    await plannerRepository.initialize();
    const [nextTrips, nextPlaces, nextVisits, nextLegs] = await Promise.all([
      plannerRepository.listTrips(),
      plannerRepository.listPlaces(),
      plannerRepository.listVisits(),
      plannerRepository.listLegs(),
    ]);
    nextTrips.sort((left, right) => right.start_date.localeCompare(left.start_date));
    setTrips(nextTrips);
    setPlaces(nextPlaces);
    setVisits(nextVisits);
    setLegs(nextLegs);
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
      const [nextTrips, nextPlaces, nextVisits, nextLegs, state] = await Promise.all([
        plannerRepository.listTrips(),
        plannerRepository.listPlaces(),
        plannerRepository.listVisits(),
        plannerRepository.listLegs(),
        pullCaptureState(),
      ]);
      if (!active) return;
      nextTrips.sort((left, right) => right.start_date.localeCompare(left.start_date));
      setTrips(nextTrips);
      setPlaces(nextPlaces);
      setVisits(nextVisits);
      setLegs(nextLegs);
      setSelectedTripId((current) => current || nextTrips[0]?.id || '');
      setCapturePending(state ? state.pendingPlaces.length : null);
      try {
        await hydrateLedgerFromVault(nextTrips);
      } catch (error) {
        console.warn('[Planner] ledger hydration failed', error);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [disabled, hydrateLedgerFromVault]);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );

  useEffect(() => {
    const context = selectedTrip
      ? { tripId: selectedTrip.id, title: selectedTrip.title, currency: selectedTrip.currency, tags: selectedTrip.tags }
      : null;
    void setCaptureContext(context);
  }, [selectedTrip]);

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

  const tripTags = useMemo(() => {
    // Collect all place titles and addresses to strictly exclude them from tag filter chips
    const excludedNames = new Set<string>();
    for (const p of tripPlaces) {
      if (p.title) excludedNames.add(p.title.trim().toLowerCase());
      if (p.address) {
        excludedNames.add(p.address.trim().toLowerCase());
        p.address.split(/[,，·]/).forEach((part) => {
          const t = part.trim().toLowerCase();
          if (t.length > 2) excludedNames.add(t);
        });
      }
      if (p.area) excludedNames.add(p.area.trim().toLowerCase());
    }

    const rawTags = [
      ...(selectedTrip?.tags || []),
      ...tripPlaces.flatMap((p) => [...(p.tags || []), ...(p.signals || []), ...(p.risks || [])]),
    ];
    const knownKindTags = new Set(
      Object.values(PLANNER_KIND_LABELS).flatMap((l) => [
        l.zh.toLowerCase(),
        l.en.toLowerCase(),
        '观光景点',
        '餐厅美食',
        '咖啡甜品',
        '酒店住宿',
        '购物商场',
        '交通中转',
        '体验活动',
        '景点',
        '美食',
        '咖啡',
        '住宿',
        '购物',
        '交通',
        '体验',
        '其它',
        '其他',
      ]),
    );
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const raw of rawTags) {
      const trimmed = (raw || '').trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (
        !seen.has(lower) &&
        !knownKindTags.has(lower) &&
        !excludedNames.has(lower) &&
        isPlausibleCustomTag(trimmed, excludedNames)
      ) {
        seen.add(lower);
        unique.push(trimmed);
      }
    }
    return unique;
  }, [selectedTrip, tripPlaces]);

  const candidates = useMemo(
    () => [...tripPlaces]
      .filter((place) => place.state === 'candidate')
      .map((place) => ({
        ...place,
        tags: ensurePlaceKindTag(place.tags, place.kind, language),
      }))
      .sort((left, right) => {
        const lMust = left.priority === 'must' || left.tags.some((t) => t.includes('必去') || t.includes('must'));
        const rMust = right.priority === 'must' || right.tags.some((t) => t.includes('必去') || t.includes('must'));
        if (lMust !== rMust) return lMust ? -1 : 1;
        return left.title.localeCompare(right.title);
      }),
    [tripPlaces, language],
  );

  const filterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; count: number; type: 'all' | 'priority' | 'kind' | 'tag' }> = [
      { id: 'all', label: zh ? '全部' : 'All', count: candidates.length, type: 'all' },
    ];

    const mustCount = candidates.filter((p) => p.priority === 'must').length;
    if (mustCount > 0) chips.push({ id: 'must', label: zh ? '必去' : 'Must', count: mustCount, type: 'priority' });

    const wantCount = candidates.filter((p) => p.priority === 'want').length;
    if (wantCount > 0) chips.push({ id: 'want', label: zh ? '想去' : 'Want', count: wantCount, type: 'priority' });

    const allKinds: PlannerPlaceKind[] = ['stay', 'food', 'cafe', 'attraction', 'experience', 'shopping', 'transit', 'other'];
    for (const kind of allKinds) {
      const kindTagZh = PLANNER_KIND_LABELS[kind]?.zh.toLowerCase() || '';
      const kindTagEn = PLANNER_KIND_LABELS[kind]?.en.toLowerCase() || '';
      const count = candidates.filter(
        (p) =>
          p.kind === kind ||
          p.tags.some((t) => {
            const lower = t.trim().toLowerCase();
            return lower === kindTagZh || lower === kindTagEn;
          }),
      ).length;
      if (count > 0) {
        chips.push({
          id: `kind:${kind}`,
          label: `${PLANNER_KIND_ICONS[kind]} ${getPlannerKindLabel(kind, language)}`,
          count,
          type: 'kind',
        });
      }
    }

    for (const tag of tripTags) {
      const tagLower = tag.trim().toLowerCase();
      const count = candidates.filter(
        (p) =>
          p.tags.some((t) => t.trim().toLowerCase() === tagLower) ||
          p.signals?.some((s) => s.trim().toLowerCase() === tagLower) ||
          p.risks?.some((r) => r.trim().toLowerCase() === tagLower),
      ).length;
      if (count > 0) {
        chips.push({
          id: `tag:${tag}`,
          label: `🏷️ ${tag}`,
          count,
          type: 'tag',
        });
      }
    }

    return chips;
  }, [candidates, zh, language, tripTags]);

  const filteredCandidates = useMemo(() => {
    if (activeFilter === 'all') return candidates;
    if (activeFilter === 'must') return candidates.filter((p) => p.priority === 'must');
    if (activeFilter === 'want') return candidates.filter((p) => p.priority === 'want');
    if (activeFilter.startsWith('kind:')) {
      const targetKind = activeFilter.slice(5) as PlannerPlaceKind;
      const zhLabel = PLANNER_KIND_LABELS[targetKind]?.zh.toLowerCase() || '';
      const enLabel = PLANNER_KIND_LABELS[targetKind]?.en.toLowerCase() || '';
      return candidates.filter(
        (p) =>
          p.kind === targetKind ||
          p.tags.some((t) => {
            const lower = t.trim().toLowerCase();
            return lower === zhLabel || lower === enLabel;
          }),
      );
    }
    if (activeFilter.startsWith('tag:')) {
      const targetTag = activeFilter.slice(4).trim().toLowerCase();
      return candidates.filter(
        (p) =>
          p.tags.some((t) => t.trim().toLowerCase() === targetTag) ||
          p.signals?.some((s) => s.trim().toLowerCase() === targetTag) ||
          p.risks?.some((r) => r.trim().toLowerCase() === targetTag),
      );
    }
    return candidates;
  }, [candidates, activeFilter]);

  const searchFilteredCandidates = useMemo(() => {
    const query = poolSearch.trim().toLowerCase();
    if (!query) return filteredCandidates;
    return filteredCandidates.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        (p.area && p.area.toLowerCase().includes(query)) ||
        (p.address && p.address.toLowerCase().includes(query)) ||
        p.tags.some((t) => t.toLowerCase().includes(query)) ||
        (p.signals && p.signals.some((s) => s.toLowerCase().includes(query))) ||
        (p.risks && p.risks.some((r) => r.toLowerCase().includes(query))) ||
        (p.why && p.why.toLowerCase().includes(query)) ||
        (p.notes && p.notes.toLowerCase().includes(query)),
    );
  }, [filteredCandidates, poolSearch]);

  const [candidateSortMode, setCandidateSortMode] = useState<'default' | 'distance' | 'must' | 'rating'>('default');

  const scheduledAll = useMemo(
    () => materializePlannerScheduledPlaces(
      tripPlaces,
      visits.filter((visit) => visit.trip_id === selectedTripId),
    ),
    [selectedTripId, tripPlaces, visits],
  );

  const scheduled = useMemo(
    () => sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === activeDate)),
    [activeDate, scheduledAll],
  );

  const tripLegs = useMemo(
    () => legs.filter((leg) => leg.trip_id === selectedTripId),
    [legs, selectedTripId],
  );

  const dayTimeline = useMemo(
    () => selectedTrip
      ? buildPlannerDayExecutionTimeline(selectedTrip, scheduledAll, tripLegs, activeDate)
      : { date: activeDate, status: 'unknown' as const, valid: false, items: [] },
    [activeDate, selectedTrip, scheduledAll, tripLegs],
  );

  const scheduledWithCoords = useMemo(
    () => scheduled.filter((p) => extractPlaceCoordinates(p) !== null),
    [scheduled],
  );
  const lastScheduledStop = scheduledWithCoords.length > 0 ? scheduledWithCoords[scheduledWithCoords.length - 1] : null;
  const lastStopCoords = useMemo(() => (lastScheduledStop ? extractPlaceCoordinates(lastScheduledStop) : null), [lastScheduledStop]);

  const candidateDistances = useMemo(() => {
    const map = new Map<string, number>();
    if (!lastStopCoords) return map;
    for (const p of candidates) {
      const coords = extractPlaceCoordinates(p);
      if (coords) {
        map.set(p.id, haversineDistanceKm(lastStopCoords, coords));
      }
    }
    return map;
  }, [candidates, lastStopCoords]);

  const sortedCandidates = useMemo(() => {
    const list = [...searchFilteredCandidates];
    if (candidateSortMode === 'distance' && lastStopCoords) {
      return list.sort((a, b) => {
        const distA = candidateDistances.get(a.id) ?? Infinity;
        const distB = candidateDistances.get(b.id) ?? Infinity;
        if (distA !== distB) return distA - distB;
        return a.title.localeCompare(b.title);
      });
    }
    if (candidateSortMode === 'rating') {
      return list.sort((a, b) => (b.observed_rating ?? 0) - (a.observed_rating ?? 0));
    }
    if (candidateSortMode === 'must') {
      return list.sort((a, b) => {
        const pA = a.priority === 'must' ? 0 : (a.priority === 'want' ? 1 : 2);
        const pB = b.priority === 'must' ? 0 : (b.priority === 'want' ? 1 : 2);
        return pA - pB;
      });
    }
    return list;
  }, [searchFilteredCandidates, candidateSortMode, candidateDistances, lastStopCoords]);

  const candidateHotels = useMemo(
    () => candidates.filter((p) => p.kind === 'stay'),
    [candidates],
  );

  const placesByDate = useMemo(() => {
    const map: Record<string, PlannerScheduledPlace[]> = {};
    tripDates.forEach((date) => {
      map[date] = sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === date));
    });
    return map;
  }, [scheduledAll, tripDates]);

  const transferDaysInfo = useMemo(() => {
    return detectHotelTransferDays(scheduledAll, tripDates);
  }, [scheduledAll, tripDates]);

  const currentDayTransferInfo = activeDate ? transferDaysInfo[activeDate] : undefined;

  const handleSelectHotelForStaySpan = useCallback(
    async (hotel: PlannerTripPlace, stayDates: string[]) => {
      if (disabled || stayDates.length === 0) return;
      setBusy(true);
      try {
        await plannerRepository.setStaySpan(hotel.id, stayDates);
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
    [disabled, zh, load],
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

  const handleSavePlaceTiming = useCallback(
    async (
      visitId: string,
      timing: { scheduled_start?: string; duration_minutes?: number },
    ) => {
      await plannerRepository.updateVisitTiming(visitId, { start: timing.scheduled_start, duration_minutes: timing.duration_minutes });
      await load();
      setNotice(zh ? '已更新行程时段与停留时长！' : 'Updated schedule timing and duration!');
      setTimeout(() => setNotice(''), 3000);
    },
    [load, zh],
  );

  const areaCounts = useMemo(() => getTripAreaCounts(tripPlaces), [tripPlaces]);
  const maxAreaCount = Math.max(1, ...areaCounts.map((item) => item.count));
  const mustTotal = tripPlaces.filter((place) => place.priority === 'must').length;
  const mustScheduled = scheduledAll.filter((place) => place.priority === 'must').length;
  const scheduledMinutes = scheduled.reduce((sum, place) => sum + (place.duration_minutes ?? 0), 0);

  // ── Departure intelligence ────────────────────────────────────────────────

  const tripStart = selectedTrip?.start_date ?? '';
  const daysOut = useMemo(() => (tripStart ? daysUntil(tripStart) : -1), [tripStart]);
  const weatherRelevant = selectedTrip ? isWeatherRelevant(tripStart) : false;

  const primaryCoords = useMemo(() => {
    const withCoords = places.find((p) => p.trip_id === selectedTripId && extractPlaceCoordinates(p));
    return withCoords ? extractPlaceCoordinates(withCoords) : null;
  }, [places, selectedTripId]);

  const [rawWeather, setRawWeather] = useState<WeatherSummary['forecasts']>([]);
  useEffect(() => {
    if (!weatherRelevant || !selectedTrip || !primaryCoords) return;
    let stale = false;
    void fetchWeather(primaryCoords.lat, primaryCoords.lng, tripStart, selectedTrip.end_date)
      .then((data) => { if (!stale) setRawWeather(data); })
      .catch(() => {});
    return () => { stale = true; };
  }, [weatherRelevant, selectedTrip, primaryCoords, tripStart]);

  const weather = useMemo(() => {
    return weatherRelevant && selectedTrip && primaryCoords ? rawWeather : [];
  }, [weatherRelevant, selectedTrip, primaryCoords, rawWeather]);

  const urgencies = useMemo(() => {
    if (!selectedTrip) return [];
    return computeUrgencies(places, selectedTrip.start_date);
  }, [places, selectedTrip]);

  const activeDayWeather = useMemo(
    () => weather.find((w) => w.date === activeDate) ?? null,
    [weather, activeDate],
  );

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

  const dayCollisions = useMemo(() => {
    return checkDayScheduleCollisions(scheduledAll, activeDate);
  }, [scheduledAll, activeDate]);

  const dayTimeOverlaps = useMemo(() => {
    return findPlannerTimeOverlaps(scheduledAll, activeDate);
  }, [scheduledAll, activeDate]);

  const dayEstimatedCost = useMemo(() => {
    if (!selectedTrip) return { total: 0, unconverted: 0 };
    let total = 0;
    let unconverted = 0;
    const tripCurrency = selectedTrip.currency || 'USD';
    const fx = { base: tripCurrency, overrides: selectedTrip.fx_rates };
    scheduled.forEach((place) => {
      const estimate = parsePlaceExpenseEstimate(place, tripCurrency);
      if (!estimate) return;
      const rate = effectiveFxRate(estimate.currency, fx);
      if (rate === null) {
        unconverted += 1;
        return;
      }
      const quantity = estimate.unit === 'person' ? Math.max(1, currentMembers.length) : 1;
      total += estimate.amount * rate * quantity;
    });
    return { total: Math.round(total * 100) / 100, unconverted };
  }, [scheduled, selectedTrip, currentMembers.length]);

  const dayActualCost = useMemo(() => {
    if (!selectedTrip) return { total: 0, unconverted: 0 };
    const tripCurrency = selectedTrip.currency || 'USD';
    const fx = { base: tripCurrency, overrides: selectedTrip.fx_rates };
    let total = 0;
    let unconverted = 0;
    currentExpenses.filter((expense) => expense.date === activeDate).forEach((expense) => {
      const rate = effectiveFxRate(expense.currency, fx);
      if (rate === null) unconverted += 1;
      else total += expense.amount * rate;
    });
    return { total: Math.round(total * 100) / 100, unconverted };
  }, [currentExpenses, activeDate, selectedTrip]);

  const copyMarkdownItinerary = useCallback(async () => {
    if (!selectedTrip) return;
    const md = exportTripToMarkdown(selectedTrip, places, scheduledAll, currentExpenses, language);
    await navigator.clipboard.writeText(md);
    setNotice(zh ? '已复制 Markdown 完整行程单至剪贴板！' : 'Copied Markdown itinerary to clipboard!');
    setTimeout(() => setNotice(''), 3000);
  }, [selectedTrip, places, scheduledAll, currentExpenses, language, zh]);

  const copyICalProMarkdown = useCallback(async () => {
    if (!selectedTrip) return;
    const md = exportTripToICalProMarkdown(selectedTrip, places, visits, { language });
    await navigator.clipboard.writeText(md);
    setNotice(
      zh
        ? '已复制 iCal Pro 日历投影；时间只来自 Planner 已确认的开始时间与时长。'
        : 'Copied the iCal Pro calendar projection; timed events only use confirmed Planner start times and durations.',
    );
    setTimeout(() => setNotice(''), 4000);
  }, [selectedTrip, places, visits, language, zh]);

  const downloadICalProMarkdown = useCallback(() => {
    if (!selectedTrip) return;
    const md = exportTripToICalProMarkdown(selectedTrip, places, visits, { language });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip--${selectedTrip.id}.itinerary.md`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(
      zh
        ? '已下载 iCal Pro 日历投影 (.md)；可放入 Obsidian Vault 由 iCal Pro 生成订阅源。'
        : 'Downloaded the iCal Pro calendar projection (.md).',
    );
  }, [selectedTrip, places, visits, language, zh]);

  const saveICalProMarkdownToVault = useCallback(async () => {
    if (!selectedTrip) return;
    try {
      const fileName = await plannerRepository.saveTripICalMarkdown(selectedTrip.id);
      setNotice(
        zh
          ? `已更新 Trips/${fileName} 日历投影；订阅日历将在客户端下一次刷新时更新。`
          : `Updated Trips/${fileName}; subscribed calendars will update on their next client refresh.`,
      );
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setNotice(zh ? `保存至 Vault 失败: ${String(err)}` : `Failed to save to Vault: ${String(err)}`);
      setTimeout(() => setNotice(''), 4000);
    }
  }, [selectedTrip, zh]);

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
    await plannerRepository.addVisit(placeId, date);
    await load();
  }, [activeDate, load]);

  const removeVisit = useCallback(async (place: PlannerScheduledPlace) => {
    await plannerRepository.removeVisit(place.visit_id);
    await load();
  }, [load]);

  const moveScheduled = useCallback(async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= scheduled.length) return;
    const orderedIds = scheduled.map((p) => p.id);
    const [moved] = orderedIds.splice(index, 1);
    orderedIds.splice(targetIndex, 0, moved);
    await plannerRepository.reorderVisits(activeDate, orderedIds);
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
      if (state.pendingPlaces.length > 0) {
        const importedIds = await plannerRepository.importCapturedPlaces(state.pendingPlaces);
        if (importedIds.length > 0) {
          const acknowledged = await ackCapturedPlaces(importedIds);
          if (!acknowledged) throw new Error('Capture ACK failed');
        }
        setCapturePending(state.pendingPlaces.length - importedIds.length);
        setNotice(zh
          ? `已同步 ${importedIds.length} 个研究候选。`
          : `Synced ${importedIds.length} research candidates.`);
      } else {
        setCapturePending(0);
        setNotice(zh ? '没有待同步的研究候选。' : 'No pending research candidates to sync.');
      }
      await load();
      setSelectedTripId((current) => current || state.activeContext?.tripId || '');
    } catch {
      setCapturePending(null);
      setNotice(zh ? '同步失败：无法写入数据目录或扩展未响应。' : 'Sync failed: could not write data folder or extension unreachable.');
    } finally {
      setBusy(false);
    }
  }, [load, zh]);

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
              onChange={(event) => {
                setSelectedTripId(event.target.value);
                setActiveFilter('all');
              }}
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
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
            title={zh ? '从剪贴板、Google Maps 链接、KML、CSV 或 JSON 批量导入候选' : 'Import candidates from clipboard, links, KML, CSV, or JSON'}
          >
            <span>📥</span>
            <span>{zh ? '导入候选' : 'Import'}</span>
          </button>
          <button
            type="button"
            onClick={() => void copyMarkdownItinerary()}
            className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
            title={zh ? '一键复制 Markdown 完整行程单至剪贴板' : 'Copy complete Markdown itinerary to clipboard'}
          >
            <span>📋</span>
            <span>{zh ? '复制行程单' : 'Copy Markdown'}</span>
          </button>
          <button
            type="button"
            onClick={() => void copyICalProMarkdown()}
            className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
            title={zh ? '一键生成并复制符合 obsidian-ical-plugin-pro 语法的 Markdown 日历单（支持 Google Calendar 同步）' : 'Copy iCal Pro Markdown for Google Calendar sync'}
          >
            <span>📅</span>
            <span>{zh ? 'iCal Pro 日历' : 'iCal Pro'}</span>
          </button>
          <button
            type="button"
            onClick={() => void saveICalProMarkdownToVault()}
            className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
            title={zh ? '从当前 Planner/Vault 权威状态重新生成 iCal Pro 日历投影' : 'Regenerate the iCal Pro projection from canonical Planner/Vault state'}
          >
            <span>💾</span>
            <span>{zh ? '保存日历至 Vault' : 'Save to Vault'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsPoolCollapsed(false);
              document.getElementById('research-pool-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:border-stone-300 active:scale-98"
            title={zh ? '跳转至下方候选池' : 'Jump to Research Pool below'}
          >
            <span>🗂️</span>
            <span>{zh ? '候选池' : 'Pool'}</span>
            <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[10px] font-bold text-stone-600">
              {candidates.length}
            </span>
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

      {/* Departure Intelligence Bar */}
      {(urgencies.length > 0 || (weatherRelevant && weather.length > 0)) && selectedTrip ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
              ⏰ {zh ? '出发情报' : 'Departure Intel'}
              <span className="ml-1 rounded-full bg-amber-200/70 px-1.5 py-0 text-[9px] font-bold text-amber-800">
                {daysOut >= 0 ? `D-${daysOut}` : ''}
              </span>
            </span>
            {weatherRelevant ? (
              <div className="flex gap-1">
                {weather.slice(0, 7).map((w) => (
                  <span
                    key={w.date}
                    className={`inline-flex flex-col items-center rounded-md px-1.5 py-0.5 text-[9px] leading-tight ${
                      w.date === activeDate
                        ? 'bg-white ring-1 ring-amber-400 font-bold'
                        : 'bg-white/60 text-stone-500'
                    }`}
                    title={w.date}
                  >
                    <span>{w.label}</span>
                    <span>{w.temp_min}°~{w.temp_max}°</span>
                    {w.is_rainy ? <span className="text-sky-600">🌧️</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {urgencies.length > 0 ? (
            <ul className="space-y-0.5 mt-1">
              {urgencies.slice(0, 5).map((u, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px] leading-4">
                  <span className={u.severity === 'urgent' ? 'text-red-600 font-bold' : 'text-amber-600'}>{u.severity === 'urgent' ? '🔴' : '🟡'}</span>
                  <span className="text-stone-700">{u.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(340px,1fr)_minmax(0,3fr)]">
        <section
          className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm flex flex-col"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain') || draggingPlaceId;
            if (id) void schedulePlace(id);
            setDraggingPlaceId(null);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">{zh ? '执行时间线' : 'Execution Timeline'}</h2>
                <p className="text-[11px] text-stone-400">{activeDate} · {scheduled.length} {zh ? '个游览点' : 'stops'}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                dayTimeline.status === 'feasible'
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : dayTimeline.status === 'conflict'
                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                    : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              }`}>
                {dayTimeline.status === 'feasible'
                  ? (zh ? '可执行' : 'Feasible')
                  : dayTimeline.status === 'conflict'
                    ? (zh ? '有冲突' : 'Conflict')
                    : (zh ? '待补信息' : 'Unknown')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsPoolCollapsed(false);
                  document.getElementById('research-pool-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="ml-1 inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition shadow-2xs"
                title={zh ? '跳转至下方候选池' : 'Jump to Research Pool below'}
              >
                <span>🗂️ {zh ? '候选池' : 'Pool'}</span>
                <span className="rounded-full bg-stone-200 px-1.5 py-0 text-[9.5px] font-bold text-stone-700">{candidates.length}</span>
              </button>
              <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-stone-50 border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700">
                <span>💸</span>
                <span>{zh ? '预估' : 'Est'}: {currencySymbolFor(selectedTrip.currency)}{dayEstimatedCost.total}</span>
                <span className="text-stone-300">|</span>
                <span>{zh ? '实记' : 'Act'}: {currencySymbolFor(selectedTrip.currency)}{dayActualCost.total}</span>
                {dayEstimatedCost.unconverted + dayActualCost.unconverted > 0 ? (
                  <span className="text-amber-700" title={zh ? '存在缺少可用汇率的金额，未计入总额' : 'Some amounts lack a usable FX rate and are excluded'}>
                    ⚠ {dayEstimatedCost.unconverted + dayActualCost.unconverted}
                  </span>
                ) : null}
              </div>
            </div>
            {activeDayWeather ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeDayWeather.is_rainy
                    ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-300'
                    : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                }`}
                title={zh
                  ? `${activeDayWeather.temp_min}°C ~ ${activeDayWeather.temp_max}°C · 降水 ${activeDayWeather.precipitation_mm}mm`
                  : `${activeDayWeather.temp_min}°C ~ ${activeDayWeather.temp_max}°C · ${activeDayWeather.precipitation_mm}mm precip`}
              >
                {activeDayWeather.label} {activeDayWeather.temp_min}°~{activeDayWeather.temp_max}°
                {activeDayWeather.is_rainy ? (zh ? ' 🌧️ 有雨' : ' 🌧️ Rain') : ''}
              </span>
            ) : null}
            {scheduled.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-800"
                  title={zh ? '真实交通时间优化通过本地 Ownly MCP 执行；网页不持有路由 API key' : 'Travel-time optimization runs through local Ownly MCP; the web app never holds the routing API key'}
                >
                  ⏱️ {zh ? 'MCP 真实交通优化' : 'MCP travel-time optimize'}
                </span>
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
                  onClick={downloadICalProMarkdown}
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '下载 iCal Pro (.md) 日历文件（支持 Google Calendar 同步）' : 'Download iCal Pro (.md) calendar file'}
                >
                  📅 iCal
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
          {dayCollisions.isOverloaded || dayCollisions.longTransits.length > 0 || dayTimeOverlaps.length > 0 ? (
            <div className="mx-4 mt-2 space-y-1">
              {dayTimeOverlaps.map((overlap) => (
                <div key={`${overlap.fromId}-${overlap.toId}`} className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-900 shadow-2xs font-medium">
                  <span>⚠️</span>
                  <span>{zh ? `${overlap.fromTitle} 与 ${overlap.toTitle} 时段重叠（${overlap.fromTime} / ${overlap.toTime}）` : `${overlap.fromTitle} overlaps ${overlap.toTitle} (${overlap.fromTime} / ${overlap.toTime})`}</span>
                </div>
              ))}
              {dayCollisions.isOverloaded ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-2xs font-medium">
                  <span>⚠️</span>
                  <span>{dayCollisions.overloadReason}</span>
                </div>
              ) : null}
              {dayCollisions.longTransits.map((lt, idx) => (
                <div key={idx} className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] text-sky-900 shadow-2xs">
                  <span>🚗</span>
                  <span><b>{lt.fromTitle} ➔ {lt.toTitle}</b>: {lt.warning}</span>
                </div>
              ))}
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
                  const timeOverlap = dayTimeOverlaps.find((overlap) => overlap.fromId === place.id || overlap.toId === place.id);
                  const col = timeOverlap
                    ? { isCollision: true, reason: zh ? '与当天其它地点存在时间重叠' : 'Overlaps another timed stop on this day' }
                    : dayCollisions.placeCollisions[place.id] || checkOpeningHoursCollision(place.open_hours, activeDate, place.preferred_window);
                  const timelineStop = dayTimeline.items.find(
                    (item): item is PlannerTimelineStopItem => item.type === 'stop' && item.place_id === place.id,
                  );
                  const nextPlace = scheduled[index + 1];
                  const transitionItems = nextPlace
                    ? dayTimeline.items.filter(
                      (item): item is PlannerExecutionTransitionItem => item.type !== 'stop' && item.from_id === place.id && item.to_id === nextPlace.id,
                    )
                    : [];
                  return (
                    <li
                      key={place.id}
                      className="space-y-1.5"
                      onMouseEnter={() => setHighlightedPlaceId(place.id)}
                      onMouseLeave={() => setHighlightedPlaceId(null)}
                    >
                      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-xs">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-xs font-bold text-white shrink-0">{index + 1}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-sm font-semibold text-stone-900">{place.title}</h3>
                            <button
                              type="button"
                              onClick={() => setTimingModalPlace(place)}
                              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9.5px] font-semibold transition hover:scale-102 ${
                                timelineStop?.start
                                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 ring-1 ring-stone-300/60'
                                  : 'border border-dashed border-stone-300 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-700'
                              }`}
                              title={zh ? '设置此站的开始时间与停留时长；日历投影由 Planner 权威状态生成' : 'Set start time and duration; calendar output is derived from Planner state'}
                            >
                              <span>🕒</span>
                              <span>{timelineStop?.start ? `${timelineStop.start}${timelineStop.end ? `-${timelineStop.end}${timelineStop.crosses_midnight ? ' +1' : ''}` : ''}` : (zh ? '设时间' : 'Time')}</span>
                            </button>
                            {place.priority ? (
                              <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-stone-600" title="iCal Pro 优先级">
                                {ICAL_PRO_PRIORITY_MAP[place.priority] || '🔼'}
                              </span>
                            ) : null}
                            {place.locked ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">📌 {zh ? '固定顺位' : 'pinned'}</span> : null}
                            {place.observed_price ? <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[10px] text-stone-500">{place.observed_price}</span> : null}
                            {place.tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-medium text-emerald-800">
                                🏷️ {tag}
                              </span>
                            ))}
                            {place.signals?.map((signal) => (
                              <span key={signal} className="rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9.5px] font-medium text-teal-800">
                                ✅ {signal}
                              </span>
                            ))}
                            {place.risks?.map((risk) => (
                              <span key={risk} className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-800">
                                ⚠️ {risk}
                              </span>
                            ))}
                          </div>
                          <p className="mt-0.5 text-[11px] text-stone-400">{placeMeta(place, language)}</p>
                          {col.isCollision ? (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                              ⚠️ {col.reason}
                            </div>
                          ) : null}
                          {place.why ? <p className="mt-1 line-clamp-1 text-xs text-stone-600">💡 {place.why}</p> : null}
                          {place.notes ? <p className="mt-0.5 line-clamp-1 text-xs text-stone-500 italic">📝 {place.notes}</p> : null}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            aria-label={place.locked ? (zh ? '已固定顺位（点击取消固定）' : 'Pinned (click to unpin)') : (zh ? '固定在当前顺位（点击固定）' : 'Pin stop at slot')}
                            onClick={async () => {
                              await plannerRepository.toggleVisitLock(place.visit_id);
                              await load();
                            }}
                            className={`h-8 w-8 rounded-md border text-xs transition ${
                              place.locked
                                ? 'border-amber-300 bg-amber-50 text-amber-700 font-bold'
                                : 'border-stone-200 text-stone-400 hover:bg-stone-50 hover:text-stone-700'
                            }`}
                            title={place.locked ? (zh ? '已固定顺位（真实交通时间优化不会挪动此站）' : 'Pinned (travel-time optimization will not move this stop)') : (zh ? '点击固定此站顺位' : 'Click to pin stop')}
                          >
                            {place.locked ? '📌' : '📍'}
                          </button>
                          <button type="button" aria-label={zh ? '上移' : 'Move up'} disabled={index === 0} onClick={() => void moveScheduled(index, -1)} className="h-8 w-8 rounded-md border border-stone-200 text-xs text-stone-500 hover:bg-stone-50 disabled:opacity-30">↑</button>
                          <button type="button" aria-label={zh ? '下移' : 'Move down'} disabled={index === scheduled.length - 1} onClick={() => void moveScheduled(index, 1)} className="h-8 w-8 rounded-md border border-stone-200 text-xs text-stone-500 hover:bg-stone-50 disabled:opacity-30">↓</button>
                          <button type="button" aria-label={zh ? '移除此访问' : 'Remove visit'} onClick={() => void removeVisit(place)} className="h-8 rounded-md border border-stone-200 px-2 text-[10px] font-semibold text-stone-500 hover:bg-stone-50">{zh ? '移除' : 'Remove'}</button>
                        </div>
                      </div>
{index < scheduled.length - 1 ? (
                        <div className="ml-4 space-y-1 border-l-2 border-stone-200 py-1 pl-3">
                          {transitionItems.length === 0 ? (
                            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[10px] font-semibold text-stone-500">
                              ❔ {zh ? '交通时间未确认' : 'Travel time unknown'}
                            </div>
                          ) : transitionItems.map((item) => {
                            if (item.type === 'travel') {
                              const icon = item.mode === 'walking' ? '🚶' : item.mode === 'driving' ? '🚗' : item.mode === 'bicycling' ? '🚲' : '🚇';
                              const distance = item.distance_meters === undefined
                                ? ''
                                : item.distance_meters < 1000 ? ` · ${item.distance_meters} m` : ` · ${(item.distance_meters / 1000).toFixed(1)} km`;
                              return (
                                <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-semibold text-sky-800">
                                  <span>{icon} {item.duration_minutes} min{distance}{item.source === 'openrouteservice' ? ' · ORS · OSM' : ' · manual'}</span>
                                  {item.start && item.end ? <span>⏱ {item.start}-{item.end}</span> : null}
                                  <a
                                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline underline-offset-2 hover:text-stone-950"
                                  >
                                    Google Maps ↗
                                  </a>
                                </div>
                              );
                            }
                            if (item.type === 'gap') {
                              return (
                                <div key={item.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">
                                  ◌ {zh ? `机动 ${item.duration_minutes} min` : `${item.duration_minutes} min gap`} · {item.start}-{item.end}
                                </div>
                              );
                            }
                            if (item.type === 'conflict') {
                              return (
                                <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-semibold text-red-700">
                                  ❌ {zh
                                    ? `衔接冲突 · 最早 ${item.earliest_arrival ?? '次日'} 到达 · 比 ${item.next_start ?? '下一站'} 晚 ${item.late_by_minutes} min`
                                    : `Connection conflict · earliest ${item.earliest_arrival ?? 'next day'} · ${item.late_by_minutes} min late`}
                                </div>
                              );
                            }
                            return (
                              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-700">
                                <span>❔ {item.reason === 'travel_time_missing'
                                  ? (zh ? '交通时间未确认' : 'Travel time unknown')
                                  : (zh ? '时间不完整，无法判断衔接' : 'Schedule timing incomplete')}</span>
                                {item.reason === 'travel_time_missing' ? (
                                  <a
                                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline underline-offset-2 hover:text-stone-950"
                                  >
                                    Google Maps ↗
                                  </a>
                                ) : null}
                              </div>
                            );
                          })}
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
                onUnschedulePlace={removeVisit}
                onHoverPlace={setHighlightedPlaceId}
                language={language}
              />
            </div>
          ) : rightTab === 'budget' ? (
            <PlannerBudgetLedger
              key={selectedTrip.id}
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
                candidatePlaces={sortedCandidates}
                destinations={selectedTrip?.destinations}
                activeDate={activeDate}
                activeDayIndex={activeDayIndex}
                highlightedPlaceId={highlightedPlaceId}
                onSchedulePlace={schedulePlace}
                onUnschedulePlace={removeVisit}
                onHoverPlace={setHighlightedPlaceId}
                language={language}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Horizontal Full-Width Candidate Research Pool below Day Skeleton and Map Workspace */}
      <section
        id="research-pool-section"
        className="mt-4 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm flex flex-col transition-all"
      >
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/90 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🗂️</span>
              <h2 className="text-sm font-semibold text-stone-900">{zh ? '行程候选池' : 'Research Pool'}</h2>
              <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-xs font-bold text-stone-700">
                {searchFilteredCandidates.length}/{candidates.length}
              </span>
            </div>
            <p className="hidden md:block text-xs text-stone-400">
              {zh ? '在 Google Maps 研究完成的候选地点，可直接排入当天或拖拽至上方日程' : 'Researched places from Google Maps. Schedule to day or drag into list above.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Inline Search */}
            <div className="relative">
              <input
                type="text"
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
                placeholder={zh ? '🔍 搜索候选地点、区域或标签...' : '🔍 Search candidates, areas, tags...'}
                className="w-44 sm:w-60 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-hidden"
              />
              {poolSearch ? (
                <button
                  type="button"
                  onClick={() => setPoolSearch('')}
                  className="absolute right-2 top-1.5 text-xs text-stone-400 hover:text-stone-700"
                >
                  ✕
                </button>
              ) : null}
            </div>

            {/* Candidate Pool Sort Selector */}
            <select
              value={candidateSortMode}
              onChange={(e) => setCandidateSortMode(e.target.value as 'default' | 'distance' | 'must' | 'rating')}
              aria-label={zh ? '候选池排序' : 'Sort candidates'}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 focus:border-stone-400 focus:outline-hidden shadow-2xs"
            >
              <option value="default">{zh ? '⚡ 默认排序' : '⚡ Default'}</option>
              <option value="distance" disabled={!lastStopCoords}>
                {zh
                  ? (lastScheduledStop ? `📍 距上一站最近 (${lastScheduledStop.title.slice(0, 7)})` : '📍 距上一站最近')
                  : (lastScheduledStop ? `📍 Closest to last stop (${lastScheduledStop.title.slice(0, 7)})` : '📍 Closest to last stop')}
              </option>
              <option value="must">{zh ? '🎯 优先必去 (Must)' : '🎯 Priority (Must)'}</option>
              <option value="rating">{zh ? '⭐ 评分最高 (Rating)' : '⭐ Highest Rating'}</option>
            </select>

            {/* Multi-dimensional Hotel Compare */}
            {candidateHotels.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsHotelModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 shadow-2xs hover:bg-amber-100 transition"
              >
                <span>🏨</span>
                <span>{zh ? `住宿比选 (${candidateHotels.length})` : `Compare Stays (${candidateHotels.length})`}</span>
              </button>
            ) : null}

            {/* Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsPoolCollapsed((prev) => !prev)}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition shadow-2xs"
              title={isPoolCollapsed ? (zh ? '展开候选池' : 'Expand') : (zh ? '折叠候选池' : 'Collapse')}
            >
              {isPoolCollapsed ? (zh ? '▼ 展开' : '▼ Expand') : (zh ? '▲ 收起' : '▲ Collapse')}
            </button>
          </div>
        </div>

        {!isPoolCollapsed ? (
          <>
            {/* Category & Tag Filter Chips Bar */}
            {candidates.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 bg-stone-50/50 px-4 py-2">
                {filterChips.map((f) => {
                  const isSelected = activeFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActiveFilter(isSelected && f.id !== 'all' ? 'all' : f.id)}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition ${
                        isSelected
                          ? 'bg-stone-900 text-white shadow-2xs'
                          : f.type === 'kind'
                          ? 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                          : f.type === 'tag'
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {f.label} ({f.count})
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Candidate Place Cards Grid (Multi-column responsive horizontal grid!) */}
            <div className="p-4">
              {sortedCandidates.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-400">
                  <p className="text-2xl mb-1.5">📭</p>
                  <p>{candidates.length === 0 ? (zh ? '当前行程暂无候选地点，浏览地图或导入收藏夹即可添加。' : 'No candidates yet.') : (zh ? '没有匹配的候选地点。' : 'No matching candidates.')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {sortedCandidates.map((place) => (
                    <article
                      key={place.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', place.id);
                        event.dataTransfer.dropEffect = 'move';
                        setDraggingPlaceId(place.id);
                      }}
                      onDragEnd={() => setDraggingPlaceId(null)}
                      onMouseEnter={() => setHighlightedPlaceId(place.id)}
                      onMouseLeave={() => setHighlightedPlaceId(null)}
                      className={`flex flex-col justify-between rounded-lg border bg-stone-50/70 p-3 transition-all duration-150 cursor-grab active:cursor-grabbing ${
                        highlightedPlaceId === place.id
                          ? 'border-emerald-500 ring-2 ring-emerald-300/60 bg-emerald-50/40 shadow-xs'
                          : 'border-stone-200 hover:border-stone-300 hover:bg-white hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1.5">
                          <h3 className="truncate text-sm font-semibold text-stone-900" title={place.title}>
                            {place.title}
                          </h3>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => void schedulePlace(place.id)}
                              className="rounded-md bg-stone-950 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-stone-800 transition"
                              title={zh ? '直接排入当天日程' : 'Schedule to active day'}
                            >
                              + {zh ? '当天' : 'Day'}
                            </button>
                          </div>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-stone-400">{placeMeta(place, language)}</p>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {candidateDistances.has(place.id) ? (
                            <span
                              className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-semibold text-emerald-800"
                              title={zh ? `距当天最后一站「${lastScheduledStop?.title}」的直线距离` : `Distance to ${lastScheduledStop?.title}`}
                            >
                              📍 {formatDistanceBadge(candidateDistances.get(place.id)!, zh)}
                            </span>
                          ) : null}
                          <span className={`rounded-full px-1.5 py-0.2 text-[9.5px] font-semibold ${place.priority === 'must' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                            {place.priority}
                          </span>
                          {place.observed_rating ? (
                            <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">
                              ★ {place.observed_rating}
                            </span>
                          ) : null}
                          {place.observed_price ? (
                            <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">
                              {place.observed_price}
                            </span>
                          ) : null}
                          {place.tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.2 text-[9.5px] font-medium text-emerald-800">
                              🏷️ {tag}
                            </span>
                          ))}
                          {place.signals?.map((signal) => (
                            <span key={signal} className="rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.2 text-[9.5px] font-medium text-teal-800">
                              ✅ {signal}
                            </span>
                          ))}
                          {place.risks?.map((risk) => (
                            <span key={risk} className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.2 text-[9.5px] font-medium text-amber-800">
                              ⚠️ {risk}
                            </span>
                          ))}
                        </div>
                      </div>

                      {place.why ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-4.5 text-stone-600" title={place.why}>
                          💡 {place.why}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>

      <ImportCandidatesModal
        key={`import-${selectedTrip.id}-${isImportModalOpen}`}
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tripId={selectedTrip.id}
        tripTitle={selectedTrip.title}
        onImportSuccess={(count) => {
          void load();
          setNotice(zh ? `成功导入 ${count} 个候选地点！` : `Successfully imported ${count} places!`);
        }}
        language={language}
      />

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

      <PlaceTimingModal
        key={`timing-${timingModalPlace?.id}-${timingModalPlace?.scheduled_start}-${timingModalPlace?.duration_minutes}`}
        open={Boolean(timingModalPlace)}
        place={timingModalPlace}
        dayOtherPlaces={scheduled.filter((p) => p.id !== timingModalPlace?.id)}
        onClose={() => setTimingModalPlace(null)}
        onSave={handleSavePlaceTiming}
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
