import type { WYQDTranslationKey } from '@/core/i18n';

type TranslateFn = (key: WYQDTranslationKey) => string;

export type WYQDCurrencyLocale = 'zh' | 'en';

const CURRENCY_SYMBOLS: Record<WYQDCurrencyLocale, string> = {
  zh: '¥',
  en: '$',
};

const NUMBER_LOCALE: Record<WYQDCurrencyLocale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
};

export function formatMoney(value: number | null | undefined, fallback?: string, locale: WYQDCurrencyLocale = 'zh'): string {
  if (value === null || value === undefined) return fallback ?? '—';
  return `${CURRENCY_SYMBOLS[locale]}${Math.round(value).toLocaleString(NUMBER_LOCALE[locale])}`;
}

export function formatDailyMoney(value: number, locale: WYQDCurrencyLocale = 'zh'): string {
  if (!Number.isFinite(value)) return `${CURRENCY_SYMBOLS[locale]}0/日`;
  if (value > 0 && value < 1) return `${CURRENCY_SYMBOLS[locale]}${value.toFixed(2)}/日`;
  return `${formatMoney(value, undefined, locale)}/日`;
}

export function formatCompactMoney(value: number, locale: WYQDCurrencyLocale = 'zh'): string {
  const rounded = Math.round(value);
  const sym = CURRENCY_SYMBOLS[locale];
  if (Math.abs(rounded) >= 10000) return `${sym}${(rounded / 10000).toFixed(1)}万`;
  return `${sym}${rounded.toLocaleString(NUMBER_LOCALE[locale])}`;
}

export function formatDelta(value: number | null, t: (key: WYQDTranslationKey) => string, locale: WYQDCurrencyLocale = 'zh'): string {
  if (value === null) return t('noNetWorthComparison');
  const sign = value >= 0 ? '+' : '-';
  return `较上月末 ${sign}${CURRENCY_SYMBOLS[locale]}${Math.abs(Math.round(value)).toLocaleString(NUMBER_LOCALE[locale])}`;
}

export function formatOptional(value: string | number | null | undefined, t: TranslateFn): string {
  if (value === null || value === undefined || value === '') return t('notRecorded');
  return String(value);
}

export function parseRank(value: string): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1) return null;
  return Math.floor(numberValue);
}

export function daysUntil(date: string): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(`${date}T00:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

export function formatDueLabel(date: string, t: TranslateFn): string {
  const days = daysUntil(date);
  if (days === 0) return t('dueToday');
  if (days === 1) return t('dueTomorrow');
  if (days > 1) return t('daysLater').replace('{count}', String(days));
  return t('daysPast').replace('{count}', String(Math.abs(days)));
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function buildSparklinePoints(values: number[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) return '0,24 100,24';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 42 - ((value - min) / range) * 36;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
