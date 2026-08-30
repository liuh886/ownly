from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch context not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/domain/planner.ts",
    """    // Planner-owned decisions intentionally stay on the canonical record with non-destructive fallback:
    kind: (existing.kind && existing.kind !== 'other') ? existing.kind : (captured.kind || existing.kind),
    area: hasContent(existing.area) ? existing.area : (hasContent(captured.area) ? captured.area : undefined),
    priority: existing.priority ?? captured.priority,
    tags: (existing.tags && existing.tags.length > 0) ? existing.tags : (captured.tags ?? []),
    why: hasContent(existing.why) ? existing.why : (hasContent(captured.why) ? captured.why : undefined),
    signals: (existing.signals && existing.signals.length > 0) ? existing.signals : (captured.signals ?? []),
    risks: (existing.risks && existing.risks.length > 0) ? existing.risks : (captured.risks ?? []),
    notes: hasContent(existing.notes) ? existing.notes : (hasContent(captured.notes) ? captured.notes : undefined),
    preferred_window: hasContent(existing.preferred_window) ? existing.preferred_window : (hasContent(captured.preferred_window) ? captured.preferred_window : undefined),
    duration_minutes: (typeof existing.duration_minutes === 'number' && existing.duration_minutes > 0)
      ? existing.duration_minutes
      : captured.duration_minutes,
""",
    """    // Planner-owned decisions stay on the canonical record. Recapture never backfills them.
    kind: existing.kind,
    area: existing.area,
    priority: existing.priority,
    tags: existing.tags,
    why: existing.why,
    signals: existing.signals,
    risks: existing.risks,
    notes: existing.notes,
    preferred_window: existing.preferred_window,
    duration_minutes: existing.duration_minutes,
""",
)

replace_once(
    "src/extension/enrichment.ts",
    """import {
  inferPlaceKind,
  normalizeObservedPrice,
  type PlannerTripPlace,
} from '../domain/planner';
import {
  extractCleanPriceText,
  safeDecodeUri,
} from './utils';
""",
    """import {
  normalizeObservedPrice,
  type PlannerTripPlace,
} from '../domain/planner';
import { extractCleanPriceText } from './utils';
""",
)
replace_once(
    "src/extension/enrichment.ts",
    """  if (!isCandidateMissingData && place.kind !== 'other') {
    return { place, enriched: false };
  }
""",
    """  if (!isCandidateMissingData) {
    return { place, enriched: false };
  }
""",
)
replace_once(
    "src/extension/enrichment.ts",
    """    if (facts.types && facts.types.length > 0) {
      const existingTags = new Set(next.tags ?? []);
      for (const t of facts.types) existingTags.add(t);
      next.tags = [...existingTags];
      mutated = true;
    }
""",
    """    if (facts.types && facts.types.length > 0) {
      const existingTypes = next.types ?? [];
      const mergedTypes = [...new Set([...existingTypes, ...facts.types])];
      if (mergedTypes.length !== existingTypes.length) {
        next.types = mergedTypes;
        mutated = true;
      }
    }
""",
)
replace_once(
    "src/extension/enrichment.ts",
    """    // Category & Kind re-inference with rich context
    const combinedContext = [
      next.title,
      next.source_category,
      next.address,
      ...(facts.types ?? []),
    ].filter(Boolean).join(' ');
    const inferred = inferPlaceKind(safeDecodeUri(combinedContext));
    if (inferred && (next.kind === 'other' || !next.kind || (next.kind === 'food' && inferred === 'stay') || (next.kind === 'attraction' && inferred === 'food') || (next.kind === 'attraction' && inferred === 'stay'))) {
      next.kind = inferred;
      mutated = true;
    }

""",
    "",
)

