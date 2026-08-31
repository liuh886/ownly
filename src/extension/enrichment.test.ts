import { describe, expect, it, vi } from 'vitest';
import { enrichPlaceMetadata, enrichCandidatePlacesBatch, mergeDetectedResearchIntoPlannerPlaces } from './enrichment';
import type { PlannerTripPlace } from '../domain/planner';
import type { CurrentResearchPlace } from './content';

describe('enrichPlaceMetadata', () => {
  it('enriches a candidate place with ratings, price, address and coordinates from Google Maps JSON-LD', async () => {
    const mockHtml = `
      <!doctype html>
      <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Restaurant",
          "name": "Thipsamai Padthai Pratoopee",
          "aggregateRating": {
            "ratingValue": 4.2,
            "reviewCount": 12567
          },
          "priceRange": "฿200–400",
          "priceCurrency": "THB",
          "telephone": "+66 2 226 6666",
          "address": {
            "streetAddress": "313 315 Maha Chai Rd, Samran Rat",
            "addressLocality": "Phra Nakhon, Bangkok",
            "postalCode": "10200",
            "addressCountry": "TH"
          },
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": 13.7525,
            "longitude": 100.5050
          }
        }
        </script>
      </head>
      <body></body>
      </html>
    `;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://www.google.com/maps/place/Thipsamai',
      text: async () => mockHtml,
    } as unknown as Response);

    try {
      const place: PlannerTripPlace = {
        schema_version: '0.1',
        type: 'trip_place',
        id: 'place-1',
        trip_id: 'trip-1',
        title: 'Thipsamai Padthai Pratoopee',
        source_provider: 'google_maps',
        source_url: 'https://www.google.com/maps/place/Thipsamai',
        kind: 'other',
        priority: 'want',
        tags: [],
        signals: [],
        risks: [],
        observed_at: '2026-08-30',
        reservation_status: 'none',
        state: 'candidate',
        created_at: '2026-08-30T00:00:00Z',
        updated_at: '2026-08-30T00:00:00Z',
      };

      const result = await enrichPlaceMetadata(place);
      expect(result.enriched).toBe(true);
      expect(result.place.observed_rating).toBe(4.2);
      expect(result.place.observed_review_count).toBe(12567);
      expect(result.place.observed_price).toBe('฿200–400');
      expect(result.place.price_min).toBe(200);
      expect(result.place.price_max).toBe(400);
      expect(result.place.price_currency).toBe('THB');
      expect(result.place.kind).toBe('other');
      expect(result.place.tags).toEqual([]);
      expect(result.place.types).toContain('restaurant');
      expect(result.place.phone).toBe('+66 2 226 6666');
      expect(result.place.address).toContain('Maha Chai Rd');
      expect(result.place.coordinates).toEqual({ lat: 13.7525, lng: 100.5050 });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('skips enrichment if candidate already has complete data and valid kind', async () => {
    const completePlace: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: 'place-2',
      trip_id: 'trip-1',
      title: 'Complete Hotel',
      source_provider: 'google_maps',
      source_url: 'https://www.google.com/maps/place/Hotel',
      kind: 'stay',
      priority: 'want',
      tags: ['stay'],
      signals: [],
      risks: [],
      observed_at: '2026-08-30',
      observed_rating: 4.8,
      observed_review_count: 500,
      observed_price: '¥15,000 / 晚',
      source_category: 'Hotel',
      address: 'Tokyo, Japan',
      coordinates: { lat: 35.6895, lng: 139.6917 },
      reservation_status: 'none',
      state: 'candidate',
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
    };

    const result = await enrichPlaceMetadata(completePlace);
    expect(result.enriched).toBe(false);
  });
});


describe('mergeDetectedResearchIntoPlannerPlaces', () => {
  it('adds Google Maps facts without overwriting Planner-owned decisions', () => {
    const current: PlannerTripPlace = {
      schema_version: '0.1',
      type: 'trip_place',
      id: 'saved-1',
      trip_id: 'trip-1',
      title: 'Saved Place',
      source_provider: 'google_maps',
      source_url: 'https://www.google.com/maps?cid=123',
      source_place_id: '0xabc:0x123',
      kind: 'other',
      priority: 'must',
      tags: ['manual-tag'],
      signals: [],
      risks: [],
      notes: 'keep this note',
      reservation_status: 'none',
      state: 'candidate',
      created_at: '2026-08-31T00:00:00Z',
    };
    const research: CurrentResearchPlace = {
      title: 'Saved Place',
      sourceUrl: current.source_url,
      sourceProvider: 'google_maps',
      sourcePlaceId: current.source_place_id,
      rating: 4.8,
      reviewCount: 9876,
      category: 'Restaurant',
      priceLevel: '฿300–500',
      detectedCurrency: 'THB',
      address: 'Bangkok, Thailand',
      coordinates: { lat: 13.75, lng: 100.5 },
      phone: '+66 2 000 0000',
      types: ['restaurant'],
    };

    const [merged] = mergeDetectedResearchIntoPlannerPlaces([current], [research], 'THB');
    expect(merged.kind).toBe('other');
    expect(merged.priority).toBe('must');
    expect(merged.tags).toEqual(['manual-tag']);
    expect(merged.notes).toBe('keep this note');
    expect(merged.observed_rating).toBe(4.8);
    expect(merged.observed_review_count).toBe(9876);
    expect(merged.observed_price).toBe('฿300–500');
    expect(merged.price_currency).toBe('THB');
    expect(merged.source_category).toBe('Restaurant');
    expect(merged.address).toBe('Bangkok, Thailand');
    expect(merged.coordinates).toEqual({ lat: 13.75, lng: 100.5 });
    expect(merged.types).toContain('restaurant');
  });
});

describe('enrichCandidatePlacesBatch', () => {
  it('processes multiple candidate places with progress callbacks', async () => {
    const mockHtml = `
      <script type="application/ld+json">
      {
        "@type": "LodgingBusiness",
        "name": "Oakwood Studios Sukhumvit Bangkok",
        "aggregateRating": { "ratingValue": 4.4, "reviewCount": 996 },
        "address": { "streetAddress": "Sukhumvit Soi 36", "addressLocality": "Bangkok" }
      }
      </script>
    `;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://www.google.com/maps/place/Oakwood',
      text: async () => mockHtml,
    } as unknown as Response);

    try {
      const places: PlannerTripPlace[] = [
        {
          schema_version: '0.1',
          type: 'trip_place',
          id: 'p-1',
          trip_id: 't-1',
          title: 'Oakwood Studios Sukhumvit Bangkok',
          source_provider: 'google_maps',
          source_url: 'https://www.google.com/maps/place/Oakwood',
          kind: 'other',
          priority: 'want',
          tags: [],
          signals: [],
          risks: [],
          observed_at: '2026-08-30',
          reservation_status: 'none',
          state: 'candidate',
          created_at: '2026-08-30T00:00:00Z',
          updated_at: '2026-08-30T00:00:00Z',
        },
      ];

      const progressSpy = vi.fn();
      const { enrichedPlaces, totalEnriched } = await enrichCandidatePlacesBatch(places, progressSpy);

      expect(totalEnriched).toBe(1);
      expect(enrichedPlaces[0].observed_rating).toBe(4.4);
      expect(enrichedPlaces[0].observed_review_count).toBe(996);
      expect(enrichedPlaces[0].kind).toBe('other');
      expect(enrichedPlaces[0].types).toContain('lodgingbusiness');
      expect(progressSpy).toHaveBeenCalledWith(1, 1, expect.any(Object));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
