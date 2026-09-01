from pathlib import Path
import runpy

runpy.run_path('.github/scripts/release_preflight_patch.py', run_name='__main__')

# React state derives naturally from the active filter; no synchronous setState effect is needed.
planner_path = Path('src/components/planner/PlannerHome.tsx')
planner = planner_path.read_text()
selection_effect = """
  useEffect(() => {
    if (activeFilter !== 'dropped') return;
    setIsMultiSelectMode(false);
    setSelectedCandidateIds(new Set());
  }, [activeFilter]);
"""
if selection_effect not in planner:
    raise SystemExit('missing patch anchor: shelved selection effect')
planner_path.write_text(planner.replace(selection_effect, '', 1))

# Google can represent one place as Hex Feature ID or ChIJ. Only compare explicit
# Google source_place_id values indirectly through their normalized CID/Place-ID evidence.
identity_path = Path('src/domain/place-identity.ts')
identity = identity_path.read_text()
old = """  for (const l of left) {
    const comparable = right.filter((r) => r.provider === l.provider && r.kind === l.kind);
    if (comparable.length > 0 && comparable.every((r) => r.value !== l.value)) return true;
  }
"""
new = """  for (const l of left) {
    if (l.provider === 'google_maps' && l.kind === 'source_place_id') continue;
    const comparable = right.filter((r) => r.provider === l.provider && r.kind === l.kind);
    if (comparable.length > 0 && comparable.every((r) => r.value !== l.value)) return true;
  }
"""
if old not in identity:
    raise SystemExit('missing patch anchor: identity conflict loop')
identity_path.write_text(identity.replace(old, new, 1))
