from __future__ import annotations

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f"{path}: expected snippet not found:\n{old[:240]}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = re.S) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: pattern matched {count} times: {pattern[:180]}")
    write(path, next_text)


# ---------------------------------------------------------------------------
# Batch 1: CI, obvious runtime duplication, repository persistence semantics.
# ---------------------------------------------------------------------------

pages = read('.github/workflows/pages.yml')
pages = pages.replace(
    '            echo "mcp=true" >> "$GITHUB_OUTPUT"\n            echo "any=true" >> "$GITHUB_OUTPUT"',
    '            echo "mcp=true" >> "$GITHUB_OUTPUT"\n            echo "extension=true" >> "$GITHUB_OUTPUT"\n            echo "any=true" >> "$GITHUB_OUTPUT"',
    1,
)
pages = pages.replace(
    '          mcp=false\n',
    '          mcp=false\n          extension=false\n',
    1,
)
pages = pages.replace(
    "          if [[ \"$full\" == true ]] || grep -Eq '^(src/(core|services|types)/|scripts/(cli|shared)/|scripts/wyqd-cli\\.ts|tests/|docs/(DATA|WEB_RUNTIME|AGENT_CLI)|.*migration)' changed-files.txt; then\n            shared=true\n          fi",
    "          if [[ \"$full\" == true ]] || grep -Eq '^(src/(core|services|types|domain)/|scripts/(cli|shared)/|scripts/wyqd-cli\\.ts|tests/|docs/(DATA|WEB_RUNTIME|AGENT_CLI)|.*migration)' changed-files.txt; then\n            shared=true\n          fi",
    1,
)
pages = pages.replace(
    "          if [[ \"$full\" == true || \"$shared\" == true ]] || grep -Eq '^(src/obsidian/|esbuild\\.obsidian\\.mjs|manifest\\.json|styles\\.css|scripts/(package-obsidian-plugin|validate-obsidian-release)\\.mjs)' changed-files.txt; then\n            obsidian=true\n          fi\n\n          echo \"shared=$shared\" >> \"$GITHUB_OUTPUT\"",
    "          if [[ \"$full\" == true || \"$shared\" == true ]] || grep -Eq '^(src/obsidian/|esbuild\\.obsidian\\.mjs|manifest\\.json|styles\\.css|scripts/(package-obsidian-plugin|validate-obsidian-release)\\.mjs)' changed-files.txt; then\n            obsidian=true\n          fi\n          if [[ \"$full\" == true || \"$shared\" == true ]] || grep -Eq '^(src/extension/|extension/|scripts/build-extension\\.mjs)' changed-files.txt; then\n            extension=true\n          fi\n\n          echo \"shared=$shared\" >> \"$GITHUB_OUTPUT\"",
    1,
)
pages = pages.replace(
    '          echo "mcp=$mcp" >> "$GITHUB_OUTPUT"\n          if [[ "$shared" == true || "$web" == true || "$obsidian" == true || "$mcp" == true ]]; then',
    '          echo "mcp=$mcp" >> "$GITHUB_OUTPUT"\n          echo "extension=$extension" >> "$GITHUB_OUTPUT"\n          if [[ "$shared" == true || "$web" == true || "$obsidian" == true || "$mcp" == true || "$extension" == true ]]; then',
    1,
)
pages = pages.replace(
    "      - name: Obsidian plugin validation\n        if: steps.scope.outputs.obsidian == 'true'\n        run: npm run validate:obsidian\n",
    "      - name: Obsidian plugin validation\n        if: steps.scope.outputs.obsidian == 'true'\n        run: npm run validate:obsidian\n\n      - name: Capture extension validation\n        if: steps.scope.outputs.extension == 'true'\n        run: npm run validate:extension\n",
    1,
)
write('.github/workflows/pages.yml', pages)

# Planner repository: make every public read self-initializing and separate
# canonical writes from Capture imports.
repo = read('src/services/PlannerRepository.ts')
repo = repo.replace('  placeIdentityKey,\n', '')
repo = repo.replace(
    '  async listExpenses(): Promise<TripExpenseItem[]> {\n    const files = await this.store.readMarkdownFiles',
    '  async listExpenses(): Promise<TripExpenseItem[]> {\n    await this.initialize();\n    const files = await this.store.readMarkdownFiles',
    1,
)
old_upsert = re.compile(r"  async upsertPlace\(place: PlannerTripPlace\): Promise<void> \{.*?\n\n\n  /\*\* Explicit lifecycle transition", re.S)
new_upsert = '''  async upsertPlace(place: PlannerTripPlace): Promise<void> {
    await this.upsert({
      ...place,
      tags: ensurePlaceKindTag(place.tags, place.kind),
    });
  }

  /** Canonical Planner writes: no Capture merge heuristics. */
  async upsertPlaces(places: PlannerTripPlace[]): Promise<void> {
    for (const place of places) {
      await this.upsertPlace(place);
    }
  }

  /**
   * Capture import is an explicit boundary. Existing Planner-owned decisions
   * remain authoritative; only observed/source facts are refreshed.
   */
  async importCapturedPlaces(places: PlannerTripPlace[]): Promise<void> {
    if (places.length === 0) return;
    await this.initialize();

    const existing = await this.listPlaces();
    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byPlaceId = new Map<string, PlannerTripPlace>();
    const byUrlIdentity = new Map<string, PlannerTripPlace>();
    const byCoordinates = new Map<string, PlannerTripPlace>();

    const coordinateKey = (place: PlannerTripPlace): string | null => {
      if (!place.coordinates) return null;
      return `${place.trip_id}::geo:${place.coordinates.lat.toFixed(5)},${place.coordinates.lng.toFixed(5)}`;
    };

    for (const place of existing) {
      if (place.source_place_id) byPlaceId.set(`${place.trip_id}::${place.source_provider}::${place.source_place_id}`, place);
      if (place.source_url) byUrlIdentity.set(`${place.trip_id}::${place.source_provider}::${normalizePlaceIdentity(place.source_url)}`, place);
      const geo = coordinateKey(place);
      if (geo) byCoordinates.set(geo, place);
    }

    for (const rawPlace of places) {
      const captured: PlannerTripPlace = {
        ...rawPlace,
        tags: ensurePlaceKindTag(rawPlace.tags, rawPlace.kind),
        reservation_status: rawPlace.reservation_status ?? 'none',
        state: 'candidate',
        scheduled_date: undefined,
        sort_order: undefined,
        locked: undefined,
      };
      const existingPlace = byId.get(captured.id)
        ?? (captured.source_place_id
          ? byPlaceId.get(`${captured.trip_id}::${captured.source_provider}::${captured.source_place_id}`)
          : undefined)
        ?? (coordinateKey(captured) ? byCoordinates.get(coordinateKey(captured)!) : undefined)
        ?? (captured.source_url
          ? byUrlIdentity.get(`${captured.trip_id}::${captured.source_provider}::${normalizePlaceIdentity(captured.source_url)}`)
          : undefined);

      if (existingPlace) {
        await this.upsert(mergeCapturedPlaceResearch(existingPlace, captured));
      } else {
        await this.upsert(captured);
      }
    }
  }


  /** Explicit lifecycle transition'''
repo, count = old_upsert.subn(new_upsert, repo, count=1)
if count != 1:
    raise RuntimeError('PlannerRepository upsert block not found')
write('src/services/PlannerRepository.ts', repo)

# ---------------------------------------------------------------------------
# Batch 2/3 domain boundary: Capture V2 is an inbox + active context only.
# ---------------------------------------------------------------------------

domain = read('src/domain/planner.ts')
state_block = re.compile(r"export interface OwnlyCaptureState \{.*?\n/\*\*\n \* Reorders a visible subset", re.S)
state_replacement = '''export interface CaptureContext {
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
    scheduled_date: undefined,
    sort_order: undefined,
    locked: undefined,
  };
}

/**
 * Merge a panel snapshot with the freshest inbox. The background worker owns
 * activeContext; the panel only edits pending candidates. Tombstones prevent a
 * concurrent quick-capture merge from resurrecting a user deletion.
 */
export function mergeCaptureState(
  fresh: OwnlyCaptureState,
  local: OwnlyCaptureState,
  locallyDeletedIds?: ReadonlySet<string>,
): OwnlyCaptureState {
  const tombstones = locallyDeletedIds;
  const localPlaces = (tombstones
    ? local.pendingPlaces.filter((place) => !tombstones.has(place.id))
    : local.pendingPlaces).map(asCaptureCandidate);
  const localPlaceIds = new Set(localPlaces.map((place) => place.id));
  const backgroundOnly = fresh.pendingPlaces.filter(
    (place) => !localPlaceIds.has(place.id) && !(tombstones && tombstones.has(place.id)),
  );
  return {
    version: 2,
    activeContext: fresh.activeContext,
    pendingPlaces: [...localPlaces, ...backgroundOnly],
  };
}

/**
 * Reorders a visible subset'''
domain, count = state_block.subn(state_replacement, domain, count=1)
if count != 1:
    raise RuntimeError('planner capture state block not found')

merge_block = re.compile(r"export function mergeCapturedPlaceResearch\(.*?\n\}\n\nfunction canonicalizePlaceName", re.S)
merge_replacement = '''export function mergeCapturedPlaceResearch(
  existing: PlannerTripPlace,
  captured: PlannerTripPlace,
): PlannerTripPlace {
  const mergedTypes = new Set<string>([...(captured.types ?? []), ...(existing.types ?? [])]);
  const hasContent = (val?: string | null): boolean => typeof val === 'string' && val.trim().length > 0;

  return {
    ...existing,
    id: existing.id,
    title: hasContent(captured.title) ? captured.title : existing.title,
    source_provider: captured.source_provider ?? existing.source_provider,
    source_url: captured.source_url ?? existing.source_url,
    source_place_id: captured.source_place_id ?? existing.source_place_id,

    // Planner-owned decisions intentionally stay on the canonical record:
    kind: existing.kind,
    area: existing.area,
    priority: existing.priority,
    tags: existing.tags,
    why: existing.why,
    signals: existing.signals,
    risks: existing.risks,
    notes: existing.notes,
    preferred_window: existing.preferred_window,
    duration_minutes: existing.duration_minutes,

    // Capture may refresh observed/source facts:
    observed_rating: (typeof captured.observed_rating === 'number' && Number.isFinite(captured.observed_rating))
      ? captured.observed_rating
      : existing.observed_rating,
    observed_price: hasContent(captured.observed_price) ? captured.observed_price : existing.observed_price,
    observed_at: hasContent(captured.observed_at) ? captured.observed_at : existing.observed_at,
    address: hasContent(captured.address) ? captured.address : existing.address,
    coordinates: captured.coordinates ?? existing.coordinates,
    open_hours: hasContent(captured.open_hours) ? captured.open_hours : existing.open_hours,
    phone: hasContent(captured.phone) ? captured.phone : existing.phone,
    plus_code: hasContent(captured.plus_code) ? captured.plus_code : existing.plus_code,
    menu_url: hasContent(captured.menu_url) ? captured.menu_url : existing.menu_url,
    reservation_url: hasContent(captured.reservation_url) ? captured.reservation_url : existing.reservation_url,
    review_topics: (captured.review_topics && captured.review_topics.length > 0) ? captured.review_topics : existing.review_topics,
    types: mergedTypes.size > 0 ? [...mergedTypes] : undefined,
    updated_at: captured.updated_at || new Date().toISOString(),
  };
}

function canonicalizePlaceName'''
domain, count = merge_block.subn(merge_replacement, domain, count=1)
if count != 1:
    raise RuntimeError('mergeCapturedPlaceResearch block not found')

