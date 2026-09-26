import { describe, expect, it } from 'vitest';
import {
  calculateInclusiveDays,
  calendarDaysBetween,
  calendarDaysSince,
  parseLocalDate,
  todayLocalISO,
} from './date';

describe('parseLocalDate', () => {
  it('parses a valid ISO date at local midnight', () => {
    const date = parseLocalDate('2026-10-05');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(9);
    expect(date!.getDate()).toBe(5);
  });

  it('tolerates an ISO datetime by using its date part', () => {
    const date = parseLocalDate('2026-10-05T12:34:56.000Z');
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(9);
    expect(date!.getDate()).toBe(5);
  });

  it('returns null for invalid input', () => {
    expect(parseLocalDate('not-a-date')).toBeNull();
  });
});

describe('calendar day math', () => {
  it('counts exact calendar days without DST drift', () => {
    expect(calendarDaysBetween('2026-03-01', '2026-03-10')).toBe(9);
    expect(calculateInclusiveDays('2026-03-01', '2026-03-10')).toBe(10);
  });

  it('reports signed day differences', () => {
    expect(calendarDaysBetween('2026-03-10', '2026-03-01')).toBe(-9);
    expect(calendarDaysBetween('2026-03-01', '2026-03-10')).toBe(9);
  });

  it('returns null when either date is invalid', () => {
    expect(calendarDaysBetween('garbage', '2026-03-10')).toBeNull();
    expect(calendarDaysBetween('2026-03-01', '2026-02-30')).toBeNull();
  });

  it('counts calendar days since a date in the local calendar', () => {
    expect(calendarDaysSince('2026-09-01', new Date(2026, 8, 8, 0, 30))).toBe(7);
  });
});

describe('todayLocalISO', () => {
  it('formats the local calendar date even when UTC is the previous day', () => {
    expect(todayLocalISO(new Date(2026, 8, 8, 0, 30))).toBe('2026-09-08');
  });
});

describe('calculateInclusiveDays', () => {
  const today = new Date(2026, 9, 20);

  it('counts both endpoints inclusively', () => {
    expect(calculateInclusiveDays('2026-10-05', '2026-10-13', today)).toBe(9);
    expect(calculateInclusiveDays('2026-10-05', '2026-10-05', today)).toBe(1);
  });

  it('uses today when no end date is supplied', () => {
    expect(calculateInclusiveDays('2026-10-11', null, today)).toBe(10);
  });

  it('returns null for missing or invalid start', () => {
    expect(calculateInclusiveDays(undefined, '2026-10-13', today)).toBeNull();
    expect(calculateInclusiveDays('garbage', '2026-10-13', today)).toBeNull();
  });

  it('returns null when the end is before the start', () => {
    expect(calculateInclusiveDays('2026-10-13', '2026-10-05', today)).toBeNull();
  });
});
