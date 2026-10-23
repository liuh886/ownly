import type { AccountCalendarFeedMeta } from '@/domain/calendar-feed';
import type { PlannerTripCalendarFeed } from '@/domain/planner';
import type { TripShareMeta } from '@/domain/trip-share';

/** Credentials belong to a data root, never to a copied record ID alone. */
export interface PublicationCredentials {
  namespace: string;
  sessionIdentity: string;
  loadShare(tripId: string): TripShareMeta | null;
  saveShare(tripId: string, meta: TripShareMeta): void;
  loadAccount(userId: string): AccountCalendarFeedMeta | null;
  saveAccount(userId: string, meta: AccountCalendarFeedMeta): void;
  loadTripFeed(tripId: string): PlannerTripCalendarFeed | null;
  saveTripFeed(tripId: string, meta: PlannerTripCalendarFeed): void;
  remoteUserId(kind: 'account' | 'calendar', id: string, currentUserId: string): string;
  canRecoverLegacyShare(tripId: string): boolean;
  recoverLegacyShare(tripId: string): TripShareMeta;
  canRecoverLegacyAccount(userId: string): boolean;
  recoverableLegacyAccountOwners(userId: string): string[];
  recoverLegacyAccount(userId: string, oldUserId?: string): AccountCalendarFeedMeta;
  legacyAccountForRevocation(oldUserId: string): AccountCalendarFeedMeta;
  markLegacyAccountRevoked(oldUserId: string): void;
  canRecoverTripFeed(tripId: string, meta: PlannerTripCalendarFeed | undefined): boolean;
  recoverTripFeed(tripId: string, meta: PlannerTripCalendarFeed, originalUserId: string): PlannerTripCalendarFeed;
}

