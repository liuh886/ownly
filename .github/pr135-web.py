from pathlib import Path

p = Path('src/components/planner/PlannerHome.tsx')
s = p.read_text()

s = s.replace("import type { PlannerPlaceKind, PlannerTrip, PlannerTripLeg, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';", "import type { PlannerPlaceKind, PlannerTrip, PlannerTripLeg, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';\nimport { materializePlannerScheduledPlaces, sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripVisit } from '@/domain/planner-visits';")
s = s.replace("  generateStaySpanPlaces,\n", "")
s = s.replace("  sortPlannerPlaces,\n", "")
s = s.replace("  const [places, setPlaces] = useState<PlannerTripPlace[]>([]);\n  const [legs, setLegs] = useState<PlannerTripLeg[]>([]);", "  const [places, setPlaces] = useState<PlannerTripPlace[]>([]);\n  const [visits, setVisits] = useState<PlannerTripVisit[]>([]);\n  const [legs, setLegs] = useState<PlannerTripLeg[]>([]);")
s = s.replace("  const [timingModalPlace, setTimingModalPlace] = useState<PlannerTripPlace | null>(null);", "  const [timingModalPlace, setTimingModalPlace] = useState<PlannerScheduledPlace | null>(null);")

s = s.replace("    const [nextTrips, nextPlaces, nextLegs] = await Promise.all([\n      plannerRepository.listTrips(),\n      plannerRepository.listPlaces(),\n      plannerRepository.listLegs(),\n    ]);", "    const [nextTrips, nextPlaces, nextVisits, nextLegs] = await Promise.all([\n      plannerRepository.listTrips(),\n      plannerRepository.listPlaces(),\n      plannerRepository.listVisits(),\n      plannerRepository.listLegs(),\n    ]);")
s = s.replace("    setPlaces(nextPlaces);\n    setLegs(nextLegs);", "    setPlaces(nextPlaces);\n    setVisits(nextVisits);\n    setLegs(nextLegs);", 1)
s = s.replace("      const [nextTrips, nextPlaces, nextLegs, state] = await Promise.all([\n        plannerRepository.listTrips(),\n        plannerRepository.listPlaces(),\n        plannerRepository.listLegs(),\n        pullCaptureState(),\n      ]);", "      const [nextTrips, nextPlaces, nextVisits, nextLegs, state] = await Promise.all([\n        plannerRepository.listTrips(),\n        plannerRepository.listPlaces(),\n        plannerRepository.listVisits(),\n        plannerRepository.listLegs(),\n        pullCaptureState(),\n      ]);")
# replace second setPlaces occurrence following init
idx = s.find("      setPlaces(nextPlaces);", s.find("const [nextTrips, nextPlaces, nextVisits"))
if idx >= 0:
    s = s[:idx] + s[idx:].replace("      setPlaces(nextPlaces);\n      setLegs(nextLegs);", "      setPlaces(nextPlaces);\n      setVisits(nextVisits);\n      setLegs(nextLegs);", 1)

s = s.replace("      .filter((place) => !place.scheduled_date && place.state === 'candidate')", "      .filter((place) => place.state === 'candidate')")

old = """  const scheduled = useMemo(\n    () => sortPlannerPlaces(tripPlaces.filter((place) => place.scheduled_date === activeDate && place.state === 'scheduled')),\n    [activeDate, tripPlaces],\n  );\n"""
new = """  const scheduledAll = useMemo(\n    () => materializePlannerScheduledPlaces(\n      tripPlaces,\n      visits.filter((visit) => visit.trip_id === selectedTripId),\n    ),\n    [selectedTripId, tripPlaces, visits],\n  );\n\n  const scheduled = useMemo(\n    () => sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === activeDate)),\n    [activeDate, scheduledAll],\n  );\n"""
if old not in s: raise SystemExit('scheduled block not found')
s = s.replace(old,new)

s = s.replace("      ? buildPlannerDayExecutionTimeline(selectedTrip, tripPlaces, tripLegs, activeDate)", "      ? buildPlannerDayExecutionTimeline(selectedTrip, scheduledAll, tripLegs, activeDate)")
s = s.replace("    [activeDate, selectedTrip, tripLegs, tripPlaces],", "    [activeDate, selectedTrip, scheduledAll, tripLegs],", 1)

old = """  const placesByDate = useMemo(() => {\n    const map: Record<string, PlannerTripPlace[]> = {};\n    tripDates.forEach((date) => {\n      map[date] = sortPlannerPlaces(\n        tripPlaces.filter((p) => p.state === 'scheduled' && p.scheduled_date === date),\n      );\n    });\n    return map;\n  }, [tripDates, tripPlaces]);\n\n  const transferDaysInfo = useMemo(() => {\n    return detectHotelTransferDays(tripPlaces, tripDates);\n  }, [tripPlaces, tripDates]);\n"""
new = """  const placesByDate = useMemo(() => {\n    const map: Record<string, PlannerScheduledPlace[]> = {};\n    tripDates.forEach((date) => {\n      map[date] = sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === date));\n    });\n    return map;\n  }, [scheduledAll, tripDates]);\n\n  const transferDaysInfo = useMemo(() => {\n    return detectHotelTransferDays(scheduledAll, tripDates);\n  }, [scheduledAll, tripDates]);\n"""
if old not in s: raise SystemExit('placesByDate block not found')
s = s.replace(old,new)

