import { describe, expect, it } from 'vitest';
import { detectPreferredLanguage, normalizeSupportedLanguage } from './language-preference';

describe('Ownly language preference', () => {
  it('normalizes supported regional language tags', () => {
    expect(normalizeSupportedLanguage('zh-HK')).toBe('zh');
    expect(normalizeSupportedLanguage('en-GB')).toBe('en');
    expect(normalizeSupportedLanguage('fr-FR')).toBeNull();
  });

  it('keeps an explicit stored preference above browser languages', () => {
    expect(detectPreferredLanguage({
      storedLanguage: 'en',
      browserLanguages: ['zh-CN', 'en-US'],
    })).toBe('en');
  });

  it('uses the first supported browser preference for a new user', () => {
    expect(detectPreferredLanguage({
      browserLanguages: ['fr-FR', 'zh-TW', 'en-US'],
    })).toBe('zh');
  });

  it('falls back to English when no supported preference is available', () => {
    expect(detectPreferredLanguage({ browserLanguages: ['fr-FR', 'de-DE'] })).toBe('en');
  });
});
