'use client';

import { useMemo, useState } from 'react';
import type { AccountSnapshot, ObjectLogEntry, WYQDObject } from '@/domain/types';
import type { WYQDMembershipState } from '@/core/membership';
import { canUseWYQDProFeature } from '@/core/membership';
import {
  buildNetWorthTrend,
  getSubscriptionRanking,
  getUsageReminderRows,
  type UsageState,
} from '@/domain/object-insights';
import { Panel } from '../common/ui-primitives';

const COPY = {
  en: {
    title: 'Object insights',
    lockedTitle: 'Object insights is a PRO feature',
    lockedDesc: 'Subscription rankings, net worth trends, and usage-state tracking — computed locally, nothing leaves your vault.',
    unlock: 'Unlock PRO',
    subscriptions: 'Annual subscription cost',
    perYear: '/yr',
    unannualized: 'no annual figure',
    total: 'Total',
    netWorth: 'Net worth trend',
    latest: 'Latest',
    previous: 'Previous',
    change: 'Change',
    usageState: 'Usage status',
    usageStateDesc: 'Unmarked items are flagged after {days} days without recorded use; manual marks stay until you switch them.',
    daysUnused: '{n} days unused',
    noUsageRows: 'Nothing needs attention.',
    manualMark: 'manual',
    inUse: 'In use',
    markInUse: 'Mark in use',
    markUnused: 'Mark unused',
    saving: 'Saving…',
    moreItems: '… {n} more',
    noSnapshots: 'Record snapshots in the Accounts tab to start the trend.',
    empty: 'Add objects to unlock insights about what you own.',
  },
  zh: {
    title: '对象洞察',
    lockedTitle: '对象洞察是 PRO 功能',
    lockedDesc: '订阅排行、净值趋势、使用状态标记——全部本地计算，不离开你的 vault。',
    unlock: '解锁 PRO',
    subscriptions: '订阅年度成本',
    perYear: '/年',
    unannualized: '无年化口径',
    total: '合计',
    netWorth: '净值趋势',
    latest: '最新',
    previous: '上期',
    change: '变化',
    usageState: '使用状态',
    usageStateDesc: '未手动标记的物品在 {days} 天没有使用记录后提醒；手动标记会保留到你再次切换。',
    daysUnused: '已 {n} 天未使用',
    noUsageRows: '没有需要关注的物品。',
    manualMark: '手动',
    inUse: '使用中',
    markInUse: '标记为使用',
    markUnused: '标记为未使用',
    saving: '保存中…',
    moreItems: '… 还有 {n} 项',
    noSnapshots: '去「账户」页记录快照后开始趋势统计。',
    empty: '添加对象后开始洞察你的持有。',
  },
} as const;

/** Public default for the idle alert; surfaced in copy so thresholds stay honest. */
const UNUSED_THRESHOLD_DAYS = 90;

