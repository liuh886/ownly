import type { PlannerTrip, PlannerTripCalendarFeed, PlannerTripPlace } from '../domain/planner';
import type { PlannerTripVisit } from '../domain/planner-visits';
import {
  ACCOUNT_FEED_TRIP_ID,
  buildAccountCalendarIcs,
  buildTripCalendarIcs,
  type CalendarExportOptions,
  generateCalendarFeedToken,
  getCalendarFeedUrl,
  hashFeedToken,
} from '../domain/calendar-feed';
import { canUseWYQDProFeature, type WYQDMembershipState } from '../core/membership';
import { SupabaseCalendarFeedStore } from './SupabaseCalendarFeedStore';

export interface CalendarFeedRecord {
  id?: string;
  user_id: string;
  trip_id: string;
  token_hash: string;
  ics_content: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PublishCalendarFeedInput {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  feedToken?: string;
  apiBaseUrl?: string;
  options?: CalendarExportOptions;
}

export interface RotateCalendarFeedInput {
  trip: PlannerTrip;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  apiBaseUrl?: string;
  options?: CalendarExportOptions;
}

export interface DisableCalendarFeedInput {
  trip: PlannerTrip;
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  apiBaseUrl?: string;
}

export interface PublishAccountFeedInput {
  trips: PlannerTrip[];
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  feedToken?: string;
  options?: CalendarExportOptions;
}

export interface RotateAccountFeedInput {
  trips: PlannerTrip[];
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  currentFeedToken?: string;
  options?: CalendarExportOptions;
}

export interface DisableAccountFeedInput {
  membership: Pick<WYQDMembershipState, 'isPro'>;
  userId: string;
  feedToken: string;
}

export interface AccountFeedResponse extends CalendarFeedResponse {
  tripCount: number;
  eventCount: number;
}

export interface CalendarFeedResponse {
  feed: PlannerTripCalendarFeed;
  url: string;
  ics: string;
}

export interface CalendarFeedStore {
  upsertFeed(record: CalendarFeedRecord): Promise<void>;
  getFeedByTokenHash(tokenHash: string): Promise<CalendarFeedRecord | null>;
  disableFeed(tripId: string, userId?: string, tokenHash?: string): Promise<void>;
}

// In-memory feed store for testing and offline fallback
export class MemoryCalendarFeedStore implements CalendarFeedStore {
  private records = new Map<string, CalendarFeedRecord>(); // token_hash -> record

  async upsertFeed(record: CalendarFeedRecord): Promise<void> {
    const existing = this.records.get(record.token_hash);
    const now = new Date().toISOString();
    this.records.set(record.token_hash, {
      ...existing,
      ...record,
      created_at: existing?.created_at || now,
      updated_at: now,
    });
  }

  async getFeedByTokenHash(tokenHash: string): Promise<CalendarFeedRecord | null> {
    const record = this.records.get(tokenHash);
    if (!record || !record.enabled) return null;
    return record;
  }

  async disableFeed(tripId: string, userId?: string, _tokenHash?: string): Promise<void> {
    for (const [hash, record] of this.records.entries()) {
      if (record.trip_id === tripId && (!userId || record.user_id === userId)) {
        this.records.set(hash, { ...record, enabled: false, updated_at: new Date().toISOString() });
      }
    }
  }
}

export const defaultCalendarFeedStore = new SupabaseCalendarFeedStore();

/**
 * CalendarFeedService orchestrates PRO subscription feeds:
 * 1. Enforces PRO entitlement check (membership.isPro);
 * 2. Projects confirmed Planner occurrences into RFC 5545 ICS string;
 * 3. Hashes bearer token via SHA-256 before remote persistence;
 * 4. Produces immutable subscription URLs for Google/Apple Calendar.
 */
export class CalendarFeedService {
  constructor(private store: CalendarFeedStore = defaultCalendarFeedStore) {}

