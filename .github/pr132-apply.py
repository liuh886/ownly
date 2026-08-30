from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing replacement target in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Canonical derived execution timeline lives beside feasibility in planner-schedule.ts.
path = Path('src/domain/planner-schedule.ts')
text = path.read_text(encoding='utf-8')
old = '''export interface PlannerDayFeasibility {
  date: string;
  status: PlannerDayFeasibilityStatus;
  valid: boolean;
  transitions: PlannerTravelTransition[];
}

function transitionKey(fromId: string, toId: string): string {
'''
new = '''export interface PlannerDayFeasibility {
  date: string;
  status: PlannerDayFeasibilityStatus;
  valid: boolean;
  transitions: PlannerTravelTransition[];
}

export interface PlannerTimelineStopItem {
  type: 'stop';
  id: string;
  place_id: string;
  title: string;
  start?: string;
  end?: string;
  duration_minutes?: number;
  crosses_midnight: boolean;
  locked: boolean;
  is_anchor: boolean;
}

export interface PlannerTimelineTravelItem {
  type: 'travel';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  mode: PlannerTripLeg['mode'];
  duration_minutes: number;
  distance_meters?: number;
  source: PlannerTripLeg['source'];
  start?: string;
  end?: string;
}

export interface PlannerTimelineGapItem {
  type: 'gap';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  start: string;
  end: string;
  duration_minutes: number;
}

export interface PlannerTimelineConflictItem {
  type: 'conflict';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  earliest_arrival?: string;
  next_start?: string;
  late_by_minutes: number;
}

export interface PlannerTimelineUnknownItem {
  type: 'unknown';
  id: string;
  from_id: string;
  to_id: string;
  from_title: string;
  to_title: string;
  reason: 'travel_time_missing' | 'schedule_time_missing';
}

export type PlannerExecutionTimelineItem =
  | PlannerTimelineStopItem
  | PlannerTimelineTravelItem
  | PlannerTimelineGapItem
  | PlannerTimelineConflictItem
  | PlannerTimelineUnknownItem;

export type PlannerExecutionTransitionItem = Exclude<PlannerExecutionTimelineItem, PlannerTimelineStopItem>;

export interface PlannerDayExecutionTimeline {
  date: string;
  status: PlannerDayFeasibilityStatus;
  valid: boolean;
  items: PlannerExecutionTimelineItem[];
}

function transitionKey(fromId: string, toId: string): string {
'''
if old not in text:
    raise SystemExit('planner-schedule timeline type insertion target missing')
text = text.replace(old, new, 1)
marker = '''function isHardConstraint(place: PlannerTripPlace): boolean {
'''
builder = '''export function buildPlannerDayExecutionTimeline(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  legs: PlannerTripLeg[],
  date: string,
): PlannerDayExecutionTimeline {
  const dayPlaces = sortPlannerPlaces(
    places.filter((place) => place.trip_id === trip.id && place.state === 'scheduled' && place.scheduled_date === date),
  );
  const feasibility = evaluatePlannerDayFeasibility(trip, places, legs, date);
  const transitionByPair = new Map(
    feasibility.transitions.map((transition) => [transitionKey(transition.from_id, transition.to_id), transition] as const),
  );
  const items: PlannerExecutionTimelineItem[] = [];

  for (let index = 0; index < dayPlaces.length; index += 1) {
    const place = dayPlaces[index];
    const startMinutes = plannerClockToMinutes(place.scheduled_start);
    const duration = Number.isInteger(place.duration_minutes) && place.duration_minutes && place.duration_minutes > 0
      ? place.duration_minutes
      : undefined;
    const end = getScheduledEndTime(place.scheduled_start, duration) ?? undefined;
    items.push({
      type: 'stop',
      id: `stop:${place.id}`,
      place_id: place.id,
      title: place.title,
      start: place.scheduled_start,
      end,
      duration_minutes: duration,
      crosses_midnight: startMinutes !== null && duration !== undefined && startMinutes + duration > 24 * 60,
      locked: Boolean(place.locked),
      is_anchor: Boolean(place.is_anchor),
    });

    const next = dayPlaces[index + 1];
    if (!next) continue;
    const transition = transitionByPair.get(transitionKey(place.id, next.id));
    if (!transition) {
      items.push({
        type: 'unknown', id: `unknown:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        reason: 'travel_time_missing',
      });
      continue;
    }

    if (transition.leg) {
      const travelEnd = transition.earliest_arrival
        ?? (transition.departure_time
          ? getScheduledEndTime(transition.departure_time, transition.leg.duration_minutes) ?? undefined
          : undefined);
      items.push({
        type: 'travel', id: `travel:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        mode: transition.leg.mode,
        duration_minutes: transition.leg.duration_minutes,
        distance_meters: transition.leg.distance_meters,
        source: transition.leg.source,
        start: transition.departure_time,
        end: travelEnd,
      });
    }

    if (
      transition.status === 'ok'
      && transition.slack_minutes !== undefined
      && transition.slack_minutes > 0
      && transition.earliest_arrival
      && transition.next_start
    ) {
      items.push({
        type: 'gap', id: `gap:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        start: transition.earliest_arrival,
        end: transition.next_start,
        duration_minutes: transition.slack_minutes,
      });
    } else if (transition.status === 'conflict') {
      items.push({
        type: 'conflict', id: `conflict:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        earliest_arrival: transition.earliest_arrival,
        next_start: transition.next_start,
        late_by_minutes: transition.late_by_minutes ?? 0,
      });
    } else if (transition.status === 'unknown') {
      items.push({
        type: 'unknown', id: `unknown:${place.id}:${next.id}`,
        from_id: place.id, to_id: next.id, from_title: place.title, to_title: next.title,
        reason: transition.unknown_reason ?? 'schedule_time_missing',
      });
    }
  }

  return { date, status: feasibility.status, valid: feasibility.valid, items };
}

'''
if marker not in text:
    raise SystemExit('planner-schedule builder insertion target missing')
