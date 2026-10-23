import type { WYQDRepositoryAdapter } from '@/core/repository';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import { todayLocalISO } from '@/domain/date';
import type { TripReviewDraft } from '@/domain/trip-review';
import type { OneTimeExperienceObject, ReviewEntry } from '@/domain/types';
import { recordCurrency } from '@/domain/currency';

export class TripReviewSaveError extends Error {
  constructor(public readonly objectSaved: boolean, cause: unknown) {
    super(objectSaved ? 'Draft saved, but linking failed.' : 'Draft save failed.', { cause });
  }
}

export class TripReviewConflictError extends TripReviewSaveError {}
export interface TripReviewRecovery { entity: string; body: string; requestedBody: string }
function comparable(value: unknown): string {
  return JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}

/** Update only Planner-owned review fields; keep identity, source currency and extension fields. */
function mergeReview(
  existing: OneTimeExperienceObject,
  draft: TripReviewDraft,
  hasScores: boolean,
  linkedReviewEntryId?: string,
): OneTimeExperienceObject {
  return {
    ...existing,
    title: draft.object.title,
    status: hasScores ? 'reviewed' : (draft.object.status ?? existing.status),
    experience_subtype: draft.object.experience_subtype,
    started_at: draft.object.started_at,
    ended_at: draft.object.ended_at,
    location: draft.object.location,
    locations: draft.object.locations,
    budget_total: draft.object.budget_total,
    actual_total: draft.object.actual_total,
    expense_items: draft.object.expense_items,
    tags: draft.object.tags,
    review_ref: hasScores ? (linkedReviewEntryId ?? existing.review_ref) : (draft.object.review_ref ?? existing.review_ref),
    reviewed_at: hasScores ? (draft.object.ended_at || todayLocalISO()) : (draft.object.reviewed_at ?? existing.reviewed_at),
    updated_at: draft.object.updated_at,
  };
}

export type TripReviewRepository = Pick<
  WYQDRepositoryAdapter,
  'listObjects' | 'saveObject' | 'updateObject'
> &
  Partial<
    Pick<
      WYQDRepositoryAdapter,
      'listReviews' | 'saveReview' | 'updateReview'
    >
  >;

