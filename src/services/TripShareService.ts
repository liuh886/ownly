import type { PlannerTrip, PlannerTripPlace } from '../domain/planner';
import type { PlannerTripVisit } from '../domain/planner-visits';
import { generateCalendarFeedToken, hashFeedToken } from '../domain/calendar-feed';
import {
  getTripShareUrl,
  normalizeTripShareAlias,
  validateTripShareAlias,
  type TripShareLink,
} from '../domain/trip-share';
import { buildTripItineraryHtml } from '../domain/trip-itinerary-html';
import { canUseWYQDProFeature, type WYQDMembershipState } from '../core/membership';
import { SupabaseTripShareStore } from './SupabaseTripShareStore';

export interface TripShareRecord {
  id?: string;
  user_id: string;
  trip_id: string;
  alias: string;
  write_token_hash: string;
  html_content: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TripShareStore {
  upsertShare(record: TripShareRecord): Promise<void>;
  disableShare(alias: string, writeTokenHash: string): Promise<void>;
}

export class MemoryTripShareStore implements TripShareStore {
  private records = new Map<string, TripShareRecord>();

  async upsertShare(record: TripShareRecord): Promise<void> {
    const alias = normalizeTripShareAlias(record.alias);
    const existing = this.records.get(alias);
    this.records.set(alias, {
      ...existing,
      ...record,
      alias,
      created_at: existing?.created_at || record.created_at || new Date().toISOString(),
      updated_at: record.updated_at || new Date().toISOString(),
    });
  }

  async disableShare(alias: string, writeTokenHash: string): Promise<void> {
    const key = normalizeTripShareAlias(alias);
    const record = this.records.get(key);
    if (!record || record.write_token_hash !== writeTokenHash) return;
    this.records.set(key, { ...record, enabled: false, updated_at: new Date().toISOString() });
  }

  getShareByAlias(alias: string): TripShareRecord | null {
    return this.records.get(normalizeTripShareAlias(alias)) ?? null;
  }
}

export const defaultTripShareStore = new SupabaseTripShareStore();

export interface PublishTripShareInput {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  alias: string;
  /** Reuse an existing owner write token to update the same row in place. */
  writeToken?: string;
  language?: 'zh' | 'en';
  now?: string;
}

export interface RotateTripShareInput {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  currentAlias?: string;
  currentWriteToken?: string;
  newAlias: string;
  language?: 'zh' | 'en';
  now?: string;
}

export interface DisableTripShareInput {
  tripId: string;
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  alias: string;
  writeToken: string;
}

export interface TripShareResponse {
  share: TripShareLink;
  url: string;
  write_token: string;
  html: string;
}

function requireValidAlias(input: string): string {
  const result = validateTripShareAlias(input);
  if (result.ok) return result.alias;
  if (result.reason === 'empty') throw new Error('分享别名不能为空。');
  if (result.reason === 'reserved') throw new Error('该分享别名已被系统保留，请换一个。');
  throw new Error('分享别名需为 2–24 位大写字母、数字或连字符（如 TH26）。');
}

/**
 * TripShareService orchestrates PRO per-trip share links: it enforces the PRO
 * entitlement, builds the self-contained itinerary HTML (expenses always
 * excluded), hashes the owner write token before remote persistence, and
 * produces a stable alias URL. The raw write token never reaches the server.
 */
export class TripShareService {
  constructor(private store: TripShareStore = defaultTripShareStore) {}

  private assertPro(membership: Pick<WYQDMembershipState, 'isPro'>): void {
    if (!canUseWYQDProFeature(membership)) {
      throw new Error('PRO membership is required to publish a share link.');
    }
  }

  private assertUser(userId: string): void {
    if (!userId?.trim()) {
      throw new Error('User ID is required for share link operations.');
    }
  }

  async publishShare(input: PublishTripShareInput): Promise<TripShareResponse> {
    this.assertPro(input.membership);
    this.assertUser(input.userId);
    const alias = requireValidAlias(input.alias);
    const writeToken = input.writeToken?.trim() || generateCalendarFeedToken();
    const writeTokenHash = await hashFeedToken(writeToken);
    const now = input.now ?? new Date().toISOString();
    const html = buildTripItineraryHtml({
      trip: input.trip,
      places: input.places,
      visits: input.visits,
      expenses: [],
      language: input.language ?? 'zh',
      includeExpenses: false,
      generatedAt: now,
    });

    await this.store.upsertShare({
      user_id: input.userId,
      trip_id: input.trip.id,
      alias,
      write_token_hash: writeTokenHash,
      html_content: html,
      enabled: true,
      updated_at: now,
    });

    return {
      share: { alias, trip_id: input.trip.id, enabled: true, updated_at: now },
      url: getTripShareUrl(alias),
      write_token: writeToken,
      html,
    };
  }

  async rotateShare(input: RotateTripShareInput): Promise<TripShareResponse> {
    this.assertPro(input.membership);
    this.assertUser(input.userId);
    if (input.currentAlias?.trim() && input.currentWriteToken?.trim()) {
      const oldHash = await hashFeedToken(input.currentWriteToken.trim());
      await this.store.disableShare(normalizeTripShareAlias(input.currentAlias), oldHash);
    }
    return this.publishShare({
      trip: input.trip,
      places: input.places,
      visits: input.visits,
      membership: input.membership,
      userId: input.userId,
      alias: input.newAlias,
      language: input.language,
      now: input.now,
    });
  }

  async disableShare(input: DisableTripShareInput): Promise<TripShareLink> {
    this.assertPro(input.membership);
    this.assertUser(input.userId);
    const alias = requireValidAlias(input.alias);
    if (!input.writeToken?.trim()) {
      throw new Error('Share write token is required to disable a share link.');
    }
    const writeTokenHash = await hashFeedToken(input.writeToken.trim());
    await this.store.disableShare(alias, writeTokenHash);
    return {
      alias,
      trip_id: input.tripId,
      enabled: false,
      updated_at: new Date().toISOString(),
    };
  }
}

export const tripShareService = new TripShareService();

export interface PublicShareResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Response shape shared by the `trip-share` Edge Function and its tests. The
 * document is scriptless with inline styles only, so a strict CSP still lets
 * it render while blocking every external fetch.
 */
export function buildPublicShareResponse(record: TripShareRecord | null): PublicShareResponse {
  if (!record || !record.enabled) {
    return {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
      body: 'Share link not found or expired',
    };
  }
  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'X-Published-By': 'Ownly Trip Share Service',
    },
    body: record.html_content,
  };
}
