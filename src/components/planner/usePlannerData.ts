'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type {
  PlannerPlaceKind,
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
import { evaluatePlannerDay } from '@/domain/planner-schedule';
import { plannerRepository } from '@/services/PlannerRepository';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import {
  pullCaptureState,
  setCaptureContext,
} from './capture-bridge';

export interface UsePlannerDataProps {
  disabled: boolean;
}

export function filterAndSearchPlaces(
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

export function sortPlaceList(
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

export function usePlannerData({ disabled }: UsePlannerDataProps) {
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
  const loadEpochRef = useRef<number>(0);

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
    const epoch = ++loadEpochRef.current;
    await plannerRepository.initialize();
    const [nextTrips, nextPlaces, nextVisits, nextLegs] = await Promise.all([
      plannerRepository.listTrips(),
      plannerRepository.listPlaces(),
      plannerRepository.listVisits(),
      plannerRepository.listLegs(),
    ]);
    if (epoch !== loadEpochRef.current) return;
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
      const epoch = ++loadEpochRef.current;
      await plannerRepository.initialize();
      const [nextTrips, nextPlaces, nextVisits, nextLegs, state] = await Promise.all([
        plannerRepository.listTrips(),
        plannerRepository.listPlaces(),
        plannerRepository.listVisits(),
        plannerRepository.listLegs(),
        pullCaptureState(),
      ]);
      if (!active || epoch !== loadEpochRef.current) return;
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
    setIsBatchOperating,
    isScheduling,
    setIsScheduling,
    load,
  };
}

export type PlannerDataReturn = ReturnType<typeof usePlannerData>;
