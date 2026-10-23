'use client';

import { useI18n } from '@/core/i18n-context';
import {
  formatMoney,
  formatDailyMoney,
  formatCompactMoney,
  formatDelta,
  type WYQDCurrencyLocale,
} from './format';

function toCurrencyLocale(language: string): WYQDCurrencyLocale {
  return language === 'en' ? 'en' : 'zh';
}

export function useFormatMoney(overrideCurrency?: string) {
  const { t, language, currency: defaultCurrency } = useI18n();
  const currency = overrideCurrency ?? defaultCurrency;
  const locale = toCurrencyLocale(language);
  return {
    formatMoney: (value: number | null | undefined, fallback?: string, sourceCurrency?: string) => {
      const unit = sourceCurrency ?? currency;
      const precise = sourceCurrency !== undefined || overrideCurrency !== undefined;
      return formatMoney(value, fallback, locale, unit, precise && !['JPY', 'KRW'].includes(unit) ? 2 : 0);
    },
    formatDailyMoney: (value: number) => formatDailyMoney(value, locale, t, currency),
    formatCompactMoney: (value: number) => formatCompactMoney(value, locale, t, currency),
    formatDelta: (value: number | null) => formatDelta(value, t, locale, currency),
    locale,
    currency,
  };
}
