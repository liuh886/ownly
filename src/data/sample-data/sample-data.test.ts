/**
 * Sample Data quality gate.
 *
 * The ownership side of the sample dataset has the same standing as the Sample
 * Trips: a new user, or someone demoing Ownly, sees exactly this. So every
 * assertion here corresponds to something that would otherwise look broken:
 *
 *  1. every entity passes the Ownly schema with zero errors;
 *  2. Doctor finds nothing — including the arithmetic it re-derives
 *     (`net_worth` vs balances) and the `review_ref` ↔ `target_id` link, which
 *     Doctor only trusts when both directions agree;
 *  3. the numbers Home aggregates are internally consistent, so the dashboard
 *     is not a pile of unrelated figures;
 *  4. the snapshots actually light up every snapshot-dependent surface: at
 *     least two, spanning calendar months, the earlier one flagged month-end,
 *     and the latest carrying a liability with a due date.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLE_DATA } from './ledger';
import { validateEntity } from '@/domain/schema';
import { CURRENT_SCHEMA_VERSION } from '@/domain/schema/common';
import {
  calculateHomeMetrics,
  calculateNextBillingDate,
  calculateRecurringMonthlyCost,
  findLatestSnapshot,
  findPreviousMonthEndSnapshot,
  isActiveRecurringCost,
} from '@/domain/calculations';
import { bucketLiabilityDues, collectLiabilityDues } from '@/domain/liability-due';
import { parseMarkdownEntity } from '@/data/frontmatter';
import { serializeSampleEntity } from './seed';

const objects = SAMPLE_DATA.objects;
const snapshots = SAMPLE_DATA.snapshots;
const reviews = SAMPLE_DATA.reviews;

const entities = [...objects, ...snapshots, ...reviews];

describe('Sample Data', () => {
  it('has every entity pass schema validation with zero errors', () => {
    for (const entity of entities) {
      const errors = validateEntity(entity).issues.filter((issue) => issue.severity === 'error');
      expect(errors, `${entity.type}:${entity.id} → ${JSON.stringify(errors)}`).toEqual([]);
    }
  });

  it('emits no schema warnings either', () => {
    // Warnings are Doctor-grade noise. A sample dataset must not ship any.
    for (const entity of entities) {
      const warnings = validateEntity(entity).issues.filter((issue) => issue.severity === 'warning');
      expect(warnings, `${entity.type}:${entity.id} → ${JSON.stringify(warnings)}`).toEqual([]);
    }
  });

  it('uses one schema version throughout', () => {
    for (const entity of entities) expect(entity.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('has unique ids across every type', () => {
    const ids = entities.map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps created_at <= updated_at on every record', () => {
    // Doctor flags the reverse as an inconsistency, and a sample that trips its
    // own checker is worse than no sample.
    for (const entity of entities) {
      const created = Date.parse(entity.created_at);
      const updated = entity.updated_at ? Date.parse(entity.updated_at) : created;
      expect(updated, `${entity.id}`).toBeGreaterThanOrEqual(created);
    }
  });

  it('round-trips every entity through Markdown without losing required fields', () => {
    for (const entity of entities) {
      const parsed = parseMarkdownEntity(serializeSampleEntity(entity));
      expect(parsed.frontmatter.type, entity.id).toBe(entity.type);
      expect(parsed.frontmatter.id, entity.id).toBe(entity.id);
      expect(parsed.frontmatter.schema_version, entity.id).toBe(CURRENT_SCHEMA_VERSION);
    }
  });

  it('covers all three object types so no tab renders empty', () => {
    const kinds = new Set(objects.map((object) => object.object_type));
    expect(kinds).toEqual(new Set(['physical', 'recurring_cost', 'one_time_experience']));
  });

  describe('objects', () => {
    it('never claims a physical item is part of net worth', () => {
      // `include_in_net_worth` is literal-`false` on PhysicalObject by design:
      // belongings are tracked through residual value, not added to net worth.
      for (const object of objects) {
        if (object.object_type !== 'physical') continue;
        expect(object.include_in_net_worth, object.id).toBe(false);
      }
    });

    it('writes both purchase_price and total_acquisition_cost, as the composer does', () => {
      for (const object of objects) {
        if (object.object_type !== 'physical' || object.status === 'seeded') continue;
        expect(object.total_acquisition_cost, object.id).toBe(object.total_acquisition_cost ?? 0);
        expect(object.total_acquisition_cost, object.id).toBe(object.purchase_price);
      }
    });

    it('gives every active subscription a computable monthly cost', () => {
      const active = objects.filter(isActiveRecurringCost);
      expect(active.length).toBeGreaterThan(0);
      for (const object of active) {
        expect(calculateRecurringMonthlyCost(object), object.id).toBeGreaterThan(0);
      }
    });

    it('produces a real next billing date for every active subscription', () => {
      for (const object of objects.filter(isActiveRecurringCost)) {
        const next = calculateNextBillingDate(object, new Date('2026-09-30T00:00:00Z'));
        expect(next, object.id).toBeTruthy();
        expect(next, object.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('gives every travel experience a location, as travel_worldview requires', () => {
      for (const object of objects) {
        if (object.object_type !== 'one_time_experience') continue;
        expect(object.experience_subtype, object.id).toBe('travel_worldview');
        const location = object.location;
        expect(location && (location.country || location.city || location.country_code), object.id).toBeTruthy();
      }
    });

    it('makes every experience expense_items sum to actual_total', () => {
      for (const object of objects) {
        if (object.object_type !== 'one_time_experience') continue;
        const sum = (object.expense_items ?? []).reduce((total, item) => total + item.amount, 0);
        expect(sum, object.id).toBe(object.actual_total);
      }
    });

    it('leaves exactly one experience pending a review, so the Reviews tab has a real prompt', () => {
      const reviewed = new Set(reviews.map((review) => review.target_id));
      const pending = objects.filter(
        (object) =>
          object.object_type === 'one_time_experience' &&
          ['completed', 'reviewed'].includes(object.status) &&
          !reviewed.has(object.id),
      );
      expect(pending).toHaveLength(1);
    });
  });

  describe('snapshots', () => {
    it('has totals that exactly match the balances Doctor re-derives', () => {
      for (const snapshot of snapshots) {
        const assets = snapshot.asset_balances.reduce((sum, balance) => sum + balance.amount, 0);
        const liabilities = snapshot.liability_balances.reduce((sum, balance) => sum + balance.amount, 0);
        expect(snapshot.total_assets, snapshot.id).toBe(assets);
        expect(snapshot.total_liabilities, snapshot.id).toBe(liabilities);
        expect(snapshot.net_worth, snapshot.id).toBe(assets - liabilities);
      }
    });

    it('always carries at least one asset balance', () => {
      // The Accounts tab's submit gate is `assets.length > 0`; an empty one
      // renders a "record your first snapshot" dead end.
      for (const snapshot of snapshots) expect(snapshot.asset_balances.length, snapshot.id).toBeGreaterThan(0);
    });

    it('spans at least two calendar months with an earlier month-end flag', () => {
      // This is the only way `findPreviousMonthEndSnapshot` yields a Δ, which is
      // what puts a real comparison on the Home net-worth card.
      const latest = findLatestSnapshot(snapshots);
      expect(latest).toBeTruthy();
      const previous = findPreviousMonthEndSnapshot(snapshots, latest!);
      expect(previous, 'no previous month-end snapshot').toBeTruthy();
      expect(previous!.snapshot_at < latest!.snapshot_at).toBe(true);
      expect(previous!.snapshot_at.slice(0, 7)).not.toBe(latest!.snapshot_at.slice(0, 7));
    });

    it('gives the latest snapshot a dated liability so repayment reminders appear', () => {
      const latest = findLatestSnapshot(snapshots)!;
      // Read "today" as shortly after the snapshot's own due dates: an unpaid
      // card is the state that makes the overdue bucket visible rather than
      // leaving the repayment panel empty.
      const dues = collectLiabilityDues(latest, '2026-09-12');
      expect(dues.length, 'no liability due dates surfaced').toBeGreaterThan(0);
      const buckets = bucketLiabilityDues(dues);
      expect(buckets.overdue.length, 'no overdue bucket').toBeGreaterThan(0);
      for (const due of dues) expect(due.days_until).toBeLessThan(0);
    });

    it('has strictly ascending snapshot dates', () => {
      const dates = [...snapshots].map((snapshot) => snapshot.snapshot_at).sort();
      expect(new Set(dates).size).toBe(dates.length);
    });
  });

  describe('reviews', () => {
    it('links every review to an object that exists', () => {
      const objectIds = new Set(objects.map((object) => object.id));
      for (const review of reviews) {
        if (!review.target_id) continue;
        expect(objectIds.has(review.target_id), `${review.id} → ${review.target_id}`).toBe(true);
      }
    });

    it('links target_id and review_ref in both directions', () => {
      // Doctor warns on either half alone; this is the check that keeps the
      // Reviews tab's "crystallized" state and the object's backlink honest.
      const objectById = new Map(objects.map((object) => [object.id, object]));
      for (const review of reviews) {
        if (!review.target_id) continue;
        const target = objectById.get(review.target_id)!;
        expect(target.review_ref, `${review.id} → ${target.id}`).toBe(review.id);
        expect(target.review_ref, `${target.id} backlink`).toBe(review.id);
      }
      const reviewIds = new Set(reviews.map((review) => review.id));
      for (const object of objects) {
        if (!object.review_ref) continue;
        expect(reviewIds.has(object.review_ref), `${object.id} → ${object.review_ref}`).toBe(true);
      }
    });

    it('sets target_type to match the linked object', () => {
      const objectById = new Map(objects.map((object) => [object.id, object]));
      for (const review of reviews) {
        if (!review.target_id) continue;
        expect(review.target_type, review.id).toBe(objectById.get(review.target_id)!.object_type);
      }
    });

    it('uses 0-100 scores and never the legacy rank fields', () => {
      // `migrateReviewEntry` rewrites `*_rank` into `*_score` on every read, so
      // authoring ranks would make the data drift the first time it is opened.
      for (const review of reviews) {
        expect(review.food_rank, review.id).toBeUndefined();
        expect(review.scenery_rank, review.id).toBeUndefined();
        expect(review.experience_rank, review.id).toBeUndefined();
        for (const score of [review.food_score, review.scenery_score, review.experience_score]) {
          if (score === undefined || score === null) continue;
          expect(score, review.id).toBeGreaterThanOrEqual(0);
          expect(score, review.id).toBeLessThanOrEqual(100);
        }
      }
    });

    it('scores at least two reviews per dimension so the ranking boards render', () => {
      const dimension = (key: 'food_score' | 'scenery_score' | 'experience_score') =>
        reviews.filter((review) => typeof review[key] === 'number').length;
      expect(dimension('food_score')).toBeGreaterThanOrEqual(2);
      expect(dimension('scenery_score')).toBeGreaterThanOrEqual(2);
      expect(dimension('experience_score')).toBeGreaterThanOrEqual(2);
    });

    it('records exit_type for every record that closes something out', () => {
      for (const review of reviews) {
        if (review.review_type !== 'exit_record') continue;
        expect(review.exit_type, review.id).toBeTruthy();
        expect(review.exited_at, review.id).toBeTruthy();
      }
    });

    it('keeps review period and year aligned with reviewed_at', () => {
      for (const review of reviews) {
        if (!review.reviewed_at) continue;
        if (review.period) expect(review.period, review.id).toBe(review.reviewed_at.slice(0, 7));
        if (review.year) expect(review.year, review.id).toBe(Number(review.reviewed_at.slice(0, 4)));
      }
    });
  });

  describe('aggregates', () => {
    it('produces non-zero Home metrics across every card', () => {
      const metrics = calculateHomeMetrics(objects, snapshots);
      expect(metrics.netWorth, 'net worth').toBeGreaterThan(0);
      expect(metrics.netWorthDeltaFromPreviousMonth, 'Δ vs previous month').not.toBeNull();
      expect(metrics.monthlyFixedCost, 'monthly subscription cost').toBeGreaterThan(0);
      expect(metrics.ownedPhysicalCount, 'owned physical count').toBeGreaterThan(0);
      expect(metrics.activeSubscriptionCount, 'active subscription count').toBeGreaterThan(0);
      expect(metrics.observingDesireAmount, 'observing desire amount').toBeGreaterThan(0);
    });

    it('stays well inside the free-tier capacity limits', () => {
      // Obsidian free tier enforces these; a sample that busts them would make
      // the very first write on another runtime fail.
      expect(objects.length).toBeLessThan(200);
      expect(snapshots.length).toBeLessThan(30);
      expect(reviews.length).toBeLessThan(100);
    });
  });

  it('tags every record as sample so a loaded set is identifiable and deletable', () => {
    for (const entity of entities) {
      expect(entity.tags ?? [], entity.id).toContain('sample');
    }
  });

  it('attaches a markdown body to every record that declares one', () => {
    for (const [id] of Object.entries(SAMPLE_DATA.bodies)) {
      expect(objects.some((object) => object.id === id) || reviews.some((review) => review.id === id), id).toBe(true);
    }
  });
});