identity_block = re.compile(r"function canonicalizePlaceName\(value: string\): string \{.*?\n\}\n\nfunction escapeCdata", re.S)
identity_replacement = '''function canonicalizePlaceName(value: string): string {
  return value.replace(/\\+/g, ' ').trim().toLowerCase();
}

function roundedCoordinateIdentity(coordinates?: { lat: number; lng: number }): string | null {
  if (!coordinates) return null;
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null;
  return `${coordinates.lat.toFixed(5)},${coordinates.lng.toFixed(5)}`;
}

export function normalizePlaceIdentity(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isGoogleMaps = host === 'maps.google.com' || /(^|\\.)google\\.[a-z.]{2,}$/.test(host);
    if (isGoogleMaps) {
      const explicitPlaceId = parsed.searchParams.get('query_place_id') || parsed.searchParams.get('cid');
      if (explicitPlaceId) return `g:pid:${explicitPlaceId.toLowerCase()}`;

      const placeMatch = /\\/maps\\/place\\/([^/]+)/.exec(parsed.pathname);
      let placeName = '';
      if (placeMatch?.[1]) {
        try { placeName = decodeURIComponent(placeMatch[1]); } catch { placeName = placeMatch[1]; }
      }
      const coordinateMatch = /@(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)/.exec(`${parsed.pathname}${parsed.hash}`);
      if (coordinateMatch) {
        const lat = Number(coordinateMatch[1]);
        const lng = Number(coordinateMatch[2]);
        const geo = roundedCoordinateIdentity({ lat, lng });
        if (geo) return `g:${canonicalizePlaceName(placeName || 'place')}@${geo}`;
      }

      const query = parsed.searchParams.get('query') || parsed.searchParams.get('q');
      if (query) return `g:q:${canonicalizePlaceName(query)}`;
      if (placeName) return `g:place:${canonicalizePlaceName(placeName)}`;
    }
    parsed.hash = '';
    return `u:${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {}
  return `u:${trimmed.toLowerCase()}`;
}

export function placeIdentityKey(tripId: string, sourceUrl: string): string {
  return `${tripId}::${normalizePlaceIdentity(sourceUrl)}`;
}

export function findExistingTripPlace(
  places: PlannerTripPlace[],
  tripId: string,
  sourceUrl: string,
  sourcePlaceId?: string,
  coordinates?: { lat: number; lng: number },
): PlannerTripPlace | undefined {
  const tripPlaces = places.filter((place) => place.trip_id === tripId);

  if (sourcePlaceId) {
    const byPlaceId = tripPlaces.find((place) =>
      place.source_provider === inferSourceProvider(sourceUrl) && place.source_place_id === sourcePlaceId
    );
    if (byPlaceId) return byPlaceId;
  }

  const coordinateIdentity = roundedCoordinateIdentity(coordinates);
  if (coordinateIdentity) {
    const byCoordinates = tripPlaces.find((place) => roundedCoordinateIdentity(place.coordinates) === coordinateIdentity);
    if (byCoordinates) return byCoordinates;
  }

  const identity = normalizePlaceIdentity(sourceUrl);
  return tripPlaces.find((place) => normalizePlaceIdentity(place.source_url) === identity)
    ?? tripPlaces.find((place) => place.source_url === sourceUrl);
}

function escapeCdata'''
domain, count = identity_block.subn(identity_replacement, domain, count=1)
if count != 1:
    raise RuntimeError('planner identity block not found')
write('src/domain/planner.ts', domain)

# Capture state module: hard V2 key, no V1 migration, worker-only writes.
write('src/extension/capture-state.ts', '''import {
  asCaptureCandidate,
  mergeCaptureState,
  type CaptureContext,
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

function normalizePlaces(value: unknown): PlannerTripPlace[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PlannerTripPlace => Boolean(
      item
      && typeof item === 'object'
      && typeof (item as PlannerTripPlace).id === 'string'
      && typeof (item as PlannerTripPlace).trip_id === 'string'
    ))
    .map(asCaptureCandidate);
}

export function normalizeCaptureState(value: unknown): OwnlyCaptureState {
  if (!value || typeof value !== 'object') return { ...EMPTY_CAPTURE_STATE };
  const state = value as Partial<OwnlyCaptureState> & { version?: unknown };
  if (state.version !== 2) return { ...EMPTY_CAPTURE_STATE };
  return {
    version: 2,
    activeContext: normalizeContext(state.activeContext),
    pendingPlaces: normalizePlaces(state.pendingPlaces),
  };
}

export async function readCaptureState(): Promise<OwnlyCaptureState> {
  const result = await chrome.storage.local.get(CAPTURE_STORAGE_KEY);
  return normalizeCaptureState(result[CAPTURE_STORAGE_KEY]);
}

type WorkerResult<T> = { ok: true; state?: OwnlyCaptureState; result?: T } | { ok: false; error?: string };

async function sendWorker<T>(message: Record<string, unknown>): Promise<WorkerResult<T>> {
  const response = await chrome.runtime.sendMessage(message) as WorkerResult<T> | undefined;
  if (!response?.ok) throw new Error(response?.error || 'Ownly Capture background worker did not persist state');
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

export async function ackPlacesViaWorker(placeIds: string[]): Promise<{ ok: true }> {
  await sendWorker<void>({ type: 'CAPTURE_ACK_PLACES', placeIds });
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
''')

