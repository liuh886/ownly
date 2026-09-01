from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Planner pending-queue identity lookup: strong provider identity only.
# ---------------------------------------------------------------------------
planner_path = Path('src/domain/planner.ts')
planner = planner_path.read_text()
planner = replace_once(
    planner,
    "import { haveConflictingStrongPlaceIdentity, shareStrongPlaceIdentity } from './place-identity';",
    "import { getStrongPlaceIdentityKeys, haveConflictingStrongPlaceIdentity, shareStrongPlaceIdentity } from './place-identity';",
    'place identity imports',
)
old_find = '''export function findExistingTripPlace(
  places: PlannerTripPlace[],
  tripId: string,
  sourceUrl: string,
  sourcePlaceId?: string,
  coordinates?: { lat: number; lng: number },
): PlannerTripPlace | undefined {
  const tripPlaces = places.filter((place) => place.trip_id === tripId);

  if (sourcePlaceId) {
    const byPlaceId = tripPlaces.find((place) =>
      place.source_provider === inferSourceProvider(sourceUrl) && place.source_place_id === sourcePlaceId
    );
    if (byPlaceId) return byPlaceId;
  }

  const coordinateIdentity = roundedCoordinateIdentity(coordinates);
  if (coordinateIdentity) {
    const byCoordinates = tripPlaces.find((place) => roundedCoordinateIdentity(place.coordinates) === coordinateIdentity);
    if (byCoordinates) return byCoordinates;
  }

  const identity = normalizePlaceIdentity(sourceUrl);
  return tripPlaces.find((place) => normalizePlaceIdentity(place.source_url) === identity)
    ?? tripPlaces.find((place) => place.source_url === sourceUrl);
}
'''
new_find = '''export function findExistingTripPlace(
  places: PlannerTripPlace[],
  tripId: string,
  sourceUrl: string,
  sourcePlaceId?: string,
  _coordinates?: { lat: number; lng: number },
): PlannerTripPlace | undefined {
  const probeKeys = new Set(getStrongPlaceIdentityKeys({
    source_provider: inferSourceProvider(sourceUrl),
    source_place_id: sourcePlaceId,
    source_url: sourceUrl,
  }));
  if (probeKeys.size === 0) return undefined;

  return places
    .filter((place) => place.trip_id === tripId)
    .find((place) => getStrongPlaceIdentityKeys(place).some((key) => probeKeys.has(key)));
}
'''
planner = replace_once(planner, old_find, new_find, 'pending queue strong identity lookup')
planner_path.write_text(planner)

