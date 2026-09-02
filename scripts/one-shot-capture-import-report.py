from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


# Domain: explicit capture import lifecycle and report.
replace(
    'src/domain/planner.ts',
    """export interface CaptureContext {
  tripId: string;
  title: string;
  currency?: string;
  tags?: string[];
}

export interface OwnlyCaptureState {
  version: 2;
  activeContext: CaptureContext | null;
  pendingPlaces: PlannerTripPlace[];
}

export const EMPTY_CAPTURE_STATE: OwnlyCaptureState = {
  version: 2,
  activeContext: null,
  pendingPlaces: [],
};

export function acknowledgeCapturedPlaces(state: OwnlyCaptureState, placeIds: string[]): OwnlyCaptureState {
  const ids = new Set(placeIds);
  return { ...state, pendingPlaces: state.pendingPlaces.filter((place) => !ids.has(place.id)) };
}

export function asCaptureCandidate(place: PlannerTripPlace): PlannerTripPlace {
  return {
    ...place,
    reservation_status: place.reservation_status ?? 'none',
    state: 'candidate',
  };
}
""",
    """export interface CaptureContext {
  tripId: string;
  title: string;
  currency?: string;
  tags?: string[];
}

export type ImportStatus = 'pending' | 'imported' | 'failed';

export interface ImportFailure {
  id: string;
  title: string;
  reason: string;
}

export interface ImportReport {
  received: number;
  imported: string[];
  failed: ImportFailure[];
}

export type CaptureCandidate = PlannerTripPlace & {
  status: ImportStatus;
  reason?: string;
  lastAttempt?: string;
};

export interface OwnlyCaptureState {
  version: 2;
  activeContext: CaptureContext | null;
  pendingPlaces: CaptureCandidate[];
  lastImportReport?: ImportReport;
}

export const EMPTY_CAPTURE_STATE: OwnlyCaptureState = {
  version: 2,
  activeContext: null,
  pendingPlaces: [],
};

export function applyCaptureImportReport(
  state: OwnlyCaptureState,
  report: ImportReport,
  attemptedAt: string,
): OwnlyCaptureState {
  const imported = new Set(report.imported);
  const failedById = new Map(report.failed.map((item) => [item.id, item] as const));
  return {
    ...state,
    pendingPlaces: state.pendingPlaces
      .filter((place) => !imported.has(place.id))
      .map((place) => {
        const failed = failedById.get(place.id);
        if (!failed) return place;
        return { ...place, status: 'failed', reason: failed.reason, lastAttempt: attemptedAt };
      }),
    lastImportReport: report,
  };
}

export function asCaptureCandidate(place: PlannerTripPlace | CaptureCandidate): CaptureCandidate {
  const status = place.status === 'failed' || place.status === 'imported' ? place.status : 'pending';
  return {
    ...place,
    status,
    reason: status === 'failed' ? place.reason : undefined,
    lastAttempt: status === 'failed' ? place.lastAttempt : undefined,
    reservation_status: place.reservation_status ?? 'none',
    state: 'candidate',
  };
}
""",
)
replace(
    'src/domain/planner.ts',
    """  return {
    version: 2,
    activeContext: fresh.activeContext,
    pendingPlaces: [...localPlaces, ...backgroundOnly],
  };
}""",
    """  return {
    version: 2,
    activeContext: fresh.activeContext,
    pendingPlaces: [...localPlaces, ...backgroundOnly],
    lastImportReport: local.lastImportReport ?? fresh.lastImportReport,
  };
}""",
)

