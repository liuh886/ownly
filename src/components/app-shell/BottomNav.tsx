'use client';

import { motion } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';

export type AppTab = 'home' | 'objects' | 'accounts' | 'reviews';

const tabs: { id: AppTab; labelKey: WYQDTranslationKey }[] = [
  { id: 'home', labelKey: 'tabHome' },
  { id: 'objects', labelKey: 'tabObjects' },
  { id: 'accounts', labelKey: 'tabAccounts' },
  { id: 'reviews', labelKey: 'tabReviews' },
];

interface BottomNavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const { t } = useI18n();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/90 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-4px_24px_rgba(28,25,23,0.04)] backdrop-blur-xl">
      <div className="relative mx-auto grid max-w-3xl grid-cols-4 gap-1 rounded-xl bg-stone-50 p-1 ring-1 ring-stone-200">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex h-10 items-center justify-center rounded-lg transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 z-0 rounded-lg bg-stone-950 shadow-sm"
                  transition={{ type: 'spring' as const, bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span
                className={`relative z-10 text-xs font-medium tracking-tight transition-colors duration-300 ${
                  isActive ? 'text-white' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {t(tab.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
