import { describe, expect, it } from 'vitest';
import {
  defaultTripShareAlias,
  getTripShareUrl,
  normalizeTripShareAlias,
  validateTripShareAlias,
  withTripShareAliasSuffix,
} from './trip-share';

describe('trip share alias (trip name)', () => {
  it('trims and collapses whitespace while preserving case and scripts', () => {
    expect(normalizeTripShareAlias('  清迈  5 日 ')).toBe('清迈 5 日');
    expect(normalizeTripShareAlias('Bangkok   Week')).toBe('Bangkok Week');
  });

  it('accepts names, including CJK and spaces', () => {
    expect(validateTripShareAlias('清迈 5 日')).toEqual({ ok: true, alias: '清迈 5 日' });
    expect(validateTripShareAlias('Bangkok Week')).toEqual({ ok: true, alias: 'Bangkok Week' });
    expect(validateTripShareAlias('TH26')).toEqual({ ok: true, alias: 'TH26' });
  });

  it('rejects empty, over-long, and URL-hazardous names', () => {
    expect(validateTripShareAlias('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateTripShareAlias('a'.repeat(65))).toEqual({ ok: false, reason: 'format' });
    expect(validateTripShareAlias('a/b')).toEqual({ ok: false, reason: 'format' });
    expect(validateTripShareAlias('a?b')).toEqual({ ok: false, reason: 'format' });
  });

  it('appends a collision suffix, staying within the length limit', () => {
    expect(withTripShareAliasSuffix('清迈 5 日', 2)).toBe('清迈 5 日-2');
    const long = withTripShareAliasSuffix('a'.repeat(64), 9);
    expect(long.length).toBe(64);
    expect(long.endsWith('-9')).toBe(true);
  });

  it('derives the default alias from the trip name', () => {
    expect(defaultTripShareAlias({ title: '  日本 2027 ' })).toBe('日本 2027');
  });

  it('builds a path-style URL with the name percent-encoded', () => {
    const url = getTripShareUrl('清迈 5 日', 'https://x.supabase.co/functions/v1/trip-share');
    expect(url.startsWith('https://x.supabase.co/functions/v1/trip-share/')).toBe(true);
    expect(decodeURIComponent(url.split('/').pop() ?? '')).toBe('清迈 5 日');
    expect(getTripShareUrl('TH26')).toContain('/functions/v1/trip-share/TH26');
  });
});
