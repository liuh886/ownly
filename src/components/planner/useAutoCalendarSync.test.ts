import { describe, expect, it } from 'vitest';
import type { PlannerTrip } from '@/domain/planner';
import {
  buildFeedSyncFingerprint,
  collectFeedSyncTargets,
} from './useAutoCalendarSync';

function makeTrip(id: string, overrides: Partial<PlannerTrip> = {}): PlannerTrip {
  return {
    schema_version: '0.1',
    type: 'trip',
    id,
    title: id,
    status: 'planning',
    start_date: '2026-10-05',
    end_date: '2026-10-09',
    destinations: ['Bangkok'],
    created_at: '2026-08-29T00:00:00Z',
    ...overrides,
  };
}

describe('auto calendar sync trigger (pure helpers)', () => {
  it('ignores storage churn but fires on content edits', () => {
    const feed = {
      feed_token: 'tok',
      trip_id: 't1',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      enabled: true,
    };
    const base = [makeTrip('t1', { calendar_feed: { ...feed } })];
    const before = buildFeedSyncFingerprint(base, [], [], []);
    // updated_at bumps from the sync itself must not retrigger.
    const churned = [
      makeTrip('t1', {
        updated_at: new Date().toISOString(),
        calendar_feed: { ...feed, updated_at: new Date().toISOString() },
      }),
    ];
    expect(buildFeedSyncFingerprint(churned, [], [], [])).toBe(before);
    // A real edit (retimed trip) changes the fingerprint.
    const edited = [makeTrip('t1', { start_date: '2026-10-06' })];
    expect(buildFeedSyncFingerprint(edited, [], [], [])).not.toBe(before);
  });

  it('collects only enabled feeds and never invents tokens', () => {
    const withFeed = makeTrip('t1', {
      calendar_feed: {
        feed_token: 'tok-1',
        trip_id: 't1',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        enabled: true,
      },
    });
    const disabled = makeTrip('t2', {
      calendar_feed: {
        feed_token: 'tok-2',
        trip_id: 't2',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        enabled: false,
      },
    });
    const bare = makeTrip('t3');
    const targets = collectFeedSyncTargets(
      [withFeed, disabled, bare],
      { feed_token: 'acct', updated_at: '2026-09-01T00:00:00Z', enabled: true },
    );
    expect(targets.accountToken).toBe('acct');
    expect(targets.tripFeeds.map((t) => t.token)).toEqual(['tok-1']);
    // Disabled account feed is not a target either.
    const off = collectFeedSyncTargets([withFeed], {
      feed_token: 'acct',
      updated_at: '2026-09-01T00:00:00Z',
      enabled: false,
    });
    expect(off.accountToken).toBeUndefined();
  });
});
