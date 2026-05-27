import type { WYQDTranslationKey } from '@/core/i18n';

type TranslateFn = (key: WYQDTranslationKey) => string;

export function formatMoney(value: number | null | undefined, fallback?: string): string {
  if (value === null || value === undefined) return fallback ?? '—';
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

export function formatDailyMoney(value: number): string {
  if (!Number.isFinite(value)) return '¥0/日';
  if (value > 0 && value < 1) return `¥${value.toFixed(2)}/日`;
  return `${formatMoney(value)}/日`;
}

export function formatCompactMoney(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 10000) return `¥${(rounded / 10000).toFixed(1)}万`;
  return `¥${rounded.toLocaleString('zh-CN')}`;
}

export function formatDelta(value: number | null, t: TranslateFn): string {
  if (value === null) return t('noNetWorthComparison');
  const sign = value >= 0 ? '+' : '-';
  return `较上月末 ${sign}¥${Math.abs(Math.round(value)).toLocaleString('zh-CN')}`;
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
