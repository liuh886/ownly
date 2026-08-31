from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch context not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = re.S) -> None:
    p = Path(path)
    text = p.read_text()
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {path}, found {count}: {pattern[:160]!r}")
    p.write_text(next_text)


# Keep list URL expansion here; Google Maps list/entity detail access is authoritative
# only inside the Maps content script so authuser/cookies/locale are consistent.
Path("src/extension/api.ts").write_text("""export interface ResolvedListRef {
  finalUrl: string;
  listId: string;
}

/**
 * Expands short links and extracts the list id without hitting Google Maps
 * entity/detail endpoints. Provider data access stays in the Maps content script.
 */
export async function expandAndExtractListId(rawUrl: string): Promise<ResolvedListRef | null> {
  let finalUrl = rawUrl;
  if (rawUrl.includes('maps.app.goo.gl') || rawUrl.includes('goo.gl/maps')) {
    try {
      const res = await fetch(rawUrl, { redirect: 'follow' });
      finalUrl = res.url;
    } catch (e) {
      console.warn('Short link expansion failed:', e);
      return null;
    }
  }
  const match = /!2s([A-Za-z0-9_-]{20,})|\\/placelists\\/list\\/([A-Za-z0-9_-]{20,})/.exec(finalUrl);
  const listId = match?.[1] || match?.[2];
  return listId ? { finalUrl, listId } : null;
}
""")

# Side-panel enrichment is now pure conversion/merge logic. Network/provider access
# is handled by the Google Maps content script only.
Path("src/extension/enrichment.ts").write_text("""import {
  mergeCapturedPlaceResearch,
  normalizeObservedPrice,
  type PlannerTripPlace,
} from '../domain/planner';
import type { CurrentResearchPlace } from './content';

export interface ResearchCoverage {
  total: number;
  rating: number;
  reviews: number;
  price: number;
  category: number;
  address: number;
  coordinates: number;
  openHours: number;
}

export function plannerPlaceToResearchPlace(place: PlannerTripPlace): CurrentResearchPlace {
  return {
    title: place.title,
    sourceUrl: place.source_url,
    sourceProvider: place.source_provider,
    rating: place.observed_rating,
    reviewCount: place.observed_review_count,
    category: place.source_category,
    priceLevel: place.observed_price,
    detectedCurrency: place.price_currency,
    address: place.address,
    openHours: place.open_hours,
    coordinates: place.coordinates,
    sourcePlaceId: place.source_place_id,
    phone: place.phone,
    plusCode: place.plus_code,
    menuUrl: place.menu_url,
    reservationUrl: place.reservation_url,
    reviewTopics: place.review_topics,
    types: place.types,
  };
}

function researchIdentity(place: CurrentResearchPlace): string {
  return place.sourcePlaceId ? `id:${place.sourcePlaceId}` : `url:${place.sourceUrl}`;
}

function plannerIdentity(place: PlannerTripPlace): string {
  return place.source_place_id ? `id:${place.source_place_id}` : `url:${place.source_url}`;
}

export function mergeResearchIntoPlannerPlace(
  existing: PlannerTripPlace,
  research: CurrentResearchPlace,
  fallbackCurrency?: string,
): PlannerTripPlace {
  const normalizedPrice = normalizeObservedPrice(
    research.priceLevel,
    research.detectedCurrency || fallbackCurrency || existing.price_currency,
  );
  const now = new Date().toISOString();
  return mergeCapturedPlaceResearch(existing, {
    ...existing,
    title: research.title || existing.title,
    source_provider: research.sourceProvider || existing.source_provider,
    source_url: research.sourceUrl || existing.source_url,
    source_place_id: research.sourcePlaceId ?? existing.source_place_id,
    source_category: research.category,
    observed_rating: research.rating,
    observed_review_count: research.reviewCount,
    observed_price: research.priceLevel,
    price_currency: normalizedPrice?.currency,
    price_min: normalizedPrice?.min,
    price_max: normalizedPrice?.max,
    price_unit: normalizedPrice?.unit,
    price_level: normalizedPrice?.level,
    observed_at: now.slice(0, 10),
    open_hours: research.openHours,
    address: research.address,
    coordinates: research.coordinates,
    phone: research.phone,
    plus_code: research.plusCode,
    menu_url: research.menuUrl,
    reservation_url: research.reservationUrl,
    review_topics: research.reviewTopics,
    types: research.types,
    updated_at: now,
  });
}

export function mergeEnrichedResearchPlaces(
  currentPlaces: PlannerTripPlace[],
  enrichedPlaces: CurrentResearchPlace[],
  fallbackCurrency?: string,
): PlannerTripPlace[] {
  const enrichedByIdentity = new Map(enrichedPlaces.map((place) => [researchIdentity(place), place] as const));
  return currentPlaces.map((place) => {
    const research = enrichedByIdentity.get(plannerIdentity(place));
    return research ? mergeResearchIntoPlannerPlace(place, research, fallbackCurrency) : place;
  });
}

export function summarizeResearchCoverage(places: PlannerTripPlace[]): ResearchCoverage {
  return {
    total: places.length,
    rating: places.filter((place) => place.observed_rating !== undefined).length,
    reviews: places.filter((place) => place.observed_review_count !== undefined).length,
    price: places.filter((place) => Boolean(place.observed_price)).length,
    category: places.filter((place) => Boolean(place.source_category)).length,
    address: places.filter((place) => Boolean(place.address)).length,
    coordinates: places.filter((place) => Boolean(place.coordinates)).length,
    openHours: places.filter((place) => Boolean(place.open_hours)).length,
  };
}
""")

