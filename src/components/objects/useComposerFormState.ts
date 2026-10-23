import { useCallback, useRef, useState } from 'react';
import { isValidISODate } from '@/domain/date';
import type { WYQDTranslationKey } from '@/core/i18n';
import type {
  BillingCycle,
  OneTimeExperienceStatus,
  PhysicalStatus,
  RecurringCostStatus,
  WYQDObject,
  WYQDObjectType,
} from '@/domain/types';
import { applyQuickLine } from './composerQuickLine';
import { createObjectDraft, getInitialAmount, updateObjectDraft } from './composerDraftFactory';

export function useComposerFormState({
  initialObject,
  t,
  disabled,
  currency = 'CNY',
  onSubmit,
  onCancel,
}: {
  initialObject?: WYQDObject;
  t: (key: WYQDTranslationKey) => string;
  disabled?: boolean;
  currency?: string;
  onSubmit: (object: WYQDObject, body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initialObject?.title || '');
  const [objectType, setObjectType] = useState<WYQDObjectType>(
    initialObject?.object_type || 'physical',
  );
  const [amount, setAmount] = useState(getInitialAmount(initialObject));
  const [category, setCategory] = useState(initialObject?.category || '');
  const [purchasedAt, setPurchasedAt] = useState(
    initialObject?.object_type === 'physical' ? initialObject.purchased_at || '' : '',
  );
  const [endedAt, setEndedAt] = useState(
    initialObject?.object_type === 'physical'
      ? initialObject.ended_at || ''
      : initialObject?.object_type === 'one_time_experience'
        ? initialObject.ended_at || ''
        : '',
  );
  const [physicalStatus, setPhysicalStatus] = useState<PhysicalStatus>(
    initialObject?.object_type === 'physical' ? initialObject.status : 'observing',
  );
  const [recurringStatus, setRecurringStatus] = useState<RecurringCostStatus>(
    initialObject?.object_type === 'recurring_cost' ? initialObject.status : 'active',
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    initialObject?.object_type === 'recurring_cost' ? initialObject.billing_cycle || 'monthly' : 'monthly',
  );
  const [billingDay, setBillingDay] = useState(
    initialObject?.object_type === 'recurring_cost' && initialObject.billing_day
      ? String(initialObject.billing_day)
      : '',
  );
  const [paymentAccount, setPaymentAccount] = useState(
    initialObject?.object_type === 'recurring_cost' ? initialObject.payment_account || '' : '',
  );
  const [recurringStartedAt, setRecurringStartedAt] = useState(
    initialObject?.object_type === 'recurring_cost' ? initialObject.started_at || '' : '',
  );
  const [experienceStatus, setExperienceStatus] = useState<OneTimeExperienceStatus>(
    initialObject?.object_type === 'one_time_experience' ? initialObject.status : 'planned',
  );
  const [actualAmount, setActualAmount] = useState(
    initialObject?.object_type === 'one_time_experience' && initialObject.actual_total != null
      ? String(initialObject.actual_total)
      : '',
  );
  const [salePrice, setSalePrice] = useState(
    initialObject?.object_type === 'physical' && initialObject.sale_price != null
      ? String(initialObject.sale_price)
      : '',
  );
  const [quickLine, setQuickLine] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [annualizedCost, setAnnualizedCost] = useState(
    initialObject?.object_type === 'recurring_cost' && initialObject.annualized_cost != null ? String(initialObject.annualized_cost) : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [experienceSubtype, setExperienceSubtype] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.experience_subtype || '' : '',
  );
  const [locationCountry, setLocationCountry] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.country || '' : '',
  );
  const [locationRegion, setLocationRegion] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.region || '' : '',
  );
  const [locationCity, setLocationCity] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.city || '' : '',
  );
  const [locationCountryCode, setLocationCountryCode] = useState(
    initialObject?.object_type === 'one_time_experience' ? initialObject.location?.country_code || '' : '',
  );
  const [locationLatitude, setLocationLatitude] = useState(
    initialObject?.object_type === 'one_time_experience' && initialObject.location?.latitude != null
      ? String(initialObject.location.latitude) : '',
  );
  const [locationLongitude, setLocationLongitude] = useState(
    initialObject?.object_type === 'one_time_experience' && initialObject.location?.longitude != null
      ? String(initialObject.location.longitude) : '',
  );
  const [extraLocations, setExtraLocations] = useState<Array<{
    city: string; country: string; countryCode: string; lat: string; lng: string;
  }>>(
    initialObject?.object_type === 'one_time_experience' && Array.isArray(initialObject.locations)
      ? initialObject.locations.map((loc) => ({
          city: loc.city || '',
          country: loc.country || '',
          countryCode: loc.country_code || '',
          lat: loc.latitude != null ? String(loc.latitude) : '',
          lng: loc.longitude != null ? String(loc.longitude) : '',
        }))
      : [],
  );

  const parsedBillingDay = Number(billingDay);
  const isBillingDayValid =
    objectType !== 'recurring_cost' ||
    !billingDay.trim() ||
    (Number.isInteger(parsedBillingDay) && parsedBillingDay >= 1 && parsedBillingDay <= 31);
  const isNonnegativeAmount = (value: string) => Boolean(value.trim()) && Number.isFinite(Number(value)) && Number(value) >= 0;
  const canSubmit =
    !disabled && Boolean(title.trim()) && isNonnegativeAmount(amount) && isBillingDayValid && !isSaving;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.name = t('validationTitleRequired')
    if (!isNonnegativeAmount(amount)) e.amount = t('validationAmountPositive')
    for (const [name, value] of Object.entries({ actualAmount: objectType === 'one_time_experience' ? actualAmount : '', salePrice: objectType === 'physical' ? salePrice : '' })) {
      if (value.trim() && !isNonnegativeAmount(value)) e[name] = t('validationAmountPositive');
    }
    if (objectType === 'recurring_cost' && !isBillingDayValid) {
      e.billingDay = t('validationBillingDayRange')
    }
    if (objectType === 'recurring_cost' && billingCycle === 'custom' && !isNonnegativeAmount(annualizedCost)) e.annualizedCost = t('validationAnnualCost');
    const startDate = objectType === 'physical' ? purchasedAt : objectType === 'recurring_cost' ? recurringStartedAt : '';
    const endDate = objectType === 'recurring_cost' ? '' : endedAt;
    if ((startDate && !isValidISODate(startDate)) || (endDate && !isValidISODate(endDate)) || (startDate && endDate && endDate < startDate)) e.dates = t('validationDateOrder');
    if (objectType === 'one_time_experience' && experienceSubtype === 'travel_worldview') {
      const validCoordinate = (value: string, limit: number) => !value.trim() || (Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit);
      if (!validCoordinate(locationLatitude, 90) || !validCoordinate(locationLongitude, 180) || extraLocations.some((loc) => !validCoordinate(loc.lat, 90) || !validCoordinate(loc.lng, 180))) e.coordinates = t('validationCoordinates');
    }
    return e
  }

  const applyQuickLineToForm = useCallback((next: string) => {
    applyQuickLine(next, {
      setTitle,
      setAmount,
      setPurchasedAt,
      setEndedAt,
      setCategory,
      setPhysicalStatus,
      setRecurringStatus,
      setBillingCycle,
      setBillingDay,
      setPaymentAccount,
      setRecurringStartedAt,
      setExperienceStatus,
      setActualAmount,
      setObjectType,
      setExperienceSubtype,
      setLocationCountry,
      setLocationCountryCode,
      setLocationCity,
      setLocationLatitude,
      setLocationLongitude,
    });
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && onCancel && !savingRef.current) {
      event.preventDefault();
      onCancel();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (canSubmit) {
        void handleSubmit(event as unknown as React.SyntheticEvent<HTMLFormElement>);
      }
    }
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || disabled) return;
    const v = validate();
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }
    setErrors({});
    if (!canSubmit) return;

    setIsSaving(true);
    savingRef.current = true;
    try {
      const isTravel = objectType === 'one_time_experience' && experienceSubtype === 'travel_worldview';
      const travelLocation = isTravel && (locationCountry || locationRegion || locationCity || locationCountryCode || locationLatitude || locationLongitude)
        ? {
            country: locationCountry || undefined,
            region: locationRegion || undefined,
            city: locationCity || undefined,
            country_code: locationCountryCode || undefined,
            latitude: locationLatitude ? Number(locationLatitude) : undefined,
            longitude: locationLongitude ? Number(locationLongitude) : undefined,
          }
        : undefined;
      const parsedExtraLocations = isTravel
        ? extraLocations
            .filter((loc) => loc.city || loc.lat || loc.lng)
            .map((loc) => ({
              city: loc.city || undefined,
              country: loc.country || undefined,
              country_code: loc.countryCode || undefined,
              latitude: loc.lat ? Number(loc.lat) : undefined,
              longitude: loc.lng ? Number(loc.lng) : undefined,
            }))
        : [];

      const values = {
        currency,
        title: title.trim(),
        objectType,
        amount: Number(amount),
        category,
        purchasedAt,
        endedAt,
        status: physicalStatus,
        recurringStatus,
        billingCycle,
        billingDay: billingDay.trim() ? Number(billingDay) : undefined,
        paymentAccount,
        recurringStartedAt,
        experienceStatus,
        actualAmount: actualAmount.trim() ? Number(actualAmount) : undefined,
        salePrice: salePrice.trim() ? Number(salePrice) : undefined,
        annualizedCost: billingCycle === 'custom' ? Number(annualizedCost) : undefined,
        experienceSubtype: experienceSubtype || undefined,
        location: isTravel || initialObject?.object_type !== 'one_time_experience' || initialObject.experience_subtype === 'travel_worldview'
          ? travelLocation : initialObject.location,
        locations: isTravel || initialObject?.object_type !== 'one_time_experience' || initialObject.experience_subtype === 'travel_worldview'
          ? parsedExtraLocations.length > 0 ? parsedExtraLocations : undefined : initialObject.locations,
      };

      const object = initialObject
        ? updateObjectDraft(initialObject, values)
        : createObjectDraft(values);
        
      const bodyTemplate = objectType === 'one_time_experience'
        ? `## ${t('experienceReview')}\n\n## ${t('reviewRankingSection')}\n`
        : `## ${t('purchaseReason')}\n\n## ${t('usageLog')}\n\n## ${t('reviewAndRanking')}\n`;
      await onSubmit(object, bodyTemplate);
      if (!initialObject) {
        setTitle('');
        setAmount('');
        setCategory('');
        setPurchasedAt('');
        setEndedAt('');
        setPhysicalStatus('observing');
        setRecurringStatus('active');
        setBillingCycle('monthly');
        setBillingDay('');
        setPaymentAccount('');
        setRecurringStartedAt('');
        setExperienceStatus('planned');
        setActualAmount('');
        setObjectType('physical');
        setExperienceSubtype('');
        setLocationCountry('');
        setLocationRegion('');
        setLocationCity('');
        setLocationCountryCode('');
        setLocationLatitude('');
        setLocationLongitude('');
        setQuickLine('');
        setExtraLocations([]);
        setSalePrice('');
        setAnnualizedCost('');
      }
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : String(error) });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return {
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
    annualizedCost, setAnnualizedCost,
    quickLine, setQuickLine,
    isSaving, setIsSaving,
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
  };
}
