from pathlib import Path
import re

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if text.count(old) != 1:
        raise SystemExit(f'{path}: expected exactly one literal match, found {text.count(old)}')
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, repl: str) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one regex match, found {count}: {pattern[:80]}')
    write(path, next_text)


# 1) Pure travel-time optimizer. Matrix is ephemeral input; only final order is canonical.
write('src/domain/planner-route-time.ts', r'''import type { PlannerTripPlace } from './planner';

export type PlannerTravelTimeMatrix = Record<string, Record<string, number | null | undefined> | undefined>;

export interface PlannerTravelTimeOptimizationOptions {
  fixStart?: boolean;
  fixEnd?: boolean;
  respectLocked?: boolean;
}

export interface PlannerTravelTimeOptimizationResult {
  places: PlannerTripPlace[];
  originalMinutes: number;
  optimizedMinutes: number;
  savedMinutes: number;
  improved: boolean;
}

export function calculateRouteTravelMinutes(
  places: PlannerTripPlace[],
  matrix: PlannerTravelTimeMatrix,
): number | null {
  let total = 0;
  for (let index = 0; index < places.length - 1; index += 1) {
    const duration = matrix[places[index].id]?.[places[index + 1].id];
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return null;
    total += duration;
  }
  return Math.round(total);
}

function buildPinnedOrder(
  base: PlannerTripPlace[],
  movableSlots: number[],
  movableItems: PlannerTripPlace[],
): PlannerTripPlace[] {
  const next = [...base];
  movableSlots.forEach((slot, index) => {
    next[slot] = movableItems[index];
  });
  return next;
}

export function optimizeStopsByTravelTime(
  places: PlannerTripPlace[],
  matrix: PlannerTravelTimeMatrix,
  options: PlannerTravelTimeOptimizationOptions = {},
): PlannerTravelTimeOptimizationResult | null {
  const { fixStart = true, fixEnd = false, respectLocked = true } = options;
  const current = [...places];
  const originalMinutes = calculateRouteTravelMinutes(current, matrix);
  if (originalMinutes === null) return null;
  if (current.length <= 2) {
    return {
      places: current.map((place, index) => ({ ...place, sort_order: index })),
      originalMinutes,
      optimizedMinutes: originalMinutes,
      savedMinutes: 0,
      improved: false,
    };
  }

  const pinnedSlots = new Set<number>();
  current.forEach((place, index) => {
    if (place.is_anchor || (respectLocked && place.locked)) pinnedSlots.add(index);
  });
  if (fixStart) pinnedSlots.add(0);
  if (fixEnd) pinnedSlots.add(current.length - 1);

  const movableSlots: number[] = [];
  const movableItems: PlannerTripPlace[] = [];
  current.forEach((place, index) => {
    if (!pinnedSlots.has(index)) {
      movableSlots.push(index);
      movableItems.push(place);
    }
  });

  let bestMovable = [...movableItems];
  let bestMinutes = originalMinutes;
  const score = (items: PlannerTripPlace[]): number => {
    const minutes = calculateRouteTravelMinutes(buildPinnedOrder(current, movableSlots, items), matrix);
    return minutes ?? Number.POSITIVE_INFINITY;
  };

  const movableCount = movableItems.length;
  if (movableCount >= 2 && movableCount <= 8) {
    const permute = (items: PlannerTripPlace[], left: number) => {
      if (left === items.length) {
        const minutes = score(items);
        if (minutes < bestMinutes) {
          bestMinutes = minutes;
          bestMovable = [...items];
        }
        return;
      }
      for (let index = left; index < items.length; index += 1) {
        [items[left], items[index]] = [items[index], items[left]];
        permute(items, left + 1);
        [items[left], items[index]] = [items[index], items[left]];
      }
    };
    permute([...movableItems], 0);
  } else if (movableCount > 8) {
    let currentMovable = [...movableItems];
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 60) {
      changed = false;
      iterations += 1;
      for (let left = 0; left < movableCount - 1; left += 1) {
        for (let right = left + 1; right < movableCount; right += 1) {
          const candidate = [
            ...currentMovable.slice(0, left),
            ...currentMovable.slice(left, right + 1).reverse(),
            ...currentMovable.slice(right + 1),
          ];
          const minutes = score(candidate);
          if (minutes < bestMinutes) {
            bestMinutes = minutes;
            bestMovable = candidate;
            currentMovable = candidate;
            changed = true;
          }
        }
      }
    }
  }

  const finalOrder = buildPinnedOrder(current, movableSlots, bestMovable)
    .map((place, index) => ({ ...place, sort_order: index }));
  const savedMinutes = Math.max(0, originalMinutes - bestMinutes);
  return {
    places: finalOrder,
    originalMinutes,
    optimizedMinutes: bestMinutes,
    savedMinutes,
    improved: savedMinutes > 0,
  };
}
''')

