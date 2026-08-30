from pathlib import Path

# Keep Capture sanitation explicit without introducing unused destructuring bindings.
p = Path('src/extension/capture-state.ts')
s = p.read_text()
old = """    .map((item) => {\n      const {\n        scheduled_date: _scheduledDate,\n        scheduled_start: _scheduledStart,\n        sort_order: _sortOrder,\n        locked: _locked,\n        is_anchor: _isAnchor,\n        anchor_type: _anchorType,\n        ...placeFacts\n      } = item as PlannerTripPlace & {\n        scheduled_date?: unknown;\n        scheduled_start?: unknown;\n        sort_order?: unknown;\n        locked?: unknown;\n        is_anchor?: unknown;\n        anchor_type?: unknown;\n      };\n      return asCaptureCandidate(placeFacts as PlannerTripPlace);\n    });\n"""
new = """    .map((item) => {\n      const placeFacts = { ...item } as PlannerTripPlace & Record<string, unknown>;\n      for (const key of ['scheduled_date', 'scheduled_start', 'sort_order', 'locked', 'is_anchor', 'anchor_type']) {\n        delete placeFacts[key];\n      }\n      return asCaptureCandidate(placeFacts);\n    });\n"""
if old not in s:
    raise SystemExit('Capture sanitation block not found')
p.write_text(s.replace(old, new))

# The new contract is absence, not compatibility fields with undefined values.
p = Path('src/extension/capture-state.test.ts')
s = p.read_text()
old = """    expect(state.activeContext).toMatchObject({ tripId: 'trip-1', currency: 'JPY' });\n    expect(state.pendingPlaces[0]).toMatchObject({ state: 'candidate', scheduled_date: undefined, locked: undefined });\n"""
new = """    expect(state.activeContext).toMatchObject({ tripId: 'trip-1', currency: 'JPY' });\n    expect(state.pendingPlaces[0]).toMatchObject({ state: 'candidate' });\n    for (const key of ['scheduled_date', 'scheduled_start', 'sort_order', 'locked', 'is_anchor', 'anchor_type']) {\n      expect(state.pendingPlaces[0]).not.toHaveProperty(key);\n    }\n"""
if old not in s:
    raise SystemExit('obsolete Capture assertion not found')
p.write_text(s.replace(old, new))

print('Capture V2 test now enforces complete removal of occurrence-only keys')
