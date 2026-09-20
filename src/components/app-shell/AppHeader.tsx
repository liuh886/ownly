import { Heart, MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';
import { getWYQDRuntimeCapabilities } from '@/core/runtime-capabilities';
import { WYQD_CURRENCIES, WYQD_CURRENCY_LABELS } from '@/lib/format';
import { PwaInstallButton } from '@/components/pwa/PwaInstallButton';
import type { AppTab } from './BottomNav';
import type { WYQDTranslationKey } from '@/core/i18n';
import './account-integration.css';

const tabHeadingKeys: Record<Exclude<AppTab, 'planner'>, { title: WYQDTranslationKey; description: WYQDTranslationKey }> = {
  home: { title: 'tabHome', description: 'tabHomeDesc' },
  objects: { title: 'tabObjects', description: 'tabObjectsDesc' },
  accounts: { title: 'tabAccounts', description: 'tabAccountsDesc' },
  reviews: { title: 'tabReviews', description: 'tabReviewsDesc' },
};

export function AppHeader({
  activeTab,
  objectCount,
  snapshotCount,
  onConnectVault,
  onOpenAgentGuide,
}: {
  activeTab: AppTab;
  objectCount: number;
  snapshotCount: number;
  onConnectVault: () => void;
  onOpenAgentGuide: () => void;
}) {
  const { t, language, setLanguage, currency, setCurrency } = useI18n();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const { runtimeTarget, isConnected, isLoading, membership, openLicenseModal } = useOwnlyWorkspace();
  const runtimeCapabilities = getWYQDRuntimeCapabilities(runtimeTarget);
  const usesBrowserLocalData = runtimeCapabilities.dataRuntime === 'browser';
  const localDataCopy = getOwnlyLocalDataCopy(language);
  const connectionLabel = isLoading
    ? language === 'zh' ? '正在连接…' : 'Connecting…'
    : isConnected
      ? usesBrowserLocalData ? localDataCopy.connected : t('vaultConnected')
      : usesBrowserLocalData ? localDataCopy.createOrOpen : t('demoMode');
  const connectionTitle = isConnected && !isLoading
    ? language === 'zh'
      ? '已连接。点击可更换数据目录。'
      : 'Connected. Click to change the data folder.'
    : undefined;
  const heading = activeTab === 'planner'
    ? {
        title: 'Planner',
        description: language === 'zh'
          ? '把 Google Maps 研究候选填入可执行的日程骨架'
          : 'Turn Google Maps research into an executable day plan',
      }
    : {
        title: t(tabHeadingKeys[activeTab].title),
        description: t(tabHeadingKeys[activeTab].description),
      };

  const closeOverflow = () => setOverflowOpen(false);

  useEffect(() => {
    if (!overflowOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverflowOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [overflowOpen]);

  return (
    <header className="mb-6 rounded-2xl border border-line bg-surface shadow-sm">
      {/* ── L1 品牌 / 身份 / 偏好：低频、幽灵样式，不抢视觉 ── */}
      <div className="flex h-10 items-center gap-2 px-4 sm:px-5">
        <span className="text-sm font-extrabold tracking-tight text-ink">Ownly</span>
        {membership.isPro ? (
          <button
            type="button"
            onClick={openLicenseModal}
            className="ownly-hit-expand rounded-full bg-primary px-1.5 py-px text-[10px] font-bold text-on-primary transition hover:bg-primary-hover"
          >
            PRO
          </button>
        ) : null}
        <a
          href="https://liuh886.gumroad.com/l/ownly"
          target="_blank"
          rel="noopener noreferrer"
          className="ownly-hit-expand hidden shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-muted transition hover:bg-rose-50 hover:text-rose-600 min-[480px]:inline"
          title={t('sponsor')}
        >
          <Heart size={13} aria-hidden="true" /> {t('sponsor')}
        </a>
        <div className="ml-auto flex items-center gap-1">
          <div className="ownly-account-slot ownly-account-slot--bare" data-account-slot aria-label={t('membership')} />
          <span className="mx-1 hidden h-3 w-px bg-surface-sunken sm:block" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="ownly-hit-expand hidden min-h-9 min-w-9 touch-manipulation rounded-md px-1.5 py-1 text-[11px] font-medium text-ink-muted transition duration-150 active:scale-95 hover:bg-surface-muted hover:text-ink-secondary sm:block"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as typeof currency)}
            aria-label={language === 'zh' ? '货币' : 'Currency'}
            className="hidden min-h-9 cursor-pointer touch-manipulation rounded-md bg-transparent px-1 py-1 text-base font-medium text-ink-muted outline-none transition hover:bg-surface-muted hover:text-ink-secondary sm:block sm:text-[11px]"
          >
            {WYQD_CURRENCIES.map((currentCurrency) => (
              <option key={currentCurrency} value={currentCurrency}>
                {WYQD_CURRENCY_LABELS[currentCurrency]}
              </option>
            ))}
          </select>
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setOverflowOpen((open) => !open)}
              aria-expanded={overflowOpen}
              aria-haspopup="menu"
              aria-label={language === 'zh' ? '更多选项' : 'More options'}
              className="ownly-hit-expand flex min-h-9 min-w-9 touch-manipulation items-center justify-center rounded-md px-1.5 py-1 text-sm font-bold text-ink-muted transition duration-150 active:scale-95 hover:bg-surface-muted hover:text-ink-secondary"
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
            {overflowOpen ? (
              <button
                type="button"
                onClick={closeOverflow}
                aria-hidden="true"
                tabIndex={-1}
                className="fixed inset-0 z-40 cursor-default"
              />
            ) : null}
            {overflowOpen ? (
              <div
                role="menu"
                aria-label={language === 'zh' ? '更多选项' : 'More options'}
                className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
              >
                <a
                  href="https://liuh886.gumroad.com/l/ownly"
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  className="flex min-h-11 touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-muted min-[480px]:hidden"
                >
                  <Heart size={13} aria-hidden="true" /> {t('sponsor')}
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLanguage(language === 'zh' ? 'en' : 'zh');
                    closeOverflow();
                  }}
                  className="flex min-h-11 w-full touch-manipulation items-center rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-muted"
                >
                  {language === 'zh' ? 'EN' : '中文'}
                </button>
                <label className="flex min-h-11 touch-manipulation items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary">
                  <span>{language === 'zh' ? '货币' : 'Currency'}</span>
                  <select
                    value={currency}
                    onChange={(event) => {
                      setCurrency(event.target.value as typeof currency);
                      closeOverflow();
                    }}
                    aria-label={language === 'zh' ? '货币' : 'Currency'}
                    className="cursor-pointer rounded-md bg-surface-muted px-1.5 py-1 text-base font-medium text-ink-secondary outline-none"
                  >
                    {WYQD_CURRENCIES.map((currentCurrency) => (
                      <option key={currentCurrency} value={currentCurrency}>
                        {WYQD_CURRENCY_LABELS[currentCurrency]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── L2 页面上下文 + 核心工作区操作：唯一视觉重心 ── */}
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
            {heading.title}
          </h1>
          <p className="mt-0.5 text-xs text-ink-muted">{heading.description}</p>
          <p className="mt-1 text-[11px] tabular-nums text-ink-muted">
            {objectCount} {t('objects')} · {snapshotCount} {t('snapshots')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runtimeCapabilities.canPromptForLocalData ? (
            <button
              type="button"
              onClick={onConnectVault}
              disabled={isLoading}
              title={connectionTitle}
              className={`ownly-hit-expand inline-flex touch-manipulation items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted disabled:cursor-wait ${
                isConnected && !isLoading
                  ? 'bg-surface-muted text-ink-secondary ring-1 ring-line hover:bg-surface-sunken hover:text-ink'
                  : 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover disabled:hover:bg-primary'
              }`}
            >
              {isConnected && !isLoading ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
              ) : null}
              {connectionLabel}
              {isConnected && !isLoading ? <span aria-hidden="true">▾</span> : null}
            </button>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                isConnected
                  ? 'bg-surface-muted text-ink-muted ring-1 ring-line'
                  : 'bg-surface-muted text-ink-muted ring-1 ring-line'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-300' : 'bg-stone-400'}`}
                aria-hidden="true"
              />
              {connectionLabel}
            </span>
          )}
          {runtimeCapabilities.canPromptForLocalData && runtimeCapabilities.canInstallPwa ? (
            <div
              role="group"
              aria-label={language === 'zh' ? 'Ownly 外部能力' : 'Ownly external tools'}
              className="inline-flex overflow-hidden rounded-full text-ink-muted ring-1 ring-line"
            >
              <button
                type="button"
                onClick={onOpenAgentGuide}
                title="Agent / MCP"
                className="ownly-hit-expand border-r border-line px-2.5 py-1.5 text-xs font-medium transition hover:bg-surface-muted hover:text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-muted"
              >
                Agent
              </button>
              <PwaInstallButton variant="segmented" />
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAgentGuide}
              title="Agent / MCP"
              className="ownly-hit-expand rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted ring-1 ring-line transition hover:bg-surface-muted hover:text-ink-secondary"
            >
              Agent
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
