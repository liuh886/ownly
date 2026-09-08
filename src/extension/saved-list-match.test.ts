import { describe, expect, it } from 'vitest';
import { extractGoogleMapsSavedListId, matchesSavedListContext, normalizeSavedListName } from './saved-list-match';

describe('saved-list matching', () => {
  it('matches an exact trip tag regardless of case and count decoration', () => {
    expect(matchesSavedListContext('TH26 (37 places)', { title: 'Thailand 2026', tags: ['TH26'] })).toBe(true);
    expect(matchesSavedListContext('th26', { title: 'Thailand 2026', tags: ['TH26'] })).toBe(true);
  });

  it('does not let short unrelated fragments match by containment', () => {
    expect(matchesSavedListContext('TH', { title: 'Thailand 2026', tags: ['TH26'] })).toBe(false);
  });

  it('normalizes common Google Maps list decorations', () => {
    expect(normalizeSavedListName('📁 TH26 · 18 个地点')).toBe('th26');
  });
});

describe('Google Maps saved-list ids', () => {
  it('extracts current and legacy list URL carriers without assuming a 20-character id', () => {
    expect(extractGoogleMapsSavedListId('https://www.google.com/maps/placelists/list/AbCdEf_12345')).toBe('AbCdEf_12345');
    expect(extractGoogleMapsSavedListId('https://www.google.com/maps/@13,100/data=!4m2!2sAbCdEf_12345!3e3')).toBe('AbCdEf_12345');
    expect(extractGoogleMapsSavedListId('https://www.google.com/maps?list=AbCdEf_12345')).toBe('AbCdEf_12345');
  });

  it('refuses place feature ids: `!1s0xAAA:0xBBB` is D-step identity, never a list', () => {
    // Thai grill detail page from the field report.
    expect(
      extractGoogleMapsSavedListId(
        'https://www.google.com/maps/place/abc/@18.790648,98.9531665,15z/data=!4m6!3m5!1s0x30da3bb2c4fe6299:0xb0cfed329b0c1809!8m2!3d18.7905113!4d98.9560481!16s%2Fg%2F11p0h57p13?entry=ttu',
      ),
    ).toBeUndefined();
    // Account-menu continuation URLs carry the same place payload.
    expect(
      extractGoogleMapsSavedListId(
        'https://accounts.google.com/SignOutOptions?hl=en&continue=https://www.google.com/maps/place/abc/@18.79,98.95,15z/data%3D!4m6!3m5!1s0x30da3bb2c4fe6299:0xb0cfed329b0c1809!8m2!3d18.79!4d98.95',
      ),
    ).toBeUndefined();
    // ChIJ place references are identity too.
    expect(
      extractGoogleMapsSavedListId('https://www.google.com/maps/place/abc/data=!4m2!3m1!1sChIJ7RXqV8qXAjERC0UAiiFLG3s'),
    ).toBeUndefined();
  });
});
