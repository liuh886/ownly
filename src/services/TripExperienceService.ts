import type { WYQDRepositoryAdapter } from '@/core/repository';
import type { PlannerTrip } from '@/domain/planner';
import type { OneTimeExperienceObject, WYQDObject } from '@/domain/types';
import { experienceFromTrip, tripExperienceId, tripFromExperience } from '@/domain/trip-experience';
import type { PlannerRepository } from './PlannerRepository';

type Planner = Pick<PlannerRepository, 'listTrips' | 'upsertTrip' | 'listExpenses'>;

/** Call with both repositories bound to write sessions. Never match trips by title. */
export async function saveUnifiedTrip(
  repository: WYQDRepositoryAdapter,
  planner: Planner,
  input: PlannerTrip,
  assertWorkspace: () => void,
  baseline?: PlannerTrip,
): Promise<PlannerTrip> {
  assertWorkspace();
  const trips = await planner.listTrips({ strict: true });
  const live = trips.find((trip) => trip.id === input.id);
  const previousId = live && tripExperienceId(live);
  const requestedId = tripExperienceId(input);
  if (previousId && requestedId && previousId !== requestedId) {
    throw new Error('此行程已关联另一条旅行经历，请先核对已有记录。 / Trip already linked to another experience.');
  }
  if (baseline && (!live || JSON.stringify(live) !== JSON.stringify(baseline))) {
    throw new Error('行程已被修改，请重新打开后再保存。 / Trip changed; reopen it before saving.');
  }
  const id = previousId ?? requestedId ?? `obj_trip_review_${encodeURIComponent(input.id)}`;
  if (trips.some((trip) => trip.id !== input.id && tripExperienceId(trip) === id)) {
    throw new Error('该旅行经历已关联其他行程。 / Experience already linked to another trip.');
  }
  const objects = await repository.listObjects();
  const stored = objects.find((item) => item.entity.id === id);
  if (!stored && (previousId || requestedId)) {
    throw new Error('关联的旅行经历不存在或已归档，请先恢复记录。 / Linked experience is missing or archived.');
  }
  if (stored && stored.entity.object_type !== 'one_time_experience') {
    throw new Error('只能关联旅行经历。 / Only experiences can be linked.');
  }
  const existing = stored?.entity as OneTimeExperienceObject | undefined;
  const trip: PlannerTrip = { ...live, ...input, experience_id: id,
    review_id: live?.review_id ?? input.review_id,
    updated_at: new Date().toISOString() };
  // Currency changes must not silently relabel an existing budget or expense ledger.
  if (existing?.currency && trip.currency && existing.currency !== trip.currency
    && (existing.budget_total != null || existing.actual_total != null || existing.expense_items?.length
      || (await planner.listExpenses()).some((expense) => expense.trip_id === trip.id))) {
    throw new Error('已有预算或花费，请保留旅行币种以免金额被错误重标。 / Keep the currency of a trip with recorded amounts.');
  }
  const object = experienceFromTrip(trip, existing);
  const linkedReviews = (await repository.listReviews()).filter((item) => item.entity.target_id === id);
  const review = linkedReviews.find((item) => item.entity.id === existing?.review_ref) ?? linkedReviews[0];
  if (review) {
    object.review_ref = existing?.review_ref ?? review.entity.id;
    if (trip.status === 'completed') object.status = 'reviewed';
  }
  const undos: Array<() => Promise<unknown>> = [];
  try {
    assertWorkspace();
    if (stored) {
      await repository.updateObject(stored.fileName, object, stored.body);
      undos.unshift(() => repository.updateObject(stored.fileName, stored.entity, stored.body));
    } else {
      const newFile = await repository.saveObject(object, '');
      undos.unshift(() => repository.archiveObject(newFile));
    }
    for (const linked of linkedReviews) {
      if (linked.entity.target === object.title) continue;
      assertWorkspace();
      await repository.updateReview(linked.fileName, { ...linked.entity, target: object.title, updated_at: trip.updated_at }, linked.body);
      undos.unshift(() => repository.updateReview(linked.fileName, linked.entity, linked.body));
    }
    assertWorkspace();
    await planner.upsertTrip(trip);
  } catch (error) {
    // Compensate in the captured workspace; new records stay recoverable in Archive.
    const failures: unknown[] = [];
    for (const undo of undos) { try { await undo(); } catch (failure) { failures.push(failure); } }
    if (failures.length) throw new AggregateError([error, ...failures], '旅行保存失败，恢复记录也失败，请检查数据目录。');
    throw error;
  }
  return trip;
}

/** Object edits update the linked itinerary; caller compensates the object on failure. */
export async function syncExperienceToTrip(planner: Planner, object: WYQDObject): Promise<PlannerTrip | null> {
  const linked = (await planner.listTrips({ strict: true })).filter((trip) => tripExperienceId(trip) === object.id);
  if (linked.length > 1) throw new Error('旅行经历关联了多个行程，请先修复重复关联。 / Multiple trips reference this experience.');
  const trip = linked[0];
  if (!trip) return null;
  if (object.object_type !== 'one_time_experience') throw new Error('已关联行程的对象必须保留为旅行经历。 / A linked object must remain an experience.');
  const shared = tripFromExperience(object, trip.id, new Date().toISOString());
  // An object can have an undated intention, but an existing itinerary requires dates.
  if (!shared.start_date || !shared.end_date || shared.end_date < shared.start_date) {
    throw new Error('已关联行程的旅行需要有效的出发与结束日期。 / A linked trip requires valid dates.');
  }
  if (trip.currency && shared.currency !== trip.currency) {
    throw new Error('已关联行程的币种不能在物欲中直接修改。 / Change the linked trip currency in Planner.');
  }
  await planner.upsertTrip({ ...trip, title: shared.title, start_date: shared.start_date,
    end_date: shared.end_date, destinations: shared.destinations, status: shared.status,
    experience_id: object.id, updated_at: shared.updated_at });
  return trip;
}
