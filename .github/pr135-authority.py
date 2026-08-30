from pathlib import Path

p = Path('src/domain/planner.ts')
s = p.read_text()

s = s.replace("export type PlannerPlaceState = 'candidate' | 'scheduled' | 'done' | 'dropped';", "export type PlannerPlaceState = 'candidate' | 'done' | 'dropped';")
s = s.replace("export type PlannerPriceUnit = 'person' | 'night' | 'item' | 'level' | 'unknown';", "export type PlannerPriceUnit = 'person' | 'night' | 'item' | 'level' | 'unknown';\nexport type PlannerVisitAnchorType = 'flight' | 'stay_checkin' | 'stay_checkout' | 'transit' | 'reservation';")

for fragment in [
"  is_anchor?: boolean;\n",
"  anchor_type?: 'flight' | 'stay_checkin' | 'stay_checkout' | 'transit' | 'reservation';\n",
"  scheduled_date?: string;\n",
"  /** Canonical local start time for an executable itinerary item (HH:mm). */\n  scheduled_start?: string;\n",
"  sort_order?: number;\n",
"  locked?: boolean;\n",
]:
    s = s.replace(fragment, '')

marker = "export interface PlannerTripLeg {"
projection = """export interface PlannerScheduledPlace extends Omit<PlannerTripPlace, 'id' | 'state' | 'duration_minutes'> {\n  id: string;\n  visit_id: string;\n  place_id: string;\n  state: 'scheduled';\n  scheduled_date: string;\n  scheduled_start?: string;\n  duration_minutes?: number;\n  sort_order: number;\n  locked: boolean;\n  is_anchor: boolean;\n  anchor_type?: PlannerVisitAnchorType;\n}\n\nexport function sortPlannerScheduledPlaces(places: PlannerScheduledPlace[]): PlannerScheduledPlace[] {\n  return [...places].sort((left, right) => {\n    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;\n    const start = (left.scheduled_start ?? '').localeCompare(right.scheduled_start ?? '');\n    if (start !== 0) return start;\n    return left.title.localeCompare(right.title);\n  });\n}\n\n"""
if projection not in s:
    s = s.replace(marker, projection + marker)

s = s.replace("    state: 'candidate',\n    scheduled_date: undefined,\n    scheduled_start: undefined,\n    sort_order: undefined,\n    locked: undefined,", "    state: 'candidate',")

# Remove the old Place-order helper; Visit order has one canonical sorter above.
start = s.find('export function sortPlannerPlaces(')
if start >= 0:
    end = s.find('\n\nexport function mergeCapturedPlaceResearch(', start)
    s = s[:start] + s[end + 2:]

# Directions segments consume an already-materialized Visit projection.
s = s.replace('function directionsUrl(stops: PlannerTripPlace[],', 'function directionsUrl(stops: Array<PlannerTripPlace | PlannerScheduledPlace>,')
s = s.replace('export function buildGoogleMapsDirectionsSegments(\n  places: PlannerTripPlace[],', 'export function buildGoogleMapsDirectionsSegments(\n  places: PlannerScheduledPlace[],')
s = s.replace("  const scheduled = sortPlannerPlaces(places).filter((place) => place.state === 'scheduled');", "  const scheduled = sortPlannerScheduledPlaces(places);")

# Virtual hotel Place copies are obsolete; stay spans are Visit occurrences.
start = s.find('export function generateStaySpanPlaces(')
if start >= 0:
    end = s.find('\n\nexport interface DayHotelTransferInfo', start)
    s = s[:start] + s[end + 2:]

s = s.replace('  checkoutHotel?: PlannerTripPlace;\n  checkinHotel?: PlannerTripPlace;\n  stayHotel?: PlannerTripPlace;', '  checkoutHotel?: PlannerScheduledPlace;\n  checkinHotel?: PlannerScheduledPlace;\n  stayHotel?: PlannerScheduledPlace;')
s = s.replace('export function detectHotelTransferDays(\n  tripPlaces: PlannerTripPlace[],', 'export function detectHotelTransferDays(\n  tripPlaces: PlannerScheduledPlace[],')
s = s.replace('  const stayByDate: Record<string, PlannerTripPlace | undefined> = {};', '  const stayByDate: Record<string, PlannerScheduledPlace | undefined> = {};')
s = s.replace("        p.state === 'scheduled' &&\n        p.scheduled_date === date &&", "        p.scheduled_date === date &&")

