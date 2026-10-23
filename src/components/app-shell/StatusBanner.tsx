/**
 * The mode indicator.
 *
 * "Am I looking at my own data or at a demo?" is the one question a user of a
 * local-first app has to be able to answer at a glance, so this renders whenever
 * the answer is *not* the quiet one rather than only when something is wrong.
 *
 * Connected is deliberately absent. The header pill already carries that state,
 * and repeating it as a strip underneath repeated the same words twice — the
 * banner's job is the states the header cannot afford to shout about. The two
 * folder actions (change / disconnect) live in the pill's menu for the same
 * reason: one place to look, not three.
 */
import { useI18n } from '@/core/i18n-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';
import type { LocalDataMode } from '@/core/local-data-mode';

export function StatusBanner({
  mode,
  isLoading,
  error,
  onConnect,
  isWebRuntime,
  onRetry,
}: {
  mode: LocalDataMode;
  isLoading: boolean;
  error: string | null;
  onConnect: () => void;
  isWebRuntime: boolean;
  onRetry?: () => void;
}) {
  const { t, language } = useI18n();
  const localDataCopy = getOwnlyLocalDataCopy(language);

  if (mode === 'connected' && !error) return null;

  // Demo mode: never a collapsed strip. A user who cannot tell a sample record
  // from their own will type real data into a store that discards it on close.
  if (mode === 'demo' && !error) {
    return (
      <section
        role="status"
        className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              {language === 'zh' ? '演示模式' : 'Demo mode'}
            </div>
            <p className="mt-1.5 text-xs leading-5 text-amber-800">
              {isWebRuntime ? localDataCopy.demoNote : t('demoModeDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={onConnect}
            disabled={isLoading}
            className="min-h-11 shrink-0 touch-manipulation rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition duration-150 active:scale-[0.97] hover:border-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading
              ? isWebRuntime ? localDataCopy.connecting : t('connecting')
              : isWebRuntime ? localDataCopy.createOrOpen : t('connectVault')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
            <span className="h-2 w-2 shrink-0 rounded-full bg-stone-300" aria-hidden="true" />
            {mode === 'connected'
              ? isWebRuntime ? localDataCopy.connected : t('vaultConnected')
              : mode === 'demo' ? t('demoMode')
                : isWebRuntime ? localDataCopy.disconnected : t('demoMode')}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            {mode === 'connected'
              ? language === 'zh' ? '数据目录操作失败，请重试。' : 'The data folder operation failed. Please retry.'
              : mode === 'demo'
                ? isWebRuntime ? localDataCopy.demoNote : t('demoModeDesc')
                : isWebRuntime ? localDataCopy.disconnectedDescription : t('demoModeDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={isLoading}
          className="min-h-11 shrink-0 touch-manipulation rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition duration-150 active:scale-[0.97] hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
        >
          {isLoading
            ? isWebRuntime ? localDataCopy.connecting : t('connecting')
            : isWebRuntime ? localDataCopy.createOrOpen : t('connectVault')}
        </button>
      </div>
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
      {error ? (
        <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={onRetry ?? onConnect}
            disabled={isLoading}
            className="min-h-11 shrink-0 touch-manipulation rounded-md border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 transition duration-150 active:scale-[0.97] hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {language === 'zh' ? '重试' : 'Retry'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
