import type { WYQDLanguage } from './i18n';

export const OWNLY_LANGUAGE_STORAGE_KEY = 'ownly_language';

export function normalizeSupportedLanguage(value: unknown): WYQDLanguage | null {
  const language = String(value ?? '').trim().toLowerCase();
  if (language.startsWith('zh')) return 'zh';
  if (language.startsWith('en')) return 'en';
  return null;
}

export function detectPreferredLanguage({
  storedLanguage,
  browserLanguages,
  fallback = 'en',
}: {
  storedLanguage?: unknown;
  browserLanguages?: readonly string[];
  fallback?: WYQDLanguage;
}): WYQDLanguage {
  const stored = normalizeSupportedLanguage(storedLanguage);
  if (stored) return stored;

  for (const candidate of browserLanguages ?? []) {
    const language = normalizeSupportedLanguage(candidate);
    if (language) return language;
  }

  return fallback;
}
