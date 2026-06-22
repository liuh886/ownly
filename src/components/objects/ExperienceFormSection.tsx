import { useI18n } from '@/core/i18n-context';
import { FIELD_CLASS } from '@/lib/ui-constants';
import { CitySearchInput } from '@/components/common/CitySearchInput';
import type { OneTimeExperienceStatus } from '@/domain/types';
import { getExperienceStatusOptions } from './composerDraftFactory';

export interface ExperienceFormSectionProps {
  disabled?: boolean;
  isSaving?: boolean;
  actualAmount: string;
  setActualAmount: (value: string) => void;
  endedAt: string;
  setEndedAt: (value: string) => void;
  experienceStatus: OneTimeExperienceStatus;
  setExperienceStatus: (value: OneTimeExperienceStatus) => void;
  experienceSubtype: string;
  setExperienceSubtype: (value: string) => void;
  locationCity: string;
  setLocationCity: (value: string) => void;
  locationCountry: string;
  setLocationCountry: (value: string) => void;
  locationCountryCode: string;
  setLocationCountryCode: (value: string) => void;
  locationLatitude: string;
  setLocationLatitude: (value: string) => void;
  locationLongitude: string;
  setLocationLongitude: (value: string) => void;
  locationRegion: string;
  setLocationRegion: (value: string) => void;
  extraLocations: Array<{ city: string; country: string; countryCode: string; lat: string; lng: string }>;
  setExtraLocations: (value: Array<{ city: string; country: string; countryCode: string; lat: string; lng: string }>) => void;
}

export function ExperienceFormSection({
  disabled,
  isSaving,
  actualAmount,
  setActualAmount,
  endedAt,
  setEndedAt,
  experienceStatus,
  setExperienceStatus,
  experienceSubtype,
  setExperienceSubtype,
  locationCity,
  setLocationCity,
  locationCountry,
  setLocationCountry,
  locationCountryCode,
  setLocationCountryCode,
  locationLatitude,
  setLocationLatitude,
  locationLongitude,
  setLocationLongitude,
  locationRegion,
  setLocationRegion,
  extraLocations,
  setExtraLocations,
}: ExperienceFormSectionProps) {
  const { t } = useI18n();
  const experienceStatusOptions = getExperienceStatusOptions(t);
  const fieldClass = FIELD_CLASS;

  return (
    <div className="grid grid-cols-1 gap-3">
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('actualAmount')}</span>
        <input
          value={actualAmount}
          onChange={(event) => setActualAmount(event.target.value)}
          type="number"
          min="0"
          inputMode="decimal"
          placeholder={t('optional')}
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
          aria-label={t('experienceEndDateAria')}
          className={fieldClass}
          disabled={disabled || isSaving}
        />
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('status')}</span>
        <select
          value={experienceStatus}
          onChange={(event) =>
            setExperienceStatus(event.target.value as OneTimeExperienceStatus)
          }
          className={fieldClass}
          disabled={disabled || isSaving}
        >
          {experienceStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('travelSubtype')}</span>
        <select
          value={experienceSubtype}
          onChange={(event) => setExperienceSubtype(event.target.value)}
          className={fieldClass}
          disabled={disabled || isSaving}
        >
          <option value="">{t('typeExperience')}</option>
          <option value="travel_worldview">{t('travelSubtype')}</option>
        </select>
      </label>
      {experienceSubtype === 'travel_worldview' ? (
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('travelCity')}</span>
            <CitySearchInput
              initialValue={locationCity || undefined}
              onSelect={(city) => {
                setLocationCity(city.name);
                setLocationCountry(city.country);
                setLocationCountryCode(city.countryCode);
                setLocationLatitude(String(city.latitude));
                setLocationLongitude(String(city.longitude));
              }}
              disabled={disabled || isSaving}
            />
          </div>
          {locationCity ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              {[locationCity, locationCountry, locationCountryCode].filter(Boolean).join(', ')}
              {locationLatitude && locationLongitude
                ? ` (${locationLatitude}, ${locationLongitude})`
                : ''}
            </div>
          ) : null}
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t('travelRegion')}</span>
            <input
              value={locationRegion}
              onChange={(event) => setLocationRegion(event.target.value)}
              placeholder={t('optional')}
              className={fieldClass}
              disabled={disabled || isSaving}
            />
          </label>

          {/* Additional stops */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">{t('additionalStops')}</span>
              <button
                type="button"
                onClick={() => setExtraLocations([...extraLocations, { city: '', country: '', countryCode: '', lat: '', lng: '' }])}
                className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
                disabled={disabled || isSaving}
              >
                + {t('addStop')}
              </button>
            </div>
            {extraLocations.map((loc, idx: number) => (
              <div key={idx} className="mb-2 rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-stone-400">{t('stopN').replace('{n}', String(idx + 2))}</span>
                  <button
                    type="button"
                    onClick={() => setExtraLocations(extraLocations.filter((_, i: number) => i !== idx))}
                    className="text-[11px] text-stone-400 hover:text-red-600 transition"
                    disabled={disabled || isSaving}
                  >
                    ✕
                  </button>
                </div>
                <CitySearchInput
                  initialValue={loc.city || undefined}
                  onSelect={(city) => {
                    const updated = [...extraLocations];
                    updated[idx] = {
                      city: city.name,
                      country: city.country,
                      countryCode: city.countryCode,
                      lat: String(city.latitude),
                      lng: String(city.longitude),
                    };
                    setExtraLocations(updated);
                  }}
                  disabled={disabled || isSaving}
                />
                {loc.city ? (
                  <div className="rounded-md bg-white px-2 py-1 text-[11px] text-stone-500">
                    {[loc.city, loc.country, loc.countryCode].filter(Boolean).join(', ')}
                    {loc.lat && loc.lng ? ` (${loc.lat}, ${loc.lng})` : ''}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