# Background worker is the single Capture writer and the owner of tab-scoped FX override.
write('src/extension/background.ts', '''import {
  DEFAULT_USD_PIVOT,
  ensurePlaceKindTag,
  findExistingTripPlace,
  inferPlaceKind,
  mergeCaptureState,
  type CaptureContext,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../domain/planner';
import {
  mutateCaptureStateInWorker,
  normalizeCaptureState,
  readCaptureState,
} from './capture-state';
import type { CurrentResearchPlace } from './content';

async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('[Ownly Capture] Could not configure side panel', error);
  }
}

async function flashBadge(tabId: number, text: string, color: string) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }), 2000);
  } catch {}
}

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

async function quickCaptureCurrentPlace() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const tabId = tab.id;

  try {
    const snapshot = await readCaptureState();
    const context = snapshot.activeContext;
    if (!context) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }

    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'OWNLY_GET_CURRENT_PLACE',
      targetCurrency: context.currency,
    }) as { place?: CurrentResearchPlace | null };
    const place = response?.place;
    if (!place?.title || !place.sourceUrl) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }

    const capturedId = await mutateCaptureStateInWorker((state) => {
      const active = state.activeContext;
      if (!active) return { state, result: null as string | null };
      const existing = findExistingTripPlace(
        state.pendingPlaces,
        active.tripId,
        place.sourceUrl,
        place.sourcePlaceId,
        place.coordinates,
      );
      const now = new Date().toISOString();
      const freshKind = inferPlaceKind([place.title, place.category, place.address, ...(place.types || [])].filter(Boolean).join(' '));
      const isGeneric = existing?.kind === 'attraction' || existing?.kind === 'other';
      const hasSpecific = freshKind !== 'attraction' && freshKind !== 'other';
      const effectiveKind = existing && !isGeneric ? existing.kind : (hasSpecific ? freshKind : (existing?.kind ?? freshKind));
      const stableId = existing?.id ?? crypto.randomUUID();

      const candidate: PlannerTripPlace = {
        schema_version: '0.1',
        type: 'trip_place',
        id: stableId,
        trip_id: active.tripId,
        title: place.title,
        source_provider: place.sourceProvider || 'google_maps',
        source_url: place.sourceUrl,
        source_place_id: place.sourcePlaceId ?? existing?.source_place_id,
        kind: effectiveKind,
        area: existing?.area ?? place.address?.split(/[,，·]/)[0]?.trim() || undefined,
        priority: existing?.priority ?? 'want',
        tags: ensurePlaceKindTag(Array.from(new Set([...(active.tags ?? []), ...(existing?.tags ?? [])])), effectiveKind),
        why: existing?.why ?? place.summary,
        signals: existing?.signals ?? [],
        risks: existing?.risks ?? [],
        notes: existing?.notes ?? place.userNote,
        observed_rating: place.rating ?? existing?.observed_rating,
        observed_price: place.priceLevel ?? existing?.observed_price,
        observed_at: now.slice(0, 10),
        preferred_window: existing?.preferred_window,
        duration_minutes: existing?.duration_minutes,
        open_hours: place.openHours ?? existing?.open_hours,
        address: place.address ?? existing?.address,
        coordinates: place.coordinates ?? existing?.coordinates,
        phone: place.phone ?? existing?.phone,
        plus_code: place.plusCode ?? existing?.plus_code,
        menu_url: place.menuUrl ?? existing?.menu_url,
        reservation_url: place.reservationUrl ?? existing?.reservation_url,
        review_topics: place.reviewTopics ?? existing?.review_topics,
        types: Array.from(new Set([...(place.types ?? []), ...(existing?.types ?? [])])),
        reservation_status: 'none',
        state: 'candidate',
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };

      return {
        state: {
          ...state,
          pendingPlaces: [...state.pendingPlaces.filter((item) => item.id !== stableId), candidate],
        },
        result: stableId,
      };
    });

    if (!capturedId) {
      void flashBadge(tabId, '!', '#b91c1c');
      return;
    }
    void flashBadge(tabId, '✓', '#047857');
    try {
      await chrome.sidePanel.open({ tabId });
      await chrome.runtime.sendMessage({ type: 'OWNLY_FOCUS_CAPTURE' }).catch(() => {});
    } catch {}
  } catch (error) {
    console.warn('[Ownly Capture] Quick capture error', error);
    void flashBadge(tabId, '!', '#b91c1c');
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-capture-place') void quickCaptureCurrentPlace();
});

const TRACKED_TAB_URL = /^https:\/\//i;
const FX_RATES_CACHE_KEY = 'ownly_fx_rates';
const FX_RATES_TIME_KEY = 'ownly_fx_rates_updated_at';
const FX_TOOLTIP_ENABLED_KEY = 'ownly_fx_tooltip_enabled';
const FX_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const fxOverrideKey = (tabId: number) => `ownlyFxOverride:${tabId}`;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || (!changeInfo.url && !changeInfo.status)) return;
  const url = changeInfo.url || tab.url || '';
  if (!TRACKED_TAB_URL.test(url)) return;
  void chrome.runtime.sendMessage({ type: 'OWNLY_TAB_CHANGED', tabId, url }).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => {
    if (tab.url && TRACKED_TAB_URL.test(tab.url)) {
      void chrome.runtime.sendMessage({ type: 'OWNLY_TAB_CHANGED', tabId, url: tab.url }).catch(() => {});
    }
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const type = (message as { type?: string }).type;

  if (type === 'OWNLY_SELECTOR_DRIFT') {
    void chrome.action.setBadgeText({ text: '!' }).catch(() => {});
    void chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  if (type === 'CAPTURE_SAVE_STATE') {
    const incoming = normalizeCaptureState((message as { state?: unknown }).state);
    const rawDeleted = (message as { locallyDeletedIds?: unknown }).locallyDeletedIds;
    const deletedIds = Array.isArray(rawDeleted)
      ? new Set(rawDeleted.filter((id): id is string => typeof id === 'string'))
      : undefined;
    void mutateCaptureStateInWorker((current) => {
      const merged = mergeCaptureState(current, incoming, deletedIds);
      return { state: merged, result: merged };
    })
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_REPLACE_STATE') {
    const incoming = normalizeCaptureState((message as { state?: unknown }).state);
    void mutateCaptureStateInWorker((current) => ({
      state: { version: 2, activeContext: current.activeContext, pendingPlaces: incoming.pendingPlaces },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_SET_CONTEXT') {
    const context = normalizeContext((message as { context?: unknown }).context);
    void mutateCaptureStateInWorker((current) => ({
      state: { ...current, activeContext: context },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'CAPTURE_ACK_PLACES') {
    const placeIds = (message as { placeIds?: unknown }).placeIds;
    const ids = Array.isArray(placeIds) ? new Set(placeIds.filter((id): id is string => typeof id === 'string')) : new Set<string>();
    void mutateCaptureStateInWorker((current) => ({
      state: { ...current, pendingPlaces: current.pendingPlaces.filter((place) => !ids.has(place.id)) },
      result: undefined,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'OWNLY_SET_FX_OVERRIDE') {
    const tabId = (message as { tabId?: unknown }).tabId;
    const currency = (message as { currency?: unknown }).currency;
    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'missing tab id' });
      return;
    }
    void (async () => {
      const key = fxOverrideKey(tabId);
      const normalized = typeof currency === 'string' && currency.trim() && currency !== 'AUTO'
        ? currency.trim().toUpperCase()
        : undefined;
      if (normalized) await chrome.storage.session.set({ [key]: normalized });
      else await chrome.storage.session.remove(key);
      await chrome.tabs.sendMessage(tabId, { type: 'OWNLY_CURRENCY_OVERRIDE_CHANGED', overrideCurrency: normalized }).catch(() => {});
      sendResponse({ ok: true });
    })().catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'OWNLY_GET_FX_CONFIG') {
    void (async () => {
      const [rates, stored, state] = await Promise.all([
        getCachedFxRates(),
        chrome.storage.local.get(FX_TOOLTIP_ENABLED_KEY),
        readCaptureState(),
      ]);
      const tabId = sender.tab?.id;
      let overrideCurrency: string | undefined;
      if (typeof tabId === 'number') {
        const session = await chrome.storage.session.get(fxOverrideKey(tabId));
        const raw = session[fxOverrideKey(tabId)];
        if (typeof raw === 'string' && raw.trim()) overrideCurrency = raw.trim().toUpperCase();
      }
      sendResponse({
        ok: true,
        targetCurrency: state.activeContext?.currency || 'CNY',
        rates,
        enabled: stored[FX_TOOLTIP_ENABLED_KEY] !== false,
        overrideCurrency,
      });
    })().catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === 'OWNLY_SET_FX_TOOLTIP_ENABLED') {
    const enabled = (message as { enabled?: boolean }).enabled !== false;
    void (async () => {
      await chrome.storage.local.set({ [FX_TOOLTIP_ENABLED_KEY]: enabled });
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) void chrome.tabs.sendMessage(tab.id, { type: 'OWNLY_FX_TOOLTIP_STATUS_CHANGED', enabled }).catch(() => {});
      }
    })();
    sendResponse({ ok: true });
    return true;
  }
});

async function getCachedFxRates(): Promise<Record<string, number>> {
  try {
    const data = await chrome.storage.local.get([FX_RATES_CACHE_KEY, FX_RATES_TIME_KEY]);
    const cachedRates = data[FX_RATES_CACHE_KEY] as Record<string, number> | undefined;
    const lastUpdated = (data[FX_RATES_TIME_KEY] as number) || 0;
    if (cachedRates && Date.now() - lastUpdated < FX_CACHE_MAX_AGE_MS) return cachedRates;
    void refreshFxRates();
    return cachedRates || DEFAULT_USD_PIVOT;
  } catch {
    return DEFAULT_USD_PIVOT;
  }
}

async function refreshFxRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return DEFAULT_USD_PIVOT;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data?.result === 'success' && data.rates) {
      const pivotMap: Record<string, number> = { USD: 1 };
      for (const [code, rate] of Object.entries(data.rates)) {
        if (typeof rate === 'number' && rate > 0) pivotMap[code.toUpperCase()] = Math.round((1 / rate) * 100000) / 100000;
      }
      await chrome.storage.local.set({ [FX_RATES_CACHE_KEY]: pivotMap, [FX_RATES_TIME_KEY]: Date.now() });
      return pivotMap;
    }
  } catch (error) {
    console.warn('[Ownly Capture] Failed to fetch live FX rates:', error);
  }
  return DEFAULT_USD_PIVOT;
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
  void refreshFxRates();
});
chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
  void refreshFxRates();
});
void configureSidePanel();
''')

write('src/extension/ownly-bridge.ts', '''import type { CaptureContext } from '../domain/planner';
import { ackPlacesViaWorker, readCaptureState, setCaptureContextViaWorker } from './capture-state';

const REQUEST_SOURCE = 'ownly-planner-web';
const RESPONSE_SOURCE = 'ownly-capture-extension';

function getTargetOrigin(): string {
  if (typeof window === 'undefined') return '*';
  return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
}

window.addEventListener('message', (event) => {
  const isSameOrigin = !event.origin || event.origin === 'null' || event.origin === window.location.origin;
  if (event.source !== window || !isSameOrigin) return;
  const message = event.data as { source?: string; requestId?: string; type?: string; payload?: unknown };
  if (!message || message.source !== REQUEST_SOURCE || !message.requestId || !message.type) return;

  void (async () => {
    try {
      if (message.type === 'PULL_CAPTURE_STATE') {
        const state = await readCaptureState();
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'CAPTURE_STATE', payload: state }, getTargetOrigin());
        return;
      }
      if (message.type === 'ACK_CAPTURED_PLACES') {
        const payload = message.payload as { placeIds?: string[] } | undefined;
        const ids = Array.isArray(payload?.placeIds) ? payload.placeIds : [];
        await ackPlacesViaWorker(ids);
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'ACK_CAPTURED_PLACES_RESULT', payload: { ok: true } }, getTargetOrigin());
        return;
      }
      if (message.type === 'SET_CAPTURE_CONTEXT') {
        const payload = message.payload as { context?: CaptureContext | null } | undefined;
        await setCaptureContextViaWorker(payload?.context ?? null);
        window.postMessage({ source: RESPONSE_SOURCE, requestId: message.requestId, type: 'SET_CAPTURE_CONTEXT_RESULT', payload: { ok: true } }, getTargetOrigin());
      }
    } catch (error) {
      window.postMessage({
        source: RESPONSE_SOURCE,
        requestId: message.requestId,
        type: 'ERROR',
        error: error instanceof Error ? error.message : 'Ownly Capture bridge failed',
      }, getTargetOrigin());
    }
  })();
});
''')

write('src/components/planner/capture-bridge.ts', '''import type { CaptureContext, OwnlyCaptureState } from '@/domain/planner';

const REQUEST_SOURCE = 'ownly-planner-web';
const RESPONSE_SOURCE = 'ownly-capture-extension';

interface BridgeResponse<T> {
  source: typeof RESPONSE_SOURCE;
  requestId: string;
  type: string;
  payload?: T;
  error?: string;
}

function getTargetOrigin(): string {
  if (typeof window === 'undefined') return '*';
  return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
}

function requestBridge<T>(type: string, payload?: unknown, timeoutMs = 2500): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (event: MessageEvent<BridgeResponse<T>>) => {
      const isSameOrigin = !event.origin || event.origin === 'null' || event.origin === window.location.origin;
      if (event.source !== window || !isSameOrigin) return;
      const message = event.data;
      if (!message || message.source !== RESPONSE_SOURCE || message.requestId !== requestId) return;
      finish(message.error ? null : message.payload ?? null);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ source: REQUEST_SOURCE, requestId, type, payload }, getTargetOrigin());
  });
}

export function pullCaptureState(): Promise<OwnlyCaptureState | null> {
  return requestBridge<OwnlyCaptureState>('PULL_CAPTURE_STATE');
}

export async function ackCapturedPlaces(placeIds: string[]): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('ACK_CAPTURED_PLACES', { placeIds });
  return result?.ok === true;
}

export async function setCaptureContext(context: CaptureContext | null): Promise<boolean> {
  const result = await requestBridge<{ ok: true }>('SET_CAPTURE_CONTEXT', { context });
  return result?.ok === true;
}
''')

# API list parsing now receives the small active Capture context projection.
api = read('src/extension/api.ts')
api = api.replace(
    "import { ensurePlaceKindTag, inferPlaceKind, type PlannerTrip, type PlannerTripPlace } from '../domain/planner';",
    "import { ensurePlaceKindTag, inferPlaceKind, type CaptureContext, type PlannerTripPlace } from '../domain/planner';",
    1,
)
api = api.replace(
    'export async function resolveGoogleMapsListByUrl(rawUrl: string, activeTrip?: PlannerTrip): Promise<PlannerTripPlace[]> {',
    'export async function resolveGoogleMapsListByUrl(rawUrl: string, activeContext?: CaptureContext): Promise<PlannerTripPlace[]> {',
    1,
)
api = api.replace('activeTrip?.tags', 'activeContext?.tags')
api = api.replace("trip_id: activeTrip?.id || '',", "trip_id: activeContext?.tripId || '',")
write('src/extension/api.ts', api)