  /**
   * Publishes or updates the Calendar Feed for a given trip.
   */
  async publishFeed(input: PublishCalendarFeedInput): Promise<CalendarFeedResponse> {
    if (!canUseWYQDProFeature(input.membership)) {
      throw new Error('PRO membership is required to publish continuous Calendar Feeds.');
    }
    if (!input.userId?.trim()) {
      throw new Error('User ID is required for calendar feed operations.');
    }

    const { trip, places, visits, userId } = input;
    const token = input.feedToken || trip.calendar_feed?.feed_token || generateCalendarFeedToken();
    const tokenHash = await hashFeedToken(token);
    const ics = buildTripCalendarIcs(trip, places, visits, input.options);
    const now = new Date().toISOString();

    const record: CalendarFeedRecord = {
      user_id: userId,
      trip_id: trip.id,
      token_hash: tokenHash,
      ics_content: ics,
      enabled: true,
      updated_at: now,
    };

    await this.store.upsertFeed(record);

    const feed: PlannerTripCalendarFeed = {
      feed_token: token,
      trip_id: trip.id,
      created_at: trip.calendar_feed?.created_at || now,
      updated_at: now,
      enabled: true,
    };

    return {
      feed,
      url: getCalendarFeedUrl(token),
      ics,
    };
  }

  /**
   * Rotates the bearer token, invalidating previous subscription URLs and rebuilding the ICS projection.
   */
  async rotateFeed(input: RotateCalendarFeedInput): Promise<CalendarFeedResponse> {
    if (!canUseWYQDProFeature(input.membership)) {
      throw new Error('PRO membership is required to manage Calendar Feeds.');
    }
    if (!input.userId?.trim()) {
      throw new Error('User ID is required for calendar feed operations.');
    }

    const { trip, places, visits, userId } = input;
    if (trip.calendar_feed?.feed_token) {
      const oldHash = await hashFeedToken(trip.calendar_feed.feed_token);
      const oldRecord = await this.store.getFeedByTokenHash(oldHash);
      if (oldRecord) {
        await this.store.upsertFeed({ ...oldRecord, enabled: false });
      }
    }

    const newToken = generateCalendarFeedToken();
    const newTokenHash = await hashFeedToken(newToken);
    const ics = buildTripCalendarIcs(trip, places, visits, input.options);
    const now = new Date().toISOString();

    const newRecord: CalendarFeedRecord = {
      user_id: userId,
      trip_id: trip.id,
      token_hash: newTokenHash,
      ics_content: ics,
      enabled: true,
      updated_at: now,
    };

    await this.store.upsertFeed(newRecord);

    const feed: PlannerTripCalendarFeed = {
      feed_token: newToken,
      trip_id: trip.id,
      created_at: trip.calendar_feed?.created_at || now,
      updated_at: now,
      enabled: true,
    };

    return {
      feed,
      url: getCalendarFeedUrl(newToken),
      ics,
    };
  }

  /**
   * Disables the feed so subscriber requests receive 404/410.
   */
  async disableFeed(input: DisableCalendarFeedInput): Promise<PlannerTripCalendarFeed> {
    if (!canUseWYQDProFeature(input.membership)) {
      throw new Error('PRO membership is required to manage Calendar Feeds.');
    }
    if (!input.userId?.trim()) {
      throw new Error('User ID is required for calendar feed operations.');
    }

    const { trip, userId } = input;
    const feedToken = trip.calendar_feed?.feed_token || '';
    if (!feedToken) {
      throw new Error('Calendar feed token is required to disable a published feed.');
    }
    const tokenHash = await hashFeedToken(feedToken);
    await this.store.disableFeed(trip.id, userId, tokenHash);

    return {
      feed_token: feedToken,
      trip_id: trip.id,
      created_at: trip.calendar_feed?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      enabled: false,
    };
  }

