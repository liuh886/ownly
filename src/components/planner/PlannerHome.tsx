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
  detectSuspectedDuplicatePlaces,
  isPlausibleCustomTag,
  listTripDates,
  parsePlaceExpenseEstimate,
  PLANNER_KIND_ICONS,
  PLANNER_KIND_LABELS,
} from '@/domain/planner';
import { buildTripCalendarIcs, buildDayCalendarIcs } from '@/domain/calendar-feed';
import { evaluatePlannerDay, type PlannerExecutionTransitionItem, type PlannerTimelineStopItem } from '@/domain/planner-schedule';
import { plannerRepository } from '@/services/PlannerRepository';
import { calendarFeedService } from '@/services/CalendarFeedService';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { AppInstallGuideModal } from '@/components/pwa/AppInstallGuideModal';
import { applyCaptureImportReport, pullCaptureState, setCaptureContext } from './capture-bridge';
import { PlannerMap } from './PlannerMap';
import { HotelComparisonModal } from './HotelComparisonModal';
import { PlannerBudgetLedger } from './PlannerBudgetLedger';
import { ImportCandidatesModal } from './ImportCandidatesModal';
import { PlaceTimingModal } from './PlaceTimingModal';
import { CreateTripModal } from './CreateTripModal';
import { CalendarSubscriptionModal } from './CalendarSubscriptionModal';

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

/** Kind classification tags injected by ensurePlaceKindTag — used for filtering, not shown on cards. */
const KNOWN_KIND_TAGS = new Set([
  ...Object.values(PLANNER_KIND_LABELS).flatMap((l) => [l.zh.toLowerCase(), l.en.toLowerCase()]),
  '观光景点', '餐厅美食', '咖啡甜品', '酒店住宿', '购物商场', '交通中转', '体验活动',
  '景点', '美食', '咖啡', '住宿', '购物', '交通', '体验', '其它', '其他',
  'stay', 'food', 'cafe', 'attraction', 'experience', 'shopping', 'transit', 'other',
  'hotel', 'dining', 'coffee', 'sightseeing', 'mall', 'station', 'activity',
].map((s) => s.toLowerCase()));

