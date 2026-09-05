'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type {
  PlannerPlaceKind,
  PlannerTravelMode,
  PlannerTrip,
  PlannerTripLeg,
  PlannerTripPlace,
  TripExpenseItem,
} from '@/domain/planner';
import {
  materializePlannerScheduledPlaces,
  sortPlannerScheduledPlaces,
  type PlannerScheduledPlace,
  type PlannerTripVisit,
} from '@/domain/planner-visits';
import {
  computeUrgencies,
  fetchWeather,
  isWeatherRelevant,
  daysUntil,
  type WeatherSummary,
} from '@/domain/departure';
import {
  calculateDefaultTripLeg,
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
  detectSuspectedDuplicatePlaces,
  isPlausibleCustomTag,
  listTripDates,
  parsePlaceExpenseEstimate,
  PLANNER_KIND_ICONS,
  PLANNER_KIND_LABELS,
} from '@/domain/planner';
import { buildTripCalendarIcs, buildDayCalendarIcs } from '@/domain/calendar-feed';
import { evaluatePlannerDay } from '@/domain/planner-schedule';
import { plannerRepository } from '@/services/PlannerRepository';
import { calendarFeedService } from '@/services/CalendarFeedService';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import {
  applyCaptureImportReport,
  pullCaptureState,
  setCaptureContext,
  setCaptureDebugLogs,
  getCaptureDebugLogs,
} from './capture-bridge';

export interface UsePlannerControllerProps {
  disabled: boolean;
}

