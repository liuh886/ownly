from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)


identity = '''export interface PlaceIdentityLike {
  source_provider?: string | null;
  source_place_id?: string | null;
  source_url?: string | null;
}

export type StrongPlaceIdentityKind = 'source_place_id' | 'google_cid' | 'google_place_id';

export interface StrongPlaceIdentityEvidence {
  provider: string;
  kind: StrongPlaceIdentityKind;
  value: string;
  key: string;
}

function inferProvider(place: PlaceIdentityLike): string {
  const explicit = place.source_provider?.trim().toLowerCase();
  if (explicit) return explicit;
  const url = place.source_url || '';
  if (/google\\.[a-z.]+\\/maps|maps\\.google\\./i.test(url)) return 'google_maps';
  return 'other';
}

function cidFromHexFeatureId(raw: string): string | null {
  const match = /:0x([0-9a-f]+)$/i.exec(raw.trim());
  if (!match?.[1]) return null;
  try {
    return BigInt(`0x${match[1]}`).toString();
  } catch {
    return null;
  }
}

function pushEvidence(
  result: StrongPlaceIdentityEvidence[],
  provider: string,
  kind: StrongPlaceIdentityKind,
  value: string | null | undefined,
): void {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return;
  const key = `${provider}:${kind}:${normalized}`;
  if (result.some((item) => item.key === key)) return;
  result.push({ provider, kind, value: normalized, key });
}

/**
 * Canonical authority for identities that are strong enough to auto-merge.
 * Titles, categories, coordinates and display URLs are deliberately excluded.
 */
export function getStrongPlaceIdentityEvidence(place: PlaceIdentityLike): StrongPlaceIdentityEvidence[] {
  const provider = inferProvider(place);
  const result: StrongPlaceIdentityEvidence[] = [];
  const sourceId = place.source_place_id?.trim();

  if (sourceId) {
    pushEvidence(result, provider, 'source_place_id', sourceId);
    if (provider === 'google_maps') {
      const cid = cidFromHexFeatureId(sourceId);
      if (cid) pushEvidence(result, provider, 'google_cid', cid);
      else if (/^\\d{8,}$/.test(sourceId)) pushEvidence(result, provider, 'google_cid', sourceId);
      else if (/^ChIJ[A-Za-z0-9_-]{8,}$/.test(sourceId)) pushEvidence(result, provider, 'google_place_id', sourceId);
    }
  }

  const rawUrl = place.source_url?.trim();
  if (rawUrl && provider === 'google_maps') {
    try {
      const url = new URL(rawUrl);
      const cid = url.searchParams.get('cid');
      if (cid && /^\\d+$/.test(cid)) pushEvidence(result, provider, 'google_cid', cid);
      const queryPlaceId = url.searchParams.get('query_place_id');
      if (queryPlaceId) pushEvidence(result, provider, 'google_place_id', queryPlaceId);
    } catch {
      // Non-URL strings do not become identity evidence.
    }

    const featureId = /0x[0-9a-f]+:0x[0-9a-f]+/i.exec(rawUrl)?.[0];
    if (featureId) {
      pushEvidence(result, provider, 'source_place_id', featureId);
      const cid = cidFromHexFeatureId(featureId);
      if (cid) pushEvidence(result, provider, 'google_cid', cid);
    }
  }

  return result;
}

export function getStrongPlaceIdentityKeys(place: PlaceIdentityLike): string[] {
  return getStrongPlaceIdentityEvidence(place).map((item) => item.key);
}

export function shareStrongPlaceIdentity(a: PlaceIdentityLike, b: PlaceIdentityLike): boolean {
  const left = new Set(getStrongPlaceIdentityKeys(a));
  return getStrongPlaceIdentityKeys(b).some((key) => left.has(key));
}

/**
 * Known-different provider identities suppress weak title/proximity duplicate guesses.
 * A conflict exists only when both sides expose the same comparable identity kind.
 */
export function haveConflictingStrongPlaceIdentity(a: PlaceIdentityLike, b: PlaceIdentityLike): boolean {
  if (shareStrongPlaceIdentity(a, b)) return false;
  const left = getStrongPlaceIdentityEvidence(a);
  const right = getStrongPlaceIdentityEvidence(b);
  for (const l of left) {
    const comparable = right.filter((r) => r.provider === l.provider && r.kind === l.kind);
    if (comparable.length > 0 && comparable.every((r) => r.value !== l.value)) return true;
  }
  return false;
}
'''
Path('src/domain/place-identity.ts').write_text(identity)