# Capture state: persist full report and failed statuses.
replace(
    'src/extension/capture-state.ts',
    """  type CaptureContext,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../domain/planner';""",
    """  type CaptureContext,
  type ImportReport,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../domain/planner';""",
)
replace('src/extension/capture-state.ts', "function normalizePlaces(value: unknown): PlannerTripPlace[] {", "function normalizePlaces(value: unknown): OwnlyCaptureState['pendingPlaces'] {")
replace(
    'src/extension/capture-state.ts',
    """export function normalizeCaptureState(value: unknown): OwnlyCaptureState {
  if (!value || typeof value !== 'object') return { ...EMPTY_CAPTURE_STATE };
  const state = value as Partial<OwnlyCaptureState> & { version?: unknown };
  if (state.version !== 2) return { ...EMPTY_CAPTURE_STATE };
  return {
    version: 2,
    activeContext: normalizeContext(state.activeContext),
    pendingPlaces: normalizePlaces(state.pendingPlaces),
  };
}""",
    """function normalizeImportReport(value: unknown): ImportReport | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const report = value as Partial<ImportReport>;
  if (typeof report.received !== 'number' || !Array.isArray(report.imported) || !Array.isArray(report.failed)) return undefined;
  const imported = report.imported.filter((id): id is string => typeof id === 'string' && id.length > 0);
  const failed = report.failed.filter((item): item is ImportReport['failed'][number] => Boolean(
    item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.reason === 'string'
  ));
  return { received: report.received, imported, failed };
}

export function normalizeCaptureState(value: unknown): OwnlyCaptureState {
  if (!value || typeof value !== 'object') return { ...EMPTY_CAPTURE_STATE };
  const state = value as Partial<OwnlyCaptureState> & { version?: unknown };
  if (state.version !== 2) return { ...EMPTY_CAPTURE_STATE };
  return {
    version: 2,
    activeContext: normalizeContext(state.activeContext),
    pendingPlaces: normalizePlaces(state.pendingPlaces),
    lastImportReport: normalizeImportReport(state.lastImportReport),
  };
}""",
)
replace(
    'src/extension/capture-state.ts',
    """export async function ackPlacesViaWorker(placeIds: string[]): Promise<{ ok: true }> {
  await sendWorker<void>({ type: 'CAPTURE_ACK_PLACES', placeIds });
  return { ok: true };
}""",
    """export async function applyImportReportViaWorker(report: ImportReport): Promise<{ ok: true }> {
  await sendWorker<void>({ type: 'CAPTURE_APPLY_IMPORT_REPORT', report });
  return { ok: true };
}""",
)

# Background worker remains the single writer.
replace(
    'src/extension/background.ts',
    """  ensurePlaceKindTag,
  findExistingTripPlace,
  inferPlaceKind,
  mergeCaptureState,
  type CaptureContext,
  type PlannerTripPlace,
} from '../domain/planner';""",
    """  applyCaptureImportReport,
  asCaptureCandidate,
  ensurePlaceKindTag,
  findExistingTripPlace,
  inferPlaceKind,
  mergeCaptureState,
  type CaptureContext,
  type ImportReport,
  type PlannerTripPlace,
} from '../domain/planner';""",
)
replace('src/extension/background.ts', "      const candidate: PlannerTripPlace = {", "      const candidate = asCaptureCandidate({")
replace(
    'src/extension/background.ts',
    """        updated_at: now,
      };

      return {
        state: {""",
    """        updated_at: now,
      } satisfies PlannerTripPlace);

      return {
        state: {""",
)
replace(
    'src/extension/background.ts',
    "      state: { version: 2, activeContext: current.activeContext, pendingPlaces: incoming.pendingPlaces },",
    "      state: { version: 2, activeContext: current.activeContext, pendingPlaces: incoming.pendingPlaces, lastImportReport: incoming.lastImportReport },",
)
replace(
    'src/extension/background.ts',
    """  if (type === 'CAPTURE_ACK_PLACES') {
    const placeIds = (message as { placeIds?: unknown }).placeIds;
    const ids = Array.isArray(placeIds) ? new Set(placeIds.filter((id): id is string => typeof id === 'string')) : new Set<string>();
    void mutateCaptureStateInWorker((current) => ({
      state: { ...current, pendingPlaces: current.pendingPlaces.filter((place) => !ids.has(place.id)) },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }""",
    """  if (type === 'CAPTURE_APPLY_IMPORT_REPORT') {
    const report = (message as { report?: ImportReport }).report;
    if (!report || typeof report.received !== 'number' || !Array.isArray(report.imported) || !Array.isArray(report.failed)) {
      sendResponse({ ok: false, error: 'invalid import report' });
      return;
    }
    const attemptedAt = new Date().toISOString().slice(0, 10);
    void mutateCaptureStateInWorker((current) => ({
      state: applyCaptureImportReport(current, report, attemptedAt),
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }""",
)

# Extension page bridge sends the full report.
replace(
    'src/extension/ownly-bridge.ts',
    "import type { CaptureContext } from '../domain/planner';\nimport { ackPlacesViaWorker, readCaptureState, setCaptureContextViaWorker } from './capture-state';",
    "import type { CaptureContext, ImportReport } from '../domain/planner';\nimport { applyImportReportViaWorker, readCaptureState, setCaptureContextViaWorker } from './capture-state';",
)
replace(
    'src/extension/ownly-bridge.ts',
    """      if (message.type === 'ACK_CAPTURED_PLACES') {
        const payload = message.payload as { placeIds?: string[] } | undefined;
        const ids = Array.isArray(payload?.placeIds) ? payload.placeIds : [];
        await ackPlacesViaWorker(ids);
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'ACK_CAPTURED_PLACES_RESULT', payload: { ok: true } }, getTargetOrigin());
        return;
      }""",
    """      if (message.type === 'APPLY_CAPTURE_IMPORT_REPORT') {
        const payload = message.payload as { report?: ImportReport } | undefined;
        if (!payload?.report) throw new Error('Capture import report is missing');
        await applyImportReportViaWorker(payload.report);
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'APPLY_CAPTURE_IMPORT_REPORT_RESULT', payload: { ok: true } }, getTargetOrigin());
        return;
      }""",
)

