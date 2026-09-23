// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTripShareMeta,
  loadTripShareMeta,
  saveTripShareMeta,
} from './trip-share';

describe('trip share meta storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips the owner write token through localStorage', () => {
    saveTripShareMeta('trip-1', {
      alias: 'TH26',
      write_token: 'secret-token',
      updated_at: '2026-10-01T00:00:00.000Z',
      enabled: true,
    });
    expect(loadTripShareMeta('trip-1')).toEqual({
      alias: 'TH26',
      write_token: 'secret-token',
      updated_at: '2026-10-01T00:00:00.000Z',
      enabled: true,
    });
  });

  it('returns null for unknown or incomplete entries and clears on demand', () => {
    expect(loadTripShareMeta('missing')).toBeNull();
    window.localStorage.setItem('ownly:trip-share:trip-2', JSON.stringify({ alias: 'TH26' }));
    expect(loadTripShareMeta('trip-2')).toBeNull();

    saveTripShareMeta('trip-3', {
      alias: 'JP27',
      write_token: 't',
      updated_at: '',
      enabled: true,
    });
    clearTripShareMeta('trip-3');
    expect(loadTripShareMeta('trip-3')).toBeNull();
  });
});
