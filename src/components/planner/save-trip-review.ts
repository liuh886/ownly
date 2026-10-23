import type { WYQDRepositoryAdapter } from '@/core/repository';
import type { TripReviewDraft } from '@/domain/trip-review';
import type { OneTimeExperienceObject } from '@/domain/types';
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
function mergeReview(existing: OneTimeExperienceObject, draft: TripReviewDraft): OneTimeExperienceObject {
  return {
    ...existing,
    title: draft.object.title,
    status: draft.object.status,
    experience_subtype: draft.object.experience_subtype,
    started_at: draft.object.started_at,
    ended_at: draft.object.ended_at,
    location: draft.object.location,
    locations: draft.object.locations,
    budget_total: draft.object.budget_total,
    actual_total: draft.object.actual_total,
    expense_items: draft.object.expense_items,
    tags: draft.object.tags,
    updated_at: draft.object.updated_at,
  };
}

/** A failed backlink must reuse the saved object and preserve subsequent user edits. */
export async function saveTripReviewDraft(
  repository: Pick<WYQDRepositoryAdapter, 'listObjects' | 'saveObject' | 'updateObject'>,
  tripId: string,
  draft: TripReviewDraft,
  link: (tripId: string, reviewId: string) => Promise<void>,
  assertWorkspace: () => void,
  recovery: Map<string, TripReviewRecovery>,
): Promise<void> {
  const reviewId = `obj_trip_review_${encodeURIComponent(tripId)}`;
  let objectSaved = false;
  try {
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
      const merged = mergeReview(existing.entity, draft);
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
      const object = { ...draft.object, id: reviewId };
      const fileName = await repository.saveObject(object, draft.body);
      objectSaved = true;
      assertWorkspace();
      const saved = (await repository.listObjects()).find((item) => item.fileName === fileName && item.entity.id === reviewId);
      if (!saved) throw new Error('Saved retrospective could not be read back.');
      recovery.set(reviewId, { entity: comparable(saved.entity), body: saved.body, requestedBody: draft.body });
    }
    objectSaved = true;
    assertWorkspace();
    await link(tripId, reviewId);
  } catch (error) {
    if (error instanceof TripReviewConflictError) throw error;
    throw new TripReviewSaveError(objectSaved, error);
  }
}
