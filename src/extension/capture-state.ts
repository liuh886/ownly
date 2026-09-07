import {
  EMPTY_CAPTURE_STATE_V3,
  ensureInboxCollection,
  type OwnlyCaptureStateV3,
  type CaptureCollection,
  type CapturePlace,
} from '../domain/capture';

export const CAPTURE_STORAGE_KEY = 'ownlyCaptureStateV3';

/** Storage schema version this code understands. Never mutate storage holding a newer version. */
export const SUPPORTED_CAPTURE_STATE_VERSION = 3;

/**
 * Forward-compat rule: normalize must never drop keys it doesn't recognize.
 * Unknown fields ride along untouched so a future schema version's data
 * survives read→mutate→write cycles performed by this version.
 * (Outbound boundaries — share export, planner adapter — stay whitelist-based.)
 */
function carryUnknownKeys<T extends object>(source: unknown, known: T): T {
  if (!source || typeof source !== 'object') return known;
  const out = known as Record<string, unknown>;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!(key in out)) out[key] = value;
  }
  return known;
}

function normalizeCollection(value: unknown): CaptureCollection | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Partial<CaptureCollection>;
  if (typeof c.id !== 'string' || !c.id.trim()) return null;
  if (typeof c.title !== 'string' || !c.title.trim()) return null;
  return carryUnknownKeys(value, {
    id: c.id,
    title: c.title,
    source_provider: c.source_provider as CaptureCollection['source_provider'],
    source_list_id: c.source_list_id,
    source_url: c.source_url,
    currency: c.currency,
    created_at: c.created_at || new Date().toISOString(),
    updated_at: c.updated_at,
  });
}

function normalizePlace(value: unknown): CapturePlace | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<CapturePlace>;
  if (typeof p.id !== 'string' || !p.id.trim()) return null;
  if (typeof p.collection_id !== 'string' || !p.collection_id.trim()) return null;
  if (typeof p.title !== 'string' || !p.title.trim()) return null;
  if (!p.source || typeof p.source !== 'object') return null;
  const src = p.source as Partial<CapturePlace['source']>;
  if (typeof src.url !== 'string') return null;
  return carryUnknownKeys(value, {
    id: p.id,
    collection_id: p.collection_id,
    title: p.title,
    source: carryUnknownKeys(p.source, {
      provider: (src.provider as CapturePlace['source']['provider']) || 'other',
      url: src.url,
      place_id: src.place_id,
      category: src.category,
      types: Array.isArray(src.types) ? src.types.filter((t): t is string => typeof t === 'string') : undefined,
    }),
    address: p.address,
    coordinates: (() => {
      if (!p.coordinates || typeof p.coordinates !== 'object') return undefined;
      const lat = Number((p.coordinates as { lat?: unknown }).lat);
      const lng = Number((p.coordinates as { lng?: unknown }).lng);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180 &&
        (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)
      ) {
        return { lat, lng };
      }
      return undefined;
    })(),
    rating: typeof p.rating === 'number' ? p.rating : undefined,
    review_count: typeof p.review_count === 'number' ? p.review_count : undefined,
    price: p.price && typeof p.price === 'object' ? carryUnknownKeys(p.price, {
      raw: (p.price as Record<string, unknown>).raw as string | undefined,
      currency: (p.price as Record<string, unknown>).currency as string | undefined,
      min: (p.price as Record<string, unknown>).min as number | undefined,
      max: (p.price as Record<string, unknown>).max as number | undefined,
      unit: (p.price as Record<string, unknown>).unit as string | undefined,
      level: (p.price as Record<string, unknown>).level as number | undefined,
    }) : undefined,
    open_hours: p.open_hours,
    phone: p.phone,
    plus_code: p.plus_code,
    menu_url: p.menu_url,
    reservation_url: p.reservation_url,
    review_topics: Array.isArray(p.review_topics) ? p.review_topics.filter((t): t is string => typeof t === 'string') : undefined,
    inferred_kind: p.inferred_kind as CapturePlace['inferred_kind'],
    user: p.user && typeof p.user === 'object' ? carryUnknownKeys(p.user, {
      priority: ((p.user as Record<string, unknown>).priority as string | undefined) as CapturePlace['user'] extends { priority?: infer P } ? P : never,
      tags: Array.isArray((p.user as Record<string, unknown>).tags)
        ? ((p.user as Record<string, unknown>).tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : undefined,
      why: (p.user as Record<string, unknown>).why as string | undefined,
      notes: (p.user as Record<string, unknown>).notes as string | undefined,
      preferred_window: (p.user as Record<string, unknown>).preferred_window as string | undefined,
      duration_minutes: (p.user as Record<string, unknown>).duration_minutes as number | undefined,
    }) : undefined,
    captured_at: p.captured_at || new Date().toISOString(),
    updated_at: p.updated_at,
    enrich_failures: typeof p.enrich_failures === 'number' ? p.enrich_failures : undefined,
    enrich_last_failed_at: typeof p.enrich_last_failed_at === 'string' ? p.enrich_last_failed_at : undefined,
  });
}

