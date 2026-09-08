'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import type { WYQDTranslationKey } from '@/core/i18n';

export type AppTab = 'home' | 'objects' | 'accounts' | 'reviews' | 'planner';

const tabs: Array<
  | { id: Exclude<AppTab, 'planner'>; labelKey: WYQDTranslationKey }
  | { id: 'planner'; labelKey: null }
> = [
  { id: 'home', labelKey: 'tabHome' },
  { id: 'objects', labelKey: 'tabObjects' },
  { id: 'accounts', labelKey: 'tabAccounts' },
  { id: 'reviews', labelKey: 'tabReviews' },
  { id: 'planner', labelKey: null },
];

interface BottomNavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const { t, language } = useI18n();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  // Hide on scroll down, reveal on scroll up (or near the top). The wrapper
  // collapses the in-flow slot so no blank strip is left behind.
  useEffect(() => {
    lastY.current = Math.max(0, window.scrollY);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = Math.max(0, window.scrollY);
        const dy = y - lastY.current;
        lastY.current = y;
        if (y < 64) {
          setHidden(false);
        } else if (dy > 8) {
          setHidden(true);
        } else if (dy < -8) {
          setHidden(false);
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="sticky bottom-0 z-20">
      <div
        className={`grid transition-all duration-300 motion-reduce:transition-none ${hidden ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
        aria-hidden={hidden || undefined}
        inert={hidden || undefined}
      >
        <div className="overflow-hidden">
    <nav className="border-t border-stone-200/70 bg-white/70 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-4px_24px_rgba(28,25,23,0.04)] backdrop-blur-xl">
      <div className="relative mx-auto grid max-w-3xl grid-cols-5 gap-1 rounded-xl bg-stone-50 p-1 ring-1 ring-stone-200">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const label = tab.id === 'planner' ? (language === 'zh' ? '规划' : 'Planner') : t(tab.labelKey);
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
                className={`relative z-10 text-[11px] font-medium tracking-tight transition-colors duration-300 sm:text-xs ${
                  isActive ? 'text-white' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
        </div>
      </div>
    </div>
  );
}