function formatAmount(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString('en-US')}`;
}

export function ObjectInsightsPanel({
  objects,
  snapshots,
  logs = [],
  membership,
  language,
  onToggleUsageState,
}: {
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  logs?: ObjectLogEntry[];
  membership: WYQDMembershipState;
  language: 'zh' | 'en';
  onToggleUsageState?: (objectId: string, next: UsageState) => Promise<void>;
}) {
  const copy = COPY[language];
  const isPro = canUseWYQDProFeature(membership);
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo(() => getSubscriptionRanking(objects), [objects]);
  const trend = useMemo(() => buildNetWorthTrend(snapshots), [snapshots]);
  const usageRows = useMemo(
    () => getUsageReminderRows(objects, logs, new Date(), UNUSED_THRESHOLD_DAYS),
    [objects, logs],
  );

  async function handleToggle(objectId: string, next: UsageState) {
    if (!onToggleUsageState) return;
    setBusyId(objectId);
    try {
      await onToggleUsageState(objectId, next);
    } finally {
      setBusyId(null);
    }
  }

  if (!isPro) {
    return (
      <Panel className="border-stone-200">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-stone-950">{copy.title}</h2>
          <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-semibold text-white">PRO</span>
        </div>
        <p className="mt-1 text-xs text-stone-500">{copy.lockedDesc}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-600">
          <span>{groups.reduce((n, group) => n + group.rows.length, 0)} subscriptions</span>
          <span>{trend.length} snapshots</span>
        </div>
      </Panel>
    );
  }

  if (objects.length === 0) {
    return (
      <Panel className="border-stone-200">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-stone-950">{copy.title}</h2>
          <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-semibold text-white">PRO</span>
        </div>
        <p className="mt-3 text-sm text-stone-500">{copy.empty}</p>
      </Panel>
    );
  }

  const valuedTrend = trend.filter((point) => point.netWorth !== null);
  const latest = valuedTrend[valuedTrend.length - 1];
  const previous = valuedTrend[valuedTrend.length - 2];
  const delta = latest && previous ? latest.netWorth! - previous.netWorth! : null;
  const recent = trend.slice().reverse();
  const MAX_ROWS = 8;
  const recentTruncated = recent.length > MAX_ROWS;
  const recentVisible = recentTruncated ? recent.slice(0, MAX_ROWS - 1) : recent.slice(0, MAX_ROWS);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-stone-950">{copy.title}</h2>
        <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-semibold text-white">PRO</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="text-sm font-semibold text-stone-900">{copy.subscriptions}</h3>
          {groups.length === 0 ? (
            <p className="mt-1 text-xs text-stone-500">—</p>
          ) : (
            <>
              <div className="mt-2 h-40 space-y-3 overflow-hidden">
                {groups.map((group) => {
                  const truncated = group.rows.length > MAX_ROWS;
                  const visible = truncated ? group.rows.slice(0, MAX_ROWS - 1) : group.rows;
                  return (
                    <div key={group.currency}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{group.currency}</div>
                      <ul className="mt-1 space-y-1">
                        {visible.map((row) => (
                          <li key={row.id} className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate text-stone-700">
                              {row.title}
                              {row.provider ? <span className="text-stone-500"> · {row.provider}</span> : null}
                            </span>
                            <span className="shrink-0 font-medium text-stone-900">
                              {row.annualized !== null
                                ? `${formatAmount(group.currency, row.annualized)}${copy.perYear}`
                                : copy.unannualized}
                            </span>
                          </li>
                        ))}
                        {truncated ? (
                          <li className="text-xs text-stone-500">
                            {copy.moreItems.replace('{n}', String(group.rows.length - visible.length))}
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <div className="mt-auto space-y-1 border-t border-stone-100 pt-1.5">
                {groups.map((group) =>
                  group.total !== null ? (
                    <div key={group.currency} className="text-right text-xs font-semibold text-stone-900">
                      {copy.total} {formatAmount(group.currency, group.total)}{copy.perYear}
                    </div>
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <h3 className="text-sm font-semibold text-stone-900">{copy.netWorth}</h3>
          {trend.length === 0 ? (
            <p className="mt-1 text-xs text-stone-500">{copy.noSnapshots}</p>
          ) : (
            <>
              <div className="mt-2 h-40 overflow-hidden">
                <ul className="space-y-1">
                  {recentVisible.map((point) => (
                    <li key={point.date} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-stone-500">{point.date}</span>
                      <span className="font-medium text-stone-800">
                        {point.netWorth !== null ? point.netWorth.toLocaleString('en-US') : '—'}
                      </span>
                    </li>
                  ))}
                  {recentTruncated ? (
                    <li className="text-xs text-stone-500">
                      {copy.moreItems.replace('{n}', String(recent.length - recentVisible.length))}
                    </li>
                  ) : null}
                </ul>
              </div>
              {latest ? (
                <div className="mt-auto flex flex-wrap gap-3 border-t border-stone-100 pt-1.5 text-xs text-stone-600">
                  <span>{copy.latest} {latest.date}</span>
                  {previous ? (
                    <span>{copy.previous} {previous.date}</span>
                  ) : null}
                  {delta !== null ? (
                    <span className={delta >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                      {copy.change} {delta >= 0 ? '+' : ''}{delta.toLocaleString('en-US')}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-stone-100 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-900">{copy.usageState}</h3>
          <span className="text-[11px] text-stone-500">
            {copy.usageStateDesc.replace('{days}', String(UNUSED_THRESHOLD_DAYS))}
          </span>
        </div>
        {usageRows.length === 0 ? (
          <p className="mt-1 text-xs text-stone-500">{copy.noUsageRows}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {usageRows.slice(0, MAX_ROWS).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-stone-700">
                  {row.title}
                  {row.marked ? (
                    <span className="ml-1.5 rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500">
                      {copy.manualMark}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={row.state === 'unused' ? 'text-rose-600' : 'text-emerald-700'}>
                    {row.state === 'unused'
                      ? copy.daysUnused.replace('{n}', String(row.days))
                      : copy.inUse}
                  </span>
                  {onToggleUsageState ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() =>
                        void handleToggle(row.id, row.state === 'unused' ? 'in_use' : 'unused')
                      }
                      className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
                    >
                      {busyId === row.id
                        ? copy.saving
                        : row.state === 'unused'
                          ? copy.markInUse
                          : copy.markUnused}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
            {usageRows.length > MAX_ROWS ? (
              <li className="text-xs text-stone-500">
                {copy.moreItems.replace('{n}', String(usageRows.length - MAX_ROWS))}
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}
