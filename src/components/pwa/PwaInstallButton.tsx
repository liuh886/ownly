'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/core/i18n-context';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const basePath = process.env.NEXT_PUBLIC_OWNLY_BASE_PATH ?? '';
const appScope = `${basePath}/app/`;
const INSTALL_NUDGE_DISMISSED_KEY = 'ownly_pwa_install_nudge_dismissed';

export function PwaInstallButton() {
  const { language } = useI18n();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: appScope }).catch((error) => {
        console.warn('[Ownly PWA] Service worker registration failed.', error);
      });
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      if (window.localStorage.getItem(INSTALL_NUDGE_DISMISSED_KEY) !== 'true') {
        setShowNudge(true);
      }
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowNudge(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setShowNudge(false);
    if (choice.outcome === 'accepted') setInstalled(true);
  }

  function dismissNudge() {
    window.localStorage.setItem(INSTALL_NUDGE_DISMISSED_KEY, 'true');
    setShowNudge(false);
  }

  if (installed || !installPrompt) return null;

  const label = language === 'zh' ? '安装应用' : 'Install app';
  const title = language === 'zh' ? '将 Ownly 安装到当前设备' : 'Install Ownly on this device';
  const nudgeTitle = language === 'zh' ? '把 Ownly 安装为独立应用' : 'Install Ownly as a standalone app';
  const nudgeText = language === 'zh'
    ? '获得更专注的启动方式和离线应用壳；你的个人记录仍只保存在本地文件夹。'
    : 'Get a focused launch experience and offline app shell. Your personal records still remain in the local folder you choose.';
  const later = language === 'zh' ? '以后再说' : 'Maybe later';

  return (
    <>
      <button
        type="button"
        onClick={() => void installApp()}
        className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100 hover:text-emerald-900"
        title={title}
      >
        {label}
      </button>

      {showNudge ? (
        <aside className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-[0_24px_70px_-28px_rgba(28,25,23,0.55)] backdrop-blur-xl sm:left-auto sm:right-6" aria-label={nudgeTitle}>
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-950 text-sm font-semibold text-white">O</span>
            <div>
              <h2 className="text-sm font-semibold text-stone-950">{nudgeTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">{nudgeText}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={dismissNudge} className="rounded-full px-3 py-2 text-xs font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800">
              {later}
            </button>
            <button type="button" onClick={() => void installApp()} className="rounded-full bg-stone-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-800">
              {label}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
