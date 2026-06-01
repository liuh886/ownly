'use client';

import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';

const GUMROAD_STORE_URL = 'https://liuh886.gumroad.com/l/ownly';

export function LicenseKeyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  onActivate?: (key: string) => void;
  onClear?: () => void;
  currentPlan?: string;
}) {
  const { t } = useI18n();
  const { runtimeTarget } = useOwnlyWorkspace();
  const isWeb = runtimeTarget === 'web';

  if (!open) return null;

  return (
    <div
      className="wyqd-license-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wyqd-license-modal-panel w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold tracking-tight text-stone-950">
          {t('activationTitle')}
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          {isWeb ? t('activationWebAlwaysPro') : t('activationDesc')}
        </p>

        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          {t('activationActive')} — {t('planProLifetime')}
        </div>

        {isWeb ? null : (
          <div className="mt-4">
            <a
              href={GUMROAD_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800"
            >
              {t('sponsorButton')}
            </a>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-medium text-stone-500 transition hover:text-stone-900"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
