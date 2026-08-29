from pathlib import Path


def patch(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if text.count(old) != 1:
        raise RuntimeError(f'{label}: expected one match, got {text.count(old)}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')

patch(
    'packages/mcp/src/index.mjs',
    "const COMMIT_WRITE_ANNOTATIONS = {\n",
    "const PREPARE_OPEN_WORLD_ANNOTATIONS = {\n  ...PREPARE_WRITE_ANNOTATIONS,\n  openWorldHint: true,\n};\nconst COMMIT_WRITE_ANNOTATIONS = {\n",
    'open-world annotation definition',
)

needle = "      annotations: PREPARE_WRITE_ANNOTATIONS,\n    },\n    safeHandler(async ({ trip_id, date }) => {\n      const refresh = await buildOpenRouteServiceDayLegs("
replacement = "      annotations: PREPARE_OPEN_WORLD_ANNOTATIONS,\n    },\n    safeHandler(async ({ trip_id, date }) => {\n      const refresh = await buildOpenRouteServiceDayLegs("
patch('packages/mcp/src/index.mjs', needle, replacement, 'ORS refresh annotation')

needle = "                                ? `${transition.leg.mode === 'walking' ? '🚶' : transition.leg.mode === 'driving' ? '🚗' : transition.leg.mode === 'bicycling' ? '🚲' : '🚇'} ${transition.leg.duration_minutes} min${transition.leg.distance_meters !== undefined ? ` · ${transition.leg.distance_meters < 1000 ? `${transition.leg.distance_meters} m` : `${(transition.leg.distance_meters / 1000).toFixed(1)} km`}` : ''}`\n"
replacement = "                                ? `${transition.leg.mode === 'walking' ? '🚶' : transition.leg.mode === 'driving' ? '🚗' : transition.leg.mode === 'bicycling' ? '🚲' : '🚇'} ${transition.leg.duration_minutes} min${transition.leg.distance_meters !== undefined ? ` · ${transition.leg.distance_meters < 1000 ? `${transition.leg.distance_meters} m` : `${(transition.leg.distance_meters / 1000).toFixed(1)} km`}` : ''}${transition.leg.source === 'openrouteservice' ? ' · ORS · OSM' : ''}`\n"
patch('src/components/planner/PlannerHome.tsx', needle, replacement, 'travel source attribution')

patch(
    'docs/PLANNER.md',
    "The browser remains a consumer of canonical `Trip Legs/` facts. API keys are not shipped in the static Web/PWA bundle. Google Maps remains the live-navigation handoff.\n",
    "The browser remains a consumer of canonical `Trip Legs/` facts. API keys are not shipped in the static Web/PWA bundle. OpenRouteService-derived facts are labeled `ORS · OSM` in the Planner UI. Google Maps remains the live-navigation handoff.\n",
    'planner attribution docs',
)

print('PR #130 contract polish applied')
