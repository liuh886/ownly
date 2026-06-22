'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CARD_CLASS } from '@/lib/ui-constants';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(CARD_CLASS, className)}>
      {children}
    </div>
  );
}

export function IconButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function FilterChip({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'bg-stone-950 text-white'
          : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200 hover:text-stone-900',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