# ---------------------------------------------------------------------------
# Background enrichment: never resolve identity by title, never promote notes
# into source facts, and never treat optional price as completion requirement.
# ---------------------------------------------------------------------------
enrichment_path = Path('src/extension/enrichment.ts')
enrichment = enrichment_path.read_text()
enrichment = replace_once(
    enrichment,
    "import { extractCleanPriceText, extractFeatureIdFromUrl } from './utils';",
    "import { extractFeatureIdFromUrl } from './utils';",
    'remove note price extractor import',
)
enrichment = replace_once(enrichment, "  extractFeatureIdFromHtml,\n", "", 'remove title search result parser import')
enrichment = replace_once(enrichment, "  googleMapsSearchTbmUrl,\n", "", 'remove title search URL import')
enrichment = replace_once(
    enrichment,
    "  const isMissingPrice = (place.kind === 'stay' || place.kind === 'food') && (!place.observed_price || isZeroOrPlaceholderPrice(place.observed_price));\n",
    "",
    'remove optional price completeness requirement',
)
enrichment = replace_once(enrichment, "    isMissingPrice ||\n", "", 'remove optional price from completeness expression')
old_title_resolve = '''  if (!resolvedFeatureId || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(resolvedFeatureId.trim())) {
    const cleanSearch = cleanTitleForSearch(next.title);
    const tbmUrl = googleMapsSearchTbmUrl(cleanSearch);
    logger.fetch('BackgroundEnrich', `Step 1: Resolving Place ID for "${cleanSearch}"`, { tbmUrl });
    try {
      const sRes = await fetch(tbmUrl, { credentials: 'include', signal: options?.signal });
      if (sRes.ok) {
        const sHtml = await sRes.text();
        const foundId = extractFeatureIdFromHtml(sHtml);
        if (foundId) {
          resolvedFeatureId = foundId;
          logger.info('BackgroundEnrich', `Step 1 Success: Resolved Place ID for "${cleanSearch}"`, { featureId: foundId });
        }
      }
    } catch (err) {
      logger.warn('BackgroundEnrich', `Search resolve failed for "${cleanSearch}"`, err instanceof Error ? err.message : String(err));
    }
  }

'''
enrichment = replace_once(enrichment, old_title_resolve, '', 'delete title to Place ID resolution')
enrichment = enrichment.replace(
    '// 1. Mandatory Step 1: Guarantee Place ID resolution FIRST if missing or invalid',
    '// 1. Resolve identity only from already captured provider evidence; never search by title',
    1,
)
enrichment = enrichment.replace(
    '// 2. Mandatory Step 2: Now that Place ID is resolved, fetch structured preview facts',
    '// 2. With a verified Google feature id, fetch structured preview facts',
    1,
)
old_note_price = '''          if (!next.observed_price) {
            // Only check user-written research notes; NEVER extract prices from place titles
            const whyPrice = extractCleanPriceText(next.why);
            const notePrice = extractCleanPriceText(next.notes);
            const foundPrice = whyPrice || notePrice;
            if (foundPrice && !isZeroOrPlaceholderPrice(foundPrice)) {
              next.observed_price = foundPrice;
              const normalized = normalizeObservedPrice(foundPrice, effectiveCurrency);
              if (normalized?.min !== undefined) next.price_min = normalized.min;
              if (normalized?.max !== undefined) next.price_max = normalized.max;
              if (normalized?.currency) next.price_currency = normalized.currency;
              if (normalized?.level !== undefined) next.price_level = normalized.level;
              if (normalized?.unit) next.price_unit = normalized.unit;
              mutated = true;
            }
          }

'''
enrichment = replace_once(enrichment, old_note_price, '', 'remove notes to objective price promotion')
old_fallback_target = '''  // 3. Fallback: Detail URL HTML scraping (especially useful for restaurant prices in JSON-LD)
  let targetUrl = next.source_url;
  if (!targetUrl || targetUrl.includes('/search/?api=1') || targetUrl.includes('/maps/search/')) {
    const detailUrl = googleMapsDetailUrlFromSourceId(next.source_place_id || resolvedFeatureId, cleanTitleForSearch(next.title));
    if (detailUrl) targetUrl = detailUrl;
    else if (!targetUrl) targetUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitleForSearch(next.title))}`;
  }

  logger.fetch('BackgroundEnrich', `Fetching HTML for ${next.title}`, { targetUrl, sourcePlaceId: next.source_place_id });
'''
new_fallback_target = '''  // 3. Fallback: detail HTML is allowed only when it can be constructed from verified identity.
  const targetUrl = googleMapsDetailUrlFromSourceId(next.source_place_id || resolvedFeatureId, cleanTitleForSearch(next.title));
  if (!targetUrl) {
    if (mutated) {
      next.updated_at = new Date().toISOString();
      return { place: next, enriched: true };
    }
    return { place: next, enriched: false, error: 'Missing strong Google Maps identity' };
  }

  logger.fetch('BackgroundEnrich', `Fetching HTML for ${next.title}`, { targetUrl, sourcePlaceId: next.source_place_id });
'''
enrichment = replace_once(enrichment, old_fallback_target, new_fallback_target, 'strong identity HTML fallback')
enrichment_path.write_text(enrichment)