/** Returns tags suitable for card display — excludes kind classification tags. */
function getDisplayTags(tags: string[]): string[] {
  return tags.filter((t) => !KNOWN_KIND_TAGS.has(t.trim().toLowerCase()));
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
  const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);


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
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isSuspectedModalOpen, setIsSuspectedModalOpen] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [timingModalPlace, setTimingModalPlace] = useState<PlannerScheduledPlace | null>(null);
  const [isPoolCollapsed, setIsPoolCollapsed] = useState(false);
  const [poolSearch, setPoolSearch] = useState('');

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

  // Preserve the complete trip set so shelving changes planning state without making data disappear.
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
    () => [...tripPlaces]
      .filter((place) => place.state === 'candidate')
      .map((place) => ({
        ...place,
        tags: ensurePlaceKindTag(place.tags, place.kind, language),
      })),
    [tripPlaces, language],
  );

  // All candidates stay in pool regardless of scheduling status.
  // A place can be scheduled multiple times, so scheduling does NOT remove it.
  const pendingCandidates = allCandidatePlaces;

  const droppedPlaces = useMemo(
    () => [...tripAllPlaces]
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

    const allKinds: PlannerPlaceKind[] = ['stay', 'food', 'cafe', 'attraction', 'experience', 'shopping', 'transit', 'other'];
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

  const [candidateSortMode, setCandidateSortMode] = useState<'default' | 'distance' | 'must' | 'rating'>('default');

  const scheduledAll = useMemo(
    () => materializePlannerScheduledPlaces(
      tripPlaces,
      tripVisits,
    ),
    [tripPlaces, tripVisits],
  );

  const scheduled = useMemo(
    () => sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === activeDate)),
    [activeDate, scheduledAll],
  );

  // The map is a spatial Place projection, not an occurrence timeline. Collapse
  // repeated Visits for one Place while keeping every Visit in the day timeline.
  const mapScheduled = useMemo(() => {
    const seen = new Set<string>();
    return scheduled.filter((place) => {
      if (seen.has(place.place_id)) return false;
      seen.add(place.place_id);
      return true;
    });
  }, [scheduled]);
  const mapScheduledPlaceIds = useMemo(
    () => new Set(mapScheduled.map((place) => place.place_id)),
    [mapScheduled],
  );

  const tripLegs = useMemo(
    () => legs.filter((leg) => leg.trip_id === selectedTripId),
    [legs, selectedTripId],
  );

  const dayAssessment = useMemo(
    () => (selectedTrip
      ? evaluatePlannerDay(selectedTrip, scheduledAll, tripLegs, activeDate)
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
        }),
    [activeDate, selectedTrip, scheduledAll, tripLegs],
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

  const handleDropPlace = useCallback(async (placeId: string) => {
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
  }, [disabled, load, zh]);

  const handleRestorePlace = useCallback(async (placeId: string) => {
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
  }, [disabled, load, zh]);

  const handleDeletePlace = useCallback(async (placeId: string, placeTitle?: string) => {
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
      setNotice(err instanceof Error ? err.message : (zh ? '删除失败，若已排入日程请先移除日程' : 'Delete failed'));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, load, zh]);

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

  const handleMergePair = useCallback(async (primaryId: string, secondaryId: string) => {
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
  }, [disabled, load, zh]);


  const handleIgnoreSuspectedPair = useCallback(async (pairId: string) => {
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
  }, [disabled, selectedTrip, zh]);


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
    if (selectedCandidateIds.size === 0 || disabled) return;
    const count = selectedCandidateIds.size;
    const confirmMsg = zh
      ? `确定要彻底删除已选中的 ${count} 个地点吗？`
      : `Are you sure you want to permanently delete ${count} selected places?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      for (const id of selectedCandidateIds) {
        await plannerRepository.deletePlace(id);
      }
      await load();
      setSelectedCandidateIds(new Set());
      setIsMultiSelectMode(false);
      setNotice(zh ? `已彻底删除 ${count} 个地点` : `Deleted ${count} places`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, load, selectedCandidateIds, zh]);

  const handleBatchShelveCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || disabled) return;
    const count = selectedCandidateIds.size;
    try {
      for (const id of selectedCandidateIds) {
        await plannerRepository.dropPlace(id);
      }
      await load();
      setSelectedCandidateIds(new Set());
      setIsMultiSelectMode(false);
      setNotice(zh ? `已将 ${count} 个地点设为暂不考虑` : `Shelved ${count} places`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, load, selectedCandidateIds, zh]);

  const handleBatchScheduleCandidates = useCallback(async () => {
    if (selectedCandidateIds.size === 0 || !activeDate || disabled) return;
    const count = selectedCandidateIds.size;
    try {
      for (const id of selectedCandidateIds) {
        await plannerRepository.addVisit(id, activeDate);
      }
      await load();
      setSelectedCandidateIds(new Set());
      setIsMultiSelectMode(false);
      setNotice(zh ? `已将 ${count} 个地点排入 ${activeDate}` : `Scheduled ${count} places to ${activeDate}`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [activeDate, disabled, load, selectedCandidateIds, zh]);

  const handleBatchMergeCandidates = useCallback(async () => {
    if (selectedCandidateIds.size < 2 || disabled) return;
    const selectedPlaces = sortedPendingCandidates.filter((p) => selectedCandidateIds.has(p.id));
    if (selectedPlaces.length < 2) return;
    const primary = selectedPlaces[0];
    const confirmMsg = zh
      ? `确定将选中的 ${selectedPlaces.length} 个地点合并为「${primary.title}」吗？`
      : `Merge ${selectedPlaces.length} selected places into "${primary.title}"?`;
    if (!window.confirm(confirmMsg)) return;
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
    }
  }, [disabled, load, selectedCandidateIds, sortedPendingCandidates, zh]);

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
  const mustScheduled = new Set(
    scheduledAll.filter((place) => place.priority === 'must').map((place) => place.place_id),
  ).size;
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

  const downloadDayIcs = useCallback((date: string) => {
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
  }, [selectedTrip, places, visits, language, zh]);

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
        const report = await plannerRepository.importCapturedPlaces(state.pendingPlaces);
        const applied = await applyCaptureImportReport(report);
        if (!applied) throw new Error('Capture import report apply failed');
        setCapturePending(report.failed.length);
        setNotice(zh
          ? `收到 ${report.received} 个候选；已导入 ${report.imported.length}；失败 ${report.failed.length}${report.failed.length ? `。Rejected: ${report.failed.length} · ${report.failed.map((item) => `${item.title}: ${item.reason}`).join('；')}` : ''}`
          : `Received ${report.received}; imported ${report.imported.length}; failed ${report.failed.length}${report.failed.length ? `. Rejected: ${report.failed.length} · ${report.failed.map((item) => `${item.title}: ${item.reason}`).join('; ')}` : ''}`);
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
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✈️</span>
            <h2 className="text-xl font-bold tracking-tight text-stone-950">
              {zh ? '规划你的旅行行程' : 'Plan Your Travel Itinerary'}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            {zh
              ? '在本地安全创建行程，设置目的地与出行日期。选定行程后，可在地图采集候选地点并由 Planner 统一排期与推演。'
              : 'Create a local trip with destinations and dates. Your selected trip acts as the authority for place research and timeline optimization.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreateTripOpen(true)}
              className="rounded-lg bg-stone-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-stone-800"
            >
              + {zh ? '创建新行程' : 'Create New Trip'}
            </button>
          </div>
          {notice ? <p className="mt-3 text-xs text-stone-500">{notice}</p> : null}
        </div>
        <CreateTripModal
          key={isCreateTripOpen ? 'open' : 'closed'}
          open={isCreateTripOpen}
          onClose={() => setIsCreateTripOpen(false)}
          onCreate={async (newTrip) => {
            await plannerRepository.upsertTrip(newTrip);
            await load();
            setSelectedTripId(newTrip.id);
            setNotice(zh ? `已创建行程「${newTrip.title}」` : `Created trip "${newTrip.title}"`);
          }}
          language={language}
        />
      </section>
    );
  }

  return (
    <section className="space-y-3.5">
      <header className="flex flex-col gap-3 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <select
                value={selectedTripId}
                onChange={(event) => {
                  setSelectedTripId(event.target.value);
                  setActiveFilter('all');
                }}
                className="max-w-full rounded-xl border border-stone-300 bg-stone-50/80 px-3.5 py-2 text-sm font-bold text-stone-900 shadow-2xs outline-none transition focus:border-stone-900 focus:bg-white cursor-pointer"
                aria-label={zh ? '选择行程' : 'Select trip'}
              >
                {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateTripOpen(true)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-950 active:scale-98"
              title={zh ? '创建新行程' : 'Create new trip'}
            >
              + {zh ? '新建行程' : 'New Trip'}
            </button>
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100/80 px-2.5 py-1 text-xs font-medium text-stone-600">
              <span>📅</span>
              <span>{selectedTrip.start_date} → {selectedTrip.end_date}</span>
              <span className="text-stone-400">({tripDates.length}{zh ? '天' : 'd'})</span>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span className="font-medium text-stone-700">
              📍 {selectedTrip.destinations.join(' · ') || (zh ? '未填写目的地' : 'No destinations')}
            </span>
            {currentMembers.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                👥 {currentMembers.join(', ')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Capture Status & Sync */}
          <div className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50/70 p-1">
            {capturePending === null ? (
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
                title={zh ? '未检测到扩展，点击查看安装步骤' : 'Extension offline, click to view installation guide'}
              >
                {zh ? 'Capture 未连接' : 'Capture offline'}
              </button>
            ) : (
              <span className="px-2 text-[11px] font-semibold text-stone-600">
                {`${capturePending} ${zh ? '待同步' : 'pending'}`}
              </span>
            )}
            <button
              type="button"
              onClick={() => void syncCapture()}
              disabled={busy}
              className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-stone-800 shadow-2xs transition hover:bg-stone-100 hover:text-stone-950 disabled:opacity-50"
            >
              {busy ? '…' : (zh ? '🔄 同步' : '🔄 Sync')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-900 active:scale-98"
            title={zh ? '从剪贴板、Google Maps 链接、KML、CSV 或 JSON 批量导入候选' : 'Import candidates from clipboard, links, KML, CSV, or JSON'}
          >
            <span>📥</span>
            <span>{zh ? '导入' : 'Import'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCalendarModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs font-bold text-amber-900 shadow-2xs transition hover:bg-amber-100 hover:border-amber-400 active:scale-98"
            title={zh ? '导出 .ics 日历文件或设置 Google/Apple Calendar 持续订阅源' : 'Export .ics or setup Google/Apple Calendar Feed'}
          >
            <span>📅</span>
            <span>{zh ? '日历订阅' : 'Calendar'}</span>
            {selectedTrip?.calendar_feed?.enabled ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => void copyMarkdownItinerary()}
            className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-900 active:scale-98"
            title={zh ? '一键复制 Markdown 完整行程单至剪贴板' : 'Copy complete Markdown itinerary to clipboard'}
          >
            <span>📋</span>
            <span>{zh ? '行程单' : 'Copy'}</span>
          </button>
        </div>
      </header>

      {notice ? <div aria-live="polite" className="rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 shadow-2xs animate-in fade-in">{notice}</div> : null}

      <nav className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" aria-label={zh ? '日期导航' : 'Date navigation'}>
        {tripDates.map((date, index) => {
          const isSelected = activeDate === date;
          const dayPlacesCount = placesByDate[date]?.length || 0;
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`group shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition shadow-2xs ${
                isSelected
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900'
              }`}
            >
              <span>{zh ? `第${index + 1}天` : `Day ${index + 1}`}</span>
              <span className={`text-[11px] ${isSelected ? 'text-stone-300' : 'text-stone-400 group-hover:text-stone-500'}`}>
                {formatDay(date, language)}
              </span>
              {dayPlacesCount > 0 ? (
                <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold ${
                  isSelected ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-600'
                }`}>
                  {dayPlacesCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

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
                dayAssessment.status === 'feasible'
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : dayAssessment.status === 'conflict'
                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                    : dayAssessment.status === 'warning'
                      ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                      : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
              }`}>
                {dayAssessment.status === 'feasible'
                  ? (zh ? '可执行' : 'Feasible')
                  : dayAssessment.status === 'conflict'
                    ? (zh ? '有冲突' : 'Conflict')
                    : dayAssessment.status === 'warning'
                      ? (zh ? '需注意' : 'Warning')
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
                <span className="rounded-full bg-stone-200 px-1.5 py-0 text-[9.5px] font-bold text-stone-700">{pendingCandidates.length}</span>
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
                  onClick={() => setIsCalendarModalOpen(true)}
                  className="rounded-md border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                  title={zh ? '日历导出与订阅 (.ics / Feed)' : 'Calendar (.ics / Feed)'}
                >
                  📅 {zh ? '日历' : 'Calendar'}
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
          {dayAssessment.time_overlaps.length > 0 || dayAssessment.travel_conflicts.length > 0 || dayAssessment.is_overloaded || dayAssessment.opening_hours_warnings.length > 0 ? (
            <div className="mx-4 mt-2 space-y-1">
              {dayAssessment.time_overlaps.map((overlap) => (
                <div key={`${overlap.fromId}-${overlap.toId}`} className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-900 shadow-2xs font-medium">
                  <span>⚠️</span>
                  <span>{zh ? `${overlap.fromTitle} 与 ${overlap.toTitle} 时段重叠（${overlap.fromTime} / ${overlap.toTime}）` : `${overlap.fromTitle} overlaps ${overlap.toTitle} (${overlap.fromTime} / ${overlap.toTime})`}</span>
                </div>
              ))}
              {dayAssessment.travel_conflicts.map((conflict) => (
                <div key={conflict.id} className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-900 shadow-2xs font-medium">
                  <span>🚨</span>
                  <span>{zh ? `交通耗时冲突: 从「${conflict.from_title}」出发预计到达时间迟于「${conflict.to_title}」开始时间（晚 ${conflict.late_by_minutes} 分钟）` : `Travel conflict: arrival from "${conflict.from_title}" is ${conflict.late_by_minutes}m late for "${conflict.to_title}"`}</span>
                </div>
              ))}
              {dayAssessment.opening_hours_warnings.map((oh) => (
                <div key={`${oh.visit_id}-${oh.place_id}`} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-2xs font-medium">
                  <span>⚠️</span>
                  <span><b>{oh.title}</b>: {oh.reason}</span>
                </div>
              ))}
              {dayAssessment.is_overloaded ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-2xs font-medium">
                  <span>⚠️</span>
                  <span>{dayAssessment.overload_reason}</span>
                </div>
              ) : null}
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
                  const timeOverlap = dayAssessment.time_overlaps.find((overlap) => overlap.fromId === place.id || overlap.toId === place.id);
                  const openHoursIssue = dayAssessment.opening_hours_warnings.find((issue) => issue.visit_id === place.visit_id || issue.place_id === place.place_id);
                  const col = timeOverlap
                    ? { isCollision: true, reason: zh ? '与当天其它地点存在时间重叠' : 'Overlaps another timed stop on this day' }
                    : openHoursIssue
                      ? { isCollision: true, reason: openHoursIssue.reason }
                      : undefined;
                  const timelineStop = dayTimeline.items.find(
                    (item): item is PlannerTimelineStopItem => item.type === 'stop' && (item.visit_id === place.visit_id || item.id === place.id),
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
                      className="space-y-2"
                      onMouseEnter={() => setHighlightedPlaceId(place.id)}
                      onMouseLeave={() => setHighlightedPlaceId(null)}
                    >
                      <div className={`relative flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-150 shadow-2xs ${
                        highlightedPlaceId === place.id
                          ? 'border-emerald-500 ring-2 ring-emerald-300/50 bg-emerald-50/30'
                          : 'border-stone-200/90 bg-white hover:border-stone-300'
                      }`}>
                        {/* Stop Number Circle */}
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white shrink-0 shadow-2xs">
                          {index + 1}
                        </div>

                        {/* Stop Content Body */}
                        <div className="min-w-0 flex-1">
                          {/* Title & Timing Trigger Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <h3 className="text-sm font-bold text-stone-900 truncate leading-snug" title={place.title}>
                                {place.title}
                              </h3>
                              <button
                                type="button"
                                onClick={() => setTimingModalPlace(place)}
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition hover:scale-102 ${
                                  timelineStop?.start
                                    ? 'bg-stone-100 text-stone-800 hover:bg-stone-200 ring-1 ring-stone-300/70 font-mono'
                                    : 'border border-dashed border-stone-300 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-700'
                                }`}
                                title={zh ? '设置开始时间与停留时长；日历投影由 Planner 权威状态生成' : 'Set start time and duration'}
                              >
                                <span>🕒</span>
                                <span>{timelineStop?.start ? `${timelineStop.start}${timelineStop.end ? `-${timelineStop.end}${timelineStop.crosses_midnight ? ' +1' : ''}` : ''}` : (zh ? '设时间' : 'Time')}</span>
                              </button>
                              {place.locked ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[9.5px] font-bold text-amber-800 ring-1 ring-amber-200/80">
                                  📌 {zh ? '固定顺位' : 'Pinned'}
                                </span>
                              ) : null}
                            </div>

                            {/* Grouped 4-Action Controls */}
                            <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50/80 p-0.5 shadow-2xs shrink-0">
                              <button
                                type="button"
                                aria-label={place.locked ? (zh ? '取消固定' : 'Unpin') : (zh ? '固定顺位' : 'Pin')}
                                onClick={async () => {
                                  await plannerRepository.toggleVisitLock(place.visit_id);
                                  await load();
                                }}
                                className={`flex h-6 w-6 items-center justify-center rounded text-xs transition ${
                                  place.locked
                                    ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                    : 'text-stone-400 hover:bg-white hover:text-stone-700'
                                }`}
                                title={place.locked ? (zh ? '已固定顺位（交通优化不移动此站）' : 'Pinned') : (zh ? '固定在当前顺位' : 'Pin stop')}
                              >
                                {place.locked ? '📌' : '📍'}
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '上移' : 'Move up'}
                                disabled={index === 0}
                                onClick={() => void moveScheduled(index, -1)}
                                className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-stone-500 hover:bg-white hover:text-stone-900 disabled:opacity-20 transition"
                                title={zh ? '上移一站' : 'Move up'}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '下移' : 'Move down'}
                                disabled={index === scheduled.length - 1}
                                onClick={() => void moveScheduled(index, 1)}
                                className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-stone-500 hover:bg-white hover:text-stone-900 disabled:opacity-20 transition"
                                title={zh ? '下移一站' : 'Move down'}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '从当天日程移除' : 'Remove stop'}
                                onClick={() => void removeVisit(place)}
                                className="flex h-6 w-6 items-center justify-center rounded text-xs text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title={zh ? '从当天日程移除（回到待安排候选池）' : 'Remove stop'}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Meta & Fact Tags */}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                            <span>{placeMeta(place, language)}</span>
                            {place.observed_rating ? (
                              <span className="rounded-full bg-amber-50 border border-amber-200/60 px-1.5 py-0.2 text-[9.5px] font-bold text-amber-800">
                                ★ {place.observed_rating}
                              </span>
                            ) : null}
                            {place.observed_price ? (
                              <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-stone-600">
                                {place.observed_price}
                              </span>
                            ) : null}
                            {place.priority === 'must' ? (
                              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800">
                                🎯 {zh ? '必去' : 'Must'}
                              </span>
                            ) : null}
                            {place.tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-1.5 py-0.2 text-[9.5px] font-medium text-stone-600">
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

                          {/* Quick Action External Links */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                            {place.phone ? (
                              <a
                                href={`tel:${place.phone}`}
                                className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 hover:bg-stone-200 transition"
                                title={zh ? '拨打官方电话' : 'Call'}
                              >
                                📞
                              </a>
                            ) : null}
                            {place.menu_url ? (
                              <a
                                href={place.menu_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 hover:bg-stone-200 transition"
                                title={zh ? '查看官方菜单' : 'Menu'}
                              >
                                📖 {zh ? '菜单' : 'Menu'}
                              </a>
                            ) : null}
                            {place.reservation_url ? (
                              <a
                                href={place.reservation_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                                title={zh ? '官方预订' : 'Reserve'}
                              >
                                🎟️ {zh ? '官方预订' : 'Reserve'}
                              </a>
                            ) : null}
                            {place.source_url ? (
                              <a
                                href={place.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                                title={zh ? '在 Google Maps 中查看' : 'View on Maps'}
                              >
                                🗺️ {zh ? '地图' : 'Maps'}
                              </a>
                            ) : null}
                          </div>

                          {/* Warning / Conflict Alerts */}
                          {col?.isCollision ? (
                            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold text-amber-800 ring-1 ring-amber-200">
                              <span>⚠️</span>
                              <span>{col.reason}</span>
                            </div>
                          ) : null}

                          {/* Research Note / Why Insight */}
                          {place.why ? (
                            <p className="mt-1.5 line-clamp-2 rounded-md bg-stone-50/80 px-2 py-1 text-xs text-stone-700 leading-relaxed">
                              💡 <strong>{zh ? '推荐理由:' : 'Why:'}</strong> {place.why}
                            </p>
                          ) : null}
                          {place.notes ? (
                            <p className="mt-1 line-clamp-2 text-xs text-stone-500 italic">
                              📝 {place.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Travel Transition Rail (Between Stops) */}
                      {index < scheduled.length - 1 ? (
                        <div className="relative ml-3.5 border-l-2 border-dashed border-stone-200 py-2 pl-5 space-y-1.5">
                          {transitionItems.length === 0 ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[10px] font-medium text-stone-500">
                              <span>❔</span>
                              <span>{zh ? '交通时间未确认' : 'Travel time unknown'}</span>
                            </div>
                          ) : transitionItems.map((item) => {
                            if (item.type === 'travel') {
                              const icon = item.mode === 'walking' ? '🚶' : item.mode === 'driving' ? '🚗' : item.mode === 'bicycling' ? '🚲' : '🚇';
                              const distance = item.distance_meters === undefined
                                ? ''
                                : item.distance_meters < 1000 ? ` · ${item.distance_meters} m` : ` · ${(item.distance_meters / 1000).toFixed(1)} km`;
                              return (
                                <div key={item.id} className="inline-flex flex-wrap items-center gap-2 rounded-full border border-sky-200/90 bg-sky-50/90 px-3 py-1 text-[10.5px] font-semibold text-sky-900 shadow-2xs">
                                  <span>{icon} {item.duration_minutes} min{distance}{item.source === 'openrouteservice' ? ' · ORS' : ''}</span>
                                  {item.start && item.end ? <span className="text-sky-700 font-mono">⏱ {item.start}-{item.end}</span> : null}
                                  <a
                                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full bg-sky-100 hover:bg-sky-200 px-1.5 py-0.2 text-[9.5px] font-bold text-sky-800 transition"
                                  >
                                    Google 导航 ↗
                                  </a>
                                </div>
                              );
                            }
                            if (item.type === 'gap') {
                              return (
                                <div key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[10px] font-semibold text-emerald-800 shadow-2xs">
                                  <span>◌</span>
                                  <span>{zh ? `机动空闲 ${item.duration_minutes} min` : `${item.duration_minutes} min buffer`} · {item.start}-{item.end}</span>
                                </div>
                              );
                            }
                            if (item.type === 'conflict') {
                              return (
                                <div key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-0.5 text-[10px] font-semibold text-rose-800 shadow-2xs">
                                  <span>🚨</span>
                                  <span>{zh
                                    ? `衔接冲突 · 最早 ${item.earliest_arrival ?? '次日'} 到达 · 比下一站晚 ${item.late_by_minutes} min`
                                    : `Conflict · ${item.late_by_minutes} min late`}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={item.id} className="inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-[10px] font-semibold text-amber-800">
                                <span>❔ {item.reason === 'travel_time_missing'
                                  ? (zh ? '交通时间未确认' : 'Travel time unknown')
                                  : (zh ? '时间不完整，无法判断衔接' : 'Schedule timing incomplete')}</span>
                                {item.reason === 'travel_time_missing' ? (
                                  <a
                                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full bg-amber-100 hover:bg-amber-200 px-1.5 py-0.2 text-[9.5px] font-bold text-amber-900 transition"
                                  >
                                    Google 导航 ↗
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
                scheduledPlaces={mapScheduled}
                candidatePlaces={sortedPendingCandidates.filter((place) => !mapScheduledPlaceIds.has(place.id))}
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
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '当天已排' : 'Day Scheduled'}</span><strong>{scheduled.length}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '候选池' : 'Candidates'}</span><strong>{pendingCandidates.length}</strong></div>
                <div className="flex justify-between py-2"><span className="text-stone-400">{zh ? '暂不考虑' : 'Shelved'}</span><strong>{droppedPlaces.length}</strong></div>
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
                scheduledPlaces={mapScheduled}
                candidatePlaces={sortedPendingCandidates.filter((place) => !mapScheduledPlaceIds.has(place.id))}
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
                {sortedPendingCandidates.length}/{activeFilter === 'dropped' ? droppedPlaces.length : pendingCandidates.length}
              </span>
              {droppedPlaces.length > 0 ? (
                <span className="rounded-full bg-stone-200/60 px-2 py-0.5 text-xs font-semibold text-stone-600" title={zh ? '暂不考虑地点数' : 'Shelved places count'}>
                  {zh ? '暂不考虑' : 'Shelved'} {droppedPlaces.length}
                </span>
              ) : null}
            </div>
            <p className="hidden lg:block text-xs text-stone-400">
              {zh ? '所有候选地点，可直接排入当天或拖拽至日程（排入后仍保留在池中）' : 'All candidates. Schedule to day or drag. Places stay in pool after scheduling.'}
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
            {filterChips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 bg-stone-50/50 px-4 py-2">
                {filterChips.map((f) => {
                  const isSelected = activeFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        const nextFilter = isSelected && f.id !== 'all' ? 'all' : f.id;
                        setActiveFilter(nextFilter);
                        if (nextFilter === 'dropped') {
                          setIsMultiSelectMode(false);
                          setSelectedCandidateIds(new Set());
                        }
                      }}
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

            {/* Layer 1: 待安排 Primary Candidate Cards Grid */}
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs font-semibold text-stone-700">
                  {activeFilter === 'dropped'
                    ? (zh ? '暂不考虑' : 'Shelved')
                    : (zh ? '待安排地点' : 'Pending Scheduling')}
                  <span className="ml-1.5 text-[11px] font-normal text-stone-400">
                    ({sortedPendingCandidates.length})
                  </span>
                </h3>
                <div className="flex items-center gap-1.5">
                  {visibleSuspectedPairs.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setIsSuspectedModalOpen(true)}
                      className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 transition flex items-center gap-1 shadow-2xs"
                      title={zh ? '查看并合并疑似重复的同类地点' : 'Review and merge suspected duplicate places'}
                    >
                      ✨ {zh ? `合并疑似同类 (${visibleSuspectedPairs.length})` : `Suspected Duplicates (${visibleSuspectedPairs.length})`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={activeFilter === 'dropped'}
                    onClick={() => {
                      setIsMultiSelectMode((prev) => !prev);
                      setSelectedCandidateIds(new Set());
                    }}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 shadow-2xs disabled:cursor-not-allowed disabled:opacity-35 ${
                      isMultiSelectMode
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                    title={zh ? '开启批量选择与删除模式' : 'Toggle multi-select mode'}
                  >
                    ☑️ {isMultiSelectMode ? (zh ? '退出多选' : 'Exit Select') : (zh ? '批量多选' : 'Select')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeduplicatePlaces()}
                    className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition flex items-center gap-1 shadow-2xs"
                    title={zh ? '扫描并清理当前行程的重复地点' : 'Scan and merge duplicate places'}
                  >
                    🧹 {zh ? '一键去重' : 'Deduplicate'}
                  </button>
                </div>
              </div>

              {isMultiSelectMode && activeFilter !== 'dropped' ? (
                <div className="sticky top-2 z-20 mb-4 flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-stone-800 bg-stone-950/95 px-4 py-2.5 text-white shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-emerald-400">
                      ✓ {zh ? `已选 ${selectedCandidateIds.size} 项` : `${selectedCandidateIds.size} selected`}
                    </span>
                    <button
                      type="button"
                      onClick={handleSelectAllCandidates}
                      className="text-xs font-medium text-stone-300 hover:text-white underline underline-offset-2 transition"
                    >
                      {zh ? '全选' : 'Select All'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllCandidates}
                      className="text-xs font-medium text-stone-300 hover:text-white underline underline-offset-2 transition"
                    >
                      {zh ? '清空' : 'Clear'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCandidateIds.size >= 2 ? (
                      <button
                        type="button"
                        onClick={() => void handleBatchMergeCandidates()}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 transition shadow-xs"
                      >
                        ✨ {zh ? '合并同类' : 'Merge'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleBatchScheduleCandidates()}
                      disabled={selectedCandidateIds.size === 0}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-35 transition shadow-xs"
                    >
                      + {zh ? '排入当天' : 'Schedule'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBatchShelveCandidates()}
                      disabled={selectedCandidateIds.size === 0}
                      className="rounded-lg bg-stone-800 border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-700 disabled:opacity-35 transition"
                    >
                      🙈 {zh ? '暂不考虑' : 'Shelve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBatchDeleteCandidates()}
                      disabled={selectedCandidateIds.size === 0}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-35 transition shadow-xs"
                    >
                      🗑️ {zh ? '批量删除' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMultiSelectMode(false);
                        setSelectedCandidateIds(new Set());
                      }}
                      className="rounded-lg border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs text-stone-400 hover:text-white transition"
                      title={zh ? '退出多选' : 'Exit Select'}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : null}

              {sortedPendingCandidates.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-400">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="font-medium text-stone-600">
                    {pendingCandidates.length === 0
                      ? (zh ? '当前行程暂无候选地点，浏览地图或导入收藏夹即可添加。' : 'No candidates yet.')
                      : (zh ? '没有匹配的候选地点。' : 'No matching candidates.')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {sortedPendingCandidates.map((place) => (
                    <article
                      key={place.id}
                      draggable={!isMultiSelectMode && place.state !== 'dropped'}
                      onClick={() => {
                        if (isMultiSelectMode && place.state !== 'dropped') toggleSelectCandidate(place.id);
                      }}
                      onDragStart={(event) => {
                        if (isMultiSelectMode || place.state === 'dropped') return;
                        event.dataTransfer.setData('text/plain', place.id);
                        event.dataTransfer.dropEffect = 'move';
                        setDraggingPlaceId(place.id);
                      }}
                      onDragEnd={() => setDraggingPlaceId(null)}
                      onMouseEnter={() => setHighlightedPlaceId(place.id)}
                      onMouseLeave={() => setHighlightedPlaceId(null)}
                      className={`group flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-150 ${
                        isMultiSelectMode && place.state !== 'dropped'
                          ? selectedCandidateIds.has(place.id)
                            ? 'border-emerald-500 ring-2 ring-emerald-400 bg-emerald-50/60 shadow-xs cursor-pointer'
                            : 'border-stone-200 bg-white hover:border-stone-300 cursor-pointer shadow-2xs'
                          : highlightedPlaceId === place.id
                          ? 'border-emerald-500 ring-2 ring-emerald-300/60 bg-emerald-50/30 shadow-xs cursor-grab active:cursor-grabbing'
                          : 'border-stone-200/90 bg-white hover:border-stone-300 hover:shadow-xs cursor-grab active:cursor-grabbing'
                      }`}
                    >
                      <div>
                        {/* Card Header Row */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 truncate">
                            {isMultiSelectMode && place.state !== 'dropped' ? (
                              <input
                                type="checkbox"
                                checked={selectedCandidateIds.has(place.id)}
                                onChange={() => toggleSelectCandidate(place.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                              />
                            ) : null}
                            <h3 className="truncate text-xs font-bold text-stone-900 leading-snug" title={place.title}>
                              {place.title}
                            </h3>
                          </div>
                        </div>

                        {/* Meta Line */}
                        <p className="mt-0.5 truncate text-[11px] text-stone-400">{placeMeta(place, language)}</p>

                        {/* Badges and Tags Cluster */}
                        <div className="mt-2 flex flex-wrap gap-1 items-center">
                          {candidateDistances.has(place.id) ? (
                            <span
                              className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800"
                              title={zh ? `距当天最后一站「${lastScheduledStop?.title}」的直线距离` : `Distance to ${lastScheduledStop?.title}`}
                            >
                              📍 {formatDistanceBadge(candidateDistances.get(place.id)!, zh)}
                            </span>
                          ) : null}
                          {(visitCountByPlaceId.get(place.id) || 0) > 0 ? (
                            <span className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800">
                              📅 {zh ? `已排 ${visitCountByPlaceId.get(place.id)}次` : `${visitCountByPlaceId.get(place.id)}x scheduled`}
                            </span>
                          ) : null}
                          {place.priority === 'must' ? (
                            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800">
                              🎯 {zh ? '必去' : 'Must'}
                            </span>
                          ) : null}
                          {place.observed_rating ? (
                            <span className="rounded-full bg-amber-50 border border-amber-200/60 px-1.5 py-0.2 text-[9.5px] font-bold text-amber-800">
                              ★ {place.observed_rating}
                            </span>
                          ) : null}
                          {place.observed_price ? (
                            <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-stone-600">
                              {place.observed_price}
                            </span>
                          ) : null}
                          {place.source_category ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.2 text-[9.5px] font-medium text-sky-800">
                              {place.source_category}
                            </span>
                          ) : null}
                          {getDisplayTags(place.tags).map((tag) => (
                            <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-1.5 py-0.2 text-[9.5px] font-medium text-stone-600">
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

                        {/* Research Note / Why Quote */}
                        {place.why ? (
                          <p className="mt-2 line-clamp-2 rounded-md bg-stone-50/80 px-2 py-1 text-xs text-stone-700 leading-relaxed" title={place.why}>
                            💡 {place.why}
                          </p>
                        ) : null}
                      </div>

                      {/* Card Footer Toolbar */}
                      <div className="mt-2 flex items-center justify-between gap-1 border-t border-stone-100/90 pt-2">
                        <div className="flex flex-wrap items-center gap-1 text-[9.5px]">
                          {place.phone ? (
                            <a
                              href={`tel:${place.phone}`}
                              className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 hover:bg-stone-200 transition"
                              title={`📞 ${place.phone}`}
                            >
                              📞
                            </a>
                          ) : null}
                          {place.menu_url ? (
                            <a
                              href={place.menu_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 hover:bg-stone-200 transition"
                              title={zh ? '查看菜单' : 'Menu'}
                            >
                              📖 {zh ? '菜单' : 'Menu'}
                            </a>
                          ) : null}
                          {place.reservation_url ? (
                            <a
                              href={place.reservation_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                              title={zh ? '官方预订' : 'Reserve'}
                            >
                              🎟️ {zh ? '预订' : 'Reserve'}
                            </a>
                          ) : null}
                          {place.source_url ? (
                            <a
                              href={place.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                              title={zh ? '地图' : 'Maps'}
                            >
                              🗺️ {zh ? '地图' : 'Maps'}
                            </a>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {place.state === 'dropped' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRestorePlace(place.id);
                              }}
                              className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition"
                              title={zh ? '取回到候选池' : 'Restore to candidate pool'}
                            >
                              ↩️ {zh ? '取回' : 'Restore'}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void schedulePlace(place.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-900 text-xs font-bold text-white hover:bg-stone-800 transition shadow-2xs"
                                title={zh ? '直接排入当天日程' : 'Schedule to active day'}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDropPlace(place.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-xs text-stone-400 hover:text-stone-700 hover:border-stone-300 transition shadow-2xs"
                                title={zh ? '暂不考虑' : 'Shelve'}
                              >
                                🙈
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeletePlace(place.id, place.title);
                            }}
                            className="flex h-6 w-6 items-center justify-center text-xs text-stone-300 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title={zh ? '彻底从行程中删除此地点' : 'Delete place permanently'}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Layer 2 (formerly scheduled collapsible) removed — scheduled places now stay in main pool with 📅 badge */}

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
        onDropHotel={handleDropPlace}
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

      <CreateTripModal
        key={isCreateTripOpen ? 'open' : 'closed'}
        open={isCreateTripOpen}
        onClose={() => setIsCreateTripOpen(false)}
        onCreate={async (newTrip) => {
          await plannerRepository.upsertTrip(newTrip);
          await load();
          setSelectedTripId(newTrip.id);
          setNotice(zh ? `已创建行程「${newTrip.title}」` : `Created trip "${newTrip.title}"`);
        }}
        language={language}
      />

      {selectedTrip ? (
        <CalendarSubscriptionModal
          key={`calendar-${selectedTrip.id}-${isCalendarModalOpen}-${selectedTrip.calendar_feed?.feed_token}-${selectedTrip.calendar_feed?.enabled}`}
          open={isCalendarModalOpen}
          onClose={() => setIsCalendarModalOpen(false)}
          trip={selectedTrip}
          activeDate={activeDate}
          onDownloadFullIcs={downloadFullIcs}
          onDownloadDayIcs={downloadDayIcs}
          onCopyIcs={copyIcsContent}
          onCreateOrUpdateFeed={handleCreateOrUpdateFeed}
          onRotateFeed={handleRotateFeed}
          onDisableFeed={handleDisableFeed}
          isPro={isPro}
          onUpgradePro={openLicenseModal}
          language={language}
        />
      ) : null}

      {/* Suspected Duplicates Review Modal */}
      {isSuspectedModalOpen && visibleSuspectedPairs.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4 bg-stone-50">
              <div>
                <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  ✨ {zh ? '疑似重复地点复核' : 'Suspected Duplicate Review'}
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    {visibleSuspectedPairs.length}
                  </span>
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  {zh
                    ? '以下地点只有相似证据，系统不会自动合并。请逐组选择合并或确认保持分开。'
                    : 'These places have similarity evidence only. Ownly will not auto-merge them; review each pair explicitly.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSuspectedModalOpen(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {visibleSuspectedPairs.map((pair) => (
                <div
                  key={pair.pairId}
                  className="rounded-xl border border-amber-200/80 bg-amber-50/20 p-4 shadow-xs"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        🔍 {pair.reason}
                      </span>
                      <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-stone-500">
                        {zh ? '匹配分' : 'Match'} {Math.round(pair.score * 100)}%
                      </span>
                      {pair.distanceMeters !== undefined ? (
                        <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-stone-500">
                          📍 {pair.distanceMeters}m
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleIgnoreSuspectedPair(pair.pairId)}
                      className="text-[11px] font-medium text-stone-400 hover:text-stone-600 transition"
                    >
                      {zh ? '不是同类 (忽略)' : 'Ignore (keep separate)'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Left Candidate (Primary) */}
                    <div className="flex flex-col justify-between rounded-lg border border-stone-200 bg-white p-3 shadow-2xs">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-sm font-semibold text-stone-900">{pair.primaryPlace.title}</h4>
                          {visitCountByPlaceId.get(pair.primaryPlace.id) ? (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800">
                              ✓ {zh ? '已排日程' : 'Scheduled'}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-stone-400 truncate">{pair.primaryPlace.address || pair.primaryPlace.source_category || '—'}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pair.primaryPlace.observed_rating ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">★ {pair.primaryPlace.observed_rating}</span>
                          ) : null}
                          {pair.primaryPlace.observed_price ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">{pair.primaryPlace.observed_price}</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMergePair(pair.primaryPlace.id, pair.secondaryPlace.id)}
                        className="mt-3 w-full rounded-md bg-emerald-700 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition"
                      >
                        {zh ? '保留此地点并合并' : 'Keep this place & merge'}
                      </button>
                    </div>

                    {/* Right Candidate (Secondary) */}
                    <div className="flex flex-col justify-between rounded-lg border border-stone-200 bg-white p-3 shadow-2xs">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-sm font-semibold text-stone-900">{pair.secondaryPlace.title}</h4>
                          {visitCountByPlaceId.get(pair.secondaryPlace.id) ? (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800">
                              ✓ {zh ? '已排日程' : 'Scheduled'}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-stone-400 truncate">{pair.secondaryPlace.address || pair.secondaryPlace.source_category || '—'}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pair.secondaryPlace.observed_rating ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">★ {pair.secondaryPlace.observed_rating}</span>
                          ) : null}
                          {pair.secondaryPlace.observed_price ? (
                            <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[9.5px] text-stone-600">{pair.secondaryPlace.observed_price}</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMergePair(pair.secondaryPlace.id, pair.primaryPlace.id)}
                        className="mt-3 w-full rounded-md bg-stone-900 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition"
                      >
                        {zh ? '保留此地点并合并' : 'Keep this place & merge'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-stone-100 px-6 py-3 bg-stone-50">
              <button
                type="button"
                onClick={() => setIsSuspectedModalOpen(false)}
                className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 transition"
              >
                {zh ? '暂不处理' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
