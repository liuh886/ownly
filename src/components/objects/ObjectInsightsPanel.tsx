'use client';

import { useMemo } from 'react';
import type { AccountSnapshot, ObjectLogEntry, WYQDObject } from '@/domain/types';
import type { WYQDMembershipState } from '@/core/membership';
import { canUseWYQDProFeature } from '@/core/membership';
import {
  buildNetWorthTrend,
  getSubscriptionRanking,
  getUnusedObjects,
} from '@/domain/object-insights';
import { Panel } from '../common/ui-primitives';

const COPY = {
  en: {
    title: 'Object insights',
    lockedTitle: 'Object insights is a PRO feature',
    lockedDesc: 'Subscription rankings, net worth trends, and unused-item alerts — computed locally, nothing leaves your vault.',
    unlock: 'Unlock PRO',
    subscriptions: 'Annual subscription cost',
    perYear: '/yr',
    unannualized: 'no annual figure',
    total: 'Total',
    netWorth: 'Net worth trend',
    latest: 'Latest',
    change: 'Change',
    points: 'snapshots',
    noSnapshots: 'Record snapshots in the Accounts tab to start the trend.',
    unused: 'Unused alerts',
    unusedDesc: 'Held items with no evidence of use for 90+ days.',
    daysUnused: 'days unused',
    lastEvidence: 'last evidence',
    noUnused: 'Everything held shows recent use. Nice.',
    empty: 'Add objects to unlock insights about what you own.',
  },
  zh: {
    title: '对象洞察',
    lockedTitle: '对象洞察是 PRO 功能',
    lockedDesc: '订阅排行、净值趋势、闲置提醒——全部本地计算，不离开你的 vault。',
    unlock: '解锁 PRO',
    subscriptions: '订阅年度成本',
    perYear: '/年',
    unannualized: '无年化口径',
    total: '合计',
    netWorth: '净值趋势',
    latest: '最新',
    change: '变化',
    points: '个快照',
    noSnapshots: '去「账户」页记录快照后开始趋势统计。',
    unused: '闲置提醒',
    unusedDesc: '持有且 90 天以上无使用证据的物品。',
    daysUnused: '天未使用',
    lastEvidence: '最近证据',
    noUnused: '持有的物品近期都有使用，不错。',
    empty: '添加对象后开始洞察你的持有。',
  },
} as const;

function formatAmount(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString('en-US')}`;
}

export function ObjectInsightsPanel({
  objects,
  snapshots,
  logs,
  membership,
  language,
}: {
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  logs: ObjectLogEntry[];
  membership: WYQDMembershipState;
  language: 'zh' | 'en';
}) {
  const copy = COPY[language];
  const isPro = canUseWYQDProFeature(membership);

  const groups = useMemo(() => getSubscriptionRanking(objects), [objects]);
  const trend = useMemo(() => buildNetWorthTrend(snapshots), [snapshots]);
  const unused = useMemo(() => getUnusedObjects(objects, logs), [objects, logs]);

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
          <span>{unused.length} unused alerts</span>
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
  const recent = trend.slice(-6).reverse();

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-stone-950">{copy.title}</h2>
        <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-semibold text-white">PRO</span>
      </div>

      <h3 className="mt-4 text-sm font-semibold text-stone-900">{copy.subscriptions}</h3>
      {groups.length === 0 ? (
        <p className="mt-1 text-xs text-stone-400">—</p>
      ) : (
        <div className="mt-2 space-y-3">
          {groups.map((group) => (
            <div key={group.currency}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{group.currency}</div>
              <ul className="mt-1 space-y-1">
                {group.rows.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-stone-700">
                      {row.title}
                      {row.provider ? <span className="text-stone-400"> · {row.provider}</span> : null}
                    </span>
                    <span className="shrink-0 font-medium text-stone-900">
                      {row.annualized !== null
                        ? `${formatAmount(group.currency, row.annualized)}${copy.perYear}`
                        : copy.unannualized}
                    </span>
                  </li>
                ))}
              </ul>
              {group.total !== null ? (
                <div className="mt-1 text-right text-xs font-semibold text-stone-900">
                  {copy.total} {formatAmount(group.currency, group.total)}{copy.perYear}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <h3 className="mt-5 text-sm font-semibold text-stone-900">{copy.netWorth}</h3>
      {trend.length === 0 ? (
        <p className="mt-1 text-xs text-stone-400">{copy.noSnapshots}</p>
      ) : (
        <div className="mt-2 text-xs text-stone-600">
          {latest ? (
            <div className="flex flex-wrap gap-3">
              <span>{copy.latest} {latest.date}</span>
              {delta !== null ? (
                <span className={delta >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                  {copy.change} {delta >= 0 ? '+' : ''}{delta.toLocaleString('en-US')}
                </span>
              ) : null}
              <span>{trend.length} {copy.points}</span>
            </div>
          ) : null}
          <ul className="mt-2 space-y-1">
            {recent.map((point) => (
              <li key={point.date} className="flex items-baseline justify-between gap-2">
                <span className="text-stone-500">{point.date}</span>
                <span className="font-medium text-stone-800">
                  {point.netWorth !== null ? point.netWorth.toLocaleString('en-US') : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="mt-5 text-sm font-semibold text-stone-900">{copy.unused}</h3>
      <p className="mt-0.5 text-[11px] text-stone-400">{copy.unusedDesc}</p>
      {unused.length === 0 ? (
        <p className="mt-1 text-xs text-emerald-700">✓ {copy.noUnused}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {unused.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-stone-700">{row.title}</span>
              <span className="shrink-0 text-amber-700">
                {row.daysUnused} {copy.daysUnused} · {copy.lastEvidence} {row.lastEvidence}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
