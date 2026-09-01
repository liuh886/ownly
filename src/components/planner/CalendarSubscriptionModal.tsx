import React, { useState } from 'react';
import type { PlannerTrip } from '../../domain/planner';
import { getCalendarFeedUrl } from '../../domain/calendar-feed';

interface CalendarSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  trip: PlannerTrip;
  activeDate: string;
  onDownloadFullIcs: () => void;
  onDownloadDayIcs: (date: string) => void;
  onCopyIcs: () => Promise<void>;
  onCreateOrUpdateFeed: () => Promise<void>;
  onRotateFeed: () => Promise<void>;
  onDisableFeed: () => Promise<void>;
  language?: 'zh' | 'en';
}

export function CalendarSubscriptionModal({
  open,
  onClose,
  trip,
  activeDate,
  onDownloadFullIcs,
  onDownloadDayIcs,
  onCopyIcs,
  onCreateOrUpdateFeed,
  onRotateFeed,
  onDisableFeed,
  language = 'zh',
}: CalendarSubscriptionModalProps) {
  const zh = language === 'zh';
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedIcs, setCopiedIcs] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  const feed = trip.calendar_feed;
  const isFeedActive = Boolean(feed?.enabled && feed?.feed_token);
  const feedUrl = isFeedActive && feed ? getCalendarFeedUrl(feed.feed_token) : '';

  const copyFeedUrl = async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleCopyIcs = async () => {
    setBusy(true);
    try {
      await onCopyIcs();
      setCopiedIcs(true);
      setTimeout(() => setCopiedIcs(false), 3000);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOrUpdate = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await onCreateOrUpdateFeed();
      setNotice(
        zh
          ? '✓ 日历订阅源已发布！Google Calendar / Apple Calendar 将按其刷新周期同步。'
          : '✓ Calendar feed updated! Clients will sync on their refresh cycle.',
      );
    } catch (err) {
      setNotice(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async () => {
    if (!confirm(zh ? '确定要重新生成订阅链接吗？旧链接将立即失效，需要在日历中重新添加。' : 'Rotate subscription URL? Existing subscribers will need the new link.')) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await onRotateFeed();
      setNotice(zh ? '✓ 已生成全新订阅链接，旧链接已失效。' : '✓ Generated new subscription URL; old link revoked.');
    } catch (err) {
      setNotice(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm(zh ? '确定要停用此日历订阅吗？' : 'Disable this calendar feed?')) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await onDisableFeed();
      setNotice(zh ? '✓ 日历订阅已停用。' : '✓ Calendar feed disabled.');
    } catch (err) {
      setNotice(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📅</span>
            <div>
              <h2 className="text-base font-bold text-stone-900">{zh ? '日历与订阅' : 'Calendar & Feed'}</h2>
              <p className="text-xs text-stone-400">
                {trip.title} · {trip.start_date} ~ {trip.end_date}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 transition"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {notice ? (
            <div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              {notice}
            </div>
          ) : null}

          {/* Section 1: PRO Continuous Calendar Feed */}
          <div className="rounded-xl border-2 border-amber-400/80 bg-gradient-to-b from-amber-50/50 to-white p-4.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10.5px] font-black text-white shadow-2xs">
                  👑 PRO
                </span>
                <h3 className="text-sm font-bold text-stone-900">{zh ? '持续日历订阅 (Calendar Feed)' : 'Live Calendar Feed'}</h3>
              </div>
              {isFeedActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {zh ? '已发布' : 'Published'}
                </span>
              ) : (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-semibold text-stone-500">
                  {zh ? '未启用' : 'Not Enabled'}
                </span>
              )}
            </div>

            <p className="mt-2 text-xs leading-5 text-stone-600">
              {zh
                ? '只在 Google Calendar、Apple 日历或 Outlook 订阅一次。后续在 Planner 中调整时间、换酒店、增删地点，日历自动同步最新版本。'
                : 'Subscribe once in Google Calendar, Apple Calendar, or Outlook. Changes in Planner automatically sync to your calendar.'}
            </p>

            {isFeedActive ? (
              <div className="mt-3.5 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={feedUrl}
                    className="flex-1 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-mono text-stone-800 select-all focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => void copyFeedUrl()}
                    className="shrink-0 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-stone-800 transition"
                  >
                    {copied ? (zh ? '✓ 已复制' : '✓ Copied') : (zh ? '复制订阅链接' : 'Copy URL')}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCreateOrUpdate()}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                  >
                    🔄 {zh ? '更新日历' : 'Update Feed'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRotate()}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition"
                    title={zh ? '重新生成订阅 URL，旧链接立即失效' : 'Rotate URL'}
                  >
                    🔑 {zh ? '重新生成链接' : 'Rotate URL'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDisable()}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                  >
                    🛑 {zh ? '停用订阅' : 'Disable'}
                  </button>
                </div>

                <div className="rounded-lg bg-stone-100/80 p-2.5 text-[11px] leading-4.5 text-stone-500">
                  💡 <strong>{zh ? '关于刷新周期：' : 'Refresh interval: '}</strong>
                  {zh
                    ? '日历客户端通过定时轮询获取更新。Google Calendar 通常约 1–24 小时刷新一次；Apple Calendar 可在设置中自定义刷新间隔。'
                    : 'Calendar clients pull updates periodically (Google Calendar typically refreshes every 1-24h; Apple Calendar supports custom refresh rates).'}
                </div>
              </div>
            ) : (
              <div className="mt-3.5 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreateOrUpdate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition"
                >
                  <span>📅</span>
                  <span>{zh ? '启用日历订阅' : 'Enable Calendar Feed'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Free Tier Direct ICS Download */}
          <div className="rounded-xl border border-stone-200 bg-white p-4.5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10.5px] font-bold text-stone-700">
                Free
              </span>
              <h3 className="text-sm font-semibold text-stone-900">{zh ? '直接导出日历文件 (.ics)' : 'Export .ics File'}</h3>
            </div>
            <p className="text-xs text-stone-500">
              {zh
                ? '生成符合 RFC 5545 标准的独立 iCalendar 文件，可直接导入任意日历软件（单次导入，不包含后续自动更新）。'
                : 'Generate standard RFC 5545 .ics file for one-off manual import into any calendar software.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onDownloadFullIcs}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition shadow-2xs"
              >
                <span>📥</span>
                <span>{zh ? '下载全行程 .ics' : 'Download Trip .ics'}</span>
              </button>

              <button
                type="button"
                onClick={() => onDownloadDayIcs(activeDate)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition shadow-2xs"
              >
                <span>📥</span>
                <span>{zh ? `下载当天 .ics (${activeDate})` : `Download Day .ics (${activeDate})`}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyIcs()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 transition"
              >
                <span>📋</span>
                <span>{copiedIcs ? (zh ? '✓ 已复制 ICS' : '✓ Copied') : (zh ? '复制 ICS 文本' : 'Copy ICS Text')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-stone-100 bg-stone-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-4 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition"
          >
            {zh ? '关闭' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