# Planner bridge exposes only report application.
replace('src/components/planner/capture-bridge.ts', "import type { CaptureContext, OwnlyCaptureState } from '@/domain/planner';", "import type { CaptureContext, ImportReport, OwnlyCaptureState } from '@/domain/planner';")
replace(
    'src/components/planner/capture-bridge.ts',
    """export async function ackCapturedPlaces(placeIds: string[]): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('ACK_CAPTURED_PLACES', { placeIds });
  return result?.ok === true;
}""",
    """export async function applyCaptureImportReport(report: ImportReport): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('APPLY_CAPTURE_IMPORT_REPORT', { report });
  return result?.ok === true;
}""",
)

# Repository returns complete report and never silently continues.
replace('src/services/PlannerRepository.ts', "  plannerTripLegFileName,\n  type PlannerTrip,", "  plannerTripLegFileName,\n  type ImportReport,\n  type PlannerTrip,")
p = Path('src/services/PlannerRepository.ts')
text = p.read_text()
old_start = "  private async importResearchPlaces(places: PlannerTripPlace[]): Promise<string[]> {"
old_end = "\n  /**\n   * Scans all places in a trip and auto-merges only proven strong identities."
i = text.index(old_start)
j = text.index(old_end, i)
new_method = """  private async importResearchPlaces(places: PlannerTripPlace[]): Promise<ImportReport> {
    const report: ImportReport = { received: places.length, imported: [], failed: [] };
    if (places.length === 0) return report;
    await this.initialize();
    const existingTrips = new Set((await this.listTrips()).map((t) => t.id));
    const existing = await this.listPlaces();
    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byStrongIdentity = new Map<string, PlannerTripPlace>();

    const indexPlace = (place: PlannerTripPlace) => {
      byId.set(place.id, place);
      for (const key of getStrongPlaceIdentityKeys(place)) {
        byStrongIdentity.set(`${place.trip_id}::${key}`, place);
      }
    };
    existing.forEach(indexPlace);
    const touchedTripIds = new Set<string>();

    for (const rawPlace of places) {
      const title = rawPlace.title?.trim() || '(untitled place)';
      if (!rawPlace.id || !rawPlace.trip_id) {
        report.failed.push({ id: rawPlace.id || 'unknown', title, reason: 'invalid_payload' });
        continue;
      }
      if (!existingTrips.has(rawPlace.trip_id)) {
        report.failed.push({ id: rawPlace.id, title, reason: 'unknown_trip' });
        continue;
      }
      touchedTripIds.add(rawPlace.trip_id);
      const { status: _status, reason: _reason, lastAttempt: _lastAttempt, ...plannerFields } = rawPlace;
      const incoming: PlannerTripPlace = {
        ...plannerFields,
        tags: ensurePlaceKindTag(rawPlace.tags, rawPlace.kind),
        reservation_status: rawPlace.reservation_status ?? 'none',
        state: 'candidate',
      };
      let existingPlace = byId.get(incoming.id);
      if (!existingPlace) {
        for (const key of getStrongPlaceIdentityKeys(incoming)) {
          const match = byStrongIdentity.get(`${incoming.trip_id}::${key}`);
          if (match) {
            existingPlace = match;
            break;
          }
        }
      }

      try {
        const persisted = existingPlace ? mergeCapturedPlaceResearch(existingPlace, incoming) : incoming;
        await this.upsert(persisted);
        indexPlace(persisted);
        report.imported.push(rawPlace.id);
      } catch (error) {
        const reason = error instanceof Error && error.message ? `write_failed:${error.message}` : 'write_failed';
        report.failed.push({ id: rawPlace.id, title, reason });
        console.warn(`[PlannerRepository] Failed to import research place ${rawPlace.id} (${title}):`, error);
      }
    }

    for (const tripId of touchedTripIds) {
      try {
        await this.deduplicateTripPlaces(tripId);
      } catch (err) {
        console.warn(`[PlannerRepository] Auto-deduplication for trip ${tripId} encountered warning:`, err);
      }
    }

    return report;
  }
"""
p.write_text(text[:i] + new_method + text[j:])
replace(
    'src/services/PlannerRepository.ts',
    "  async importCapturedPlaces(places: PlannerTripPlace[]): Promise<string[]> { return this.importResearchPlaces(places); }\n  async importExternalCandidates(places: PlannerTripPlace[]): Promise<string[]> { return this.importResearchPlaces(places); }",
    "  async importCapturedPlaces(places: PlannerTripPlace[]): Promise<ImportReport> { return this.importResearchPlaces(places); }\n  async importExternalCandidates(places: PlannerTripPlace[]): Promise<ImportReport> { return this.importResearchPlaces(places); }",
)