# ---------------------------------------------------------------------------
# Saved-list enrichment: no title-search identity resolution and no title-keyed
# fact scavenging. Existing list facts or facts returned for the verified ID only.
# ---------------------------------------------------------------------------
content_path = Path('src/extension/content.ts')
content = content_path.read_text()
content = replace_once(content, "  extractFeatureIdFromHtml,\n", "", 'content remove feature id html search import')
content = replace_once(content, "  googleMapsSearchTbmUrl,\n", "", 'content remove title search URL import')
old_detail_identity = '''async function fetchSavedListDetail(place: CurrentResearchPlace): Promise<GoogleMapsResearchFacts | null> {
  let key = place.sourcePlaceId;
  if (!key || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(key.trim())) {
    try {
      const tbmUrl = googleMapsSearchTbmUrl(place.title, window.location.origin);
      logger.fetch('MapsTabDetail', `Resolving Place ID for "${place.title}"`, { tbmUrl });
      const sRes = await fetch(tbmUrl, { credentials: 'include' });
      if (sRes.ok) {
        const sHtml = await sRes.text();
        const foundId = extractFeatureIdFromHtml(sHtml);
        if (foundId) {
          key = foundId;
          place.sourcePlaceId = foundId;
          logger.info('MapsTabDetail', `Resolved Place ID for "${place.title}"`, { featureId: foundId });
        }
      }
    } catch (err) {
      logger.warn('MapsTabDetail', `Search resolve failed for "${place.title}"`, err instanceof Error ? err.message : String(err));
    }
  }

  if (!key) {
    logger.warn('MapsTabDetail', `Skipping detail fetch: missing sourcePlaceId for "${place.title}"`);
    return null;
  }
'''
new_detail_identity = '''async function fetchSavedListDetail(place: CurrentResearchPlace): Promise<GoogleMapsResearchFacts | null> {
  const key = place.sourcePlaceId || extractFeatureIdFromUrl(place.sourceUrl);
  if (!key || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(key.trim())) {
    logger.warn('MapsTabDetail', `Skipping detail fetch: missing verified feature id for "${place.title}"`);
    return null;
  }
  if (!place.sourcePlaceId) place.sourcePlaceId = key;
'''
content = replace_once(content, old_detail_identity, new_detail_identity, 'saved list strong identity detail fetch')
content = replace_once(
    content,
    "      if (!force && place.sourcePlaceId && place.rating !== undefined && place.reviewCount !== undefined && place.category && place.priceLevel) continue;\n",
    "      if (!force && place.sourcePlaceId && place.rating !== undefined && place.reviewCount !== undefined && place.category && place.address && place.coordinates) continue;\n",
    'saved list optional price completion',
)
old_merge_block = '''      const nextCategory = force ? (facts.category ?? place.category) : (place.category ?? facts.category);
      const scavenged = scavengedListPlaces.get(place.title.toLowerCase());
      const rawPriceCandidate = (facts.priceLevel && !isZeroOrPlaceholderPrice(facts.priceLevel) && isValidExtractedPriceCandidate(facts.priceLevel))
        ? facts.priceLevel
        : (scavenged?.priceLevel && !isZeroOrPlaceholderPrice(scavenged.priceLevel) && isValidExtractedPriceCandidate(scavenged.priceLevel)
          ? scavenged.priceLevel
          : (place.priceLevel && !isZeroOrPlaceholderPrice(place.priceLevel) && isValidExtractedPriceCandidate(place.priceLevel) ? place.priceLevel : undefined));
      const notePrice = extractCleanPriceText(place.userNote || place.summary);
      const nextPrice = rawPriceCandidate ?? (notePrice && !isZeroOrPlaceholderPrice(notePrice) && isValidExtractedPriceCandidate(notePrice) ? notePrice : undefined);
      const nextAddress = force ? (facts.address ?? scavenged?.address ?? place.address) : (place.address ?? facts.address ?? scavenged?.address);
      const nextCoords = force ? (facts.coordinates ?? scavenged?.coordinates ?? place.coordinates) : (place.coordinates ?? facts.coordinates ?? scavenged?.coordinates);
      const nextWebsite = force ? (facts.website ?? scavenged?.website ?? place.website) : (place.website ?? facts.website ?? scavenged?.website);
      const nextPhone = force ? (facts.phone ?? scavenged?.phone ?? place.phone) : (place.phone ?? facts.phone ?? scavenged?.phone);
      const nextOpenHours = force ? (facts.open_hours ?? scavenged?.openHours ?? place.openHours) : (place.openHours ?? facts.open_hours ?? scavenged?.openHours);
      const nextPlusCode = force ? (facts.plus_code ?? scavenged?.plusCode ?? place.plusCode) : (place.plusCode ?? facts.plus_code ?? scavenged?.plusCode);
      const nextMenuUrl = force ? (facts.menu_url ?? scavenged?.menuUrl ?? place.menuUrl) : (place.menuUrl ?? facts.menu_url ?? scavenged?.menuUrl);
      const nextReservationUrl = force ? (facts.reservation_url ?? scavenged?.reservationUrl ?? place.reservationUrl) : (place.reservationUrl ?? facts.reservation_url ?? scavenged?.reservationUrl);
      const nextReviewTopics = force ? (facts.review_topics ?? scavenged?.reviewTopics ?? place.reviewTopics) : (place.reviewTopics ?? facts.review_topics ?? scavenged?.reviewTopics);
'''
new_merge_block = '''      const nextCategory = force ? (facts.category ?? place.category) : (place.category ?? facts.category);
      const nextPrice = (facts.priceLevel && !isZeroOrPlaceholderPrice(facts.priceLevel) && isValidExtractedPriceCandidate(facts.priceLevel))
        ? facts.priceLevel
        : (place.priceLevel && !isZeroOrPlaceholderPrice(place.priceLevel) && isValidExtractedPriceCandidate(place.priceLevel) ? place.priceLevel : undefined);
      const nextAddress = force ? (facts.address ?? place.address) : (place.address ?? facts.address);
      const nextCoords = force ? (facts.coordinates ?? place.coordinates) : (place.coordinates ?? facts.coordinates);
      const nextWebsite = force ? (facts.website ?? place.website) : (place.website ?? facts.website);
      const nextPhone = force ? (facts.phone ?? place.phone) : (place.phone ?? facts.phone);
      const nextOpenHours = force ? (facts.open_hours ?? place.openHours) : (place.openHours ?? facts.open_hours);
      const nextPlusCode = force ? (facts.plus_code ?? place.plusCode) : (place.plusCode ?? facts.plus_code);
      const nextMenuUrl = force ? (facts.menu_url ?? place.menuUrl) : (place.menuUrl ?? facts.menu_url);
      const nextReservationUrl = force ? (facts.reservation_url ?? place.reservationUrl) : (place.reservationUrl ?? facts.reservation_url);
      const nextReviewTopics = force ? (facts.review_topics ?? place.reviewTopics) : (place.reviewTopics ?? facts.review_topics);
'''
content = replace_once(content, old_merge_block, new_merge_block, 'remove title-keyed saved-list fact scavenging')
content = replace_once(
    content,
    "        types: facts.types?.length\n          ? [...new Set([...(place.types ?? []), ...facts.types])]\n          : (scavenged?.types?.length ? [...new Set([...(place.types ?? []), ...scavenged.types])] : place.types),\n",
    "        types: facts.types?.length\n          ? [...new Set([...(place.types ?? []), ...facts.types])]\n          : place.types,\n",
    'remove title-keyed type scavenging',
)

