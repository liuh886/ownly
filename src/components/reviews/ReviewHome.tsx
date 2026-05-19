'use client';

import { useMemo, useState } from 'react';
import type { ReviewEntry, WYQDObject } from '@/domain/types';
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

function getStatusLabel(object: WYQDObject): string {
  const labels: Record<string, string> = {
    planned: '计划中',
    in_progress: '执行中',
    completed: '已完成',
    reviewed: '已复盘',
    seeded: '种草',
    observing: '观察中',
    purchased: '已购买',
    using: '服役中',
    idle: '已退役',
    transferred: '已卖出',
    discarded: '已丢弃',
    active: '订阅中',
    paused: '已暂停',
    cancelled: '已取消',
  };

  return labels[object.status] || object.status;
}

function getReviewTypeLabel(type: ReviewEntry['review_type']): string {
  const labels: Record<ReviewEntry['review_type'], string> = {
    object_review: '对象复盘',
    exit_record: '退出记录',
    monthly: '月度复盘',
    annual: '年度复盘',
  };

  return labels[type] || type;
}

function getExitTypeLabel(type?: ReviewEntry['exit_type']): string {
  if (!type) return '未记录';
  const labels: Record<NonNullable<ReviewEntry['exit_type']>, string> = {
    idle: '退役',
    transferred: '卖出',
    discarded: '丢弃',
    paused: '暂停',
    cancelled: '取消',
    completed: '完成',
  };

  return labels[type] || type;
}

function parseRank(value: string): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1) return null;
  return Math.floor(numberValue);
}

function getRankingItems(review: ReviewEntry): string[] {
  return [
    review.food_rank ? `美食 #${review.food_rank}` : null,
    review.scenery_rank ? `风景 #${review.scenery_rank}` : null,
    review.experience_rank ? `体验 #${review.experience_rank}` : null,
  ].filter((item): item is string => Boolean(item));
}

function hasRanking(review: ReviewEntry): boolean {
  return getRankingItems(review).length > 0;
}

