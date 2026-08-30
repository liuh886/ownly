from pathlib import Path

# planner-schedule: execution functions consume visit projections; travel facts stay keyed by canonical place ids.
p = Path('src/domain/planner-schedule.ts')
s = p.read_text()
s = s.replace("  sortPlannerPlaces,\n", "")
s = s.replace("} from './planner';\n", "} from './planner';\nimport { sortPlannerScheduledPlaces, type PlannerScheduledPlace } from './planner-visits';\n", 1)
s = s.replace("  places: PlannerTripPlace[],\n  date: string,\n): PlannerTimeOverlap[] {", "  places: PlannerScheduledPlace[],\n  date: string,\n): PlannerTimeOverlap[] {")
s = s.replace("    .filter((place) => place.state === 'scheduled' && place.scheduled_date === date)", "    .filter((place) => place.scheduled_date === date)", 1)
s = s.replace("    .filter((item): item is { place: PlannerTripPlace; start: number; end: number } => item !== null)", "    .filter((item): item is { place: PlannerScheduledPlace; start: number; end: number } => item !== null)")
s = s.replace("  places: PlannerTripPlace[],\n  legs: PlannerTripLeg[],\n  date: string,\n): PlannerDayFeasibility {\n  const dayPlaces = sortPlannerPlaces(\n    places.filter((place) => place.trip_id === trip.id && place.state === 'scheduled' && place.scheduled_date === date),\n  );", "  places: PlannerScheduledPlace[],\n  legs: PlannerTripLeg[],\n  date: string,\n): PlannerDayFeasibility {\n  const dayPlaces = sortPlannerScheduledPlaces(\n    places.filter((place) => place.trip_id === trip.id && place.scheduled_date === date),\n  );")
s = s.replace("    const leg = legByPair.get(transitionKey(from.id, to.id));", "    const leg = legByPair.get(transitionKey(from.place_id, to.place_id));")
s = s.replace("export interface PlannerTimelineStopItem {\n  type: 'stop';\n  id: string;\n  place_id: string;", "export interface PlannerTimelineStopItem {\n  type: 'stop';\n  id: string;\n  visit_id: string;\n  place_id: string;")
s = s.replace("  places: PlannerTripPlace[],\n  legs: PlannerTripLeg[],\n  date: string,\n): PlannerDayExecutionTimeline {\n  const dayPlaces = sortPlannerPlaces(\n    places.filter((place) => place.trip_id === trip.id && place.state === 'scheduled' && place.scheduled_date === date),\n  );", "  places: PlannerScheduledPlace[],\n  legs: PlannerTripLeg[],\n  date: string,\n): PlannerDayExecutionTimeline {\n  const dayPlaces = sortPlannerScheduledPlaces(\n    places.filter((place) => place.trip_id === trip.id && place.scheduled_date === date),\n  );")
s = s.replace("      id: `stop:${place.id}`,\n      place_id: place.id,", "      id: `stop:${place.id}`,\n      visit_id: place.visit_id,\n      place_id: place.place_id,")
p.write_text(s)

# PlannerHome patch from reusable place pool to repeatable visits.
exec(Path('.github/pr135-web.py').read_text())

# Small iCal caller updates while MCP write operations are being refactored.
p = Path('scripts/shared/ownly-write-service.ts')
s = p.read_text()
s = s.replace("  listPlannerTrips,\n  reorderDayPlace,\n  returnPlaceToPool,\n  schedulePlaceOnDate,\n", "  listPlannerTrips,\n  listPlannerVisits,\n")
s = s.replace("  generateStaySpanPlaces,\n", "")
s = s.replace("  type PlannerTripPlace,\n", "  type PlannerTripPlace,\n", 1)
s = s.replace("import { exportTripToICalProMarkdown } from '../../src/domain/ical-pro';", "import { exportTripToICalProMarkdown } from '../../src/domain/ical-pro';\nimport { createPlannerTripVisit, plannerTripVisitFileName, type PlannerTripVisit } from '../../src/domain/planner-visits';")
s = s.replace("    const markdown = exportTripToICalProMarkdown(trip, places);", "    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);\n    const visits = visitEntries.map((entry) => entry.frontmatter as PlannerTripVisit);\n    const markdown = exportTripToICalProMarkdown(trip, places, visits);")
s = s.replace("    const expectedPlaces = new Map(placeEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));", "    const expectedPlaces = new Map(placeEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));\n    const expectedVisits = new Map(visitEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));")
s = s.replace("        for (const entry of placeEntries) assertUnchanged(entry.filePath, expectedPlaces.get(entry.filePath)!);", "        for (const entry of placeEntries) assertUnchanged(entry.filePath, expectedPlaces.get(entry.filePath)!);\n        for (const entry of visitEntries) assertUnchanged(entry.filePath, expectedVisits.get(entry.filePath)!);")
p.write_text(s)

print('visit-aware execution core staged')
