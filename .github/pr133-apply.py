from pathlib import Path

path = Path('src/extension/content.ts')
text = path.read_text(encoding='utf-8')

old = '''function extractGoogleMapsPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const listPlaces = scanAllGoogleMapsPlaces();
  const isDedicatedPlacePage = /\\/maps\\/place\\/[^/?#]+/.test(window.location.pathname) || /data=.*!1s0x/.test(window.location.href);

  // If there are multiple places in a list, don't falsely recognize the list header as a single place
  if (listPlaces.length > 1 && !isDedicatedPlacePage) {
    return null;
  }
  
  // Exclude explicitly known list URL patterns even if places are 0
  if (!isDedicatedPlacePage && (sourceUrl.includes('!2s') || sourceUrl.includes('/placelists/'))) {
    return null;
  }

  const jsonLd = PLACE_PARSER.extractJsonLd(document);
  const heading = document.querySelector<HTMLElement>(SELECTORS.placeHeading)
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || jsonLd.title || titleFromUrl(sourceUrl);
'''
new = '''function extractGoogleMapsPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const listPlaces = scanAllGoogleMapsPlaces();
  const isDedicatedPlacePage = /\\/maps\\/place\\/[^/?#]+/.test(window.location.pathname) || /data=.*!1s0x/.test(window.location.href);
  const jsonLd = PLACE_PARSER.extractJsonLd(document);
  const heading = document.querySelector<HTMLElement>(SELECTORS.placeHeading)
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || jsonLd.title || titleFromUrl(sourceUrl);
  const hasDetailFacts = Boolean(
    title
    && !isGenericNavigationTitle(title)
    && (
      document.querySelector(SELECTORS.address)
      || document.querySelector(SELECTORS.rating)
      || document.querySelector(SELECTORS.category)
      || document.querySelector(SELECTORS.phone)
      || document.querySelector('[data-item-id^="address:"]')
      || document.querySelector('[data-item-id^="phone:"]')
    )
  );
  const hasPlaceDetailPanel = isDedicatedPlacePage || hasDetailFacts;

  // Google Maps is an SPA: opening a place from a saved list can keep the list URL
  // while the detail pane already contains a real place. Trust strong detail-pane
  // facts over URL shape; only suppress the list header when no detail pane exists.
  if (listPlaces.length > 1 && !hasPlaceDetailPanel) {
    return null;
  }

  if (!hasPlaceDetailPanel && (sourceUrl.includes('!1s') || sourceUrl.includes('!2s') || sourceUrl.includes('/placelists/'))) {
    return null;
  }
'''
if old not in text:
    raise SystemExit('extractGoogleMapsPlace preamble target not found')
text = text.replace(old, new, 1)

old = '''  const stateSignals = collectAppStateSignals();
  const reservation = extractReservation();
  const rating = extractRating() || jsonLd.rating;
  const reviewCount = extractReviewCount() || jsonLd.reviewCount;
  const category = extractCategory() || jsonLd.category;
  const kind = inferPlaceKind((category || '') + ' ' + title + ' ' + (address || '') + ' ' + ((stateSignals?.types || []).join(' ')));

  return {
    title,
    sourceUrl,
'''
new = '''  const stateSignals = collectAppStateSignals();
  const sourcePlaceId = stateSignals?.placeId || extractFeatureIdFromUrl(sourceUrl) || undefined;
  const canonicalSourceUrl = googleMapsDetailUrlFromSourceId(sourcePlaceId, title, window.location.origin) || sourceUrl;
  const reservation = extractReservation();
  const rating = extractRating() || jsonLd.rating;
  const reviewCount = extractReviewCount() || jsonLd.reviewCount;
  const category = extractCategory() || jsonLd.category;
  const kind = inferPlaceKind((category || '') + ' ' + title + ' ' + (address || '') + ' ' + ((stateSignals?.types || []).join(' ')));

  return {
    title,
    sourceUrl: canonicalSourceUrl,
'''
if old not in text:
    raise SystemExit('canonical source target not found')
text = text.replace(old, new, 1)

old = '''    coordinates: extractPlaceCoordinates(sourceUrl) ?? undefined,
    tierNote: extractHotelTier(),
'''
new = '''    coordinates: extractPlaceCoordinates(canonicalSourceUrl) ?? extractPlaceCoordinates(sourceUrl) ?? undefined,
    sourcePlaceId,
    tierNote: extractHotelTier(),
'''
if old not in text:
    raise SystemExit('coordinates target not found')
text = text.replace(old, new, 1)

old = '''  const listAnchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/placelists/list/"], a[href*="!2s"]');
  for (const anchor of Array.from(listAnchors)) {
    const href = anchor.href || '';
    const listIdMatch = href.match(/!2s([A-Za-z0-9_-]{15,})|\\/placelists\\/list\\/([A-Za-z0-9_-]{15,})/);
    const listId = listIdMatch?.[1] || listIdMatch?.[2];
'''
new = '''  const listAnchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/placelists/list/"], a[href*="!1s"], a[href*="!2s"], a[href*="entitylist"], a[href*="getlist"]',
  );
  for (const anchor of Array.from(listAnchors)) {
    const href = anchor.href || '';
    const listIdMatch = href.match(/!1s([A-Za-z0-9_-]{15,})|!2s([A-Za-z0-9_-]{15,})|\\/placelists\\/list\\/([A-Za-z0-9_-]{15,})/);
    const listId = listIdMatch?.[1] || listIdMatch?.[2] || listIdMatch?.[3];
'''
if old not in text:
    raise SystemExit('saved list anchor target not found')
text = text.replace(old, new, 1)

old = '''      if (!listId && listUrl) {
        const m = /!2s([A-Za-z0-9_-]{20,})|\\/placelists\\/list\\/([A-Za-z0-9_-]{20,})/.exec(listUrl);
        listId = m?.[1] || m?.[2];
      }
'''
new = '''      if (!listId && listUrl) {
        const m = /!1s([A-Za-z0-9_-]{15,})|!2s([A-Za-z0-9_-]{15,})|\\/placelists\\/list\\/([A-Za-z0-9_-]{15,})/.exec(listUrl);
        listId = m?.[1] || m?.[2] || m?.[3];
      }
'''
if old not in text:
    raise SystemExit('fetch by id parser target not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')

path = Path('docs/CAPTURE_SYNC_BOUNDARY.md')
text = path.read_text(encoding='utf-8').rstrip()
if '## Google Maps SPA detection\n' not in text:
    text += '''\n\n## Google Maps SPA detection\n\nCapture treats a visible Google Maps detail pane with strong place facts (address, rating, category or phone) as the current place even when the SPA keeps a saved-list URL. Saved-list discovery accepts both `!1s` and `!2s` list-id carriers so a trip tag such as `TH26` can match the same-named Google Maps saved list and import it in bulk. URL shape alone is not the place/list authority.\n'''
path.write_text(text + '\n', encoding='utf-8')

print('Capture SPA/list matching fix applied')
