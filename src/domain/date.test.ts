import { describe, expect, it } from 'vitest';
import { calculateInclusiveDays, parseLocalDate } from './date';

describe('parseLocalDate', () => {
  it('parses a valid ISO date at local midnight', () => {
    const date = parseLocalDate('2026-10-05');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(9);
    expect(date!.getDate()).toBe(5);
  });

  it('returns null for invalid input', () => {
    expect(parseLocalDate('not-a-date')).toBeNull();
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
