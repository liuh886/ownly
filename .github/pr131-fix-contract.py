from pathlib import Path
import re
import subprocess


def head(path: str) -> str:
    return subprocess.check_output(['git', 'show', f'HEAD:{path}'], text=True)

# planner-storage: remove dead km-only route surface.
path = Path('scripts/cli/planner-storage.ts')
text = head(str(path))
text = text.replace('  calculateTotalRouteDistanceKm,\n', '', 1)
text = re.sub(
    r"\n/\*\* Total haversine km across an ordered day route \(coordinate gaps skipped\)\. \*/\nexport function calculateDayRouteKm\(stops: PlannerTripPlace\[\]\): number \{\n  return calculateTotalRouteDistanceKm\(stops\);\n\}",
    '',
    text,
    count=1,
)
path.write_text(text, encoding='utf-8')

# planner tests: delete tests that only assert the removed straight-line optimizer.
path = Path('src/domain/planner.test.ts')
text = head(str(path))
text = text.replace('  optimizeStopsSequence,\n', '', 1)
patterns = [
    r"\n  it\('never moves stay anchors during route optimization \(A3\)', \(\) => \{.*?\n  \}\);\n",
    r"\n  it\('optimizes out-of-order itinerary stops into the shortest route', \(\) => \{.*?\n  \}\);\n",
]
for pattern in patterns:
    text, count = re.subn(pattern, '', text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'missing old optimizer test: {pattern}')

start = text.index("describe('Route optimization pinning & budget currency', () => {")
end = text.index("describe('daysUntil', () => {", start)
block = text[start:end]
haversine_start = block.index("  it('haversineDistanceKm calculates accurately")
haversine = block[haversine_start:]
# Drop the old optimizer helpers/tests; retain only the still-used geographic-distance assertion.
text = text[:start] + "describe('Geographic distance', () => {\n" + haversine + text[end:]
path.write_text(text, encoding='utf-8')

# generated ORS code: make Map/key and loop item types explicit.
path = Path('scripts/mcp/openrouteservice.ts')
text = path.read_text(encoding='utf-8')
text = text.replace(
    "  const existingByPair = new Map(existingLegs.map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));",
    "  const existingByPair = new Map<string, PlannerTripLeg>(existingLegs.map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));",
    1,
)
text = text.replace('    const from = result.places[index];\n    const to = result.places[index + 1];', '    const from: PlannerTripPlace = result.places[index];\n    const to: PlannerTripPlace = result.places[index + 1];', 1)
path.write_text(text, encoding='utf-8')

# route.ts was only a compatibility/re-export façade for the deleted optimizer.
Path('src/domain/route.ts').unlink(missing_ok=True)
print('PR131 old route contract removed')
