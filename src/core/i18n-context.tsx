'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createWYQDTranslator,
  normalizeWYQDLanguage,
  type WYQDLanguage,
  type WYQDTranslationKey,
} from './i18n';
import type { WYQDCurrency } from '@/lib/format';

function defaultCurrency(language: WYQDLanguage): WYQDCurrency {
  return language === 'zh' ? 'CNY' : 'USD';
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
  const get = storageGet ?? ((key: string) => window.localStorage.getItem(key));
  const set = storageSet ?? ((key: string, value: string) => { window.localStorage.setItem(key, value); });

  const [language, setLanguage] = useState<WYQDLanguage>(() => {
    if (initialLanguage) return initialLanguage;
    return 'zh';
  });

  const [currency, setCurrency] = useState<WYQDCurrency>(() => {
    return defaultCurrency(language);
  });

  useEffect(() => {
    if (initialLanguage) return;

    const timer = window.setTimeout(() => {
      const storedLanguage = normalizeWYQDLanguage(get('ownly_language'));
      setLanguage(storedLanguage);

      const storedCurrency = get('ownly_currency') as WYQDCurrency | null;
      if (storedCurrency && ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW'].includes(storedCurrency)) {
        setCurrency(storedCurrency);
      } else {
        setCurrency(defaultCurrency(storedLanguage));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialLanguage]);

  const value = useMemo(() => {
    const translator = createWYQDTranslator(language);
    return {
      language,
      setLanguage: (lang: WYQDLanguage) => {
        setLanguage(lang);
        if (onLanguageChange) {
          onLanguageChange(lang);
        } else {
          set('ownly_language', lang);
        }
        const stored = get('ownly_currency');
        if (!stored) {
          setCurrency(defaultCurrency(lang));
        }
      },
      t: translator.t,
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