function filterAndSearchPlaces(
  places: PlannerTripPlace[],
  activeFilter: string,
  searchQuery: string,
  visitCountByPlaceId?: Map<string, number>,
): PlannerTripPlace[] {
  let filtered = places;
  if (activeFilter === 'must') {
    filtered = places.filter((p) => p.priority === 'must');
  } else if (activeFilter === 'want') {
    filtered = places.filter((p) => p.priority === 'want');
  } else if (activeFilter === 'scheduled') {
    filtered = places.filter((p) => (visitCountByPlaceId?.get(p.id) || 0) > 0);
  } else if (activeFilter.startsWith('kind:')) {
    const targetKind = activeFilter.slice(5) as PlannerPlaceKind;
    const zhLabel = PLANNER_KIND_LABELS[targetKind]?.zh.toLowerCase() || '';
    const enLabel = PLANNER_KIND_LABELS[targetKind]?.en.toLowerCase() || '';
    filtered = places.filter(
      (p) =>
        p.kind === targetKind ||
        p.tags.some((t) => {
          const lower = t.trim().toLowerCase();
          return lower === zhLabel || lower === enLabel;
        }),
    );
  } else if (activeFilter.startsWith('tag:')) {
    const targetTag = activeFilter.slice(4).trim().toLowerCase();
    filtered = places.filter(
      (p) =>
        p.tags.some((t) => t.trim().toLowerCase() === targetTag) ||
        p.signals?.some((s) => s.trim().toLowerCase() === targetTag) ||
        p.risks?.some((r) => r.trim().toLowerCase() === targetTag),
    );
  }

  const query = searchQuery.trim().toLowerCase();
  if (!query) return filtered;
  return filtered.filter(
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
}

function sortPlaceList(
  list: PlannerTripPlace[],
  sortMode: 'default' | 'distance' | 'must' | 'rating',
  candidateDistances: Map<string, number>,
  lastStopCoords: { lat: number; lng: number } | null,
): PlannerTripPlace[] {
  const cloned = [...list];
  if (sortMode === 'distance' && lastStopCoords) {
    return cloned.sort((a, b) => {
      const distA = candidateDistances.get(a.id) ?? Infinity;
      const distB = candidateDistances.get(b.id) ?? Infinity;
      if (distA !== distB) return distA - distB;
      return a.title.localeCompare(b.title);
    });
  }
  if (sortMode === 'rating') {
    return cloned.sort((a, b) => (b.observed_rating ?? 0) - (a.observed_rating ?? 0));
  }
  if (sortMode === 'must') {
    return cloned.sort((a, b) => {
      const pA = a.priority === 'must' ? 0 : (a.priority === 'want' ? 1 : 2);
      const pB = b.priority === 'must' ? 0 : (b.priority === 'want' ? 1 : 2);
      return pA - pB;
    });
  }
  return cloned.sort((left, right) => {
    const lMust = left.priority === 'must' || left.tags.some((t) => t.includes('必去') || t.includes('must'));
    const rMust = right.priority === 'must' || right.tags.some((t) => t.includes('必去') || t.includes('must'));
    if (lMust !== rMust) return lMust ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
}

export function usePlannerController({ disabled }: UsePlannerControllerProps) {
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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice('');
    }, 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const [expensesByTrip, setExpensesByTrip] = useState<Record<string, TripExpenseItem[]>>({});
  const [membersByTrip, setMembersByTrip] = useState<Record<string, string[]>>({});
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [poolSearch, setPoolSearch] = useState('');
  const [candidateSortMode, setCandidateSortMode] = useState<'default' | 'distance' | 'must' | 'rating'>('default');
  const [isBatchOperating, setIsBatchOperating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const dateNavRef = useRef<HTMLDivElement>(null);

  let isPro = true;
  let openLicenseModal: (() => void) | undefined;
  let currentUserId = 'ownly_user';
  try {
    const workspace = useOwnlyWorkspace();
    isPro = workspace.membership?.isPro ?? true;
    openLicenseModal = workspace.openLicenseModal;
    if (workspace.membership?.licenseKeyLast4) {
      currentUserId = `user_pro_${workspace.membership.licenseKeyLast4}`;
    }
  } catch {
    isPro = true;
  }

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
      setCapturePending(state && Array.isArray(state.pendingPlaces) ? state.pendingPlaces.length : null);
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
    () => (selectedTrip ? listTripDates(selectedTrip.start_date, selectedTrip.end_date) : []),
    [selectedTrip],
  );

  const activeDate = useMemo(() => {
    if (!selectedTrip) return '';
    return tripDates.includes(selectedDate) ? selectedDate : (tripDates[0] ?? '');
  }, [selectedDate, selectedTrip, tripDates]);

  const activeDayIndex = useMemo(() => {
    return Math.max(0, tripDates.indexOf(activeDate));
  }, [activeDate, tripDates]);

  // Auto-scroll date navigation to active date
  useEffect(() => {
    if (!dateNavRef.current || !activeDate) return;
    const activeButton = dateNavRef.current.querySelector(`[data-date="${activeDate}"]`);
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeDate]);

  const tripAllPlaces = useMemo(
    () => places.filter((place) => place.trip_id === selectedTripId),
    [places, selectedTripId],
  );
  const tripPlaces = useMemo(
    () => tripAllPlaces.filter((place) => place.state !== 'dropped'),
    [tripAllPlaces],
  );

  const suspectedDuplicatePairs = useMemo(
    () => detectSuspectedDuplicatePlaces(tripPlaces),
    [tripPlaces],
  );

  const ignoredDuplicatePairIds = useMemo(
    () => new Set(selectedTrip?.ignored_duplicate_pair_ids ?? []),
    [selectedTrip?.ignored_duplicate_pair_ids],
  );

  const visibleSuspectedPairs = useMemo(
    () => suspectedDuplicatePairs.filter((pair) => !ignoredDuplicatePairIds.has(pair.pairId)),
    [suspectedDuplicatePairs, ignoredDuplicatePairIds],
  );

  const tripTags = useMemo(() => {
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
        '观光景点', '餐厅美食', '咖啡甜品', '酒店住宿', '购物商场', '交通中转', '体验活动',
        '景点', '美食', '咖啡', '住宿', '购物', '交通', '体验', '其它', '其他',
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

  const tripVisits = useMemo(
    () => visits.filter((visit) => visit.trip_id === selectedTripId),
    [visits, selectedTripId],
  );

  const visitCountByPlaceId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of tripVisits) {
      counts.set(v.place_id, (counts.get(v.place_id) || 0) + 1);
    }
    return counts;
  }, [tripVisits]);

  const allCandidatePlaces = useMemo(
    () =>
      [...tripPlaces].map((place) => ({
        ...place,
        tags: ensurePlaceKindTag(place.tags, place.kind, language),
      })),
    [tripPlaces, language],
  );

  const pendingCandidates = allCandidatePlaces;

  const droppedPlaces = useMemo(
    () =>
      [...tripAllPlaces]
        .filter((place) => place.state === 'dropped')
        .map((place) => ({
          ...place,
          tags: ensurePlaceKindTag(place.tags, place.kind, language),
        })),
    [tripAllPlaces, language],
  );

  const filterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; count: number; type: 'all' | 'priority' | 'kind' | 'tag' | 'status' }> = [
      { id: 'all', label: zh ? '全部' : 'All', count: pendingCandidates.length, type: 'all' },
    ];

    const mustCount = pendingCandidates.filter((p) => p.priority === 'must').length;
    if (mustCount > 0) chips.push({ id: 'must', label: zh ? '必去' : 'Must', count: mustCount, type: 'priority' });

    const wantCount = pendingCandidates.filter((p) => p.priority === 'want').length;
    if (wantCount > 0) chips.push({ id: 'want', label: zh ? '想去' : 'Want', count: wantCount, type: 'priority' });

    if (droppedPlaces.length > 0) chips.push({ id: 'dropped', label: zh ? '🙈 暂不考虑' : '🙈 Shelved', count: droppedPlaces.length, type: 'status' });

    const scheduledCount = pendingCandidates.filter((p) => (visitCountByPlaceId.get(p.id) || 0) > 0).length;
    if (scheduledCount > 0) chips.push({ id: 'scheduled', label: zh ? '📅 已排入' : '📅 Scheduled', count: scheduledCount, type: 'status' });

    const allKinds: PlannerPlaceKind[] = ['stay', 'food', 'cafe', 'attraction', 'experience', 'shopping', 'transit', 'service', 'other'];
    for (const kind of allKinds) {
      const kindTagZh = PLANNER_KIND_LABELS[kind]?.zh.toLowerCase() || '';
      const kindTagEn = PLANNER_KIND_LABELS[kind]?.en.toLowerCase() || '';
      const count = pendingCandidates.filter(
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
      const count = pendingCandidates.filter(
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
  }, [pendingCandidates, droppedPlaces, zh, language, tripTags, visitCountByPlaceId]);

  const scheduledAll = useMemo(
    () => materializePlannerScheduledPlaces(tripPlaces, tripVisits),
    [tripPlaces, tripVisits],
  );

  const scheduled = useMemo(
    () => sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === activeDate)),
    [activeDate, scheduledAll],
  );

  const mapScheduled = useMemo(() => {
    const seen = new Set<string>();
    return scheduled.filter((place) => {
      if (seen.has(place.place_id)) return false;
      seen.add(place.place_id);
      return true;
    });
  }, [scheduled]);

  const tripLegs = useMemo(
    () => legs.filter((leg) => leg.trip_id === selectedTripId),
    [legs, selectedTripId],
  );

  const effectiveDayLegs = useMemo(() => {
    if (!selectedTrip) return tripLegs;
    const existingPairs = new Map<string, PlannerTripLeg>(
      tripLegs.map((l) => [`${l.from_place_id}→${l.to_place_id}`, l]),
    );
    const result = [...tripLegs];
    for (let i = 0; i < scheduled.length - 1; i += 1) {
      const from = scheduled[i];
      const to = scheduled[i + 1];
      const pairKey = `${from.place_id}→${to.place_id}`;
      if (!existingPairs.has(pairKey)) {
        const defaultLeg = calculateDefaultTripLeg(selectedTrip, from, to);
        if (defaultLeg) {
          result.push(defaultLeg);
          existingPairs.set(pairKey, defaultLeg);
        }
      }
    }
    return result;
  }, [selectedTrip, tripLegs, scheduled]);

  const dayAssessment = useMemo(
    () =>
      selectedTrip
        ? evaluatePlannerDay(selectedTrip, scheduledAll, effectiveDayLegs, activeDate)
        : {
            date: activeDate,
            status: 'unknown' as const,
            timeline: { date: activeDate, status: 'unknown' as const, valid: false, items: [] },
            time_overlaps: [],
            travel_conflicts: [],
            opening_hours_warnings: [],
            missing_facts: [],
            is_overloaded: false,
            total_activity_minutes: 0,
            scheduled_places: [],
          },
    [activeDate, selectedTrip, scheduledAll, effectiveDayLegs],
  );

  const dayTimeline = dayAssessment.timeline;

  const scheduledWithCoords = useMemo(
    () => scheduled.filter((p) => extractPlaceCoordinates(p) !== null),
    [scheduled],
  );
  const lastScheduledStop = scheduledWithCoords.length > 0 ? scheduledWithCoords[scheduledWithCoords.length - 1] : null;
  const lastStopCoords = useMemo(() => (lastScheduledStop ? extractPlaceCoordinates(lastScheduledStop) : null), [lastScheduledStop]);

  const candidateDistances = useMemo(() => {
    const map = new Map<string, number>();
    if (!lastStopCoords) return map;
    for (const p of allCandidatePlaces) {
      const coords = extractPlaceCoordinates(p);
      if (coords) {
        map.set(p.id, haversineDistanceKm(lastStopCoords, coords));
      }
    }
    return map;
  }, [allCandidatePlaces, lastStopCoords]);

  const sortedPendingCandidates = useMemo(() => {
    const poolSource = activeFilter === 'dropped' ? droppedPlaces : pendingCandidates;
    const filtered = filterAndSearchPlaces(poolSource, activeFilter, poolSearch, visitCountByPlaceId);
    return sortPlaceList(filtered, candidateSortMode, candidateDistances, lastStopCoords);
  }, [pendingCandidates, droppedPlaces, activeFilter, poolSearch, candidateSortMode, candidateDistances, lastStopCoords, visitCountByPlaceId]);

  const candidateHotels = useMemo(
    () => allCandidatePlaces.filter((p) => p.kind === 'stay'),
    [allCandidatePlaces],
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

  const currentExpenses = useMemo(() => {
    if (!selectedTripId) return [];
    return expensesByTrip[selectedTripId] ?? [];
  }, [selectedTripId, expensesByTrip]);

  const currentMembers = useMemo(() => {
    if (!selectedTripId) return [zh ? '我' : 'Me'];
    return membersByTrip[selectedTripId] ?? (zh ? ['我'] : ['Me']);
  }, [selectedTripId, membersByTrip, zh]);

  // ── Handlers & Mutations ──────────────────────────────────────────────────

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

  const handleSwitchTravelMode = useCallback(
    async (from: PlannerScheduledPlace, to: PlannerScheduledPlace, mode: PlannerTravelMode) => {
      if (!selectedTrip) return;
      const leg = calculateDefaultTripLeg(selectedTrip, from, to, mode);
      if (leg) {
        await plannerRepository.upsertLeg(leg);
        await load();
      }
    },
    [selectedTrip, load],
  );

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

  const handleDropPlace = useCallback(
    async (placeId: string) => {
      if (!placeId || disabled) return;
      try {
        await plannerRepository.dropPlace(placeId);
        await load();
        setNotice(zh ? '已将地点设为暂不考虑' : 'Place shelved');
        setTimeout(() => setNotice(''), 3000);
      } catch {
        setNotice(zh ? '该地点仍在行程中，请先从日程中移除已排访问。' : 'This place is still scheduled. Remove its visits first.');
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, load, zh],
  );

  const handleRestorePlace = useCallback(
    async (placeId: string) => {
      if (!placeId || disabled) return;
      try {
        await plannerRepository.restorePlace(placeId);
        await load();
        setNotice(zh ? '已恢复为待考虑候选' : 'Place restored to candidates');
        setTimeout(() => setNotice(''), 3000);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, load, zh],
  );

  const handleDeletePlace = useCallback(
    async (placeId: string, placeTitle?: string) => {
      if (!placeId || disabled) return;
      const confirmMsg = zh
        ? `确定要彻底删除地点「${placeTitle || '该地点'}」吗？删除后对应文件将被移除。`
        : `Are you sure you want to permanently delete "${placeTitle || 'this place'}"?`;
      if (!window.confirm(confirmMsg)) return;
      try {
        await plannerRepository.deletePlace(placeId);
        await load();
        setNotice(zh ? '已彻底删除地点' : 'Place permanently deleted');
        setTimeout(() => setNotice(''), 3000);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : zh ? '删除失败，若已排入日程请先移除日程' : 'Delete failed');
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, load, zh],
  );

  const handleDeduplicatePlaces = useCallback(async () => {
    if (!selectedTripId || disabled) return;
    try {
      const res = await plannerRepository.deduplicateTripPlaces(selectedTripId);
      await load();
      if (res.mergedCount > 0 || res.removedCount > 0) {
        setNotice(zh ? `去重完成：已合并 ${res.mergedCount} 处重复并清理 ${res.removedCount} 份多余文件` : `Deduplication complete: merged ${res.mergedCount} duplicate place(s)`);
      } else {
        setNotice(zh ? '当前行程候选池未发现重复地点' : 'No duplicate places found in current trip');
      }
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, load, selectedTripId, zh]);

  const handleMergePair = useCallback(
    async (primaryId: string, secondaryId: string) => {
      if (!primaryId || !secondaryId || disabled) return;
      try {
        await plannerRepository.mergePlaces(primaryId, secondaryId);
        await load();
        setNotice(zh ? '已成功合并地点并更新关联日程！' : 'Places merged successfully!');
        setTimeout(() => setNotice(''), 3000);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, load, zh],
  );

  const handleIgnoreSuspectedPair = useCallback(
    async (pairId: string) => {
      if (!pairId || !selectedTrip || disabled) return;
      try {
        const ignored = new Set(selectedTrip.ignored_duplicate_pair_ids ?? []);
        ignored.add(pairId);
        const nextTrip: PlannerTrip = {
          ...selectedTrip,
          ignored_duplicate_pair_ids: [...ignored].sort(),
          updated_at: new Date().toISOString(),
        };
        await plannerRepository.upsertTrip(nextTrip);
        setTrips((prev) => prev.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip)));
        setNotice(zh ? '已确认这两个地点应保持分开' : 'Kept these places separate');
        setTimeout(() => setNotice(''), 2500);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [disabled, selectedTrip, zh],
  );

  const toggleSelectCandidate = useCallback((id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllCandidates = useCallback(() => {
    setSelectedCandidateIds(new Set(sortedPendingCandidates.map((p) => p.id)));
  }, [sortedPendingCandidates]);

  const handleDeselectAllCandidates = useCallback(() => {
    setSelectedCandidateIds(new Set());
  }, []);

  const handleBatchDeleteCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || disabled || isBatchOperating) return;
    const count = selectedCandidateIds.size;
    const confirmMsg = zh
      ? `确定要彻底删除已选中的 ${count} 个地点吗？`
      : `Are you sure you want to permanently delete ${count} selected places?`;
    if (!window.confirm(confirmMsg)) return;
    setIsBatchOperating(true);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    try {
      for (const id of selectedCandidateIds) {
        try {
          await plannerRepository.deletePlace(id);
          succeededIds.push(id);
        } catch {
          failedIds.push(id);
        }
      }
      await load();
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      if (failedIds.length === 0) {
        setIsMultiSelectMode(false);
        setNotice(zh ? `已彻底删除 ${succeededIds.length} 个地点` : `Deleted ${succeededIds.length} places`);
      } else {
        setNotice(
          zh
            ? `已删除 ${succeededIds.length} 个地点，${failedIds.length} 个删除失败`
            : `Deleted ${succeededIds.length} places, ${failedIds.length} failed`,
        );
      }
      setTimeout(() => setNotice(''), 3500);
    } finally {
      setIsBatchOperating(false);
    }
  }, [disabled, isBatchOperating, load, selectedCandidateIds, zh]);

  const handleBatchShelveCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || disabled || isBatchOperating) return;
    setIsBatchOperating(true);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    try {
      for (const id of selectedCandidateIds) {
        try {
          await plannerRepository.dropPlace(id);
          succeededIds.push(id);
        } catch {
          failedIds.push(id);
        }
      }
      await load();
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      if (failedIds.length === 0) {
        setIsMultiSelectMode(false);
        setNotice(zh ? `已将 ${succeededIds.length} 个地点设为暂不考虑` : `Shelved ${succeededIds.length} places`);
      } else {
        setNotice(
          zh
            ? `已将 ${succeededIds.length} 个地点设为暂不考虑，${failedIds.length} 个失败`
            : `Shelved ${succeededIds.length} places, ${failedIds.length} failed`,
        );
      }
      setTimeout(() => setNotice(''), 3500);
    } finally {
      setIsBatchOperating(false);
    }
  }, [disabled, isBatchOperating, load, selectedCandidateIds, zh]);

  const handleBatchScheduleCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || !activeDate || disabled || isBatchOperating) return;
    setIsBatchOperating(true);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    try {
      for (const id of selectedCandidateIds) {
        try {
          await plannerRepository.addVisit(id, activeDate);
          succeededIds.push(id);
        } catch {
          failedIds.push(id);
        }
      }
      await load();
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      if (failedIds.length === 0) {
        setIsMultiSelectMode(false);
        setNotice(zh ? `已将 ${succeededIds.length} 个地点排入 ${activeDate}` : `Scheduled ${succeededIds.length} places to ${activeDate}`);
      } else {
        setNotice(
          zh
            ? `已将 ${succeededIds.length} 个地点排入 ${activeDate}，${failedIds.length} 个失败`
            : `Scheduled ${succeededIds.length} places to ${activeDate}, ${failedIds.length} failed`,
        );
      }
      setTimeout(() => setNotice(''), 3500);
    } finally {
      setIsBatchOperating(false);
    }
  }, [activeDate, disabled, isBatchOperating, load, selectedCandidateIds, zh]);

  const handleBatchMergeCandidates = useCallback(async () => {
    if (selectedCandidateIds.size < 2 || disabled || isBatchOperating) return;
    const selectedPlaces = sortedPendingCandidates.filter((p) => selectedCandidateIds.has(p.id));
    if (selectedPlaces.length < 2) return;
    const primary = selectedPlaces[0];
    const confirmMsg = zh
      ? `确定将选中的 ${selectedPlaces.length} 个地点合并为「${primary.title}」吗？`
      : `Merge ${selectedPlaces.length} selected places into "${primary.title}"?`;
    if (!window.confirm(confirmMsg)) return;
    setIsBatchOperating(true);
    try {
      for (let i = 1; i < selectedPlaces.length; i++) {
        await plannerRepository.mergePlaces(primary.id, selectedPlaces[i].id);
      }
      await load();
      setSelectedCandidateIds(new Set());
      setIsMultiSelectMode(false);
      setNotice(zh ? `已成功合并为「${primary.title}」！` : `Merged into "${primary.title}"!`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    } finally {
      setIsBatchOperating(false);
    }
  }, [disabled, isBatchOperating, load, selectedCandidateIds, sortedPendingCandidates, zh]);

  const handleSavePlaceTiming = useCallback(
    async (visitId: string, timing: { scheduled_start?: string; duration_minutes?: number }) => {
      await plannerRepository.updateVisitTiming(visitId, { start: timing.scheduled_start, duration_minutes: timing.duration_minutes });
      await load();
      setNotice(zh ? '已更新行程时段与停留时长！' : 'Updated schedule timing and duration!');
      setTimeout(() => setNotice(''), 3000);
    },
    [load, zh],
  );

  const schedulePlace = useCallback(
    async (placeId: string, date = activeDate) => {
      if (!date || disabled || isScheduling) return;
      setIsScheduling(true);
      try {
        await plannerRepository.addVisit(placeId, date);
        await load();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setTimeout(() => setNotice(''), 3500);
      } finally {
        setIsScheduling(false);
      }
    },
    [activeDate, disabled, isScheduling, load],
  );

  const removeVisit = useCallback(
    async (place: PlannerScheduledPlace) => {
      await plannerRepository.removeVisit(place.visit_id);
      await load();
    },
    [load],
  );

  const moveScheduled = useCallback(
    async (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= scheduled.length) return;
      const orderedIds = scheduled.map((p) => p.id);
      const [moved] = orderedIds.splice(index, 1);
      orderedIds.splice(targetIndex, 0, moved);
      await plannerRepository.reorderVisits(activeDate, orderedIds);
      await load();
    },
    [activeDate, load, scheduled],
  );

  const syncCapture = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setCaptureDebugLogs(true);
    try {
      const state = await pullCaptureState();
      if (!state) {
        setCapturePending(null);
        setNotice(zh ? '未检测到 Ownly Capture 扩展。' : 'Ownly Capture extension was not detected.');
        return;
      }

      await plannerRepository.initialize();
      const pending = Array.isArray(state.pendingPlaces) ? state.pendingPlaces : [];
      if (pending.length > 0) {
        const targetTripId = selectedTripId || state.activeContext?.tripId || trips[0]?.id || '';
        const placesToImport = pending.map((p) => ({
          ...p,
          trip_id: p.trip_id || targetTripId,
        })) as PlannerTripPlace[];
        const report = await plannerRepository.importCapturedPlaces(placesToImport);

        let ackFailed = false;
        try {
          const applied = await applyCaptureImportReport(report);
          if (!applied) ackFailed = true;
        } catch {
          ackFailed = true;
        }

        setCapturePending(report.failed.length);
        const importedCount = report.created.length + report.updated.length;
        const parts: string[] = [];
        if (importedCount > 0) {
          const detailParts: string[] = [];
          if (report.created.length > 0) detailParts.push(zh ? `${report.created.length} 新增` : `${report.created.length} new`);
          if (report.updated.length > 0) detailParts.push(zh ? `${report.updated.length} 更新` : `${report.updated.length} updated`);
          if (report.deduped.length > 0) detailParts.push(zh ? `${report.deduped.length} 去重` : `${report.deduped.length} deduped`);
          parts.push(
            zh
              ? `✅ 已导入 ${importedCount}/${report.received} 个候选（${detailParts.join('，')}）`
              : `✅ Imported ${importedCount}/${report.received} candidates (${detailParts.join(', ')})`,
          );
        }
        if (report.failed.length > 0) {
          const failSummary = report.failed.map((f) => `${f.title} (${f.reason}${f.detail ? `: ${f.detail}` : ''})`).join('; ');
          parts.push(zh ? `⚠️ ${report.failed.length} 个失败：${failSummary}` : `⚠️ ${report.failed.length} failed: ${failSummary}`);
        }
        if (ackFailed) {
          parts.push(zh ? '⚠️ 扩展确认失败，下次同步可能重复导入' : '⚠️ Extension ACK failed; may re-import next sync');
        }
        setNotice(parts.join(' · ') || (zh ? '同步完成。' : 'Sync complete.'));
      } else {
        setCapturePending(0);
        setNotice(zh ? '没有待同步的研究候选。' : 'No pending research candidates to sync.');
      }
      await load();
      setSelectedTripId((current) => current || state.activeContext?.tripId || '');
    } catch (err) {
      const logs = getCaptureDebugLogs();
      const logSummary = logs.map((l) => `[${l.timestamp}] ${l.type}: ${l.messageType} ${l.detail || ''}`).join('\n');
      console.error('[Planner] syncCapture error:', err, '\nDebug logs:\n', logSummary);
      setCapturePending(null);
      const detail = err instanceof Error ? err.message : String(err);
      setNotice(zh ? `同步失败：${detail}` : `Sync failed: ${detail}`);
    } finally {
      setBusy(false);
    }
  }, [load, selectedTripId, trips, zh]);

  const handleSwapDays = useCallback(
    async (dateA: string, dateB: string) => {
      if (!selectedTripId || !dateA || !dateB || dateA === dateB) return;
      try {
        const result = await plannerRepository.swapTripDays(selectedTripId, dateA, dateB);
        await load();
        const indexA = tripDates.indexOf(dateA);
        const indexB = tripDates.indexOf(dateB);
        const labelA = indexA >= 0 ? (zh ? `第${indexA + 1}天` : `Day ${indexA + 1}`) : dateA;
        const labelB = indexB >= 0 ? (zh ? `第${indexB + 1}天` : `Day ${indexB + 1}`) : dateB;
        setNotice(
          zh
            ? `✅ 已将 ${labelA} 与 ${labelB} 的全部行程路线完整互换 (${result.swappedCount} 个地点顺位与时间已平移)`
            : `✅ Swapped itinerary between ${labelA} and ${labelB} (${result.swappedCount} visits moved)`,
        );
      } catch (err) {
        console.warn('[Planner] Failed to swap days:', err);
        setNotice(zh ? '互换日程失败，请重试。' : 'Failed to swap day itineraries.');
      }
    },
    [selectedTripId, tripDates, zh, load],
  );

  // ── Metrics & Departure ───────────────────────────────────────────────────

  const areaCounts = useMemo(() => getTripAreaCounts(tripPlaces), [tripPlaces]);
  const maxAreaCount = Math.max(1, ...areaCounts.map((item) => item.count));
  const mustTotal = tripPlaces.filter((place) => place.priority === 'must').length;
  const mustScheduled = new Set(
    scheduledAll.filter((place) => place.priority === 'must').map((place) => place.place_id),
  ).size;
  const scheduledMinutes = scheduled.reduce((sum, place) => sum + (place.duration_minutes ?? 0), 0);

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
      .then((data) => {
        if (!stale) setRawWeather(data);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
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

  // ── Exports ───────────────────────────────────────────────────────────────

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
    currentExpenses
      .filter((expense) => expense.date === activeDate)
      .forEach((expense) => {
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

  const downloadFullIcs = useCallback(() => {
    if (!selectedTrip) return;
    const ics = buildTripCalendarIcs(selectedTrip, places, visits, { language });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTrip.title || 'trip'}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(zh ? '✓ 已下载全行程 .ics 日历文件！' : '✓ Downloaded full trip .ics file!');
    setTimeout(() => setNotice(''), 3500);
  }, [selectedTrip, places, visits, language, zh]);

  const downloadDayIcs = useCallback(
    (date: string) => {
      if (!selectedTrip) return;
      const ics = buildDayCalendarIcs(selectedTrip, places, visits, date, { language });
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTrip.title || 'trip'}-${date}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(zh ? `✓ 已下载 ${date} 当天 .ics 日历文件！` : `✓ Downloaded day .ics file for ${date}!`);
      setTimeout(() => setNotice(''), 3500);
    },
    [selectedTrip, places, visits, language, zh],
  );

  const copyIcsContent = useCallback(async () => {
    if (!selectedTrip) return;
    const ics = buildTripCalendarIcs(selectedTrip, places, visits, { language });
    await navigator.clipboard.writeText(ics);
    setNotice(zh ? '✓ 已复制 RFC 5545 ICS 日历文本至剪贴板！' : '✓ Copied RFC 5545 ICS calendar text to clipboard!');
    setTimeout(() => setNotice(''), 3500);
  }, [selectedTrip, places, visits, language, zh]);

  const handleCreateOrUpdateFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const response = await calendarFeedService.publishFeed({
      trip: selectedTrip,
      places,
      visits,
      membership: { isPro },
      userId: currentUserId,
    });
    await plannerRepository.upsertTrip({
      ...selectedTrip,
      calendar_feed: response.feed,
    });
    await load();
  }, [selectedTrip, places, visits, isPro, currentUserId, load]);

  const handleRotateFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const response = await calendarFeedService.rotateFeed({
      trip: selectedTrip,
      places,
      visits,
      membership: { isPro },
      userId: currentUserId,
    });
    await plannerRepository.upsertTrip({
      ...selectedTrip,
      calendar_feed: response.feed,
    });
    await load();
  }, [selectedTrip, places, visits, isPro, currentUserId, load]);

  const handleDisableFeed = useCallback(async () => {
    if (!selectedTrip) return;
    const updatedFeed = await calendarFeedService.disableFeed({
      trip: selectedTrip,
      membership: { isPro },
      userId: currentUserId,
    });
    await plannerRepository.upsertTrip({
      ...selectedTrip,
      calendar_feed: updatedFeed,
    });
    await load();
  }, [selectedTrip, isPro, currentUserId, load]);

  const copyItineraryText = useCallback(async () => {
    if (!selectedTrip || scheduled.length === 0) return;
    const lines = [
      `📅 ${selectedTrip.title} · ${activeDate}`,
      ...scheduled.map(
        (p, i) =>
          `${i + 1}. ${p.title}${p.area ? ` (${p.area})` : ''}${p.why ? `\n   💡 理由: ${p.why}` : ''}${p.notes ? `\n   📝 备注: ${p.notes}` : ''}${p.address ? `\n   📍 地址: ${p.address}` : ''}`,
      ),
    ];
    await navigator.clipboard.writeText(lines.join('\n\n'));
    setNotice(zh ? '已复制当天路线清单至剪贴板！' : 'Copied day itinerary to clipboard!');
  }, [selectedTrip, scheduled, activeDate, zh]);

  return {
    language,
    zh,
    trips,
    setTrips,
    places,
    setPlaces,
    visits,
    setVisits,
    legs,
    setLegs,
    selectedTripId,
    setSelectedTripId,
    selectedDate,
    setSelectedDate,
    activeFilter,
    setActiveFilter,
    capturePending,
    setCapturePending,
    busy,
    setBusy,
    notice,
    setNotice,
    isPro,
    openLicenseModal,
    currentUserId,
    expensesByTrip,
    setExpensesByTrip,
    membersByTrip,
    setMembersByTrip,
    currentExpenses,
    currentMembers,
    selectedTrip,
    tripDates,
    activeDate,
    activeDayIndex,
    dateNavRef,
    tripAllPlaces,
    tripPlaces,
    suspectedDuplicatePairs,
    ignoredDuplicatePairIds,
    visibleSuspectedPairs,
    tripTags,
    tripVisits,
    visitCountByPlaceId,
    allCandidatePlaces,
    pendingCandidates,
    droppedPlaces,
    filterChips,
    candidateSortMode,
    setCandidateSortMode,
    scheduledAll,
    scheduled,
    mapScheduled,
    tripLegs,
    effectiveDayLegs,
    dayAssessment,
    dayTimeline,
    candidateDistances,
    lastScheduledStop,
    lastStopCoords,
    sortedPendingCandidates,
    candidateHotels,
    placesByDate,
    transferDaysInfo,
    currentDayTransferInfo,
    areaCounts,
    maxAreaCount,
    mustTotal,
    mustScheduled,
    scheduledMinutes,
    tripStart,
    daysOut,
    weatherRelevant,
    primaryCoords,
    weather,
    urgencies,
    activeDayWeather,
    dayEstimatedCost,
    dayActualCost,
    isMultiSelectMode,
    setIsMultiSelectMode,
    selectedCandidateIds,
    setSelectedCandidateIds,
    poolSearch,
    setPoolSearch,
    isBatchOperating,
    isScheduling,
    load,
    handleAddExpense,
    handleDeleteExpense,
    handleUpdateMembers,
    handleSwitchTravelMode,
    handleSelectHotelForStaySpan,
    handleUpdateFxRates,
    handleDropPlace,
    handleRestorePlace,
    handleDeletePlace,
    handleDeduplicatePlaces,
    handleMergePair,
    handleIgnoreSuspectedPair,
    toggleSelectCandidate,
    handleSelectAllCandidates,
    handleDeselectAllCandidates,
    handleBatchDeleteCandidates,
    handleBatchShelveCandidates,
    handleBatchScheduleCandidates,
    handleBatchMergeCandidates,
    handleSavePlaceTiming,
    schedulePlace,
    removeVisit,
    moveScheduled,
    syncCapture,
    handleSwapDays,
    downloadKML,
    downloadCSV,
    copyMarkdownItinerary,
    downloadFullIcs,
    downloadDayIcs,
    copyIcsContent,
    handleCreateOrUpdateFeed,
    handleRotateFeed,
    handleDisableFeed,
    copyItineraryText,
  };
}
