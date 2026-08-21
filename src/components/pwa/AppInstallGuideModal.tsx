'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/core/i18n-context';

export interface AppInstallGuideModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'extension' | 'pwa';
  canPromptPwa?: boolean;
  onPromptPwa?: () => void;
}

export function AppInstallGuideModal({
  open,
  onClose,
  defaultTab = 'extension',
  canPromptPwa = false,
  onPromptPwa,
}: AppInstallGuideModalProps) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const [userTab, setUserTab] = useState<'extension' | 'pwa' | null>(null);
  const activeTab = userTab ?? defaultTab;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1600);
    } catch {
      // ignore clipboard error
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-modal-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 id="install-modal-title" className="text-base font-semibold text-stone-900">
              {zh ? '安装应用与浏览器扩展' : 'Install App & Browser Extension'}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {zh ? '选择在当前设备与浏览器中集成 Ownly 的方式' : 'Choose how you want to integrate Ownly on this device'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label={zh ? '关闭' : 'Close'}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-stone-100 bg-stone-50/50 px-5">
          <button
            type="button"
            onClick={() => setUserTab('extension')}
            className={`border-b-2 px-4 py-3 text-xs font-semibold transition ${
              activeTab === 'extension'
                ? 'border-stone-950 text-stone-950'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {zh ? '🌐 Ownly Capture 浏览器扩展' : '🌐 Ownly Capture Extension'}
          </button>
          <button
            type="button"
            onClick={() => setUserTab('pwa')}
            className={`border-b-2 px-4 py-3 text-xs font-semibold transition ${
              activeTab === 'pwa'
                ? 'border-stone-950 text-stone-950'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {zh ? '📱 独立客户端 (PWA)' : '📱 Standalone App (PWA)'}
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5 space-y-4">
          {activeTab === 'extension' ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50/70 p-3.5 ring-1 ring-amber-200/60">
                <p className="text-xs font-semibold text-amber-900">
                  {zh ? '🗺️ Google Maps 旅行地点与心得采集' : '🗺️ Google Maps Place & Judgment Capture'}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                  {zh
                    ? 'Ownly Capture 扩展可在浏览 Google Maps 时直接唤起侧边栏，快速记录地点、心得、评分与优先级，并在 Ownly Planner 中一键同步排期。'
                    : 'The Ownly Capture extension opens a native Side Panel in Google Maps to record places, priority, rating, and notes, then syncs them into Ownly Planner.'}
                </p>
              </div>

              <div className="space-y-3 text-xs text-stone-700">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-white">
                      1
                    </span>
                    <span className="font-semibold text-stone-900">
                      {zh ? '在本地构建扩展包' : 'Build Extension Locally'}
                    </span>
                  </div>
                  <div className="ml-7 flex items-center justify-between rounded-lg bg-stone-950 px-3 py-2 text-stone-100 font-mono text-[11px]">
                    <code>npm run build:extension</code>
                    <button
                      type="button"
                      onClick={() => void copyText('build_cmd', 'npm run build:extension')}
                      className="ml-2 rounded bg-white/10 px-2 py-0.5 text-[10px] font-sans font-medium text-stone-300 hover:bg-white/20 hover:text-white transition"
                    >
                      {copiedKey === 'build_cmd' ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')}
                    </button>
                  </div>
                  <p className="ml-7 text-[11px] text-stone-500">
                    {zh
                      ? '构建产物将保存在仓库的 dist/extension 目录。'
                      : 'Output bundle will be written to dist/extension.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-white">
                      2
                    </span>
                    <span className="font-semibold text-stone-900">
                      {zh ? '打开浏览器扩展管理页面' : 'Open Browser Extensions'}
                    </span>
                  </div>
                  <p className="ml-7 text-[11px] text-stone-600 leading-relaxed">
                    {zh
                      ? '在 Chrome 或 Edge 地址栏输入 '
                      : 'Enter '}
                    <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-900 font-mono">chrome://extensions</code>
                    {zh ? '（Edge 用户使用 ' : ' (or '}
                    <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-900 font-mono">edge://extensions</code>
                    {zh ? '），并开启右上角的' : ') and toggle on '}
                    <strong className="text-stone-900">{zh ? '「开发者模式」' : '「Developer mode」'}</strong>。
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-white">
                      3
                    </span>
                    <span className="font-semibold text-stone-900">
                      {zh ? '加载已解压的扩展程序' : 'Load Unpacked Extension'}
                    </span>
                  </div>
                  <p className="ml-7 text-[11px] text-stone-600 leading-relaxed">
                    {zh
                      ? '点击左上角的「加载已解压的扩展程序 (Load unpacked)」，选择项目中的 '
                      : 'Click 「Load unpacked」 and select the '}
                    <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-900 font-mono">dist/extension</code>
                    {zh ? ' 文件夹。' : ' folder in this repository.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-white">
                      4
                    </span>
                    <span className="font-semibold text-stone-900">
                      {zh ? '在 Google Maps 侧边栏采集与同步' : 'Capture in Google Maps & Sync'}
                    </span>
                  </div>
                  <p className="ml-7 text-[11px] text-stone-600 leading-relaxed">
                    {zh
                      ? '在 Google Maps 浏览地点时点击扩展图标记录心得；回到 Ownly Planner 页面点击「同步 Capture」即可将候选地点排期入库。'
                      : 'Click the Ownly Capture icon on Google Maps to record notes, then return to Ownly Planner and click 「Sync Capture」 to schedule.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50/70 p-3.5 ring-1 ring-emerald-200/60">
                <p className="text-xs font-semibold text-emerald-900">
                  {zh ? '🚀 独立窗口与离线启动' : '🚀 Standalone Window & Offline Shell'}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
                  {zh
                    ? '把 Ownly 安装为独立桌面/移动应用，享受无边框独立窗口与离线启动支持。所有记录仍只保存在你选择的本地文件夹中。'
                    : 'Install Ownly as a standalone app on your desktop or mobile. Your personal records remain in the local folder you choose.'}
                </p>
              </div>

              {canPromptPwa && onPromptPwa ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      onPromptPwa();
                      onClose();
                    }}
                    className="w-full rounded-xl bg-stone-950 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-stone-800"
                  >
                    {zh ? '✨ 一键安装到当前设备' : '✨ Install to this Device'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 text-xs text-stone-700">
                  <p className="font-semibold text-stone-900">
                    {zh ? '💡 浏览器菜单安装步骤：' : '💡 Install from Browser Menu:'}
                  </p>
                  <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-stone-600">
                    <li>
                      {zh
                        ? '在 Chrome 或 Edge 浏览器地址栏右侧，点击「安装 Ownly」图标 (⊞) 或右上角菜单。'
                        : 'Look for the Install icon (⊞) on the right side of the address bar, or open the browser menu.'}
                    </li>
                    <li>
                      {zh
                        ? '选择「应用」→「将此网站安装为应用」，并确认安装。'
                        : 'Select 「Apps」→「Install this site as an app」 (or 「Install Ownly」).'}
                    </li>
                    <li>
                      {zh
                        ? '安装完成后，Ownly 将作为独立窗口启动，并在桌面与启动台中生成图标。'
                        : 'Once installed, Ownly will launch in its own standalone window.'}
                    </li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-stone-100 bg-stone-50/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-stone-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-800"
          >
            {zh ? '好的' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}