write('src/domain/planner-route-time.test.ts', r'''import { describe, expect, it } from 'vitest';
import type { PlannerTripPlace } from './planner';
import { calculateRouteTravelMinutes, optimizeStopsByTravelTime, type PlannerTravelTimeMatrix } from './planner-route-time';

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: 'trip-1', title: id,
    source_provider: 'google_maps', source_url: `https://maps.example/${id}`, kind: 'attraction',
    tags: [], signals: [], risks: [], reservation_status: 'none', state: 'scheduled',
    scheduled_date: '2026-10-07', created_at: '2026-08-30T00:00:00Z', ...overrides,
  };
}

const matrix: PlannerTravelTimeMatrix = {
  a: { a: 0, b: 40, c: 10, d: 50 },
  b: { a: 40, b: 0, c: 10, d: 10 },
  c: { a: 10, b: 10, c: 0, d: 40 },
  d: { a: 50, b: 10, c: 40, d: 0 },
};

describe('travel-time route optimizer', () => {
  it('minimizes minutes while keeping the first stop fixed', () => {
    const result = optimizeStopsByTravelTime([place('a'), place('b'), place('c'), place('d')], matrix);
    expect(result).not.toBeNull();
    expect(result!.places.map((item) => item.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(result!.originalMinutes).toBe(90);
    expect(result!.optimizedMinutes).toBe(30);
    expect(result!.savedMinutes).toBe(60);
  });

  it('keeps locked and anchored slots fixed', () => {
    const result = optimizeStopsByTravelTime([
      place('a'),
      place('b', { locked: true }),
      place('c'),
      place('d', { is_anchor: true, anchor_type: 'reservation' }),
    ], matrix);
    expect(result).not.toBeNull();
    expect(result!.places[1].id).toBe('b');
    expect(result!.places[3].id).toBe('d');
  });

  it('refuses an incomplete current route instead of inventing travel time', () => {
    expect(calculateRouteTravelMinutes([place('a'), place('b')], { a: { b: null } })).toBeNull();
    expect(optimizeStopsByTravelTime([place('a'), place('b')], { a: { b: null } })).toBeNull();
  });
});
''')

# 2) Delete the obsolete straight-line route optimizer and its dedicated test.
regex_once(
    'src/domain/planner.ts',
    r'export function calculateTotalRouteDistanceKm\(places: PlannerTripPlace\[\]\): number \{.*?\nexport interface HotelProximityMetrics',
    'export interface HotelProximityMetrics',
)
replace_once('src/domain/planner.test.ts', '  optimizeStopsSequence,\n', '')
regex_once(
    'src/domain/planner.test.ts',
    r"\n  it\('never moves stay anchors during route optimization \(A3\)', \(\) => \{.*?\n  \}\);\n",
    '\n',
)

# 3) OpenRouteService matrix adapter and day optimization builder.
replace_once(
    'scripts/mcp/openrouteservice.ts',
    "import { OwnlyMcpError } from './ownly-tools';\n\nconst ORS_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/directions';",
    "import { OwnlyMcpError } from './ownly-tools';\nimport { optimizeStopsByTravelTime, type PlannerTravelTimeMatrix } from '../../src/domain/planner-route-time';\n\nconst ORS_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/directions';\nconst ORS_MATRIX_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/matrix';",
)