  /**
   * Publishes or refreshes the account-level aggregate feed: one subscription
   * covering every trip. Re-publish after itinerary changes; the URL is stable
   * across refreshes for the same token.
   */
  async publishAccountFeed(input: PublishAccountFeedInput): Promise<AccountFeedResponse> {
    if (!canUseWYQDProFeature(input.membership)) {
      throw new Error('PRO membership is required to publish continuous Calendar Feeds.');
    }
    if (!input.userId?.trim()) {
      throw new Error('User ID is required for calendar feed operations.');
    }

    const { trips, places, visits, userId } = input;
    const token = input.feedToken?.trim() || generateCalendarFeedToken();
    const tokenHash = await hashFeedToken(token);
    const { ics, tripCount, eventCount } = buildAccountCalendarIcs(trips, places, visits, input.options);
    const now = new Date().toISOString();

    await this.store.upsertFeed({
      user_id: userId,
      trip_id: ACCOUNT_FEED_TRIP_ID,
      token_hash: tokenHash,
      ics_content: ics,
      enabled: true,
      updated_at: now,
    });

    return {
      feed: {
        feed_token: token,
        trip_id: ACCOUNT_FEED_TRIP_ID,
        created_at: now,
        updated_at: now,
        enabled: true,
      },
      url: getCalendarFeedUrl(token),
      ics,
      tripCount,
      eventCount,
    };
  }

  /**
   * Rotates the account feed bearer token, disabling the previous aggregate row.
   */
  async rotateAccountFeed(input: RotateAccountFeedInput): Promise<AccountFeedResponse> {
    if (!canUseWYQDProFeature(input.membership)) {
      throw new Error('PRO membership is required to manage Calendar Feeds.');
    }
    if (!input.userId?.trim()) {
      throw new Error('User ID is required for calendar feed operations.');
    }

    const { trips, places, visits, userId } = input;
    if (input.currentFeedToken?.trim()) {
      const oldHash = await hashFeedToken(input.currentFeedToken.trim());
      const oldRecord = await this.store.getFeedByTokenHash(oldHash);
      if (oldRecord) {
        await this.store.upsertFeed({ ...oldRecord, enabled: false });
      }
    }

    return this.publishAccountFeed({
      trips,
      places,
      visits,
      membership: input.membership,
      userId,
      options: input.options,
    });
  }

  /**
   * Disables the account feed so subscriber requests receive 404.
   */
  async disableAccountFeed(input: DisableAccountFeedInput): Promise<PlannerTripCalendarFeed> {
    if (!canUseWYQDProFeature(input.membership)) {
      throw new Error('PRO membership is required to manage Calendar Feeds.');
    }
    if (!input.userId?.trim()) {
      throw new Error('User ID is required for calendar feed operations.');
    }
    const feedToken = input.feedToken?.trim();
    if (!feedToken) {
      throw new Error('Calendar feed token is required to disable a published feed.');
    }
    const tokenHash = await hashFeedToken(feedToken);
    await this.store.disableFeed(ACCOUNT_FEED_TRIP_ID, input.userId, tokenHash);

    return {
      feed_token: feedToken,
      trip_id: ACCOUNT_FEED_TRIP_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      enabled: false,
    };
  }

  /**
   * Public HTTP/Edge handler serving Google/Apple/Outlook subscriber requests.
   */
  async handlePublicFeedRequest(rawToken: string): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }> {
    if (!rawToken || rawToken.trim().length === 0) {
      return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Calendar feed not found' };
    }

    const tokenHash = await hashFeedToken(rawToken);
    const record = await this.store.getFeedByTokenHash(tokenHash);

    if (!record || !record.enabled) {
      return {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Calendar feed expired or disabled',
      };
    }

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${record.trip_id === ACCOUNT_FEED_TRIP_ID ? 'ownly' : `trip-${record.trip_id}`}.ics"`,
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
        'X-Published-By': 'Ownly Calendar Feed Service',
      },
      body: record.ics_content,
    };
  }
}

export const calendarFeedService = new CalendarFeedService();
