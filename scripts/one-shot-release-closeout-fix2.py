from pathlib import Path
p = Path('src/services/PlannerRepository.release-closeout.test.ts')
text = p.read_text()
text = text.replace("    await repo.importCapturedPlaces([place('primary', 'Primary'), place('secondary', 'Secondary')]);", "    await repo.upsertPlace(place('primary', 'Primary'));\n    await repo.upsertPlace(place('secondary', 'Secondary'));")
text = text.replace("    await repo.importCapturedPlaces([place('primary', 'Primary', 'same-google-id')]);\n    store.failDeleteContaining = 'secondary';\n    await repo.importCapturedPlaces([place('secondary', 'Secondary', 'same-google-id')]);", "    await repo.upsertPlace(place('primary', 'Primary', 'same-google-id'));\n    await repo.upsertPlace(place('secondary', 'Secondary', 'same-google-id'));\n    store.failDeleteContaining = 'secondary';")
text = text.replace("    await repo.importCapturedPlaces([place('repeat', 'Repeat place')]);", "    await repo.upsertPlace(place('repeat', 'Repeat place'));")
p.write_text(text)