append = r'''

export interface OpenRouteServiceMatrixResult {
  durations_minutes: Array<Array<number | null>>;
  distances_meters: Array<Array<number | null>>;
}

export async function fetchOpenRouteServiceMatrix(
  apiKey: string,
  places: Array<{ coordinates: { lat: number; lng: number } }>,
  mode: PlannerTravelMode,
): Promise<OpenRouteServiceMatrixResult> {
  const profile = openRouteServiceProfile(mode);
  if (!profile) throw new OwnlyMcpError('OpenRouteService does not provide public-transit routing; travel-time optimization requires walking, driving or bicycling.', 'INVALID_INPUT');
  if (!apiKey.trim()) throw new OwnlyMcpError('OPENROUTESERVICE_API_KEY is required for travel-time optimization.', 'INVALID_INPUT');
  const response = await fetch(`${ORS_MATRIX_BASE_URL}/${profile}`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      locations: places.map((place) => [place.coordinates.lng, place.coordinates.lat]),
      metrics: ['duration', 'distance'],
    }),
  });
  if (!response.ok) throw new OwnlyMcpError(`OpenRouteService matrix request failed (${response.status}).`, 'IO_ERROR');
  const payload = await response.json() as {
    durations?: Array<Array<number | null>>;
    distances?: Array<Array<number | null>>;
  };
  if (!Array.isArray(payload.durations) || !Array.isArray(payload.distances)) {
    throw new OwnlyMcpError('OpenRouteService returned no usable travel-time matrix.', 'DATA_INVALID');
  }
  return {
    durations_minutes: payload.durations.map((row) => row.map((value) => value === null ? null : Math.max(0, Math.ceil(value / 60)))),
    distances_meters: payload.distances.map((row) => row.map((value) => value === null ? null : Math.max(0, Math.round(value)))),
  };
}

export interface PlannerDayTravelOptimization {
  trip: PlannerTrip;
  date: string;
  ordered_places: PlannerTripPlace[];
  legs_to_write: PlannerTripLeg[];
  original_minutes: number;
  optimized_minutes: number;
  saved_minutes: number;
  used_manual_pairs: string[];
}

export async function buildOpenRouteServiceDayOptimization(
  dataLocation: string,
  tripId: string,
  date: string,
  apiKey: string,
  now = new Date(),
): Promise<PlannerDayTravelOptimization> {
  const tripEntry = listPlannerTrips(dataLocation).find((item) => item.frontmatter.id === tripId);
  if (!tripEntry) throw new OwnlyMcpError(`Planner trip was not found: ${tripId}`, 'NOT_FOUND');
  const trip = tripEntry.frontmatter as unknown as PlannerTrip;
  const mode = trip.transport_mode ?? 'transit';
  if (!openRouteServiceProfile(mode)) {
    throw new OwnlyMcpError('Travel-time optimization currently supports walking, driving and bicycling. Transit legs remain user-verified facts.', 'INVALID_INPUT');
  }
  const places = sortPlannerPlaces(
    listPlannerPlaces(dataLocation)
      .map((item) => item.frontmatter as PlannerTripPlace)
      .filter((place) => place.trip_id === tripId && place.state === 'scheduled' && place.scheduled_date === date),
  );
  if (places.length < 3) throw new OwnlyMcpError('At least three scheduled places are required for travel-time optimization.', 'INVALID_INPUT');
  const missingCoordinates = places.filter((place) => !place.coordinates).map((place) => place.title);
  if (missingCoordinates.length > 0) {
    throw new OwnlyMcpError(`Travel-time optimization requires coordinates for every scheduled stop. Missing: ${missingCoordinates.join(', ')}`, 'INVALID_INPUT');
  }

  const matrixResult = await fetchOpenRouteServiceMatrix(
    apiKey,
    places as Array<PlannerTripPlace & { coordinates: { lat: number; lng: number } }>,
    mode,
  );
  const matrix: PlannerTravelTimeMatrix = {};
  places.forEach((from, fromIndex) => {
    matrix[from.id] = {};
    places.forEach((to, toIndex) => {
      matrix[from.id]![to.id] = matrixResult.durations_minutes[fromIndex]?.[toIndex] ?? null;
    });
  });

  const existingLegs = listPlannerLegs(dataLocation)
    .map((item) => item.frontmatter as PlannerTripLeg)
    .filter((leg) => leg.trip_id === tripId);
  const dayIds = new Set(places.map((place) => place.id));
  const usedManualPairs: string[] = [];
  for (const leg of existingLegs) {
    if (leg.source !== 'manual' || !dayIds.has(leg.from_place_id) || !dayIds.has(leg.to_place_id)) continue;
    matrix[leg.from_place_id]![leg.to_place_id] = leg.duration_minutes;
  }

  const result = optimizeStopsByTravelTime(places, matrix, { fixStart: true, respectLocked: true });
  if (!result) throw new OwnlyMcpError('Travel-time matrix is incomplete for the current scheduled order; no route is invented.', 'DATA_INVALID');
  if (!result.improved) throw new OwnlyMcpError('Current order is already optimal by known travel minutes; nothing to commit.', 'INVALID_INPUT');

  const originalIndex = new Map(places.map((place, index) => [place.id, index] as const));
  const existingByPair = new Map(existingLegs.map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));
  const timestamp = now.toISOString();
  const legsToWrite: PlannerTripLeg[] = [];
  for (let index = 0; index < result.places.length - 1; index += 1) {
    const from = result.places[index];
    const to = result.places[index + 1];
    const pair = `${from.id}→${to.id}`;
    const existing = existingByPair.get(pair);
    if (existing?.source === 'manual') {
      usedManualPairs.push(pair);
      continue;
    }
    const fromIndex = originalIndex.get(from.id)!;
    const toIndex = originalIndex.get(to.id)!;
    const duration = matrixResult.durations_minutes[fromIndex]?.[toIndex];
    const distance = matrixResult.distances_meters[fromIndex]?.[toIndex];
    if (duration === null || duration === undefined) {
      throw new OwnlyMcpError(`OpenRouteService has no route for optimized pair ${from.title} → ${to.title}.`, 'DATA_INVALID');
    }
    legsToWrite.push({
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(tripId, from.id, to.id), trip_id: tripId,
      from_place_id: from.id, to_place_id: to.id, mode, duration_minutes: duration,
      distance_meters: distance ?? undefined, source: 'openrouteservice', observed_at: timestamp,
      created_at: existing?.created_at ?? timestamp, updated_at: timestamp,
    });
  }
  return {
    trip, date, ordered_places: result.places, legs_to_write: legsToWrite,
    original_minutes: result.originalMinutes, optimized_minutes: result.optimizedMinutes,
    saved_minutes: result.savedMinutes, used_manual_pairs: usedManualPairs,
  };
}
'''
write('scripts/mcp/openrouteservice.ts', read('scripts/mcp/openrouteservice.ts').rstrip() + append + '\n')

