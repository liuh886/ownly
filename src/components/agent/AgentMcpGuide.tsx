'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import { getAgentMcpCopy } from '@/core/agent-mcp-copy';

function CommandBlock({
  label,
  command,
  copyLabel,
  copiedLabel,
  copyKey,
  copiedKey,
  onCopy,
}: {
  label: string;
  command: string;
  copyLabel: string;
  copiedLabel: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-950 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[11px] font-semibold text-stone-300">{label}</span>
        <button
          type="button"
          onClick={() => onCopy(copyKey, command)}
          className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-stone-200 transition hover:bg-white/15 hover:text-white"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-3 text-[11px] leading-5 text-stone-200 sm:text-xs">
        <code>{command}</code>
      </pre>
    </div>
  );
}

export function AgentMcpGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language } = useI18n();
  const copy = getAgentMcpCopy(language);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopiedKey(null);
  }, [open]);

  async function copyCommand(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1600);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-3 py-4 backdrop-blur-sm sm:px-5 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownly-agent-mcp-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-stone-100 bg-gradient-to-br from-stone-50 via-white to-emerald-50/50 px-5 py-5 sm:px-7 sm:py-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {copy.eyebrow}
            </p>
            <h2 id="ownly-agent-mcp-title" className="mt-2 text-xl font-semibold tracking-tight text-stone-950 sm:text-2xl">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{copy.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-stone-950 px-2.5 py-1 text-[11px] font-semibold text-white">
                {copy.scopeBadge}
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                {copy.localBadge}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-4">
              <article className="rounded-xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-stone-950">{copy.whatTitle}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{copy.whatBody}</p>
              </article>

              <article className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-stone-950">{copy.dataTitle}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{copy.dataBody}</p>
                <div className="mt-3 rounded-lg bg-stone-950 px-3 py-2 font-mono text-xs text-stone-200">
                  {copy.dataExample}
                </div>
                <p className="mt-3 text-xs leading-5 text-stone-500">{copy.dataNote}</p>
              </article>

              <article className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-emerald-950">{copy.readOnlyTitle}</h3>
                <p className="mt-2 text-xs leading-5 text-emerald-900/80">{copy.readOnlyBody}</p>
              </article>

              <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-amber-950">{copy.privacyTitle}</h3>
                <p className="mt-2 text-xs leading-5 text-amber-900/80">{copy.privacyBody}</p>
              </article>
            </div>

            <div className="space-y-4">
              <article className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-stone-950">{copy.setupTitle}</h3>
                <p className="mt-2 text-xs leading-5 text-stone-500">{copy.setupIntro}</p>
                <div className="mt-4 space-y-3">
                  <CommandBlock
                    label={copy.buildLabel}
                    command={copy.buildCommand}
                    copyLabel={copy.copyLabel}
                    copiedLabel={copy.copiedLabel}
                    copyKey="build"
                    copiedKey={copiedKey}
                    onCopy={(key, value) => void copyCommand(key, value)}
                  />
                  <CommandBlock
                    label={copy.codexLabel}
                    command={copy.codexCommand}
                    copyLabel={copy.copyLabel}
                    copiedLabel={copy.copiedLabel}
                    copyKey="codex"
                    copiedKey={copiedKey}
                    onCopy={(key, value) => void copyCommand(key, value)}
                  />
                  <p className="px-1 text-[11px] leading-5 text-stone-500">{copy.codexVerify}</p>
                  <CommandBlock
                    label={copy.claudeLabel}
                    command={copy.claudeCommand}
                    copyLabel={copy.copyLabel}
                    copiedLabel={copy.copiedLabel}
                    copyKey="claude"
                    copiedKey={copiedKey}
                    onCopy={(key, value) => void copyCommand(key, value)}
                  />
                  <p className="px-1 text-[11px] leading-5 text-stone-500">{copy.claudeVerify}</p>
                </div>
                <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
                  {copy.placeholderNote}
                </p>
              </article>

              <article className="rounded-xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-stone-950">{copy.promptsTitle}</h3>
                <div className="mt-3 space-y-2">
                  {copy.prompts.map((prompt) => (
                    <div key={prompt} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs leading-5 text-stone-700">
                      {prompt}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-stone-100 bg-stone-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <a
            href="https://github.com/liuh886/ownly/blob/main/docs/MCP.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-950"
          >
            {copy.docsLabel} ↗
          </a>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg bg-stone-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-800"
          >
            {copy.closeLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
