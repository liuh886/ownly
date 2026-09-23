import { describe, expect, it } from 'vitest';
import {
  getTripShareUrl,
  normalizeTripShareAlias,
  suggestTripShareAlias,
  validateTripShareAlias,
} from './trip-share';

describe('trip share alias', () => {
  it('normalizes to uppercase and trims', () => {
    expect(normalizeTripShareAlias('  th26 ')).toBe('TH26');
  });

  it('accepts uppercase letters, digits, and hyphens', () => {
    expect(validateTripShareAlias('TH26')).toEqual({ ok: true, alias: 'TH26' });
    expect(validateTripShareAlias('jp-2027')).toEqual({ ok: true, alias: 'JP-2027' });
    expect(validateTripShareAlias('th26')).toEqual({ ok: true, alias: 'TH26' });
  });

  it('rejects empty, malformed, and reserved aliases', () => {
    expect(validateTripShareAlias('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateTripShareAlias('A')).toEqual({ ok: false, reason: 'format' });
    expect(validateTripShareAlias('TH 26')).toEqual({ ok: false, reason: 'format' });
    expect(validateTripShareAlias('-TH26')).toEqual({ ok: false, reason: 'format' });
    expect(validateTripShareAlias('A'.repeat(25))).toEqual({ ok: false, reason: 'format' });
    expect(validateTripShareAlias('app')).toEqual({ ok: false, reason: 'reserved' });
  });

  it('suggests a memorable alias from destination and year', () => {
    expect(suggestTripShareAlias({ destinations: ['Thailand'], title: 'Trip', start_date: '2026-10-05' })).toBe('TH26');
    expect(suggestTripShareAlias({ destinations: ['Japan'], title: 'Trip', start_date: '2027-03-01' })).toBe('JA27');
  });

  it('falls back to the title, then to TRIP, when the destination has no ASCII code', () => {
    expect(suggestTripShareAlias({ destinations: ['清迈'], title: 'Chiang Mai', start_date: '2026-10-05' })).toBe('CH26');
    expect(suggestTripShareAlias({ destinations: ['清迈'], title: '清迈之行', start_date: '2026-10-05' })).toBe('TRIP26');
  });

  it('builds a path-style URL under the trip-share function', () => {
    expect(getTripShareUrl('th26', 'https://x.supabase.co/functions/v1/trip-share')).toBe(
      'https://x.supabase.co/functions/v1/trip-share/TH26',
    );
    expect(getTripShareUrl('TH26')).toContain('/functions/v1/trip-share/TH26');
  });
});
