from pathlib import Path

# ── Domain helpers consume explicit Visit projections where order/timing exists.
p = Path('src/domain/planner.ts')
s = p.read_text()
s = s.replace(
"export function checkDayScheduleCollisions(\n  places: PlannerTripPlace[],\n  date: string,\n): DayScheduleCollisionSummary {\n  const scheduled = sortPlannerPlaces(places).filter((p) => p.scheduled_date === date && p.state === 'scheduled');",
"export function checkDayScheduleCollisions(\n  places: PlannerScheduledPlace[],\n  date: string,\n): DayScheduleCollisionSummary {\n  const scheduled = sortPlannerScheduledPlaces(places.filter((p) => p.scheduled_date === date));",
)
s = s.replace('  stops: PlannerTripPlace[],\n  travelMode:', '  stops: Array<PlannerTripPlace | PlannerScheduledPlace>,\n  travelMode:')
s = s.replace('export function exportPlacesToKML(tripTitle: string, dateOrDay: string, places: PlannerTripPlace[]): string {', 'export function exportPlacesToKML(tripTitle: string, dateOrDay: string, places: Array<PlannerTripPlace | PlannerScheduledPlace>): string {')
s = s.replace('export function exportPlacesToCSV(places: PlannerTripPlace[]): string {', 'export function exportPlacesToCSV(places: Array<PlannerTripPlace | PlannerScheduledPlace>): string {')
p.write_text(s)

# ── Components distinguish reusable hotel candidates from scheduled Visit projections.
p = Path('src/components/planner/HotelComparisonModal.tsx')
s = p.read_text()
s = s.replace("import type { PlannerTripPlace } from '@/domain/planner';", "import type { PlannerScheduledPlace, PlannerTripPlace } from '@/domain/planner';")
s = s.replace('  scheduledPlaces: PlannerTripPlace[];', '  scheduledPlaces: PlannerScheduledPlace[];')
s = s.replace('  placesByDate?: Record<string, PlannerTripPlace[]>;', '  placesByDate?: Record<string, PlannerScheduledPlace[]>;')
p.write_text(s)

p = Path('src/components/planner/PlannerBudgetLedger.tsx')
s = p.read_text()
s = s.replace("import type { PlannerTrip, PlannerTripPlace, TripExpenseCategory, TripExpenseItem } from '@/domain/planner';", "import type { PlannerScheduledPlace, PlannerTrip, TripExpenseCategory, TripExpenseItem } from '@/domain/planner';")
s = s.replace('  scheduledPlaces: PlannerTripPlace[];', '  scheduledPlaces: PlannerScheduledPlace[];')
p.write_text(s)

p = Path('src/components/planner/PlannerHome.tsx')
s = p.read_text()
s = s.replace("import type { PlannerPlaceKind, PlannerTrip, PlannerTripLeg, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';", "import type { PlannerPlaceKind, PlannerScheduledPlace as PlannerScheduledPlaceDomain, PlannerTrip, PlannerTripLeg, PlannerTripPlace, TripExpenseItem } from '@/domain/planner';")
s = s.replace("function placeMeta(place: PlannerTripPlace, language: 'en' | 'zh' = 'zh'): string {", "function placeMeta(place: PlannerTripPlace | PlannerScheduledPlaceDomain, language: 'en' | 'zh' = 'zh'): string {")
p.write_text(s)

# ── ORS optimization returns Visit projections; persisted legs still use canonical Place ids.
p = Path('scripts/mcp/openrouteservice.ts')
s = p.read_text()
s = s.replace('  ordered_places: PlannerTripPlace[];', '  ordered_places: PlannerScheduledPlace[];')
p.write_text(s)

# ── Stay facade no longer exports the deleted virtual-Place span generator.
p = Path('src/domain/stay.ts')
s = p.read_text().replace('  generateStaySpanPlaces,\n', '')
p.write_text(s)

# ── Capture owns research facts only. Anchors and schedule fields belong to Planner Visits.
p = Path('src/extension/sidepanel/handlers.ts')
s = p.read_text()
old = """    const anchors = store.state.pendingPlaces.filter((p) => store.bulkSelected.has(p.id) && p.is_anchor);\n    if (anchors.length > 0) {\n      setStatus(dict.anchorProtected, 'error');\n      for (const a of anchors) store.bulkSelected.delete(a.id);\n      if (store.bulkSelected.size === 0) return;\n    }\n"""
s = s.replace(old, '')
s = s.replace("                item.scheduled_date = undefined;\n                item.sort_order = undefined;\n                item.locked = undefined;\n", '')
p.write_text(s)

