import type { TripShareRecord, TripShareStore } from './TripShareService';

export interface SupabaseTripShareConfig {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  fetchFn?: typeof fetch;
}

const DEFAULT_SUPABASE_URL = 'https://blgwlycfcwvsupmqyqwn.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_n1Va-c_alpkQ0zNuJYUaxA_J0u68RVW';

function resolveSupabaseConfig(overrides?: SupabaseTripShareConfig): {
  url: string;
  key: string;
  fetchFn: typeof fetch;
} {
  const url = overrides?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = overrides?.supabasePublishableKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    url: (url || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    key: key || DEFAULT_SUPABASE_ANON_KEY,
    fetchFn: overrides?.fetchFn || globalThis.fetch.bind(globalThis),
  };
}

/**
 * SupabaseTripShareStore writes share rows through the production Data API.
 * The owner write token is never stored: only its SHA-256 travels, in the
 * x-ownly-share-write-hash header, which the RLS insert/update policies require
 * to equal the target row's write_token_hash. Anonymous SELECT is scoped to
 * that capability, so aliases cannot be enumerated through the Data API
 * (public reads go through the trip-share Edge Function with service_role).
 */
export class SupabaseTripShareStore implements TripShareStore {
  private config: { url: string; key: string; fetchFn: typeof fetch };

  constructor(overrides?: SupabaseTripShareConfig) {
    this.config = resolveSupabaseConfig(overrides);
  }

  private headers(writeTokenHash: string, contentType = false): Record<string, string> {
    return {
      apikey: this.config.key,
      Authorization: `Bearer ${this.config.key}`,
      'x-ownly-share-write-hash': writeTokenHash,
      ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async upsertShare(record: TripShareRecord): Promise<void> {
    const endpoint = `${this.config.url}/rest/v1/ownly_trip_shares?on_conflict=alias`;
    const payload = {
      user_id: record.user_id,
      trip_id: record.trip_id,
      alias: record.alias,
      write_token_hash: record.write_token_hash,
      html_content: record.html_content,
      enabled: record.enabled,
      updated_at: record.updated_at || new Date().toISOString(),
    };

    const res = await this.config.fetchFn(endpoint, {
      method: 'POST',
      headers: {
        ...this.headers(record.write_token_hash, true),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to upsert trip share to Supabase (${res.status}): ${errText}`);
    }
  }

  async refreshEnabledShare(record: TripShareRecord): Promise<boolean> {
    const query = new URLSearchParams({
      alias: `eq.${record.alias}`,
      trip_id: `eq.${record.trip_id}`,
      write_token_hash: `eq.${record.write_token_hash}`,
      enabled: 'eq.true',
      select: 'id',
    });
    const endpoint = `${this.config.url}/rest/v1/ownly_trip_shares?${query.toString()}`;
    const res = await this.config.fetchFn(endpoint, {
      method: 'PATCH',
      headers: { ...this.headers(record.write_token_hash, true), Prefer: 'return=representation' },
      body: JSON.stringify({ html_content: record.html_content, updated_at: record.updated_at || new Date().toISOString() }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to refresh trip share in Supabase (${res.status}): ${errText}`);
    }
    const updated = await res.json();
    if (!Array.isArray(updated)) throw new Error('Trip share refresh returned an invalid acknowledgement.');
    return updated.length > 0;
  }

  async disableShare(alias: string, writeTokenHash: string): Promise<void> {
    const query = new URLSearchParams({ alias: `eq.${alias}`, write_token_hash: `eq.${writeTokenHash}`, select: 'id' });
    const endpoint = `${this.config.url}/rest/v1/ownly_trip_shares?${query.toString()}`;

    const res = await this.config.fetchFn(endpoint, {
      method: 'PATCH',
      headers: { ...this.headers(writeTokenHash, true), Prefer: 'return=representation' },
      body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to disable trip share in Supabase (${res.status}): ${errText}`);
    }
    const updated = await res.json();
    if (!Array.isArray(updated) || updated.length === 0) {
      throw new Error('Could not confirm trip share revocation; the link may still be active.');
    }
  }
}