Path("src/extension/enrichment.test.ts").write_text("""import { describe, expect, it } from 'vitest';
import type { PlannerTripPlace } from '../domain/planner';
import {
  mergeEnrichedResearchPlaces,
  plannerPlaceToResearchPlace,
  summarizeResearchCoverage,
} from './enrichment';
import type { CurrentResearchPlace } from './content';

function place(overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'place-1',
    trip_id: 'trip-1',
    title: 'Saved-list place',
    source_provider: 'google_maps',
    source_url: 'https://www.google.com/maps?cid=123',
    source_place_id: '0xabc:0x123',
    kind: 'other',
    priority: 'want',
    tags: ['my-tag'],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('saved-list enrichment merge', () => {
  it('sends only source facts to the Maps content-script request shape', () => {
    const research = plannerPlaceToResearchPlace(place({
      observed_rating: 4.7,
      observed_review_count: 1200,
      observed_price: '฿200–400',
      open_hours: 'Mon-Fri 10:00-18:00',
    }));
    expect(research.sourcePlaceId).toBe('0xabc:0x123');
    expect(research.rating).toBe(4.7);
    expect(research.reviewCount).toBe(1200);
    expect(research.priceLevel).toBe('฿200–400');
    expect(research.openHours).toContain('10:00');
  });

  it('merges enriched facts into the latest Planner place without touching Planner-owned decisions', () => {
    const current = place({
      kind: 'other',
      tags: ['manual'],
      notes: 'keep my note',
      priority: 'must',
    });
    const research: CurrentResearchPlace = {
      title: 'Saved-list place',
      sourceUrl: current.source_url,
      sourceProvider: 'google_maps',
      sourcePlaceId: current.source_place_id,
      rating: 4.8,
      reviewCount: 9876,
      category: 'Restaurant',
      priceLevel: '฿300–500',
      detectedCurrency: 'THB',
      address: 'Bangkok, Thailand',
      coordinates: { lat: 13.75, lng: 100.5 },
      openHours: 'Monday 10:00–22:00',
      phone: '+66 2 000 0000',
      types: ['restaurant'],
    };

    const [merged] = mergeEnrichedResearchPlaces([current], [research], 'THB');
    expect(merged.kind).toBe('other');
    expect(merged.tags).toEqual(['manual']);
    expect(merged.notes).toBe('keep my note');
    expect(merged.priority).toBe('must');
    expect(merged.observed_rating).toBe(4.8);
    expect(merged.observed_review_count).toBe(9876);
    expect(merged.observed_price).toBe('฿300–500');
    expect(merged.price_currency).toBe('THB');
    expect(merged.source_category).toBe('Restaurant');
    expect(merged.address).toBe('Bangkok, Thailand');
    expect(merged.coordinates).toEqual({ lat: 13.75, lng: 100.5 });
    expect(merged.open_hours).toContain('22:00');
    expect(merged.types).toContain('restaurant');
  });

  it('reports field coverage for the one-click strengthen result', () => {
    const coverage = summarizeResearchCoverage([
      place({ observed_rating: 4.5, observed_review_count: 100, address: 'A', coordinates: { lat: 1, lng: 2 } }),
      place({ id: 'place-2', source_place_id: '0xabc:0x456', observed_rating: 4.2, observed_price: '$$' }),
    ]);
    expect(coverage).toEqual({
      total: 2,
      rating: 2,
      reviews: 1,
      price: 1,
      category: 0,
      address: 1,
      coordinates: 1,
      openHours: 0,
    });
  });
});
""")

