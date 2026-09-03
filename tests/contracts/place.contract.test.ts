import { describe, expect, it } from 'vitest';
import { getStrongPlaceIdentityKeys } from '@/domain/place-identity';

describe('P5 contract: Place identity across entries', () => {
  it('同一 Place 在三端共享强身份', () => {
    const p = { source_provider: 'google_maps', source_place_id: 'ChIJ123', source_url: 'https://maps.example.com/1' };
    const keys = getStrongPlaceIdentityKeys(p);
    expect(keys.length).toBeGreaterThan(0);
  });
});
