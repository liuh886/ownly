import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { useI18n } from '@/core/i18n-context';
import type { WYQDObject, AccountSnapshot, ReviewEntry } from '@/domain/types';
import type { WYQDStoredEntity, WYQDArchiveEntityType } from '@/core/repository';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';

interface ReviewRankings {
  foodScore: number | null;
  sceneryScore: number | null;
  experienceScore: number | null;
}

export function useOwnlyActions(
  loadVaultData: () => Promise<void>,
  storedObjects: WYQDStoredEntity<WYQDObject>[]
) {
  const { t } = useI18n();
  const { repository, showNotice } = useOwnlyWorkspace();

  async function createObject(object: WYQDObject, body: string) {
    try {
      await repository.saveObject(object, body);
      await loadVaultData();
      showNotice(t('objectSaved'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('objectSaveFailed'));
      throw event;
    }
  }

  async function updateObject(fileName: string, object: WYQDObject, body: string) {
    try {
      await repository.updateObject(fileName, object, body);
      await loadVaultData();
      showNotice(t('objectUpdated'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('objectUpdateFailed'));
      throw event;
    }
  }

  async function archiveObject(fileName: string) {
    try {
      await repository.archiveObject(fileName);
      await loadVaultData();
      showNotice(t('objectArchived'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('objectArchiveFailed'));
      throw event;
    }
  }

  async function createObjectReview(
    fileName: string,
    object: WYQDObject,
    summary: string,
    rankings: ReviewRankings,
    body: string,
  ) {
    if (object.object_type !== 'one_time_experience') return;

    const date = new Date().toISOString().split('T')[0];
    const review: ReviewEntry = {
      schema_version: WYQD_SCHEMA_VERSION,
      id: `review_${date.replaceAll('-', '')}_${Date.now()}`,
      type: 'review',
      review_type: 'object_review',
      title: `${t('reviewTitlePrefix')} ${object.title}`,
      target: object.title,
      target_id: object.id,
      target_type: object.object_type,
      reviewed_at: date,
      exited_at: object.ended_at || date,
      exit_type: 'completed',
      realized_experience_cost: object.actual_total || object.budget_total || 0,
      food_score: rankings.foodScore,
      scenery_score: rankings.sceneryScore,
      experience_score: rankings.experienceScore,
      summary,
      period: date.slice(0, 7),
      year: Number(date.slice(0, 4)),
      created_at: date,
      updated_at: date,
      currency: object.currency || 'CNY',
      tags: ['ownly', 'review', 'experience'],
    };

    const scoredLabel = (score: number | null | undefined) =>
      score ? t('reviewRankedAt').replace('{rank}', String(score)) : t('reviewUnranked');
    const reviewBody = `## ${t('reviewExperienceSection')}\n\n${summary}\n\n## ${t('reviewRankingSection')}\n\n- ${t('reviewFoodRank')}：${scoredLabel(rankings.foodScore)}\n- ${t('reviewSceneryRank')}：${scoredLabel(rankings.sceneryScore)}\n- ${t('reviewExperienceRank')}：${scoredLabel(rankings.experienceScore)}\n\n## ${t('reviewRelatedObjects')}\n\n- ${object.title}\n`;

    const updatedObject: WYQDObject = {
      ...object,
      status: 'reviewed',
      reviewed_at: date,
      review_ref: review.id,
      updated_at: date,
    };

    await repository.saveReview(review, reviewBody);
    await repository.updateObject(fileName, updatedObject, body);
    await loadVaultData();
    showNotice(t('reviewCreated'));
  }

  async function createSnapshot(snapshot: AccountSnapshot, body: string) {
    try {
      await repository.saveSnapshot(snapshot, body);
      await loadVaultData();
      showNotice(t('snapshotSaved'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('snapshotSaveFailed'));
      throw event;
    }
  }

  async function updateSnapshot(fileName: string, snapshot: AccountSnapshot, body: string) {
    try {
      await repository.updateSnapshot(fileName, snapshot, body);
      await loadVaultData();
      showNotice(t('snapshotUpdated'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('snapshotUpdateFailed'));
      throw event;
    }
  }

  async function deleteSnapshot(fileName: string) {
    try {
      await repository.archiveSnapshot(fileName);
      await loadVaultData();
      showNotice(t('snapshotArchived'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('snapshotArchiveFailed'));
      throw event;
    }
  }

  async function createReview(review: ReviewEntry, body: string) {
    try {
      await repository.saveReview(review, body);

      if (review.target_id) {
        const targetStored = storedObjects.find((stored) => stored.entity.id === review.target_id);
        if (targetStored && targetStored.entity.status === 'completed') {
          const updatedObject: WYQDObject = {
            ...targetStored.entity,
            status: 'reviewed',
            reviewed_at: review.reviewed_at || new Date().toISOString().split('T')[0],
            review_ref: review.id,
            updated_at: new Date().toISOString().split('T')[0],
          };
          await repository.updateObject(targetStored.fileName, updatedObject, targetStored.body);
        }
      }

      await loadVaultData();
      showNotice(t('reviewSaved'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('reviewSaveFailed'));
      throw event;
    }
  }

  async function updateReview(fileName: string, review: ReviewEntry, body: string) {
    try {
      await repository.updateReview(fileName, review, body);
      await loadVaultData();
      showNotice(t('reviewUpdated'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('reviewUpdateFailed'));
      throw event;
    }
  }

  async function deleteReview(fileName: string) {
    try {
      await repository.archiveReview(fileName);
      await loadVaultData();
      showNotice(t('reviewArchived'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('reviewArchiveFailed'));
      throw event;
    }
  }

  async function restoreArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string) {
    try {
      await repository.restoreArchivedEntity(archiveType, archiveFileName);
      await loadVaultData();
      showNotice(t('archivedRestored'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('archivedRestoreFailed'));
      throw event;
    }
  }

  async function permanentlyDeleteArchivedEntity(archiveType: WYQDArchiveEntityType, archiveFileName: string) {
    try {
      await repository.permanentlyDeleteArchivedEntity(archiveType, archiveFileName);
      await loadVaultData();
      showNotice(t('permanentlyDeleted'));
    } catch (event) {
      showNotice(event instanceof Error ? event.message : t('permanentlyDeleteFailed'));
      throw event;
    }
  }

  return {
    createObject,
    updateObject,
    archiveObject,
    createObjectReview,
    createSnapshot,
    updateSnapshot,
    deleteSnapshot,
    createReview,
    updateReview,
    deleteReview,
    restoreArchivedEntity,
    permanentlyDeleteArchivedEntity,
  };
}
