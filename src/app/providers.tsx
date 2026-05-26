'use client';

import { I18nProvider } from '@/core/i18n-context';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
