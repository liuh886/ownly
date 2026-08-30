from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch context not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Recapture may refresh source facts, but never backfill Planner-owned decisions.
replace_once(
    "src/domain/planner.ts",
    """    // Planner-owned decisions intentionally stay on the canonical record with non-destructive fallback:\n    kind: (existing.kind && existing.kind !== 'other') ? existing.kind : (captured.kind || existing.kind),\n    area: hasContent(existing.area) ? existing.area : (hasContent(captured.area) ? captured.area : undefined),\n    priority: existing.priority ?? captured.priority,\n    tags: (existing.tags && existing.tags.length > 0) ? existing.tags : (captured.tags ?? []),\n    why: hasContent(existing.why) ? existing.why : (hasContent(captured.why) ? captured.why : undefined),\n    signals: (existing.signals && existing.signals.length > 0) ? existing.signals : (captured.signals ?? []),\n    risks: (existing.risks && existing.risks.length > 0) ? existing.risks : (captured.risks ?? []),\n    notes: hasContent(existing.notes) ? existing.notes : (hasContent(captured.notes) ? captured.notes : undefined),\n    preferred_window: hasContent(existing.preferred_window) ? existing.preferred_window : (hasContent(captured.preferred_window) ? captured.preferred_window : undefined),\n    duration_minutes: (typeof existing.duration_minutes === 'number' && existing.duration_minutes > 0)\n      ? existing.duration_minutes\n      : captured.duration_minutes,\n""",
    """    // Planner-owned decisions stay on the canonical record. Recapture never backfills them.\n    kind: existing.kind,\n    area: existing.area,\n    priority: existing.priority,\n    tags: existing.tags,\n    why: existing.why,\n    signals: existing.signals,\n    risks: existing.risks,\n    notes: existing.notes,\n    preferred_window: existing.preferred_window,\n    duration_minutes: existing.duration_minutes,\n""",
)