p = Path('src/extension/sidepanel/ui.ts')
s = p.read_text()
s = s.replace("    let node = place.scheduled_date ? undefined : cardCache.get(place.id)?.node;\n    const cached = place.scheduled_date ? undefined : cardCache.get(place.id);", "    let node = cardCache.get(place.id)?.node;\n    const cached = cardCache.get(place.id);")
s = s.replace('  if (store.bulkMode && !place.is_anchor) {', '  if (store.bulkMode) {')
anchor_badge = """  if (place.is_anchor) {\n    parts.push(`<span class=\"badge highlight\" title=\"${store.lang === 'zh' ? '行程锚点（住宿占位），受保护不可批量删除' : 'Trip anchor (stay placeholder), protected from bulk delete'}\">🏨</span>`);\n  }\n"""
s = s.replace(anchor_badge, '')
p.write_text(s)

# ── Delete obsolete schedule-on-Place tests and express remaining schedule tests as Visit projections.
p = Path('src/domain/planner.test.ts')
s = p.read_text()
s = s.replace('  generateStaySpanPlaces,\n', '')
s = s.replace("  type PlannerTrip,\n  STANDARD_RESEARCH_CHIPS,\n  type PlannerTripPlace,\n} from './planner';", "  type PlannerScheduledPlace,\n  type PlannerTrip,\n  STANDARD_RESEARCH_CHIPS,\n  type PlannerTripPlace,\n} from './planner';")
helper_marker = """function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {\n  return {\n"""
# Append a small test-only projection helper after the existing place() helper.
place_end_marker = """  };\n}\n\ndescribe('Ownly Planner domain', () => {\n"""
projection_helper = """  };\n}\n\nfunction scheduledPlace(\n  base: PlannerTripPlace,\n  date: string,\n  sortOrder = 0,\n  overrides: Partial<PlannerScheduledPlace> = {},\n): PlannerScheduledPlace {\n  return {\n    ...base,\n    id: `visit:${base.id}:${date}:${sortOrder}`,\n    visit_id: `visit:${base.id}:${date}:${sortOrder}`,\n    place_id: base.id,\n    state: 'scheduled',\n    scheduled_date: date,\n    sort_order: sortOrder,\n    locked: false,\n    is_anchor: false,\n    ...overrides,\n  };\n}\n\ndescribe('Ownly Planner domain', () => {\n"""
if place_end_marker not in s: raise SystemExit('planner.test place helper marker not found')
s = s.replace(place_end_marker, projection_helper, 1)

old_route = """  it('splits long Google Maps routes into overlapping mobile-safe segments', () => {\n    const places = Array.from({ length: 6 }, (_, index) => place(String(index + 1), {\n      state: 'scheduled',\n      sort_order: index,\n    }));\n    const segments = buildGoogleMapsDirectionsSegments(places, 'transit');\n"""
new_route = """  it('splits long Google Maps routes into overlapping mobile-safe Visit segments', () => {\n    const places = Array.from({ length: 6 }, (_, index) => scheduledPlace(place(String(index + 1)), '2026-10-20', index));\n    const segments = buildGoogleMapsDirectionsSegments(places, 'transit');\n"""
s = s.replace(old_route, new_route)

old_merge = """  it('updates recaptured research without destroying the canonical schedule', () => {\n    const existing = place('stable', {\n      title: 'Old title',\n      state: 'scheduled',\n      scheduled_date: '2026-10-07',\n      sort_order: 2,\n      locked: true,\n      reservation_status: 'booked',\n      area: 'Old area',\n      signals: ['old signal'],\n    });\n"""
new_merge = """  it('updates recaptured research without destroying Planner-owned research decisions', () => {\n    const existing = place('stable', {\n      title: 'Old title',\n      reservation_status: 'booked',\n      area: 'Old area',\n      signals: ['old signal'],\n    });\n"""
s = s.replace(old_merge, new_merge)
s = s.replace("    expect(merged.state).toBe('scheduled');\n    expect(merged.scheduled_date).toBe('2026-10-07');\n    expect(merged.sort_order).toBe(2);\n    expect(merged.locked).toBe(true);\n", "    expect(merged.state).toBe('candidate');\n")

