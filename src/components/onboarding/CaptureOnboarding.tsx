'use client';

import { useEffect } from 'react';
import { useI18n } from '@/core/i18n-context';

const STORAGE_KEY = 'ownly:capture-onboarding:dismissed';

export function shouldShowCaptureOnboarding(isEmpty: boolean): boolean {
  if (!isEmpty) return false;
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== '1';
}

export function dismissCaptureOnboarding(): void {
  localStorage.setItem(STORAGE_KEY, '1');
}

export function CaptureOnboarding({
  open,
  onDismiss,
  onStart,
}: {
  open: boolean;
  onDismiss: () => void;
  onStart: () => void;
}) {
  const { language } = useI18n();
  const zh = language === 'zh';

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onDismiss]);

  if (!open) return null;

  const steps = zh ? [
    { icon: '📍', title: '① Capture 收集', desc: '在 Google Maps 看到心动地点，点扩展一键收集', ex: '例：Suvarnabhumi Airport · 一键入合集' },
    { icon: '📦', title: '② Collection 整理', desc: '在合集中筛选、补标签、去重', ex: '例：我的曼谷美食 Top 8' },
    { icon: '🗓️', title: '③ Planner 规划', desc: '导出 Portable JSON → 导入行程 → 排期上图', ex: '例：ownly.capture.collection v1 → 10/05 行程' },
  ] : [
    { icon: '📍', title: '① Capture', desc: 'Save spots from Google Maps with one click', ex: 'e.g. Suvarnabhumi Airport' },
    { icon: '📦', title: '② Collection', desc: 'Curate, tag, dedupe in your collection', ex: 'e.g. My Bangkok Eats Top 8' },
    { icon: '🗓️', title: '③ Planner', desc: 'Export Portable JSON → import to trip → schedule', ex: 'e.g. ownly.capture.collection v1 → Oct 05' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" className="w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="border-b border-stone-100 bg-gradient-to-br from-stone-50 to-emerald-50/40 px-6 py-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {zh ? '30 秒了解 Ownly' : 'Ownly in 30 seconds'}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
            {zh ? '收集 → 整理 → 规划' : 'Capture → Curate → Plan'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {zh ? 'Capture 收集灵感，Collection 整理合集，Planner 排期成行。唯一契约是 Portable Collection JSON。' : 'Capture gathers, Collection curates, Planner schedules. The only contract is Portable Collection JSON.'}
          </p>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8">
          {steps.map((s) => (
            <div key={s.title} className="flex min-h-44 flex-col rounded-xl border border-stone-200 bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-lg">{s.icon}</span>
              <span className="mt-4 text-sm font-semibold text-stone-950">{s.title}</span>
              <span className="mt-2 text-xs leading-5 text-stone-600">{s.desc}</span>
              <span className="mt-auto pt-4 text-[11px] text-stone-400">{s.ex}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-6 py-5 sm:px-8">
          <button type="button" onClick={onDismiss} className="text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-900">
            {zh ? '稍后再说' : 'Maybe later'}
          </button>
          <button type="button" onClick={onStart} className="rounded-lg bg-stone-950 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800">
            {zh ? '开始收集' : 'Start capturing'}
          </button>
        </div>
      </section>
    </div>
  );
}
