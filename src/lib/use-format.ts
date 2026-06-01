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

export function useCurrencyLocale(): WYQDCurrencyLocale {
  const { language } = useI18n();
  return toCurrencyLocale(language);
}

export function useFormatMoney() {
  const { t, language, currency } = useI18n();
  const locale = toCurrencyLocale(language);
  return {
    formatMoney: (value: number | null | undefined, fallback?: string) => formatMoney(value, fallback, locale, currency),
    formatDailyMoney: (value: number) => formatDailyMoney(value, locale, t, currency),
    formatCompactMoney: (value: number) => formatCompactMoney(value, locale, t, currency),
    formatDelta: (value: number | null) => formatDelta(value, t, locale, currency),
    locale,
    currency,
  };
}
