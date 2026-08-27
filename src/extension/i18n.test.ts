import { describe, expect, it } from 'vitest';
import { I18N } from './i18n';

/**
 * Structural fingerprint of a dictionary value: functions compare by arity,
 * arrays by "is array", objects recursively by sorted keys, everything else by
 * typeof. If zh and en ever drift apart (missing key, renamed key, different
 * function signature), the fingerprint mismatch fails this test.
 */
function shapeOf(value: unknown): string {
  if (typeof value === 'function') return `fn/${value.length}`;
  if (Array.isArray(value)) return 'arr';
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `obj{${entries.map(([key, val]) => `${key}:${shapeOf(val)}`).join(',')}}`;
  }
  return typeof value;
}

describe('i18n dictionaries', () => {
  it('zh and en have identical key structure and function arities', () => {
    expect(shapeOf(I18N.en)).toBe(shapeOf(I18N.zh));
  });

  it('quick chips are non-empty in both languages', () => {
    expect(I18N.zh.chips.length).toBeGreaterThan(0);
    expect(I18N.en.chips.length).toBeGreaterThan(0);
  });

  it('kind / priority / transport option maps cover the same codes', () => {
    expect(Object.keys(I18N.en.kinds).sort()).toEqual(Object.keys(I18N.zh.kinds).sort());
    expect(Object.keys(I18N.en.priorities).sort()).toEqual(Object.keys(I18N.zh.priorities).sort());
    expect(Object.keys(I18N.en.transport).sort()).toEqual(Object.keys(I18N.zh.transport).sort());
  });
});