# Extend ORS adapter tests with the matrix contract.
replace_once(
    'scripts/mcp/openrouteservice.test.ts',
    "import { fetchOpenRouteServiceLeg, openRouteServiceProfile } from './openrouteservice';",
    "import { fetchOpenRouteServiceLeg, fetchOpenRouteServiceMatrix, openRouteServiceProfile } from './openrouteservice';",
)
replace_once(
    'scripts/mcp/openrouteservice.test.ts',
    "  it('refuses to fabricate transit routing', async () => {",
    r'''  it('converts matrix seconds and meters without persisting the matrix', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      durations: [[0, 601], [599, 0]],
      distances: [[0, 1234.4], [1200.2, 0]],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchOpenRouteServiceMatrix('test-key', [
      { coordinates: { lat: 13.74, lng: 100.50 } },
      { coordinates: { lat: 13.75, lng: 100.51 } },
    ], 'driving');
    expect(result.durations_minutes).toEqual([[0, 11], [10, 0]]);
    expect(result.distances_meters).toEqual([[0, 1234], [1200, 0]]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.heigit.org/openrouteservice/v2/matrix/driving-car',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refuses to fabricate transit routing', async () => {''',
)

# 4) Replace old straight-line write path with one combined order + final-leg commit.
replace_once('scripts/shared/ownly-write-service.ts', '  optimizeStopsSequence,\n', '')
regex_once(
    'scripts/shared/ownly-write-service.ts',
    r'\n  prepareOptimizeDayRoute\(date: string\): PreparedOwnlyOperation \{.*?\n  \}\n\n  prepareSetStaySpan',
    '\n  prepareSetStaySpan',
)