/** A failed backlink must reuse the saved object and preserve subsequent user edits. */
export async function saveTripReviewDraft(
  repository: TripReviewRepository,
  tripId: string,
  draft: TripReviewDraft,
  link: (tripId: string, reviewId: string) => Promise<void>,
  assertWorkspace: () => void,
  recovery: Map<string, TripReviewRecovery>,
): Promise<void> {
  const reviewId = `obj_trip_review_${encodeURIComponent(tripId)}`;
  const reviewEntryId = `review_trip_${encodeURIComponent(tripId)}`;
  const hasScores = Boolean(
    draft.scores &&
      (draft.scores.foodScore != null ||
        draft.scores.sceneryScore != null ||
        draft.scores.experienceScore != null),
  );
  const today = todayLocalISO();
  let objectSaved = false;

  try {
    assertWorkspace();
    let existingReviewFile: string | null = null;
    let linkedReviewEntryId = reviewEntryId;
    if (hasScores && repository.listReviews) {
      const existingReviews = await repository.listReviews();
      const found = existingReviews.find(
        (item) => item.entity.target_id === reviewId || item.entity.id === reviewEntryId,
      );
      if (found) {
        existingReviewFile = found.fileName;
        linkedReviewEntryId = found.entity.id;
      }
    }

    assertWorkspace();
    const existing = (await repository.listObjects()).find((item) => item.entity.id === reviewId);
    assertWorkspace();
    const baseline = recovery.get(reviewId);
    if (existing) {
      objectSaved = true;
      if (!baseline || existing.entity.object_type !== 'one_time_experience'
        || comparable(existing.entity) !== baseline.entity || existing.body !== baseline.body) {
        throw new TripReviewConflictError(true, new Error('The saved retrospective has changed. Your input is kept; review the saved object before retrying.'));
      }
      if (recordCurrency(existing.entity) !== recordCurrency(draft.object)) {
        throw new TripReviewConflictError(true, new Error('The trip currency changed after the draft was saved. Review the saved amounts before retrying.'));
      }
      const merged = mergeReview(existing.entity, draft, hasScores, linkedReviewEntryId);
      const changedStructure = comparable({ ...merged, updated_at: existing.entity.updated_at }) !== comparable(existing.entity);
      if (draft.body !== baseline.requestedBody || changedStructure) {
        assertWorkspace();
        await repository.updateObject(existing.fileName, merged, draft.body);
        objectSaved = true;
        assertWorkspace();
        const saved = (await repository.listObjects()).find((item) => item.fileName === existing.fileName && item.entity.id === reviewId);
        if (!saved) throw new Error('Saved retrospective could not be read back.');
        recovery.set(reviewId, { entity: comparable(saved.entity), body: saved.body, requestedBody: draft.body });
      }
    } else {
      const object: OneTimeExperienceObject = {
        ...draft.object,
        id: reviewId,
        status: hasScores ? 'reviewed' : draft.object.status,
        review_ref: hasScores ? linkedReviewEntryId : draft.object.review_ref,
        reviewed_at: hasScores ? (draft.object.ended_at || today) : draft.object.reviewed_at,
      };
      const fileName = await repository.saveObject(object, draft.body);
      objectSaved = true;
      assertWorkspace();
      const saved = (await repository.listObjects()).find((item) => item.fileName === fileName && item.entity.id === reviewId);
      if (!saved) throw new Error('Saved retrospective could not be read back.');
      recovery.set(reviewId, { entity: comparable(saved.entity), body: saved.body, requestedBody: draft.body });
    }
    objectSaved = true;

    if (hasScores) {
      assertWorkspace();
      const scoreLabel = (s: number | null | undefined) => (s != null ? `${s}分` : '未评分');
      if (existingReviewFile && repository.updateReview) {
        const existingReviews = repository.listReviews ? await repository.listReviews() : [];
        const existingReview = existingReviews.find((r) => r.fileName === existingReviewFile);
        if (existingReview) {
          const updatedReview: ReviewEntry = {
            ...existingReview.entity,
            summary: draft.scores?.summary || existingReview.entity.summary || draft.object.title,
            food_score: draft.scores?.foodScore !== undefined ? draft.scores?.foodScore : existingReview.entity.food_score,
            scenery_score: draft.scores?.sceneryScore !== undefined ? draft.scores?.sceneryScore : existingReview.entity.scenery_score,
            experience_score: draft.scores?.experienceScore !== undefined ? draft.scores?.experienceScore : existingReview.entity.experience_score,
            updated_at: today,
          };
          await repository.updateReview(existingReviewFile, updatedReview, existingReview.body);
        }
      } else if (!existingReviewFile && repository.saveReview) {
        const reviewEntry: ReviewEntry = {
          schema_version: WYQD_SCHEMA_VERSION,
          id: reviewEntryId,
          type: 'review',
          review_type: 'object_review',
          title: `复盘 ${draft.object.title}`,
          reviewed_at: draft.object.ended_at || today,
          summary: draft.scores?.summary || draft.object.title,
          target: draft.object.title,
          target_id: reviewId,
          target_type: 'one_time_experience',
          food_score: draft.scores?.foodScore ?? null,
          scenery_score: draft.scores?.sceneryScore ?? null,
          experience_score: draft.scores?.experienceScore ?? null,
          period: today.slice(0, 7),
          year: Number(today.slice(0, 4)),
          currency: draft.object.currency ?? 'CNY',
          tags: ['ownly', 'review', 'trip-review'],
          created_at: today,
          updated_at: today,
        };
        const reviewBody = `## 复盘\n\n${draft.object.title}\n\n## 评分\n\n- 美食评分：${scoreLabel(reviewEntry.food_score)}\n- 风景评分：${scoreLabel(reviewEntry.scenery_score)}\n- 体验评分：${scoreLabel(reviewEntry.experience_score)}\n`;
        await repository.saveReview(reviewEntry, reviewBody);
      }
    }

    objectSaved = true;
    assertWorkspace();
    await link(tripId, reviewId);
  } catch (error) {
    if (error instanceof TripReviewConflictError) throw error;
    throw new TripReviewSaveError(objectSaved, error);
  }
}
