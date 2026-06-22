import { useI18n } from '@/core/i18n-context';

export function StatusBanner({
  isConnected,
  isLoading,
  error,
  onConnect,
}: {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
            <span
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-stone-300'}`}
              aria-hidden="true"
            />
            {isConnected ? t('vaultConnected') : t('demoMode')}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            {isConnected ? t('vaultConnectedDesc') : t('demoModeDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={isLoading}
          className="min-h-10 shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
        >
          {isLoading ? t('connecting') : isConnected ? t('reconnectVault') : t('connectVault')}
        </button>
      </div>
      {!isConnected ? (
        <div className="mt-4 grid gap-2 text-xs leading-5 text-stone-600 min-[420px]:grid-cols-3">
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="font-medium text-stone-900">{t('tabHome')}</span>
            <div className="mt-0.5">{t('tabHomeDesc')}</div>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="font-medium text-stone-900">{t('tabObjects')}</span>
            <div className="mt-0.5">{t('tabObjectsDesc')}</div>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="font-medium text-stone-900">{t('tabReviews')}</span>
            <div className="mt-0.5">{t('tabReviewsDesc')}</div>
          </div>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}
