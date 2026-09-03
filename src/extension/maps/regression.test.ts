import { describe, it, expect } from 'vitest';
import { PlaceIdentityService } from '@/domain/place-identity';
import { buildFromEntityList, createSnapshot, interpretDomBatch, interpretRawDomCard } from './saved-list-parser';

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

describe('PR5 saved-list-parser', () => {
  it('buildFromEntityList maps rawItems to candidates with coverage', () => {
    const rawItems = [
      [null, [null, null, 'Som Som Seafood', null, '659 Chula 4 Alley, Bangkok'], 'Som Som Seafood', 'cash seafood note', null, null, null, null, null],
      [null, [null, null, 'Avalon Beach Resort'], 'Avalon Beach Resort', null, null, null, null, null, null],
      [null, null, '', 'junk', null],
    ];
    // Inject a fake feature id into first item's deep array so findEntityListPlaceId can find it
    (rawItems[0] as unknown[])[1] = [null, null, 'Som Som Seafood', null, 'addr', [null, null, '0x30e29911d7719da9:0x13f543e2fb3fff']];
    const result = buildFromEntityList({
      listName: 'TH26',
      listUrl: 'https://www.google.com/maps/@16.39,97.25,7z/data=!4m6!1m2!10m1!1e1',
      rawItems,
      origin: 'https://www.google.com',
    });
    expect(result.rawCount).toBe(3);
    expect(result.places.length).toBe(2);
    expect(result.coverage.title).toBe(2);
    expect(result.coverage.url).toBe(2);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].reason).toBe('no title');
  });

  it('interpretRawDomCard filters fake label and computes coverage', () => {
    const fake = interpretRawDomCard({ rawTitle: 'Compare prices', href: 'https://www.google.com/maps/search/?api=1&query=Compare%20prices', infoTexts: [] });
    expect(fake.candidate).toBeUndefined();
    expect(fake.failedReason).toMatch(/fake/);

    const ok = interpretRawDomCard({
      rawTitle: 'Baan Kuay Tiew Ruathong',
      href: 'https://www.google.com/maps/search/?api=1&query=Baan%20Kuay%20Tiew%20Ruathong',
      infoTexts: ['Thai restaurant · 1.2km'],
      addressRaw: '1/7 Ratchawithi Rd, Bangkok',
    });
    expect(ok.candidate?.title).toBe('Baan Kuay Tiew Ruathong');
    expect(ok.candidate?.url).toContain('Baan');
  });

  it('interpretDomBatch dedupes and reports coverage title/url/id', () => {
    const batch = interpretDomBatch([
      { rawTitle: 'Sora Resort & Suites Sukhumvit', href: 'https://www.google.com/maps/search/?api=1&query=Sora%20Resort', infoTexts: ['Hotel · 4.5 (120)'] },
      { rawTitle: 'Sora Resort & Suites Sukhumvit', href: 'https://www.google.com/maps/search/?api=1&query=Sora%20Resort', infoTexts: ['Hotel · 4.5 (120)'] },
      { rawTitle: '', href: '', infoTexts: [] },
    ]);
    expect(batch.rawCount).toBe(3);
    expect(batch.places.length).toBe(1);
    expect(batch.coverage.title).toBe(1);
    expect(batch.failed[0].reason).toBe('no title');
    const snap = createSnapshot({ url: 'https://www.google.com/maps/@16.3,97.2', parser: 'dom-scan', result: batch, durationMs: 12 });
    expect(snap.found).toBe(3);
    expect(snap.success).toBe(1);
    expect(snap.coverage.title).toBe(1);
  });
});
