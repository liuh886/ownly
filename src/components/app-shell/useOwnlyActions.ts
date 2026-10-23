import { useEffect, useRef } from 'react';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { useI18n } from '@/core/i18n-context';
import { checkWYQDCapacity } from '@/core/membership';
import type { WYQDObject, AccountSnapshot, ObjectLogEntry, PhysicalObject, ReviewEntry } from '@/domain/types';
import type { WYQDStoredEntity, WYQDArchiveEntityType, WYQDRepositoryAdapter } from '@/core/repository';
import type { WYQDTranslationKey } from '@/core/i18n';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import { todayLocalISO } from '@/domain/date';
import { calculateExperienceCost } from '@/domain/calculations';
import { captureWorkspaceIdentity, isWorkspaceIdentityCurrent } from '@/services/ownlyStoreRouter';

interface ReviewRankings { foodScore: number | null; sceneryScore: number | null; experienceScore: number | null }
type RegisterUndo = (undo: () => Promise<unknown>) => void;

export function useOwnlyActions(
  loadVaultData: () => Promise<void>,
  storedObjects: WYQDStoredEntity<WYQDObject>[],
  onObjectCreated?: () => void,
) {
  const { t } = useI18n();
  const { repository, showNotice, membership, isConnected, isLoading, dataRevision } = useOwnlyWorkspace();
  const activeWorkspace = useRef({ repository, dataRevision, isConnected, isLoading });
  const writing = useRef(false);
  useEffect(() => { activeWorkspace.current = { repository, dataRevision, isConnected, isLoading }; });

  async function guardCapacity(repo: WYQDRepositoryAdapter, kind: 'objects' | 'snapshots' | 'reviews') {
    if (membership.isPro) return;
    const entries = kind === 'objects' ? await repo.listObjects() : kind === 'snapshots' ? await repo.listSnapshots() : await repo.listReviews();
    if (!checkWYQDCapacity(membership, kind, entries.length).allowed) throw new Error(membership.upgradeMessage);
  }

  async function compensate(repo: WYQDRepositoryAdapter, action: (repo: WYQDRepositoryAdapter, undo: RegisterUndo) => Promise<unknown>) {
    const undos: Array<() => Promise<unknown>> = [];
    try { return await action(repo, (undo) => undos.unshift(undo)); }
    catch (error) {
      const failures: unknown[] = [];
      for (const undo of undos) { try { await undo(); } catch (failure) { failures.push(failure); } }
      if (failures.length) throw new AggregateError([error, ...failures], t('writeRollbackFailed'));
      throw error;
    }
  }

  async function commit(action: (repo: WYQDRepositoryAdapter, undo: RegisterUndo) => Promise<unknown>, success: WYQDTranslationKey): Promise<boolean> {
    const current = activeWorkspace.current;
    if (!current.isConnected || current.isLoading || current.repository !== repository || current.dataRevision !== dataRevision) {
      const message = !current.isConnected ? t('connectVaultToWrite') : t('workspaceChanged');
      showNotice(message);
      throw new Error(message);
    }
    if (writing.current) throw new Error(t('saving'));
    writing.current = true;
    const identity = captureWorkspaceIdentity();
    const stillCurrent = () => activeWorkspace.current.repository === repository && activeWorkspace.current.dataRevision === dataRevision && activeWorkspace.current.isConnected && !activeWorkspace.current.isLoading && isWorkspaceIdentityCurrent(identity);
    try {
      const run = (repo: WYQDRepositoryAdapter) => compensate(repo, action);
      if (repository.withWriteSession) await repository.withWriteSession(run); else await run(repository);
      if (!stillCurrent()) { showNotice(t('savedInPreviousWorkspace')); return false; }
      // The commit has finished. Refresh failure must not make the user repeat it.
      try { await loadVaultData(); }
      catch {
        const currentWorkspace = stillCurrent();
        showNotice(currentWorkspace ? `${t(success)} ${t('savedRefreshFailed')}` : t('savedInPreviousWorkspace'));
        return currentWorkspace;
      }
      if (stillCurrent()) showNotice(t(success));
      return stillCurrent();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
      throw error;
    } finally { writing.current = false; }
  }

  async function liveObject(repo: WYQDRepositoryAdapter, fileName: string, id: string) {
    const stored = (await repo.listObjects()).find((item) => item.fileName === fileName && item.entity.id === id);
    if (!stored) throw new Error(t('recordUnavailable'));
    return stored;
  }

  async function changeObject(repo: WYQDRepositoryAdapter, stored: WYQDStoredEntity<WYQDObject>, updated: WYQDObject, undo: RegisterUndo) {
    await repo.updateObject(stored.fileName, updated, stored.body);
    undo(() => repo.updateObject(stored.fileName, stored.entity, stored.body));
  }

  async function linkReview(repo: WYQDRepositoryAdapter, review: ReviewEntry, undo: RegisterUndo, requireTarget = false) {
    if (!review.target_id) return;
    const stored = (await repo.listObjects()).find((item) => item.entity.id === review.target_id);
    if (!stored) { if (requireTarget) throw new Error(t('recordUnavailable')); return; }
    const object = stored.entity;
    const updated: WYQDObject = object.object_type === 'one_time_experience' && ['completed', 'reviewed'].includes(object.status)
      ? { ...object, status: 'reviewed', review_ref: review.id, reviewed_at: review.reviewed_at ?? todayLocalISO(), updated_at: todayLocalISO() }
      : { ...object, review_ref: review.id, updated_at: todayLocalISO() };
    await changeObject(repo, stored, updated, undo);
  }

  async function unlinkReview(repo: WYQDRepositoryAdapter, review: ReviewEntry, undo: RegisterUndo) {
    if (!review.target_id) return;
    const stored = (await repo.listObjects()).find((item) => item.entity.id === review.target_id);
    if (!stored || stored.entity.review_ref !== review.id) return;
    const remaining = (await repo.listReviews()).filter((item) => item.entity.id !== review.id && item.entity.target_id === review.target_id)
      .sort((a, b) => (b.entity.reviewed_at ?? b.entity.created_at).localeCompare(a.entity.reviewed_at ?? a.entity.created_at));
    const next = remaining[0]?.entity;
    const object = stored.entity;
    const updated: WYQDObject = object.object_type === 'one_time_experience'
      ? { ...object, review_ref: next?.id ?? null, reviewed_at: next?.reviewed_at ?? null, status: object.status === 'reviewed' && !next ? 'completed' : object.status, updated_at: todayLocalISO() }
      : { ...object, review_ref: next?.id ?? null, updated_at: todayLocalISO() };
    await changeObject(repo, stored, updated, undo);
  }

  async function createObject(object: WYQDObject, body: string) {
    const current = await commit(async (repo) => { await guardCapacity(repo, 'objects'); await repo.saveObject(object, body); }, 'objectSaved');
    if (current) onObjectCreated?.();
  }

  async function updateObject(fileName: string, object: WYQDObject, body: string) {
    await commit(async (repo, undo) => {
      const stored = await liveObject(repo, fileName, object.id);
      const displayed = storedObjects.find((item) => item.fileName === fileName && item.entity.id === object.id);
      if (displayed && (JSON.stringify(displayed.entity) !== JSON.stringify(stored.entity) || displayed.body !== stored.body)) throw new Error(t('recordChanged'));
      await repo.updateObject(fileName, object, body);
      undo(() => repo.updateObject(fileName, stored.entity, stored.body));
      if (stored.entity.title !== object.title || stored.entity.object_type !== object.object_type) {
        for (const review of (await repo.listReviews()).filter((item) => item.entity.target_id === object.id)) {
          await repo.updateReview(review.fileName, { ...review.entity, target: object.title, target_type: object.object_type, updated_at: todayLocalISO() }, review.body);
          undo(() => repo.updateReview(review.fileName, review.entity, review.body));
        }
      }
    }, 'objectUpdated');
  }

  async function archiveObject(fileName: string) { await commit((repo) => repo.archiveObject(fileName), 'objectArchived'); }

  async function createObjectReview(fileName: string, object: WYQDObject, summary: string, rankings: ReviewRankings, body: string) {
    if (object.object_type !== 'one_time_experience') throw new Error(t('objectUpdateFailed'));
    await commit(async (repo, undo) => {
      const stored = await liveObject(repo, fileName, object.id);
      if (stored.entity.object_type !== 'one_time_experience') throw new Error(t('recordUnavailable'));
      const date = todayLocalISO();
      const current = stored.entity;
      const reviews = (await repo.listReviews()).filter((item) => item.entity.target_id === current.id);
      const existing = reviews.find((item) => item.entity.id === current.review_ref) ?? reviews[0];
      if (!existing) await guardCapacity(repo, 'reviews');
      const review: ReviewEntry = {
        ...existing?.entity, schema_version: WYQD_SCHEMA_VERSION,
        id: existing?.entity.id ?? `review_${date.replaceAll('-', '')}_${Date.now()}`,
        type: 'review', review_type: 'object_review', title: `${t('reviewTitlePrefix')} ${current.title}`,
        target: current.title, target_id: current.id, target_type: current.object_type,
        reviewed_at: date, exited_at: current.ended_at || date, exit_type: 'completed',
        realized_experience_cost: calculateExperienceCost(current),
        food_score: rankings.foodScore, scenery_score: rankings.sceneryScore, experience_score: rankings.experienceScore,
        summary, period: date.slice(0, 7), year: Number(date.slice(0, 4)),
        created_at: existing?.entity.created_at ?? date, updated_at: date, currency: current.currency || 'CNY', tags: existing?.entity.tags ?? ['ownly', 'review', 'experience'],
      };
      const score = (value: number | null) => value != null ? t('reviewRankedAt').replace('{rank}', String(value)) : t('reviewUnranked');
      const reviewBody = existing?.body ?? `## ${t('reviewExperienceSection')}\n\n${summary}\n\n## ${t('reviewRankingSection')}\n\n- ${t('reviewFoodRank')}：${score(rankings.foodScore)}\n- ${t('reviewSceneryRank')}：${score(rankings.sceneryScore)}\n- ${t('reviewExperienceRank')}：${score(rankings.experienceScore)}\n\n## ${t('reviewRelatedObjects')}\n\n- ${current.title}\n`;
      if (existing) {
        await repo.updateReview(existing.fileName, review, reviewBody);
        undo(() => repo.updateReview(existing.fileName, existing.entity, existing.body));
      } else {
        const created = await repo.saveReview(review, reviewBody);
        undo(() => repo.archiveReview(created));
      }
      await repo.updateObject(fileName, { ...current, status: 'reviewed', reviewed_at: date, review_ref: review.id, updated_at: date }, stored.body || body);
    }, 'reviewCreated');
  }

  async function createSnapshot(snapshot: AccountSnapshot, body: string) { await commit(async (repo) => { await guardCapacity(repo, 'snapshots'); await repo.saveSnapshot(snapshot, body); }, 'snapshotSaved'); }
  async function updateSnapshot(fileName: string, snapshot: AccountSnapshot, body: string) { await commit((repo) => repo.updateSnapshot(fileName, snapshot, body), 'snapshotUpdated'); }
  async function deleteSnapshot(fileName: string) { await commit((repo) => repo.archiveSnapshot(fileName), 'snapshotArchived'); }

  async function toggleObjectUsageState(objectId: string, nextState: 'in_use' | 'unused') {
    const visible = storedObjects.find((item) => item.entity.id === objectId);
    if (!visible) throw new Error(t('recordUnavailable'));
    await commit(async (repo, undo) => {
      const stored = await liveObject(repo, visible.fileName, objectId);
      if (stored.entity.object_type !== 'physical') throw new Error(t('objectUpdateFailed'));
      const today = todayLocalISO();
      const summary = nextState === 'unused' ? t('usageStateMarkedUnused') : t('usageStateMarkedInUse');
      const updated: PhysicalObject = { ...stored.entity, updated_at: today };
      if (nextState === 'unused') { updated.unused_since = today; delete updated.in_use_since; }
      else { updated.in_use_since = today; delete updated.unused_since; }
      await changeObject(repo, stored, updated, undo);
      const log: ObjectLogEntry = { schema_version: WYQD_SCHEMA_VERSION, id: `log_${today.replaceAll('-', '')}_${Date.now()}`, type: 'object_log', title: `${stored.entity.title} · ${summary}`, target_id: objectId, event_type: 'usage_state', occurred_at: today, summary, source: 'web', created_at: today, updated_at: today };
      await repo.saveObjectLog(log, `## ${t('logEventUsageState')}\n\n${summary}\n`);
    }, 'objectUpdated');
  }

  async function createReview(review: ReviewEntry, body: string) {
    await commit(async (repo, undo) => {
      await guardCapacity(repo, 'reviews');
      const fileName = await repo.saveReview(review, body);
      undo(() => repo.archiveReview(fileName));
      await linkReview(repo, review, undo, true);
    }, 'reviewSaved');
  }

  async function updateReview(fileName: string, review: ReviewEntry, body: string) {
    await commit(async (repo, undo) => {
      const original = (await repo.listReviews()).find((item) => item.fileName === fileName && item.entity.id === review.id);
      if (!original) throw new Error(t('recordUnavailable'));
      await repo.updateReview(fileName, review, body);
      undo(() => repo.updateReview(fileName, original.entity, original.body));
      if (original.entity.target_id !== review.target_id) await unlinkReview(repo, original.entity, undo);
      await linkReview(repo, review, undo, original.entity.target_id !== review.target_id);
    }, 'reviewUpdated');
  }

  async function deleteReview(fileName: string) {
    await commit(async (repo, undo) => {
      const original = (await repo.listReviews()).find((item) => item.fileName === fileName);
      if (!original) throw new Error(t('recordUnavailable'));
      await unlinkReview(repo, original.entity, undo);
      await repo.archiveReview(fileName);
    }, 'reviewArchived');
  }

  async function restoreArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string) {
    await commit(async (repo, undo) => {
      if (archiveType === 'object' || archiveType === 'review' || archiveType === 'snapshot') {
        await guardCapacity(repo, archiveType === 'object' ? 'objects' : archiveType === 'review' ? 'reviews' : 'snapshots');
      }
      const fileName = await repo.restoreArchivedEntity(archiveType, archiveFileName);
      if (archiveType === 'review') {
        const review = (await repo.listReviews()).find((item) => item.fileName === fileName);
        undo(() => repo.archiveReview(fileName));
        if (review) await linkReview(repo, review.entity, undo);
      } else if (archiveType === 'object') {
        undo(() => repo.archiveObject(fileName));
        const stored = (await repo.listObjects()).find((item) => item.fileName === fileName);
        if (!stored) throw new Error(t('recordUnavailable'));
        const reviews = (await repo.listReviews()).filter((item) => item.entity.target_id === stored.entity.id)
          .sort((a, b) => (b.entity.reviewed_at ?? b.entity.created_at).localeCompare(a.entity.reviewed_at ?? a.entity.created_at));
        const review = reviews.find((item) => item.entity.id === stored.entity.review_ref) ?? reviews[0];
        if (review) await linkReview(repo, review.entity, undo);
        else if (stored.entity.review_ref || (stored.entity.object_type === 'one_time_experience' && stored.entity.status === 'reviewed')) {
          const object = stored.entity;
          const updated: WYQDObject = object.object_type === 'one_time_experience'
            ? { ...object, status: object.status === 'reviewed' ? 'completed' : object.status, review_ref: null, reviewed_at: null }
            : { ...object, review_ref: null };
          await changeObject(repo, stored, updated, undo);
        }
      }
    }, 'archivedRestored');
  }
  async function permanentlyDeleteArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string) {
    await commit((repo) => repo.permanentlyDeleteArchivedEntity(archiveType, archiveFileName), 'permanentlyDeleted');
  }

  return { createObject, updateObject, archiveObject, createObjectReview, toggleObjectUsageState, createSnapshot, updateSnapshot, deleteSnapshot, createReview, updateReview, deleteReview, restoreArchivedEntity, permanentlyDeleteArchivedEntity };
}
