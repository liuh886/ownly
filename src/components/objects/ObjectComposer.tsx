'use client';

import { useRef, useEffect } from 'react';
import { useI18n } from '@/core/i18n-context';
import { FIELD_CLASS } from '@/lib/ui-constants';
import type { WYQDObject, WYQDObjectType } from '@/domain/types';

import { getQuickLineTemplates } from './composerQuickLine';
import { useComposerFormState } from './useComposerFormState';
import { PhysicalFormSection } from './PhysicalFormSection';
import { RecurringFormSection } from './RecurringFormSection';
import { ExperienceFormSection } from './ExperienceFormSection';

export interface ObjectComposerProps {
  disabled?: boolean;
  initialObject?: WYQDObject;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (object: WYQDObject, body: string) => Promise<void>;
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
}

export function ObjectComposer({
  disabled,
  initialObject,
  submitLabel,
  onCancel,
  onSubmit,
  autoFocus,
  onAutoFocusHandled,
}: ObjectComposerProps) {
  const { t, language } = useI18n();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && nameInputRef.current) {
      const timer = window.setTimeout(() => {
        nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInputRef.current?.focus();
        onAutoFocusHandled?.();
      }, 300);
      return () => window.clearTimeout(timer);
    }
  }, [autoFocus, onAutoFocusHandled]);

  const quickLineTemplates = getQuickLineTemplates(t, language);

  const {
    title, setTitle,
    objectType, setObjectType,
    amount, setAmount,
    category, setCategory,
    purchasedAt, setPurchasedAt,
    endedAt, setEndedAt,
    physicalStatus, setPhysicalStatus,
    recurringStatus, setRecurringStatus,
    billingCycle, setBillingCycle,
    billingDay, setBillingDay,
    paymentAccount, setPaymentAccount,
    recurringStartedAt, setRecurringStartedAt,
    experienceStatus, setExperienceStatus,
    actualAmount, setActualAmount,
    salePrice, setSalePrice,
    quickLine, setQuickLine,
    isSaving,
    errors, setErrors,
    experienceSubtype, setExperienceSubtype,
    locationCountry, setLocationCountry,
    locationRegion, setLocationRegion,
    locationCity, setLocationCity,
    locationCountryCode, setLocationCountryCode,
    locationLatitude, setLocationLatitude,
    locationLongitude, setLocationLongitude,
    extraLocations, setExtraLocations,
    canSubmit,
    applyQuickLineToForm,
    handleKeyDown,
    handleSubmit,
  } = useComposerFormState({
    initialObject,
    t,
    disabled,
    onSubmit,
    onCancel,
  });

  const fieldClass = FIELD_CLASS;

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-950">
            {initialObject ? t('editObject') : t('quickEntry')}
          </h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {initialObject ? t('editObjectDesc') : t('quickEntryDesc')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
          {objectType === 'physical' ? t('typePhysical') : objectType === 'recurring_cost' ? t('typeRecurringCost') : t('typeExperience')}
        </span>
      </div>

      <div className="space-y-4">
        {!initialObject ? (
          <div className="space-y-2">
            <label className="block">
              <div className="flex items-center gap-1.5">
                <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('pasteLine')}</span>
                <span className="relative group mb-1.5">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-stone-200 text-stone-500 text-[10px] cursor-help">?</span>
                  <span className="invisible group-hover:visible absolute left-6 top-0 z-50 w-64 p-3 bg-stone-900 text-white text-xs rounded-lg shadow-lg leading-relaxed">
                    {t('pasteLineFormatHelp')}
                  </span>
                </span>
              </div>
              <input
                value={quickLine}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuickLine(next);
                  applyQuickLineToForm(next);
                }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder={t('pasteLinePlaceholder')}
                className={`${fieldClass} bg-stone-50 focus:bg-white`}
                disabled={disabled || isSaving}
              />
              <p className="text-[11px] text-stone-400 mt-1">{t('pasteLineHint')}</p>
            </label>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {quickLineTemplates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => {
                    setQuickLine(template.value);
                    applyQuickLineToForm(template.value);
                  }}
                  className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
                  disabled={disabled || isSaving}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('name')}</span>
          <input
            ref={nameInputRef}
            value={title}
            onChange={(event) => { setTitle(event.target.value); if (errors.name) setErrors(prev => ({ ...prev, name: '' })) }}
            placeholder={t('namePlaceholder')}
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}

        <div className="grid grid-cols-1 gap-3">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('type')}</span>
            <select
              value={objectType}
              onChange={(event) => setObjectType(event.target.value as WYQDObjectType)}
              className={fieldClass}
              disabled={disabled || isSaving}
            >
              <option value="physical">{t('typePhysical')}</option>
              <option value="recurring_cost">{t('typeRecurringCost')}</option>
              <option value="one_time_experience">{t('typeExperience')}</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('amount')}</span>
            <input
              value={amount}
              onChange={(event) => { setAmount(event.target.value); if (errors.amount) setErrors(prev => ({ ...prev, amount: '' })) }}
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="5843"
              className={fieldClass}
              disabled={disabled || isSaving}
            />
          </label>
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
        </div>

        {objectType === 'physical' ? (
          <PhysicalFormSection
            disabled={disabled}
            isSaving={isSaving}
            purchasedAt={purchasedAt}
            setPurchasedAt={setPurchasedAt}
            endedAt={endedAt}
            setEndedAt={setEndedAt}
            category={category}
            setCategory={setCategory}
            physicalStatus={physicalStatus}
            setPhysicalStatus={setPhysicalStatus}
            salePrice={salePrice}
            setSalePrice={setSalePrice}
          />
        ) : null}

        {objectType === 'recurring_cost' ? (
          <RecurringFormSection
            disabled={disabled}
            isSaving={isSaving}
            billingCycle={billingCycle}
            setBillingCycle={setBillingCycle}
            recurringStatus={recurringStatus}
            setRecurringStatus={setRecurringStatus}
            recurringStartedAt={recurringStartedAt}
            setRecurringStartedAt={setRecurringStartedAt}
            billingDay={billingDay}
            setBillingDay={setBillingDay}
            paymentAccount={paymentAccount}
            setPaymentAccount={setPaymentAccount}
            errors={errors}
            setErrors={setErrors}
          />
        ) : null}

        {objectType === 'one_time_experience' ? (
          <ExperienceFormSection
            disabled={disabled}
            isSaving={isSaving}
            actualAmount={actualAmount}
            setActualAmount={setActualAmount}
            endedAt={endedAt}
            setEndedAt={setEndedAt}
            experienceStatus={experienceStatus}
            setExperienceStatus={setExperienceStatus}
            experienceSubtype={experienceSubtype}
            setExperienceSubtype={setExperienceSubtype}
            locationCity={locationCity}
            setLocationCity={setLocationCity}
            locationCountry={locationCountry}
            setLocationCountry={setLocationCountry}
            locationCountryCode={locationCountryCode}
            setLocationCountryCode={setLocationCountryCode}
            locationLatitude={locationLatitude}
            setLocationLatitude={setLocationLatitude}
            locationLongitude={locationLongitude}
            setLocationLongitude={setLocationLongitude}
            locationRegion={locationRegion}
            setLocationRegion={setLocationRegion}
            extraLocations={extraLocations}
            setExtraLocations={setExtraLocations}
          />
        ) : null}

        <div className="flex gap-2 pt-1">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="w-24 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
              disabled={isSaving}
            >
              {t('cancel')}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-w-0 flex-1 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {disabled ? t('connectVaultToWrite') : isSaving ? t('saving') : submitLabel || t('save')}
          </button>
        </div>
      </div>
    </form>
  );
}
