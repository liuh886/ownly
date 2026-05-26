'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  createWYQDTranslator,
  normalizeWYQDLanguage,
  type WYQDLanguage,
  type WYQDTranslationKey,
} from './i18n';

interface I18nContextValue {
  language: WYQDLanguage;
  setLanguage: (lang: WYQDLanguage) => void;
  t: (key: WYQDTranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<WYQDLanguage>(() => {
    if (typeof window === 'undefined') return 'zh';
    const stored = localStorage.getItem('ownly_language');
    return normalizeWYQDLanguage(stored);
  });

  const value = useMemo(() => {
    const translator = createWYQDTranslator(language);
    return {
      language,
      setLanguage: (lang: WYQDLanguage) => {
        setLanguage(lang);
        localStorage.setItem('ownly_language', lang);
      },
      t: translator.t,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
