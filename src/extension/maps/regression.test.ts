import { describe, it, expect } from 'vitest';
import { PlaceIdentityService } from '@/domain/place-identity';

describe('PR4 maps extractor regression fixtures', () => {
  it('TH query pin Baan Kuay without featureId still gets resilient key (url fallback)', () => {
    const place = {
      source_provider: 'google_maps',
      source_place_id: undefined,
      source_url: 'https://www.google.com/maps/search/?api=1&query=Baan%20Kuay%20Tiew%20Ruathong',
      title: 'Baan Kuay Tiew Ruathong',
      coordinates: { lat: 13.7657518, lng: 100.5394974 },
    };
    const keys = PlaceIdentityService.getResilientKeys(place);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys[0]).toContain('canonical_url');
  });

  it('TH Hann Khao Soi Lovers resilient key via url+coord', () => {
    const place = {
      source_provider: 'google_maps',
      source_url: 'https://www.google.com/maps/search/?api=1&query=Hann%20Khao%20Soi%20Lovers',
      title: 'Hann Khao Soi Lovers',
      coordinates: { lat: 13.7898288, lng: 100.5492351 },
    };
    const keys = PlaceIdentityService.getResilientKeys(place);
    expect(keys[0]).toMatch(/canonical_url/);
  });

  it('JP hotel with ChIJ gets strong key', () => {
    const place = {
      source_provider: 'google_maps',
      source_place_id: 'ChIJ1234567890abcdef',
      source_url: 'https://www.google.com/maps?cid=123',
    };
    const strong = PlaceIdentityService.getStrongKeys(place);
    expect(strong.some((k) => k.includes('google_place_id'))).toBe(true);
  });

  it('US place with featureId gets strong key', () => {
    const place = {
      source_provider: 'google_maps',
      source_place_id: '0x89c24a1e2e76132b:0xf76a8a9c0b5d4321',
      source_url: 'https://www.google.com/maps?cid=123',
    };
    const strong = PlaceIdentityService.getStrongKeys(place);
    expect(strong.some((k) => k.includes('source_place_id'))).toBe(true);
  });

  it('duplicate query pins share resilient identity', () => {
    const a = {
      source_provider: 'google_maps',
      source_url: 'https://www.google.com/maps/search/?api=1&query=Avani%20Sukhumvit%20Bangkok',
      title: 'Avani Sukhumvit Bangkok',
      coordinates: { lat: 13.70555, lng: 100.601791 },
    };
    const b = {
      source_provider: 'google_maps',
      source_url: 'https://www.google.com/maps/search/?api=1&query=Avani%20Sukhumvit%20Bangkok',
      title: 'Avani Sukhumvit Bangkok',
      coordinates: { lat: 13.70555, lng: 100.601791 },
    };
    const ka = PlaceIdentityService.getResilientKeys(a);
    const kb = PlaceIdentityService.getResilientKeys(b);
    expect(ka[0]).toBe(kb[0]);
  });
});
