import { describe, expect, it } from 'vitest';
import {
  canUseWYQDProFeature,
  checkWYQDCapacity,
  resolveWYQDMembership,
  WYQD_FREE_LIMITS,
} from './membership';

describe('resolveWYQDMembership', () => {
  it('unlocks Pro Lifetime when sponsored', () => {
    const state = resolveWYQDMembership({ proUnlocked: true });
    expect(state.plan).toBe('pro_lifetime');
    expect(state.isPro).toBe(true);
    expect(state.status).toBe('activated');
  });

  it('defaults to Free without sponsorship', () => {
    const state = resolveWYQDMembership({});
    expect(state.plan).toBe('free');
    expect(state.isPro).toBe(false);
    expect(state.status).toBe('none');
  });

  it('uses the translation function when provided', () => {
    const state = resolveWYQDMembership({ proUnlocked: true, t: (key) => `t:${key}` });
    expect(state.planLabel).toBe('t:planProLifetime');
    expect(state.statusLabel).toBe('t:statusActivated');
    expect(state.upgradeMessage).toBe('t:proMembershipActive');
  });
});

describe('canUseWYQDProFeature', () => {
  it('mirrors isPro', () => {
    expect(canUseWYQDProFeature({ isPro: true })).toBe(true);
    expect(canUseWYQDProFeature({ isPro: false })).toBe(false);
  });
});

describe('checkWYQDCapacity', () => {
  it('allows Free usage below the limit and reports remaining', () => {
    expect(checkWYQDCapacity({ isPro: false }, 'objects', 10)).toEqual({
      allowed: true,
      limit: WYQD_FREE_LIMITS.objects,
      remaining: WYQD_FREE_LIMITS.objects - 10,
    });
  });

  it('blocks Free usage once the limit is reached', () => {
    const result = checkWYQDCapacity({ isPro: false }, 'snapshots', WYQD_FREE_LIMITS.snapshots);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('never blocks Pro users', () => {
    const result = checkWYQDCapacity({ isPro: true }, 'reviews', 99999);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(Infinity);
    expect(result.remaining).toBe(Infinity);
  });
});
