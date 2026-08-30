from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing replacement target in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# content.ts: one saved-list parser/matcher, SPA detail recognition, constrained visible-list fallback.
replace_once(
    'src/extension/content.ts',
    "import { detectPageCurrency } from './currency-detector';\n",
    "import { detectPageCurrency } from './currency-detector';\nimport { extractGoogleMapsSavedListId, matchesSavedListContext } from './saved-list-match';\n",
)

replace_once(
    'src/extension/content.ts',
    """function extractGoogleMapsPlace(): CurrentResearchPlace | null {\n  const sourceUrl = window.location.href;\n  const listPlaces = scanAllGoogleMapsPlaces();\n  const isDedicatedPlacePage = /\\/maps\\/place\\/[^/?#]+/.test(window.location.pathname) || /data=.*!1s0x/.test(window.location.href);\n\n  // If there are multiple places in a list, don't falsely recognize the list header as a single place\n""",
    """function extractGoogleMapsPlace(): CurrentResearchPlace | null {\n  const sourceUrl = window.location.href;\n  const listPlaces = scanAllGoogleMapsPlaces();\n  const detailHeading = document.querySelector<HTMLElement>(SELECTORS.placeHeading)\n    ?? document.querySelector<HTMLElement>('main h1');\n  const hasVisibleDetailFacts = Boolean(\n    document.querySelector(SELECTORS.address)\n    || document.querySelector(SELECTORS.rating)\n    || document.querySelector(SELECTORS.category)\n    || document.querySelector(SELECTORS.phone)\n    || document.querySelector(SELECTORS.website),\n  );\n  // Google Maps is a SPA: a real place details pane can be open while the URL\n  // remains on /maps/@... or a saved-list route. DOM detail facts are therefore\n  // authoritative; URL shape is only another positive signal.\n  const hasVisiblePlaceDetails = Boolean(cleanExtractedText(detailHeading?.textContent || '') && hasVisibleDetailFacts);\n  const isDedicatedPlacePage = /\\/maps\\/place\\/[^/?#]+/.test(window.location.pathname)\n    || /data=.*!1s0x/.test(window.location.href)\n    || hasVisiblePlaceDetails;\n\n  // If there are multiple places in a list, don't falsely recognize the list header as a single place\n""",
)

replace_once(
    'src/extension/content.ts',
    """  // Exclude explicitly known list URL patterns even if places are 0\n  if (!isDedicatedPlacePage && (sourceUrl.includes('!2s') || sourceUrl.includes('/placelists/'))) {\n    return null;\n  }\n""",
    """  // A saved-list carrier is not a place by itself. A visible details pane above\n  // overrides this because Maps commonly keeps the list URL while a place is open.\n  if (!isDedicatedPlacePage && extractGoogleMapsSavedListId(sourceUrl)) {\n    return null;\n  }\n""",
)

# Replace the list-id extractor wholesale up to the next function.
path = Path('src/extension/content.ts')
text = path.read_text(encoding='utf-8')
start = text.index('function extractGoogleMapsListId(): string | null {')
end = text.index('\nfunction ', start + 20)
new_func = '''function extractGoogleMapsListId(): string | null {\n  const fromUrl = extractGoogleMapsSavedListId(window.location.href);\n  if (fromUrl) return fromUrl;\n\n  const links = document.querySelectorAll<HTMLLinkElement | HTMLAnchorElement>(\n    'link[href*="getlist"], link[href*="entitylist"], a[href*="!1s"], a[href*="!2s"], a[href*="/placelists/list/"], a[href*="?list="]'\n  );\n  for (const link of Array.from(links)) {\n    const id = extractGoogleMapsSavedListId(link.href || '');\n    if (id) return id;\n  }\n\n  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-list-id]'))) {\n    const id = (el.getAttribute('data-list-id') || '').trim();\n    if (/^[A-Za-z0-9_-]{8,}$/.test(id)) return id;\n  }\n  return null;\n}\n'''
text = text[:start] + new_func + text[end:]
path.write_text(text, encoding='utf-8')

