from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch context not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


def insert_before(path: str, marker: str, addition: str) -> None:
    p = Path(path)
    text = p.read_text()
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit(f"Insert marker not found in {path}: {marker!r}")
    p.write_text(text[:idx] + addition + text[idx:])


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    start_idx = text.find(start)
    if start_idx < 0:
        raise SystemExit(f"Start marker not found in {path}: {start!r}")
    end_idx = text.find(end, start_idx)
    if end_idx < 0:
        raise SystemExit(f"End marker not found in {path}: {end!r}")
    p.write_text(text[:start_idx] + replacement + text[end_idx:])


# 1) Keep the existing generic enrichment utility for pasted/free-form places, but
# add a pure merge helper for Google Maps content-script detail results. This keeps
# provider network access in the Maps tab while preserving the facts-only boundary.
replace_once(
    "src/extension/enrichment.ts",
    """import {
  normalizeObservedPrice,
  type PlannerTripPlace,
} from '../domain/planner';
""",
    """import {
  mergeCapturedPlaceResearch,
  normalizeObservedPrice,
  type PlannerTripPlace,
} from '../domain/planner';
import type { CurrentResearchPlace } from './content';
""",
)
insert_before(
    "src/extension/enrichment.ts",
    "\n/**\n * Enriches a list of candidate places concurrently",
    """
function researchIdentity(place: CurrentResearchPlace): string {
  return place.sourcePlaceId ? `id:${place.sourcePlaceId}` : `url:${place.sourceUrl}`;
}

function plannerIdentity(place: PlannerTripPlace): string {
  return place.source_place_id ? `id:${place.source_place_id}` : `url:${place.source_url}`;
}

/**
 * Merges Google Maps content-script research into the latest Planner candidates.
 * mergeCapturedPlaceResearch keeps Planner-owned decisions authoritative.
 */
export function mergeDetectedResearchIntoPlannerPlaces(
  currentPlaces: PlannerTripPlace[],
  researchPlaces: CurrentResearchPlace[],
  fallbackCurrency?: string,
): PlannerTripPlace[] {
  const researchByIdentity = new Map(researchPlaces.map((place) => [researchIdentity(place), place] as const));
  return currentPlaces.map((existing) => {
    const research = researchByIdentity.get(plannerIdentity(existing));
    if (!research) return existing;

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
  });
}
""",
)

replace_once(
    "src/extension/enrichment.test.ts",
    """import { enrichPlaceMetadata, enrichCandidatePlacesBatch } from './enrichment';
import type { PlannerTripPlace } from '../domain/planner';
""",
    """import { enrichPlaceMetadata, enrichCandidatePlacesBatch, mergeDetectedResearchIntoPlannerPlaces } from './enrichment';
import type { PlannerTripPlace } from '../domain/planner';
import type { CurrentResearchPlace } from './content';
""",
)
insert_before(
    "src/extension/enrichment.test.ts",
    "\ndescribe('enrichCandidatePlacesBatch'",
    """

describe('mergeDetectedResearchIntoPlannerPlaces', () => {
  it('adds Google Maps facts without overwriting Planner-owned decisions', () => {
    const current: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: 'saved-1',
      trip_id: 'trip-1',
      title: 'Saved Place',
      source_provider: 'google_maps',
      source_url: 'https://www.google.com/maps?cid=123',
      source_place_id: '0xabc:0x123',
      kind: 'other',
      priority: 'must',
      tags: ['manual-tag'],
      signals: [],
      risks: [],
      notes: 'keep this note',
      reservation_status: 'none',
      state: 'candidate',
      created_at: '2026-08-31T00:00:00Z',
    };
    const research: CurrentResearchPlace = {
      title: 'Saved Place',
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
      phone: '+66 2 000 0000',
      types: ['restaurant'],
    };

    const [merged] = mergeDetectedResearchIntoPlannerPlaces([current], [research], 'THB');
    expect(merged.kind).toBe('other');
    expect(merged.priority).toBe('must');
    expect(merged.tags).toEqual(['manual-tag']);
    expect(merged.notes).toBe('keep this note');
    expect(merged.observed_rating).toBe(4.8);
    expect(merged.observed_review_count).toBe(9876);
    expect(merged.observed_price).toBe('฿300–500');
    expect(merged.price_currency).toBe('THB');
    expect(merged.source_category).toBe('Restaurant');
    expect(merged.address).toBe('Bangkok, Thailand');
    expect(merged.coordinates).toEqual({ lat: 13.75, lng: 100.5 });
    expect(merged.types).toContain('restaurant');
  });
});
""",
)