# Google Maps research parser: include structured opening hours when detail HTML exposes it.
replace_once(
    "src/extension/google-maps-research.ts",
    """  phone?: string;\n  website?: string;\n  types?: string[];\n""",
    """  phone?: string;\n  website?: string;\n  openHours?: string;\n  types?: string[];\n""",
)
replace_once(
    "src/extension/google-maps-research.ts",
    """function addressText(value: unknown): string | undefined {\n""",
    """function openingHoursText(value: unknown): string | undefined {\n  const values = Array.isArray(value) ? value : [value];\n  const parts = values\n    .filter((item): item is string => typeof item === 'string')\n    .map((item) => cleanExtractedText(item))\n    .filter(Boolean)\n    .slice(0, 14);\n  return parts.length > 0 ? parts.join('; ') : undefined;\n}\n\nfunction openingHoursSpecificationText(value: unknown): string | undefined {\n  const specs = Array.isArray(value) ? value : [value];\n  const rows: string[] = [];\n  for (const spec of specs) {\n    if (!spec || typeof spec !== 'object') continue;\n    const obj = spec as Record<string, unknown>;\n    const rawDays = Array.isArray(obj.dayOfWeek) ? obj.dayOfWeek : [obj.dayOfWeek];\n    const days = rawDays\n      .filter((item): item is string => typeof item === 'string')\n      .map((item) => cleanExtractedText(item.split('/').pop() || item))\n      .filter(Boolean);\n    const opens = typeof obj.opens === 'string' ? cleanExtractedText(obj.opens) : '';\n    const closes = typeof obj.closes === 'string' ? cleanExtractedText(obj.closes) : '';\n    if (days.length === 0 || !opens || !closes) continue;\n    rows.push(`${days.join(', ')} ${opens}–${closes}`);\n    if (rows.length >= 14) break;\n  }\n  return rows.length > 0 ? rows.join('; ') : undefined;\n}\n\nfunction addressText(value: unknown): string | undefined {\n""",
)
replace_once(
    "src/extension/google-maps-research.ts",
    """    if (!result.website && typeof obj.url === 'string' && /^https?:\\/\\//i.test(obj.url)) result.website = obj.url;\n\n    if (!result.coordinates && obj.geo && typeof obj.geo === 'object') {\n""",
    """    if (!result.website && typeof obj.url === 'string' && /^https?:\\/\\//i.test(obj.url)) result.website = obj.url;\n    if (!result.openHours) {\n      result.openHours = openingHoursText(obj.openingHours)\n        || openingHoursSpecificationText(obj.openingHoursSpecification);\n    }\n\n    if (!result.coordinates && obj.geo && typeof obj.geo === 'object') {\n""",
)

