import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { WYQD_PRODUCT_SLOGAN } from '@/core/runtime';
import { WYQD_CURRENCIES, WYQD_CURRENCY_LABELS } from '@/lib/format';
import type { AppTab } from './BottomNav';
import type { WYQDTranslationKey } from '@/core/i18n';

const tabHeadingKeys: Record<AppTab, { title: WYQDTranslationKey; description: WYQDTranslationKey }> = {
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
}: {
  activeTab: AppTab;
  objectCount: number;
  snapshotCount: number;
  onConnectVault: () => void;
}) {
  const { t, language, setLanguage, currency, setCurrency } = useI18n();
  const { runtimeTarget, isConnected, isLoading, membership, openLicenseModal } = useOwnlyWorkspace();

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
            {t(tabHeadingKeys[activeTab].title)}
          </h1>
          <p className="mt-0.5 text-xs text-stone-400">{t(tabHeadingKeys[activeTab].description)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
            {isConnected ? t('vaultConnected') : isLoading ? t('connecting') : t('demoMode')}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">
            {objectCount} {t('objects')}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">
            {snapshotCount} {t('snapshots')}
          </span>
          <span className="mx-0.5 h-3 w-px bg-stone-200" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-200 hover:text-stone-900"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as typeof currency)}
            className="cursor-pointer rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 outline-none transition hover:bg-stone-200 hover:text-stone-900"
          >
            {WYQD_CURRENCIES.map((cur) => (
              <option key={cur} value={cur}>{WYQD_CURRENCY_LABELS[cur]}</option>
            ))}
          </select>
          {runtimeTarget === 'web' ? (
            <button
              type="button"
              onClick={onConnectVault}
              disabled={isLoading}
              className="rounded-full bg-stone-950 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {isLoading ? t('connecting') : isConnected ? t('reconnectVault') : t('connectVault')}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
