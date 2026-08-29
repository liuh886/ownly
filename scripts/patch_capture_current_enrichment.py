from pathlib import Path

path = Path('src/extension/content.ts')
text = path.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    "          const coordinates = parseEntityListCoordinates(placeInfo);\n          const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;\n\n          const research = PLACE_PARSER.extractEntityListResearch(item, title);",
    "          const coordinates = parseEntityListCoordinates(placeInfo);\n          const sourcePlaceId = findEntityListPlaceId(item);\n          const sourceUrl = googleMapsDetailUrlFromSourceId(sourcePlaceId, title, window.location.origin)\n            || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;\n\n          const research = PLACE_PARSER.extractEntityListResearch(item, title);",
    'canonical saved-list source url',
)
replace_once(
    "            coordinates,\n            sourcePlaceId: findEntityListPlaceId(item),",
    "            coordinates,\n            sourcePlaceId,",
    'reuse saved-list source id',
)
replace_once(
    "        detectedCurrency: detectCurrencyFromPage(\n          place.sourceUrl,\n          nextPrice,\n          facts.priceCurrency ?? place.detectedCurrency ?? list.detectedCurrency,\n          overrideCurrency,\n        ),",
    "        detectedCurrency: overrideCurrency\n          || facts.priceCurrency\n          || detectCurrencyFromPage(\n            place.sourceUrl,\n            nextPrice,\n            place.detectedCurrency ?? list.detectedCurrency,\n            undefined,\n          ),",
    'detail currency authority',
)
replace_once(
    "        const place = currentPlace();\n        sendResponse({ place, savedList, allLists, detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, targetCurrency, overrideCurrency) });",
    "        const detectedPlace = currentPlace();\n        const place = provider === 'google_maps' && detectedPlace\n          ? await enrichFromPlaceHtml(detectedPlace)\n          : detectedPlace;\n        sendResponse({ place, savedList, allLists, detectedCurrency: detectCurrencyFromPage(window.location.href, undefined, targetCurrency, overrideCurrency) });",
    'activate current-place enrichment',
)

path.write_text(text, encoding='utf-8')
print('final capture enrichment wiring applied')
