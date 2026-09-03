/**
 * Ownly Capture — independent domain for place collection.
 *
 * Capture never owns Trip planning state.
 * Planner never owns Capture collection state.
 * Their only shared contract is the portable Capture Collection schema.
 */

// ─── Source provider ──────────────────────────────────────────────────────────

export type CaptureSourceProvider =
  | 'google_maps'
  | 'booking'
  | 'tabelog'
  | 'xiaohongshu'
  | 'other';

// ─── Collection ───────────────────────────────────────────────────────────────

export interface CaptureCollection {
  id: string;
  title: string;
  source_provider?: CaptureSourceProvider;
  source_list_id?: string;
  source_url?: string;
  currency?: string;
  created_at: string;
  updated_at?: string;
}

// ─── Place ────────────────────────────────────────────────────────────────────

export type CapturePlaceKind =
  | 'attraction'
  | 'food'
  | 'cafe'
  | 'stay'
  | 'shopping'
  | 'transit'
  | 'experience'
  | 'service'
  | 'other';

export type CapturePlacePriority = 'must' | 'want' | 'optional';

export interface CapturePlace {
  id: string;
  collection_id: string;
  title: string;

  source: {
    provider: CaptureSourceProvider;
    url: string;
    place_id?: string;
    category?: string;
    types?: string[];
  };

  address?: string;
  coordinates?: { lat: number; lng: number };

  rating?: number;
  review_count?: number;

  price?: {
    raw?: string;
    currency?: string;
    min?: number;
    max?: number;
    unit?: string;
    level?: number;
  };

  open_hours?: string;
  phone?: string;
  plus_code?: string;
  menu_url?: string;
  reservation_url?: string;
  review_topics?: string[];

  inferred_kind?: CapturePlaceKind;

  user?: {
    priority?: CapturePlacePriority;
    tags?: string[];
    why?: string;
    notes?: string;
    preferred_window?: string;
    duration_minutes?: number;
  };

  captured_at: string;
  updated_at?: string;
}

// ─── Extension State V3 ──────────────────────────────────────────────────────

export interface OwnlyCaptureStateV3 {
  version: 3;
  active_collection_id?: string;
  collections: CaptureCollection[];
  places: CapturePlace[];
  /** Optional. Only used when Web Planner is open. Never required for Capture itself. */
  planner_target?: {
    trip_id: string;
    title: string;
  };
  last_export_at?: string;
}

export const EMPTY_CAPTURE_STATE_V3: OwnlyCaptureStateV3 = {
  version: 3,
  collections: [],
  places: [],
};

// ─── Collection Export (portable JSON) ───────────────────────────────────────
// 权限边界（P0）：Collection 是「地点集合」，Trip 是「个人执行计划」
// 分享 Collection 时：
//   允许：地点（title/address/coordinates/source）、标签（tags）、描述（why）、图片（未落库，预留）
//   禁止：费用（price.*）、私人备注（user.notes）、行程日期（仅 Trip 拥有，Collection 不含）
// 实现：buildCollectionExport 默认完整导出（含私有字段，用于个人备份）；
//       buildShareableCollectionExport / sanitizePlaceForShare 用于对外分享（自动剥离禁止字段）
//       协议文档：docs/architecture/ARCHITECTURE.md#Capture Boundary Constraint

export interface OwnlyCollectionExportV1 {
  schema: 'ownly.capture.collection';
  version: 1;
  exported_at: string;
  collection: {
    id: string;
    title: string;
    source_provider?: string;
    source_list_id?: string;
    source_url?: string;
    currency?: string;
    place_count: number;
  };
  places: CapturePlace[];
  /** P1: 来源追踪（可选，分享导入时填充） */
  provenance?: {
    source_type: 'shared_collection';
    creator?: string;
    collection_id: string;
    shared_at?: string;
  };
}

// ─── Export builder ──────────────────────────────────────────────────────────

export function buildCollectionExport(
  collection: CaptureCollection,
  places: CapturePlace[],
): OwnlyCollectionExportV1 {
  return {
    schema: 'ownly.capture.collection',
    version: 1,
    exported_at: new Date().toISOString(),
    collection: {
      id: collection.id,
      title: collection.title,
      source_provider: collection.source_provider,
      source_list_id: collection.source_list_id,
      source_url: collection.source_url,
      currency: collection.currency,
      place_count: places.length,
    },
    places,
  };
}