# Google Maps detail enrichment supports explicit force mode for the user-triggered
# one-click strengthen action and merges all provider facts we can reliably extract.
replace_once(
    "src/extension/content.ts",
    """async function enrichSavedListDetails(\n  list: DetectedSavedList,\n  overrideCurrency?: string,\n): Promise<{ list: DetectedSavedList; attempted: number; enriched: number; failed: number }> {\n""",
    """async function enrichSavedListDetails(\n  list: DetectedSavedList,\n  overrideCurrency?: string,\n  force = false,\n): Promise<{ list: DetectedSavedList; attempted: number; enriched: number; failed: number }> {\n""",
)
replace_once(
    "src/extension/content.ts",
    """      if (!place.sourcePlaceId) continue;\n      if (place.rating !== undefined && place.reviewCount !== undefined && place.category && place.priceLevel) continue;\n      attempted += 1;\n""",
    """      if (!place.sourcePlaceId) continue;\n      if (!force && place.rating !== undefined && place.reviewCount !== undefined && place.category && place.priceLevel && place.address && place.coordinates) continue;\n      attempted += 1;\n""",
)
replace_once(
    "src/extension/content.ts",
    """      const nextPrice = place.priceLevel ?? facts.priceLevel;\n      places[index] = {\n        ...place,\n        rating: place.rating ?? facts.rating,\n        reviewCount: place.reviewCount ?? facts.reviewCount,\n        category: place.category ?? facts.category,\n        priceLevel: nextPrice,\n        detectedCurrency: overrideCurrency\n          || facts.priceCurrency\n          || detectCurrencyFromPage(\n            place.sourceUrl,\n            nextPrice,\n            place.detectedCurrency ?? list.detectedCurrency,\n            undefined,\n          ),\n        address: place.address ?? facts.address,\n        website: place.website ?? facts.website,\n        phone: place.phone ?? facts.phone,\n        types: place.types?.length ? place.types : facts.types,\n      };\n      if (facts.rating !== undefined || facts.reviewCount !== undefined || facts.category || facts.priceLevel) enriched += 1;\n""",
    """      const nextPrice = place.priceLevel ?? facts.priceLevel;\n      const gainedFact = Boolean(\n        (place.rating === undefined && facts.rating !== undefined)\n        || (place.reviewCount === undefined && facts.reviewCount !== undefined)\n        || (!place.category && facts.category)\n        || (!place.priceLevel && facts.priceLevel)\n        || (!place.address && facts.address)\n        || (!place.coordinates && facts.coordinates)\n        || (!place.openHours && facts.openHours)\n        || (!place.website && facts.website)\n        || (!place.phone && facts.phone)\n        || ((!place.types || place.types.length === 0) && facts.types?.length)\n      );\n      places[index] = {\n        ...place,\n        rating: place.rating ?? facts.rating,\n        reviewCount: place.reviewCount ?? facts.reviewCount,\n        category: place.category ?? facts.category,\n        priceLevel: nextPrice,\n        detectedCurrency: overrideCurrency\n          || facts.priceCurrency\n          || detectCurrencyFromPage(\n            place.sourceUrl,\n            nextPrice,\n            place.detectedCurrency ?? list.detectedCurrency,\n            undefined,\n          ),\n        address: place.address ?? facts.address,\n        coordinates: place.coordinates ?? facts.coordinates,\n        openHours: place.openHours ?? facts.openHours,\n        website: place.website ?? facts.website,\n        phone: place.phone ?? facts.phone,\n        types: place.types?.length ? place.types : facts.types,\n      };\n      if (gainedFact) enriched += 1;\n""",
)
replace_once(
    "src/extension/content.ts",
    """      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string }).savedList;\n      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;\n""",
    """      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string; force?: boolean }).savedList;\n      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;\n      const force = Boolean((message as { force?: boolean }).force);\n""",
)
replace_once(
    "src/extension/content.ts",
    """      const result = await enrichSavedListDetails(incoming, overrideCurrency);\n""",
    """      const result = await enrichSavedListDetails(incoming, overrideCurrency, force);\n""",
)