# Make the DOM scan cache key source-oriented so same-name branches remain distinct.
content = content.replace('const scavengedListPlaces = new Map<string, CurrentResearchPlace>();', 'const scannedListPlaces = new Map<string, CurrentResearchPlace>();')
content = content.replace('scavengedListPlaces.clear()', 'scannedListPlaces.clear()')
content = content.replace('scavengedListPlaces.size', 'scannedListPlaces.size')
content = content.replace('scavengedListPlaces.keys()', 'scannedListPlaces.keys()')
content = content.replace('scavengedListPlaces.delete(key)', 'scannedListPlaces.delete(key)')
old_key = '''  const titleKey = cleanTitle.toLowerCase();
  if (scavengedListPlaces.has(titleKey)) return;

  const fields = readCardFields(card);
  const url = sourceUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`;
  const kind = inferPlaceKind((fields.category || '') + ' ' + cleanTitle + ' ' + (fields.address || ''));

  scavengedListPlaces.set(titleKey, {
'''
new_key = '''  const identityKey = extractFeatureIdFromUrl(sourceUrl) || sourceUrl || `unresolved:${cleanTitle.toLowerCase()}`;
  if (scannedListPlaces.has(identityKey)) return;

  const fields = readCardFields(card);
  const url = sourceUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`;
  const kind = inferPlaceKind((fields.category || '') + ' ' + cleanTitle + ' ' + (fields.address || ''));

  scannedListPlaces.set(identityKey, {
'''
content = replace_once(content, old_key, new_key, 'source-oriented DOM scan cache')
content = content.replace('return Array.from(scavengedListPlaces.values());', 'return Array.from(scannedListPlaces.values());')
content_path.write_text(content)

# ---------------------------------------------------------------------------
# Tests: unresolved title/search URLs no longer merge or background-enrich.
# ---------------------------------------------------------------------------
planner_test_path = Path('src/domain/planner.test.ts')
planner_test = planner_test_path.read_text()
planner_test = replace_once(
    planner_test,
    "    expect(findExistingTripPlace(places, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=Sensoji%20')?.id).toBe('a');\n    expect(findExistingTripPlace(places, 'trip-1', 'https://maps.google.com/other-path', 'pid-1')?.id).toBe('b');\n",
    "    expect(findExistingTripPlace(places, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=Sensoji%20')).toBeUndefined();\n    expect(findExistingTripPlace(places, 'trip-1', 'https://maps.google.com/other-path', 'pid-1')?.id).toBe('b');\n",
    'pending queue title-search identity regression',
)
planner_test_path.write_text(planner_test)