start = s.index("  const handleSelectHotelForStaySpan = useCallback(")
end = s.index("\n  const handleUpdateFxRates", start)
new_block = """  const handleSelectHotelForStaySpan = useCallback(\n    async (hotel: PlannerTripPlace, stayDates: string[]) => {\n      if (disabled || stayDates.length === 0) return;\n      setBusy(true);\n      try {\n        await plannerRepository.setStaySpan(hotel.id, stayDates);\n        await load();\n        setNotice(\n          zh\n            ? `✓ 已将「${hotel.title}」设为 ${stayDates.length} 晚连住宿点 (${stayDates[0]} ~ ${stayDates[stayDates.length - 1]})！`\n            : `✓ Set "${hotel.title}" as stay for ${stayDates.length} nights!`,\n        );\n        setTimeout(() => setNotice(''), 4000);\n      } finally {\n        setBusy(false);\n      }\n    },\n    [disabled, zh, load],\n  );\n"""
s = s[:start] + new_block + s[end:]

s = s.replace("      placeId: string,\n      timing: { scheduled_start?: string; duration_minutes?: number },\n    ) => {\n      await plannerRepository.updatePlaceTiming(placeId, timing);", "      visitId: string,\n      timing: { scheduled_start?: string; duration_minutes?: number },\n    ) => {\n      await plannerRepository.updateVisitTiming(visitId, { start: timing.scheduled_start, duration_minutes: timing.duration_minutes });")
s = s.replace("  const mustScheduled = tripPlaces.filter((place) => place.priority === 'must' && place.scheduled_date).length;", "  const mustScheduled = scheduledAll.filter((place) => place.priority === 'must').length;")

s = s.replace("    return checkDayScheduleCollisions(tripPlaces, activeDate);\n  }, [tripPlaces, activeDate]);", "    return checkDayScheduleCollisions(scheduledAll, activeDate);\n  }, [scheduledAll, activeDate]);")
s = s.replace("    return findPlannerTimeOverlaps(tripPlaces, activeDate);\n  }, [tripPlaces, activeDate]);", "    return findPlannerTimeOverlaps(scheduledAll, activeDate);\n  }, [scheduledAll, activeDate]);")
s = s.replace("    const md = exportTripToICalProMarkdown(selectedTrip, places, { language });", "    const md = exportTripToICalProMarkdown(selectedTrip, places, visits, { language });")
s = s.replace("  }, [selectedTrip, places, language, zh]);", "  }, [selectedTrip, places, visits, language, zh]);", 2)

s = s.replace("    await plannerRepository.schedulePlace(placeId, date);", "    await plannerRepository.addVisit(placeId, date);")
s = s.replace("  const returnToPool = useCallback(async (place: PlannerTripPlace) => {\n    await plannerRepository.unschedulePlace(place.id);", "  const removeVisit = useCallback(async (place: PlannerScheduledPlace) => {\n    await plannerRepository.removeVisit(place.visit_id);")
s = s.replace("    await plannerRepository.reorderScheduled(activeDate, orderedIds);", "    await plannerRepository.reorderVisits(activeDate, orderedIds);")
s = s.replace("onClick={async () => {\n                              await plannerRepository.toggleLockPlace(place.id);", "onClick={async () => {\n                              await plannerRepository.toggleVisitLock(place.visit_id);")
s = s.replace("onClick={() => void returnToPool(place)}", "onClick={() => void removeVisit(place)}")
s = s.replace("aria-label={zh ? '放回候选池' : 'Return to pool'}", "aria-label={zh ? '移除此访问' : 'Remove visit'}")
s = s.replace("{zh ? '移出' : 'Pool'}", "{zh ? '移除' : 'Remove'}")

# Candidate cards remain visible; show how often the reusable place is already scheduled.
needle = "{place.observed_price ? <span className=\"rounded-full bg-stone-100 px-1.5 py-0.2 text-[10px] text-stone-500\">{place.observed_price}</span> : null}"
# Only scheduled block should not receive candidate count. Add count in candidate area via title occurrence later if possible.

# Modal and map receive scheduled projections.
s = s.replace("dayOtherPlaces={scheduled.filter((item) => item.id !== timingModalPlace.id)}", "dayOtherPlaces={scheduled.filter((item) => item.id !== timingModalPlace.id)}")

p.write_text(s)
print('PlannerHome visit refactor applied')
