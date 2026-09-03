'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';

type StorageIntent = 'local' | 'cloud';

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
  const copy = getOwnlyLocalDataCopy(language);
  const [storageIntent, setStorageIntent] = useState<StorageIntent>('local');

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onContinueDemo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isLoading, onContinueDemo]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-4 backdrop-blur-sm sm:py-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownly-onboarding-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl sm:max-h-[calc(100vh-4rem)]"
      >
        <div className="border-b border-stone-100 bg-gradient-to-br from-stone-50 to-emerald-50/40 px-6 py-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {copy.onboarding.eyebrow}
          </p>
          <h2 id="ownly-onboarding-title" className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
            {copy.onboarding.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {copy.onboarding.description}
          </p>
          <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-stone-700 ring-1 ring-emerald-200">
            {language === 'zh' ? 'Ownly 不上传你的数据，你的数据保存在你选择的文件夹中。' : 'Ownly never uploads your data — it stays in the folder you choose.'}
          </div>
        </div>

        <div className="px-6 pt-6 sm:px-8 sm:pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {copy.onboarding.storageQuestion}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={copy.onboarding.storageQuestion}>
            {([
              ['local', copy.onboarding.localTitle, copy.onboarding.localDescription, '⌂'],
              ['cloud', copy.onboarding.cloudTitle, copy.onboarding.cloudDescription, '☁'],
            ] as const).map(([value, title, description, icon]) => {
              const selected = storageIntent === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStorageIntent(value)}
                  disabled={isLoading}
                  className={`min-h-32 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200'
                      : 'border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-base ${selected ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>
                      {icon}
                    </span>
                    {selected ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                        {copy.onboarding.selected}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-stone-950">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-stone-600">{description}</p>
                </button>
              );
            })}
          </div>

          {storageIntent === 'cloud' ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900">
              <p>{copy.onboarding.cloudNote}</p>
              <p className="mt-1 font-semibold">{copy.onboarding.cloudRule}</p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <article className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">+</div>
            <h3 className="mt-4 text-base font-semibold text-stone-950">{copy.onboarding.createTitle}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-600">
              {copy.onboarding.createDescription}
            </p>
            <button
              type="button"
              onClick={onCreate}
              disabled={isLoading}
              className="mt-5 min-h-11 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {isLoading ? copy.connecting : copy.onboarding.createButton}
            </button>
          </article>

          <article className="flex flex-col rounded-xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-bold text-stone-700 ring-1 ring-stone-200">↗</div>
            <h3 className="mt-4 text-base font-semibold text-stone-950">{copy.onboarding.openTitle}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-600">
              {copy.onboarding.openDescription}
            </p>
            <button
              type="button"
              onClick={onOpen}
              disabled={isLoading}
              className="mt-5 min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
            >
              {isLoading ? copy.connecting : copy.onboarding.openButton}
            </button>
          </article>
        </div>

        <div className="mx-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:mx-8">
          <p className="text-xs font-semibold text-amber-900">{copy.onboarding.recommendationTitle}</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{copy.onboarding.recommendation}</p>
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
            {copy.onboarding.demo}
          </button>
        </div>
      </section>
    </div>
  );
}
