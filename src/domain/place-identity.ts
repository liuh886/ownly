export interface PlaceIdentityLike {
  source_provider?: string | null;
  source_place_id?: string | null;
  source_url?: string | null;
  // Extended fields for unified identity resolution (P1)
  title?: string | null;
  address?: string | null;
  coordinates?: { lat: number; lng: number } | null;
}

export type StrongPlaceIdentityKind = 'source_place_id' | 'google_cid' | 'google_place_id';

export interface StrongPlaceIdentityEvidence {
  provider: string;
  kind: StrongPlaceIdentityKind;
  value: string;
  key: string;
}

export type PlaceIdentityAction = 'create' | 'merge' | 'split' | 'evidence_add' | 'evidence_remove' | 'confidence_change';

export interface PlaceIdentityEvent {
  timestamp: string;
  action: PlaceIdentityAction;
  source: string;
  confidence: number;
  before: {
    id: string;
    title: string;
    identity_keys: string[];
  } | null;
  after: {
    id: string;
    title: string;
    identity_keys: string[];
  } | null;
  metadata?: Record<string, unknown>;
}

function inferProvider(place: PlaceIdentityLike): string {
  const explicit = place.source_provider?.trim().toLowerCase();
  if (explicit) return explicit;
  const url = place.source_url || '';
  if (/google\.[a-z.]+\/maps|maps\.google\./i.test(url)) return 'google_maps';
  return 'other';
}

function cidFromHexFeatureId(raw: string): string | null {
  const match = /:0x([0-9a-f]+)$/i.exec(raw.trim());
  if (!match?.[1]) return null;
  try {
    return BigInt(`0x${match[1]}`).toString();
  } catch {
    return null;
  }
}

function pushEvidence(
  result: StrongPlaceIdentityEvidence[],
  provider: string,
  kind: StrongPlaceIdentityKind,
  value: string | null | undefined,
): void {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return;
  const key = `${provider}:${kind}:${normalized}`;
  if (result.some((item) => item.key === key)) return;
  result.push({ provider, kind, value: normalized, key });
}

/**
 * Canonical authority for identities that are strong enough to auto-merge.
 * Titles, categories, coordinates and display URLs are deliberately excluded.
 */
export function getStrongPlaceIdentityEvidence(place: PlaceIdentityLike): StrongPlaceIdentityEvidence[] {
  const provider = inferProvider(place);
  const result: StrongPlaceIdentityEvidence[] = [];
  const sourceId = place.source_place_id?.trim();

  if (sourceId) {
    pushEvidence(result, provider, 'source_place_id', sourceId);
    if (provider === 'google_maps') {
      const cid = cidFromHexFeatureId(sourceId);
      if (cid) pushEvidence(result, provider, 'google_cid', cid);
      else if (/^\d{8,}$/.test(sourceId)) pushEvidence(result, provider, 'google_cid', sourceId);
      else if (/^ChIJ[A-Za-z0-9_-]{8,}$/.test(sourceId)) pushEvidence(result, provider, 'google_place_id', sourceId);
    }
  }

  const rawUrl = place.source_url?.trim();
  if (rawUrl && provider === 'google_maps') {
    try {
      const url = new URL(rawUrl);
      const cid = url.searchParams.get('cid');
      if (cid && /^\d+$/.test(cid)) pushEvidence(result, provider, 'google_cid', cid);
      const queryPlaceId = url.searchParams.get('query_place_id');
      if (queryPlaceId) pushEvidence(result, provider, 'google_place_id', queryPlaceId);
    } catch {
      // Non-URL strings do not become identity evidence.
    }

    const featureId = /0x[0-9a-f]+:0x[0-9a-f]+/i.exec(rawUrl)?.[0];
    if (featureId) {
      pushEvidence(result, provider, 'source_place_id', featureId);
      const cid = cidFromHexFeatureId(featureId);
      if (cid) pushEvidence(result, provider, 'google_cid', cid);
    }
  }

  return result;
}

export function getStrongPlaceIdentityKeys(place: PlaceIdentityLike): string[] {
  return getStrongPlaceIdentityEvidence(place).map((item) => item.key);
}

export function shareStrongPlaceIdentity(a: PlaceIdentityLike, b: PlaceIdentityLike): boolean {
  const left = new Set(getStrongPlaceIdentityKeys(a));
  return getStrongPlaceIdentityKeys(b).some((key) => left.has(key));
}

/**
 * Known-different provider identities suppress weak title/proximity duplicate guesses.
 * A conflict exists only when both sides expose the same comparable identity kind.
 */
