'use client';

import { useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';

export function LicenseKeyModal({
  open,
  onClose,
  onActivate,
  onClear,
  currentPlan,
}: {
  open: boolean;
  onClose: () => void;
  onActivate: (key: string) => void;
  onClear: () => void;
  currentPlan: string;
}) {
  const { t } = useI18n();
  const { runtimeTarget } = useOwnlyWorkspace();
  const [key, setKey] = useState('');
  const isActive = currentPlan !== 'free';
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

        {isActive ? (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            {t('activationActive')} — {currentPlan.replace(/_/g, ' ')}
          </div>
        ) : null}

        {isWeb ? null : (
          <>
            <div className="mt-4">
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('licenseModalInputPlaceholder')}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (key.trim()) {
                    onActivate(key.trim());
                    setKey('');
                  }
                }}
                disabled={!key.trim()}
                className="flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {t('licenseModalActivate')}
              </button>
            </div>
          </>
        )}

        {isActive && !isWeb ? (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="text-xs text-stone-400">{t('licenseModalClearDesc')}</p>
            <button
              type="button"
              onClick={() => {
                onClear();
                setKey('');
              }}
              className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50"
            >
              {t('activationDeactivate')}
            </button>
          </div>
        ) : null}

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