# 2) The Maps content script can now be explicitly forced to detail-fetch every
# saved-list place. It also preserves coordinates and richer type facts returned
# by the detail page.
replace_once(
    "src/extension/content.ts",
    """async function enrichSavedListDetails(
  list: DetectedSavedList,
  overrideCurrency?: string,
): Promise<{ list: DetectedSavedList; attempted: number; enriched: number; failed: number }> {
""",
    """async function enrichSavedListDetails(
  list: DetectedSavedList,
  overrideCurrency?: string,
  force = false,
): Promise<{ list: DetectedSavedList; attempted: number; enriched: number; failed: number }> {
""",
)
replace_once(
    "src/extension/content.ts",
    """      if (!place.sourcePlaceId) continue;
      if (place.rating !== undefined && place.reviewCount !== undefined && place.category && place.priceLevel) continue;
      attempted += 1;
""",
    """      if (!place.sourcePlaceId) continue;
      if (!force && place.rating !== undefined && place.reviewCount !== undefined && place.category && place.priceLevel) continue;
      attempted += 1;
""",
)
replace_once(
    "src/extension/content.ts",
    """        address: place.address ?? facts.address,
        website: place.website ?? facts.website,
        phone: place.phone ?? facts.phone,
        types: place.types?.length ? place.types : facts.types,
      };
      if (facts.rating !== undefined || facts.reviewCount !== undefined || facts.category || facts.priceLevel) enriched += 1;
""",
    """        address: place.address ?? facts.address,
        coordinates: place.coordinates ?? facts.coordinates,
        website: place.website ?? facts.website,
        phone: place.phone ?? facts.phone,
        types: facts.types?.length ? [...new Set([...(place.types ?? []), ...facts.types])] : place.types,
      };
      if (
        facts.rating !== undefined
        || facts.reviewCount !== undefined
        || facts.category
        || facts.priceLevel
        || facts.address
        || facts.coordinates
        || facts.phone
        || facts.types?.length
      ) enriched += 1;
""",
)
replace_once(
    "src/extension/content.ts",
    """      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string }).savedList;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
""",
    """      const incoming = (message as { savedList?: DetectedSavedList; overrideCurrency?: string; force?: boolean }).savedList;
      const overrideCurrency = (message as { overrideCurrency?: string }).overrideCurrency;
      const force = Boolean((message as { force?: boolean }).force);
""",
)
replace_once(
    "src/extension/content.ts",
    """      const result = await enrichSavedListDetails(incoming, overrideCurrency);
""",
    """      const result = await enrichSavedListDetails(incoming, overrideCurrency, force);
""",
)