# Side panel: one authoritative Google Maps tab/content-script path for list fetch
# and candidate enrichment. Remove legacy side-panel provider fetch.
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """import { expandAndExtractListId, resolveGoogleMapsListByUrl } from '../api';\n""",
    """import { expandAndExtractListId } from '../api';\n""",
)
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """import { enrichCandidatePlacesBatch } from '../enrichment';\n""",
    """import {\n  mergeEnrichedResearchPlaces,\n  plannerPlaceToResearchPlace,\n  summarizeResearchCoverage,\n  type ResearchCoverage,\n} from '../enrichment';\n""",
)
regex_once(
    "src/extension/sidepanel/handlers.ts",
    r"function mergeEnrichedPendingPlace\([\s\S]*?\n}\n\nlet searchDebounce",
    """function isGoogleMapsTabUrl(url = ''): boolean {\n  return /^https:\\/\\/(www\\.google\\.[a-z.]+|maps\\.google\\.[a-z.]+)\\/maps(?:\\/|$)/i.test(url);\n}\n\nasync function findGoogleMapsTab(): Promise<chrome.tabs.Tab | undefined> {\n  const tabs = await chrome.tabs.query({ currentWindow: true });\n  return tabs.find((tab) => tab.active && isGoogleMapsTabUrl(tab.url))\n    ?? tabs.find((tab) => isGoogleMapsTabUrl(tab.url));\n}\n\nfunction formatResearchCoverage(coverage: ResearchCoverage): string {\n  const { total } = coverage;\n  return store.lang === 'zh'\n    ? `评分 ${coverage.rating}/${total} · 评论 ${coverage.reviews}/${total} · 价格 ${coverage.price}/${total} · 分类 ${coverage.category}/${total} · 地址 ${coverage.address}/${total} · 坐标 ${coverage.coordinates}/${total} · 营业时间 ${coverage.openHours}/${total}`\n    : `rating ${coverage.rating}/${total} · reviews ${coverage.reviews}/${total} · price ${coverage.price}/${total} · category ${coverage.category}/${total} · address ${coverage.address}/${total} · coordinates ${coverage.coordinates}/${total} · hours ${coverage.openHours}/${total}`;\n}\n\nasync function enrichCandidatePlacesThroughMaps(\n  candidates: PlannerTripPlace[],\n  force: boolean,\n): Promise<{ attempted: number; enriched: number; failed: number; coverage: ResearchCoverage } | null> {\n  const eligible = candidates.filter((place) => place.source_provider === 'google_maps' && Boolean(place.source_place_id));\n  if (eligible.length === 0) return null;\n\n  const tab = await findGoogleMapsTab();\n  if (!tab?.id) throw new Error(t().enrichNeedsGoogleMaps);\n\n  const response = await chrome.tabs.sendMessage(tab.id, {\n    type: 'OWNLY_ENRICH_SAVED_LIST',\n    savedList: {\n      listName: 'Ownly candidates',\n      listUrl: tab.url || '',\n      detectedCurrency: store.pageDetectedCurrency,\n      places: eligible.map(plannerPlaceToResearchPlace),\n    } satisfies DetectedSavedList,\n    overrideCurrency: store.mapCurrencyOverride,\n    force,\n  }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;\n\n  const enrichedResearch = response?.savedList?.places ?? [];\n  const targetIds = new Set(eligible.map((place) => place.id));\n  const latestTargets = store.state.pendingPlaces.filter((place) => targetIds.has(place.id));\n  const mergedTargets = mergeEnrichedResearchPlaces(\n    latestTargets,\n    enrichedResearch,\n    store.mapCurrencyOverride || store.pageDetectedCurrency,\n  );\n  const mergedById = new Map(mergedTargets.map((place) => [place.id, place] as const));\n  store.state = {\n    ...store.state,\n    pendingPlaces: store.state.pendingPlaces.map((place) => mergedById.get(place.id) ?? place),\n  };\n  await saveState();\n\n  return {\n    attempted: response?.attempted ?? 0,\n    enriched: response?.enriched ?? 0,\n    failed: response?.failed ?? 0,\n    coverage: summarizeResearchCoverage(mergedTargets),\n  };\n}\n\nlet searchDebounce""",
)
regex_once(
    "src/extension/sidepanel/handlers.ts",
    r"/\*\*\n \* Bulk-paste list resolution[\s\S]*?\nasync function revealPlaceInMaps",
    """/**\n * Bulk-paste list resolution always uses the Google Maps content script so the\n * request shares the current authuser/cookie/locale context.\n */\nasync function resolveListPlacesSmart(\n  line: string,\n  activeTrip?: CaptureContext,\n): Promise<PlannerTripPlace[] | null> {\n  const ref = await expandAndExtractListId(line);\n  if (!ref) return null;\n\n  const tab = await findGoogleMapsTab();\n  if (!tab?.id) throw new Error(t().enrichNeedsGoogleMaps);\n  const resp = await chrome.tabs.sendMessage(tab.id, {\n    type: 'OWNLY_FETCH_LIST_BY_ID',\n    listUrl: ref.finalUrl,\n    listId: ref.listId,\n    overrideCurrency: store.mapCurrencyOverride,\n  }) as { savedList?: DetectedSavedList | null } | undefined;\n  const places = resp?.savedList?.places ?? [];\n  if (places.length === 0) return null;\n  const now = new Date().toISOString();\n  const tripTags = activeTrip?.tags ?? [];\n  return places.map((place) => buildPlaceFromDetected(place, activeTrip?.tripId || '', tripTags, now));\n}\n\nasync function revealPlaceInMaps""",
)

