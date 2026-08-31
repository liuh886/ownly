from pathlib import Path

p = Path('.github/tmp-saved-list-enrichment.py')
text = p.read_text()
text = text.replace("btnEnrichCandidates: '⚡ Enrich info',", "btnEnrichCandidates: '⚡ Enrich Info',")
text = text.replace(
    "enrichComplete: (count: number) => `✓ Enrichment complete — enriched ${count} places with details and prices!`,",
    "enrichComplete: (count: number) => `✓ Enrichment complete! Enriched details & prices for ${count} places.`,",
)
text = text.replace(
    "enrichNoneNeeded: 'Selected candidates already have complete info and prices.',",
    "enrichNoneNeeded: 'Selected candidates already have complete details and prices.',",
)
needle = '  el.btnBackupState.addEventListener""",\n)'
if text.count(needle) != 1:
    raise SystemExit(f'Expected one duplicated backup handler marker, found {text.count(needle)}')
text = text.replace(needle, '""",\n)', 1)
p.write_text(text)
