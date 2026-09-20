import { describe, expect, it } from 'vitest';
import {
  buildTravelMapPoints,
  buildTravelSummary,
  calculateDaysBetween,
  countryCodeToFlag,
  getTravelExperiences,
  getTravelReviewStats,
} from './travel';
import type { OneTimeExperienceObject, ReviewEntry, WYQDObject } from './types';

function experience(overrides: Partial<OneTimeExperienceObject> = {}): OneTimeExperienceObject {
  return {
    schema_version: '0.1',
    id: 'exp-1',
    type: 'object',
    object_type: 'one_time_experience',
    status: 'completed',
    title: 'Bangkok Trip',
    experience_subtype: 'travel_worldview',
    created_at: '2026-01-01',
    ...overrides,
  };
}

function review(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    schema_version: '0.1',
    id: 'rev-1',
    type: 'review',
    title: 'Trip review',
    created_at: '2026-01-10',
    review_type: 'experience_review',
    target_id: 'exp-1',
    target_type: 'one_time_experience',
    summary: 'Great',
    ...overrides,
  };
}

describe('countryCodeToFlag', () => {
  it('converts a two-letter code to a flag emoji', () => {
    expect(countryCodeToFlag('th')).toBe('🇹🇭');
    expect(countryCodeToFlag('JP')).toBe('🇯🇵');
  });

  it('returns empty for missing or malformed codes', () => {
    expect(countryCodeToFlag(undefined)).toBe('');
    expect(countryCodeToFlag('T')).toBe('');
    expect(countryCodeToFlag('123')).toBe('');
  });
});

describe('calculateDaysBetween', () => {
  it('counts inclusively', () => {
    expect(calculateDaysBetween('2026-10-05', '2026-10-13')).toBe(9);
    expect(calculateDaysBetween('2026-10-05', '2026-10-05')).toBe(1);
  });

  it('returns null for missing or invalid input', () => {
    expect(calculateDaysBetween(undefined, '2026-10-13')).toBeNull();
    expect(calculateDaysBetween('garbage', '2026-10-13')).toBeNull();
  });
});

describe('getTravelExperiences', () => {
  it('keeps only travel_worldview experiences', () => {
    const objects: WYQDObject[] = [
      experience({ id: 'a' }),
      experience({ id: 'b', experience_subtype: 'food_experience' }),
      { ...experience({ id: 'c' }), object_type: 'physical' } as unknown as WYQDObject,
    ];
    expect(getTravelExperiences(objects).map((e) => e.id)).toEqual(['a']);
  });
});

describe('buildTravelMapPoints', () => {
  it('merges primary and additional locations, deduplicating by coordinates', () => {
    const exp = experience({
      location: { city: 'Bangkok', latitude: 13.75, longitude: 100.49 },
      locations: [
        { city: 'Bangkok duplicate', latitude: 13.7500, longitude: 100.4900 },
        { city: 'Chiang Mai', latitude: 18.79, longitude: 98.99 },
      ],
    });
    const points = buildTravelMapPoints([exp]);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ city: 'Bangkok', latitude: 13.75, longitude: 100.49 });
    expect(points[1]).toMatchObject({ city: 'Chiang Mai' });
    // Ids are indexed by the pre-dedup position, so a skipped duplicate leaves
    // a gap (#0 kept, #1 deduped, #2 kept) — unique and stable per experience.
    expect(points[0].id).toBe('exp-1#0');
    expect(points[1].id).toBe('exp-1#2');
  });

  it('skips locations without coordinates', () => {
    const exp = experience({
      location: { city: 'No coords' },
      locations: [{ city: 'Has coords', latitude: 1, longitude: 2 }],
    });
    const points = buildTravelMapPoints([exp]);
    expect(points).toHaveLength(1);
    expect(points[0].city).toBe('Has coords');
  });

  it('uses the plain experience id for a single point', () => {
    const exp = experience({ location: { city: 'Solo', latitude: 5, longitude: 6 } });
    expect(buildTravelMapPoints([exp])[0].id).toBe('exp-1');
  });
});

describe('getTravelReviewStats', () => {
  it('averages scores and totals spend across travel experiences only', () => {
    const objects: WYQDObject[] = [
      experience({ id: 'a', actual_total: 1000 }),
      experience({ id: 'b', budget_total: 2000 }),
      experience({ id: 'c', experience_subtype: 'food_experience', actual_total: 9999 }),
    ];
    const reviews: ReviewEntry[] = [
      review({ id: 'r1', target_id: 'a', food_score: 8, scenery_score: 6, experience_score: 9 }),
      review({ id: 'r2', target_id: 'b', food_score: 4, scenery_score: 10, experience_score: 7 }),
      review({ id: 'r3', target_id: 'c', food_score: 1 }),
    ];
    const stats = getTravelReviewStats(objects, reviews);
    expect(stats.totalSpend).toBe(3000);
    expect(stats.avgSpend).toBe(1500);
    expect(stats.reviewedCount).toBe(2);
    expect(stats.avgFoodRank).toBe(6);
    expect(stats.avgSceneryRank).toBe(8);
    expect(stats.avgExperienceRank).toBe(8);
  });

  it('returns null averages and zero spend when there is nothing to aggregate', () => {
    const stats = getTravelReviewStats([], []);
    expect(stats).toEqual({
      avgFoodRank: null,
      avgSceneryRank: null,
      avgExperienceRank: null,
      totalSpend: 0,
      avgSpend: 0,
      reviewedCount: 0,
    });
  });
});

describe('buildTravelSummary', () => {
  it('counts distinct countries and cities and reports totals', () => {
    const experiences = [
      experience({ id: 'a', location: { country: 'Thailand', city: 'Bangkok' }, actual_total: 100 }),
      experience({ id: 'b', location: { country: 'Thailand', city: 'Chiang Mai' }, actual_total: 200 }),
      experience({ id: 'c', location: { country: 'Japan', city: 'Tokyo' } }),
    ];
    const summary = buildTravelSummary(experiences, []);
    expect(summary.countriesVisited).toBe(2);
    expect(summary.citiesVisited).toBe(3);
    expect(summary.totalTrips).toBe(3);
    expect(summary.totalSpend).toBe(300);
    expect(summary.countries.sort()).toEqual(['Japan', 'Thailand']);
  });
});
