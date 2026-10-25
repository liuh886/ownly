import { describe, expect, it } from 'vitest';
import { MarkdownEntityRepository, type MarkdownFileStore } from './MarkdownEntityRepository';
import { PlannerRepository } from './PlannerRepository';
import { saveUnifiedTrip } from './TripExperienceService';
import { saveUnifiedTripReview } from '@/components/planner/save-unified-trip-review';
import { buildTripReviewDraft, buildTripReviewStats, type TripReviewScores } from '@/domain/trip-review';
import { experienceFromTrip } from '@/domain/trip-experience';
import type { PlannerTrip } from '@/domain/planner';
import type { OneTimeExperienceObject } from '@/domain/types';
import type { WYQDStoredEntity } from '@/core/repository';

const trip: PlannerTrip = { schema_version: '0.1', type: 'trip', id: 'trip-kyoto',
  title: 'Kyoto autumn', status: 'completed', start_date: '2026-10-01', end_date: '2026-10-05',
  destinations: ['Kyoto'], currency: 'CNY', created_at: '2026-09-01' };
async function setup() {
  const files = new Map<string, Map<string, string>>();
  const store: MarkdownFileStore = {
    getDataFolder: async () => 'Ownly',
    readMarkdownFiles: async (directory) => [...(files.get(directory) ?? new Map())].map(([fileName, content]) => ({ fileName, content })),
    writeMarkdownFile: async (directory, fileName, content) => {
      const entries = files.get(directory) ?? new Map<string, string>();
      entries.set(fileName, content); files.set(directory, entries);
    },
    deleteMarkdownFile: async (directory, fileName) => { files.get(directory)?.delete(fileName); },
  };
  const repository = new MarkdownEntityRepository(store);
  const planner = new PlannerRepository(store);
  await repository.initialize(); await planner.initialize();
  await repository.saveObject({ ...experienceFromTrip(trip), id: 'my-original-trip', budget_total: 5000,
    actual_total: 4200, worldview_tags: ['architecture'] }, 'My original travel intention and notes');
  await repository.withWriteSession((repo) => planner.withWriteSession((p) =>
    saveUnifiedTrip(repo, p, { ...trip, experience_id: 'my-original-trip' }, () => {})));
  const draft = async () => {
    const object = (await repository.listObjects())[0] as WYQDStoredEntity<OneTimeExperienceObject>;
    const review = (await repository.listReviews())[0];
    return { ...buildTripReviewDraft(trip, buildTripReviewStats(trip, [], [], [], [])),
      baseline: { object, review }, body: review?.body ?? 'Trip summary: quiet temples',
      scores: { foodScore: 90, sceneryScore: 95, experienceScore: 88, summary: 'Autumn temples' } as TripReviewScores };
  };
  const save = async (value: Awaited<ReturnType<typeof draft>>, fail = false) =>
    repository.withWriteSession((repo) => planner.withWriteSession((p) =>
      saveUnifiedTripReview(repo, trip.id, value, async (id, target) => {
        if (fail) throw new Error('Backlink denied');
        await p.patchTripReviewId(id, target);
      }, () => {})));
  return { repository, planner, draft, save };
}

describe('travel lifecycle with real Markdown repositories', () => {
  it('reuses an object and the same review across Planner and Reviews, preserving notes and budget', async () => {
    const s = await setup();
    await s.save(await s.draft());
    expect(await s.repository.listObjects()).toHaveLength(1);
    const object = (await s.repository.listObjects())[0];
    expect(object).toMatchObject({ body: expect.stringContaining('My original travel intention and notes'), entity: {
      id: 'my-original-trip', status: 'reviewed', budget_total: 5000, actual_total: 4200,
      worldview_tags: ['architecture'], review_ref: 'review_trip_trip-kyoto',
    } });
    const review = (await s.repository.listReviews())[0];
    expect(review).toMatchObject({ body: expect.stringContaining('Trip summary: quiet temples'), entity: { target_id: object.entity.id, food_score: 90 } });
    expect((await s.planner.listTrips())[0]).toMatchObject({ experience_id: object.entity.id, review_id: object.entity.id });
    // Editing via Reviews is read back by the next Planner review editor.
    await s.repository.updateReview(review.fileName, { ...review.entity, food_score: 97 }, 'Edited in Reviews');
    const reopened = await s.draft();
    expect(reopened.baseline.review).toMatchObject({ body: expect.stringContaining('Edited in Reviews'), entity: { food_score: 97 } });
    await s.save({ ...reopened, body: 'Edited again in Planner' });
    expect(await s.repository.listReviews()).toHaveLength(1);
    expect((await s.repository.listReviews())[0].body.trim()).toBe('Edited again in Planner');
    const latestTrip = (await s.planner.listTrips())[0];
    await s.repository.withWriteSession((repo) => s.planner.withWriteSession((planner) =>
      saveUnifiedTrip(repo, planner, { ...latestTrip, title: 'Renamed itinerary' }, () => {}, latestTrip)));
    expect((await s.repository.listReviews())[0].entity.target).toBe('Renamed itinerary');
    expect((await s.repository.listReviews())[0].body.trim()).toBe('Edited again in Planner');
  });

  it('saves a text-only review without requiring ratings', async () => {
    const s = await setup();
    await s.save({ ...await s.draft(), scores: { foodScore: null, sceneryScore: null, experienceScore: null, summary: 'A good trip' } });
    expect((await s.repository.listReviews())[0].entity).toMatchObject({ summary: 'A good trip', food_score: null });
    expect((await s.repository.listObjects())[0].entity.status).toBe('reviewed');
  });

  it('refuses to overwrite notes or reviews changed after the editor opened', async () => {
    const s = await setup();
    const value = await s.draft();
    await s.repository.updateObject(value.baseline.object.fileName, value.baseline.object.entity, 'External notes');
    await expect(s.save(value)).rejects.toThrow('Draft save failed');
    expect((await s.repository.listObjects())[0].body.trim()).toBe('External notes');
    expect(await s.repository.listReviews()).toHaveLength(0);
    await s.save(await s.draft());
    const edit = await s.draft();
    const review = edit.baseline.review!;
    await s.repository.updateReview(review.fileName, { ...review.entity, summary: 'External edit' }, review.body);
    await expect(s.save(edit)).rejects.toThrow('Draft save failed');
    expect((await s.repository.listReviews())[0].entity.summary).toBe('External edit');
  });

  it('rolls back a failed backlink and allows a retry without active duplicates', async () => {
    const s = await setup();
    const before = (await s.repository.listObjects())[0];
    await expect(s.save(await s.draft(), true)).rejects.toThrow('Backlink denied');
    expect((await s.repository.listObjects())[0]).toEqual(before);
    expect(await s.repository.listReviews()).toHaveLength(0);
    await s.save(await s.draft());
    expect(await s.repository.listObjects()).toHaveLength(1);
    expect(await s.repository.listReviews()).toHaveLength(1);
  });
});
