from pathlib import Path

p = Path('src/services/PlannerRepository.release-closeout.test.ts')
text = p.read_text()
text = text.replace("    await repo.upsert(place('primary', 'Primary'));\n    await repo.upsert(place('secondary', 'Secondary'));", "    await repo.importCapturedPlaces([place('primary', 'Primary'), place('secondary', 'Secondary')]);")
text = text.replace("    await repo.upsert(place('primary', 'Primary', 'same-google-id'));\n    await repo.upsert(place('secondary', 'Secondary', 'same-google-id'));\n    const visit = await repo.addVisit('secondary', '2026-10-06');\n    store.failDeleteContaining = 'secondary';", "    await repo.importCapturedPlaces([place('primary', 'Primary', 'same-google-id')]);\n    store.failDeleteContaining = 'secondary';\n    await repo.importCapturedPlaces([place('secondary', 'Secondary', 'same-google-id')]);\n    const visit = await repo.addVisit('secondary', '2026-10-06');")
text = text.replace("    await repo.upsert(place('repeat', 'Repeat place'));", "    await repo.importCapturedPlaces([place('repeat', 'Repeat place')]);")
p.write_text(text)