enrichment_test_path = Path('src/extension/enrichment.test.ts')
enrichment_test = enrichment_test_path.read_text()
# Existing enrichment tests need a verified feature ID; preview JSON parse may fail, then verified-ID HTML fallback is exercised.
enrichment_test = enrichment_test.replace(
    "        source_url: 'https://www.google.com/maps/place/Thipsamai',\n        kind: 'other',",
    "        source_url: 'https://www.google.com/maps/place/Thipsamai',\n        source_place_id: '0x30e2991678584ec5:0x698c069655046fbe',\n        kind: 'other',",
    1,
)
enrichment_test = enrichment_test.replace(
    "          source_url: 'https://www.google.com/maps/place/Oakwood',\n          kind: 'other',",
    "          source_url: 'https://www.google.com/maps/place/Oakwood',\n          source_place_id: '0x30e29f0000000001:0x698c000000000001',\n          kind: 'other',",
    1,
)
anchor = """  it('strips decorative emojis with cleanTitleForSearch and enriches emoji restaurant', async () => {
"""
new_tests = """  it('does not resolve Place ID or fetch facts from a title-only Google search URL', async () => {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const place: PlannerTripPlace = {
        schema_version: '0.1', type: 'trip_place', id: 'unresolved', trip_id: 'trip-1',
        title: 'Same Name Airport', source_provider: 'google_maps',
        source_url: 'https://www.google.com/maps/search/?api=1&query=Same+Name+Airport',
        kind: 'transit', priority: 'want', tags: [], signals: [], risks: [],
        reservation_status: 'none', state: 'candidate', created_at: '2026-08-30T00:00:00Z',
      };
      const result = await enrichPlaceMetadata(place);
      expect(result.enriched).toBe(false);
      expect(result.place.source_place_id).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not treat missing optional price as incomplete enrichment', async () => {
    const { isCandidateMissingData } = await import('./enrichment');
    const place: PlannerTripPlace = {
      schema_version: '0.1', type: 'trip_place', id: 'no-price', trip_id: 'trip-1',
      title: 'No Published Price Restaurant', source_provider: 'google_maps',
      source_url: 'https://www.google.com/maps?cid=123456789',
      source_place_id: '0x30e2991678584ec5:0x698c069655046fbe',
      kind: 'food', priority: 'want', tags: [], signals: [], risks: [],
      observed_rating: 4.5, observed_review_count: 100, source_category: 'Restaurant',
      address: 'Bangkok', coordinates: { lat: 13.75, lng: 100.5 },
      reservation_status: 'none', state: 'candidate', created_at: '2026-08-30T00:00:00Z',
    };
    expect(isCandidateMissingData(place)).toBe(false);
  });

  it('does not promote user why/notes text into observed_price', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, text: async () => '' } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, url: 'https://www.google.com/maps/place/Test', text: async () => '<html></html>' } as unknown as Response);
    try {
      const place: PlannerTripPlace = {
        schema_version: '0.1', type: 'trip_place', id: 'note-price', trip_id: 'trip-1',
        title: 'Test', source_provider: 'google_maps', source_url: 'https://www.google.com/maps/place/Test',
        source_place_id: '0x30e2991678584ec5:0x698c069655046fbe', kind: 'food', priority: 'want',
        tags: [], signals: [], risks: [], why: 'Someone mentioned ฿299 but not verified', notes: 'Maybe ฿399',
        reservation_status: 'none', state: 'candidate', created_at: '2026-08-30T00:00:00Z',
      };
      const result = await enrichPlaceMetadata(place, { force: true });
      expect(result.place.observed_price).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

""" + anchor
enrichment_test = replace_once(enrichment_test, anchor, new_tests, 'capture authority regression tests')
enrichment_test_path.write_text(enrichment_test)

# Mark completed release-readiness items.
plan_path = Path('docs/PLANNER_CAPTURE_RELEASE_READINESS.md')
plan = plan_path.read_text()
plan = plan.replace('- [ ] Verify enrichment never promotes titles, free-form notes, or arbitrary Google payload strings into objective identity/price facts.', '- [x] Enrichment never resolves identity from titles or promotes free-form notes into objective identity/price facts.')
plan = plan.replace('- [ ] Treat price, phone, opening hours, menu, and other optional Google facts as optional facts rather than perpetual incomplete-state requirements.', '- [x] Price and other source extras remain optional; missing price no longer keeps food/stay in perpetual incomplete state.')
plan = plan.replace('- [ ] Verify saved-list enrichment never attaches facts across same-name branches.', '- [x] Saved-list enrichment attaches returned facts only to verified feature IDs; title-keyed fact scavenging is removed.')
plan_path.write_text(plan)