text = text.replace(marker, builder + marker, 1)
path.write_text(text, encoding='utf-8')

# 2) Extend the existing schedule test file instead of creating a parallel suite.
replace_once(
    'src/domain/planner-schedule.test.ts',
    '''import {
  evaluatePlannerDayFeasibility,
''',
    '''import {
  buildPlannerDayExecutionTimeline,
  evaluatePlannerDayFeasibility,
''',
)
path = Path('src/domain/planner-schedule.test.ts')
text = path.read_text(encoding='utf-8').rstrip() + '''\n\n
describe('Planner execution timeline', () => {
  function scheduledPlace(id: string, start: string | undefined, duration: number | undefined, sortOrder: number): PlannerTripPlace {
    return place(id, {
      state: 'scheduled', scheduled_date: '2026-10-05', scheduled_start: start,
      duration_minutes: duration, sort_order: sortOrder,
    });
  }

  function travelLeg(from: string, to: string, minutes: number): PlannerTripLeg {
    return {
      schema_version: '0.1', type: 'trip_leg', id: plannerTripLegId(trip.id, from, to), trip_id: trip.id,
      from_place_id: from, to_place_id: to, mode: 'walking', duration_minutes: minutes,
      distance_meters: 1200, source: 'manual', created_at: '2026-08-29T00:00:00Z',
    };
  }

  it('projects stop, travel and positive slack as one execution timeline', () => {
    const places = [scheduledPlace('a', '09:00', 90, 0), scheduledPlace('b', '11:00', 60, 1)];
    const result = buildPlannerDayExecutionTimeline(trip, places, [travelLeg('a', 'b', 18)], '2026-10-05');
    expect(result.status).toBe('feasible');
    expect(result.items.map((item) => item.type)).toEqual(['stop', 'travel', 'gap', 'stop']);
    expect(result.items[0]).toMatchObject({ type: 'stop', place_id: 'a', start: '09:00', end: '10:30' });
    expect(result.items[1]).toMatchObject({ type: 'travel', from_id: 'a', to_id: 'b', start: '10:30', end: '10:48', duration_minutes: 18 });
    expect(result.items[2]).toMatchObject({ type: 'gap', start: '10:48', end: '11:00', duration_minutes: 12 });
  });

  it('projects deterministic lateness after the known travel block', () => {
    const places = [scheduledPlace('a', '09:00', 90, 0), scheduledPlace('b', '11:00', 60, 1)];
    const result = buildPlannerDayExecutionTimeline(trip, places, [travelLeg('a', 'b', 42)], '2026-10-05');
    expect(result.status).toBe('conflict');
    expect(result.items.map((item) => item.type)).toEqual(['stop', 'travel', 'conflict', 'stop']);
    expect(result.items[1]).toMatchObject({ type: 'travel', start: '10:30', end: '11:12', duration_minutes: 42 });
    expect(result.items[2]).toMatchObject({ type: 'conflict', earliest_arrival: '11:12', next_start: '11:00', late_by_minutes: 12 });
  });

  it('keeps a missing travel fact explicitly unknown', () => {
    const places = [scheduledPlace('a', '09:00', 90, 0), scheduledPlace('b', '11:00', 60, 1)];
    const result = buildPlannerDayExecutionTimeline(trip, places, [], '2026-10-05');
    expect(result.status).toBe('unknown');
    expect(result.items.map((item) => item.type)).toEqual(['stop', 'unknown', 'stop']);
    expect(result.items[1]).toMatchObject({ type: 'unknown', reason: 'travel_time_missing' });
  });

  it('keeps a known travel fact when schedule timing is incomplete', () => {
    const places = [scheduledPlace('a', '09:00', 90, 0), scheduledPlace('b', undefined, 60, 1)];
    const result = buildPlannerDayExecutionTimeline(trip, places, [travelLeg('a', 'b', 18)], '2026-10-05');
    expect(result.status).toBe('unknown');
    expect(result.items.map((item) => item.type)).toEqual(['stop', 'travel', 'unknown', 'stop']);
    expect(result.items[1]).toMatchObject({ type: 'travel', start: '10:30', end: '10:48', duration_minutes: 18 });
    expect(result.items[2]).toMatchObject({ type: 'unknown', reason: 'schedule_time_missing' });
  });
});\n'''
path.write_text(text, encoding='utf-8')

