import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';
import { WYQD_PRODUCT_SLOGAN } from '@/core/runtime';
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
    <header className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-stone-100 bg-gradient-to-r from-stone-50/80 to-stone-100/40 px-4 py-2.5 sm:px-5">
        <span className="text-lg font-bold tracking-tight text-stone-950">Ownly</span>
        {membership.isPro ? (
          <button
            type="button"
            onClick={openLicenseModal}
            className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-bold text-white transition hover:bg-stone-800"
          >
            PRO
          </button>
        ) : null}
        <a
          href="https://liuh886.gumroad.com/l/ownly"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-100 hover:text-rose-700"
          title={t('sponsor')}
        >
          ❤ {t('sponsor')}
        </a>
        <span className="ml-auto text-[11px] text-stone-400">{WYQD_PRODUCT_SLOGAN}</span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-stone-950 sm:text-xl">
            {heading.title}
          </h1>
          <p className="mt-0.5 text-xs text-stone-400">{heading.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {runtimeCapabilities.canPromptForLocalData ? (
            <button
              type="button"
              onClick={onConnectVault}
              disabled={isLoading}
              title={connectionTitle}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-wait ${
                isConnected && !isLoading
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 hover:text-emerald-900'
                  : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200 hover:bg-stone-200 hover:text-stone-900 disabled:hover:bg-stone-100 disabled:hover:text-stone-500'
              }`}
            >
              {isConnected && !isLoading ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              ) : null}
              {connectionLabel}
              {isConnected && !isLoading ? <span aria-hidden="true">▾</span> : null}
            </button>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-stone-400'}`}
                aria-hidden="true"
              />
              {connectionLabel}
            </span>
          )}
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">
            {objectCount} {t('objects')}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">
            {snapshotCount} {t('snapshots')}
          </span>
          <span className="mx-0.5 h-3 w-px bg-stone-200" aria-hidden="true" />
          <div className="ownly-account-slot" data-account-slot aria-label={t('membership')} />
          {runtimeCapabilities.canPromptForLocalData && runtimeCapabilities.canInstallPwa ? (
            <div
              role="group"
              aria-label={language === 'zh' ? 'Ownly 外部能力' : 'Ownly external tools'}
              className="inline-flex overflow-hidden rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            >
              <button
                type="button"
                onClick={onOpenAgentGuide}
                title="Agent / MCP"
                className="border-r border-emerald-200 px-2.5 py-1 text-[11px] font-semibold transition hover:bg-emerald-100 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600"
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
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100 hover:text-emerald-900"
            >
              Agent
            </button>
          )}
          <button
            type="button"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-200 hover:text-stone-900"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as typeof currency)}
            className="cursor-pointer rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 outline-none transition hover:bg-stone-200 hover:text-stone-900"
          >
            {WYQD_CURRENCIES.map((currentCurrency) => (
              <option key={currentCurrency} value={currentCurrency}>
                {WYQD_CURRENCY_LABELS[currentCurrency]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