export function haveConflictingStrongPlaceIdentity(a: PlaceIdentityLike, b: PlaceIdentityLike): boolean {
  if (shareStrongPlaceIdentity(a, b)) return false;
  const left = getStrongPlaceIdentityEvidence(a);
  const right = getStrongPlaceIdentityEvidence(b);
  for (const l of left) {
    if (l.provider === 'google_maps' && l.kind === 'source_place_id') continue;
    const comparable = right.filter((r) => r.provider === l.provider && r.kind === l.kind);
    if (comparable.length > 0 && comparable.every((r) => r.value !== l.value)) return true;
  }
  return false;
}

// ─── P1: Unified normalizers (canonical URL / coordinate hash / normalized name) ─

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'igshid', 'ved', 'uact', 'ei', 'oq',
]);

/** Canonical URL: lowercase host, strip tracking params, sort remaining query, trim. */
export function normalizeSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    // Respect explicit provider case by lowercasing only host, not path
    const kept = Array.from(url.searchParams.entries())
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [k, v] of kept) url.searchParams.append(k, v);
    // Remove trailing slash for root, normalize
    const result = url.toString();
    // URL.toString() always includes trailing slash for origin-only; keep as-is for dedup stability
    return result;
  } catch {
    // Non-absolute or malformed URL: lowercase and trim as weak signal
    return trimmed.toLowerCase();
  }
}

/** Coordinate hash: rounded to ~1.1m (5 decimals) — used only for weak suggestion, never auto-merge. */
export function hashCoordinates(
  coordinates: { lat: number; lng: number } | null | undefined,
  precision = 5,
): string | null {
  if (!coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null;
  if (coordinates.lat < -90 || coordinates.lat > 90 || coordinates.lng < -180 || coordinates.lng > 180) return null;
  const lat = coordinates.lat.toFixed(precision);
  const lng = coordinates.lng.toFixed(precision);
  return `coord:${lat},${lng}`;
}

/** Normalized title: NFKC, lowercase, trim, collapse whitespace, strip leading/trailing punctuation. */
export function normalizePlaceTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.normalize('NFKC').toLowerCase().trim();
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (s.length < 2) return null;
  return s;
}

// ─── Weak evidence (suggestion only, never auto-merge) ───────────────────────

export type WeakPlaceIdentityKind = 'canonical_url' | 'coord_hash' | 'normalized_name';

export interface WeakPlaceIdentityEvidence {
  kind: WeakPlaceIdentityKind;
  value: string;
  key: string;
  confidence: number; // 0-1, for UI sorting
}

export function getWeakPlaceIdentityEvidence(place: PlaceIdentityLike): WeakPlaceIdentityEvidence[] {
  const result: WeakPlaceIdentityEvidence[] = [];
  const url = normalizeSourceUrl(place.source_url);
  if (url) result.push({ kind: 'canonical_url', value: url, key: `weak:canonical_url:${url}`, confidence: 0.6 });
  const coord = hashCoordinates(place.coordinates);
  if (coord) result.push({ kind: 'coord_hash', value: coord, key: `weak:${coord}`, confidence: 0.4 });
  const name = normalizePlaceTitle(place.title);
  if (name) result.push({ kind: 'normalized_name', value: name, key: `weak:normalized_name:${name}`, confidence: 0.3 });
  return result;
}

// ─── Unified Service (single import for Capture / Planner / Import / Doctor) ─

export const PlaceIdentityService = {
  getStrongEvidence: getStrongPlaceIdentityEvidence,
  getStrongKeys: getStrongPlaceIdentityKeys,
  sharesStrongIdentity: shareStrongPlaceIdentity,
  hasConflict: haveConflictingStrongPlaceIdentity,
  normalizeUrl: normalizeSourceUrl,
  hashCoords: hashCoordinates,
  normalizeTitle: normalizePlaceTitle,
  getWeakEvidence: getWeakPlaceIdentityEvidence,
  /** All keys (strong + weak) for diagnostic / duplicate suggestion surfaces. */
  getAllKeys(place: PlaceIdentityLike): string[] {
    return [
      ...getStrongPlaceIdentityKeys(place),
      ...getWeakPlaceIdentityEvidence(place).map((e) => e.key),
    ];
  },
  /** Strong-only match — the sole authority for auto-merge. */
  isAutoMergeCandidate(a: PlaceIdentityLike, b: PlaceIdentityLike): boolean {
    return shareStrongPlaceIdentity(a, b);
  },
};