/** P0: 分享用净化 — 剥离费用/私人备注等禁止字段 */
export function sanitizePlaceForShare(place: CapturePlace): CapturePlace {
  const { price: _price, ...rest } = place;
  const user = place.user ? { ...place.user } : undefined;
  if (user) {
    delete user.notes; // 私人备注禁止外泄
    // why/tags 视为描述/标签，允许分享；如需更严格可一并删除 user.why
  }
  return {
    ...rest,
    price: undefined,
    user: user && Object.keys(user).length > 0 ? user : undefined,
  };
}

export function buildShareableCollectionExport(
  collection: CaptureCollection,
  places: CapturePlace[],
  provenance?: OwnlyCollectionExportV1['provenance'],
): OwnlyCollectionExportV1 {
  return {
    schema: 'ownly.capture.collection',
    version: 1,
    exported_at: new Date().toISOString(),
    collection: {
      id: collection.id,
      title: collection.title,
      source_provider: collection.source_provider,
      source_list_id: collection.source_list_id,
      source_url: collection.source_url,
      currency: collection.currency,
      place_count: places.length,
    },
    places: places.map(sanitizePlaceForShare),
    provenance,
  };
}

export function isCollectionExport(obj: unknown): obj is OwnlyCollectionExportV1 {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return o.schema === 'ownly.capture.collection' && o.version === 1;
}

// ─── V2 → V3 Migration ──────────────────────────────────────────────────────

/** Legacy V2 types (subset needed for migration). */
export interface CaptureContextV2 {
  tripId: string;
  title: string;
  currency?: string;
  tags?: string[];
}

export interface CaptureCandidateV2 {
  id: string;
  trip_id: string;
  title: string;
  source_provider?: string;
  source_url?: string;
  source_place_id?: string;
  source_category?: string;
  types?: string[];
  kind?: string;
  area?: string;
  priority?: string;
  tags?: string[];
  why?: string;
  notes?: string;
  observed_rating?: number;
  observed_review_count?: number;
  observed_price?: string;
  price_currency?: string;
  price_min?: number;
  price_max?: number;
  price_unit?: string;
  price_level?: number;
  open_hours?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  phone?: string;
  plus_code?: string;
  preferred_window?: string;
  duration_minutes?: number;
  signals?: string[];
  risks?: string[];
  created_at?: string;
  [key: string]: unknown;
}