# Common read-only helpers accept either reusable facts or Visit projections.
s = s.replace('export function extractPlaceCoordinates(\n  place: Partial<PlannerTripPlace> | string | null | undefined,', 'export function extractPlaceCoordinates(\n  place: Partial<PlannerTripPlace | PlannerScheduledPlace> | string | null | undefined,')
s = s.replace('  scheduledPlaces: PlannerTripPlace[],\n): HotelProximityMetrics', '  scheduledPlaces: PlannerScheduledPlace[],\n): HotelProximityMetrics')
s = s.replace(".filter((item): item is { place: PlannerTripPlace; coords: { lat: number; lng: number } } => item.coords !== null && item.place.kind !== 'stay');", ".filter((item): item is { place: PlannerScheduledPlace; coords: { lat: number; lng: number } } => item.coords !== null && item.place.kind !== 'stay');")
s = s.replace('  placesByDate: Record<string, PlannerTripPlace[]>,', '  placesByDate: Record<string, PlannerScheduledPlace[]>,')
s = s.replace("(item): item is { place: PlannerTripPlace; coords: { lat: number; lng: number } } =>", "(item): item is { place: PlannerScheduledPlace; coords: { lat: number; lng: number } } =>")
s = s.replace('export function estimateTripBudget(\n  scheduledPlaces: PlannerTripPlace[],', 'export function estimateTripBudget(\n  scheduledPlaces: Array<PlannerTripPlace | PlannerScheduledPlace>,')
s = s.replace('export function parsePlaceExpenseEstimate(\n  place: PlannerTripPlace,', 'export function parsePlaceExpenseEstimate(\n  place: PlannerTripPlace | PlannerScheduledPlace,')

# Full Markdown export now receives the derived occurrences explicitly; Place facts remain reusable candidates.
s = s.replace("export function exportTripToMarkdown(\n  trip: PlannerTrip,\n  places: PlannerTripPlace[],\n  expenses: TripExpenseItem[] = [],", "export function exportTripToMarkdown(\n  trip: PlannerTrip,\n  places: PlannerTripPlace[],\n  scheduledPlaces: PlannerScheduledPlace[],\n  expenses: TripExpenseItem[] = [],")
s = s.replace("    const dayPlaces = sortPlannerPlaces(tripPlaces.filter((p) => p.scheduled_date === date && p.state === 'scheduled'));", "    const dayPlaces = sortPlannerScheduledPlaces(scheduledPlaces.filter((p) => p.trip_id === trip.id && p.scheduled_date === date));")

p.write_text(s)

# planner-visits owns persistence/materialization only; projection contract and sorter live in planner domain.
p = Path('src/domain/planner-visits.ts')
s = p.read_text()
s = s.replace("import type { PlannerTripPlace } from './planner';\n\nexport type PlannerVisitAnchorType = 'flight' | 'stay_checkin' | 'stay_checkout' | 'transit' | 'reservation';", "import { sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripPlace, type PlannerVisitAnchorType } from './planner';\n\nexport type { PlannerScheduledPlace, PlannerVisitAnchorType } from './planner';")
start = s.find('export interface PlannerScheduledPlace extends')
if start >= 0:
    end = s.find('\n\nexport function materializePlannerScheduledPlaces(', start)
    s = s[:start] + s[end + 2:]
start = s.find('export function sortPlannerScheduledPlaces(')
if start >= 0:
    end = s.find('\n\nexport function createPlannerTripVisit(', start)
    s = s[:start] + s[end + 2:]
# Ensure imported sorter is considered a re-export and available to callers of this module.
s = s.replace("export type { PlannerScheduledPlace, PlannerVisitAnchorType } from './planner';", "export { sortPlannerScheduledPlaces } from './planner';\nexport type { PlannerScheduledPlace, PlannerVisitAnchorType } from './planner';")
p.write_text(s)

# Repository import boundary no longer clears scheduling fields because Place has none.
p = Path('src/services/PlannerRepository.ts')
s = p.read_text()
for fragment in ["        scheduled_date: undefined,\n", "        sort_order: undefined,\n", "        locked: undefined,\n"]:
    s = s.replace(fragment, '')
p.write_text(s)

# Web full-itinerary export gets both reusable place facts and materialized Visit occurrences.
p = Path('src/components/planner/PlannerHome.tsx')
s = p.read_text()
s = s.replace('    const md = exportTripToMarkdown(selectedTrip, places, currentExpenses, language);', '    const md = exportTripToMarkdown(selectedTrip, places, scheduledAll, currentExpenses, language);')
s = s.replace('  }, [selectedTrip, places, currentExpenses, language, zh]);', '  }, [selectedTrip, places, scheduledAll, currentExpenses, language, zh]);')
p.write_text(s)

print('legacy Place scheduling authority removed')
