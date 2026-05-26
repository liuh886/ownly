'use client';

import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';
import type { ReviewEntry, WYQDObject, WYQDObjectType } from '@/domain/types';
import type { StoredEntity } from '@/services/MarkdownEntityRepository';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function formatMoney(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function getExperienceAmount(object: WYQDObject): number {
  if (object.object_type !== 'one_time_experience') return 0;
  return object.actual_total || object.budget_total || 0;
}

function parseRank(value: string): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1) return null;
  return Math.floor(numberValue);
}

function hasRanking(review: ReviewEntry): boolean {
  return Boolean(review.food_rank || review.scenery_rank || review.experience_rank);
}

function createReviewDraft(
  summary: string,
  foodRank: string,
  sceneryRank: string,
  experienceRank: string,
  target?: { id: string; title: string; type?: WYQDObjectType },
  t?: (key: WYQDTranslationKey) => string,
): ReviewEntry {
  const date = todayISO();

  return {
    schema_version: '0.1',
    id: `review_${date.replaceAll('-', '')}_${Date.now()}`,
    type: 'review',
    review_type: target ? 'object_review' : 'monthly',
    title: target
      ? `${(t && t('reviewAction')) || '复盘'} ${target.title}`
      : `${(t && t('reviewAction')) || '复盘'} ${date}`,
    reviewed_at: date,
    summary,
    target: target?.title,
    target_id: target?.id,
    target_type: target?.type,
    food_rank: parseRank(foodRank),
    scenery_rank: parseRank(sceneryRank),
    experience_rank: parseRank(experienceRank),
    period: date.slice(0, 7),
    year: Number(date.slice(0, 4)),
    created_at: date,
    updated_at: date,
    currency: 'CNY',
    tags: ['ownly', 'review'],
  };
}

