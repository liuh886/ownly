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
 * to equal the target row's write_token_hash. Anonymous SELECT is not granted,
 * so aliases cannot be enumerated through the Data API (public reads go through
 * the trip-share Edge Function with service_role).
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

  async disableShare(alias: string, writeTokenHash: string): Promise<void> {
    const query = new URLSearchParams({ alias: `eq.${alias}` });
    const endpoint = `${this.config.url}/rest/v1/ownly_trip_shares?${query.toString()}`;

    const res = await this.config.fetchFn(endpoint, {
      method: 'PATCH',
      headers: this.headers(writeTokenHash, true),
      body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to disable trip share in Supabase (${res.status}): ${errText}`);
    }
  }
}
