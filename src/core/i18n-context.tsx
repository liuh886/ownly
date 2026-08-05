'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createWYQDTranslator,
  type WYQDLanguage,
  type WYQDTranslationKey,
} from './i18n';
import {
  detectPreferredLanguage,
  OWNLY_LANGUAGE_STORAGE_KEY,
} from './language-preference';
import { getTerminologyOverride } from './terminology';
import type { WYQDCurrency } from '@/lib/format';

function defaultCurrency(language: WYQDLanguage): WYQDCurrency {
  return language === 'zh' ? 'CNY' : 'USD';
}

function browserLanguagePreferences(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

interface I18nContextValue {
  language: WYQDLanguage;
  setLanguage: (lang: WYQDLanguage) => void;
  t: (key: WYQDTranslationKey) => string;
  currency: WYQDCurrency;
  setCurrency: (currency: WYQDCurrency) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLanguage,
  onLanguageChange,
  storageGet,
  storageSet,
}: {
  children: ReactNode;
  initialLanguage?: WYQDLanguage;
  onLanguageChange?: (lang: WYQDLanguage) => void;
  storageGet?: (key: string) => string | null;
  storageSet?: (key: string, value: string) => void;
}) {
  const get = storageGet ?? ((key: string) => (
    typeof window === 'undefined' ? null : window.localStorage.getItem(key)
  ));
  const set = storageSet ?? ((key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  });

  // Keep the server render and the first browser render identical. Browser and
  // persisted preferences are applied immediately after hydration.
  const [language, setLanguageState] = useState<WYQDLanguage>(initialLanguage ?? 'en');

  const [currency, setCurrency] = useState<WYQDCurrency>(() => {
    const storedCurrency = get('ownly_currency') as WYQDCurrency | null;
    if (storedCurrency && ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW'].includes(storedCurrency)) {
      return storedCurrency;
    }
    return defaultCurrency(initialLanguage ?? 'en');
  });

  useEffect(() => {
    if (initialLanguage) return;
    const preferredLanguage = detectPreferredLanguage({
      storedLanguage: get(OWNLY_LANGUAGE_STORAGE_KEY),
      browserLanguages: browserLanguagePreferences(),
      fallback: 'en',
    });
    setLanguageState((current) => current === preferredLanguage ? current : preferredLanguage);
  }, [initialLanguage]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const htmlLanguage = language === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.lang = htmlLanguage;
    document.documentElement.dataset.ownlyLanguage = language;
    document.title = language === 'zh'
      ? 'Ownly — 本地优先的所有权记忆与决策账本'
      : 'Ownly — Local-first ownership memory';

    const description = language === 'zh'
      ? '在本地 Markdown 中记录物品、订阅、体验与复盘，不上传个人记录。'
      : 'Track possessions, subscriptions, experiences, and reviews in local Markdown without uploading personal records.';
    const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (descriptionMeta) descriptionMeta.content = description;
  }, [language]);

  const value = useMemo(() => {
    const translator = createWYQDTranslator(language);
    return {
      language,
      setLanguage: (lang: WYQDLanguage) => {
        setLanguageState(lang);
        if (onLanguageChange) {
          onLanguageChange(lang);
        } else {
          set(OWNLY_LANGUAGE_STORAGE_KEY, lang);
        }
        const stored = get('ownly_currency');
        if (!stored) {
          setCurrency(defaultCurrency(lang));
        }
      },
      t: (key: WYQDTranslationKey) => {
        // Keep this compatibility override until the legacy translation table is split by locale.
        if (language === 'en' && key === 'deleteConfirm') return 'Delete "{title}"?';
        return getTerminologyOverride(language, key) ?? translator.t(key);
      },
      currency,
      setCurrency: (cur: WYQDCurrency) => {
        setCurrency(cur);
        set('ownly_currency', cur);
      },
    };
  }, [language, currency, onLanguageChange]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