# 2) Enrichment is facts-only: provider types belong in `types`, not Planner tags;
#    it never reclassifies a user-editable kind.
replace_once(
    "src/extension/enrichment.ts",
    """import {\n  inferPlaceKind,\n  normalizeObservedPrice,\n  type PlannerTripPlace,\n} from '../domain/planner';\nimport {\n  extractCleanPriceText,\n  safeDecodeUri,\n} from './utils';\n""",
    """import {\n  normalizeObservedPrice,\n  type PlannerTripPlace,\n} from '../domain/planner';\nimport { extractCleanPriceText } from './utils';\n""",
)
replace_once(
    "src/extension/enrichment.ts",
    """  if (!isCandidateMissingData && place.kind !== 'other') {\n    return { place, enriched: false };\n  }\n""",
    """  if (!isCandidateMissingData) {\n    return { place, enriched: false };\n  }\n""",
)
replace_once(
    "src/extension/enrichment.ts",
    """    if (facts.types && facts.types.length > 0) {\n      const existingTags = new Set(next.tags ?? []);\n      for (const t of facts.types) existingTags.add(t);\n      next.tags = [...existingTags];\n      mutated = true;\n    }\n""",
    """    if (facts.types && facts.types.length > 0) {\n      const existingTypes = next.types ?? [];\n      const mergedTypes = [...new Set([...existingTypes, ...facts.types])];\n      if (mergedTypes.length !== existingTypes.length) {\n        next.types = mergedTypes;\n        mutated = true;\n      }\n    }\n""",
)
replace_once(
    "src/extension/enrichment.ts",
    """    // Category & Kind re-inference with rich context\n    const combinedContext = [\n      next.title,\n      next.source_category,\n      next.address,\n      ...(facts.types ?? []),\n    ].filter(Boolean).join(' ');\n    const inferred = inferPlaceKind(safeDecodeUri(combinedContext));\n    if (inferred && (next.kind === 'other' || !next.kind || (next.kind === 'food' && inferred === 'stay') || (next.kind === 'attraction' && inferred === 'food') || (next.kind === 'attraction' && inferred === 'stay'))) {\n      next.kind = inferred;\n      mutated = true;\n    }\n\n""",
    """,
)

# 3) Async enrichment merges fresh facts into the latest pending record instead of
#    replacing it with the stale snapshot captured before the request started.
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """  inferSourceProvider,\n  normalizeDelimitedText,\n""",
    """  inferSourceProvider,\n  mergeCapturedPlaceResearch,\n  normalizeDelimitedText,\n""",
)
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """function flashNewCandidate(placeId: string): void {\n  el.candidatesDrawer.open = true;\n  requestAnimationFrame(() => {\n    const card = el.candidatesListContainer.querySelector<HTMLElement>(`.candidate-card[data-place-id=\"${placeId}\"]`);\n    if (!card) return;\n    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });\n    card.classList.add('flash-new');\n    window.setTimeout(() => card.classList.remove('flash-new'), 950);\n  });\n}\n\nlet searchDebounce: number | undefined;\n""",
    """function flashNewCandidate(placeId: string): void {\n  el.candidatesDrawer.open = true;\n  requestAnimationFrame(() => {\n    const card = el.candidatesListContainer.querySelector<HTMLElement>(`.candidate-card[data-place-id=\"${placeId}\"]`);\n    if (!card) return;\n    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });\n    card.classList.add('flash-new');\n    window.setTimeout(() => card.classList.remove('flash-new'), 950);\n  });\n}\n\nfunction mergeEnrichedPendingPlace(\n  current: PlannerTripPlace,\n  enrichedById: ReadonlyMap<string, PlannerTripPlace>,\n): PlannerTripPlace {\n  const enriched = enrichedById.get(current.id);\n  return enriched ? mergeCapturedPlaceResearch(current, enriched) : current;\n}\n\nlet searchDebounce: number | undefined;\n""",
)
handlers = Path("src/extension/sidepanel/handlers.ts")
text = handlers.read_text()
needle = "pendingPlaces: store.state.pendingPlaces.map((p) => enrichedMap.get(p.id) ?? p),"
count = text.count(needle)
if count != 3:
    raise SystemExit(f"Expected exactly 3 enrichment snapshot replacements, found {count}")
handlers.write_text(text.replace(
    needle,
    "pendingPlaces: store.state.pendingPlaces.map((p) => mergeEnrichedPendingPlace(p, enrichedMap)),",
))

# 4) Regression coverage for the authority boundary and facts-only enrichment.
replace_once(
    "src/domain/planner.test.ts",
    """    expect(merged.reservation_status).toBe('booked');\n  });\n\n\n  it('keeps structured facts when a later capture omits them (A2)', () => {\n""",
    """    expect(merged.reservation_status).toBe('booked');\n  });\n\n  it('never backfills Planner-owned decisions from recapture, even when canonical values are empty/default', () => {\n    const existing = place('authority', {\n      kind: 'other',\n      area: undefined,\n      priority: 'want',\n      tags: [],\n      why: undefined,\n      signals: [],\n      risks: [],\n      notes: undefined,\n      preferred_window: undefined,\n      duration_minutes: undefined,\n    });\n    const captured = place('authority', {\n      kind: 'stay',\n      area: 'Sukhumvit',\n      priority: 'must',\n      tags: ['hotel', 'luxury'],\n      why: 'Pool and location',\n      signals: ['high rating'],\n      risks: ['traffic'],\n      notes: 'Agent-generated note',\n      preferred_window: 'night',\n      duration_minutes: 720,\n      observed_rating: 4.8,\n    });\n\n    const merged = mergeCapturedPlaceResearch(existing, captured);\n    expect(merged.kind).toBe('other');\n    expect(merged.area).toBeUndefined();\n    expect(merged.priority).toBe('want');\n    expect(merged.tags).toEqual([]);\n    expect(merged.why).toBeUndefined();\n    expect(merged.signals).toEqual([]);\n    expect(merged.risks).toEqual([]);\n    expect(merged.notes).toBeUndefined();\n    expect(merged.preferred_window).toBeUndefined();\n    expect(merged.duration_minutes).toBeUndefined();\n    expect(merged.observed_rating).toBe(4.8);\n  });\n\n\n  it('keeps structured facts when a later capture omits them (A2)', () => {\n""",
)
replace_once(
    "src/extension/enrichment.test.ts",
    """      expect(result.place.kind).toBe('food');\n      expect(result.place.phone).toBe('+66 2 226 6666');\n""",
    """      expect(result.place.kind).toBe('other');\n      expect(result.place.tags).toEqual([]);\n      expect(result.place.types).toContain('restaurant');\n      expect(result.place.phone).toBe('+66 2 226 6666');\n""",
)
replace_once(
    "src/extension/enrichment.test.ts",
    """      expect(enrichedPlaces[0].observed_review_count).toBe(996);\n      expect(enrichedPlaces[0].kind).toBe('stay');\n      expect(progressSpy).toHaveBeenCalledWith(1, 1, expect.any(Object));\n""",
    """      expect(enrichedPlaces[0].observed_review_count).toBe(996);\n      expect(enrichedPlaces[0].kind).toBe('other');\n      expect(enrichedPlaces[0].types).toContain('lodgingbusiness');\n      expect(progressSpy).toHaveBeenCalledWith(1, 1, expect.any(Object));\n""",
)