export function ReviewHome({
  disabled,
  objects,
  reviews,
  onCreateReview,
  onUpdateReview,
  onDeleteReview,
}: {
  disabled?: boolean;
  objects: WYQDObject[];
  reviews: StoredEntity<ReviewEntry>[];
  onCreateReview: (review: ReviewEntry, body: string) => Promise<void>;
  onUpdateReview: (fileName: string, review: ReviewEntry, body: string) => Promise<void>;
  onDeleteReview: (fileName: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [summary, setSummary] = useState('');
  const [foodRank, setFoodRank] = useState('');
  const [sceneryRank, setSceneryRank] = useState('');
  const [experienceRank, setExperienceRank] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [selectedReviewFileName, setSelectedReviewFileName] = useState<string | null>(null);
  const [reviewQuery, setReviewQuery] = useState('');
  const [reviewTypeFilter, setReviewTypeFilter] = useState<'all' | ReviewEntry['review_type']>(
    'all',
  );
  const [reviewingExperienceId, setReviewingExperienceId] = useState<string | null>(null);
  const reviewFormRef = useRef<HTMLFormElement>(null);
  const reviewDetailRef = useRef<HTMLElement>(null);
  const fieldClass =
    'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400';
  const exitedItems = objects.filter((object) =>
    ['idle', 'transferred', 'discarded', 'paused', 'cancelled', 'completed', 'reviewed'].includes(
      object.status,
    ),
  );
  const experiences = objects.filter((object) => object.object_type === 'one_time_experience');
  const experienceTotal = experiences.reduce(
    (total, object) => total + getExperienceAmount(object),
    0,
  );
  const reviewedTargetIds = new Set(
    reviews
      .map((stored) => stored.entity.target_id)
      .filter((targetId): targetId is string => Boolean(targetId)),
  );
  const pendingReviewExperiences = experiences.filter(
    (object) =>
      object.status === 'completed' && !object.review_ref && !reviewedTargetIds.has(object.id),
  );
  const reviewedExperiences = experiences.filter(
    (object) =>
      object.status === 'reviewed' || Boolean(object.review_ref) || reviewedTargetIds.has(object.id),
  );
  const latestReviews = useMemo(
    () =>
      [...reviews].sort((a, b) =>
        (b.entity.reviewed_at || '').localeCompare(a.entity.reviewed_at || ''),
      ),
    [reviews],
  );
  const rankedReviewCount = reviews.filter((stored) => hasRanking(stored.entity)).length;

  function getStatusLabel(object: WYQDObject): string {
    const labels: Record<string, string> = {
      planned: t('statusPlanned'),
      in_progress: t('statusInProgress'),
      completed: t('statusCompleted'),
      reviewed: t('statusReviewed'),
      seeded: t('statusSeeded'),
      observing: t('statusObserving'),
      purchased: t('statusPurchased'),
      using: t('statusUsing'),
      idle: t('statusIdle'),
      transferred: t('statusTransferred'),
      discarded: t('statusDiscarded'),
      active: t('statusActive'),
      paused: t('statusPaused'),
      cancelled: t('statusCancelled'),
    };

    return labels[object.status] || object.status;
  }

  function getReviewTypeLabel(type: ReviewEntry['review_type']): string {
    const labels: Record<ReviewEntry['review_type'], string> = {
      object_review: t('filterObjectReview'),
      exit_record: t('filterExitRecord'),
      monthly: t('filterMonthly'),
      annual: t('filterAnnual'),
    };

    return labels[type] || type;
  }

  function getExitTypeLabel(type?: ReviewEntry['exit_type']): string {
    if (!type) return t('notRecorded');
    const labels: Record<NonNullable<ReviewEntry['exit_type']>, string> = {
      idle: t('retire'),
      transferred: t('statusTransferred'),
      discarded: t('statusDiscarded'),
      paused: t('statusPaused'),
      cancelled: t('cancel'),
      completed: t('complete'),
    };

    return labels[type] || type;
  }

  function getRankingItems(review: ReviewEntry): string[] {
    return [
      review.food_rank ? `${t('foodRank')} #${review.food_rank}` : null,
      review.scenery_rank ? `${t('sceneryRank')} #${review.scenery_rank}` : null,
      review.experience_rank ? `${t('experienceRank')} #${review.experience_rank}` : null,
    ].filter((item): item is string => Boolean(item));
  }

  const rankingBoardSuffix = t('rankingBoard').replace('{label}', '');

  const rankingBoards = useMemo(() => {
    const rankingDimensions: Array<{
      key: 'food_rank' | 'scenery_rank' | 'experience_rank';
      label: string;
    }> = [
      { key: 'food_rank', label: t('foodRank') },
      { key: 'scenery_rank', label: t('sceneryRank') },
      { key: 'experience_rank', label: t('experienceRank') },
    ];

    return (
      rankingDimensions.map((dimension) => ({
        ...dimension,
        entries: reviews
          .filter((stored) => stored.entity[dimension.key])
          .sort(
            (a, b) => (a.entity[dimension.key] || 9999) - (b.entity[dimension.key] || 9999),
          )
          .slice(0, 3),
      }))
    );
  }, [reviews, t]);

  const objectById = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const filteredReviews = useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();

    return latestReviews.filter((stored) => {
      if (reviewTypeFilter !== 'all' && stored.entity.review_type !== reviewTypeFilter) {
        return false;
      }
      if (!query) return true;

      const haystack = [
        stored.entity.title,
        stored.entity.target,
        stored.entity.summary,
        stored.entity.review_type,
        stored.entity.exit_type,
        stored.entity.period,
        stored.body,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [latestReviews, reviewQuery, reviewTypeFilter]);
  const selectedReview =
    latestReviews.find((stored) => stored.fileName === selectedReviewFileName) ||
    filteredReviews[0] ||
    null;
  const selectedReviewTarget =
    selectedReview?.entity.target_id ? objectById.get(selectedReview.entity.target_id) : null;
  const canSubmit = !disabled && summary.trim().length > 0 && !isSaving;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    try {
      const editing = editingFileName
        ? reviews.find((stored) => stored.fileName === editingFileName)
        : null;
      const reviewTarget = reviewingExperienceId
        ? (() => {
            const exp = objects.find((o) => o.id === reviewingExperienceId);
            return exp ? { id: exp.id, title: exp.title, type: exp.object_type } : undefined;
          })()
        : undefined;
      const draft = createReviewDraft(summary.trim(), foodRank, sceneryRank, experienceRank, reviewTarget, t);
      const review = editing
        ? {
            ...editing.entity,
            summary: draft.summary,
            food_rank: draft.food_rank,
            scenery_rank: draft.scenery_rank,
            experience_rank: draft.experience_rank,
            updated_at: todayISO(),
          }
        : draft;

      if (editing) {
        await onUpdateReview(editing.fileName, review, editing.body);
      } else {
        const rankLabel = (rank: number | null | undefined) =>
          rank ? t('rankPosition').replace('{rank}', String(rank)) : t('notRanked');
        await onCreateReview(
          review,
          `## ${t('reviewAction')}\n\n${summary.trim()}\n\n## ${t('rankings')}\n\n- ${t('foodRank')}：${rankLabel(review.food_rank)}\n- ${t('sceneryRank')}：${rankLabel(review.scenery_rank)}\n- ${t('experienceRank')}：${rankLabel(review.experience_rank)}\n\n## ${t('nextSteps')}\n\n`,
        );
      }
      setSummary('');
      setFoodRank('');
      setSceneryRank('');
      setExperienceRank('');
      setEditingFileName(null);
      setReviewingExperienceId(null);
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingReview(stored: StoredEntity<ReviewEntry>) {
    setEditingFileName(stored.fileName);
    setSummary(stored.entity.summary || '');
    setFoodRank(stored.entity.food_rank ? String(stored.entity.food_rank) : '');
    setSceneryRank(stored.entity.scenery_rank ? String(stored.entity.scenery_rank) : '');
    setExperienceRank(
      stored.entity.experience_rank ? String(stored.entity.experience_rank) : '',
    );
    setTimeout(() => reviewFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function cancelEditing() {
    setEditingFileName(null);
    setSummary('');
    setFoodRank('');
    setSceneryRank('');
    setExperienceRank('');
    setReviewingExperienceId(null);
  }

  function startExperienceReview(experience: WYQDObject) {
    cancelEditing();
    setReviewingExperienceId(experience.id);
    setSummary(t('reviewAbout').replace('{title}', experience.title));
    setTimeout(() => reviewFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function selectReview(fileName: string) {
    setSelectedReviewFileName(fileName);
    setTimeout(() => reviewDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-950">{t('reviewConsole')}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {t('reviewConsoleDesc')}
            </p>
          </div>
          <span className="w-fit rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {t('reviewCount').replace('{count}', String(reviews.length))}
          </span>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-stone-200 bg-stone-950 px-3 py-3 text-white">
            <div className="text-xs font-medium text-stone-300">{t('experienceCost')}</div>
            <div className="mt-2 font-mono text-xl font-semibold tracking-tight">
              {formatMoney(experienceTotal)}
            </div>
            <div className="mt-1 text-xs text-stone-400">
              {t('oneTimeExperienceN').replace('{count}', String(experiences.length))}
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-xs font-medium text-stone-500">{t('pendingReview')}</div>
            <div className="mt-2 font-mono text-xl font-semibold text-stone-950">
              {pendingReviewExperiences.length}
            </div>
            <div className="mt-1 text-xs text-stone-500">{t('completedNotCrystallized')}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-xs font-medium text-stone-500">{t('crystallized')}</div>
            <div className="mt-2 font-mono text-xl font-semibold text-stone-950">
              {reviewedExperiences.length}
            </div>
            <div className="mt-1 text-xs text-stone-500">{t('formedExperienceAsset')}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-xs font-medium text-stone-500">{t('rankings')}</div>
            <div className="mt-2 font-mono text-xl font-semibold text-stone-950">
              {rankedReviewCount}
            </div>
            <div className="mt-1 text-xs text-stone-500">{t('foodSceneryExperienceRankings')}</div>
          </div>
        </div>

        <div className="mt-5 border-t border-stone-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-stone-950">{t('reviewQueue')}</h3>
            <span className="text-xs text-stone-400">
              {t('exitedCompletedObjects').replace('{count}', String(exitedItems.length))}
            </span>
          </div>
          {pendingReviewExperiences.length > 0 ? (
            <div className="mt-3 divide-y divide-stone-100">
              {pendingReviewExperiences.slice(0, 4).map((experience) => (
                <div
                  key={experience.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-950">
                      {experience.title}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {getStatusLabel(experience)} · {formatMoney(getExperienceAmount(experience))}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                    {t('pendingReviewBadge')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-500">
              {t('noPendingReviews')}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {rankingBoards.map((board) => (
          <section key={board.key} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-stone-950">
                {board.label}{rankingBoardSuffix}
              </h2>
              <span className="text-xs text-stone-400">Top {board.entries.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {board.entries.map((stored) => (
                <button
                  key={`${board.key}-${stored.fileName}`}
                  type="button"
                  onClick={() => selectReview(stored.fileName)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-left transition hover:border-stone-300 hover:bg-white"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-950">
                      {stored.entity.target || stored.entity.title}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-stone-500">
                      {stored.entity.reviewed_at || stored.entity.created_at}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold text-stone-950">
                    #{stored.entity[board.key]}
                  </span>
                </button>
              ))}
              {board.entries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-5 text-center text-xs text-stone-500">
                  {t('noRankings')}
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <form ref={reviewFormRef} onSubmit={handleSubmit} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm shadow-stone-200/40 sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-stone-950">
            {editingFileName ? t('editReview') : reviewingExperienceId ? t('experienceReview') : t('reviewShorthand')}
          </h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {t('reviewShorthandDesc')}
          </p>
        </div>
        <div className="space-y-3">
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder={t('reviewSummaryPlaceholder')}
            rows={4}
            aria-label={t('summary')}
            className={`${fieldClass} resize-none`}
            disabled={disabled || isSaving}
          />
          <div>
            <div className="mb-1.5 text-xs font-medium text-stone-500">{t('rankingLabel')}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="sr-only">{t('foodRank')}</span>
                <input
                  value={foodRank}
                  onChange={(event) => setFoodRank(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder={`${t('foodRank')}, 1`}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block">
                <span className="sr-only">{t('sceneryRank')}</span>
                <input
                  value={sceneryRank}
                  onChange={(event) => setSceneryRank(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder={`${t('sceneryRank')}, 3`}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block">
                <span className="sr-only">{t('experienceRank')}</span>
                <input
                  value={experienceRank}
                  onChange={(event) => setExperienceRank(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder={`${t('experienceRank')}, 2`}
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            {editingFileName || reviewingExperienceId ? (
              <button
                type="button"
                onClick={cancelEditing}
                className="w-24 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
                disabled={isSaving}
              >
                {t('cancel')}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-w-0 flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {disabled
                ? t('connectVaultToWrite')
                : isSaving
                  ? t('saving')
                  : editingFileName
                    ? t('saveChanges')
                    : t('saveReview')}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-stone-950">{t('seeWorld')}</h2>
          <span className="text-xs text-stone-400">{t('seeWorldDesc')}</span>
        </div>
        <div className="mt-3 space-y-3">
          {experiences.length === 0 ? (
            <p className="text-sm text-stone-500">{t('noExperiencesYet')}</p>
          ) : (
            experiences.map((experience) => {
              const isAlreadyReviewed = Boolean(
                experience.review_ref ||
                reviewedTargetIds.has(experience.id),
              );
              const canStartReview = !isAlreadyReviewed;
              return (
              <div
                key={experience.id}
                className={`flex justify-between gap-3 border-t border-stone-100 pt-3 ${canStartReview ? 'cursor-pointer rounded-lg hover:bg-stone-50 -mx-2 px-2' : ''}`}
                onClick={canStartReview ? () => startExperienceReview(experience) : undefined}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-stone-950">
                    {experience.title}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-400">
                    <span>{getStatusLabel(experience)}</span>
                    {canStartReview ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">{t('pendingReviewBadge')}</span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-stone-950">
                  {formatMoney(getExperienceAmount(experience))}
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-stone-950">{t('reviewHistory')}</h2>
          <span className="text-xs text-stone-400">
            {filteredReviews.length}/{latestReviews.length}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <input
            value={reviewQuery}
            onChange={(event) => setReviewQuery(event.target.value)}
            placeholder={t('searchReviews')}
            aria-label={t('searchReviews')}
            className={fieldClass}
          />
          <select
            value={reviewTypeFilter}
            onChange={(event) =>
              setReviewTypeFilter(event.target.value as 'all' | ReviewEntry['review_type'])
            }
            aria-label={t('searchReviews')}
            className={fieldClass}
          >
            <option value="all">{t('filterAllTypes')}</option>
            <option value="object_review">{t('filterObjectReview')}</option>
            <option value="exit_record">{t('filterExitRecord')}</option>
            <option value="monthly">{t('filterMonthly')}</option>
            <option value="annual">{t('filterAnnual')}</option>
          </select>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div className="space-y-3">
            {filteredReviews.map((stored) => (
              <div
                key={stored.entity.id}
                className={`border-t pt-3 ${
                  selectedReview?.fileName === stored.fileName
                    ? 'border-stone-300'
                    : 'border-stone-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-950">
                      {stored.entity.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-stone-400">
                      <span>{stored.entity.reviewed_at || stored.entity.created_at}</span>
                      <span>{getReviewTypeLabel(stored.entity.review_type)}</span>
                      {stored.entity.target ? <span>{stored.entity.target}</span> : null}
                    </div>
                  </div>
                  {getRankingItems(stored.entity).length > 0 ? (
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {getRankingItems(stored.entity).map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {stored.entity.summary ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">
                    {stored.entity.summary}
                  </p>
                ) : null}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => selectReview(stored.fileName)}
                    className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 active:scale-95"
                  >
                    {t('detail')}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditingReview(stored)}
                    className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-300 disabled:hover:border-stone-100 disabled:hover:text-stone-300"
                    disabled={disabled || isSaving}
                  >
                    {t('edit')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = window.confirm(t('deleteConfirm').replace('{title}', stored.entity.title));
                      if (!confirmed) return;
                      setDeletingFileName(stored.fileName);
                      try {
                        await onDeleteReview(stored.fileName);
                        if (editingFileName === stored.fileName) cancelEditing();
                        if (selectedReviewFileName === stored.fileName) {
                          setSelectedReviewFileName(null);
                        }
                      } finally {
                        setDeletingFileName(null);
                      }
                    }}
                    className="rounded-md border border-red-100 bg-white px-2 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-600 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-300 disabled:hover:border-stone-100"
                    disabled={disabled || deletingFileName === stored.fileName}
                  >
                    {deletingFileName === stored.fileName ? t('saving') : t('delete')}
                  </button>
                </div>
              </div>
            ))}
            {filteredReviews.length === 0 ? (
              <p className="text-sm text-stone-500">{t('noMatchingReviews')}</p>
            ) : null}
          </div>

          <aside ref={reviewDetailRef} className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            {selectedReview ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-stone-400">{t('reviewDetail')}</div>
                  <h3 className="mt-1 break-words text-base font-semibold text-stone-950">
                    {selectedReview.entity.title}
                  </h3>
                  <p className="mt-1 break-all text-xs text-stone-400">
                    {selectedReview.fileName}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-stone-400">{t('type')}</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {getReviewTypeLabel(selectedReview.entity.review_type)}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400">{t('date')}</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {selectedReview.entity.reviewed_at || selectedReview.entity.created_at}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400">{t('exitType')}</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {getExitTypeLabel(selectedReview.entity.exit_type)}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400">{t('experienceCost')}</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {selectedReview.entity.realized_experience_cost
                        ? formatMoney(selectedReview.entity.realized_experience_cost)
                        : t('notRecorded')}
                    </div>
                  </div>
                </div>
                {getRankingItems(selectedReview.entity).length > 0 ? (
                  <div className="rounded-md bg-white p-3 text-xs">
                    <div className="text-stone-400">{t('rankings')}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {getRankingItems(selectedReview.entity).map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-stone-100 px-2 py-1 font-medium text-stone-700"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedReview.entity.target ? (
                  <div className="rounded-md bg-white p-3 text-xs">
                    <div className="text-stone-400">{t('relatedObject')}</div>
                    <div className="mt-1 font-medium text-stone-900">
                      {selectedReview.entity.target}
                    </div>
                    {selectedReviewTarget ? (
                      <div className="mt-1 text-stone-500">
                        {getStatusLabel(selectedReviewTarget)}
                        {selectedReviewTarget.object_type ? ` · ${selectedReviewTarget.object_type}` : ''}
                      </div>
                    ) : selectedReview.entity.target_id ? (
                      <div className="mt-1 break-all text-stone-400">
                        {selectedReview.entity.target_id}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedReview.entity.summary ? (
                  <div>
                    <div className="text-xs text-stone-400">{t('summary')}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                      {selectedReview.entity.summary}
                    </p>
                  </div>
                ) : null}
                {selectedReview.body.trim() ? (
                  <div>
                    <div className="text-xs text-stone-400">{t('markdownBodyLabel')}</div>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-stone-600">
                      {selectedReview.body.trim()}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-stone-500">{t('selectReviewToView')}</p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
