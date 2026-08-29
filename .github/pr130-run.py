from pathlib import Path
import re

source_path = Path('.github/pr130-implement.py')
source = source_path.read_text(encoding='utf-8')
source, count = re.subn(
    r"pattern = re\.compile\(.*?replacement = \"\"\"",
    "start_marker = '                      {index < scheduled.length - 1 ? ('\n"
    "end_marker = '                      ) : null}'\n"
    "start_index = text.find(start_marker)\n"
    "if start_index < 0:\n"
    "    raise RuntimeError('planner home travel connector start not found')\n"
    "end_index = text.find(end_marker, start_index)\n"
    "if end_index < 0:\n"
    "    raise RuntimeError('planner home travel connector end not found')\n"
    "end_index += len(end_marker)\n"
    "replacement = \"\"\"",
    source,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f'expected one connector matcher, replaced {count}')
old = "text = text[:match.start()] + replacement + text[match.end():]"
new = "text = text[:start_index] + replacement + text[end_index:]"
if old not in source:
    raise RuntimeError('connector replacement expression not found')
source = source.replace(old, new, 1)
source = source.replace(
    "const existingByPair = new Map(existing.filter((leg) => leg.trip_id === tripId).map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));",
    "const existingByPair = new Map<string, PlannerTripLeg>(existing.filter((leg) => leg.trip_id === tripId).map((leg) => [`${leg.from_place_id}→${leg.to_place_id}`, leg] as const));",
    1,
)
exec(compile(source, str(source_path), 'exec'), {'__name__': '__main__'})
