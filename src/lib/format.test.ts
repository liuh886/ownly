import { describe, expect, it } from 'vitest';
import {
  buildSparklinePoints,
  clampPercent,
  daysUntil,
  formatCompactMoney,
  formatDailyMoney,
  formatDelta,
  formatDueLabel,
  formatLocalizedDate,
  formatMoney,
  formatOptional,
  migrateReviewEntry,
  parseRank,
  parseScore,
  rankToScore,
  WYQD_CURRENCIES,
} from './format';

const t = (key: string) => `t:${key}`;

describe('formatMoney', () => {
  it('formats with the locale default currency and rounds', () => {
    expect(formatMoney(1234.6)).toBe('¥1,235');
    expect(formatMoney(1000, undefined, 'en')).toBe('$1,000');
  });

  it('honors an explicit currency', () => {
    expect(formatMoney(1000, undefined, 'zh', 'JPY')).toBe('¥1,000');
    expect(formatMoney(1000, undefined, 'zh', 'KRW')).toBe('₩1,000');
  });

  it('returns the fallback for nullish values', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined, 'n/a')).toBe('n/a');
  });
});

describe('formatDailyMoney', () => {
  it('shows two decimals for sub-unit amounts and a per-day suffix', () => {
    expect(formatDailyMoney(0.5, 'en')).toBe('$0.50/day');
    expect(formatDailyMoney(0, 'en')).toBe('$0/day');
  });

  it('uses the translation key when provided', () => {
    expect(formatDailyMoney(10, 'en', t)).toBe('$10t:perDay');
  });
});

describe('formatCompactMoney', () => {
  it('uses 万 for large CNY amounts and k for English', () => {
    expect(formatCompactMoney(12345, 'zh')).toBe('¥1.2万');
    expect(formatCompactMoney(1500, 'en')).toBe('$1.5k');
  });

  it('falls back to a plain localized number below the threshold', () => {
    expect(formatCompactMoney(500, 'zh')).toBe('¥500');
  });
});

describe('formatDelta / formatOptional', () => {
  it('signs and formats deltas, or reports no comparison', () => {
    expect(formatDelta(250, t, 'en')).toBe('t:comparedToMonthEnd +$250');
    expect(formatDelta(-250, t, 'en')).toBe('t:comparedToMonthEnd -$250');
    expect(formatDelta(null, t)).toBe('t:noNetWorthComparison');
  });

  it('reports a placeholder for empty optional values', () => {
    expect(formatOptional('', t)).toBe('t:notRecorded');
    expect(formatOptional(0, t)).toBe('0');
  });
});

describe('rank and score helpers', () => {
  it('parses valid ranks and scores only', () => {
    expect(parseRank('3')).toBe(3);
    expect(parseRank('0')).toBeNull();
    expect(parseRank('abc')).toBeNull();
    expect(parseScore('85')).toBe(85);
    expect(parseScore('-1')).toBeNull();
    expect(parseScore('101')).toBeNull();
  });

  it('converts ranks to descending scores', () => {
    expect(rankToScore(1)).toBe(100);
    expect(rankToScore(2)).toBe(90);
    expect(rankToScore(3)).toBe(80);
    expect(rankToScore(11)).toBe(0);
    expect(rankToScore(null)).toBeNull();
  });
});

describe('migrateReviewEntry', () => {
  it('converts legacy rank fields to scores and drops the rank', () => {
    const migrated = migrateReviewEntry({ food_rank: 2, scenery_rank: 1 });
    expect(migrated.food_score).toBe(90);
    expect(migrated.scenery_score).toBe(100);
    expect(migrated.food_rank).toBeUndefined();
    expect(migrated.scenery_rank).toBeUndefined();
  });

  it('leaves an existing score untouched', () => {
    const migrated = migrateReviewEntry({ food_rank: 2, food_score: 55 });
    expect(migrated.food_score).toBe(55);
    expect(migrated.food_rank).toBe(2);
  });
});

describe('sparkline / clamp', () => {
  it('builds a normalized SVG point string', () => {
    expect(buildSparklinePoints([])).toBe('');
    expect(buildSparklinePoints([5])).toBe('0,24 100,24');
    expect(buildSparklinePoints([1, 2])).toBe('0.00,42.00 100.00,6.00');
  });

  it('clamps percentages into 0..100', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(42)).toBe(42);
  });
});

describe('date labels', () => {
  it('reports due labels relative to today', () => {
    const iso = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    expect(daysUntil(iso(0))).toBe(0);
    expect(formatDueLabel(iso(0), t)).toBe('t:dueToday');
    expect(formatDueLabel(iso(1), t)).toBe('t:dueTomorrow');
    expect(formatDueLabel(iso(-2), t)).toBe('t:daysPast');
  });

  it('formats a localized date and tolerates empty/invalid input', () => {
    expect(formatLocalizedDate('')).toBe('');
    expect(formatLocalizedDate('not-a-date')).toBe('not-a-date');
    expect(formatLocalizedDate('2026-10-05', 'en')).toContain('2026');
  });
});

describe('WYQD_CURRENCIES', () => {
  it('exposes the supported currency list', () => {
    expect(WYQD_CURRENCIES).toEqual(['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW']);
  });
});
