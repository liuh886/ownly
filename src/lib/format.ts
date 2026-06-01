import type { WYQDTranslationKey } from '@/core/i18n';

type TranslateFn = (key: WYQDTranslationKey) => string;

/** Supported currencies */
export type WYQDCurrency = 'CNY' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'KRW';

/** Legacy locale type — kept for backward compatibility */
export type WYQDCurrencyLocale = 'zh' | 'en';

interface CurrencyConfig {
  symbol: string;
  locale: string;       // Intl.NumberFormat locale
  compactUnit?: string; // e.g. '万' for CNY
  compactThreshold?: number; // e.g. 10000 for 万
}

const CURRENCY_CONFIG: Record<WYQDCurrency, CurrencyConfig> = {
  CNY: { symbol: '¥', locale: 'zh-CN', compactUnit: '万', compactThreshold: 10000 },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  JPY: { symbol: '¥', locale: 'ja-JP' },
  KRW: { symbol: '₩', locale: 'ko-KR' },
};

export const WYQD_CURRENCIES: WYQDCurrency[] = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW'];

export const WYQD_CURRENCY_LABELS: Record<WYQDCurrency, string> = {
  CNY: 'CNY ¥',
  USD: 'USD $',
  EUR: 'EUR €',
  GBP: 'GBP £',
  JPY: 'JPY ¥',
  KRW: 'KRW ₩',
};

/** Map legacy locale to default currency */
function localeToCurrency(locale: WYQDCurrencyLocale): WYQDCurrency {
  return locale === 'zh' ? 'CNY' : 'USD';
}

function getConfig(currency: WYQDCurrency): CurrencyConfig {
  return CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.USD;
}

// ===== Exported format functions =====

export function formatMoney(
  value: number | null | undefined,
  fallback?: string,
  locale: WYQDCurrencyLocale = 'zh',
  currency?: WYQDCurrency,
): string {
  if (value === null || value === undefined) return fallback ?? '—';
  const cur = currency || localeToCurrency(locale);
  const cfg = getConfig(cur);
  return `${cfg.symbol}${Math.round(value).toLocaleString(cfg.locale)}`;
}

export function formatDailyMoney(
  value: number,
  locale: WYQDCurrencyLocale = 'zh',
  t?: TranslateFn,
  currency?: WYQDCurrency,
): string {
  const cur = currency || localeToCurrency(locale);
  const cfg = getConfig(cur);
  const suffix = t ? t('perDay') : locale === 'zh' ? '/天' : '/day';
  if (!Number.isFinite(value)) return `${cfg.symbol}0${suffix}`;
  if (value > 0 && value < 1) return `${cfg.symbol}${value.toFixed(2)}${suffix}`;
  return `${formatMoney(value, undefined, locale, cur)}${suffix}`;
}

export function formatCompactMoney(
  value: number,
  locale: WYQDCurrencyLocale = 'zh',
  t?: TranslateFn,
  currency?: WYQDCurrency,
): string {
  const cur = currency || localeToCurrency(locale);
  const cfg = getConfig(cur);
  const rounded = Math.round(value);

  // CNY uses 万 compact format
  if (cfg.compactUnit && cfg.compactThreshold && Math.abs(rounded) >= cfg.compactThreshold) {
    const unit = t ? t('unitWan') : cfg.compactUnit;
    return `${cfg.symbol}${(rounded / cfg.compactThreshold).toFixed(1)}${unit}`;
  }

  return `${cfg.symbol}${rounded.toLocaleString(cfg.locale)}`;
}

export function formatDelta(
  value: number | null,
  t: TranslateFn,
  locale: WYQDCurrencyLocale = 'zh',
  currency?: WYQDCurrency,
): string {
  if (value === null) return t('noNetWorthComparison');
  const cur = currency || localeToCurrency(locale);
  const cfg = getConfig(cur);
  const sign = value >= 0 ? '+' : '-';
  return `${t('comparedToMonthEnd')} ${sign}${cfg.symbol}${Math.abs(Math.round(value)).toLocaleString(cfg.locale)}`;
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

export function parseScore(value: string): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) return null;
  return Math.floor(numberValue);
}

export function rankToScore(rank: number | null | undefined): number | null {
  if (!rank || rank < 1) return null;
  // 排名越小越好，转换为分数：第1名=100分，第2名=90分，第3名=80分...
  return Math.max(0, 100 - (rank - 1) * 10);
}

export function migrateReviewEntry(review: Record<string, unknown>): Record<string, unknown> {
  // 如果有旧的 rank 字段，转换为 score
  if (review.food_rank && !review.food_score) {
    review.food_score = rankToScore(review.food_rank as number);
    delete review.food_rank;
  }
  if (review.scenery_rank && !review.scenery_score) {
    review.scenery_score = rankToScore(review.scenery_rank as number);
    delete review.scenery_rank;
  }
  if (review.experience_rank && !review.experience_score) {
    review.experience_score = rankToScore(review.experience_rank as number);
    delete review.experience_rank;
  }
  return review;
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
