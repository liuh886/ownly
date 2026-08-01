'use client';

import { useEffect } from 'react';
import { useI18n } from '@/core/i18n-context';

export function WebDataOnboarding({
  open,
  isLoading,
  error,
  onCreate,
  onOpen,
  onContinueDemo,
}: {
  open: boolean;
  isLoading: boolean;
  error: string | null;
  onCreate: () => void;
  onOpen: () => void;
  onContinueDemo: () => void;
}) {
  const { language } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onContinueDemo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isLoading, onContinueDemo]);

  if (!open) return null;

  const copy = language === 'zh'
    ? {
        eyebrow: '本地优先 · 无需账户',
        title: '开始使用 Ownly',
        description: '选择创建新的本地数据，或打开已有的 Ownly / Obsidian 数据。所有 Markdown 文件只保存在你的电脑上。',
        createTitle: '创建新的本地数据',
        createDesc: '选择一个保存位置，Ownly 会自动创建完整的数据目录。无需安装 Obsidian。',
        createButton: '选择保存位置',
        openTitle: '打开已有数据',
        openDesc: '选择已有的 Ownly 数据目录，或选择包含 Ownly 文件夹的 Obsidian Vault。',
        openButton: '选择已有目录',
        recommendationTitle: '建议但不强制',
        recommendation: '你可以完全不使用 Obsidian；但建议将 Ownly 数据放在 Obsidian Vault 中，便于直接阅读、搜索和编辑 Markdown，并让 Web、PWA 与 Obsidian 插件共享同一套数据。',
        demo: '暂时使用演示模式',
        loading: '正在连接本地目录…',
      }
    : {
        eyebrow: 'Local-first · No account required',
        title: 'Start using Ownly',
        description: 'Create new local data or open existing Ownly / Obsidian data. Every Markdown file stays on your computer.',
        createTitle: 'Create new local data',
        createDesc: 'Choose where to save it. Ownly creates the complete data structure automatically. Obsidian is not required.',
        createButton: 'Choose save location',
        openTitle: 'Open existing data',
        openDesc: 'Choose an existing Ownly data directory or an Obsidian Vault that contains an Ownly folder.',
        openButton: 'Choose existing folder',
        recommendationTitle: 'Recommended, not required',
        recommendation: 'You can use Ownly without Obsidian. Keeping the Ownly directory inside an Obsidian Vault is still recommended so the Markdown remains easy to read, search, and edit, while Web, PWA, and the Obsidian plugin share one dataset.',
        demo: 'Continue in demo mode',
        loading: 'Connecting local folder…',
      };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownly-onboarding-title"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        <div className="border-b border-stone-100 bg-gradient-to-br from-stone-50 to-emerald-50/40 px-6 py-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{copy.eyebrow}</p>
          <h2 id="ownly-onboarding-title" className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
            {copy.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{copy.description}</p>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <article className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">+</div>
            <h3 className="mt-4 text-base font-semibold text-stone-950">{copy.createTitle}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-600">{copy.createDesc}</p>
            <button
              type="button"
              onClick={onCreate}
              disabled={isLoading}
              className="mt-5 min-h-11 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {isLoading ? copy.loading : copy.createButton}
            </button>
          </article>

          <article className="flex flex-col rounded-xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-bold text-stone-700 ring-1 ring-stone-200">↗</div>
            <h3 className="mt-4 text-base font-semibold text-stone-950">{copy.openTitle}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-600">{copy.openDesc}</p>
            <button
              type="button"
              onClick={onOpen}
              disabled={isLoading}
              className="mt-5 min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
            >
              {isLoading ? copy.loading : copy.openButton}
            </button>
          </article>
        </div>

        <div className="mx-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:mx-8">
          <p className="text-xs font-semibold text-amber-900">{copy.recommendationTitle}</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{copy.recommendation}</p>
        </div>

        {error ? (
          <div role="alert" className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 sm:mx-8">
            {error}
          </div>
        ) : null}

        <div className="flex justify-center px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={onContinueDemo}
            disabled={isLoading}
            className="text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
          >
            {copy.demo}
          </button>
        </div>
      </section>
    </div>
  );
}
