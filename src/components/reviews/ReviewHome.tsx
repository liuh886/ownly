'use client';

import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import type { WYQDTranslationKey } from '@/core/i18n';
import type { ReviewEntry, WYQDObject, WYQDObjectType } from '@/domain/types';
import type { WYQDStoredEntity } from '@/core/repository';
import type { WYQDMembershipState } from '@/core/membership';
import { parseScore, todayISO } from '@/lib/format';
import { useFormatMoney } from '@/lib/use-format';
import { TravelInsightsPanel } from '@/components/travel/TravelInsightsPanel';
import { FIELD_CLASS, CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';

function getExperienceAmount(object: WYQDObject): number {
  if (object.object_type !== 'one_time_experience') return 0;
  return object.actual_total || object.budget_total || 0;
}

function hasScore(review: ReviewEntry): boolean {
  return Boolean(review.food_score || review.scenery_score || review.experience_score);
}

function createReviewDraft(
  summary: string,
  foodScore: string,
  sceneryScore: string,
  experienceScore: string,
  target?: { id: string; title: string; type?: WYQDObjectType },
  t?: (key: WYQDTranslationKey) => string,
): ReviewEntry {
  const date = todayISO();

  return {
    schema_version: WYQD_SCHEMA_VERSION,
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
    food_score: parseScore(foodScore),
    scenery_score: parseScore(sceneryScore),
    experience_score: parseScore(experienceScore),
    period: date.slice(0, 7),
    year: Number(date.slice(0, 4)),
    created_at: date,
    updated_at: date,
    currency: 'CNY',
    tags: ['ownly', 'review'],
  };
}

function ReviewDetailSidebar({
  stored,
  target,
  isEditing,
  disabled,
  onStartEdit,
  onCancelEdit,
  onSaveAll,
  editSummary,
  onEditSummaryChange,
  editFoodScore,
  onEditFoodScoreChange,
  editSceneryScore,
  onEditSceneryScoreChange,
  editExperienceScore,
  onEditExperienceScoreChange,
  canSubmit,
  t,
  formatMoney,
  getReviewTypeLabel,
  getExitTypeLabel,
  getScoreItems,
  getStatusLabel,
}: {
  stored: WYQDStoredEntity<ReviewEntry>;
  target: WYQDObject | undefined;
  isEditing: boolean;
  disabled: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveAll: (body: string) => Promise<void>;
  editSummary: string;
  onEditSummaryChange: (v: string) => void;
  editFoodScore: string;
  onEditFoodScoreChange: (v: string) => void;
  editSceneryScore: string;
  onEditSceneryScoreChange: (v: string) => void;
  editExperienceScore: string;
  onEditExperienceScoreChange: (v: string) => void;
  canSubmit: boolean;
  t: (key: WYQDTranslationKey) => string;
  formatMoney: (v: number) => string;
  getReviewTypeLabel: (type: ReviewEntry['review_type']) => string;
  getExitTypeLabel: (type?: ReviewEntry['exit_type']) => string;
  getScoreItems: (review: ReviewEntry) => string[];
  getStatusLabel: (obj: WYQDObject) => string;
}) {
  const review = stored.entity;
  const [bodyDraft, setBodyDraft] = useState('');
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Enter edit mode: initialize body draft
  const handleStartEdit = () => {
    setBodyDraft(stored.body.trim());
    onStartEdit();
  };

  // Save both structured fields and body
  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      await onSaveAll(bodyDraft);
    } finally {
      setIsSavingAll(false);
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs text-stone-400">{t('editReview')}</div>
          <h3 className="mt-1 break-words text-base font-semibold text-stone-950">{review.title}</h3>
        </div>

        {/* Structured fields */}
        <div>
          <label className="text-xs text-stone-400">{t('summary')}</label>
          <textarea
            value={editSummary}
            onChange={(e) => onEditSummaryChange(e.target.value)}
            placeholder={t('reviewSummaryPlaceholder')}
            rows={3}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 resize-none"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs text-stone-400">{t('rankings')}</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input value={editFoodScore} onChange={(e) => onEditFoodScoreChange(e.target.value)} type="number" min="0" max="100" inputMode="numeric" placeholder={t('foodRank')} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50" disabled={disabled} />
            <input value={editSceneryScore} onChange={(e) => onEditSceneryScoreChange(e.target.value)} type="number" min="0" max="100" inputMode="numeric" placeholder={t('sceneryRank')} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50" disabled={disabled} />
            <input value={editExperienceScore} onChange={(e) => onEditExperienceScoreChange(e.target.value)} type="number" min="0" max="100" inputMode="numeric" placeholder={t('experienceRank')} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50" disabled={disabled} />
          </div>
        </div>

        {/* Markdown body */}
        <div className="border-t border-stone-200 pt-4">
          <label className="text-xs text-stone-400">{t('markdownBodyLabel')}</label>
          <textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs leading-5 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 resize-none font-mono"
            disabled={disabled || isSavingAll}
          />
        </div>

        {/* Save / Cancel */}
        <div className="flex gap-2">
          <button type="button" onClick={onCancelEdit} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-400" disabled={isSavingAll}>{t('cancel')}</button>
          <button type="button" onClick={() => void handleSaveAll()} disabled={!canSubmit || isSavingAll} className="flex-1 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300">
            {isSavingAll ? t('saving') : t('saveChanges')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Edit button */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-stone-400">{t('reviewDetail')}</div>
          <h3 className="mt-1 break-words text-base font-semibold text-stone-950">{review.title}</h3>
          <p className="mt-1 break-all text-xs text-stone-400">{stored.fileName}</p>
        </div>
        <button
          type="button"
          onClick={handleStartEdit}
          className="h-9 shrink-0 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800"
          disabled={disabled}
        >
          {t('edit')}
        </button>
      </div>

      {/* Structured fields */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-stone-400">{t('type')}</div>
          <div className="mt-1 font-medium text-stone-800">{getReviewTypeLabel(review.review_type)}</div>
        </div>
        <div>
          <div className="text-stone-400">{t('date')}</div>
          <div className="mt-1 font-medium text-stone-800">{review.reviewed_at || review.created_at}</div>
        </div>
        <div>
          <div className="text-stone-400">{t('exitType')}</div>
          <div className="mt-1 font-medium text-stone-800">{getExitTypeLabel(review.exit_type)}</div>
        </div>
        <div>
          <div className="text-stone-400">{t('experienceCost')}</div>
          <div className="mt-1 font-medium text-stone-800">
            {review.realized_experience_cost ? formatMoney(review.realized_experience_cost) : t('notRecorded')}
          </div>
        </div>
      </div>

      {/* Scores */}
      {getScoreItems(review).length > 0 ? (
        <div className="rounded-md bg-white p-3 text-xs">
          <div className="text-stone-400">{t('rankings')}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {getScoreItems(review).map((item) => (
              <span key={item} className="rounded-full bg-stone-100 px-2 py-1 font-medium text-stone-700">{item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Related object */}
      {review.target ? (
        <div className="rounded-md bg-white p-3 text-xs">
          <div className="text-stone-400">{t('relatedObject')}</div>
          <div className="mt-1 font-medium text-stone-900">{review.target}</div>
          {target ? (
            <div className="mt-1 text-stone-500">
              {getStatusLabel(target)}
              {target.object_type ? ` · ${target.object_type}` : ''}
            </div>
          ) : review.target_id ? (
            <div className="mt-1 break-all text-stone-400">{review.target_id}</div>
          ) : null}
        </div>
      ) : null}

      {/* Summary */}
      {review.summary ? (
        <div>
          <div className="text-xs text-stone-400">{t('summary')}</div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{review.summary}</p>
        </div>
      ) : null}

      {/* Markdown body — read only */}
      <div className="border-t border-stone-200 pt-4">
        <div className="text-xs text-stone-400">{t('markdownBodyLabel')}</div>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-stone-600">
          {stored.body.trim() || t('noBody')}
        </pre>
      </div>
    </div>
  );
}

export function ReviewHome({
  disabled,
  objects,
  reviews,
  membership,
  onCreateReview,
  onUpdateReview,
  onDeleteReview,
}: {
  disabled?: boolean;
  objects: WYQDObject[];
  reviews: WYQDStoredEntity<ReviewEntry>[];
  membership: WYQDMembershipState;
  onCreateReview: (review: ReviewEntry, body: string) => Promise<void>;
  onUpdateReview: (fileName: string, review: ReviewEntry, body: string) => Promise<void>;
  onDeleteReview: (fileName: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { formatMoney } = useFormatMoney();
  const [summary, setSummary] = useState('');
  const [foodScore, setFoodScore] = useState('');
  const [sceneryScore, setSceneryScore] = useState('');
  const [experienceScore, setExperienceScore] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [selectedReviewFileName, setSelectedReviewFileName] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [reviewQuery, setReviewQuery] = useState('');
  const [reviewTypeFilter, setReviewTypeFilter] = useState<'all' | ReviewEntry['review_type']>(
    'all',
  );
  const [reviewingExperienceId, setReviewingExperienceId] = useState<string | null>(null);
  const reviewFormRef = useRef<HTMLFormElement>(null);
  const reviewDetailRef = useRef<HTMLElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const fieldClass = FIELD_CLASS;
  const experiences = useMemo(
    () => objects.filter((object) => object.object_type === 'one_time_experience'),
    [objects],
  );
  const experienceTotal = experiences.reduce(
    (total, object) => total + getExperienceAmount(object),
    0,
  );
  const reviewedTargetIds = useMemo(
    () =>
      new Set(
        reviews
          .map((stored) => stored.entity.target_id)
          .filter((targetId): targetId is string => Boolean(targetId)),
      ),
    [reviews],
  );
  const pendingReviewExperiences = useMemo(
    () =>
      experiences.filter(
        (object) =>
          object.status === 'completed' && !object.review_ref && !reviewedTargetIds.has(object.id),
      ),
    [experiences, reviewedTargetIds],
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
  const rankedReviewCount = reviews.filter((stored) => hasScore(stored.entity)).length;

  // Unified list: pending experiences + reviewed items
  type UnifiedItem =
    | { kind: 'pending'; experience: WYQDObject; date: string; amount: number }
    | { kind: 'reviewed'; stored: WYQDStoredEntity<ReviewEntry>; date: string };

  const unifiedItems = useMemo(() => {
    const pending: UnifiedItem[] = pendingReviewExperiences.map((exp) => ({
      kind: 'pending' as const,
      experience: exp,
      date: exp.updated_at || exp.created_at || '',
      amount: getExperienceAmount(exp),
    }));
    const reviewed: UnifiedItem[] = latestReviews.map((stored) => ({
      kind: 'reviewed' as const,
      stored,
      date: stored.entity.reviewed_at || stored.entity.created_at || '',
    }));
    return [...pending, ...reviewed].sort((a, b) => b.date.localeCompare(a.date));
  }, [pendingReviewExperiences, latestReviews]);

  const filteredUnifiedItems = useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();

    return unifiedItems.filter((item) => {
      // Status filter
      if (statusFilter === 'pending' && item.kind !== 'pending') return false;
      if (statusFilter === 'reviewed' && item.kind !== 'reviewed') return false;

      // Type filter only applies to reviewed items
      if (item.kind === 'pending' && reviewTypeFilter !== 'all') return false;
      if (item.kind === 'reviewed' && reviewTypeFilter !== 'all') {
        if (item.stored.entity.review_type !== reviewTypeFilter) return false;
      }

      // Search
      if (!query) return true;
      if (item.kind === 'pending') {
        const haystack = [item.experience.title, item.experience.status].join(' ').toLowerCase();
        return haystack.includes(query);
      }
      const e = item.stored.entity;
      const haystack = [e.title, e.target, e.summary, e.review_type, e.exit_type, e.period, item.stored.body]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [unifiedItems, statusFilter, reviewQuery, reviewTypeFilter]);

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

  function getScoreItems(review: ReviewEntry): string[] {
    return [
      review.food_score ? `${t('foodRank')} ${review.food_score}分` : null,
      review.scenery_score ? `${t('sceneryRank')} ${review.scenery_score}分` : null,
      review.experience_score ? `${t('experienceRank')} ${review.experience_score}分` : null,
    ].filter((item): item is string => Boolean(item));
  }

  const rankingBoardSuffix = t('rankingBoard').replace('{label}', '');

  const rankingBoards = useMemo(() => {
    const scoreDimensions: Array<{
      key: 'food_score' | 'scenery_score' | 'experience_score';
      label: string;
    }> = [
      { key: 'food_score', label: t('foodRank') },
      { key: 'scenery_score', label: t('sceneryRank') },
      { key: 'experience_score', label: t('experienceRank') },
    ];

    return (
      scoreDimensions.map((dimension) => ({
        ...dimension,
        entries: reviews
          .filter((stored) => stored.entity[dimension.key])
          .sort(
            (a, b) => (b.entity[dimension.key] || 0) - (a.entity[dimension.key] || 0),
          )
          .slice(0, 6),
      }))
    );
  }, [reviews, t]);

  const objectById = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const filteredReviewedItems = filteredUnifiedItems
    .filter((item): item is Extract<UnifiedItem, { kind: 'reviewed' }> => item.kind === 'reviewed');
  const selectedReview =
    filteredReviewedItems.find((item) => item.stored.fileName === selectedReviewFileName)?.stored ||
    filteredReviewedItems[0]?.stored ||
    null;
  const selectedReviewTarget =
    selectedReview?.entity.target_id ? objectById.get(selectedReview.entity.target_id) : null;
  const canSubmit = !disabled && summary.trim().length > 0 && !isSaving;

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
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
      const draft = createReviewDraft(summary.trim(), foodScore, sceneryScore, experienceScore, reviewTarget, t);
      const review = editing
        ? {
            ...editing.entity,
            summary: draft.summary,
            food_score: draft.food_score,
            scenery_score: draft.scenery_score,
            experience_score: draft.experience_score,
            updated_at: todayISO(),
          }
        : draft;

      if (editing) {
        await onUpdateReview(editing.fileName, review, editing.body);
      } else {
        const scoreLabel = (score: number | null | undefined) =>
          score ? t('rankPosition').replace('{rank}', String(score)) : t('notRanked');
        await onCreateReview(
          review,
          `## ${t('reviewAction')}\n\n${summary.trim()}\n\n## ${t('rankings')}\n\n- ${t('foodRank')}：${scoreLabel(review.food_score)}\n- ${t('sceneryRank')}：${scoreLabel(review.scenery_score)}\n- ${t('experienceRank')}：${scoreLabel(review.experience_score)}\n\n## ${t('nextSteps')}\n\n`,
        );
      }
      setSummary('');
      setFoodScore('');
      setSceneryScore('');
      setExperienceScore('');
      setEditingFileName(null);
      setReviewingExperienceId(null);
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingReview(stored: WYQDStoredEntity<ReviewEntry>) {
    setSelectedReviewFileName(stored.fileName);
    setEditingFileName(stored.fileName);
    setSummary(stored.entity.summary || '');
    setFoodScore(stored.entity.food_score ? String(stored.entity.food_score) : '');
    setSceneryScore(stored.entity.scenery_score ? String(stored.entity.scenery_score) : '');
    setExperienceScore(
      stored.entity.experience_score ? String(stored.entity.experience_score) : '',
    );
  }

  async function saveReviewEdit(stored: WYQDStoredEntity<ReviewEntry>, body: string) {
    if (!canSubmit) return;

    const nextReview: ReviewEntry = {
      ...stored.entity,
      summary: summary.trim(),
      food_score: parseScore(foodScore),
      scenery_score: parseScore(sceneryScore),
      experience_score: parseScore(experienceScore),
      updated_at: todayISO(),
    };

    setIsSaving(true);
    try {
      await onUpdateReview(stored.fileName, nextReview, body);
      cancelEditing();
    } finally {
      setIsSaving(false);
    }
  }

  function cancelEditing() {
    setEditingFileName(null);
    setSummary('');
    setFoodScore('');
    setSceneryScore('');
    setExperienceScore('');
    setReviewingExperienceId(null);
  }

  function startExperienceReview(experience: WYQDObject) {
    cancelEditing();
    setReviewingExperienceId(experience.id);
    setSummary(t('reviewAbout').replace('{title}', experience.title));
    window.setTimeout(() => reviewFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function selectReview(fileName: string) {
    setSelectedReviewFileName(fileName);
    window.setTimeout(() => reviewDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  return (
    <>
    <section className="space-y-5">
      <div className={CARD_CLASS}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('reviewConsole')}</h2>
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

      </div>

      {/* Ranking Boards */}
      <div className="grid gap-3 lg:grid-cols-3">
        {rankingBoards.map((board) => (
          <section key={board.key} className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className={SECTION_TITLE_CLASS}>
                {board.label}{rankingBoardSuffix}
              </h2>
              <span className="text-xs text-stone-400">{t('topRanking').replace('{count}', String(board.entries.length))}</span>
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
                    {stored.entity[board.key]}分
                  </span>
                </button>
              ))}
              {board.entries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-5 text-center text-sm text-stone-500">
                  {t('noRankings')}
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      {/* Travel Insights — Pro feature, above review list */}
      <TravelInsightsPanel
        objects={objects}
        reviews={reviews.map((r) => r.entity)}
        membership={membership}
      />

      {/* Unified Review List */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-stone-950">{t('reviewHistory')}</h2>
          <span className="text-xs text-stone-400">
            {filteredUnifiedItems.length}/{unifiedItems.length}
          </span>
        </div>

        {/* Status filter tabs */}
        <div className="mt-3 flex gap-1">
          {(['all', 'pending', 'reviewed'] as const).map((sf) => (
            <button
              key={sf}
              type="button"
              onClick={() => setStatusFilter(sf)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === sf
                  ? 'bg-stone-950 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {t(sf === 'all' ? 'filterAll' : sf === 'pending' ? 'filterPending' : 'filterReviewed')}
            </button>
          ))}
        </div>

        {/* Search + type filter */}
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

        {/* Unified list + detail sidebar */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div className="space-y-2">
            {filteredUnifiedItems.length === 0 ? (
              <p className="text-sm text-stone-500">{t('noMatchingReviews')}</p>
            ) : null}

            {filteredUnifiedItems.map((item) => {
              if (item.kind === 'pending') {
                const exp = item.experience;
                const isReviewingThis = reviewingExperienceId === exp.id;
                return (
                  <div key={`pending-${exp.id}`}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-stone-50 ${isReviewingThis ? 'bg-stone-50 ring-1 ring-stone-200' : ''}`}
                      onClick={() => startExperienceReview(exp)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-stone-950">{exp.title}</span>
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">{t('pendingReviewBadge')}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-400">
                          <span>{getStatusLabel(exp)}</span>
                          <span>·</span>
                          <span>{formatMoney(item.amount)}</span>
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
                      >
                        {t('reviewAction')}
                      </span>
                    </button>
                    {isReviewingThis ? (
                      <form ref={reviewFormRef} onSubmit={(e) => void handleSubmit(e)} className="mx-3 mb-2 mt-1 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
                        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={t('reviewSummaryPlaceholder')} rows={3} aria-label={t('summary')} className={`${fieldClass} resize-none`} disabled={disabled || isSaving} />
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input value={foodScore} onChange={(e) => setFoodScore(e.target.value)} type="number" min="0" max="100" inputMode="numeric" placeholder={t('foodRank')} className={fieldClass} disabled={disabled || isSaving} />
                          <input value={sceneryScore} onChange={(e) => setSceneryScore(e.target.value)} type="number" min="0" max="100" inputMode="numeric" placeholder={t('sceneryRank')} className={fieldClass} disabled={disabled || isSaving} />
                          <input value={experienceScore} onChange={(e) => setExperienceScore(e.target.value)} type="number" min="0" max="100" inputMode="numeric" placeholder={t('experienceRank')} className={fieldClass} disabled={disabled || isSaving} />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={cancelEditing} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-400" disabled={isSaving}>{t('cancel')}</button>
                          <button type="submit" disabled={!canSubmit} className="flex-1 rounded-lg bg-stone-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300">
                            {isSaving ? t('saving') : t('saveReview')}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              }

              // Reviewed item
              const stored = item.stored;
              return (
                <div
                  key={stored.entity.id}
                  className={`border-t pt-3 ${
                    selectedReview?.fileName === stored.fileName ? 'border-stone-300' : 'border-stone-100'
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
                    {getScoreItems(stored.entity).length > 0 ? (
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {getScoreItems(stored.entity).map((scoreItem) => (
                          <span key={scoreItem} className="rounded-full bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600">
                            {scoreItem}
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
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => selectReview(stored.fileName)}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 active:scale-95"
                    >
                      {t('detail')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void (async () => {
                        const confirmed = await confirm({ title: t('delete'), message: t('deleteConfirm').replace('{title}', stored.entity.title), destructive: true });
                        if (!confirmed) return;
                        setDeletingFileName(stored.fileName);
                        try {
                          await onDeleteReview(stored.fileName);
                          if (editingFileName === stored.fileName) cancelEditing();
                          if (selectedReviewFileName === stored.fileName) setSelectedReviewFileName(null);
                        } finally {
                          setDeletingFileName(null);
                        }
                      })()}
                      className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-300"
                      disabled={disabled || deletingFileName === stored.fileName}
                    >
                      {deletingFileName === stored.fileName ? t('saving') : t('delete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <aside ref={reviewDetailRef} className="rounded-xl border border-stone-200 bg-stone-50/50 p-5">
            {selectedReview ? (
              <ReviewDetailSidebar
                stored={selectedReview}
                target={selectedReviewTarget ?? undefined}
                isEditing={editingFileName === selectedReview.fileName}
                disabled={disabled || isSaving}
                onStartEdit={() => startEditingReview(selectedReview)}
                onCancelEdit={cancelEditing}
                onSaveAll={(body) => saveReviewEdit(selectedReview, body)}
                editSummary={summary}
                onEditSummaryChange={setSummary}
                editFoodScore={foodScore}
                onEditFoodScoreChange={setFoodScore}
                editSceneryScore={sceneryScore}
                onEditSceneryScoreChange={setSceneryScore}
                editExperienceScore={experienceScore}
                onEditExperienceScoreChange={setExperienceScore}
                canSubmit={canSubmit}
                t={t}
                formatMoney={formatMoney}
                getReviewTypeLabel={getReviewTypeLabel}
                getExitTypeLabel={getExitTypeLabel}
                getScoreItems={getScoreItems}
                getStatusLabel={getStatusLabel}
              />
            ) : (
              <p className="text-sm text-stone-500">{t('selectReviewToView')}</p>
            )}
          </aside>
        </div>
      </div>
    </section>
    {confirmDialog}
    </>
  );
}