# Side-panel store: no Trip database copy; FX override is current-tab session state.
write('src/extension/sidepanel/store.ts', '''import {
  EMPTY_CAPTURE_STATE,
  findExistingTripPlace,
  type OwnlyCaptureState,
  type PlannerTripPlace,
} from '../../domain/planner';
import type { CurrentResearchPlace, DetectedSavedList } from '../content';
import { readCaptureState } from '../capture-state';
import { I18N, type Lang } from '../i18n';

const LANG_STORAGE_KEY = 'ownlyCaptureLang';
const fxOverrideKey = (tabId: number) => `ownlyFxOverride:${tabId}`;

export interface SavedListSummary {
  listId?: string;
  listName: string;
  count?: number;
  url?: string;
}

export const store = {
  lang: 'zh' as Lang,
  state: { ...EMPTY_CAPTURE_STATE } as OwnlyCaptureState,
  currentPlace: null as CurrentResearchPlace | null,
  detectedSavedList: null as DetectedSavedList | null,
  detectedListPlaces: [] as CurrentResearchPlace[],
  detectedAllLists: [] as SavedListSummary[],
  activeFilter: 'all',
  searchQuery: '',
  pageDetectedCurrency: undefined as string | undefined,
  mapCurrencyOverride: undefined as string | undefined,
  locallyDeletedIds: new Set<string>(),
  userDismissedPlaceUrl: null as string | null,
  smartListDismissed: false,
  smartListKey: '' as string,
  editingCandidateId: null as string | null,
  isListPreviewOpen: false,
  bulkMode: false,
  bulkSelected: new Set<string>(),
};

export function t() {
  return I18N[store.lang];
}

export async function loadState(): Promise<void> {
  const [langRes, fresh, tabs] = await Promise.all([
    chrome.storage.local.get(LANG_STORAGE_KEY),
    readCaptureState(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  const langVal = langRes[LANG_STORAGE_KEY];
  if (langVal === 'zh' || langVal === 'en') store.lang = langVal;
  const tabId = tabs[0]?.id;
  if (typeof tabId === 'number') {
    const session = await chrome.storage.session.get(fxOverrideKey(tabId));
    const raw = session[fxOverrideKey(tabId)];
    if (typeof raw === 'string' && raw.trim()) store.mapCurrencyOverride = raw.trim().toUpperCase();
  }
  store.state = fresh;
}

export function getExistingPlaceForUrl(sourceUrl: string, sourcePlaceId?: string): PlannerTripPlace | undefined {
  const tripId = store.state.activeContext?.tripId;
  if (!tripId) return undefined;
  return findExistingTripPlace(store.state.pendingPlaces, tripId, sourceUrl, sourcePlaceId, store.currentPlace?.coordinates);
}
''')

# DOM is reduced to capture context + import tools. Trip editing/scheduling controls are removed.
write('src/extension/dom.ts', '''export type ElementMap = {
  langToggle: HTMLButtonElement;
  toggleFxTooltip: HTMLInputElement;
  lblFxTooltipToggle: HTMLElement;
  txtFxTooltipToggle: HTMLElement;
  lblActiveTrip: HTMLElement;
  captureContextTitle: HTMLElement;
  captureContextHint: HTMLElement;
  pageCurrencyBar: HTMLElement;
  currencySelector: HTMLSelectElement;
  btnRedetectCurrency: HTMLButtonElement;
  sumBulkImport: HTMLElement;
  lblBulkText: HTMLElement;
  bulkInputText: HTMLTextAreaElement;
  btnParseBulkImport: HTMLButtonElement;
  btnBackupState: HTMLButtonElement;
  btnRestoreState: HTMLButtonElement;
  fileRestoreState: HTMLInputElement;
  btnBulkToggle: HTMLButtonElement;
  bulkActionBar: HTMLElement;
  bulkPrioritySelect: HTMLSelectElement;
  btnSelectAllCandidates: HTMLButtonElement;
  btnBulkDelete: HTMLButtonElement;
  btnBulkExit: HTMLButtonElement;
  smartListSection: HTMLElement;
  smartListBadge: HTMLElement;
  smartListCountBadge: HTMLElement;
  smartListTitle: HTMLElement;
  smartListDesc: HTMLElement;
  btnSmartSyncAll: HTMLButtonElement;
  btnCloseSmartList: HTMLButtonElement;
  btnToggleListPreview: HTMLButtonElement;
  smartListPreviewContainer: HTMLElement;
  batchListContainer: HTMLElement;
  btnToggleSelectAll: HTMLButtonElement;
  btnBatchAdd: HTMLButtonElement;
  lblCurrentPlace: HTMLElement;
  btnDismissPlace: HTMLButtonElement;
  placeTitle: HTMLElement;
  placeUrl: HTMLElement;
  placeCapturedBanner: HTMLElement;
  txtCapturedBanner: HTMLElement;
  placeMetaBadges: HTMLElement;
  refreshPlace: HTMLButtonElement;
  placePanel: HTMLElement;
  placeProvider: HTMLElement;
  captureForm: HTMLFormElement;
  lblKind: HTMLElement;
  kind: HTMLSelectElement;
  lblArea: HTMLElement;
  area: HTMLInputElement;
  lblTags: HTMLElement;
  tags: HTMLInputElement;
  lblDuration: HTMLElement;
  duration: HTMLInputElement;
  lblWindow: HTMLElement;
  window: HTMLInputElement;
  lblRating: HTMLElement;
  rating: HTMLInputElement;
  lblPrice: HTMLElement;
  price: HTMLInputElement;
  lblQuickChips: HTMLElement;
  quickChips: HTMLElement;
  lblWhy: HTMLElement;
  why: HTMLTextAreaElement;
  captureAdvanced: HTMLDetailsElement;
  captureAdvancedSummary: HTMLElement;
  lblSignals: HTMLElement;
  signals: HTMLInputElement;
  lblRisks: HTMLElement;
  risks: HTMLInputElement;
  lblNotes: HTMLElement;
  notes: HTMLTextAreaElement;
  btnCaptureSubmit: HTMLButtonElement;
  btnRemoveCandidate: HTMLButtonElement;
  candidatesDrawer: HTMLDetailsElement;
  sumCandidatesDrawer: HTMLElement;
  candidatesCountBadge: HTMLElement;
  candidatesSearch: HTMLInputElement;
  candidatesFilterBar: HTMLElement;
  candidatesListContainer: HTMLElement;
  pending: HTMLElement;
  status: HTMLElement;
};

export function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing Ownly Capture element: ${id}`);
  return node as T;
}

export const el: ElementMap = {
  langToggle: required('langToggle'),
  toggleFxTooltip: required<HTMLInputElement>('toggleFxTooltip'),
  lblFxTooltipToggle: required('lblFxTooltipToggle'),
  txtFxTooltipToggle: required('txtFxTooltipToggle'),
  lblActiveTrip: required('lblActiveTrip'),
  captureContextTitle: required('captureContextTitle'),
  captureContextHint: required('captureContextHint'),
  pageCurrencyBar: required('pageCurrencyBar'),
  currencySelector: required<HTMLSelectElement>('currencySelector'),
  btnRedetectCurrency: required<HTMLButtonElement>('btnRedetectCurrency'),
  sumBulkImport: required('sumBulkImport'),
  lblBulkText: required('lblBulkText'),
  bulkInputText: required<HTMLTextAreaElement>('bulkInputText'),
  btnParseBulkImport: required<HTMLButtonElement>('btnParseBulkImport'),
  btnBackupState: required<HTMLButtonElement>('btnBackupState'),
  btnRestoreState: required<HTMLButtonElement>('btnRestoreState'),
  fileRestoreState: required<HTMLInputElement>('fileRestoreState'),
  btnBulkToggle: required<HTMLButtonElement>('btnBulkToggle'),
  bulkActionBar: required('bulkActionBar'),
  bulkPrioritySelect: required<HTMLSelectElement>('bulkPrioritySelect'),
  btnSelectAllCandidates: required<HTMLButtonElement>('btnSelectAllCandidates'),
  btnBulkDelete: required<HTMLButtonElement>('btnBulkDelete'),
  btnBulkExit: required<HTMLButtonElement>('btnBulkExit'),
  smartListSection: required('smartListSection'),
  smartListBadge: required('smartListBadge'),
  smartListCountBadge: required('smartListCountBadge'),
  smartListTitle: required('smartListTitle'),
  smartListDesc: required('smartListDesc'),
  btnSmartSyncAll: required<HTMLButtonElement>('btnSmartSyncAll'),
  btnCloseSmartList: required<HTMLButtonElement>('btnCloseSmartList'),
  btnToggleListPreview: required<HTMLButtonElement>('btnToggleListPreview'),
  smartListPreviewContainer: required('smartListPreviewContainer'),
  batchListContainer: required('batchListContainer'),
  btnToggleSelectAll: required<HTMLButtonElement>('btnToggleSelectAll'),
  btnBatchAdd: required<HTMLButtonElement>('btnBatchAdd'),
  lblCurrentPlace: required('lblCurrentPlace'),
  btnDismissPlace: required<HTMLButtonElement>('btnDismissPlace'),
  placeTitle: required('placeTitle'),
  placeUrl: required('placeUrl'),
  placeCapturedBanner: required('placeCapturedBanner'),
  txtCapturedBanner: required('txtCapturedBanner'),
  placeMetaBadges: required('placeMetaBadges'),
  refreshPlace: required<HTMLButtonElement>('refreshPlace'),
  placePanel: required('placePanel'),
  placeProvider: required('placeProvider'),
  captureForm: required<HTMLFormElement>('captureForm'),
  lblKind: required('lblKind'),
  kind: required<HTMLSelectElement>('kind'),
  lblArea: required('lblArea'),
  area: required<HTMLInputElement>('area'),
  lblTags: required('lblTags'),
  tags: required<HTMLInputElement>('tags'),
  lblDuration: required('lblDuration'),
  duration: required<HTMLInputElement>('duration'),
  lblWindow: required('lblWindow'),
  window: required<HTMLInputElement>('window'),
  lblRating: required('lblRating'),
  rating: required<HTMLInputElement>('rating'),
  lblPrice: required('lblPrice'),
  price: required<HTMLInputElement>('price'),
  lblQuickChips: required('lblQuickChips'),
  quickChips: required('quickChips'),
  lblWhy: required('lblWhy'),
  why: required<HTMLTextAreaElement>('why'),
  captureAdvanced: required<HTMLDetailsElement>('captureAdvanced'),
  captureAdvancedSummary: required('captureAdvancedSummary'),
  lblSignals: required('lblSignals'),
  signals: required<HTMLInputElement>('signals'),
  lblRisks: required('lblRisks'),
  risks: required<HTMLInputElement>('risks'),
  lblNotes: required('lblNotes'),
  notes: required<HTMLTextAreaElement>('notes'),
  btnCaptureSubmit: required<HTMLButtonElement>('btnCaptureSubmit'),
  btnRemoveCandidate: required<HTMLButtonElement>('btnRemoveCandidate'),
  candidatesDrawer: required<HTMLDetailsElement>('candidatesDrawer'),
  sumCandidatesDrawer: required('sumCandidatesDrawer'),
  candidatesCountBadge: required('candidatesCountBadge'),
  candidatesSearch: required<HTMLInputElement>('candidatesSearch'),
  candidatesFilterBar: required('candidatesFilterBar'),
  candidatesListContainer: required('candidatesListContainer'),
  pending: required('pending'),
  status: required('status'),
};
''')