export function normalizeCaptureStateV3(value: unknown): OwnlyCaptureStateV3 {
  if (!value || typeof value !== 'object') return ensureInboxCollection({ ...EMPTY_CAPTURE_STATE_V3 });

  // Unknown fields ride along untouched. Writes to storage holding a newer
  // version are refused outright in mutateCaptureStateV3InWorker.
  const state = value as Partial<OwnlyCaptureStateV3>;

  const collections = Array.isArray(state.collections)
    ? state.collections.map(normalizeCollection).filter((c): c is CaptureCollection => c !== null)
    : [];
  const collectionIds = new Set(collections.map((c) => c.id));

  const places = Array.isArray(state.places)
    ? state.places
        .map(normalizePlace)
        .filter((p): p is CapturePlace => p !== null && collectionIds.has(p.collection_id))
    : [];

  const activeCollectionId = typeof state.active_collection_id === 'string' && collectionIds.has(state.active_collection_id)
    ? state.active_collection_id
    : collections[0]?.id;

  const normalized: OwnlyCaptureStateV3 = carryUnknownKeys(value, {
    version: 3,
    active_collection_id: activeCollectionId,
    collections,
    places,
    planner_target: state.planner_target && typeof state.planner_target === 'object'
      ? {
          trip_id: (state.planner_target as Record<string, unknown>).trip_id as string,
          title: (state.planner_target as Record<string, unknown>).title as string,
        }
      : undefined,
    last_export_at: typeof state.last_export_at === 'string' ? state.last_export_at : undefined,
  });
  return ensureInboxCollection(normalized);
}

// ─── Read / Write ────────────────────────────────────────────────────────────

export async function readCaptureStateV3(): Promise<OwnlyCaptureStateV3> {
  const result = await chrome.storage.local.get(CAPTURE_STORAGE_KEY);
  return normalizeCaptureStateV3(result[CAPTURE_STORAGE_KEY]);
}

// ─── V3 Worker Messages ──────────────────────────────────────────────────────

type WorkerSuccess<T> = { ok: true; state?: OwnlyCaptureStateV3; result?: T };
type WorkerResult<T> = WorkerSuccess<T> | { ok: false; error?: string };

async function sendWorkerV3<T>(message: Record<string, unknown>): Promise<WorkerSuccess<T>> {
  const response = await chrome.runtime.sendMessage(message) as WorkerResult<T> | undefined;
  if (!response || response.ok !== true) throw new Error(response?.error || 'Ownly Capture background worker did not persist state');
  return response;
}

export async function saveCaptureStateV3ViaWorker(
  next: OwnlyCaptureStateV3,
  locallyDeletedIds?: ReadonlySet<string>,
  locallyDeletedCollectionIds?: ReadonlySet<string>,
): Promise<{ ok: true; state: OwnlyCaptureStateV3 }> {
  const response = await sendWorkerV3<void>({
    type: 'CAPTURE_SAVE_STATE_V3',
    state: next,
    locallyDeletedIds: locallyDeletedIds ? [...locallyDeletedIds] : [],
    locallyDeletedCollectionIds: locallyDeletedCollectionIds ? [...locallyDeletedCollectionIds] : [],
  });
  if (!response.state) throw new Error('Capture worker returned no state');
  return { ok: true, state: response.state };
}

