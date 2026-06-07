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
}: {
  children: ReactNode;
  initialLanguage?: WYQDLanguage;
  onLanguageChange?: (lang: WYQDLanguage) => void;
}) {
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
      // eslint-disable-next-line obsidianmd/no-localstorage
      const storedLanguage = normalizeWYQDLanguage(localStorage.getItem('ownly_language'));
      setLanguage(storedLanguage);

      // eslint-disable-next-line obsidianmd/no-localstorage
      const storedCurrency = localStorage.getItem('ownly_currency') as WYQDCurrency | null;
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
          // eslint-disable-next-line obsidianmd/no-localstorage
          localStorage.setItem('ownly_language', lang);
        }
        // Auto-switch currency when language changes (only if user hasn't manually set it)
        // eslint-disable-next-line obsidianmd/no-localstorage
        const stored = localStorage.getItem('ownly_currency');
        if (!stored) {
          setCurrency(defaultCurrency(lang));
        }
      },
      t: translator.t,
      currency,
      setCurrency: (cur: WYQDCurrency) => {
        setCurrency(cur);
        // eslint-disable-next-line obsidianmd/no-localstorage
        localStorage.setItem('ownly_currency', cur);
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
