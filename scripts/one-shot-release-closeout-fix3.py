from pathlib import Path
p = Path('src/services/PlannerRepository.release-closeout.test.ts')
text = p.read_text()
old = "    await repo.upsertPlace(place('primary', 'Primary', 'same-google-id'));\n    await repo.upsertPlace(place('secondary', 'Secondary', 'same-google-id'));\n    store.failDeleteContaining = 'secondary';\n    const visit = await repo.addVisit('secondary', '2026-10-06');"
new = "    await repo.upsertPlace(place('primary', 'Primary', 'same-google-id'));\n    await repo.upsertPlace(place('secondary', 'Secondary', 'same-google-id'));\n    const visit = await repo.addVisit('secondary', '2026-10-06');\n    // Scheduled places are preferred as dedup primaries, so the unscheduled primary fixture becomes the deletion target.\n    store.failDeleteContaining = 'place--primary.md';"
if old not in text:
    raise SystemExit('dedup fixture target not found')
p.write_text(text.replace(old, new, 1))