# Replace both user-triggered enrichment handlers with the authoritative Maps path.
regex_once(
    "src/extension/sidepanel/handlers.ts",
    r"  // One-click Enrich All candidates in active trip[\s\S]*?\n  el\.btnBackupState\.addEventListener",
    """  // One-click strengthen: re-fetch Google Maps detail facts for every eligible\n  // candidate in the active trip, then merge those facts into the latest state.\n  el.btnEnrichCandidates.addEventListener('click', () => {\n    void (async () => {\n      const dict = t();\n      const context = store.state.activeContext;\n      if (!context) {\n        setStatus(dict.tripRequiredError, 'error');\n        return;\n      }\n      const candidates = store.state.pendingPlaces.filter((place) => place.trip_id === context.tripId);\n      if (candidates.length === 0) {\n        setStatus(dict.emptyCandidates, 'muted');\n        return;\n      }\n\n      setStatus(dict.enrichingStart(candidates.length));\n      const result = await enrichCandidatePlacesThroughMaps(candidates, true);\n      if (!result) {\n        setStatus(dict.enrichNoResolvable, 'muted');\n        return;\n      }\n      const summary = `${dict.enrichComplete(result.enriched, result.attempted, result.failed)} · ${formatResearchCoverage(result.coverage)}`;\n      setStatus(summary, result.failed === result.attempted && result.attempted > 0 ? 'error' : 'success');\n    })().catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'));\n  });\n\n  el.btnBulkEnrich.addEventListener('click', () => {\n    void (async () => {\n      const dict = t();\n      if (store.bulkSelected.size === 0) return;\n      const selectedIds = new Set(store.bulkSelected);\n      const targetPlaces = store.state.pendingPlaces.filter((place) => selectedIds.has(place.id));\n      if (targetPlaces.length === 0) return;\n\n      setStatus(dict.enrichingStart(targetPlaces.length));\n      const result = await enrichCandidatePlacesThroughMaps(targetPlaces, true);\n      if (!result) {\n        setStatus(dict.enrichNoResolvable, 'muted');\n        return;\n      }\n      const summary = `${dict.enrichComplete(result.enriched, result.attempted, result.failed)} · ${formatResearchCoverage(result.coverage)}`;\n      setStatus(summary, result.failed === result.attempted && result.attempted > 0 ? 'error' : 'success');\n    })().catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'));\n  });\n\n  el.btnBackupState.addEventListener""",
)

# The smart-list all-in-one action should do a full detail pass before import.
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """            overrideCurrency: store.mapCurrencyOverride,\n          }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;\n""",
    """            overrideCurrency: store.mapCurrencyOverride,\n            force: true,\n          }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;\n""",
)