# Sidepanel HTML: remove Trip CRUD and day scheduling controls.
html = read('extension/sidepanel.html')
first_panel = re.compile(r'<section class="panel stack">.*?</section>\n\n    <!-- Unified Smart List Capture Card -->', re.S)
first_panel_replacement = '''<section class="panel stack">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div style="min-width: 0;">
          <div id="lblActiveTrip" class="label">当前行程</div>
          <strong id="captureContextTitle" style="display:block; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">未连接 Planner 行程</strong>
          <span id="captureContextHint" class="url" style="display:block; margin-top:2px;">请先在 Ownly Planner 选择一个行程</span>
        </div>
        <div id="pageCurrencyBar" class="row" style="align-items: center; gap: 3px;">
          <span style="font-size: 10px; opacity: 0.65;" title="页面货币 / Page currency">💱</span>
          <select id="currencySelector" class="mini-currency-select" aria-label="页面货币 / Page currency"></select>
          <button id="btnRedetectCurrency" class="mini-icon-btn" type="button" title="重新自动检测 / Re-detect">🔄</button>
        </div>
      </div>
      <details class="new-trip">
        <summary id="sumBulkImport">📥 导入工具</summary>
        <div class="stack" style="margin-top: 8px;">
          <label id="lblBulkText">批量粘贴链接或地点名
            <textarea id="bulkInputText" rows="3" placeholder="每行一个链接或地点名"></textarea>
          </label>
          <button id="btnParseBulkImport" class="secondary" type="button">📥 解析并加入候选池</button>
          <div class="row" style="gap:6px;">
            <button id="btnBackupState" class="link" type="button">⬇️ 备份 Inbox</button>
            <button id="btnRestoreState" class="link" type="button">⬆️ 恢复 Inbox</button>
            <input id="fileRestoreState" type="file" accept="application/json,.json" style="display:none;" />
          </div>
        </div>
      </details>
    </section>

    <!-- Unified Smart List Capture Card -->'''
html, count = first_panel.subn(first_panel_replacement, html, count=1)
if count != 1:
    raise RuntimeError('sidepanel first panel not found')
html = re.sub(r'\s*<select id="bulkDaySelect" class="day-select"></select>', '', html, count=1)
write('extension/sidepanel.html', html)

# UI: remove Trip management and scheduling while retaining research editing.
ui = read('src/extension/sidepanel/ui.ts')
ui = ui.replace('  checkOpeningHoursCollision,\n', '')
ui = ui.replace('  listTripDates,\n', '')
ui = re.sub(r"  el\.sumTripManage\.textContent.*?  el\.btnDeleteTrip\.textContent = dict\.btnDeleteTrip;\n\n", '', ui, count=1, flags=re.S)
ui = re.sub(r"\n  for \(const opt of Array\.from\(el\.tripTransport\.options\)\) \{.*?\n  \}\n\n  for \(const opt of Array\.from\(el\.editTripTransport\.options\)\) \{.*?\n  \}\n", '\n', ui, count=1, flags=re.S)
ui = ui.replace("const activeTrip = store.state.trips.find((trip) => trip.id === store.state.activeTripId);", "const activeTrip = store.state.activeContext;")
ui = ui.replace("(p) => p.trip_id === store.state.activeTripId && (p.state as string) !== 'dropped' && (p.state as string) !== 'tombstone',", "(p) => p.trip_id === store.state.activeContext?.tripId,")
ui = re.sub(r"\nexport function populateEditTripForm\(\) \{.*?\n\}\n\n/\*\* Fills the bulk.*?\n\}\n", '\n', ui, count=1, flags=re.S)
render_state_pattern = re.compile(r"export function renderState\(\) \{.*?\n\}\n\nexport const CURRENCY_OPTIONS_CONFIG", re.S)
render_state_repl = '''export function renderState() {
  const dict = t();
  el.pending.textContent = `${store.state.pendingPlaces.length} ${dict.pendingSuffix}`;
  const context = store.state.activeContext;
  el.captureContextTitle.textContent = context
    ? `${context.title}${context.currency ? ` [${context.currency}]` : ''}`
    : (store.lang === 'zh' ? '未连接 Planner 行程' : 'No Planner trip selected');
  el.captureContextHint.textContent = context
    ? (store.lang === 'zh' ? '由 Planner 控制 · Capture 只收集研究候选' : 'Controlled by Planner · Capture only collects research candidates')
    : (store.lang === 'zh' ? '请先在 Ownly Planner 选择一个行程' : 'Select a trip in Ownly Planner first');
  el.btnCaptureSubmit.disabled = !context;
  renderChips();
  renderFilters();
}

export const CURRENCY_OPTIONS_CONFIG'''
ui, count = render_state_pattern.subn(render_state_repl, ui, count=1)
if count != 1:
    raise RuntimeError('renderState block not found')
ui = ui.replace('    const savedListNameNorm = (activeTrip.saved_list_name || \'\').trim().toLowerCase();\n\n', '')
ui = ui.replace('      listNameNorm === savedListNameNorm ||\n', '')
ui = ui.replace('const baseTags = (activeTrip?.tags || []).filter(Boolean);', 'const baseTags = (store.state.activeContext?.tags || []).filter(Boolean);')
ui = ui.replace("  const activeTrip = store.state.activeContext;\n  const tripDays = activeTrip ? listTripDates(activeTrip.start_date, activeTrip.end_date) : [];\n\n", "  const activeTrip = store.state.activeContext;\n\n", 1)
ui = ui.replace('    const sig = candidateCardSig(place, dictKey, tripDays);', '    const sig = candidateCardSig(place, dictKey);')
ui = ui.replace('    node = buildCandidateCard(place, dict, tripDays);', '    node = buildCandidateCard(place, dict);')
ui = ui.replace("function candidateCardSig(place: import('../../domain/planner').PlannerTripPlace, dictKey: string, tripDays: string[]): string {", "function candidateCardSig(place: import('../../domain/planner').PlannerTripPlace, dictKey: string): string {")
ui = ui.replace('    tripDays.join(\',\'),\n', '')
ui = ui.replace('  tripDays: string[],\n): HTMLDivElement {', '): HTMLDivElement {', 1)
ui = ui.replace('      card.append(header, buildCandidateDetails(place, dict, tripDays));', '      card.append(header, buildCandidateDetails(place, dict));')
ui = ui.replace('  tripDays: string[],\n): HTMLDivElement {', '): HTMLDivElement {', 1)
ui = re.sub(r"\n  if \(place\.scheduled_date && place\.open_hours\) \{.*?\n  \}\n", '\n', ui, count=1, flags=re.S)
ui = re.sub(r"\n  const daySelect = document\.createElement\('select'\);.*?  daySelect\.value = place\.scheduled_date \|\| '';\n", '\n', ui, count=1, flags=re.S)
ui = ui.replace('  actions.append(daySelect, btnGroup);', '  actions.append(btnGroup);')
ui = ui.replace("const activeTrip = store.state.trips?.find((t) => t.id === store.state.activeTripId);", "const activeTrip = store.state.activeContext;")
write('src/extension/sidepanel/ui.ts', ui)

# Sidepanel event handlers: remove Trip CRUD/day scheduling; worker is the only writer.
handlers = read('src/extension/sidepanel/handlers.ts')
handlers = handlers.replace('  checkOpeningHoursCollision,\n', '')
handlers = handlers.replace('  placeIdentityKey,\n', '')
handlers = handlers.replace('  type PlannerTrip,\n', '  type CaptureContext,\n')
handlers = handlers.replace(
    "import { mergeWriteCaptureState, normalizeCaptureState, saveCaptureStateViaWorker, writeCaptureState } from '../capture-state';",
    "import { normalizeCaptureState, saveCaptureStateViaWorker, writeCaptureState } from '../capture-state';",
    1,
)
handlers = handlers.replace(
    "import { getExistingPlaceForUrl, MAP_CURRENCY_OVERRIDE_KEY, MAP_CURRENCY_OVERRIDE_ORIGIN_KEY, store, t } from './store';",
    "import { getExistingPlaceForUrl, store, t } from './store';",
    1,
)
handlers = handlers.replace('  populateEditTripForm,\n', '')
save_pattern = re.compile(r"export async function saveState\(\): Promise<void> \{.*?\n\}\n", re.S)
save_repl = '''export async function saveState(): Promise<void> {
  try {
    const viaWorker = await saveCaptureStateViaWorker(store.state, store.locallyDeletedIds);
    store.state = viaWorker.state;
    store.locallyDeletedIds.clear();
  } catch (error) {
    console.warn('[Ownly Capture] Failed to persist capture state', error);
    setStatus(
      store.lang === 'zh'
        ? '⚠️ 状态保存失败：后台写入未完成，请重试。'
        : '⚠️ Failed to save state through the background worker. Retry.',
      'error',
    );
  }
  renderState();
  renderCurrentPlace();
  renderSmartListCard();
  renderCandidatesList();
}
'''
handlers, count = save_pattern.subn(save_repl, handlers, count=1)
if count != 1:
    raise RuntimeError('saveState block not found')
