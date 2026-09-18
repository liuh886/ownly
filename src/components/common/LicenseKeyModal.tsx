'use client';

import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { Sheet } from './Sheet';

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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('activationTitle')}
      description={isWeb ? t('activationWebAlwaysPro') : t('activationDesc')}
      size="sm"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 touch-manipulation rounded-lg px-3 py-2 text-xs font-medium text-ink-muted transition hover:text-ink"
          >
            {t('close')}
          </button>
        </div>
      }
    >
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        {t('activationActive')} — {t('planProLifetime')}
      </div>

      {isWeb ? null : (
        <div className="mt-4">
          <a
            href={GUMROAD_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition hover:bg-primary-hover"
          >
            {t('sponsorButton')}
          </a>
        </div>
      )}
    </Sheet>
  );
}