# 3) MCP trip detail exposes the execution timeline as the single derived execution contract.
replace_once(
    'scripts/mcp/planner-tools.ts',
    "import { evaluatePlannerDayFeasibility, findPlannerTimeOverlaps } from '../../src/domain/planner-schedule';",
    "import { buildPlannerDayExecutionTimeline, findPlannerTimeOverlaps } from '../../src/domain/planner-schedule';",
)
replace_once(
    'scripts/mcp/planner-tools.ts',
    '''  const feasibility = listTripDates(trip.start_date, trip.end_date)
    .map((date) => evaluatePlannerDayFeasibility(trip, places, legs, date));
''',
    '''  const executionTimeline = listTripDates(trip.start_date, trip.end_date)
    .map((date) => buildPlannerDayExecutionTimeline(trip, places, legs, date));
''',
)
replace_once(
    'scripts/mcp/planner-tools.ts',
    '''    travel_legs: legs,
    feasibility,
    places: places.map((place) => ({
''',
    '''    travel_legs: legs,
    execution_timeline: executionTimeline,
    places: places.map((place) => ({
''',
)

# 4) Web: replace Day Skeleton's direct feasibility rendering with the derived execution timeline.
path = Path('src/components/planner/PlannerHome.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace(
    "import { evaluatePlannerDayFeasibility, findPlannerTimeOverlaps, getScheduledEndTime } from '@/domain/planner-schedule';",
    "import { buildPlannerDayExecutionTimeline, findPlannerTimeOverlaps, type PlannerExecutionTransitionItem, type PlannerTimelineStopItem } from '@/domain/planner-schedule';",
    1,
)
old = '''  const dayFeasibility = useMemo(
    () => selectedTrip
      ? evaluatePlannerDayFeasibility(selectedTrip, tripPlaces, tripLegs, activeDate)
      : { date: activeDate, status: 'unknown' as const, valid: false, transitions: [] },
    [activeDate, selectedTrip, tripLegs, tripPlaces],
  );
'''
new = '''  const dayTimeline = useMemo(
    () => selectedTrip
      ? buildPlannerDayExecutionTimeline(selectedTrip, tripPlaces, tripLegs, activeDate)
      : { date: activeDate, status: 'unknown' as const, valid: false, items: [] },
    [activeDate, selectedTrip, tripLegs, tripPlaces],
  );
'''
if old not in text:
    raise SystemExit('PlannerHome day feasibility block missing')
text = text.replace(old, new, 1)
old = '''              <div>
                <h2 className="text-sm font-semibold text-stone-900">Day Skeleton</h2>
                <p className="text-[11px] text-stone-400">{activeDate} · {scheduled.length} {zh ? '个游览点' : 'stops'}</p>
              </div>
'''
new = '''              <div>
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
'''
if old not in text:
    raise SystemExit('PlannerHome Day Skeleton heading missing')
text = text.replace(old, new, 1)
old = '''                  const scheduledEnd = getScheduledEndTime(place.scheduled_start, place.duration_minutes);
                  const transition = dayFeasibility.transitions[index];
'''
new = '''                  const timelineStop = dayTimeline.items.find(
                    (item): item is PlannerTimelineStopItem => item.type === 'stop' && item.place_id === place.id,
                  );
                  const nextPlace = scheduled[index + 1];
                  const transitionItems = nextPlace
                    ? dayTimeline.items.filter(
                      (item): item is PlannerExecutionTransitionItem => item.type !== 'stop' && item.from_id === place.id && item.to_id === nextPlace.id,
                    )
                    : [];
'''
if old not in text:
    raise SystemExit('PlannerHome scheduled transition variables missing')