# Saved-list overview carriers use the same parser and no arbitrary 15/20-char split.
path = Path('src/extension/content.ts')
text = path.read_text(encoding='utf-8')
text = text.replace(
    "const listAnchors = document.querySelectorAll<HTMLAnchorElement>('a[href*=\"/placelists/list/\"], a[href*=\"!2s\"]');",
    "const listAnchors = document.querySelectorAll<HTMLAnchorElement>('a[href*=\"/placelists/list/\"], a[href*=\"!1s\"], a[href*=\"!2s\"], a[href*=\"?list=\"]');",
    1,
)
old = """    const listIdMatch = href.match(/!2s([A-Za-z0-9_-]{15,})|\\/placelists\\/list\\/([A-Za-z0-9_-]{15,})/);\n    const listId = listIdMatch?.[1] || listIdMatch?.[2];\n    if (!listId) continue;\n"""
new = """    const listId = extractGoogleMapsSavedListId(href);\n    if (!listId) continue;\n"""
if old not in text:
    raise SystemExit('saved-list anchor parser target missing')
text = text.replace(old, new, 1)
text = text.replace("    if (dataId.length < 15) continue;", "    if (!/^[A-Za-z0-9_-]{8,}$/.test(dataId)) continue;", 1)
path.write_text(text, encoding='utf-8')

# Visible list name is used only with a concrete set of real place anchors.
insert_marker = 'function detectGoogleMapsListPlaces(): CurrentResearchPlace[] {\n  return scanAllGoogleMapsPlaces();\n}\n'
insert = '''function detectGoogleMapsListPlaces(): CurrentResearchPlace[] {\n  return scanAllGoogleMapsPlaces();\n}\n\nfunction detectVisibleGoogleMapsListName(places: CurrentResearchPlace[]): string | undefined {\n  if (places.length < 2) return undefined;\n  const placeTitles = new Set(places.map((place) => cleanExtractedText(place.title).toLocaleLowerCase()).filter(Boolean));\n  const candidates: string[] = [];\n  for (const el of Array.from(document.querySelectorAll<HTMLElement>('div[role="main"] h1, h1.fontHeadlineLarge, h1')).slice(0, 8)) {\n    candidates.push(el.textContent || el.getAttribute('aria-label') || '');\n  }\n  candidates.push(document.title.replace(/\\s*[-–—]\\s*Google Maps.*$/i, ''));\n  for (const raw of candidates) {\n    const title = cleanExtractedText(raw);\n    if (!title || title.length > 80 || isGenericNavigationTitle(title) || isJunkNavigationText(title) || isFakePlaceLabel(title)) continue;\n    if (placeTitles.has(title.toLocaleLowerCase())) continue;\n    return title;\n  }\n  return undefined;\n}\n'''
replace_once('src/extension/content.ts', insert_marker, insert)

# One canonical list-name matcher in the current-place response.
replace_once(
    'src/extension/content.ts',
    """          const matched = allLists.find((l) => {\n            const name = l.listName.toLowerCase();\n            return targetTags.some((t) => t && (name === t || name.includes(t) || t.includes(name)));\n          });\n""",
    """          const matched = allLists.find((list) => matchesSavedListContext(list.listName, { tags: targetTags }));\n""",
)

# Shared parser for explicit fetch-by-url.
path = Path('src/extension/content.ts')
text = path.read_text(encoding='utf-8')
old = """      if (!listId && listUrl) {\n        const m = /!2s([A-Za-z0-9_-]{20,})|\\/placelists\\/list\\/([A-Za-z0-9_-]{20,})/.exec(listUrl);\n        listId = m?.[1] || m?.[2];\n      }\n"""
new = """      if (!listId && listUrl) listId = extractGoogleMapsSavedListId(listUrl);\n"""
if old not in text:
    raise SystemExit('fetch-by-url parser target missing')
text = text.replace(old, new, 1)

old = """      const listPlaces = savedList?.places ?? detectGoogleMapsListPlaces();\n      sendResponse({ listPlaces, truncated: savedList?.truncated ?? false });\n"""
new = """      const listPlaces = savedList?.places ?? detectGoogleMapsListPlaces();\n      const listName = savedList?.listName ?? detectVisibleGoogleMapsListName(listPlaces);\n      sendResponse({ listPlaces, listName, truncated: savedList?.truncated ?? false });\n"""
if old not in text:
    raise SystemExit('visible-list response target missing')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')

