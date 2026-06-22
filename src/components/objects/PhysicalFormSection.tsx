import { useI18n } from '@/core/i18n-context';
import { FIELD_CLASS } from '@/lib/ui-constants';
import type { PhysicalStatus } from '@/domain/types';
import { getPhysicalCategories, getPhysicalStatusOptions } from './composerDraftFactory';

export interface PhysicalFormSectionProps {
  disabled?: boolean;
  isSaving?: boolean;
  purchasedAt: string;
  setPurchasedAt: (value: string) => void;
  endedAt: string;
  setEndedAt: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  physicalStatus: PhysicalStatus;
  setPhysicalStatus: (value: PhysicalStatus) => void;
  salePrice: string;
  setSalePrice: (value: string) => void;
}

export function PhysicalFormSection({
  disabled,
  isSaving,
  purchasedAt,
  setPurchasedAt,
  endedAt,
  setEndedAt,
  category,
  setCategory,
  physicalStatus,
  setPhysicalStatus,
  salePrice,
  setSalePrice,
}: PhysicalFormSectionProps) {
  const { t } = useI18n();
  const physicalCategories = getPhysicalCategories(t);
  const physicalStatusOptions = getPhysicalStatusOptions(t);
  const fieldClass = FIELD_CLASS;

  return (
    <>
      <div className="grid grid-cols-1 gap-3">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('purchaseDate')}</span>
          <input
            value={purchasedAt}
            onChange={(event) => setPurchasedAt(event.target.value)}
            type="date"
            aria-label={t('purchaseDateAria')}
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('endDate')}</span>
          <input
            value={endedAt}
            onChange={(event) => setEndedAt(event.target.value)}
            type="date"
            aria-label={t('retireDateAria')}
            className={fieldClass}
            disabled={disabled || isSaving}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('categoryLabel')}</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={fieldClass}
            disabled={disabled || isSaving}
          >
            <option value="">{t('uncategorized')}</option>
            {physicalCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('status')}</span>
          <select
            value={physicalStatus}
            onChange={(event) => setPhysicalStatus(event.target.value as PhysicalStatus)}
            className={fieldClass}
            disabled={disabled || isSaving}
          >
            {physicalStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {physicalStatus === 'transferred' ? (
        <div className="grid grid-cols-1 gap-3">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('salePrice')}</span>
            <input
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="0"
              className={fieldClass}
              disabled={disabled || isSaving}
            />
          </label>
        </div>
      ) : null}
    </>
  );
}