text = text.replace(old, new, 1)
text = text.replace(
    "place.scheduled_start\n                                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 ring-1 ring-stone-300/60'",
    "timelineStop?.start\n                                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 ring-1 ring-stone-300/60'",
    1,
)
old = "<span>{place.scheduled_start ? `${place.scheduled_start}${scheduledEnd ? `-${scheduledEnd}` : ''}` : (zh ? '设时间' : 'Time')}</span>"
new = "<span>{timelineStop?.start ? `${timelineStop.start}${timelineStop.end ? `-${timelineStop.end}${timelineStop.crosses_midnight ? ' +1' : ''}` : ''}` : (zh ? '设时间' : 'Time')}</span>"
if old not in text:
    raise SystemExit('PlannerHome timing display missing')
text = text.replace(old, new, 1)
text = text.replace(
    "title={place.locked ? (zh ? '已固定顺位（顺路优化不会挪动此站）' : 'Pinned (TSP optimizer will not move this stop)') : (zh ? '点击固定此站顺位' : 'Click to pin stop')}",
    "title={place.locked ? (zh ? '已固定顺位（真实交通时间优化不会挪动此站）' : 'Pinned (travel-time optimization will not move this stop)') : (zh ? '点击固定此站顺位' : 'Click to pin stop')}",
    1,
)
start = text.index('{index < scheduled.length - 1 ? (', text.index('{scheduled.map((place, index) => {'))
end = text.index('\n                    </li>', start)
new_block = '''{index < scheduled.length - 1 ? (
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
                      ) : null}'''
text = text[:start] + new_block + text[end:]
path.write_text(text, encoding='utf-8')

# 5) Public MCP version and description.
replace_once('packages/mcp/src/index.mjs', "const SERVER_VERSION = '0.5.0';", "const SERVER_VERSION = '0.6.0';")
replace_once(
    'packages/mcp/src/index.mjs',
    "description: 'Full trip context: trip, budget estimate in base currency with FX, day conflicts (opening hours), places, bookings and expenses.',",
    "description: 'Full trip context: trip, FX-aware budget, conflicts, canonical travel legs, derived execution timelines, places, bookings and expenses.',",
)

mcp_package = Path('packages/mcp/package.json')
data = json.loads(mcp_package.read_text(encoding='utf-8'))
data['version'] = '0.6.0'
mcp_package.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 6) MCP Registry metadata: version bump + optional ORS secret for local routing calls.
server_path = Path('server.json')
server = json.loads(server_path.read_text(encoding='utf-8'))
server['version'] = '0.6.0'
server['packages'][0]['version'] = '0.6.0'
envs = server['packages'][0]['environmentVariables']
envs[:] = [item for item in envs if item.get('name') != 'OPENROUTESERVICE_API_KEY']
envs.append({
    'name': 'OPENROUTESERVICE_API_KEY',
    'description': 'OpenRouteService API key used by local Planner travel-leg refresh and travel-time optimization for walking/driving/bicycling.',
    'isRequired': False,
    'isSecret': True,
    'format': 'string',
})
server_path.write_text(json.dumps(server, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 7) Run the existing schedule suite in the standard shared/MCP validation path.
root_package = Path('package.json')
root = json.loads(root_package.read_text(encoding='utf-8'))
root['scripts']['test:mcp'] = 'vitest run src/domain/planner-schedule.test.ts src/domain/planner-route-time.test.ts scripts/mcp/ownly-tools.test.ts scripts/mcp/openrouteservice.test.ts scripts/shared/ownly-write-service.test.ts'
root_package.write_text(json.dumps(root, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 8) Docs: one product term and one execution contract.
replace_once('docs/PLANNER.md', '**Ownly Planner**: research pool, day skeleton, manual ordering, route handoff.', '**Ownly Planner**: research pool, execution timeline, manual ordering, route handoff.')
replace_once('docs/PLANNER.md', '  → Day Skeleton\n', '  → Execution Timeline\n')
planner_docs = Path('docs/PLANNER.md')
text = planner_docs.read_text(encoding='utf-8').rstrip()
if '## Execution Timeline\n' not in text:
    text += '''\n\n## Execution Timeline\n\nExecution Timeline is a deterministic projection, not a new persistence layer. `Trip Places/` remains the authority for stop order/start/duration, and `Trip Legs/` remains the authority for travel facts. `planner-schedule.ts` combines them into ordered `stop`, `travel`, `gap`, `conflict`, and `unknown` blocks.\n\nPositive slack becomes an explicit gap; impossible handoffs become conflicts; missing travel or schedule facts remain unknown. The timeline never invents start times, transfer durations, buffers, or risk scores. Web and MCP consume the same derived projection.\n'''
planner_docs.write_text(text + '\n', encoding='utf-8')
replace_once(
    'docs/MCP.md',
    '| `ownly_planner_get_trip` | Full trip context: budget (FX-aware), day conflicts, places, bookings, expenses |',
    '| `ownly_planner_get_trip` | Full trip context: budget, conflicts, canonical travel legs, derived execution timeline, places, bookings, expenses |',
)

print('PR132 execution timeline implementation applied')