# 3) Candidate-pool one-click strengthen uses the current Google Maps tab/content
# script instead of the side panel's direct fetch. Merge is done against the latest
# state after the async request, so manual edits made during enrichment survive.
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """import { enrichCandidatePlacesBatch } from '../enrichment';
""",
    """import { enrichCandidatePlacesBatch, mergeDetectedResearchIntoPlannerPlaces } from '../enrichment';
""",
)
insert_before(
    "src/extension/sidepanel/handlers.ts",
    "\nlet searchDebounce: number | undefined;",
    """
function isGoogleMapsTabUrl(url = ''): boolean {
  return /^https:\/\/(www\.google\.[a-z.]+|maps\.google\.[a-z.]+)\/maps(?:\/|$)/i.test(url);
}

async function findGoogleMapsTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.find((tab) => tab.active && isGoogleMapsTabUrl(tab.url))
    ?? tabs.find((tab) => isGoogleMapsTabUrl(tab.url));
}

function researchPlaceFromPlanner(place: PlannerTripPlace): CurrentResearchPlace {
  return {
    title: place.title,
    sourceUrl: place.source_url,
    sourceProvider: place.source_provider,
    sourcePlaceId: place.source_place_id,
    rating: place.observed_rating,
    reviewCount: place.observed_review_count,
    category: place.source_category,
    priceLevel: place.observed_price,
    detectedCurrency: place.price_currency,
    address: place.address,
    coordinates: place.coordinates,
    openHours: place.open_hours,
    phone: place.phone,
    plusCode: place.plus_code,
    menuUrl: place.menu_url,
    reservationUrl: place.reservation_url,
    reviewTopics: place.review_topics,
    types: place.types,
  };
}

function formatStrengthenCoverage(places: PlannerTripPlace[]): string {
  const total = places.length;
  const rating = places.filter((place) => place.observed_rating !== undefined).length;
  const reviews = places.filter((place) => place.observed_review_count !== undefined).length;
  const price = places.filter((place) => Boolean(place.observed_price)).length;
  const category = places.filter((place) => Boolean(place.source_category)).length;
  const address = places.filter((place) => Boolean(place.address)).length;
  const coordinates = places.filter((place) => Boolean(place.coordinates)).length;
  return store.lang === 'zh'
    ? `评分 ${rating}/${total} · 评论 ${reviews}/${total} · 价格 ${price}/${total} · 分类 ${category}/${total} · 地址 ${address}/${total} · 坐标 ${coordinates}/${total}`
    : `rating ${rating}/${total} · reviews ${reviews}/${total} · price ${price}/${total} · category ${category}/${total} · address ${address}/${total} · coordinates ${coordinates}/${total}`;
}

async function strengthenCandidatesThroughMaps(
  candidates: PlannerTripPlace[],
): Promise<{ attempted: number; enriched: number; failed: number; merged: PlannerTripPlace[] } | null> {
  const eligible = candidates.filter((place) => place.source_provider === 'google_maps' && Boolean(place.source_place_id));
  if (eligible.length === 0) return null;

  const tab = await findGoogleMapsTab();
  if (!tab?.id) throw new Error(t().strengthenNeedsGoogleMaps);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'OWNLY_ENRICH_SAVED_LIST',
    savedList: {
      listName: 'Ownly candidates',
      listUrl: tab.url || '',
      detectedCurrency: store.pageDetectedCurrency,
      places: eligible.map(researchPlaceFromPlanner),
    } satisfies DetectedSavedList,
    overrideCurrency: store.mapCurrencyOverride,
    force: true,
  }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;

  const targetIds = new Set(eligible.map((place) => place.id));
  const latestTargets = store.state.pendingPlaces.filter((place) => targetIds.has(place.id));
  const merged = mergeDetectedResearchIntoPlannerPlaces(
    latestTargets,
    response?.savedList?.places ?? [],
    store.mapCurrencyOverride || store.pageDetectedCurrency,
  );
  const mergedById = new Map(merged.map((place) => [place.id, place] as const));
  store.state = {
    ...store.state,
    pendingPlaces: store.state.pendingPlaces.map((place) => mergedById.get(place.id) ?? place),
  };
  await saveState();
  return {
    attempted: response?.attempted ?? 0,
    enriched: response?.enriched ?? 0,
    failed: response?.failed ?? 0,
    merged,
  };
}
""",
)
replace_between(
    "src/extension/sidepanel/handlers.ts",
    "  // One-click Enrich All candidates in active trip\n",
    "  el.btnBackupState.addEventListener",
    """  // One-click strengthen all Google Maps candidates in the active trip.
  el.btnEnrichCandidates.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const context = store.state.activeContext;
      if (!context) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const candidates = store.state.pendingPlaces.filter((place) => place.trip_id === context.tripId);
      if (candidates.length === 0) {
        setStatus(dict.emptyCandidates, 'muted');
        return;
      }
      setStatus(dict.strengtheningStart(candidates.length));
      const result = await strengthenCandidatesThroughMaps(candidates);
      if (!result) {
        setStatus(dict.strengthenNoResolvable, 'muted');
        return;
      }
      setStatus(
        `${dict.strengthenComplete(result.enriched, result.attempted, result.failed)} · ${formatStrengthenCoverage(result.merged)}`,
        result.failed === result.attempted && result.attempted > 0 ? 'error' : 'success',
      );
    })().catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'));
  });

  el.btnBulkEnrich.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      if (store.bulkSelected.size === 0) return;
      const selected = new Set(store.bulkSelected);
      const candidates = store.state.pendingPlaces.filter((place) => selected.has(place.id));
      setStatus(dict.strengtheningStart(candidates.length));
      const result = await strengthenCandidatesThroughMaps(candidates);
      if (!result) {
        setStatus(dict.strengthenNoResolvable, 'muted');
        return;
      }
      setStatus(
        `${dict.strengthenComplete(result.enriched, result.attempted, result.failed)} · ${formatStrengthenCoverage(result.merged)}`,
        result.failed === result.attempted && result.attempted > 0 ? 'error' : 'success',
      );
    })().catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'));
  });

  el.btnBackupState.addEventListener""",
)
replace_once(
    "src/extension/sidepanel/handlers.ts",
    """            overrideCurrency: store.mapCurrencyOverride,
          }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;
""",
    """            overrideCurrency: store.mapCurrencyOverride,
            force: true,
          }) as { savedList?: DetectedSavedList | null; attempted?: number; enriched?: number; failed?: number } | undefined;
""",
)