s = s.replace('    const metrics = calculateHotelProximity(hotel, [stop1, stop2]);', "    const metrics = calculateHotelProximity(hotel, [\n      scheduledPlace(stop1, '2026-10-01', 0),\n      scheduledPlace(stop2, '2026-10-01', 1),\n    ]);")
s = s.replace("      '2026-10-01': [day1Stop],\n      '2026-10-02': [day2Stop],", "      '2026-10-01': [scheduledPlace(day1Stop, '2026-10-01', 0)],\n      '2026-10-02': [scheduledPlace(day2Stop, '2026-10-02', 0)],")

stay_test_start = s.find("  it('generates multi-day stay span anchors without leaking locale text into data'")
if stay_test_start >= 0:
    stay_test_end = s.find("\n\n  it('detects hotel transfer days", stay_test_start)
    s = s[:stay_test_start] + s[stay_test_end + 2:]

transfer_start = s.find("  it('detects hotel transfer days and consecutive night indexes'")
transfer_end = s.find("\n\n  it('parses numeric prices", transfer_start)
if transfer_start < 0 or transfer_end < 0: raise SystemExit('transfer test block not found')
transfer_test = r'''  it('detects hotel transfer days and consecutive night indexes from Visit projections', () => {
    const hotelA = place('hA', { title: 'Hotel A (Old Town)', kind: 'stay' });
    const hotelB = place('hB', { title: 'Hotel B (Nimman)', kind: 'stay' });
    const hotelA1 = scheduledPlace(hotelA, '2026-10-01', 0, { is_anchor: true, anchor_type: 'stay_checkin' });
    const hotelA2 = scheduledPlace(hotelA, '2026-10-02', 0, { is_anchor: true, anchor_type: 'stay_checkin' });
    const hotelB3 = scheduledPlace(hotelB, '2026-10-03', 0, { is_anchor: true, anchor_type: 'stay_checkin' });
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
    const transfers = detectHotelTransferDays([hotelA1, hotelA2, hotelB3], dates);
    expect(transfers['2026-10-01'].isTransferDay).toBe(false);
    expect(transfers['2026-10-01'].stayNightIndex).toBe(1);
    expect(transfers['2026-10-01'].totalStayNights).toBe(2);
    expect(transfers['2026-10-02'].stayNightIndex).toBe(2);
    expect(transfers['2026-10-03'].isTransferDay).toBe(true);
    expect(transfers['2026-10-03'].checkoutHotel?.title).toBe('Hotel A (Old Town)');
    expect(transfers['2026-10-03'].checkinHotel?.title).toBe('Hotel B (Nimman)');
  });'''
s = s[:transfer_start] + transfer_test + s[transfer_end:]

collision_start = s.find("  it('detects day overload and long distance transit'")
collision_end = s.find("\n\n});\n\ndescribe('parseImportPayload'", collision_start)
if collision_start < 0 or collision_end < 0: raise SystemExit('collision test block not found')
collision_test = r'''  it('detects day overload and long distance transit from Visit projections', () => {
    const p1 = scheduledPlace(place('p1', { duration_minutes: 360, coordinates: { lat: 35.6895, lng: 139.6917 } }), '2026-10-20', 0);
    const p2 = scheduledPlace(place('p2', { duration_minutes: 300, coordinates: { lat: 35.4437, lng: 139.6380 } }), '2026-10-20', 1);
    const summary = checkDayScheduleCollisions([p1, p2], '2026-10-20');
    expect(summary.hasCollision).toBe(true);
    expect(summary.isOverloaded).toBe(true);
    expect(summary.totalDurationMinutes).toBe(660);
    expect(summary.longTransits[0].distanceKm).toBeGreaterThan(20);
  });'''
s = s[:collision_start] + collision_test + s[collision_end:]

export_start = s.find("describe('exportTripToMarkdown'")
if export_start < 0: raise SystemExit('exportTripToMarkdown test not found')
# Surgical edits in the final test: Place stays candidate; schedule is a separate projection argument.
s = s.replace("      place('p1', {\n        title: 'Shibuya Crossing',\n        kind: 'attraction',\n        scheduled_date: '2026-10-20',\n        state: 'scheduled',\n      }),", "      place('p1', { title: 'Shibuya Crossing', kind: 'attraction' }),")
s = s.replace("    const md = exportTripToMarkdown(trip, places, expenses, 'zh');", "    const scheduled = [scheduledPlace(places[0], '2026-10-20', 0)];\n    const md = exportTripToMarkdown(trip, places, scheduled, expenses, 'zh');")
p.write_text(s)

print('remaining Place scheduling assumptions removed')