export interface OwnlyCaptureStateV2 {
  version: 2;
  activeContext?: CaptureContextV2 | null;
  pendingPlaces?: CaptureCandidateV2[];
  [key: string]: unknown;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapProvider(raw?: string): CaptureSourceProvider {
  if (raw === 'google_maps' || raw === 'booking' || raw === 'tabelog' || raw === 'xiaohongshu') return raw;
  return 'other';
}

function mapKind(raw?: string): CapturePlaceKind {
  if (
    raw === 'attraction' || raw === 'food' || raw === 'cafe' || raw === 'stay' ||
    raw === 'shopping' || raw === 'transit' || raw === 'experience' || raw === 'service' || raw === 'other'
  ) return raw;
  return 'other';
}

function mapPriority(raw?: string): CapturePlacePriority | undefined {
  if (raw === 'must' || raw === 'want' || raw === 'optional') return raw;
  return undefined;
}

/**
 * Convert a V2 CaptureCandidate (which is a PlannerTripPlace) into a V3 CapturePlace.
 * Strip all Planner-specific fields; keep only source facts + user annotations.
 */
function v2PlaceToV3(v2: CaptureCandidateV2, collectionId: string, now: string): CapturePlace {
  const provider = mapProvider(v2.source_provider);
  return {
    id: v2.id,
    collection_id: collectionId,
    title: v2.title,
    source: {
      provider,
      url: v2.source_url || '',
      place_id: v2.source_place_id,
      category: v2.source_category,
      types: v2.types,
    },
    address: v2.address,
    coordinates: v2.coordinates,
    rating: v2.observed_rating,
    review_count: v2.observed_review_count,
    price: (v2.observed_price || v2.price_currency || v2.price_min != null || v2.price_max != null || v2.price_unit || v2.price_level != null)
      ? {
          raw: v2.observed_price,
          currency: v2.price_currency,
          min: v2.price_min,
          max: v2.price_max,
          unit: v2.price_unit,
          level: v2.price_level,
        }
      : undefined,
    open_hours: v2.open_hours,
    phone: v2.phone,
    plus_code: v2.plus_code,
    inferred_kind: mapKind(v2.kind),
    user: (v2.priority || v2.tags || v2.why || v2.notes || v2.preferred_window || v2.duration_minutes != null)
      ? {
          priority: mapPriority(v2.priority),
          tags: Array.isArray(v2.tags) ? v2.tags : undefined,
          why: v2.why,
          notes: v2.notes,
          preferred_window: v2.preferred_window,
          duration_minutes: v2.duration_minutes,
        }
      : undefined,
    captured_at: v2.created_at || now,
  };
}

/**
 * Migrate a V2 OwnlyCaptureState to V3.
 * If activeContext exists, creates a Collection from it.
 * All pendingPlaces become CapturePlaces in that Collection.
 */
export function migrateV2ToV3(v2: OwnlyCaptureStateV2): OwnlyCaptureStateV3 {
  const now = new Date().toISOString();
  const collections: CaptureCollection[] = [];
  let places: CapturePlace[] = [];

  if (v2.activeContext && v2.activeContext.tripId) {
    const collectionId = `migrated-${v2.activeContext.tripId}`;
    collections.push({
      id: collectionId,
      title: v2.activeContext.title || 'Migrated Collection',
      currency: v2.activeContext.currency,
      created_at: now,
    });

    const v2Places = Array.isArray(v2.pendingPlaces) ? v2.pendingPlaces : [];
    places = v2Places.map((p) => v2PlaceToV3(p, collectionId, now));
  }

  return {
    version: 3,
    active_collection_id: collections[0]?.id,
    collections,
    places,
  };
}

// ─── Capture → Planner Adapter ───────────────────────────────────────────────

export interface PlannerTripPlaceLike {
  schema_version: '0.1';
  type: 'trip_place';
  id: string;
  trip_id: string;
  title: string;
  source_provider: string;
  source_url: string;
  source_place_id?: string;
  kind: string;
  priority?: string;
  tags: string[];
  why?: string;
  notes?: string;
  source_category?: string;
  observed_rating?: number;
  observed_review_count?: number;
  observed_price?: string;
  price_currency?: string;
  price_min?: number;
  price_max?: number;
  price_unit?: string;
  price_level?: number;
  open_hours?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  phone?: string;
  plus_code?: string;
  preferred_window?: string;
  duration_minutes?: number;
  signals: string[];
  risks: string[];
  reservation_status: 'none';
  state: 'candidate';
  import_provenance?: {
    source_type: 'shared_collection';
    creator?: string;
    collection_id: string;
    shared_at?: string;
    imported_at: string;
  };
  created_at: string;
}

/**
 * Convert a CapturePlace into a Planner-compatible place.
 * Generates a new ID to avoid collision when importing the same Collection into multiple Trips.
 */
export function capturePlaceToPlannerPlace(
  capture: CapturePlace,
  tripId: string,
  provenance?: OwnlyCollectionExportV1['provenance'],
): PlannerTripPlaceLike {
  const now = new Date().toISOString();
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    trip_id: tripId,
    title: capture.title,
    source_provider: capture.source.provider,
    source_url: capture.source.url,
    source_place_id: capture.source.place_id,
    kind: capture.inferred_kind || 'other',
    priority: capture.user?.priority,
    tags: capture.user?.tags || [],
    why: capture.user?.why,
    notes: capture.user?.notes,
    source_category: capture.source.category,
    observed_rating: capture.rating,
    observed_review_count: capture.review_count,
    observed_price: capture.price?.raw,
    price_currency: capture.price?.currency,
    price_min: capture.price?.min,
    price_max: capture.price?.max,
    price_unit: capture.price?.unit as PlannerTripPlaceLike['price_unit'],
    price_level: capture.price?.level,
    open_hours: capture.open_hours,
    address: capture.address,
    coordinates: capture.coordinates,
    phone: capture.phone,
    plus_code: capture.plus_code,
    preferred_window: capture.user?.preferred_window,
    duration_minutes: capture.user?.duration_minutes,
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    import_provenance: provenance
      ? {
          source_type: 'shared_collection',
          creator: provenance.creator,
          collection_id: provenance.collection_id,
          shared_at: provenance.shared_at,
          imported_at: now,
        }
      : undefined,
    created_at: now,
  };
}

// ─── Export parse ────────────────────────────────────────────────────────────

export function parseCaptureCollectionExport(data: unknown): OwnlyCollectionExportV1 | null {
  if (!isCollectionExport(data)) return null;
  const d = data as OwnlyCollectionExportV1;
  if (!d.places || !Array.isArray(d.places)) return null;
  if (!d.collection || typeof d.collection !== 'object') return null;
  return d;
}

// ─── V3 Place lookup helpers ─────────────────────────────────────────────────

import { getStrongPlaceIdentityKeys, shareStrongPlaceIdentity } from './place-identity';