handlers = re.sub(r"\nfunction nextSortOrderFor\(date: string\): number \{.*?\n\}\n", '\n', handlers, count=1, flags=re.S)
handlers = handlers.replace('  activeTrip?: PlannerTrip,', '  activeTrip?: CaptureContext,')
handlers = handlers.replace('activeTrip?.id || \'\'', 'activeTrip?.tripId || \'\'')
handlers = re.sub(r"\n    if \(target\.matches\('\.day-select'\)\) \{.*?\n    \}\n", '\n', handlers, count=1, flags=re.S)
handlers = re.sub(r"\nfunction createTripFromForm\(\): PlannerTrip \| null \{.*?\n\}\n\nexport function initHandlers", '\nexport function initHandlers', handlers, count=1, flags=re.S)
handlers = re.sub(r"\n  el\.bulkDaySelect\.addEventListener\('change', \(\) => \{.*?\n  \}\);", '', handlers, count=1, flags=re.S)

# Replace currency selector block through re-detect with tab-scoped session commands.
currency_pattern = re.compile(r"\n  // Currency selector:.*?\n  // Select all / deselect all in bulk mode", re.S)
currency_repl = '''
  // Page-currency override is tab/session scoped. Trip currency remains Planner-owned.
  el.currencySelector.addEventListener('change', () => {
    const selected = el.currencySelector.value;
    if (!selected) return;
    store.mapCurrencyOverride = selected === 'AUTO' ? undefined : selected;
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const response = await chrome.runtime.sendMessage({
        type: 'OWNLY_SET_FX_OVERRIDE',
        tabId: tab.id,
        currency: store.mapCurrencyOverride,
      }) as { ok?: boolean } | undefined;
      if (!response?.ok) throw new Error('FX override was not persisted');
      if (store.mapCurrencyOverride) {
        store.pageDetectedCurrency = store.mapCurrencyOverride;
        if (store.currentPlace) store.currentPlace = { ...store.currentPlace, detectedCurrency: store.mapCurrencyOverride };
        if (store.detectedSavedList) store.detectedSavedList = { ...store.detectedSavedList, detectedCurrency: store.mapCurrencyOverride };
      }
      renderCurrencyPill();
      renderCurrentPlace();
      setStatus(t().currencyApplied(selected), 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  el.btnRedetectCurrency.addEventListener('click', () => {
    store.mapCurrencyOverride = undefined;
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.runtime.sendMessage({ type: 'OWNLY_SET_FX_OVERRIDE', tabId: tab.id, currency: null });
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'OWNLY_REDETECT_PAGE_CURRENCY',
        targetCurrency: store.state.activeContext?.currency,
      }) as { detectedCurrency?: string } | undefined;
      const detected = response?.detectedCurrency || 'USD';
      store.pageDetectedCurrency = detected;
      if (store.currentPlace) store.currentPlace = { ...store.currentPlace, detectedCurrency: detected };
      renderCurrencyPill();
      renderCurrentPlace();
      setStatus(store.lang === 'zh' ? `已重新检测页面货币：${detected}` : `Page currency re-detected: ${detected}`, 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  // Select all / deselect all in bulk mode'''
handlers, count = currency_pattern.subn(currency_repl, handlers, count=1)
if count != 1:
    raise RuntimeError('currency handler block not found')

# Smart list: Capture only adds/updates inbox candidates. No auto Trip creation or lifecycle drops.
smart_pattern = re.compile(r"\n  // ⚡ 1-Click Sync Matched Saved List.*?\n  el\.btnToggleListPreview\.addEventListener", re.S)
smart_repl = '''
  // Smart-list import only fills the Capture inbox for the Planner-selected context.
  el.btnSmartSyncAll.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const context = store.state.activeContext;
      const savedList = store.detectedSavedList;
      if (!context) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      if (!savedList || savedList.places.length === 0) return;
      const now = new Date().toISOString();
      const mergedPending = new Map(store.state.pendingPlaces.map((place) => [place.id, place] as const));
      let importedCount = 0;
      for (const item of savedList.places) {
        const title = cleanExtractedText(item.title);
        if (!title || isJunkNavigationText(title)) continue;
        const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, item.sourceUrl, item.sourcePlaceId, item.coordinates);
        const id = existing?.id ?? crypto.randomUUID();
        const address = item.address ? cleanExtractedText(item.address) : undefined;
        const kind = inferPlaceKind([title, item.category, address, ...(item.types || [])].filter(Boolean).join(' '));
        const captured: PlannerTripPlace = {
          schema_version: '0.1',
          type: 'trip_place',
          id,
          trip_id: context.tripId,
          title,
          source_provider: item.sourceProvider || 'google_maps',
          source_url: item.sourceUrl,
          source_place_id: item.sourcePlaceId ?? existing?.source_place_id,
          kind: existing?.kind ?? kind,
          area: existing?.area ?? address?.split(/[,，·]/)[0]?.trim(),
          priority: existing?.priority ?? 'want',
          tags: ensurePlaceKindTag(Array.from(new Set([...(existing?.tags ?? []), ...(context.tags ?? []), savedList.listName])), existing?.kind ?? kind, store.lang),
          why: existing?.why ?? item.userNote ?? item.summary,
          signals: existing?.signals ?? [],
          risks: existing?.risks ?? [],
          notes: existing?.notes ?? item.userNote,
          observed_rating: item.rating ?? existing?.observed_rating,
          observed_price: item.priceLevel ?? existing?.observed_price,
          observed_at: today(),
          preferred_window: existing?.preferred_window,
          duration_minutes: existing?.duration_minutes,
          open_hours: item.openHours ?? existing?.open_hours,
          address: address ?? existing?.address,
          coordinates: item.coordinates ?? existing?.coordinates,
          phone: item.phone ?? existing?.phone,
          plus_code: item.plusCode ?? existing?.plus_code,
          menu_url: item.menuUrl ?? existing?.menu_url,
          reservation_url: item.reservationUrl ?? existing?.reservation_url,
          review_topics: item.reviewTopics ?? existing?.review_topics,
          types: Array.from(new Set([...(item.types ?? []), ...(existing?.types ?? [])])),
          reservation_status: 'none',
          state: 'candidate',
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        mergedPending.set(id, captured);
        importedCount += 1;
      }
      store.state = { ...store.state, pendingPlaces: [...mergedPending.values()] };
      await saveState();
      store.smartListDismissed = true;
      renderSmartListCard();
      setStatus(dict.savedListSynced(importedCount, savedList.listName), 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  el.btnToggleListPreview.addEventListener'''
handlers, count = smart_pattern.subn(smart_repl, handlers, count=1)
if count != 1:
    raise RuntimeError('smart list handler block not found')

# Bulk import parser: use only active context and pending-place identity.
bulk_pattern = re.compile(r"\n  // Bulk Text / Links Parser.*?\n  el\.btnToggleSelectAll\.addEventListener", re.S)
bulk_repl = '''
  // Bulk text/list import targets the active Planner context only.
  el.btnParseBulkImport.addEventListener('click', () => {
    void (async () => {
      const dict = t();
      const context = store.state.activeContext;
      if (!context) {
        setStatus(dict.tripRequiredError, 'error');
        return;
      }
      const text = el.bulkInputText.value.trim();
      if (!text) {
        setStatus(dict.bulkImportEmpty, 'error');
        return;
      }
      const lines = text.split(/[\\r\\n;]+/).map((line) => line.trim()).filter(Boolean);
      const mergedPending = new Map(store.state.pendingPlaces.map((place) => [place.id, place] as const));
      let importedCount = 0;
      const errors: string[] = [];
      for (const line of lines) {
        const isUrl = /^https?:\\/\\//i.test(line);
        if (isUrl && (line.includes('maps.app.goo.gl') || line.includes('!2s') || line.includes('placelists/list') || line.includes('goo.gl/maps'))) {
          try {
            const listItems = await resolveListPlacesSmart(line, context);
            if (listItems && listItems.length > 0) {
              for (const item of listItems) {
                const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, item.source_url, item.source_place_id, item.coordinates);
                if (existing) continue;
                item.id = crypto.randomUUID();
                item.trip_id = context.tripId;
                item.state = 'candidate';
                item.scheduled_date = undefined;
                item.sort_order = undefined;
                item.locked = undefined;
                mergedPending.set(item.id, item);
                importedCount += 1;
              }
              continue;
            }
            errors.push(dict.parseNotFoundLine(line));
          } catch (error) {
            errors.push(dict.parseFailedLine(line, error instanceof Error ? error.message : 'unknown'));
          }
        }

        const sourceUrl = isUrl ? line : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
        const title = isUrl ? (line.match(/\\/maps\\/place\\/([^/?#]+)/)?.[1]?.replace(/\\+/g, ' ') || line) : line;
        const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, sourceUrl);
        if (existing) continue;
        const kind = inferPlaceKind(safeDecodeUri(title));
        const now = new Date().toISOString();
        const place: PlannerTripPlace = {
          schema_version: '0.1',
          type: 'trip_place',
          id: crypto.randomUUID(),
          trip_id: context.tripId,
          title: safeDecodeUri(title),
          source_provider: inferSourceProvider(sourceUrl),
          source_url: sourceUrl,
          kind,
          priority: 'want',
          tags: ensurePlaceKindTag(context.tags ?? [], kind, store.lang),
          signals: [],
          risks: [],
          observed_at: today(),
          reservation_status: 'none',
          state: 'candidate',
          created_at: now,
          updated_at: now,
        };
        mergedPending.set(place.id, place);
        importedCount += 1;
      }
      store.state = { ...store.state, pendingPlaces: [...mergedPending.values()] };
      await saveState();
      el.bulkInputText.value = '';
      setStatus(errors.length > 0 ? dict.importedWithWarnings(importedCount, errors.join(', ')) : dict.importedCount(importedCount), 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  el.btnToggleSelectAll.addEventListener'''
handlers, count = bulk_pattern.subn(bulk_repl, handlers, count=1)
if count != 1:
    raise RuntimeError('bulk import handler block not found')