replace_once(
    "src/extension/sidepanel/handlers.ts",
    """  inferSourceProvider,
  normalizeDelimitedText,
""",
    """  inferSourceProvider,
  mergeCapturedPlaceResearch,
  normalizeDelimitedText,
""",
)
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """function flashNewCandidate(placeId: string): void {
  el.candidatesDrawer.open = true;
  requestAnimationFrame(() => {
    const card = el.candidatesListContainer.querySelector<HTMLElement>(`.candidate-card[data-place-id=\"${placeId}\"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.classList.add('flash-new');
    window.setTimeout(() => card.classList.remove('flash-new'), 950);
  });
}

let searchDebounce: number | undefined;
""",
    """function flashNewCandidate(placeId: string): void {
  el.candidatesDrawer.open = true;
  requestAnimationFrame(() => {
    const card = el.candidatesListContainer.querySelector<HTMLElement>(`.candidate-card[data-place-id=\"${placeId}\"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.classList.add('flash-new');
    window.setTimeout(() => card.classList.remove('flash-new'), 950);
  });
}

function mergeEnrichedPendingPlace(
  current: PlannerTripPlace,
  enrichedById: ReadonlyMap<string, PlannerTripPlace>,
): PlannerTripPlace {
  const enriched = enrichedById.get(current.id);
  return enriched ? mergeCapturedPlaceResearch(current, enriched) : current;
}

let searchDebounce: number | undefined;
""",
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

replace_once(
    "src/domain/planner.test.ts",
    """    expect(merged.reservation_status).toBe('booked');
  });


  it('keeps structured facts when a later capture omits them (A2)', () => {
""",
    """    expect(merged.reservation_status).toBe('booked');
  });

  it('never backfills Planner-owned decisions from recapture, even when canonical values are empty/default', () => {
    const existing = place('authority', {
      kind: 'other',
      area: undefined,
      priority: 'want',
      tags: [],
      why: undefined,
      signals: [],
      risks: [],
      notes: undefined,
      preferred_window: undefined,
      duration_minutes: undefined,
    });
    const captured = place('authority', {
      kind: 'stay',
      area: 'Sukhumvit',
      priority: 'must',
      tags: ['hotel', 'luxury'],
      why: 'Pool and location',
      signals: ['high rating'],
      risks: ['traffic'],
      notes: 'Agent-generated note',
      preferred_window: 'night',
      duration_minutes: 720,
      observed_rating: 4.8,
    });

    const merged = mergeCapturedPlaceResearch(existing, captured);
    expect(merged.kind).toBe('other');
    expect(merged.area).toBeUndefined();
    expect(merged.priority).toBe('want');
    expect(merged.tags).toEqual([]);
    expect(merged.why).toBeUndefined();
    expect(merged.signals).toEqual([]);
    expect(merged.risks).toEqual([]);
    expect(merged.notes).toBeUndefined();
    expect(merged.preferred_window).toBeUndefined();
    expect(merged.duration_minutes).toBeUndefined();
    expect(merged.observed_rating).toBe(4.8);
  });


  it('keeps structured facts when a later capture omits them (A2)', () => {
""",
)
replace_once(
    "src/extension/enrichment.test.ts",
    """      expect(result.place.kind).toBe('food');
      expect(result.place.phone).toBe('+66 2 226 6666');
""",
    """      expect(result.place.kind).toBe('other');
      expect(result.place.tags).toEqual([]);
      expect(result.place.types).toContain('restaurant');
      expect(result.place.phone).toBe('+66 2 226 6666');
""",
)
replace_once(
    "src/extension/enrichment.test.ts",
    """      expect(enrichedPlaces[0].observed_review_count).toBe(996);
      expect(enrichedPlaces[0].kind).toBe('stay');
      expect(progressSpy).toHaveBeenCalledWith(1, 1, expect.any(Object));
""",
    """      expect(enrichedPlaces[0].observed_review_count).toBe(996);
      expect(enrichedPlaces[0].kind).toBe('other');
      expect(enrichedPlaces[0].types).toContain('lodgingbusiness');
      expect(progressSpy).toHaveBeenCalledWith(1, 1, expect.any(Object));
""",
)