# 4) Make the action explicit in the UI. Existing generic enrichment copy remains
# for the free-form import path; these new keys are only for saved-list strengthen.
replace_once("src/extension/i18n.ts", "btnEnrichCandidates: '⚡ 补全信息',", "btnEnrichCandidates: '⚡ 一键补强',")
replace_once("src/extension/i18n.ts", "btnBulkEnrichCandidates: '⚡ 补全',", "btnBulkEnrichCandidates: '⚡ 补强所选',")
replace_once(
    "src/extension/i18n.ts",
    """    enrichNoneNeeded: '所选候选地点已具备完整信息与价格。',
""",
    """    enrichNoneNeeded: '所选候选地点已具备完整信息与价格。',
    strengtheningStart: (count: number) => `⚡ 正在从 Google Maps 逐项补强 ${count} 个候选地点…`,
    strengthenComplete: (enriched: number, attempted: number, failed: number) => `✓ 一键补强完成：请求 ${attempted} 个，补齐 ${enriched} 个，失败 ${failed} 个`,
    strengthenNeedsGoogleMaps: '请先打开一个 Google Maps 标签页；补强会复用当前 Maps 的登录、地区与货币上下文。',
    strengthenNoResolvable: '没有可一键补强的 Google Maps 候选地点（需要稳定的 Google Place ID）。',
""",
)
replace_once("src/extension/i18n.ts", "btnEnrichCandidates: '⚡ Enrich Info',", "btnEnrichCandidates: '⚡ Strengthen all',")
replace_once("src/extension/i18n.ts", "btnBulkEnrichCandidates: '⚡ Enrich',", "btnBulkEnrichCandidates: '⚡ Strengthen selected',")
replace_once(
    "src/extension/i18n.ts",
    """    enrichNoneNeeded: 'Selected candidates already have complete details and prices.',
""",
    """    enrichNoneNeeded: 'Selected candidates already have complete details and prices.',
    strengtheningStart: (count: number) => `⚡ Strengthening Google Maps facts for ${count} candidate places…`,
    strengthenComplete: (enriched: number, attempted: number, failed: number) => `✓ Strengthen complete: requested ${attempted}, filled ${enriched}, failed ${failed}`,
    strengthenNeedsGoogleMaps: 'Open a Google Maps tab first. Strengthen reuses the current Maps login, locale and currency context.',
    strengthenNoResolvable: 'No Google Maps candidates with a stable Place ID are available to strengthen.',
""",
)
replace_once(
    "extension/sidepanel.html",
    """<button id="btnEnrichCandidates" class="link" type="button" title="智能补全信息与价格" style="font-size: 11px;">⚡ 补全信息</button>""",
    """<button id="btnEnrichCandidates" class="link" type="button" title="从 Google Maps 一键补强评分、评论、价格、分类、地址与坐标" style="font-size: 11px;">⚡ 一键补强</button>""",
)
replace_once(
    "extension/sidepanel.html",
    """<button id="btnBulkEnrich" class="card-btn" type="button">⚡ 补全</button>""",
    """<button id="btnBulkEnrich" class="card-btn" type="button">⚡ 补强所选</button>""",
)