# Planner sync consumes report atomically.
replace('src/components/planner/PlannerHome.tsx', "import { ackCapturedPlaces, pullCaptureState, setCaptureContext } from './capture-bridge';", "import { applyCaptureImportReport, pullCaptureState, setCaptureContext } from './capture-bridge';")
replace(
    'src/components/planner/PlannerHome.tsx',
    """        const importedIds = await plannerRepository.importCapturedPlaces(state.pendingPlaces);
        if (importedIds.length > 0) {
          const acknowledged = await ackCapturedPlaces(importedIds);
          if (!acknowledged) throw new Error('Capture ACK failed');
        }
        setCapturePending(state.pendingPlaces.length - importedIds.length);
        setNotice(zh
          ? `已同步 ${importedIds.length} 个研究候选。`
          : `Synced ${importedIds.length} research candidates.`);""",
    """        const report = await plannerRepository.importCapturedPlaces(state.pendingPlaces);
        const applied = await applyCaptureImportReport(report);
        if (!applied) throw new Error('Capture import report apply failed');
        setCapturePending(report.failed.length);
        setNotice(zh
          ? `收到 ${report.received} 个候选；已导入 ${report.imported.length}；失败 ${report.failed.length}${report.failed.length ? `。Rejected: ${report.failed.length} · ${report.failed.map((item) => `${item.title}: ${item.reason}`).join('；')}` : ''}`
          : `Received ${report.received}; imported ${report.imported.length}; failed ${report.failed.length}${report.failed.length ? `. Rejected: ${report.failed.length} · ${report.failed.map((item) => `${item.title}: ${item.reason}`).join('; ')}` : ''}`);""",
)

# Capture diagnostics prepend a durable import summary.
replace(
    'src/extension/sidepanel/ui.ts',
    """  const logs = logger.getAllFormattedText();
  viewer.textContent = logs || (store.lang === 'zh' ? '[暂无调试日志]' : '[No debug logs yet]');""",
    """  const logs = logger.getAllFormattedText();
  const report = store.state.lastImportReport;
  const importDebug = report
    ? [
        'Capture Import Debug',
        `Received: ${report.received}`,
        `Imported: ${report.imported.length}`,
        `Failed: ${report.failed.length}`,
        ...(report.failed.length > 0
          ? ['Failed Items:', ...report.failed.flatMap((item) => [`• ${item.title}`, `  Reason: ${item.reason}`]), 'Retry available']
          : []),
      ].join('\n')
    : '';
  viewer.textContent = [importDebug, logs].filter(Boolean).join('\n\n') || (store.lang === 'zh' ? '[暂无调试日志]' : '[No debug logs yet]');""",
)

# Existing repository tests consume report fields.
for file in ['src/services/PlannerRepository.schedule.test.ts', 'src/services/PlannerRepository.thailand-golden-path.test.ts']:
    p = Path(file)
    text = p.read_text()
    text = text.replace("expect(imported).toContain('p-thip-new');", "expect(imported.imported).toContain('p-thip-new');\n    expect(imported.failed).toEqual([]);")
    text = text.replace("expect(imported).toHaveLength(5);", "expect(imported.received).toBe(5);\n    expect(imported.imported).toHaveLength(5);\n    expect(imported.failed).toEqual([]);")
    p.write_text(text)

