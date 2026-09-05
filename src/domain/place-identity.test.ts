import { describe, expect, it } from 'vitest';
import {
  getStrongPlaceIdentityKeys,
  haveConflictingStrongPlaceIdentity,
  shareStrongPlaceIdentity,
} from './place-identity';

describe('place identity authority', () => {
  it('matches a Google hex feature id to its decimal CID', () => {
    const a = { source_provider: 'google_maps', source_place_id: '0x30e2991678584ec5:0x698c069655046fbe' };
    const b = { source_provider: 'google_maps', source_url: 'https://www.google.com/maps?cid=7605461113463140286' };
    expect(shareStrongPlaceIdentity(a, b)).toBe(true);
    expect(getStrongPlaceIdentityKeys(a).some((key) => key.includes('google_cid'))).toBe(true);
  });

  it('treats different explicit Place IDs as known-distinct', () => {
    const a = { source_provider: 'google_maps', source_place_id: 'ChIJA11111111111' };
    const b = { source_provider: 'google_maps', source_place_id: 'ChIJB22222222222' };
    expect(shareStrongPlaceIdentity(a, b)).toBe(false);
    expect(haveConflictingStrongPlaceIdentity(a, b)).toBe(true);
  });

  it('does not manufacture identity from title-only URLs', () => {
    expect(getStrongPlaceIdentityKeys({ source_provider: 'google_maps', source_url: 'https://www.google.com/maps/search/?api=1&query=Airport' })).toEqual([]);
  });

  it('keeps native provider IDs strictly isolated in their own namespace', () => {
    const agodaHotel = { source_provider: 'agoda', source_place_id: '78652960', title: 'Discovery Hotel' };
    const googlePlace = { source_provider: 'google_maps', source_place_id: '78652960', title: 'Discovery Hotel' };
    const bookingHotel = { source_provider: 'booking', source_place_id: '78652960', title: 'Discovery Hotel' };

    // Agoda ID must not match Google CID even with same numeric value
    expect(shareStrongPlaceIdentity(agodaHotel, googlePlace)).toBe(false);
    expect(shareStrongPlaceIdentity(agodaHotel, bookingHotel)).toBe(false);

    // Two places from the same provider with the same native ID DO match
    const agodaHotelDuplicate = { source_provider: 'agoda', source_place_id: '78652960', title: 'Discovery Beach Resort' };
    expect(shareStrongPlaceIdentity(agodaHotel, agodaHotelDuplicate)).toBe(true);

    const agodaKeys = getStrongPlaceIdentityKeys(agodaHotel);
    expect(agodaKeys).toEqual(['agoda:source_place_id:78652960']);
    expect(agodaKeys.some((k) => k.includes('google_cid'))).toBe(false);
  });
});
