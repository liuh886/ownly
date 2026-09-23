import { useRef, useState } from 'react';
import { Sheet } from '@/components/common/Sheet';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import {
  defaultTripShareAlias,
  getTripShareUrl,
  validateTripShareAlias,
  type TripShareMeta,
} from '../../domain/trip-share';

interface TripShareModalProps {
  open: boolean;
  onClose: () => void;
  trip: { id: string; title: string } | null;
  meta: TripShareMeta | null;
  isPro: boolean;
  onUpgradePro?: () => void;
  language: 'zh' | 'en';
  onPublish: () => Promise<{ url: string; share: { alias: string } }>;
  onDisable: () => Promise<void>;
}

export function TripShareModal({
  open,
  onClose,
  trip,
  meta,
  isPro,
  onUpgradePro,
  language,
  onPublish,
  onDisable,
}: TripShareModalProps) {
  const zh = language === 'zh';
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirmDialog();

  if (!open || !trip) return null;

  const isActive = Boolean(meta?.enabled && meta.alias);
  const url = isActive && meta ? getTripShareUrl(meta.alias) : '';
  // Once a link exists its alias is stable (even while disabled), so the
  // preview shows the stored name instead of silently following renames.
  const projectedAlias = meta?.alias?.trim() || defaultTripShareAlias(trip);
  const projectedUrl = getTripShareUrl(projectedAlias);
  const nameCheck = validateTripShareAlias(trip.title);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      urlInputRef.current?.select();
      setNotice(zh ? '无法自动复制，请长按上方链接手动复制。' : 'Copy blocked — long-press the link above to copy.');
    }
  };

  const shareUrl = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: trip.title, url });
    } catch {
      // User dismissed the native share sheet; nothing to do.
    }
  };

  const handleEnable = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await onPublish();
      setNotice(
        zh
          ? `✓ 分享链接已开启：${response.url}`
          : `✓ Share link enabled: ${response.url}`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!(await confirm({
      title: zh ? '分享链接' : 'Share link',
      message: zh ? '停用后该链接将立即失效。' : 'The link will stop working immediately.',
      destructive: true,
    }))) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await onDisable();
      setNotice(zh ? '✓ 分享链接已停用。' : '✓ Share link disabled.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const updatedLabel = meta?.updated_at
    ? new Date(meta.updated_at).toLocaleString(zh ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={zh ? '🔗 分享行程链接' : '🔗 Share itinerary link'}
        description={trip.title}
        size="md"
        footer={(
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full touch-manipulation rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-muted transition duration-150 active:scale-[0.98] hover:bg-surface-sunken sm:w-auto"
          >
            {zh ? '完成' : 'Done'}
          </button>
        )}
      >
        <div className="space-y-4">
          {notice ? (
            <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold break-all text-emerald-800 ring-1 ring-emerald-200">
              {notice}
            </div>
          ) : null}

          {!isPro ? (
            <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10.5px] font-black text-white">👑 PRO</span>
                <h3 className="text-sm font-bold text-ink">{zh ? '固定分享链接' : 'Permanent share link'}</h3>
              </div>
              <p className="text-xs leading-5 text-amber-900">
                {zh
                  ? '✨ 固定分享链接是 PRO 专属功能。升级后即可用行程名生成一条固定链接，手机打开即读，行程更新自动同步。'
                  : '✨ Permanent share links are a PRO feature. Upgrade to get a stable, trip-named link that auto-syncs.'}
              </p>
              {onUpgradePro ? (
                <button
                  type="button"
                  onClick={onUpgradePro}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-stone-800"
                >
                  <span>👑</span>
                  <span>{zh ? '解锁 PRO 会员' : 'Unlock PRO'}</span>
                </button>
              ) : null}
            </div>
          ) : isActive ? (
            <>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {zh ? '已开启 · 自动同步' : 'Live · auto-sync'}
                </span>
                {updatedLabel ? (
                  <span className="text-[11px] text-ink-muted">
                    {zh ? `更新于 ${updatedLabel}` : `Updated ${updatedLabel}`}
                  </span>
                ) : null}
              </div>

              <div className="flex items-stretch gap-2">
                <input
                  ref={urlInputRef}
                  type="text"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface-sunken px-3 py-2.5 font-mono text-base text-ink select-all focus:outline-hidden sm:text-xs"
                />
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className="shrink-0 rounded-xl bg-stone-900 px-4 text-xs font-bold text-white shadow-xs transition hover:bg-stone-800"
                >
                  {copied ? (zh ? '✓ 已复制' : '✓ Copied') : (zh ? '复制' : 'Copy')}
                </button>
              </div>

              {canShare ? (
                <button
                  type="button"
                  onClick={() => void shareUrl()}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
                >
                  <span>📤</span>
                  <span>{zh ? '分享到微信 / 其他应用' : 'Share to…'}</span>
                </button>
              ) : null}

              <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] leading-4.5 text-rose-700 ring-1 ring-rose-200">
                {zh
                  ? '⚠️ 链接是公开的：任何知道或猜到行程名的人都能查看整份行程（含备注/外链）。费用账本永远不会包含。'
                  : '⚠️ The link is public: anyone who knows or guesses the trip name can read the whole itinerary (notes/links included). Expenses are never included.'}
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDisable()}
                className="w-full min-h-10 rounded-xl border border-line bg-surface px-4 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                🛑 {zh ? '停用链接' : 'Disable link'}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-line bg-surface p-4">
                <div className="text-[11px] font-semibold text-ink-muted">{zh ? '链接将以行程名命名' : 'Link uses the trip name'}</div>
                <div className="mt-1 break-all font-mono text-xs text-ink">{projectedUrl}</div>
                {!nameCheck.ok ? (
                  <p className="mt-2 text-[11px] text-rose-600">
                    {nameCheck.reason === 'empty'
                      ? (zh ? '行程名为空，请先给行程命名。' : 'Trip name is empty; name the trip first.')
                      : (zh ? '行程名过长或包含 / ? # % 等字符，无法作为链接。请改一个更简洁的行程名。' : 'Trip name is too long or contains / ? # %; rename it to a shorter name.')}
                  </p>
                ) : null}
              </div>

              <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] leading-4.5 text-rose-700 ring-1 ring-rose-200">
                {zh
                  ? '⚠️ 链接是公开的：任何知道或猜到行程名的人都能查看整份行程（含备注/外链）。费用账本永远不会包含。'
                  : '⚠️ The link is public: anyone who knows or guesses the trip name can read the whole itinerary (notes/links included). Expenses are never included.'}
              </p>

              <button
                type="button"
                disabled={busy || !nameCheck.ok}
                onClick={() => void handleEnable()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-amber-600 disabled:opacity-50"
              >
                <span>🔗</span>
                <span>{busy ? (zh ? '生成中…' : 'Creating…') : (zh ? '开启分享链接' : 'Enable share link')}</span>
              </button>
              <p className="text-center text-[11px] text-ink-muted">
                {zh ? '开启后，编辑行程约半分钟自动同步到该链接。' : 'Once enabled, edits auto-sync to the link in ~30s.'}
              </p>
            </>
          )}
        </div>
      </Sheet>
      {dialog}
    </>
  );
}