batch_pattern = re.compile(r"\n  el\.btnBatchAdd\.addEventListener\('click', \(\) => \{.*?\n  // Edit active trip form submission", re.S)
batch_repl = '''
  el.btnBatchAdd.addEventListener('click', () => {
    void (async () => {
      const context = store.state.activeContext;
      if (!context) {
        setStatus(t().tripRequiredError, 'error');
        return;
      }
      const selectedUrls = new Set(Array.from(el.batchListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.dataset.url).filter(Boolean));
      const source = store.detectedSavedList?.places?.length ? store.detectedSavedList.places : store.detectedListPlaces;
      const mergedPending = new Map(store.state.pendingPlaces.map((place) => [place.id, place] as const));
      let added = 0;
      const now = new Date().toISOString();
      for (const item of source.filter((place) => selectedUrls.has(place.sourceUrl))) {
        const existing = findExistingTripPlace(store.state.pendingPlaces, context.tripId, item.sourceUrl, item.sourcePlaceId, item.coordinates);
        if (existing) continue;
        const kind = inferPlaceKind([item.title, item.category, item.address, ...(item.types || [])].filter(Boolean).join(' '));
        const place: PlannerTripPlace = {
          schema_version: '0.1', type: 'trip_place', id: crypto.randomUUID(), trip_id: context.tripId,
          title: item.title, source_provider: item.sourceProvider || 'google_maps', source_url: item.sourceUrl,
          source_place_id: item.sourcePlaceId, kind, priority: 'want', tags: ensurePlaceKindTag(context.tags ?? [], kind, store.lang),
          why: item.userNote || item.summary, signals: [], risks: [], notes: item.userNote,
          open_hours: item.openHours, address: item.address, observed_rating: item.rating, observed_price: item.priceLevel,
          observed_at: today(), coordinates: item.coordinates, phone: item.phone, plus_code: item.plusCode,
          menu_url: item.menuUrl, reservation_url: item.reservationUrl, review_topics: item.reviewTopics, types: item.types,
          reservation_status: 'none', state: 'candidate', created_at: now, updated_at: now,
        };
        mergedPending.set(place.id, place);
        added += 1;
      }
      store.state = { ...store.state, pendingPlaces: [...mergedPending.values()] };
      await saveState();
      setStatus(t().batchAddedSuccess(added), 'success');
    })().catch((error) => setStatus(String(error), 'error'));
  });

  // Trip CRUD lives in Planner/Vault. Capture has no local Trip editor.'''
handlers, count = batch_pattern.subn(batch_repl, handlers, count=1)
if count != 1:
    raise RuntimeError('batch add / trip CRUD block not found')
# Delete all old Trip CRUD listeners that remain before refreshPlace.
handlers = re.sub(r"\n  // Trip CRUD lives in Planner/Vault\. Capture has no local Trip editor\..*?\n  el\.refreshPlace\.addEventListener", "\n  // Trip CRUD lives in Planner/Vault. Capture has no local Trip editor.\n\n  el.refreshPlace.addEventListener", handlers, count=1, flags=re.S)

handlers = handlers.replace('if (!store.currentPlace || !store.state.activeTripId) return;', 'if (!store.currentPlace || !store.state.activeContext?.tripId) return;')

capture_pattern = re.compile(r"\n  el\.captureForm\.addEventListener\('submit', \(event\) => \{.*?\n  \}\);\n\n  el\.captureForm\.addEventListener\('keydown'", re.S)
capture_repl = '''
  el.captureForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const dict = t();
    const context = store.state.activeContext;
    if (!context) {
      setStatus(dict.tripRequiredError, 'error');
      return;
    }
    if (!store.currentPlace) {
      setStatus(dict.placeRequiredError, 'error');
      return;
    }
    const duration = Number(el.duration.value);
    const rating = Number(el.rating.value);
    const now = new Date().toISOString();
    const existing = findExistingTripPlace(
      store.state.pendingPlaces,
      context.tripId,
      store.currentPlace.sourceUrl,
      store.currentPlace.sourcePlaceId,
      store.currentPlace.coordinates,
    );
    const kind = (el.kind.value as PlannerPlaceKind) || 'other';
    const tags = ensurePlaceKindTag(normalizeDelimitedText(el.tags.value), kind, store.lang);
    const id = existing?.id ?? crypto.randomUUID();
    const place: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id,
      trip_id: context.tripId,
      title: cleanExtractedText(store.currentPlace.title),
      source_provider: store.currentPlace.sourceProvider || 'google_maps',
      source_url: store.currentPlace.sourceUrl,
      source_place_id: store.currentPlace.sourcePlaceId ?? existing?.source_place_id,
      kind,
      area: cleanExtractedText(el.area.value.trim()) || undefined,
      priority: existing?.priority ?? 'want',
      tags,
      why: cleanExtractedText(el.why.value.trim()) || undefined,
      signals: normalizeDelimitedText(el.signals.value).map(cleanExtractedText).filter(Boolean),
      risks: normalizeDelimitedText(el.risks.value).map(cleanExtractedText).filter(Boolean),
      notes: cleanExtractedText(el.notes.value.trim()) || undefined,
      observed_rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
      observed_price: el.price.value.trim() || undefined,
      observed_at: today(),
      preferred_window: el.window.value.trim() || undefined,
      duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.min(1440, Math.round(duration)) : undefined,
      open_hours: cleanExtractedText(store.currentPlace.openHours ?? existing?.open_hours) || undefined,
      address: cleanExtractedText(store.currentPlace.address ?? existing?.address) || undefined,
      coordinates: store.currentPlace.coordinates ?? existing?.coordinates,
      phone: store.currentPlace.phone ?? existing?.phone,
      plus_code: store.currentPlace.plusCode ?? existing?.plus_code,
      menu_url: store.currentPlace.menuUrl ?? existing?.menu_url,
      reservation_url: store.currentPlace.reservationUrl ?? existing?.reservation_url,
      review_topics: store.currentPlace.reviewTopics ?? existing?.review_topics,
      types: Array.from(new Set([...(store.currentPlace.types ?? []), ...(existing?.types ?? [])])),
      reservation_status: 'none',
      state: 'candidate',
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    store.state = { ...store.state, pendingPlaces: [...store.state.pendingPlaces.filter((item) => item.id !== id), place] };
    void saveState().then(() => {
      syncQuickChipStates();
      setStatus(existing ? dict.candidateUpdated : dict.candidateAdded, 'success');
      flashNewCandidate(place.id);
    });
  });

  el.captureForm.addEventListener('keydown' '''
handlers, count = capture_pattern.subn(capture_repl, handlers, count=1)
if count != 1:
    raise RuntimeError('capture submit block not found')
write('src/extension/sidepanel/handlers.ts', handlers)

# Sidepanel listener no longer references Trip editor.
sidepanel = read('src/extension/sidepanel.ts')
sidepanel = sidepanel.replace('  populateEditTripForm,\n', '')
sidepanel = sidepanel.replace('  populateEditTripForm();\n', '')
write('src/extension/sidepanel.ts', sidepanel)

# Content FX engine: override is supplied by the background for this exact tab.
content = read('src/extension/content.ts')
content = re.sub(
    r"\n  const currentOrigin = typeof window !== 'undefined' \? window\.location\.origin : '';\n\n  function applyOverrideIfMatchingOrigin\(override\?: string, origin\?: string\) \{.*?\n  \}\n\n  try \{\n    // 1\. Check local storage directly on page load.*?\n    // 2\. React dynamically to storage changes.*?\n    \}\);\n",
    "\n  function applyOverride(override?: string) {\n    fxOverrideCurrency = override && override !== 'AUTO' ? override : undefined;\n  }\n",
    content,
    count=1,
    flags=re.S,
)
content = content.replace('          overrideOrigin?: string;\n', '')
content = content.replace('          if (res.overrideCurrency) applyOverrideIfMatchingOrigin(res.overrideCurrency, res.overrideOrigin);', '          applyOverride(res.overrideCurrency);')
write('src/extension/content.ts', content)

# Planner: durable writes before UI state, no localStorage migration, explicit Capture import + context push.
planner = read('src/components/planner/PlannerHome.tsx')
planner = planner.replace(
    "import { ackCapturedPlaces, pullCaptureState } from './capture-bridge';",
    "import { ackCapturedPlaces, pullCaptureState, setCaptureContext } from './capture-bridge';",
    1,
)
add_expense_pattern = re.compile(r"  const handleAddExpense = useCallback\(.*?\n  \);\n\n  const handleDeleteExpense = useCallback\(.*?\n  \);", re.S)
add_expense_repl = '''  const handleAddExpense = useCallback(
    async (item: Omit<TripExpenseItem, 'id' | 'created_at'>) => {
      if (!selectedTripId) return;
      const newExp: TripExpenseItem = { ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      try {
        await plannerRepository.upsertExpense(newExp);
        setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: [newExp, ...(prev[selectedTripId] ?? [])] }));
      } catch (error) {
        console.warn('[Planner] Failed to persist expense', error);
        setNotice(zh ? '费用保存失败，界面未写入未持久化数据。' : 'Expense save failed; the UI was not updated with unsaved data.');
      }
    },
    [selectedTripId, zh],
  );

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      if (!selectedTripId) return;
      try {
        await plannerRepository.deleteExpense(id);
        setExpensesByTrip((prev) => ({ ...prev, [selectedTripId]: (prev[selectedTripId] ?? []).filter((expense) => expense.id !== id) }));
      } catch (error) {
        console.warn('[Planner] Failed to delete expense', error);
        setNotice(zh ? '费用删除失败，原记录仍保留。' : 'Expense delete failed; the original record is still present.');
      }
    },
    [selectedTripId, zh],
  );'''
planner, count = add_expense_pattern.subn(add_expense_repl, planner, count=1)
if count != 1:
    raise RuntimeError('Planner expense callbacks not found')

members_pattern = re.compile(r"  const handleUpdateMembers = useCallback\(.*?\n  \);", re.S)
members_repl = '''  const handleUpdateMembers = useCallback(
    async (nextMembers: string[]) => {
      if (!selectedTripId) return;
      const trip = trips.find((item) => item.id === selectedTripId);
      if (!trip) return;
      try {
        const nextTrip = { ...trip, members: nextMembers, updated_at: new Date().toISOString() };
        await plannerRepository.upsertTrip(nextTrip);
        setMembersByTrip((prev) => ({ ...prev, [selectedTripId]: nextMembers }));
        setTrips((prev) => prev.map((item) => (item.id === selectedTripId ? nextTrip : item)));
      } catch (error) {
        console.warn('[Planner] Failed to persist trip members', error);
        setNotice(zh ? '成员保存失败，未更新界面。' : 'Member save failed; the UI was not updated.');
      }
    },
    [selectedTripId, trips, zh],
  );'''
planner, count = members_pattern.subn(members_repl, planner, count=1)
if count != 1:
    raise RuntimeError('Planner member callback not found')

hydrate_pattern = re.compile(r"  const hydrateLedgerFromVault = useCallback\(async \(trips: PlannerTrip\[\]\) => \{.*?\n  \}, \[\]\);", re.S)
hydrate_repl = '''  const hydrateLedgerFromVault = useCallback(async (nextTrips: PlannerTrip[]) => {
    const stored = await plannerRepository.listExpenses();
    const grouped: Record<string, TripExpenseItem[]> = {};
    for (const expense of stored) (grouped[expense.trip_id] ??= []).push(expense);
    setExpensesByTrip(grouped);
    const nextMembers: Record<string, string[]> = {};
    for (const trip of nextTrips) {
      if (trip.members?.length) nextMembers[trip.id] = trip.members;
    }
    setMembersByTrip(nextMembers);
  }, []);'''
