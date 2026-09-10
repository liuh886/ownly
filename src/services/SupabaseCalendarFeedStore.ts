import type { CalendarFeedRecord, CalendarFeedStore } from './CalendarFeedService';

export interface SupabaseFeedConfig {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  fetchFn?: typeof fetch;
}

const DEFAULT_SUPABASE_URL = 'https://blgwlycfcwvsupmqyqwn.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_n1Va-c_alpkQ0zNuJYUaxA_J0u68RVW';

function resolveSupabaseConfig(overrides?: SupabaseFeedConfig): {
  url: string;
  key: string;
  fetchFn: typeof fetch;
} {
  let url = overrides?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = overrides?.supabasePublishableKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (typeof window !== 'undefined' && (window as unknown as { HaoAccountConfig?: { supabaseUrl?: string; supabasePublishableKey?: string } }).HaoAccountConfig) {
    const config = (window as unknown as { HaoAccountConfig: { supabaseUrl?: string; supabasePublishableKey?: string } }).HaoAccountConfig;
    if (!url && config.supabaseUrl) url = config.supabaseUrl;
    if (!key && config.supabasePublishableKey) key = config.supabasePublishableKey;
  }

  return {
    url: (url || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    key: key || DEFAULT_SUPABASE_ANON_KEY,
    fetchFn: overrides?.fetchFn || globalThis.fetch.bind(globalThis),
  };
}

/**
 * SupabaseCalendarFeedStore connects CalendarFeedService directly to the
 * production Supabase ownly_calendar_feeds table.
 *
 * Anonymous Data API access is capability-scoped: every read/write request
 * carries the SHA-256 feed hash in x-ownly-feed-hash. Production RLS requires
 * the header to equal the target row's token_hash, preventing row enumeration
 * and cross-feed updates while Ownly remains local-first/no-login.
 */
export class SupabaseCalendarFeedStore implements CalendarFeedStore {
  private config: { url: string; key: string; fetchFn: typeof fetch };

  constructor(overrides?: SupabaseFeedConfig) {
    this.config = resolveSupabaseConfig(overrides);
  }

  private headers(tokenHash: string, contentType = false): Record<string, string> {
    return {
      apikey: this.config.key,
      Authorization: `Bearer ${this.config.key}`,
      'x-ownly-feed-hash': tokenHash,
      ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async upsertFeed(record: CalendarFeedRecord): Promise<void> {
    const endpoint = `${this.config.url}/rest/v1/ownly_calendar_feeds?on_conflict=token_hash`;
    const payload = {
      user_id: record.user_id,
      trip_id: record.trip_id,
      token_hash: record.token_hash,
      ics_content: record.ics_content,
      enabled: record.enabled,
      updated_at: record.updated_at || new Date().toISOString(),
    };

    const res = await this.config.fetchFn(endpoint, {
      method: 'POST',
      headers: {
        ...this.headers(record.token_hash, true),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to upsert calendar feed to Supabase (${res.status}): ${errText}`);
    }
  }

  async getFeedByTokenHash(tokenHash: string): Promise<CalendarFeedRecord | null> {
    const query = new URLSearchParams({
      token_hash: `eq.${tokenHash}`,
      enabled: 'eq.true',
      select: 'id,user_id,trip_id,token_hash,ics_content,enabled,created_at,updated_at',
      limit: '1',
    });
    const endpoint = `${this.config.url}/rest/v1/ownly_calendar_feeds?${query.toString()}`;

    const res = await this.config.fetchFn(endpoint, {
      method: 'GET',
      headers: {
        ...this.headers(tokenHash),
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return null;
    }

    const records = (await res.json()) as CalendarFeedRecord[];
    if (!records || records.length === 0) return null;
    return records[0];
  }

  async disableFeed(tripId: string, userId?: string, tokenHash?: string): Promise<void> {
    if (!tokenHash) {
      throw new Error('Calendar feed capability is required to disable a Supabase feed.');
    }

    const query = new URLSearchParams({
      trip_id: `eq.${tripId}`,
      token_hash: `eq.${tokenHash}`,
    });
    if (userId) query.append('user_id', `eq.${userId}`);

    const endpoint = `${this.config.url}/rest/v1/ownly_calendar_feeds?${query.toString()}`;

    const res = await this.config.fetchFn(endpoint, {
      method: 'PATCH',
      headers: this.headers(tokenHash, true),
      body: JSON.stringify({
        enabled: false,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to disable calendar feed in Supabase (${res.status}): ${errText}`);
    }
  }
}