/** Find an existing place by URL, Place ID, or coordinates. */
export function findExistingPlace(
  places: CapturePlace[],
  sourceUrl: string,
  sourcePlaceId?: string,
  coordinates?: { lat: number; lng: number },
): CapturePlace | undefined {
  return places.find(
    (p) =>
      p.source.url === sourceUrl ||
      (sourcePlaceId && p.source.place_id === sourcePlaceId) ||
      (coordinates && p.coordinates &&
        p.coordinates.lat === coordinates.lat &&
        p.coordinates.lng === coordinates.lng),
  );
}

/** PlaceIdentityLike adapter for CapturePlace. */
function captureToIdentityLike(place: CapturePlace): { source_provider?: string; source_place_id?: string; source_url?: string } {
  return {
    source_provider: place.source.provider,
    source_place_id: place.source.place_id,
    source_url: place.source.url,
  };
}

/**
 * Find an existing place using strong identity authority (Google Place ID, CID, etc).
 * Falls back to URL/place_id/coordinates match if no strong identity is found.
 * Returns the matching place, or undefined if no duplicate exists.
 */
export function findExistingPlaceByIdentity(
  places: CapturePlace[],
  candidate: { source_provider?: string; source_place_id?: string; source_url?: string },
): CapturePlace | undefined {
  const probeKeys = new Set(getStrongPlaceIdentityKeys(candidate));
  if (probeKeys.size > 0) {
    const match = places.find((p) => {
      const placeKeys = getStrongPlaceIdentityKeys(captureToIdentityLike(p));
      return placeKeys.some((key) => probeKeys.has(key));
    });
    if (match) return match;
  }
  return undefined;
}

/**
 * Check if two places share strong identity (same Google Place ID, CID, etc).
 * Used for dedup decisions during import.
 */
export function placesShareStrongIdentity(a: CapturePlace, b: CapturePlace): boolean {
  return shareStrongPlaceIdentity(captureToIdentityLike(a), captureToIdentityLike(b));
}

/** Reorder places within a collection based on a visible ID order. Hidden/filtered places keep their absolute position. */
export function reorderPlaces(
  allPlaces: CapturePlace[],
  visibleIds: string[],
): CapturePlace[] {
  const idToNewIndex = new Map(visibleIds.map((id, idx) => [id, idx] as const));
  const collectionId = allPlaces[0]?.collection_id;
  if (!collectionId) return allPlaces;

  // Get places NOT in the visible set (hidden/filtered) — keep them at the end
  const hidden = allPlaces.filter((p) => !idToNewIndex.has(p.id));
  // Get visible places in the new order
  const visible = visibleIds
    .map((id) => allPlaces.find((p) => p.id === id))
    .filter((p): p is CapturePlace => p !== undefined);

  return [...visible, ...hidden];
}

/** Merge research enrichment data into an existing CapturePlace. */
export function mergePlaceResearch(
  existing: CapturePlace,
  incoming: Partial<CapturePlace>,
): CapturePlace {
  return {
    ...existing,
    title: incoming.title || existing.title,
    source: {
      ...existing.source,
      ...(incoming.source || {}),
      types: incoming.source?.types
        ? Array.from(new Set([...(incoming.source.types ?? []), ...(existing.source.types ?? [])]))
        : existing.source.types,
    },
    address: incoming.address ?? existing.address,
    coordinates: incoming.coordinates ?? existing.coordinates,
    rating: incoming.rating ?? existing.rating,
    review_count: incoming.review_count ?? existing.review_count,
    phone: incoming.phone ?? existing.phone,
    plus_code: incoming.plus_code ?? existing.plus_code,
    open_hours: incoming.open_hours ?? existing.open_hours,
    menu_url: incoming.menu_url ?? existing.menu_url,
    reservation_url: incoming.reservation_url ?? existing.reservation_url,
    review_topics: incoming.review_topics ?? existing.review_topics,
    // Merge price if incoming has data
    price: incoming.price?.raw ? {
      raw: incoming.price.raw,
      currency: incoming.price.currency ?? existing.price?.currency,
      min: incoming.price.min ?? existing.price?.min,
      max: incoming.price.max ?? existing.price?.max,
      unit: incoming.price.unit ?? existing.price?.unit,
      level: incoming.price.level ?? existing.price?.level,
    } : existing.price,
    user: {
      ...existing.user,
      ...incoming.user,
      tags: incoming.user?.tags
        ? Array.from(new Set([...(incoming.user.tags ?? []), ...(existing.user?.tags ?? [])]))
        : existing.user?.tags,
    },
    inferred_kind: incoming.inferred_kind && incoming.inferred_kind !== 'other'
      ? incoming.inferred_kind
      : existing.inferred_kind,
    updated_at: new Date().toISOString(),
  };
}
