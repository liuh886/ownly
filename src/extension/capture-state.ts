import {
  asCaptureCandidate,
  mergeCaptureState,
  type CaptureContext,
  type ImportReport,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../domain/planner';

export const CAPTURE_STORAGE_KEY = 'ownlyCaptureStateV2';

export const EMPTY_CAPTURE_STATE: OwnlyCaptureState = {
  version: 2,
  activeContext: null,
  pendingPlaces: [],
};

function normalizeContext(value: unknown): CaptureContext | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as Partial<CaptureContext>;
  if (typeof context.tripId !== 'string' || !context.tripId.trim()) return null;
  if (typeof context.title !== 'string' || !context.title.trim()) return null;
  return {
    tripId: context.tripId,
    title: context.title,
    currency: typeof context.currency === 'string' && context.currency.trim() ? context.currency.trim().toUpperCase() : undefined,
    tags: Array.isArray(context.tags) ? context.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : undefined,
  };
}

function normalizePlaces(value: unknown): OwnlyCaptureState['pendingPlaces'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PlannerTripPlace => Boolean(
      item
      && typeof item === 'object'
      && typeof (item as PlannerTripPlace).id === 'string'
      && typeof (item as PlannerTripPlace).trip_id === 'string'
    ))
    .map((item) => {
      const placeFacts = { ...item } as PlannerTripPlace & Record<string, unknown>;
      for (const key of ['scheduled_date', 'scheduled_start', 'sort_order', 'locked', 'is_anchor', 'anchor_type']) {
        delete placeFacts[key];
      }
      return asCaptureCandidate(placeFacts);
    });
}

function normalizeImportReport(value: unknown): ImportReport | undefined {
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
}

export async function readCaptureState(): Promise<OwnlyCaptureState> {
  const result = await chrome.storage.local.get(CAPTURE_STORAGE_KEY);
  return normalizeCaptureState(result[CAPTURE_STORAGE_KEY]);
}

type WorkerSuccess<T> = { ok: true; state?: OwnlyCaptureState; result?: T };
type WorkerResult<T> = WorkerSuccess<T> | { ok: false; error?: string };

async function sendWorker<T>(message: Record<string, unknown>): Promise<WorkerSuccess<T>> {
  const response = await chrome.runtime.sendMessage(message) as WorkerResult<T> | undefined;
  if (!response || response.ok !== true) throw new Error(response?.error || 'Ownly Capture background worker did not persist state');
  return response;
}

export async function saveCaptureStateViaWorker(
  next: OwnlyCaptureState,
  locallyDeletedIds?: ReadonlySet<string>,
): Promise<{ ok: true; state: OwnlyCaptureState }> {
  const response = await sendWorker<void>({
    type: 'CAPTURE_SAVE_STATE',
    state: next,
    locallyDeletedIds: locallyDeletedIds ? [...locallyDeletedIds] : [],
  });
  if (!response.state) throw new Error('Capture worker returned no state');
  return { ok: true, state: response.state };
}

export async function mergeWriteCaptureState(
  local: OwnlyCaptureState,
  locallyDeletedIds?: ReadonlySet<string>,
): Promise<OwnlyCaptureState> {
  return (await saveCaptureStateViaWorker(local, locallyDeletedIds)).state;
}

export async function writeCaptureState(next: OwnlyCaptureState): Promise<void> {
  await sendWorker<void>({ type: 'CAPTURE_REPLACE_STATE', state: next });
}

export async function applyImportReportViaWorker(report: ImportReport): Promise<{ ok: true }> {
  await sendWorker<void>({ type: 'CAPTURE_APPLY_IMPORT_REPORT', report });
  return { ok: true };
}

export async function setCaptureContextViaWorker(context: CaptureContext | null): Promise<{ ok: true }> {
  await sendWorker<void>({ type: 'CAPTURE_SET_CONTEXT', context });
  return { ok: true };
}

let workerOpChain: Promise<unknown> = Promise.resolve();

/** Background-service-worker only: the sole direct writer to capture storage. */
export function mutateCaptureStateInWorker<R>(
  mutate: (current: OwnlyCaptureState) => { state: OwnlyCaptureState; result: R },
): Promise<R> {
  const run = workerOpChain.then(async () => {
    const current = await readCaptureState();
    const { state, result } = mutate(current);
    await chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: normalizeCaptureState(state) });
    return result;
  });
  workerOpChain = run.then(() => undefined, () => undefined);
  return run;
}

export { mergeCaptureState };