export async function mergeWriteCaptureStateV3(
  local: OwnlyCaptureStateV3,
  locallyDeletedIds?: ReadonlySet<string>,
): Promise<OwnlyCaptureStateV3> {
  return (await saveCaptureStateV3ViaWorker(local, locallyDeletedIds)).state;
}

export async function writeCaptureStateV3(next: OwnlyCaptureStateV3): Promise<void> {
  await sendWorkerV3<void>({ type: 'CAPTURE_REPLACE_STATE_V3', state: next });
}

export async function setCollectionViaWorker(collection: CaptureCollection): Promise<{ ok: true }> {
  await sendWorkerV3<void>({ type: 'CAPTURE_SET_COLLECTION', collection });
  return { ok: true };
}

export async function setActiveCollectionViaWorker(collectionId: string): Promise<{ ok: true }> {
  await sendWorkerV3<void>({ type: 'CAPTURE_SET_ACTIVE_COLLECTION', collectionId });
  return { ok: true };
}

export async function setPlannerTargetViaWorker(target: { trip_id: string; title: string } | null): Promise<{ ok: true }> {
  await sendWorkerV3<void>({ type: 'CAPTURE_SET_PLANNER_TARGET', target });
  return { ok: true };
}

// ─── Lost-update guard ───────────────────────────────────────────────────────

export interface RebaseTombstones {
  placeIds?: ReadonlySet<string>;
  collectionIds?: ReadonlySet<string>;
}

function isNewer(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '') > (right ?? '');
}

/**
 * Reconcile in-memory edits made while a worker round-trip was in flight.
 * `truth` is the worker/storage result, `memory` is the current in-memory state.
 * Per entity the side with the newer `updated_at` wins (ties go to truth);
 * memory-only entities are kept unless tombstoned.
 * Ownership split for top-level fields: the panel owns `active_collection_id`,
 * the background worker owns `planner_target` / `last_export_at`.
 */
export function rebaseOntoTruth(
  truth: OwnlyCaptureStateV3,
  memory: OwnlyCaptureStateV3,
  tombstones?: RebaseTombstones,
): OwnlyCaptureStateV3 {
  const memoryPlaces = new Map(memory.places.map((p) => [p.id, p]));
  const places: CapturePlace[] = [];
  for (const place of truth.places) {
    if (tombstones?.placeIds?.has(place.id)) continue;
    const mem = memoryPlaces.get(place.id);
    memoryPlaces.delete(place.id);
    if (mem && isNewer(mem.updated_at, place.updated_at)) {
      places.push(mem);
    } else {
      places.push(place);
    }
  }
  for (const mem of memoryPlaces.values()) {
    if (tombstones?.placeIds?.has(mem.id)) continue;
    places.push(mem);
  }

  const memoryCols = new Map(memory.collections.map((c) => [c.id, c]));
  const collections: CaptureCollection[] = [];
  for (const col of truth.collections) {
    if (tombstones?.collectionIds?.has(col.id)) continue;
    const mem = memoryCols.get(col.id);
    memoryCols.delete(col.id);
    if (mem && isNewer(mem.updated_at, col.updated_at)) {
      collections.push(mem);
    } else {
      collections.push(col);
    }
  }
  for (const mem of memoryCols.values()) {
    if (tombstones?.collectionIds?.has(mem.id)) continue;
    collections.push(mem);
  }

  const collectionIds = new Set(collections.map((c) => c.id));
  const activeId = memory.active_collection_id && collectionIds.has(memory.active_collection_id)
    ? memory.active_collection_id
    : truth.active_collection_id;

  return carryUnknownKeys(truth, {
    version: 3 as const,
    active_collection_id: activeId,
    collections,
    places: places.filter((p) => !p.collection_id || collectionIds.has(p.collection_id)),
    planner_target: truth.planner_target,
    last_export_at: truth.last_export_at,
  });
}

