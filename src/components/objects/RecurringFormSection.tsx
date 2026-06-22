import { useI18n } from '@/core/i18n-context';
import { FIELD_CLASS } from '@/lib/ui-constants';
import type { BillingCycle, RecurringCostStatus } from '@/domain/types';
import { getBillingCycleOptions, getRecurringStatusOptions } from './composerDraftFactory';

export interface RecurringFormSectionProps {
  disabled?: boolean;
  isSaving?: boolean;
  billingCycle: BillingCycle;
  setBillingCycle: (value: BillingCycle) => void;
  recurringStatus: RecurringCostStatus;
  setRecurringStatus: (value: RecurringCostStatus) => void;
  recurringStartedAt: string;
  setRecurringStartedAt: (value: string) => void;
  billingDay: string;
  setBillingDay: (value: string) => void;
  paymentAccount: string;
  setPaymentAccount: (value: string) => void;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function RecurringFormSection({
  disabled,
  isSaving,
  billingCycle,
  setBillingCycle,
  recurringStatus,
  setRecurringStatus,
  recurringStartedAt,
  setRecurringStartedAt,
  billingDay,
  setBillingDay,
  paymentAccount,
  setPaymentAccount,
  errors,
  setErrors,
}: RecurringFormSectionProps) {
  const { t } = useI18n();
  const billingCycleOptions = getBillingCycleOptions(t);
  const recurringStatusOptions = getRecurringStatusOptions(t);
  const fieldClass = FIELD_CLASS;

  return (
    <>
      <div className="grid grid-cols-1 gap-3">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('billingCycle')}</span>
          <select
            value={billingCycle}
            onChange={(event) => setBillingCycle(event.target.value as BillingCycle)}
            className={fieldClass}
            disabled={disabled || isSaving}
          >
            {billingCycleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('status')}</span>
          <select
            value={recurringStatus}
            onChange={(event) => setRecurringStatus(event.target.value as RecurringCostStatus)}
            className={fieldClass}
            disabled={disabled || isSaving}
          >
            {recurringStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('startDate')}</span>
          <input
            value={recurringStartedAt}
            onChange={(event) => setRecurringStartedAt(event.target.value)}
            type="date"
            aria-label={t('startDate')}
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('billingDay')}</span>
          <input
            value={billingDay}
            onChange={(event) => { setBillingDay(event.target.value); if (errors.billingDay) setErrors((prev) => ({ ...prev, billingDay: '' })) }}
            type="number"
            min="1"
            max="31"
            inputMode="numeric"
            placeholder={t('billingDayPlaceholder')}
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>
        {errors.billingDay && <p className="text-xs text-red-500 mt-1">{errors.billingDay}</p>}
        <label className="block min-w-0 sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('paymentAccount')}</span>
          <input
            value={paymentAccount}
            onChange={(event) => setPaymentAccount(event.target.value)}
            placeholder={t('paymentAccountPlaceholder')}
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>
      </div>
    </>
  );
}
