'use client';

import { useI18n } from '@/core/i18n-context';
import { formatMoney, formatDailyMoney, formatCompactMoney, formatDelta, type WYQDCurrencyLocale } from './format';
import type { WYQDTranslationKey } from '@/core/i18n';

function toCurrencyLocale(language: string): WYQDCurrencyLocale {
  return language === 'en' ? 'en' : 'zh';
}

export function useCurrencyLocale(): WYQDCurrencyLocale {
  const { language } = useI18n();
  return toCurrencyLocale(language);
}

export function useFormatMoney() {
  const locale = useCurrencyLocale();
  return {
    formatMoney: (value: number | null | undefined, fallback?: string) => formatMoney(value, fallback, locale),
    formatDailyMoney: (value: number) => formatDailyMoney(value, locale),
    formatCompactMoney: (value: number) => formatCompactMoney(value, locale),
    formatDelta: (value: number | null, t: (key: WYQDTranslationKey) => string) => formatDelta(value, t, locale),
    locale,
  };
}
