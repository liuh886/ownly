import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDialogA11y } from '@/components/common/useDialogA11y';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import { dialogBackdropProps } from '@/components/common/use-dialog-dismiss';
import {
  getTripShareUrl,
  normalizeTripShareAlias,
  validateTripShareAlias,
  type TripShareMeta,
} from '../../domain/trip-share';

interface TripShareModalProps {
  open: boolean;
  onClose: () => void;
  trip: { id: string; title: string } | null;
  meta: TripShareMeta | null;
  suggestedAlias: string;
  isPro: boolean;
  onUpgradePro?: () => void;
  language: 'zh' | 'en';
  onPublish: (alias: string) => Promise<{ url: string; share: { alias: string } }>;
  onRotate: (alias: string) => Promise<{ url: string; share: { alias: string } }>;
  onDisable: () => Promise<void>;
}

export function TripShareModal({
  open,
  onClose,
  trip,
  meta,
  suggestedAlias,
  isPro,
  onUpgradePro,
  language,
  onPublish,
  onRotate,
  onDisable,
}: TripShareModalProps) {
  const zh = language === 'zh';
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState(meta?.alias ?? suggestedAlias);
  const panelRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useConfirmDialog();

  useDialogA11y({ open, onClose, panelRef });

  if (!open || !trip) return null;

  const isActive = Boolean(meta?.enabled && meta.alias);
  const url = isActive && meta ? getTripShareUrl(meta.alias) : '';
  const aliasValidation = validateTripShareAlias(aliasInput);

  const copyUrl = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 3000);
  };

  const handlePublish = async () => {
    if (!aliasValidation.ok) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await onPublish(aliasValidation.alias);
      setNotice(
        zh
          ? `✓ 分享链接已发布：${response.url}（编辑行程后约半分钟自动更新）`
          : `✓ Share link published: ${response.url} (auto-updates ~30s after edits)`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async () => {
    if (!aliasValidation.ok) return;
    if (!(await confirm({
      title: zh ? '分享链接' : 'Share link',
      message: zh
        ? '确定要重新发布吗？旧链接会立即失效，已发出的链接将无法打开。'
        : 'Republish? The old link is revoked immediately and existing shares stop working.',
      destructive: true,
    }))) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await onRotate(aliasValidation.alias);
      setNotice(
        zh
          ? `✓ 已重新发布：${response.url}`
          : `✓ Republished: ${response.url}`,
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs ownly-fade-in" {...dialogBackdropProps(onClose)}>
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={zh ? '分享行程链接' : 'Share itinerary link'} className="w-full max-w-xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🔗</span>
              <div>
                <h2 className="text-base font-bold text-stone-900">{zh ? '分享行程链接' : 'Share Itinerary Link'}</h2>
                <p className="text-xs text-stone-500">{trip.title}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={zh ? '关闭' : 'Close'}
              title={zh ? '关闭' : 'Close'}
              className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/60 hover:text-stone-700 transition"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[80vh] space-y-4 overflow-y-auto overscroll-contain p-5">
            {notice ? (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold break-all text-emerald-800 ring-1 ring-emerald-200">
                {notice}
              </div>
            ) : null}

            <div className="rounded-xl border-2 border-amber-400/80 bg-gradient-to-b from-amber-50/50 to-white p-4.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10.5px] font-black text-white shadow-2xs">👑 PRO</span>
                  <h3 className="text-sm font-bold text-stone-900">{zh ? '固定分享链接' : 'Permanent Share Link'}</h3>
                </div>
                {isActive ? (
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
                  ? '生成一个固定链接，手机浏览器直接打开就能看这份行程（单文件 HTML，无需登录）。编辑行程后约半分钟自动更新。'
                  : 'Get a permanent URL that opens this itinerary in any phone browser (single-file HTML, no login). Auto-updates ~30s after edits.'}
              </p>

              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] leading-4.5 text-rose-700 ring-1 ring-rose-200">
                {zh
                  ? '⚠️ 链接是公开的：任何拿到或猜到别名的人都能查看整份行程（含备注/外链）。请勿用于敏感行程，并避免使用过于简单的别名。费用账本永远不会包含在分享内容中。'
                  : '⚠️ The link is public: anyone who has or guesses the alias can read the whole itinerary (notes/links included). Avoid sensitive trips and overly simple aliases. Expenses are never included.'}
              </p>

              {!isPro ? (
                <div className="mt-3.5 space-y-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3.5">
                  <p className="text-xs font-medium leading-5 text-amber-900">
                    {zh
                      ? '✨ 固定分享链接是 PRO 专属功能。升级后可生成专属链接，行程更新自动同步。'
                      : '✨ Permanent share links are a PRO feature. Upgrade to get a link that auto-syncs.'}
                  </p>
                  {onUpgradePro ? (
                    <button
                      type="button"
                      onClick={onUpgradePro}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-stone-800"
                    >
                      <span>👑</span>
                      <span>{zh ? '解锁 PRO 会员' : 'Unlock PRO'}</span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3.5 space-y-3">
                  {isActive ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={url}
                        className="flex-1 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-base font-mono text-stone-800 select-all focus:outline-hidden sm:text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void copyUrl()}
                        className="shrink-0 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-stone-800"
                      >
                        {copied ? (zh ? '✓ 已复制' : '✓ Copied') : (zh ? '复制链接' : 'Copy URL')}
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <label className="shrink-0 text-xs font-semibold text-stone-600" htmlFor="trip-share-alias">
                      {zh ? '别名' : 'Alias'}
                    </label>
                    <input
                      id="trip-share-alias"
                      type="text"
                      value={aliasInput}
                      onChange={(event) => setAliasInput(normalizeTripShareAlias(event.target.value))}
                      maxLength={24}
                      placeholder="TH26"
                      className="w-40 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base font-mono uppercase tracking-wide text-stone-800 focus:border-amber-400 focus:outline-hidden sm:text-xs"
                    />
                    <span className="text-[11px] text-stone-500">
                      {zh ? '2–24 位大写字母/数字/连字符' : '2–24 chars A-Z 0-9 -'}
                    </span>
                  </div>
                  {!aliasValidation.ok && aliasInput.trim().length > 0 ? (
                    <p className="text-[11px] text-rose-600">
                      {aliasValidation.reason === 'reserved'
                        ? (zh ? '该别名被系统保留，请换一个。' : 'This alias is reserved; pick another.')
                        : (zh ? '格式无效：需 2–24 位大写字母、数字或连字符。' : 'Invalid format: 2–24 chars A-Z, 0-9, or hyphen.')}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy || !aliasValidation.ok}
                      onClick={() => void handlePublish()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-amber-600 disabled:opacity-50"
                    >
                      <span>🔗</span>
                      <span>
                        {isActive
                          ? (zh ? '同步到该链接' : 'Sync to this link')
                          : (zh ? '开启分享链接' : 'Enable Share Link')}
                      </span>
                    </button>
                    {isActive ? (
                      <>
                        <button
                          type="button"
                          disabled={busy || !aliasValidation.ok}
                          onClick={() => void handleRotate()}
                          className="px-1 py-1.5 text-[11px] font-normal text-stone-500 underline-offset-2 transition hover:text-stone-600 hover:underline disabled:opacity-50"
                        >
                          {zh ? '换别名 / 重新发布' : 'Rotate / change alias'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDisable()}
                          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          🛑 {zh ? '停用链接' : 'Disable'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end border-t border-stone-100 bg-stone-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-200 bg-white px-4 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              {zh ? '关闭' : 'Close'}
            </button>
          </div>
        </div>
      </div>
      {dialog}
    </>
  );
}
