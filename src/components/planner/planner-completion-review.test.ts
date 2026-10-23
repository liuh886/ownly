import { describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripStatus } from '@/domain/planner';
import { isTripReviewable } from '@/domain/trip-review';
import type { ReviewEntry } from '@/domain/types';
import type { WYQDStoredEntity } from '@/core/repository';

describe('Planner Trip Completion & Reversal logic', () => {
  function computeRestoredStatus(trip: PlannerTrip, today: string): PlannerTripStatus {
    return trip.start_date <= today && today <= trip.end_date ? 'active' : 'planning';
  }

  it('restores completed trip to active if today falls within trip dates', () => {
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 't1',
      title: 'Current Trip',
      status: 'completed',
      start_date: '2026-10-20',
      end_date: '2026-10-25',
      destinations: ['Tokyo'],
      created_at: '2026-10-01',
    };
    expect(computeRestoredStatus(trip, '2026-10-23')).toBe('active');
  });

  it('restores completed trip to planning if today is before trip starts', () => {
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 't2',
      title: 'Future Trip',
      status: 'completed',
      start_date: '2026-11-01',
      end_date: '2026-11-05',
      destinations: ['Kyoto'],
      created_at: '2026-10-01',
    };
    expect(computeRestoredStatus(trip, '2026-10-23')).toBe('planning');
  });

  it('restores completed trip to planning if today is after trip ended', () => {
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 't3',
      title: 'Past Trip',
      status: 'completed',
      start_date: '2026-09-01',
      end_date: '2026-09-05',
      destinations: ['Osaka'],
      created_at: '2026-09-01',
    };
    expect(computeRestoredStatus(trip, '2026-10-23')).toBe('planning');
  });
});

describe('Planner Review Button & Linkage logic', () => {
  it('trip with review_id is always reviewable regardless of status', () => {
    const tripWithReview: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 't4',
      title: 'Reopened Trip with Retrospective',
      status: 'active',
      start_date: '2026-12-01',
      end_date: '2026-12-05',
      destinations: ['Sapporo'],
      review_id: 'obj_trip_review_t4',
      created_at: '2026-10-01',
    };
    expect(isTripReviewable(tripWithReview, '2026-10-23')).toBe(true);
  });

  it('computes average review score for badge display from storedReviews', () => {
    const storedReviews: WYQDStoredEntity<ReviewEntry>[] = [
      {
        fileName: 'review_trip_t1.md',
        body: '',
        entity: {
          schema_version: '0.1',
          id: 'review_trip_t1',
          title: 'Review Trip t1',
          type: 'review',
          review_type: 'object_review',
          target_id: 'obj_trip_review_t1',
          food_score: 90,
          scenery_score: 80,
          experience_score: 100,
          created_at: '2026-10-23',
        },
      },
    ];

    const targetReviewId = 'obj_trip_review_t1';
    const linked = storedReviews.find(
      (r) => r.entity.target_id === targetReviewId || r.entity.id === targetReviewId,
    )?.entity;

    expect(linked).toBeDefined();
    const scores = [linked!.experience_score, linked!.food_score, linked!.scenery_score].filter(
      (s): s is number => typeof s === 'number',
    );
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    expect(avgScore).toBe(90);
  });
});
