import { describe, expect, it } from 'vitest';
import { createPublicationCredentials } from './publication-credentials';
import { isPublicationSuspended, publicationKey, queuePublication, suspendPublication } from './publication-queue';

describe('workspace publication credentials', () => {
  it('isolates copied record IDs and ignores unscoped legacy credentials', () => {
    const storage = new Map([['ownly:trip-share:same-trip', JSON.stringify({ write_token: 'legacy', alias: 'old', enabled: true })]]);
    const get = (key: string) => storage.get(key) ?? null;
    const set = (key: string, value: string) => { storage.set(key, value); };
    const first = createPublicationCredentials('folder-A', 'A:1', get, set);
    const copied = createPublicationCredentials('folder-B', 'B:1', get, set);
    expect(first.loadShare('same-trip')).toBeNull();
    first.saveShare('same-trip', { alias: 'Trip', write_token: 'A-token', updated_at: '', enabled: true });
    expect(copied.loadShare('same-trip')).toBeNull();
    first.saveAccount('same-user', { feed_token: 'A-account', updated_at: '', enabled: true });
    expect(copied.loadAccount('same-user')).toBeNull();
    const reconnected = createPublicationCredentials('folder-A', 'A:2', get, set);
    expect(reconnected.loadShare('same-trip')?.write_token).toBe('A-token');
  });
  it('uses the supplied Vault storage without a browser global and detects failed persistence', () => {
    const vault = new Map<string, string>();
    const scope = createPublicationCredentials('vault-A', 'A', (key) => vault.get(key) ?? null, (key, value) => { vault.set(key, value); });
    scope.saveAccount('user', { feed_token: 'vault-token', updated_at: '', enabled: true });
    expect(scope.loadAccount('user')?.feed_token).toBe('vault-token');
    const blocked = createPublicationCredentials('vault-B', 'B', () => null, () => {});
    expect(() => blocked.saveShare('trip', { alias: 'Trip', write_token: 'token', updated_at: '', enabled: true })).toThrow('local credentials');
  });
  it('recovers older capabilities only after explicit claim and keeps their original account owner', () => {
    const storage = new Map<string, string>([
      ['ownly:trip-share:trip-1', JSON.stringify({ alias: 'Old', write_token: 'share-token' })],
      ['ownly:account-calendar-feed:ownly_user', JSON.stringify({ feed_token: 'account-token' })],
    ]);
    const get = (key: string) => storage.get(key) ?? null;
    const set = (key: string, value: string) => { storage.set(key, value); };
    const first = createPublicationCredentials('folder-A', 'A', get, set);
    const copied = createPublicationCredentials('folder-B', 'B', get, set);
    expect(first.loadShare('trip-1')).toBeNull();
    expect(first.loadAccount('ownly_user')).toBeNull();
    expect(first.canRecoverLegacyShare('trip-1')).toBe(true);
    first.recoverLegacyShare('trip-1');
    first.recoverLegacyAccount('ownly_user');
    expect(first.loadShare('trip-1')?.write_token).toBe('share-token');
    expect(first.loadShare('trip-1')?.enabled).toBe(true);
    expect(first.loadAccount('ownly_user')?.enabled).toBe(true);
    expect(first.remoteUserId('account', 'ownly_user', 'new-user')).toBe('ownly_user');
    expect(copied.canRecoverLegacyShare('trip-1')).toBe(false);
    expect(copied.canRecoverLegacyAccount('ownly_user')).toBe(false);
    expect(() => copied.recoverLegacyShare('trip-1')).toThrow('another data folder');
  });
  it('can explicitly recover a pre-upgrade account feed under the current membership ID', () => {
    const storage = new Map<string, string>([
      ['ownly:account-calendar-feed:ownly_user', JSON.stringify({ feed_token: 'old-account', enabled: true, updated_at: '' })],
    ]);
    const get = (key: string) => storage.get(key) ?? null;
    const scope = createPublicationCredentials('folder-A', 'A', get, (key, value) => { storage.set(key, value); });
    expect(scope.canRecoverLegacyAccount('user_pro_AB12')).toBe(true);
    scope.recoverLegacyAccount('user_pro_AB12');
    expect(scope.loadAccount('user_pro_AB12')?.feed_token).toBe('old-account');
    expect(scope.remoteUserId('account', 'user_pro_AB12', 'user_pro_AB12')).toBe('ownly_user');
  });
  it('lists changed-license account capabilities for explicit selection', () => {
    const storage = new Map<string, string>([
      ['ownly:account-calendar-feed:user_pro_OLD1', JSON.stringify({ feed_token: 'old-one' })],
      ['ownly:account-calendar-feed:user_pro_OLD2', JSON.stringify({ feed_token: 'old-two' })],
    ]);
    const get = (key: string) => storage.get(key) ?? null;
    const set = (key: string, value: string) => { storage.set(key, value); };
    const scope = createPublicationCredentials('folder-A', 'A', get, set, get, set, () => [...storage.keys()]);
    expect(scope.recoverableLegacyAccountOwners('user_pro_NEW')).toEqual(['user_pro_OLD1', 'user_pro_OLD2']);
    scope.recoverLegacyAccount('user_pro_NEW', 'user_pro_OLD2');
    expect(scope.loadAccount('user_pro_NEW')?.feed_token).toBe('old-two');
    expect(scope.remoteUserId('account', 'user_pro_NEW', 'user_pro_NEW')).toBe('user_pro_OLD2');
    expect(scope.recoverableLegacyAccountOwners('user_pro_NEW')).toEqual(['user_pro_OLD1']);
    expect(scope.legacyAccountForRevocation('user_pro_OLD1').feed_token).toBe('old-one');
    scope.markLegacyAccountRevoked('user_pro_OLD1');
    expect(scope.recoverableLegacyAccountOwners('user_pro_NEW')).toEqual([]);
  });
  it('requires explicit one-folder claim for a copied trip frontmatter token', () => {
    const storage = new Map<string, string>();
    const get = (key: string) => storage.get(key) ?? null;
    const set = (key: string, value: string) => { storage.set(key, value); };
    const first = createPublicationCredentials('folder-A', 'A', get, set);
    const copied = createPublicationCredentials('folder-B', 'B', get, set);
    const meta = { feed_token: 'old-token', trip_id: 'trip-1', created_at: '', updated_at: '', enabled: true };
    expect(first.loadTripFeed('trip-1')).toBeNull();
    expect(first.canRecoverTripFeed('trip-1', meta)).toBe(true);
    first.recoverTripFeed('trip-1', meta, 'ownly_user');
    expect(first.remoteUserId('calendar', 'trip-1', 'later-user')).toBe('ownly_user');
    expect(copied.canRecoverTripFeed('trip-1', meta)).toBe(false);
    expect(() => copied.recoverTripFeed('trip-1', meta, 'other-user')).toThrow('another data folder');
  });
  it('does not let a suspended or stuck folder A block folder B with the same trip ID', async () => {
    const first = publicationKey('folder-A:session-1', 'share', 'copied-id');
    const copied = publicationKey('folder-B:session-1', 'share', 'copied-id');
    suspendPublication(first);
    expect(isPublicationSuspended(copied)).toBe(false);
    let release!: () => void;
    const blocked = queuePublication(first, () => new Promise<void>((resolve) => { release = resolve; }));
    let secondRan = false;
    await queuePublication(copied, async () => { secondRan = true; });
    expect(secondRan).toBe(true);
    release();
    await blocked;
  });
});