method = r'''

  prepareApplyTravelTimeOptimization(
    tripId: string,
    date: string,
    orderedPlaceIds: string[],
    legs: PlannerTripLeg[],
    summary: { original_minutes: number; optimized_minutes: number; saved_minutes: number; used_manual_pairs: string[] },
  ): PreparedOwnlyOperation {
    const entries = listPlannerPlaces(this.dataLocation).filter((entry) =>
      entry.frontmatter.trip_id === tripId
      && entry.frontmatter.state === 'scheduled'
      && entry.frontmatter.scheduled_date === date,
    );
    const current = entries
      .map((entry) => entry.frontmatter)
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
    if (orderedPlaceIds.length !== current.length || new Set(orderedPlaceIds).size !== current.length) {
      throw new OwnlyMutationError('Optimized order must contain every scheduled place exactly once.', 'INVALID_INPUT');
    }
    const currentIds = new Set(current.map((place) => place.id));
    if (orderedPlaceIds.some((id) => !currentIds.has(id))) {
      throw new OwnlyMutationError('Optimized order contains a place outside this trip/day.', 'INVALID_INPUT');
    }
    current.forEach((place, index) => {
      if ((index === 0 || place.locked || place.is_anchor) && orderedPlaceIds[index] !== place.id) {
        throw new OwnlyMutationError(`${place.title} is fixed and cannot move during travel-time optimization.`, 'INVALID_INPUT');
      }
    });

    const timestamp = this.now().toISOString();
    const orderById = new Map(orderedPlaceIds.map((id, index) => [id, index] as const));
    const placeTargets = entries
      .map((entry) => ({
        entry,
        next: { ...entry.frontmatter, sort_order: orderById.get(entry.frontmatter.id)!, updated_at: timestamp },
        expected: fingerprint(entry.filePath),
      }))
      .filter(({ entry, next }) => entry.frontmatter.sort_order !== next.sort_order);

    const tripPlaceIds = new Set(
      listPlannerPlaces(this.dataLocation)
        .filter((entry) => entry.frontmatter.trip_id === tripId)
        .map((entry) => entry.frontmatter.id),
    );
    const existingLegs = listPlannerLegs(this.dataLocation);
    const existingById = new Map(existingLegs.map((entry) => [entry.frontmatter.id, entry.frontmatter] as const));
    const legDirectory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.legs);
    const normalizedLegs = legs.map((leg) => {
      if (leg.trip_id !== tripId || !tripPlaceIds.has(leg.from_place_id) || !tripPlaceIds.has(leg.to_place_id) || leg.from_place_id === leg.to_place_id) {
        throw new OwnlyMutationError(`Invalid travel leg endpoints: ${leg.from_place_id} → ${leg.to_place_id}`, 'INVALID_INPUT');
      }
      if (!Number.isInteger(leg.duration_minutes) || leg.duration_minutes <= 0 || leg.duration_minutes > 1440) {
        throw new OwnlyMutationError('Travel duration must be an integer between 1 and 1440 minutes.', 'INVALID_INPUT');
      }
      const existing = existingById.get(leg.id);
      return { ...leg, created_at: existing?.created_at ?? leg.created_at ?? timestamp, updated_at: timestamp };
    });
    const legTargets = normalizedLegs.map((leg) => {
      const filePath = join(legDirectory, plannerTripLegFileName(leg.id));
      return { leg, filePath, expected: fingerprint(filePath) };
    });

    return this.prepare('planner_optimize_day_travel_time', {
      trip_id: tripId,
      date,
      ...summary,
      order: orderedPlaceIds,
      refreshed_legs: normalizedLegs.map((leg) => ({ from: leg.from_place_id, to: leg.to_place_id, minutes: leg.duration_minutes })),
    }, () => {
      for (const target of placeTargets) assertUnchanged(target.entry.filePath, target.expected);
      for (const target of legTargets) assertUnchanged(target.filePath, target.expected);
      for (const target of placeTargets) {
        writeEntry(dirname(target.entry.filePath), target.entry.fileName, target.next, target.entry.body);
      }
      if (legTargets.length > 0) mkdirSync(legDirectory, { recursive: true });
      for (const target of legTargets) {
        writeFileSync(target.filePath, serializeMarkdownEntity(target.leg, ''), 'utf8');
        writeAgentLog(this.dataLocation, 'planner_optimize_day_travel_time_leg', target.leg.id, existingById.get(target.leg.id) ?? null, target.leg);
      }
      writeAgentLog(this.dataLocation, 'planner_optimize_day_travel_time', `${tripId}:${date}`, current.map((place) => place.id), orderedPlaceIds);
      return { trip_id: tripId, date, updated_places: placeTargets.length, refreshed_legs: legTargets.length, saved_minutes: summary.saved_minutes };
    });
  }
'''
replace_once('scripts/shared/ownly-write-service.ts', '\n  prepareSetStaySpan(', method + '\n  prepareSetStaySpan(')