export function createPublicationCredentials(
  namespace: string,
  sessionIdentity: string,
  get: (key: string) => string | null,
  set: (key: string, value: string) => void,
  legacyGet: (key: string) => string | null = get,
  legacySet: (key: string, value: string) => void = set,
  legacyKeys: () => string[] = () => [],
): PublicationCredentials {
  const key = (kind: string, id: string) => `ownly:publication:v2:${encodeURIComponent(namespace)}:${kind}:${encodeURIComponent(id)}`;
  function load<T>(kind: string, id: string): T | null {
    const raw = get(key(kind, id));
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  function save<T>(kind: string, id: string, value: T): void {
    const serialized = JSON.stringify(value);
    set(key(kind, id), serialized);
    if (get(key(kind, id)) !== serialized) throw new Error('Cloud status changed, but local credentials could not be saved. Stay in this window and retry.');
  }
  const claimKey = (kind: string, id: string) => `ownly:publication:legacy-claim:v1:${kind}:${encodeURIComponent(id)}`;
  const ownerKey = (kind: string, id: string) => key(`${kind}-remote-owner`, id);
  function canClaim(kind: string, id: string): boolean {
    const owner = legacyGet(claimKey(kind, id));
    return owner === null || owner === namespace;
  }
  function claim(kind: string, id: string): void {
    if (!canClaim(kind, id)) throw new Error('This older publication was already claimed by another data folder.');
    legacySet(claimKey(kind, id), namespace);
    if (legacyGet(claimKey(kind, id)) !== namespace) throw new Error('Cannot persist ownership of the older publication.');
  }
  function recordRemoteOwner(kind: 'account' | 'calendar', id: string, userId: string): void {
    set(ownerKey(kind, id), userId);
    if (get(ownerKey(kind, id)) !== userId) throw new Error('Cannot persist the older publication owner.');
  }
  function parseLegacy(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null;
    try {
      const meta = JSON.parse(raw) as unknown;
      return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, unknown> : null;
    } catch { return null; }
  }
  const legacyShare = (id: string): TripShareMeta | null => {
    const meta = parseLegacy(legacyGet(`ownly:trip-share:${id}`));
    if (!meta || typeof meta.alias !== 'string' || !meta.alias || typeof meta.write_token !== 'string' || !meta.write_token) return null;
    return { alias: meta.alias, write_token: meta.write_token, updated_at: typeof meta.updated_at === 'string' ? meta.updated_at : '', enabled: meta.enabled !== false };
  };
  const legacyAccount = (id: string): AccountCalendarFeedMeta | null => {
    const meta = parseLegacy(legacyGet(`ownly:account-calendar-feed:${id}`));
    if (!meta || typeof meta.feed_token !== 'string' || !meta.feed_token) return null;
    return { feed_token: meta.feed_token, updated_at: typeof meta.updated_at === 'string' ? meta.updated_at : '', enabled: meta.enabled !== false };
  };
  const recoverableLegacyAccountOwners = (id: string): string[] => {
    const currentToken = load<AccountCalendarFeedMeta>('account', id)?.feed_token;
    const prefix = 'ownly:account-calendar-feed:';
    const owners = new Set([id, 'ownly_user', ...legacyKeys().filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))]);
    return [...owners].filter((owner) => {
      const meta = legacyAccount(owner);
      return Boolean(meta?.enabled && meta.feed_token !== currentToken && canClaim('account', owner));
    });
  };
  return {
    namespace, sessionIdentity,
    loadShare: (id) => load<TripShareMeta>('share', id),
    saveShare: (id, meta) => save('share', id, meta),
    loadAccount: (id) => load<AccountCalendarFeedMeta>('account', id),
    saveAccount: (id, meta) => save('account', id, meta),
    loadTripFeed: (id) => load<PlannerTripCalendarFeed>('calendar', id),
    saveTripFeed: (id, meta) => save('calendar', id, meta),
    remoteUserId: (kind, id, currentUserId) => get(ownerKey(kind, id)) ?? `${currentUserId}:${namespace}`,
    canRecoverLegacyShare: (id) => !load<TripShareMeta>('share', id) && canClaim('share', id) && Boolean(legacyShare(id)?.alias),
    recoverLegacyShare: (id) => {
      const meta = legacyShare(id);
      if (!meta?.alias) throw new Error('No older share credential was found for this trip.');
      if (load<TripShareMeta>('share', id)) throw new Error('This trip already has scoped share credentials.');
      claim('share', id);
      save('share', id, meta);
      return meta;
    },
    canRecoverLegacyAccount: (id) => recoverableLegacyAccountOwners(id).length > 0,
    recoverableLegacyAccountOwners,
    recoverLegacyAccount: (id, requestedOwner) => {
      const oldOwner = requestedOwner ?? recoverableLegacyAccountOwners(id)[0];
      const meta = oldOwner ? legacyAccount(oldOwner) : null;
      if (!meta) throw new Error('No older account calendar credential was found.');
      if (load<AccountCalendarFeedMeta>('account', id)) throw new Error('This account already has scoped calendar credentials.');
      claim('account', oldOwner!);
      recordRemoteOwner('account', id, oldOwner!);
      save('account', id, meta);
      return meta;
    },
    legacyAccountForRevocation: (oldUserId) => {
      const meta = legacyAccount(oldUserId);
      if (!meta) throw new Error('No older account calendar credential was found.');
      claim('account', oldUserId);
      return meta;
    },
    markLegacyAccountRevoked: (oldUserId) => {
      const meta = legacyAccount(oldUserId);
      if (!meta) throw new Error('No older account calendar credential was found.');
      if (!canClaim('account', oldUserId)) throw new Error('This older publication was already claimed by another data folder.');
      legacySet(`ownly:account-calendar-feed:${oldUserId}`, JSON.stringify({ ...meta, enabled: false }));
      if (legacyAccount(oldUserId)?.enabled !== false) throw new Error('Cloud feed is disabled, but the older local credential could not be marked disabled.');
    },
    canRecoverTripFeed: (id, meta) => !load<PlannerTripCalendarFeed>('calendar', id)
      && Boolean(meta?.feed_token) && meta?.trip_id === id && canClaim('calendar', `${id}:${meta.feed_token}`),
    recoverTripFeed: (id, meta, originalUserId) => {
      if (!meta?.feed_token || meta.trip_id !== id) throw new Error('No matching older trip calendar credential was found.');
      if (load<PlannerTripCalendarFeed>('calendar', id)) throw new Error('This trip already has scoped calendar credentials.');
      claim('calendar', `${id}:${meta.feed_token}`);
      recordRemoteOwner('calendar', id, originalUserId);
      const recovered = { ...meta, enabled: meta.enabled !== false };
      save('calendar', id, recovered);
      return recovered;
    },
  };
}
