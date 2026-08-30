from pathlib import Path

p = Path('src/extension/capture-state.ts')
s = p.read_text()
old = """function normalizePlaces(value: unknown): PlannerTripPlace[] {\n  if (!Array.isArray(value)) return [];\n  return value\n    .filter((item): item is PlannerTripPlace => Boolean(\n      item\n      && typeof item === 'object'\n      && typeof (item as PlannerTripPlace).id === 'string'\n      && typeof (item as PlannerTripPlace).trip_id === 'string'\n    ))\n    .map(asCaptureCandidate);\n}\n"""
new = """function normalizePlaces(value: unknown): PlannerTripPlace[] {\n  if (!Array.isArray(value)) return [];\n  return value\n    .filter((item): item is PlannerTripPlace => Boolean(\n      item\n      && typeof item === 'object'\n      && typeof (item as PlannerTripPlace).id === 'string'\n      && typeof (item as PlannerTripPlace).trip_id === 'string'\n    ))\n    .map((item) => {\n      const {\n        scheduled_date: _scheduledDate,\n        scheduled_start: _scheduledStart,\n        sort_order: _sortOrder,\n        locked: _locked,\n        is_anchor: _isAnchor,\n        anchor_type: _anchorType,\n        ...placeFacts\n      } = item as PlannerTripPlace & {\n        scheduled_date?: unknown;\n        scheduled_start?: unknown;\n        sort_order?: unknown;\n        locked?: unknown;\n        is_anchor?: unknown;\n        anchor_type?: unknown;\n      };\n      return asCaptureCandidate(placeFacts as PlannerTripPlace);\n    });\n}\n"""
if old not in s:
    raise SystemExit('normalizePlaces block not found')
p.write_text(s.replace(old, new))

# Avoid importing a symbol only to re-export it after the Visit authority split.
p = Path('src/domain/planner-visits.ts')
s = p.read_text()
s = s.replace(
    "import { sortPlannerScheduledPlaces, type PlannerScheduledPlace, type PlannerTripPlace, type PlannerVisitAnchorType } from './planner';",
    "import type { PlannerScheduledPlace, PlannerTripPlace, PlannerVisitAnchorType } from './planner';",
)
p.write_text(s)

print('Capture V2 strips occurrence-only keys from reusable Place facts')
