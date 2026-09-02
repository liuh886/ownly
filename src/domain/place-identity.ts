export interface PlaceIdentityLike {
  source_provider?: string | null;
  source_place_id?: string | null;
  source_url?: string | null;
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