# PlannerRepository: automatic merge is strong-identity only.
repo_path = Path('src/services/PlannerRepository.ts')
repo = repo_path.read_text()
repo = replace_once(
    repo,
    "  mergeCapturedPlaceResearch,\n  normalizePlaceIdentity,\n",
    "  mergeCapturedPlaceResearch,\n",
    'remove normalizePlaceIdentity import',
)
repo = replace_once(
    repo,
    "} from '@/domain/planner';\n",
    "} from '@/domain/planner';\nimport { getStrongPlaceIdentityKeys, shareStrongPlaceIdentity } from '@/domain/place-identity';\n",
    'place identity import',
)
helper_start = repo.index('function extractPlaceCid(')
helper_end = repo.index('export class PlannerRepository', helper_start)
repo = repo[:helper_start] + repo[helper_end:]

old_maps = '''    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byPlaceId = new Map<string, PlannerTripPlace>();
    const byCid = new Map<string, PlannerTripPlace>();
    const byTitle = new Map<string, PlannerTripPlace>();
    const byUrlIdentity = new Map<string, PlannerTripPlace>();
    const byCoordinates = new Map<string, PlannerTripPlace>();

    const indexPlace = (place: PlannerTripPlace) => {
      byId.set(place.id, place);
      if (place.source_place_id) byPlaceId.set(`${place.trip_id}::${place.source_provider}::${place.source_place_id}`, place);
      const cid = extractPlaceCid(place);
      if (cid) byCid.set(`${place.trip_id}::${cid}`, place);
      const cleanTitle = canonicalizePlaceTitle(place.title);
      if (cleanTitle.length >= 2) byTitle.set(`${place.trip_id}::${cleanTitle}`, place);
      if (place.source_url) byUrlIdentity.set(`${place.trip_id}::${place.source_provider}::${normalizePlaceIdentity(place.source_url)}`, place);
      const geo = coordinateClusterKey(place);
      if (geo) byCoordinates.set(geo, place);
    };
'''
new_maps = '''    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byStrongIdentity = new Map<string, PlannerTripPlace>();

    const indexPlace = (place: PlannerTripPlace) => {
      byId.set(place.id, place);
      for (const key of getStrongPlaceIdentityKeys(place)) {
        byStrongIdentity.set(`${place.trip_id}::${key}`, place);
      }
    };
'''
repo = replace_once(repo, old_maps, new_maps, 'strong identity index')