# Release regression: 48 received must never become a silent 45.
Path('src/services/PlannerRepository.capture-import-report.test.ts').write_text(r'''import { beforeEach, describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';
import { PlannerRepository, type PlannerFileStore } from './PlannerRepository';

class MemoryStore implements PlannerFileStore {
  private files = new Map<string, string>();
  async getDataFolder() { return 'Ownly'; }
  async readMarkdownFiles(directory: string) {
    const prefix = `${directory}/`;
    return [...this.files.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, content]) => ({ fileName: key.slice(prefix.length), content }));
  }
  async writeMarkdownFile(directory: string, fileName: string, content: string) {
    if (content.includes('id: fail-write')) throw new Error('simulated_disk_error');
    this.files.set(`${directory}/${fileName}`, content);
  }
  async deleteMarkdownFile(directory: string, fileName: string) { this.files.delete(`${directory}/${fileName}`); }
}

function candidate(id: string, title: string, tripId = 'trip-release'): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: tripId, title,
    source_provider: 'google_maps', source_url: `https://www.google.com/maps/place/?q=place_id:${id}`,
    source_place_id: id, kind: title.includes('Airport') ? 'transit' : 'attraction',
    tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate', created_at: '2026-09-02T00:00:00.000Z',
  };
}

describe('Capture import release regression', () => {
  let repo: PlannerRepository;
  beforeEach(async () => {
    repo = new PlannerRepository(new MemoryStore());
    const trip: PlannerTrip = {
      schema_version: '0.1', type: 'trip', id: 'trip-release', title: 'Thailand release fixture', status: 'planning',
      start_date: '2026-10-05', end_date: '2026-10-13', destinations: ['Bangkok', 'Chiang Mai'], created_at: '2026-09-02T00:00:00.000Z',
    };
    await repo.upsertTrip(trip);
  });

  it('reports every rejected candidate instead of silently dropping 48 -> 45', async () => {
    const places = Array.from({ length: 48 }, (_, i) => candidate(`place-${i + 1}`, `Place ${i + 1}`));
    places[0] = candidate('bkk-airport', 'Suvarnabhumi Airport');
    places[1] = candidate('dmk-airport', 'Don Mueang Airport');
    places[45] = { ...candidate('invalid-payload', 'Invalid payload'), trip_id: '' };
    places[46] = candidate('wrong-trip', 'Same-name location', 'missing-trip');
    places[47] = candidate('fail-write', 'Write failure cafe');

    const report = await repo.importCapturedPlaces(places);

    expect(report.received).toBe(48);
    expect(report.imported).toHaveLength(45);
    expect(report.failed).toHaveLength(3);
    expect(report.failed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'invalid-payload', reason: 'invalid_payload' }),
      expect.objectContaining({ id: 'wrong-trip', reason: 'unknown_trip' }),
      expect.objectContaining({ id: 'fail-write', reason: expect.stringContaining('write_failed') }),
    ]));
    expect(report.imported.length + report.failed.length).toBe(report.received);
    expect(await repo.listPlaces()).toHaveLength(45);
  });
});
''')

# Capture state regression: failed retained, imported removed.
Path('src/extension/capture-import-report.test.ts').write_text(r'''import { describe, expect, it } from 'vitest';
import { applyCaptureImportReport, asCaptureCandidate, type OwnlyCaptureState, type PlannerTripPlace } from '../domain/planner';

const place = (id: string, title = id): PlannerTripPlace => ({
  schema_version: '0.1', type: 'trip_place', id, trip_id: 'trip-1', title,
  source_provider: 'google_maps', source_url: `https://maps.google.com/?cid=${id}`, kind: 'transit',
  tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate', created_at: '2026-09-02T00:00:00.000Z',
});

describe('Capture import report application', () => {
  it('keeps failed candidates retryable and removes only imported candidates', () => {
    const state: OwnlyCaptureState = {
      version: 2,
      activeContext: { tripId: 'trip-1', title: 'Thailand' },
      pendingPlaces: [asCaptureCandidate(place('ok')), asCaptureCandidate(place('bkk', 'Suvarnabhumi Airport'))],
    };
    const next = applyCaptureImportReport(state, {
      received: 2,
      imported: ['ok'],
      failed: [{ id: 'bkk', title: 'Suvarnabhumi Airport', reason: 'missing_place_identity' }],
    }, '2026-09-02');

    expect(next.pendingPlaces).toHaveLength(1);
    expect(next.pendingPlaces[0]).toMatchObject({
      id: 'bkk', status: 'failed', reason: 'missing_place_identity', lastAttempt: '2026-09-02',
    });
    expect(next.lastImportReport).toMatchObject({ received: 2, imported: ['ok'] });
  });
});
''')

replace(
    'docs/CAPTURE_SYNC_BOUNDARY.md',
    """5. Planner ACKs imported candidate IDs. ACK failure is an error; pending candidates remain retryable.

There is no bidirectional database synchronization and no fallback writer.""",
    """5. Planner returns one `ImportReport` (`received`, `imported`, `failed`) to Capture.
6. Capture removes only `imported` IDs; failed candidates remain in the inbox with `status=failed`, `reason`, and `lastAttempt`, and the same report is shown in diagnostics.

There is no success-ID-only ACK, silent rejection, bidirectional database synchronization, or fallback writer.""",
)