# Remove the old background side-panel fetch enrichment after bulk import. The user\n# now has one explicit, authoritative one-click strengthen action.
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """      const newlyAdded: PlannerTripPlace[] = [];\n""",
    """,
)
handlers = Path("src/extension/sidepanel/handlers.ts")
text = handlers.read_text().replace("                newlyAdded.push(item);\n", "").replace("        newlyAdded.push(place);\n", "")
handlers.write_text(text)
regex_once(
    "src/extension/sidepanel/handlers.ts",
    r"\n      // Asynchronously enrich newly imported places[\s\S]*?\n      }\n    \}\)\(\)\.catch\(\(error\) => setStatus\(String\(error\), 'error'\)\);",
    """\n    })().catch((error) => setStatus(String(error), 'error'));""",
)

# Product copy: make the existing action explicit and concrete rather than "smart".
for path in ["src/extension/i18n.ts"]:
    replace_once(path, "btnEnrichCandidates: '⚡ 补全信息',", "btnEnrichCandidates: '⚡ 一键补强',")
    replace_once(path, "btnBulkEnrichCandidates: '⚡ 补全',", "btnBulkEnrichCandidates: '⚡ 补强所选',")
    replace_once(path, "enrichingProgress: (current: number, total: number, title: string) => `⚡ 正在智能补全 (${current}/${total}): ${title}…`,", "enrichingProgress: (current: number, total: number, title: string) => `⚡ 正在补强 (${current}/${total}): ${title}…`,")
    replace_once(path, "enrichComplete: (count: number) => `✓ 智能补全完成，已富化 ${count} 个地点的详细信息与价格！`,", "enrichingStart: (count: number) => `⚡ 正在从 Google Maps 补强 ${count} 个候选地点的事实数据…`,\n    enrichComplete: (enriched: number, attempted: number, failed: number) => `✓ 一键补强完成：请求 ${attempted} 个，新增/补齐 ${enriched} 个，失败 ${failed} 个`,\n    enrichNeedsGoogleMaps: '请先打开一个 Google Maps 标签页；补强会复用当前 Maps 的登录、地区与货币上下文。',\n    enrichNoResolvable: '没有可批量补强的 Google Maps 候选地点（需要稳定的 Google Place ID）。',")
    replace_once(path, "enrichNoneNeeded: '所选候选地点已具备完整信息与价格。',", "enrichNoneNeeded: '没有发现需要补强的 Google Maps 候选地点。',")

    replace_once(path, "btnEnrichCandidates: '⚡ Enrich info',", "btnEnrichCandidates: '⚡ Strengthen all',")
    replace_once(path, "btnBulkEnrichCandidates: '⚡ Enrich',", "btnBulkEnrichCandidates: '⚡ Strengthen selected',")
    replace_once(path, "enrichingProgress: (current: number, total: number, title: string) => `⚡ Enriching (${current}/${total}): ${title}…`,", "enrichingProgress: (current: number, total: number, title: string) => `⚡ Strengthening (${current}/${total}): ${title}…`,")
    replace_once(path, "enrichComplete: (count: number) => `✓ Enrichment complete — enriched ${count} places with details and prices!`,", "enrichingStart: (count: number) => `⚡ Strengthening Google Maps facts for ${count} candidate places…`,\n    enrichComplete: (enriched: number, attempted: number, failed: number) => `✓ Strengthen complete: requested ${attempted}, added/refreshed ${enriched}, failed ${failed}`,\n    enrichNeedsGoogleMaps: 'Open a Google Maps tab first. Strengthen reuses the current Maps login, locale and currency context.',\n    enrichNoResolvable: 'No Google Maps candidates with a stable Place ID are available to strengthen.',")
    replace_once(path, "enrichNoneNeeded: 'Selected candidates already have complete info and prices.',", "enrichNoneNeeded: 'No Google Maps candidates need strengthening.',")

replace_once(
    "extension/sidepanel.html",
    """<button id="btnEnrichCandidates" class="link" type="button" title="智能补全信息与价格" style="font-size: 11px;">⚡ 补全信息</button>""",
    """<button id="btnEnrichCandidates" class="link" type="button" title="从 Google Maps 一键补强评分、评论、价格、分类、地址、坐标与营业时间" style="font-size: 11px;">⚡ 一键补强</button>""",
)
replace_once(
    "extension/sidepanel.html",
    """<button id="btnBulkEnrich" class="card-btn" type="button">⚡ 补全</button>""",
    """<button id="btnBulkEnrich" class="card-btn" type="button">⚡ 补强所选</button>""",
)