repo = replace_once(
    repo,
    "      const incomingCid = extractPlaceCid(incoming);\n      const incomingTitle = isDistinctCanonicalTitle(incoming.title) ? canonicalizePlaceTitle(incoming.title) : '';\n\n      const existingPlace = byId.get(incoming.id)\n        ?? (incoming.source_place_id ? byPlaceId.get(`${incoming.trip_id}::${incoming.source_provider}::${incoming.source_place_id}`) : undefined)\n        ?? (incomingCid ? byCid.get(`${incoming.trip_id}::${incomingCid}`) : undefined)\n        ?? (incomingTitle ? byTitle.get(`${incoming.trip_id}::${incomingTitle}`) : undefined)\n        ?? (incoming.source_url ? byUrlIdentity.get(`${incoming.trip_id}::${incoming.source_provider}::${normalizePlaceIdentity(incoming.source_url)}`) : undefined);\n",
    "      let existingPlace = byId.get(incoming.id);\n      if (!existingPlace) {\n        for (const key of getStrongPlaceIdentityKeys(incoming)) {\n          const match = byStrongIdentity.get(`${incoming.trip_id}::${key}`);\n          if (match) {\n            existingPlace = match;\n            break;\n          }\n        }\n      }\n",
    'import strong identity match',
)
repo = replace_once(
    repo,
    "   * Scans all places in a trip, identifies duplicate entities (by Place ID, CID, distinct canonical title, or URL Identity),\n",
    "   * Scans all places in a trip and auto-merges only proven strong identities.\n",
    'dedup documentation',
)
repo = replace_once(repo, "      const cid1 = extractPlaceCid(p1);\n      const title1 = isDistinctCanonicalTitle(p1.title) ? canonicalizePlaceTitle(p1.title) : '';\n\n", "", 'dedup first weak identities')
repo = replace_once(repo, "        const cid2 = extractPlaceCid(p2);\n        const title2 = isDistinctCanonicalTitle(p2.title) ? canonicalizePlaceTitle(p2.title) : '';\n\n", "", 'dedup second weak identities')
old_match = '''        const isMatch = (p1.source_place_id && p1.source_place_id === p2.source_place_id)
          || (cid1 && cid2 && cid1 === cid2)
          || (title1 && title2 && title1 === title2)
          || (p1.source_url && p2.source_url && normalizePlaceIdentity(p1.source_url) === normalizePlaceIdentity(p2.source_url));
'''
repo = replace_once(repo, old_match, "        const isMatch = shareStrongPlaceIdentity(p1, p2);\n", 'dedup strong identity match')
repo = replace_once(
    repo,
    "    if (!primary || !secondary) {\n      throw new Error(`Cannot merge: place not found (primary: ${primaryPlaceId}, secondary: ${secondaryPlaceId})`);\n    }\n\n    const merged = mergeCapturedPlaceResearch(primary, secondary);\n",
    "    if (!primary || !secondary) {\n      throw new Error(`Cannot merge: place not found (primary: ${primaryPlaceId}, secondary: ${secondaryPlaceId})`);\n    }\n    if (primary.trip_id !== secondary.trip_id) {\n      throw new Error('Cannot merge places from different trips.');\n    }\n\n    const merged = mergeCapturedPlaceResearch(primary, secondary);\n",
    'manual merge trip boundary',
)
repo, count = re.subn(
    r"\n  /\*\*\n   \* Batch merges all suspected duplicate pairs in a trip\.\n   \*/\n  async mergeAllSuspectedDuplicates\(tripId: string\): Promise<\{ mergedCount: number \}> \{.*?\n  \}\n\n  async addVisit\(",
    "\n  async addVisit(",
    repo,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('missing patch anchor: mergeAllSuspectedDuplicates')
repo_path.write_text(repo)

# Suspected duplicates: weak evidence remains review-only and cannot override known-distinct IDs.
domain_path = Path('src/domain/planner.ts')
domain = domain_path.read_text()
identity_import = "import { haveConflictingStrongPlaceIdentity, shareStrongPlaceIdentity } from './place-identity';"
if identity_import not in domain:
    domain = identity_import + "\n\n" + domain
domain = replace_once(domain, "    const cid1 = extractPlaceCid(p1);\n", "", 'suspected cid1')
domain = replace_once(
    domain,
    "      const cid2 = extractPlaceCid(p2);\n\n      let reason = '';\n",
    "      if (haveConflictingStrongPlaceIdentity(p1, p2)) continue;\n\n      let reason = '';\n",
    'suspected conflict gate',
)
domain = replace_once(
    domain,
    "      if ((p1.source_place_id && p1.source_place_id === p2.source_place_id) || (cid1 && cid2 && cid1 === cid2)) {\n",
    "      if (shareStrongPlaceIdentity(p1, p2)) {\n",
    'suspected strong identity source',
)
domain_path.write_text(domain)

# Planner UI: preserve shelved places as first-class pool state and compact card actions.
planner_path = Path('src/components/planner/PlannerHome.tsx')
planner = planner_path.read_text()
planner = replace_once(planner, "\n  const [isDroppedCollapsed, setIsDroppedCollapsed] = useState(true);\n", "\n", 'remove dropped collapsible state')
old_trip_places = '''  const tripPlaces = useMemo(
    () => places.filter((place) => place.trip_id === selectedTripId && place.state !== 'dropped'),
    [places, selectedTripId],
  );
'''
new_trip_places = '''  // Preserve the complete trip set so shelving changes planning state without making data disappear.
  const tripAllPlaces = useMemo(
    () => places.filter((place) => place.trip_id === selectedTripId),
    [places, selectedTripId],
  );
  const tripPlaces = useMemo(
    () => tripAllPlaces.filter((place) => place.state !== 'dropped'),
    [tripAllPlaces],
  );
'''
planner = replace_once(planner, old_trip_places, new_trip_places, 'complete trip place projection')
old_dropped = '''  const droppedPlaces = useMemo(
    () => [...tripPlaces]
      .filter((place) => place.state === 'dropped')
      .map((place) => ({
        ...place,
        tags: ensurePlaceKindTag(place.tags, place.kind, language),
      })),
    [tripPlaces, language],
  );
'''
new_dropped = '''  const droppedPlaces = useMemo(
    () => [...tripAllPlaces]
      .filter((place) => place.state === 'dropped')
      .map((place) => ({
        ...place,
        tags: ensurePlaceKindTag(place.tags, place.kind, language),
      })),
    [tripAllPlaces, language],
  );
'''
planner = replace_once(planner, old_dropped, new_dropped, 'shelved source projection')
want_anchor = "    const wantCount = pendingCandidates.filter((p) => p.priority === 'want').length;\n    if (wantCount > 0) chips.push({ id: 'want', label: zh ? '想去' : 'Want', count: wantCount, type: 'priority' });\n\n"
planner = replace_once(
    planner,
    want_anchor,
    want_anchor + "    if (droppedPlaces.length > 0) chips.push({ id: 'dropped', label: zh ? '🙈 暂不考虑' : '🙈 Shelved', count: droppedPlaces.length, type: 'status' });\n\n",
    'shelved chip',
)
planner = replace_once(
    planner,
    "  }, [pendingCandidates, zh, language, tripTags, visitCountByPlaceId]);\n",
    "  }, [pendingCandidates, droppedPlaces, zh, language, tripTags, visitCountByPlaceId]);\n",
    'shelved chip dependency',
)
old_sorted = '''  const sortedPendingCandidates = useMemo(() => {
    const filtered = filterAndSearchPlaces(pendingCandidates, activeFilter, poolSearch, visitCountByPlaceId);
    return sortPlaceList(filtered, candidateSortMode, candidateDistances, lastStopCoords);
  }, [pendingCandidates, activeFilter, poolSearch, candidateSortMode, candidateDistances, lastStopCoords, visitCountByPlaceId]);

  const sortedDroppedPlaces = useMemo(() => {
    const filtered = filterAndSearchPlaces(droppedPlaces, activeFilter, poolSearch);
    return sortPlaceList(filtered, candidateSortMode, candidateDistances, lastStopCoords);
  }, [droppedPlaces, activeFilter, poolSearch, candidateSortMode, candidateDistances, lastStopCoords]);
'''
new_sorted = '''  const sortedPendingCandidates = useMemo(() => {
    const poolSource = activeFilter === 'dropped' ? droppedPlaces : pendingCandidates;
    const filtered = filterAndSearchPlaces(poolSource, activeFilter, poolSearch, visitCountByPlaceId);
    return sortPlaceList(filtered, candidateSortMode, candidateDistances, lastStopCoords);
  }, [pendingCandidates, droppedPlaces, activeFilter, poolSearch, candidateSortMode, candidateDistances, lastStopCoords, visitCountByPlaceId]);
'''
planner = replace_once(planner, old_sorted, new_sorted, 'unified shelved pool projection')
planner = replace_once(
    planner,
    "                {sortedPendingCandidates.length}/{pendingCandidates.length}\n",
    "                {sortedPendingCandidates.length}/{activeFilter === 'dropped' ? droppedPlaces.length : pendingCandidates.length}\n",
    'pool denominator',
)
state_anchor = "  const [poolSearch, setPoolSearch] = useState('');\n"
planner = replace_once(
    planner,
    state_anchor,
    state_anchor + "\n  useEffect(() => {\n    if (activeFilter !== 'dropped') return;\n    setIsMultiSelectMode(false);\n    setSelectedCandidateIds(new Set());\n  }, [activeFilter]);\n",
    'shelved selection guard',
)
old_header_actions = '''                          {!isMultiSelectMode ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void schedulePlace(place.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-900 text-xs font-bold text-white hover:bg-stone-800 transition shadow-2xs"
                                title={zh ? '直接排入当天日程' : 'Schedule to active day'}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDropPlace(place.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-xs text-stone-400 hover:text-stone-700 hover:border-stone-300 transition shadow-2xs"
                                title={zh ? '设为暂不考虑，可随时在下方折叠区中重新考虑' : 'Shelve this place, recoverable anytime below'}
                              >
                                🙈
                              </button>
                            </div>
                          ) : null}
'''
planner = replace_once(planner, old_header_actions, "", 'candidate header actions')
planner = planner.replace("draggable={!isMultiSelectMode}", "draggable={!isMultiSelectMode && place.state !== 'dropped'}", 1)
planner = planner.replace("if (isMultiSelectMode) return;\n                        event.dataTransfer.setData('text/plain', place.id);", "if (isMultiSelectMode || place.state === 'dropped') return;\n                        event.dataTransfer.setData('text/plain', place.id);", 1)
planner = planner.replace("📞 {place.phone}", "📞")
old_delete = '''                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeletePlace(place.id, place.title);
                          }}
                          className="flex h-5.5 w-5.5 items-center justify-center text-xs text-stone-300 hover:text-rose-600 hover:bg-rose-50 rounded transition shrink-0"
                          title={zh ? '彻底从行程中删除此地点' : 'Delete place permanently'}
                        >
                          🗑️
                        </button>
'''
new_actions = '''                        <div className="flex items-center gap-1 shrink-0">
                          {place.state === 'dropped' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRestorePlace(place.id);
                              }}
                              className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition"
                              title={zh ? '取回到候选池' : 'Restore to candidate pool'}
                            >
                              ↩️ {zh ? '取回' : 'Restore'}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void schedulePlace(place.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-900 text-xs font-bold text-white hover:bg-stone-800 transition shadow-2xs"
                                title={zh ? '直接排入当天日程' : 'Schedule to active day'}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDropPlace(place.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-xs text-stone-400 hover:text-stone-700 hover:border-stone-300 transition shadow-2xs"
                                title={zh ? '暂不考虑' : 'Shelve'}
                              >
                                🙈
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeletePlace(place.id, place.title);
                            }}
                            className="flex h-6 w-6 items-center justify-center text-xs text-stone-300 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title={zh ? '彻底从行程中删除此地点' : 'Delete place permanently'}
                          >
                            🗑️
                          </button>
                        </div>
'''
planner = replace_once(planner, old_delete, new_actions, 'candidate footer actions')
start_marker = "            {/* Layer 3: 暂不考虑 Collapsible Section */}"
end_marker = "            ) : null}\n          </>"
start = planner.find(start_marker)
if start < 0:
    raise SystemExit('missing patch anchor: shelved layer start')
end = planner.find(end_marker, start)
if end < 0:
    raise SystemExit('missing patch anchor: shelved layer end')
planner = planner[:start] + planner[end + len("            ) : null}\n"):]
planner, handler_count = re.subn(
    r"\n  const handleMergeAllSuspectedPairs = useCallback\(async \(\) => \{.*?\n  \}, \[disabled, load, selectedTripId, zh\]\);\n",
    "\n",
    planner,
    count=1,
    flags=re.S,
)
if handler_count != 1:
    raise SystemExit('missing patch anchor: suspected merge-all handler')
planner, button_count = re.subn(
    r"\s*<button\b(?:(?!</button>).)*handleMergeAllSuspectedPairs(?:(?!</button>).)*</button>\s*",
    "\n",
    planner,
    count=1,
    flags=re.S,
)
if button_count != 1:
    raise SystemExit('missing patch anchor: suspected merge-all button')
planner_path.write_text(planner)

# Regression: same title without strong identity remains two entities.
schedule_test_path = Path('src/services/PlannerRepository.schedule.test.ts')
schedule_test = schedule_test_path.read_text()
schedule_test = replace_once(
    schedule_test,
    "  it('deduplicates places by Place ID, CID, and emoji/canonical title', async () => {",
    "  it('does not auto-merge title-only matches without a strong identity', async () => {",
    'title-only test name',
)
old_assert = '''    const placesAfter = (await plannerRepository.listPlaces()).filter((p) => p.trip_id === 'trip-1');
    // Should NOT create duplicate, should merge into single authoritative place
    const thipPlaces = placesAfter.filter((p) => p.title.includes('Thipsamai'));
    expect(thipPlaces).toHaveLength(1);
    expect(thipPlaces[0].source_place_id).toBe('0x30e2991678584ec5:0x698c069655046fbe');
    expect(thipPlaces[0].observed_rating).toBe(4.2);
    expect(thipPlaces[0].notes).toBe('Initial note');
'''
new_assert = '''    const placesAfter = (await plannerRepository.listPlaces()).filter((p) => p.trip_id === 'trip-1');
    // Same display title is weak evidence only; both entities survive until review or a strong ID match.
    const thipPlaces = placesAfter.filter((p) => p.title.includes('Thipsamai'));
    expect(thipPlaces).toHaveLength(2);
    expect(thipPlaces.find((p) => p.id === 'p-thip-1')?.notes).toBe('Initial note');
    expect(thipPlaces.find((p) => p.id === 'p-thip-new')?.source_place_id).toBe('0x30e2991678584ec5:0x698c069655046fbe');
    expect(thipPlaces.find((p) => p.id === 'p-thip-new')?.observed_rating).toBe(4.2);
'''
schedule_test = replace_once(schedule_test, old_assert, new_assert, 'title-only assertions')
schedule_test_path.write_text(schedule_test)

identity_test = '''import { describe, expect, it } from 'vitest';
import {
  getStrongPlaceIdentityKeys,
  haveConflictingStrongPlaceIdentity,
  shareStrongPlaceIdentity,
} from './place-identity';

describe('place identity authority', () => {
  it('matches a Google hex feature id to its decimal CID', () => {
    const a = { source_provider: 'google_maps', source_place_id: '0x30e2991678584ec5:0x698c069655046fbe' };
    const b = { source_provider: 'google_maps', source_url: 'https://www.google.com/maps?cid=7605461113463140286' };
    expect(shareStrongPlaceIdentity(a, b)).toBe(true);
    expect(getStrongPlaceIdentityKeys(a).some((key) => key.includes('google_cid'))).toBe(true);
  });

  it('treats different explicit Place IDs as known-distinct', () => {
    const a = { source_provider: 'google_maps', source_place_id: 'ChIJA11111111111' };
    const b = { source_provider: 'google_maps', source_place_id: 'ChIJB22222222222' };
    expect(shareStrongPlaceIdentity(a, b)).toBe(false);
    expect(haveConflictingStrongPlaceIdentity(a, b)).toBe(true);
  });

  it('does not manufacture identity from title-only URLs', () => {
    expect(getStrongPlaceIdentityKeys({ source_provider: 'google_maps', source_url: 'https://www.google.com/maps/search/?api=1&query=Airport' })).toEqual([]);
  });
});
'''
Path('src/domain/place-identity.test.ts').write_text(identity_test)

release_plan = '''# Ownly Release Readiness — Final Functional Completion Plan

## Release principle

This release is a completion pass, not a feature expansion. Scope is limited to making the existing Capture → Planner → Timeline → Maps/exports loop trustworthy, understandable, responsive, and testable. AI planning expansion, collaboration, booking, additional providers, and new product surfaces are deferred until after release.

## P0 — Data integrity and identity authority

- [x] Establish one strong Place Identity Authority.
- [x] Remove title-based automatic import merge and title-based automatic deduplication.
- [x] Keep title/phone/proximity similarity as review evidence only.
- [x] Suppress weak duplicate suggestions when explicit comparable Place IDs conflict.
- [x] Remove bulk auto-merge of suspected duplicates; keep per-pair Merge / Ignore review.
- [x] Keep shelved places visible and recoverable instead of silently disappearing.
- [ ] Add sync reconciliation: captured records, created places, updated places, strong-ID merges, rejected records.
- [ ] Show a visible warning when Capture acknowledgement differs from Planner reconciliation.
- [ ] Add golden fixtures for airport, hotel branch, restaurant branch, same-title/different-ID, same-CID/different-title.

## P0 — Capture reliability

- [ ] Verify single-place capture and saved-list capture produce the same canonical fields.
- [ ] Keep identity provenance in diagnostics, never normal cards.
- [ ] Confirm enrichment never promotes title, free-form notes, or arbitrary payload strings into objective price/identity facts.
- [ ] Treat optional Google facts as optional, not perpetual incomplete state.
- [ ] Exercise retry/offline/session-expiry behavior without losing pending captures.
- [ ] Run extension fixtures across Bangkok/Chiang Mai hotels, food, cafes, attractions, transit/airports.

## P0 — Planner state model and core interactions

- [x] Candidate pool retains scheduled places and marks visit count.
- [x] Shelved places sit beside Must/Want as a first-class filter and support Restore.
- [x] Schedule / Shelve / Delete share one compact card footer; phone is icon-only with tooltip.
- [ ] Verify Candidate → Scheduled → Shelved restrictions and error messages for every state transition.
- [ ] Verify repeated visits on same day and across days never duplicate or consume the Place entity.
- [ ] Verify delete/drop cannot orphan visits, legs, hotel spans, or exports.
- [ ] Audit all empty states, counts, filter counts, search results, and notices against repository state.

## P1 — Planner UI completion and mobile interaction

- [ ] Test 360/390/430 px widths: no clipped titles, action overflow, horizontal scroll, or unreachable controls.
- [ ] Ensure card tap, drag, buttons, links, and multi-select do not conflict on touch devices.
- [ ] Normalize tooltips/accessibility labels for phone, map, menu, reserve, schedule, shelve, restore, delete.
- [ ] Keep source category, user tags, signals, risks, rating, and price distinct and non-redundant.
- [ ] Verify map highlight ↔ card highlight ↔ timeline selection after filters and state changes.
- [ ] Verify modal focus/close behavior for Import, Timing, Hotel Compare, Calendar, Create Trip, Duplicate Review.

## P1 — Timeline, routing, hotel and schedule correctness

- [ ] Verify visit ordering, insert/remove/reorder, locked visits, timing edits, repeated occurrences.
- [ ] Verify opening-hours warnings and travel conflicts do not block valid schedules with missing optional facts.
- [ ] Verify hotel stay spans, transfer days, and hotel replacement leave no stale visits.
- [ ] Verify map projection deduplicates repeated visits while timeline keeps every occurrence.
- [ ] Verify route links/segmentation for walking, transit, and driving.

## P1 — Export, local-first persistence and parity

- [ ] Round-trip Trip / Place / Visit / Leg / Expense Markdown without field loss.
- [ ] Verify CSV, KML, Markdown, ICS exports with multilingual text and formula-safe CSV cells.
- [ ] Verify web local storage, Obsidian, extension, CLI/MCP share canonical data semantics.
- [ ] Verify backup/restore and reload preserve trips, shelved state, visits, expenses, and pending capture queue.

## Release gates

Release only when all are green:

1. `npm run validate:fast`
2. `npm run validate:shared`
3. `npm run validate:web`
4. `npm run validate:obsidian`
5. `npm run validate:extension`
6. Thailand golden path plus Place Identity regression fixtures
7. Manual desktop + mobile golden path: Capture mixed POIs → reconcile sync → filter/shelve/restore → repeated schedule → route/map → export → reload
8. No silent record loss, no title-based auto-merge, no unresolved P0 issue

## Explicitly deferred until after release

- AI proposal/planner expansion
- Collaboration/shared editing
- Booking/payment integrations
- Additional map/review providers
- New recommendation/discovery surfaces
- Major Planner information-architecture redesign
'''
Path('docs/RELEASE_READINESS.md').write_text(release_plan)
