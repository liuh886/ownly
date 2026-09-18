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

  return (
    <header className="mb-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* ── L1 品牌 / 身份 / 偏好：低频、幽灵样式，不抢视觉 ── */}
      <div className="flex h-10 items-center gap-2 px-4 sm:px-5">
        <span className="text-sm font-extrabold tracking-tight text-stone-950">Ownly</span>
        {membership.isPro ? (
          <button
            type="button"
            onClick={openLicenseModal}
            className="ownly-hit-expand rounded-full bg-stone-950 px-1.5 py-px text-[10px] font-bold text-white transition hover:bg-stone-800"
          >
            PRO
          </button>
        ) : null}
        <a
          href="https://liuh886.gumroad.com/l/ownly"
          target="_blank"
          rel="noopener noreferrer"
          className="ownly-hit-expand rounded-full px-2 py-0.5 text-[11px] font-medium text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
          title={t('sponsor')}
        >
          ♡ {t('sponsor')}
        </a>
        <div className="ml-auto flex items-center gap-1">
          <div className="ownly-account-slot ownly-account-slot--bare" data-account-slot aria-label={t('membership')} />
          <span className="mx-1 h-3 w-px bg-stone-200" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="ownly-hit-expand min-h-9 min-w-9 touch-manipulation rounded-md px-1.5 py-1 text-[11px] font-medium text-stone-400 transition duration-150 active:scale-95 hover:bg-stone-100 hover:text-stone-700"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as typeof currency)}
            aria-label={language === 'zh' ? '货币' : 'Currency'}
            className="min-h-9 cursor-pointer touch-manipulation rounded-md bg-transparent px-1 py-1 text-[11px] font-medium text-stone-400 outline-none transition hover:bg-stone-100 hover:text-stone-700"
          >
            {WYQD_CURRENCIES.map((currentCurrency) => (
              <option key={currentCurrency} value={currentCurrency}>
                {WYQD_CURRENCY_LABELS[currentCurrency]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── L2 页面上下文 + 核心工作区操作：唯一视觉重心 ── */}
      <div className="flex flex-col gap-3 border-t border-stone-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-stone-950 sm:text-xl">
            {heading.title}
          </h1>
          <p className="mt-0.5 text-xs text-stone-400">{heading.description}</p>
          <p className="mt-1 text-[11px] tabular-nums text-stone-400">
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
              className={`ownly-hit-expand inline-flex touch-manipulation items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:cursor-wait ${
                isConnected && !isLoading
                  ? 'bg-stone-100 text-stone-600 ring-1 ring-stone-200 hover:bg-stone-200/70 hover:text-stone-800'
                  : 'bg-stone-950 text-white shadow-sm hover:bg-stone-800 disabled:hover:bg-stone-950'
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
                  ? 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
                  : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
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
              className="inline-flex overflow-hidden rounded-full text-stone-400 ring-1 ring-stone-200"
            >
              <button
                type="button"
                onClick={onOpenAgentGuide}
                title="Agent / MCP"
                className="ownly-hit-expand border-r border-stone-200 px-2.5 py-1.5 text-xs font-medium transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-400"
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
              className="ownly-hit-expand rounded-full px-3 py-1.5 text-xs font-medium text-stone-400 ring-1 ring-stone-200 transition hover:bg-stone-100 hover:text-stone-700"
            >
              Agent
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