# 5) MCP public tool: remove old straight-line optimize tool, add real travel-time optimizer.
replace_once(
    'packages/mcp/src/index.mjs',
    "import { buildOpenRouteServiceDayLegs } from '../../../scripts/mcp/openrouteservice.ts';",
    "import { buildOpenRouteServiceDayLegs, buildOpenRouteServiceDayOptimization } from '../../../scripts/mcp/openrouteservice.ts';",
)
replace_once('packages/mcp/src/index.mjs', "const SERVER_VERSION = '0.4.0';", "const SERVER_VERSION = '0.5.0';")
regex_once(
    'packages/mcp/src/index.mjs',
    r"\n  server\.registerTool\(\n    'ownly_planner_prepare_optimize_route',.*?\n  \);\n",
    r'''
  server.registerTool(
    'ownly_planner_prepare_optimize_day_travel_time',
    {
      title: 'Preview Travel-Time Day Optimization',
      description: 'Query an ephemeral OpenRouteService matrix, minimize known travel minutes, keep the first/locked/anchored stops fixed, and preview one atomic commit of the final order plus final adjacent ORS legs. Transit is intentionally not fabricated.',
      inputSchema: z.object({
        trip_id: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      annotations: PREPARE_OPEN_WORLD_ANNOTATIONS,
    },
    safeHandler(async ({ trip_id, date }) => {
      const optimization = await buildOpenRouteServiceDayOptimization(
        dataLocation,
        trip_id,
        date,
        String(process.env.OPENROUTESERVICE_API_KEY ?? ''),
      );
      return writeService.prepareApplyTravelTimeOptimization(
        trip_id,
        date,
        optimization.ordered_places.map((place) => place.id),
        optimization.legs_to_write,
        {
          original_minutes: optimization.original_minutes,
          optimized_minutes: optimization.optimized_minutes,
          saved_minutes: optimization.saved_minutes,
          used_manual_pairs: optimization.used_manual_pairs,
        },
      );
    }),
  );
''',
)

# 6) Web: delete the competing straight-line optimizer and retain only an explanatory MCP boundary.
replace_once('src/components/planner/PlannerHome.tsx', '  optimizeStopsSequence,\n', '')
regex_once('src/components/planner/PlannerHome.tsx', r"\n  const \[optimizeUndo, setOptimizeUndo\].*?;", '')
regex_once(
    'src/components/planner/PlannerHome.tsx',
    r'\n  const runRouteOptimization = useCallback\(async \(\) => \{.*?\n  \}, \[activeOptimizeUndo, disabled, zh, load\]\);\n',
    '\n',
)
regex_once(
    'src/components/planner/PlannerHome.tsx',
    r'''\s*<button\n\s*type="button"\n\s*onClick=\{\(\) => void runRouteOptimization\(\)\}.*?\{activeOptimizeUndo \? \(.*?\) : null\}\n''',
    '''\n                <span\n                  className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-800"\n                  title={zh ? '真实交通时间优化通过本地 Ownly MCP 执行；网页不持有路由 API key' : 'Travel-time optimization runs through local Ownly MCP; the web app never holds the routing API key'}\n                >\n                  ⏱️ {zh ? 'MCP 真实交通优化' : 'MCP travel-time optimize'}\n                </span>\n''',
)

# 7) Docs and versions: one authoritative optimization path.
replace_once(
    'docs/MCP.md',
    '| `ownly_planner_prepare_optimize_route` | Preview TSP day-route optimization (locked/unlocated stops pinned) |',
    '| `ownly_planner_prepare_optimize_day_travel_time` | Query an ephemeral ORS matrix, minimize actual travel minutes, keep the first/locked/anchored stops fixed, and preview one atomic order + final-leg commit |',
)
planner_doc = read('docs/PLANNER.md')
planner_doc += r'''

## Travel-time optimization

The old straight-line-distance optimizer is removed. Ownly has one optimization path: local MCP queries an ephemeral OpenRouteService matrix for the selected walking/driving/bicycling day, minimizes total known travel minutes, preserves the first stop plus locked/anchored slots, and commits the chosen order together with only the final adjacent ORS legs. The N×N matrix is never persisted.

`transit` remains manual because Ownly does not fabricate public-transport travel times. The static Web/PWA does not hold an ORS API key; it displays the canonical order and `Trip Legs/` facts after the MCP commit.
'''
write('docs/PLANNER.md', planner_doc)

for path in ['package.json', 'packages/mcp/package.json', 'server.json']:
    text = read(path)
    if '0.4.0' not in text:
        raise SystemExit(f'{path}: expected 0.4.0 version marker')
    write(path, text.replace('0.4.0', '0.5.0'))

print('PR131 patch applied')
