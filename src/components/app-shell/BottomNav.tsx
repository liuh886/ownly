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
  const [focused, setFocused] = useState(false);
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

  // Never hide (or inert) while keyboard focus is inside the nav — otherwise
  // keyboard users scrolling with PageDown/Space would lock themselves out of
  // the only tab-switching entry point (WCAG 2.1.1).
  const effectivelyHidden = hidden && !focused;

  return (
    <div className="sticky bottom-0 z-20">
      <div
        onFocus={() => {
          setFocused(true);
          setHidden(false);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocused(false);
          }
        }}
        className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none focus-within:grid-rows-[1fr] focus-within:opacity-100 ${effectivelyHidden ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
        aria-hidden={effectivelyHidden || undefined}
        inert={effectivelyHidden || undefined}
      >
        <div className="overflow-hidden">
    <nav className="ownly-bottom-nav border-t px-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-4px_24px_rgba(28,25,23,0.04)] backdrop-blur-xl min-[400px]:px-4">
      <div className="relative mx-auto grid max-w-3xl grid-cols-5 gap-0.5 rounded-xl bg-surface-subtle p-1 ring-1 ring-line min-[400px]:gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const label = tab.id === 'planner' ? (language === 'zh' ? '规划' : 'Planner') : t(tab.labelKey);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex min-h-11 touch-manipulation items-center justify-center rounded-lg transition-colors duration-150 active:scale-[0.97]"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 z-0 rounded-lg bg-primary shadow-sm"
                  transition={{ type: 'tween' as const, duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                />
              )}
              <span
                className={`relative z-10 text-[11px] font-medium tracking-tight transition-colors duration-300 sm:text-xs ${
                  isActive ? 'text-on-primary' : 'text-ink-muted hover:text-ink-secondary'
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
