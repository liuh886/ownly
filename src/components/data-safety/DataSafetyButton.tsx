'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type { RestorePlan } from '@/core/data-portability';
import {
  browserDataPortabilityService,
  type BrowserBackupInspection,
  type BrowserMigrationInspection,
} from '@/services/BrowserDataPortabilityService';

const COPY = {
  en: {
    button: 'Data safety',
    title: 'Backup, restore, and migrate',
    description: 'Ownly uses a readable JSON backup with a versioned manifest and SHA-256 for every local file.',
    export: 'Export backup',
    choose: 'Choose backup file',
    checkMigration: 'Check migration',
    close: 'Close',
    busy: 'Working…',
    valid: 'Backup validated',
    invalid: 'Backup could not be used',
    plan: 'Restore preflight',
    creates: 'New files',
    identical: 'Identical',
    conflicts: 'Conflicts',
    restore: 'Restore backup',
    overwrite: 'Download safety backup and overwrite',
    overwriteConfirm: 'Conflicting local files will be replaced after a safety backup is downloaded. Continue?',
    restored: 'Restore completed and verified.',
    exported: 'Backup downloaded.',
    current: 'Dataset is already on the current schema version.',
    migrationReady: 'A versioned migration is available.',
    applyMigration: 'Download pre-migration backup and migrate',
    migrationConfirm: 'Ownly will download a complete pre-migration backup before applying the migration. Continue?',
    migrated: 'Migration completed and verified.',
    localOnly: 'All operations stay on this device. No backup is uploaded.',
  },
  zh: {
    button: '数据安全',
    title: '备份、恢复与迁移',
    description: 'Ownly 使用可读 JSON 备份包，包含版本化 manifest，并为每个本地文件记录 SHA-256。',
    export: '导出备份',
    choose: '选择备份文件',
    checkMigration: '检查数据迁移',
    close: '关闭',
    busy: '正在处理…',
    valid: '备份校验通过',
    invalid: '该备份无法使用',
    plan: '恢复预检',
    creates: '新增文件',
    identical: '相同文件',
    conflicts: '冲突文件',
    restore: '恢复备份',
    overwrite: '下载安全备份并覆盖',
    overwriteConfirm: '冲突的本地文件将在安全备份下载后被替换。是否继续？',
    restored: '恢复已完成并通过校验。',
    exported: '备份已下载。',
    current: '当前数据已是最新 schema 版本。',
    migrationReady: '检测到可执行的版本化迁移。',
    applyMigration: '下载迁移前备份并执行迁移',
    migrationConfirm: 'Ownly 会先下载完整的迁移前备份，再执行迁移。是否继续？',
    migrated: '迁移已完成并通过校验。',
    localOnly: '所有操作均在本机完成，不会上传备份。',
  },
} as const;

function PlanSummary({ plan, copy }: { plan: RestorePlan; copy: typeof COPY.en | typeof COPY.zh }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="text-xs font-semibold text-stone-900">{copy.plan}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white px-2 py-3 ring-1 ring-stone-200">
          <div className="text-lg font-semibold text-stone-950">{plan.creates}</div>
          <div className="text-[10px] text-stone-500">{copy.creates}</div>
        </div>
        <div className="rounded-lg bg-white px-2 py-3 ring-1 ring-stone-200">
          <div className="text-lg font-semibold text-emerald-700">{plan.identical}</div>
          <div className="text-[10px] text-stone-500">{copy.identical}</div>
        </div>
        <div className="rounded-lg bg-white px-2 py-3 ring-1 ring-stone-200">
          <div className={`text-lg font-semibold ${plan.conflicts ? 'text-amber-700' : 'text-stone-950'}`}>{plan.conflicts}</div>
          <div className="text-[10px] text-stone-500">{copy.conflicts}</div>
        </div>
      </div>
    </div>
  );
}

export function DataSafetyButton({ disabled }: { disabled: boolean }) {
  const { language } = useI18n();
  const copy = COPY[language];
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [inspection, setInspection] = useState<BrowserBackupInspection | null>(null);
  const [migration, setMigration] = useState<BrowserMigrationInspection | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (event) {
      setError(event instanceof Error ? event.message : String(event));
    } finally {
      setBusy(false);
    }
  }

  function notifyDataChanged() {
    window.dispatchEvent(new CustomEvent('ownly:data-changed'));
  }

  async function exportBackup() {
    await run(async () => {
      const bundle = await browserDataPortabilityService.exportBackup();
      setStatus(`${copy.exported} ${bundle.files.length} files.`);
    });
  }

  async function selectBackup(file: File) {
    await run(async () => {
      const bundle = await browserDataPortabilityService.readBackupFile(file);
      const nextInspection = await browserDataPortabilityService.inspectRestore(bundle);
      setInspection(nextInspection);
      setMigration(null);
      setStatus(copy.valid);
    });
  }

  async function restore(overwrite: boolean) {
    if (!inspection) return;
    if (overwrite && !window.confirm(copy.overwriteConfirm)) return;
    await run(async () => {
      await browserDataPortabilityService.restore(inspection.bundle, overwrite);
      setStatus(copy.restored);
      setInspection(null);
      notifyDataChanged();
    });
  }

  async function inspectMigration() {
    await run(async () => {
      const next = await browserDataPortabilityService.inspectMigration();
      setMigration(next);
      setInspection(null);
      setStatus(next.migration.applied_steps.length ? copy.migrationReady : copy.current);
    });
  }

  async function applyMigration() {
    if (!migration || !window.confirm(copy.migrationConfirm)) return;
    await run(async () => {
      await browserDataPortabilityService.applyMigration(migration);
      setMigration(null);
      setStatus(copy.migrated);
      notifyDataChanged();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-200 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {copy.button}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-stone-950">{copy.title}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">{copy.description}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone-400 hover:text-stone-900">×</button>
            </div>

            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{copy.localOnly}</p>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button type="button" disabled={busy} onClick={() => void exportBackup()} className="min-h-11 rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:bg-stone-300">
                {busy ? copy.busy : copy.export}
              </button>
              <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:border-stone-900 disabled:text-stone-300">
                {copy.choose}
              </button>
              <button type="button" disabled={busy} onClick={() => void inspectMigration()} className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:border-stone-900 disabled:text-stone-300">
                {copy.checkMigration}
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void selectBackup(file);
              }}
            />

            {inspection ? (
              <div className="mt-5 space-y-3">
                <PlanSummary plan={inspection.plan} copy={copy} />
                {inspection.plan.conflicts === 0 ? (
                  <button type="button" disabled={busy} onClick={() => void restore(false)} className="w-full min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-stone-300">
                    {copy.restore}
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void restore(true)} className="w-full min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:bg-stone-300">
                    {copy.overwrite}
                  </button>
                )}
              </div>
            ) : null}

            {migration?.migration.applied_steps.length ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-semibold text-amber-900">{copy.migrationReady}</div>
                <div className="mt-1 text-xs text-amber-800">
                  {migration.migration.from_version} → {migration.migration.to_version} · {migration.migration.changes.length} changes
                </div>
                <button type="button" disabled={busy} onClick={() => void applyMigration()} className="mt-3 w-full min-h-10 rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:bg-stone-300">
                  {copy.applyMigration}
                </button>
              </div>
            ) : null}

            {status ? <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{status}</div> : null}
            {error ? <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{copy.invalid}: {error}</div> : null}

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-xs font-medium text-stone-500 hover:text-stone-900">{copy.close}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