planner, count = hydrate_pattern.subn(hydrate_repl, planner, count=1)
if count != 1:
    raise RuntimeError('Planner legacy ledger migration block not found')

# Insert active Capture context push right after selectedTrip memo.
selected_marker = '''  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );
'''
selected_insert = selected_marker + '''
  useEffect(() => {
    const context = selectedTrip
      ? { tripId: selectedTrip.id, title: selectedTrip.title, currency: selectedTrip.currency, tags: selectedTrip.tags }
      : null;
    void setCaptureContext(context);
  }, [selectedTrip]);
'''
if selected_marker not in planner:
    raise RuntimeError('Planner selectedTrip marker not found')
planner = planner.replace(selected_marker, selected_insert, 1)

sync_old = '''      await plannerRepository.initialize();
      const existingTripIds = new Set(trips.map((trip) => trip.id));
      for (const trip of state.trips) {
        if (!existingTripIds.has(trip.id)) await plannerRepository.upsertTrip(trip);
      }
      if (state.pendingPlaces.length > 0) {
        await plannerRepository.upsertPlaces(state.pendingPlaces);
        await ackCapturedPlaces(state.pendingPlaces.map((place) => place.id));
      }
      setCapturePending(0);
      await load();
      setSelectedTripId((current) => current || state.activeTripId || state.trips[0]?.id || '');'''
sync_new = '''      await plannerRepository.initialize();
      if (state.pendingPlaces.length > 0) {
        await plannerRepository.importCapturedPlaces(state.pendingPlaces);
        const acknowledged = await ackCapturedPlaces(state.pendingPlaces.map((place) => place.id));
        if (!acknowledged) throw new Error('Capture ACK failed');
      }
      setCapturePending(0);
      await load();
      setSelectedTripId((current) => current || state.activeContext?.tripId || '');'''
if sync_old not in planner:
    raise RuntimeError('Planner sync block not found')
planner = planner.replace(sync_old, sync_new, 1)
write('src/components/planner/PlannerHome.tsx', planner)

# Manifest: supported providers only; no blanket HTTP/S injection. FX API stays explicit.
manifest = json.loads(read('extension/manifest.json'))
manifest['version'] = '0.5.0'
manifest['host_permissions'] = [
    'https://www.google.com/*',
    'https://maps.google.com/*',
    'https://maps.app.goo.gl/*',
    'https://goo.gl/*',
    'https://www.booking.com/*',
    'https://tabelog.com/*',
    'https://*.tabelog.com/*',
    'https://www.xiaohongshu.com/*',
    'https://open.er-api.com/*',
]
manifest['content_scripts'][0]['matches'] = [
    'https://www.google.com/maps/*',
    'https://maps.google.com/*',
    'https://www.booking.com/*',
    'https://tabelog.com/*',
    'https://*.tabelog.com/*',
    'https://www.xiaohongshu.com/*',
]
write('extension/manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

# Tests: hard V2 state and worker serialization.
write('src/extension/capture-state.test.ts', '''import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_STORAGE_KEY,
  mutateCaptureStateInWorker,
  normalizeCaptureState,
  readCaptureState,
} from './capture-state';
import type { PlannerTripPlace } from '../domain/planner';

const storage = new Map<string, unknown>();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (...keys: string[]) => Object.fromEntries(keys.map((key) => [key, storage.get(key)])),
      set: async (entries: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(entries)) storage.set(key, value);
      },
    },
  },
});

function place(id: string): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: 'trip-1', title: `Place ${id}`,
    source_provider: 'google_maps', source_url: `https://www.google.com/maps/place/${id}`,
    kind: 'attraction', priority: 'want', tags: [], signals: [], risks: [], reservation_status: 'none',
    state: 'candidate', created_at: '2026-08-23T00:00:00.000Z',
  };
}

beforeEach(() => storage.clear());

describe('normalizeCaptureState', () => {
  it('does not migrate V1 and only accepts the V2 inbox contract', () => {
    expect(normalizeCaptureState(undefined)).toEqual({ version: 2, activeContext: null, pendingPlaces: [] });
    expect(normalizeCaptureState({ version: 1, trips: [], pendingPlaces: [place('legacy')] })).toEqual({
      version: 2, activeContext: null, pendingPlaces: [],
    });
    const state = normalizeCaptureState({
      version: 2,
      activeContext: { tripId: 'trip-1', title: 'Tokyo', currency: 'jpy', tags: ['food'] },
      pendingPlaces: [{ ...place('a'), state: 'scheduled', scheduled_date: '2026-10-01', locked: true }],
    });
    expect(state.activeContext).toMatchObject({ tripId: 'trip-1', currency: 'JPY' });
    expect(state.pendingPlaces[0]).toMatchObject({ state: 'candidate', scheduled_date: undefined, locked: undefined });
  });
});

describe('mutateCaptureStateInWorker', () => {
  it('serializes concurrent background mutations', async () => {
    await Promise.all([
      mutateCaptureStateInWorker((current) => ({ state: { ...current, pendingPlaces: [...current.pendingPlaces, place('a')] }, result: 'a' })),
      mutateCaptureStateInWorker((current) => ({ state: { ...current, pendingPlaces: [...current.pendingPlaces, place('b')] }, result: 'b' })),
    ]);
    const final = await readCaptureState();
    expect(final.pendingPlaces.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(storage.get(CAPTURE_STORAGE_KEY)).toMatchObject({ version: 2 });
  });
});
''')

# Domain tests: update only the semantics that deliberately changed.
test = read('src/domain/planner.test.ts')
test = test.replace(
    "    expect(merged.area).toBe('Asakusa');\n    expect(merged.priority).toBe('must');\n    expect(merged.signals).toEqual(['early morning']);",
    "    expect(merged.area).toBe('Old area');\n    expect(merged.priority).toBe('want');\n    expect(merged.signals).toEqual(['old signal']);",
    1,
)
test = re.sub(r"\n  it\('honors an explicit dropped state as a lifecycle command during recapture'.*?\n  \}\);", '', test, count=1, flags=re.S)
test = test.replace(
    "    const fresh: OwnlyCaptureState = {\n      version: 1,\n      trips: [],\n      activeTripId: null,\n      pendingPlaces: [place('bg-quick'), place('acked-gone')],\n      knownPlaceIds: { 't1::u:bg': 'bg-quick' },\n    };\n    const local: OwnlyCaptureState = {\n      version: 1,\n      trips: [],\n      activeTripId: null,\n      pendingPlaces: [place('edited-local'), place('locally-deleted')],\n      knownPlaceIds: { 't1::u:local': 'edited-local' },\n    };\n    const merged = mergeCaptureState(fresh, local, new Set(['locally-deleted', 'acked-gone']));\n    expect(merged.trips).toBe(local.trips);\n    expect(merged.pendingPlaces.map((p) => p.id)).toEqual(['edited-local', 'bg-quick']);\n    expect(merged.knownPlaceIds['t1::u:bg']).toBe('bg-quick');\n    expect(merged.knownPlaceIds['t1::u:local']).toBe('edited-local');",
    "    const fresh: OwnlyCaptureState = {\n      version: 2,\n      activeContext: { tripId: 'trip-1', title: 'Tokyo' },\n      pendingPlaces: [place('bg-quick'), place('acked-gone')],\n    };\n    const local: OwnlyCaptureState = {\n      version: 2,\n      activeContext: null,\n      pendingPlaces: [place('edited-local'), place('locally-deleted')],\n    };\n    const merged = mergeCaptureState(fresh, local, new Set(['locally-deleted', 'acked-gone']));\n    expect(merged.activeContext).toEqual(fresh.activeContext);\n    expect(merged.pendingPlaces.map((p) => p.id)).toEqual(['edited-local', 'bg-quick']);",
    1,
)
# Update findExistingTripPlace calls from old known-id-map signature.
test = re.sub(r"findExistingTripPlace\(\{[^}]*\},\s*([^,]+),\s*([^,]+),", r"findExistingTripPlace(\1, \2,", test)
write('src/domain/planner.test.ts', test)

# Docs: state the single authority and current security boundary plainly.
write('docs/CAPTURE_SYNC_BOUNDARY.md', '''# Capture ↔ Planner boundary

Ownly has one authoritative travel database: **Planner Markdown/Vault**.

## Capture owns only an inbox

The extension stores exactly two things under `ownlyCaptureStateV2`:

- `activeContext`: a small projection of the Planner-selected trip (`tripId`, title, currency, tags)
- `pendingPlaces`: unsynced research candidates

Capture does **not** store Trip objects, schedule state, lifecycle state, route order, locks, budgets, members, or a historical identity map.

## Direction of data

1. Planner selects a trip and sends `activeContext` to the extension.
2. Capture extracts source facts and the user's pre-import research notes into `pendingPlaces`.
3. Planner pulls candidates and calls `PlannerRepository.importCapturedPlaces()`.
4. Existing canonical places keep Planner-owned decisions; Capture refreshes only source/observed facts.
5. Planner ACKs imported candidate IDs. ACK failure is an error; pending candidates remain retryable.

There is no bidirectional database synchronization and no fallback writer.

## Single writer

Only the MV3 background service worker writes `ownlyCaptureStateV2` in `chrome.storage.local`.
Side panel and bridge contexts send commands to the worker. A failed worker write surfaces as an error instead of falling back to direct storage mutation.

## Scheduling ownership

Scheduling exists only in Planner/Vault. Capture has no day selector, no `scheduled_date`, no `sort_order`, no `locked`, and no lifecycle command.

## Identity

Import matching uses, in order:

1. provider + `source_place_id`
2. rounded coordinates
3. normalized canonical source URL
4. URL/title-style fallback only when stronger identity is unavailable

The old append-only `knownPlaceIds` tombstone map is removed.

## Permissions

The extension no longer injects on every HTTP/S page. Static content scripts are restricted to supported travel providers; the FX endpoint and short-link hosts are explicit host permissions. Manual page-currency override is scoped to the active tab/session.
''')

planner_doc = read('docs/PLANNER.md')
planner_doc = re.sub(r"\n.*legacy localStorage.*\n", '\n', planner_doc, flags=re.I)
planner_doc = planner_doc.replace('Capture extension owns trip creation and research inbox.', 'Planner/Vault owns trips; Capture is a research inbox bound to the currently selected Planner trip.')
write('docs/PLANNER.md', planner_doc)

print('refactor applied')
