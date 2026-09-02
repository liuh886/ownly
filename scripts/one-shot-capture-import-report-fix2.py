from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


# Capture metadata is normalized at the inbox boundary. Optional typing keeps
# ordinary PlannerTripPlace constructors usable; asCaptureCandidate materializes pending.
replace('src/domain/planner.ts', "  status: ImportStatus;\n", "  status?: ImportStatus;\n")
replace(
    'src/domain/planner.ts',
    """export function asCaptureCandidate(place: PlannerTripPlace | CaptureCandidate): CaptureCandidate {
  const status = place.status === 'failed' || place.status === 'imported' ? place.status : 'pending';
  return {
    ...place,
    status,
    reason: status === 'failed' ? place.reason : undefined,
    lastAttempt: status === 'failed' ? place.lastAttempt : undefined,""",
    """export function asCaptureCandidate(place: PlannerTripPlace | CaptureCandidate): CaptureCandidate {
  const capture = place as CaptureCandidate;
  const status = capture.status === 'failed' || capture.status === 'imported' ? capture.status : 'pending';
  return {
    ...place,
    status,
    reason: status === 'failed' ? capture.reason : undefined,
    lastAttempt: status === 'failed' ? capture.lastAttempt : undefined,""",
)

# External/manual imports also consume the new report instead of treating it as an array.
replace(
    'src/components/planner/ImportCandidatesModal.tsx',
    """      const importedIds = await plannerRepository.importExternalCandidates(parsedPlaces);
      onImportSuccess(importedIds.length);
      if (importedIds.length < parsedPlaces.length) {
        const imported = new Set(importedIds);
        const remaining = parsedPlaces.filter((place) => !imported.has(place.id));
        setParsedPlaces(remaining);
        setErrorMsg(zh
          ? `已写入 ${importedIds.length} 个，仍有 ${remaining.length} 个未写入；请检查数据目录后重试。`
          : `Imported ${importedIds.length}; ${remaining.length} place(s) remain. Check the data directory and retry.`);
        return;
      }""",
    """      const report = await plannerRepository.importExternalCandidates(parsedPlaces);
      onImportSuccess(report.imported.length);
      if (report.failed.length > 0) {
        const imported = new Set(report.imported);
        const remaining = parsedPlaces.filter((place) => !imported.has(place.id));
        setParsedPlaces(remaining);
        const reasons = report.failed.map((item) => `${item.title}: ${item.reason}`).join(zh ? '；' : '; ');
        setErrorMsg(zh
          ? `已写入 ${report.imported.length} 个，拒绝 ${report.failed.length} 个：${reasons}`
          : `Imported ${report.imported.length}; rejected ${report.failed.length}: ${reasons}`);
        return;
      }""",
)

# Remove the obsolete success-ID-only ACK regression and assert the authoritative report path.
replace('src/domain/planner.test.ts', "  acknowledgeCapturedPlaces,\n", "  applyCaptureImportReport,\n")
replace(
    'src/domain/planner.test.ts',
    """  it('acknowledges captured places without touching other queue entries', () => {
    const state = {
      version: 2 as const,
      activeContext: { tripId: 'trip-1', title: 'Tokyo' },
      pendingPlaces: [place('keep'), place('drop')],
    };
    const next = acknowledgeCapturedPlaces(state, ['drop']);
    expect(next.pendingPlaces.map((p) => p.id)).toEqual(['keep']);
    expect(state.pendingPlaces).toHaveLength(2);
  });""",
    """  it('applies import reports without touching unrelated queue entries', () => {
    const state = {
      version: 2 as const,
      activeContext: { tripId: 'trip-1', title: 'Tokyo' },
      pendingPlaces: [place('keep'), place('drop')],
    };
    const next = applyCaptureImportReport(state, {
      received: 1,
      imported: ['drop'],
      failed: [],
    }, '2026-09-02');
    expect(next.pendingPlaces.map((p) => p.id)).toEqual(['keep']);
    expect(state.pendingPlaces).toHaveLength(2);
  });""",
)
