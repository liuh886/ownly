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
});
