import type { WYQDRepositoryAdapter } from '@/core/repository';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import { todayLocalISO } from '@/domain/date';
import type { TripReviewDraft } from '@/domain/trip-review';
import type { ReviewEntry } from '@/domain/types';
import { recordCurrency } from '@/domain/currency';
import { TripReviewConflictError } from './save-trip-review';

/** A linked trip edits the same ReviewEntry as Reviews; notes remain on the experience. */
export async function saveUnifiedTripReview(
  repository: WYQDRepositoryAdapter,
  tripId: string,
  draft: TripReviewDraft,
  link: (tripId: string, experienceId: string) => Promise<void>,
  assertWorkspace: () => void,
): Promise<void> {
  const baseline = draft.baseline;
  if (!baseline) throw new Error('Missing travel experience snapshot.');
  assertWorkspace();
  const stored = (await repository.listObjects()).find((item) => item.entity.id === baseline.object.entity.id);
  const reviews = await repository.listReviews();
  const currentReview = reviews.find((item) => item.entity.id === baseline.review?.entity.id)
    ?? reviews.find((item) => item.entity.target_id === baseline.object.entity.id);
  if (!stored || stored.entity.object_type !== 'one_time_experience'
    || JSON.stringify(stored.entity) !== JSON.stringify(baseline.object.entity) || stored.body !== baseline.object.body
    || JSON.stringify(currentReview) !== JSON.stringify(baseline.review)) {
    throw new TripReviewConflictError(false, new Error('旅行或复盘已被修改，请重新打开后核对。'));
  }
  if (recordCurrency(stored.entity) !== recordCurrency(draft.object)) {
    throw new TripReviewConflictError(false, new Error('旅行币种已改变，请核对花费。'));
  }
  const today = todayLocalISO();
  const reviewId = currentReview?.entity.id ?? `review_trip_${encodeURIComponent(tripId)}`;
  if (reviews.some((item) => item.entity.id === reviewId && item.entity.target_id !== stored.entity.id)) {
    throw new TripReviewConflictError(false, new Error('Review identity already belongs to another object.'));
  }
  const review: ReviewEntry = {
    ...currentReview?.entity,
    schema_version: WYQD_SCHEMA_VERSION, type: 'review', id: reviewId, review_type: 'object_review',
    title: currentReview?.entity.title ?? `${draft.language === 'en' ? 'Review' : '复盘'} ${stored.entity.title}`,
    target: stored.entity.title, target_id: stored.entity.id, target_type: 'one_time_experience',
    reviewed_at: currentReview?.entity.reviewed_at ?? today,
    summary: draft.scores?.summary?.trim() || currentReview?.entity.summary || stored.entity.title,
    food_score: draft.scores?.foodScore ?? null,
    scenery_score: draft.scores?.sceneryScore ?? null,
    experience_score: draft.scores?.experienceScore ?? null,
    period: currentReview?.entity.period ?? today.slice(0, 7),
    year: currentReview?.entity.year ?? Number(today.slice(0, 4)),
    currency: recordCurrency(stored.entity), tags: currentReview?.entity.tags ?? ['ownly', 'review', 'trip-review'],
    created_at: currentReview?.entity.created_at ?? today, updated_at: today,
  };
  let reviewFile: string | undefined;
  let objectWritten = false;
  try {
    assertWorkspace();
    if (currentReview) await repository.updateReview(currentReview.fileName, review, draft.body);
    else reviewFile = await repository.saveReview(review, draft.body);
    assertWorkspace();
    await repository.updateObject(stored.fileName, {
      ...stored.entity, status: 'reviewed', review_ref: review.id, reviewed_at: review.reviewed_at,
      // Empty/partially converted ledgers never erase a manually recorded total.
      actual_total: draft.object.actual_total ?? stored.entity.actual_total,
      updated_at: new Date().toISOString(),
    }, stored.body);
    objectWritten = true;
    assertWorkspace();
    await link(tripId, stored.entity.id);
  } catch (error) {
    const failures: unknown[] = [];
    try { if (objectWritten) await repository.updateObject(stored.fileName, stored.entity, stored.body); }
    catch (failure) { failures.push(failure); }
    try {
      if (currentReview) await repository.updateReview(currentReview.fileName, currentReview.entity, currentReview.body);
      else if (reviewFile) await repository.archiveReview(reviewFile);
    } catch (failure) { failures.push(failure); }
    if (failures.length) throw new AggregateError([error, ...failures], '复盘保存失败，恢复记录也失败，请检查数据目录。');
    throw error;
  }
}