# sidepanel capture: consume the canonical matcher and promote a confidently named visible list.
replace_once(
    'src/extension/sidepanel/capture.ts',
    "import { saveCaptureStateViaWorker } from '../capture-state';\n",
    "import { saveCaptureStateViaWorker } from '../capture-state';\nimport { matchesSavedListContext } from '../saved-list-match';\n",
)
replace_once(
    'src/extension/sidepanel/capture.ts',
    "  type ListMessageResponse = { listPlaces?: CurrentResearchPlace[] };\n",
    "  type ListMessageResponse = { listPlaces?: CurrentResearchPlace[]; listName?: string; truncated?: boolean };\n",
)

path = Path('src/extension/sidepanel/capture.ts')
text = path.read_text(encoding='utf-8')
old = """    const contextTags = (context?.tags ?? []).map((tag) => tag.trim().toLowerCase());\n    const contextTitle = (context?.title ?? '').trim().toLowerCase();\n    const targetList = store.detectedAllLists.find((list) => {\n      const name = list.listName.toLowerCase();\n      return contextTags.some((tag) => tag && (name === tag || name.includes(tag) || tag.includes(name)))\n        || Boolean(contextTitle && (name.includes(contextTitle) || contextTitle.includes(name)));\n    }) || (store.detectedAllLists.length === 1 ? store.detectedAllLists[0] : undefined);\n"""
new = """    const targetList = store.detectedAllLists.find((list) => matchesSavedListContext(list.listName, context))\n      || (store.detectedAllLists.length === 1 ? store.detectedAllLists[0] : undefined);\n"""
if old not in text:
    raise SystemExit('sidepanel list matching target missing')
text = text.replace(old, new, 1)
old = """  const directListPlaces = Array.isArray(listResp?.listPlaces) ? listResp.listPlaces : [];\n  store.detectedListPlaces = store.detectedSavedList?.places.length\n    ? store.detectedSavedList.places\n    : directListPlaces;\n"""
new = """  const directListPlaces = Array.isArray(listResp?.listPlaces) ? listResp.listPlaces : [];\n  if ((!store.detectedSavedList || store.detectedSavedList.places.length === 0) && directListPlaces.length > 0 && listResp?.listName) {\n    store.detectedSavedList = {\n      listName: listResp.listName,\n      listUrl: tab.url || '',\n      detectedCurrency: placeResp?.detectedCurrency,\n      places: directListPlaces,\n      truncated: Boolean(listResp.truncated),\n    };\n  }\n  store.detectedListPlaces = store.detectedSavedList?.places.length\n    ? store.detectedSavedList.places\n    : directListPlaces;\n"""
if old not in text:
    raise SystemExit('direct visible list promotion target missing')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')

# UI uses the same list/context matching semantics.
replace_once(
    'src/extension/sidepanel/ui.ts',
    "import { escapeHtml, isPlausiblePriceText } from '../utils';\n",
    "import { escapeHtml, isPlausiblePriceText } from '../utils';\nimport { matchesSavedListContext } from '../saved-list-match';\n",
)
path = Path('src/extension/sidepanel/ui.ts')
text = path.read_text(encoding='utf-8')
old = """    const listNameNorm = store.detectedSavedList.listName.toLowerCase();\n    const tripTags = (activeTrip.tags || []).map((tag) => tag.toLowerCase());\n    const tripTitleNorm = activeTrip.title.toLowerCase();\n    const isMatched =\n      tripTags.includes(listNameNorm) ||\n      tripTags.some((tag) => tag && (listNameNorm.includes(tag) || tag.includes(listNameNorm))) ||\n      listNameNorm.includes(tripTitleNorm) ||\n      tripTitleNorm.includes(listNameNorm);\n"""
new = """    const isMatched = matchesSavedListContext(store.detectedSavedList.listName, activeTrip);\n"""
if old not in text:
    raise SystemExit('UI list matching target missing')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')

# Put the pure regression test on the normal extension gate.
root = Path('package.json')
data = json.loads(root.read_text(encoding='utf-8'))
old_script = data['scripts']['validate:extension']
if 'src/extension/saved-list-match.test.ts' not in old_script:
    data['scripts']['validate:extension'] = old_script.replace('src/extension/utils.test.ts', 'src/extension/utils.test.ts src/extension/saved-list-match.test.ts')
root.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Capture Google Maps detection and saved-list matching repair applied')