/**
 * Worker-merge policy for the `user` sub-object: the side with the newer
 * `updated_at` wins wholesale. Wholesale (not field-wise) preserves explicit
 * clearing — setting `why` to undefined in the editor must delete it, not
 * resurrect the stored value.
 */
export function mergeUserByFreshness(
  existing: CapturePlace,
  incoming: CapturePlace,
): CapturePlace['user'] {
  if (incoming.user === undefined) return existing.user;
  if (existing.user === undefined) return incoming.user;
  return isNewer(existing.updated_at, incoming.updated_at) ? existing.user : incoming.user;
}

// ─── Enrichment resume policy ────────────────────────────────────────────────

/** Places at this many consecutive enrich failures are left alone until edited. */
export const MAX_ENRICH_FAILURES = 3;

/** Mirrors the background auto-resolve entry gate in CapturePlace terms. */
export function capturePlaceNeedsEnrich(place: CapturePlace): boolean {
  const url = place.source.url ?? '';
  const isSearchQuery = url.includes('/maps/search/') || !url.includes('/maps/place/');
  const id = (place.source.place_id ?? '').trim();
  const isMissingId = !id || !/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(id);
  return isSearchQuery || isMissingId || !place.coordinates || place.rating === undefined;
}

/** Oldest-needy-first resume batch for service-worker restarts. Pure; tested. */
export function selectEnrichResumeCandidates(places: CapturePlace[], limit = 5): CapturePlace[] {
  return places
    .filter((p) => capturePlaceNeedsEnrich(p) && !isEnrichExhausted(p))
    .sort((a, b) => (a.captured_at ?? '').localeCompare(b.captured_at ?? ''))
    .slice(0, Math.max(0, limit));
}

/**
 * Exhaustion check: at MAX failures the place stays quiet — unless the user
 * edited it after the last failure (updated_at is never bumped by failure
 * writes), which re-arms exactly one retry.
 */
export function isEnrichExhausted(place: CapturePlace): boolean {
  if ((place.enrich_failures ?? 0) < MAX_ENRICH_FAILURES) return false;
  return !(place.updated_at && place.enrich_last_failed_at && place.updated_at > place.enrich_last_failed_at);
}

/** Failure counter transition. Success clears; the counter write never bumps updated_at. */
export function nextEnrichFailures(current: number | undefined, succeeded: boolean): number | undefined {
  if (succeeded) return undefined;
  return (current ?? 0) + 1;
}

// ─── V3 Worker Mutator ──────────────────────────────────────────────────────

let workerOpChain: Promise<unknown> = Promise.resolve();

/** Background-service-worker only: the sole direct writer to V3 capture storage. */
export function mutateCaptureStateV3InWorker<R>(
  mutate: (current: OwnlyCaptureStateV3) => { state: OwnlyCaptureStateV3; result: R },
): Promise<R> {
  const run = workerOpChain.then(async () => {
    // Fail closed on newer schemas: this version must never strip-and-rewrite
    // data it doesn't understand. Applies to every writer (save/merge/upsert/
    // restore/target), since all of them funnel through here.
    const stored = await chrome.storage.local.get(CAPTURE_STORAGE_KEY);
    const raw = stored[CAPTURE_STORAGE_KEY];
    const storedVersion = raw && typeof raw === 'object'
      ? (raw as { version?: unknown }).version
      : undefined;
    if (storedVersion !== undefined && storedVersion !== SUPPORTED_CAPTURE_STATE_VERSION) {
      throw new Error(
        `[Ownly Capture] unsupported capture state version (${JSON.stringify(storedVersion)}); refusing to mutate to avoid data loss. Update the extension.`,
      );
    }
    const current = normalizeCaptureStateV3(raw);
    const { state, result } = mutate(current);
    await chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: normalizeCaptureStateV3(state) });
    return result;
  });
  workerOpChain = run.then(() => undefined, () => undefined);
  return run;
}

