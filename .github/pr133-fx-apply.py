from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing target in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# FX is an independent always-on lightweight content script. Travel extraction stays provider-scoped.
replace_once(
    'src/extension/content.ts',
    "  convertPriceRange,\n  DEFAULT_USD_PIVOT,\n  inferPlaceKind,\n",
    "  inferPlaceKind,\n",
)

path = Path('src/extension/content.ts')
text = path.read_text(encoding='utf-8')
for block in [
    """  if (msgType === 'OWNLY_CURRENCY_OVERRIDE_CHANGED') {\n    const override = (message as { overrideCurrency?: string }).overrideCurrency;\n    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;\n    sendResponse({ ok: true, override: fxOverrideCurrency });\n    return true;\n  }\n""",
    """  if (msgType === 'OWNLY_FX_TOOLTIP_STATUS_CHANGED') {\n    const enabled = (message as { enabled?: boolean }).enabled !== false;\n    fxTooltipEnabled = enabled;\n    if (!enabled && tooltipHideFn) tooltipHideFn();\n    sendResponse({ ok: true });\n    return true;\n  }\n""",
    """  if (msgType === 'OWNLY_FX_CONFIG_UPDATED') {\n    const target = (message as { targetCurrency?: string }).targetCurrency;\n    const rates = (message as { rates?: Record<string, number> }).rates;\n    const enabled = (message as { enabled?: boolean }).enabled;\n    if (target) fxTargetCurrency = target;\n    if (rates) fxPivotRates = rates;\n    if (typeof enabled === 'boolean') fxTooltipEnabled = enabled;\n    sendResponse({ ok: true });\n    return true;\n  }\n""",
]:
    if block not in text:
        raise SystemExit('missing legacy FX handler')
    text = text.replace(block, '', 1)

marker = '// ==========================================\n// Currency Hover Conversion Tooltip Engine\n// ==========================================\n'
start = text.find(marker)
end = text.find("if (typeof window !== 'undefined' && typeof document !== 'undefined') {", start)
if start < 0 or end < 0:
    raise SystemExit('legacy FX engine boundary missing')
text = text[:start] + text[end:]
text = text.replace('  initFxTooltipEngine();\n', '', 1)
path.write_text(text, encoding='utf-8')

# Build the two responsibilities as separate bundles.
replace_once(
    'scripts/build-extension.mjs',
    "    content: path.join(root, 'src/extension/content.ts'),\n",
    "    content: path.join(root, 'src/extension/content.ts'),\n    'fx-tooltip': path.join(root, 'src/extension/fx-tooltip.ts'),\n",
)

# Manifest: provider Capture remains narrow; FX intentionally works on ordinary HTTP/S pages.
manifest_path = Path('extension/manifest.json')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['version'] = '0.5.2'
manifest['description'] = 'Capture travel research from Google Maps, Booking.com, Tabelog and Xiaohongshu into Ownly Planner, with selection FX conversion.'
travel_script = manifest['content_scripts'][0]
fx_script = {
    'matches': ['http://*/*', 'https://*/*'],
    'js': ['fx-tooltip.js'],
    'run_at': 'document_idle',
}
manifest['content_scripts'] = [travel_script, fx_script, *manifest['content_scripts'][1:]]
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Document current, deliberately small provider surface and independent FX tool.
docs_path = Path('docs/CAPTURE_SYNC_BOUNDARY.md')
docs = docs_path.read_text(encoding='utf-8')
permissions = '## Permissions\n\n'
section = '''## Supported research providers\n\nCapture place extraction is intentionally provider-specific rather than a generic scraper. The supported automatic adapters are:\n\n- Google Maps: place details and saved lists\n- Booking.com: accommodation title, rating and address\n- Tabelog: restaurant title, rating, category, price and address\n- Xiaohongshu: note title/content/location signals and note-derived place lists\n\nUnsupported websites are not silently parsed as Google Maps. New providers should be added only when they have a concrete extraction contract.\n\n## Selection FX\n\nSelection FX is not part of place extraction. `fx-tooltip.js` is a separate lightweight content script on ordinary HTTP/S pages: selecting recognizable price text opens a local conversion card using the trip currency (CNY when no trip is active) and the background worker's cached FX table. The side-panel toggle remains the single persisted on/off setting. Capture provider permissions and extraction logic stay narrow even though the FX helper is available across normal webpages.\n\n'''
if section not in docs:
    if permissions not in docs:
        raise SystemExit('docs permissions heading missing')
    docs = docs.replace(permissions, section + permissions, 1)
docs_path.write_text(docs, encoding='utf-8')

print('Capture provider/FX closeout applied')
