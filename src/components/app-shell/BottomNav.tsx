'use client';

import { motion } from 'framer-motion';

export type AppTab = 'home' | 'objects' | 'accounts' | 'reviews';

const tabs: { id: AppTab; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'objects', label: '物欲' },
  { id: 'accounts', label: '账户' },
  { id: 'reviews', label: '复盘' },
];

interface BottomNavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/90 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-8px_32px_rgba(28,25,23,0.05)] backdrop-blur-xl">
      <div className="relative mx-auto grid max-w-3xl grid-cols-4 gap-1 rounded-xl bg-stone-50 p-1 ring-1 ring-stone-200">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className="relative flex h-10 items-center justify-center rounded-lg transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 z-0 rounded-lg bg-stone-950 shadow-sm"
                  transition={{ type: 'spring' as const, bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span
                className={`relative z-10 text-xs font-medium tracking-tight transition-colors duration-300 ${
                  isActive ? 'text-white' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