function createReviewDraft(
  summary: string,
  foodRank: string,
  sceneryRank: string,
  experienceRank: string,
): ReviewEntry {
  const date = todayISO();

  return {
    schema_version: '0.1',
    id: `review_${date.replaceAll('-', '')}_${Date.now()}`,
    type: 'review',
    review_type: 'monthly',
    title: `复盘 ${date}`,
    reviewed_at: date,
    summary,
    food_rank: parseRank(foodRank),
    scenery_rank: parseRank(sceneryRank),
    experience_rank: parseRank(experienceRank),
    period: date.slice(0, 7),
    year: Number(date.slice(0, 4)),
    created_at: date,
    updated_at: date,
    currency: 'CNY',
    tags: ['wyqd', 'review'],
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
  const latestReviews = useMemo(
    () =>
      [...reviews].sort((a, b) =>
        (b.entity.reviewed_at || '').localeCompare(a.entity.reviewed_at || ''),
      ),
    [reviews],
  );
  const rankedReviewCount = reviews.filter((stored) => hasRanking(stored.entity)).length;
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
      const draft = createReviewDraft(summary.trim(), foodRank, sceneryRank, experienceRank);
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
        await onCreateReview(
          review,
          `## 复盘\n\n${summary.trim()}\n\n## 排行榜\n\n- 美食：${
            review.food_rank ? `第 ${review.food_rank} 名` : '未排位'
          }\n- 风景：${
            review.scenery_rank ? `第 ${review.scenery_rank} 名` : '未排位'
          }\n- 体验：${
            review.experience_rank ? `第 ${review.experience_rank} 名` : '未排位'
          }\n\n## 下一步\n\n`,
        );
      }
      setSummary('');
      setFoodRank('');
      setSceneryRank('');
      setExperienceRank('');
      setEditingFileName(null);
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
  }

  function cancelEditing() {
    setEditingFileName(null);
    setSummary('');
    setFoodRank('');
    setSceneryRank('');
    setExperienceRank('');
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-white p-5 shadow-sm shadow-stone-200/40 ring-1 ring-stone-100">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-stone-500">年度体验成本</div>
            <div className="mt-2 break-words text-3xl font-semibold tracking-tight text-stone-950">
              {formatMoney(experienceTotal)}
            </div>
            <div className="mt-1 text-xs text-stone-400">{experiences.length} 个一次性体验</div>
          </div>
          <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
            复盘层
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-sm text-stone-500">排行榜记录</div>
          <div className="mt-2 text-2xl font-semibold text-stone-950">{rankedReviewCount}</div>
          <div className="mt-1 text-xs text-stone-400">美食、风景、体验排位</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-sm text-stone-500">退出记录</div>
          <div className="mt-2 text-2xl font-semibold text-stone-950">{exitedItems.length}</div>
          <div className="mt-1 text-xs text-stone-400">退役、卖出、取消或完成</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm shadow-stone-200/40 sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-stone-950">
            {editingFileName ? '编辑复盘' : '复盘速记'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            只记录结论，不做长篇日记。后续可从 Obsidian 继续展开。
          </p>
        </div>
        <div className="space-y-3">
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="这次消费/体验留下了什么？它在同类体验里排第几？"
            rows={4}
            aria-label="复盘摘要"
            className={`${fieldClass} resize-none`}
            disabled={disabled || isSaving}
          />
          <div>
            <div className="mb-1.5 text-xs font-medium text-stone-500">排行榜排位</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="sr-only">美食排位</span>
                <input
                  value={foodRank}
                  onChange={(event) => setFoodRank(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="美食，如 1"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block">
                <span className="sr-only">风景排位</span>
                <input
                  value={sceneryRank}
                  onChange={(event) => setSceneryRank(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="风景，如 3"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
              <label className="block">
                <span className="sr-only">体验排位</span>
                <input
                  value={experienceRank}
                  onChange={(event) => setExperienceRank(event.target.value)}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="体验，如 2"
                  className={fieldClass}
                  disabled={disabled || isSaving}
                />
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            {editingFileName ? (
              <button
                type="button"
                onClick={cancelEditing}
                className="w-24 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
                disabled={isSaving}
              >
                取消
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-w-0 flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {disabled
                ? '连接 Vault 后写入 Obsidian'
                : isSaving
                  ? '保存中...'
                  : editingFileName
                    ? '保存修改'
                    : '保存复盘'}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-stone-950">看世界</h2>
          <span className="text-xs text-stone-400">预算 vs 实际</span>
        </div>
        <div className="mt-3 space-y-3">
          {experiences.length === 0 ? (
            <p className="text-sm text-stone-500">还没有一次性体验记录。</p>
          ) : (
            experiences.map((experience) => (
              <div
                key={experience.id}
                className="flex justify-between gap-3 border-t border-stone-100 pt-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-stone-950">
                    {experience.title}
                  </div>
                  <div className="text-xs text-stone-400">{getStatusLabel(experience)}</div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-stone-950">
                  {formatMoney(getExperienceAmount(experience))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-stone-950">复盘历史</h2>
          <span className="text-xs text-stone-400">
            {filteredReviews.length}/{latestReviews.length} 条
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <input
            value={reviewQuery}
            onChange={(event) => setReviewQuery(event.target.value)}
            placeholder="搜索标题、对象、摘要或正文"
            aria-label="搜索复盘"
            className={fieldClass}
          />
          <select
            value={reviewTypeFilter}
            onChange={(event) =>
              setReviewTypeFilter(event.target.value as 'all' | ReviewEntry['review_type'])
            }
            aria-label="筛选复盘类型"
            className={fieldClass}
          >
            <option value="all">全部类型</option>
            <option value="object_review">对象复盘</option>
            <option value="exit_record">退出记录</option>
            <option value="monthly">月度复盘</option>
            <option value="annual">年度复盘</option>
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
                    onClick={() => setSelectedReviewFileName(stored.fileName)}
                    className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950"
                  >
                    详情
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditingReview(stored)}
                    className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
                    disabled={disabled || isSaving}
                  >
                    修改
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = window.confirm(`删除「${stored.entity.title}」？`);
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
                    className="rounded-md border border-red-100 bg-white px-2 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-600 disabled:cursor-not-allowed disabled:text-stone-300"
                    disabled={disabled || deletingFileName === stored.fileName}
                  >
                    {deletingFileName === stored.fileName ? '删除中' : '删除'}
                  </button>
                </div>
              </div>
            ))}
            {filteredReviews.length === 0 ? (
              <p className="text-sm text-stone-500">没有匹配的复盘记录。</p>
            ) : null}
          </div>

          <aside className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            {selectedReview ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-stone-400">复盘详情</div>
                  <h3 className="mt-1 break-words text-base font-semibold text-stone-950">
                    {selectedReview.entity.title}
                  </h3>
                  <p className="mt-1 break-all text-xs text-stone-400">
                    {selectedReview.fileName}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-stone-400">类型</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {getReviewTypeLabel(selectedReview.entity.review_type)}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400">日期</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {selectedReview.entity.reviewed_at || selectedReview.entity.created_at}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400">退出类型</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {getExitTypeLabel(selectedReview.entity.exit_type)}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400">体验成本</div>
                    <div className="mt-1 font-medium text-stone-800">
                      {selectedReview.entity.realized_experience_cost
                        ? formatMoney(selectedReview.entity.realized_experience_cost)
                        : '未记录'}
                    </div>
                  </div>
                </div>
                {getRankingItems(selectedReview.entity).length > 0 ? (
                  <div className="rounded-md bg-white p-3 text-xs">
                    <div className="text-stone-400">排行榜</div>
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
                    <div className="text-stone-400">关联对象</div>
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
                    <div className="text-xs text-stone-400">摘要</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                      {selectedReview.entity.summary}
                    </p>
                  </div>
                ) : null}
                {selectedReview.body.trim() ? (
                  <div>
                    <div className="text-xs text-stone-400">Markdown 正文</div>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-stone-600">
                      {selectedReview.body.trim()}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-stone-500">选择一条复盘后查看完整内容。</p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
