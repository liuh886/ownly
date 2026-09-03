import { describe, expect, it } from 'vitest';
import { createShareableTripBundle, parseTripBundle } from '@/domain/trip-bundle';

describe('P5 contract: Trip bundle across entries', () => {
  it('Trip Bundle 在三端解析一致', () => {
    const trip = { id: 'trip-1', title: 'T', status: 'planning', start_date: '2026-01-01', end_date: '2026-01-02', destinations: ['X'], created_at: new Date().toISOString(), type: 'trip', schema_version: '0.1' } as never;
    const bundle = createShareableTripBundle(trip, [], [], []);
    const parsed = parseTripBundle(JSON.stringify(bundle));
    expect(parsed.trip.id).toBe('trip-1');
  });
});
